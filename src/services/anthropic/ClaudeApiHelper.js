// src/services/anthropic/ClaudeApiHelper.js
const Anthropic = require('@anthropic-ai/sdk');
const { logInfo, logError, logDebug, logWarn } = require('../../utils/logger');
const { ErrorFactory } = require('../../utils/errors');
const AnthropicConfig = require('./AnthropicConfig');

/**
 * Helper para comunicación con la API de Claude
 */
class ClaudeApiHelper {

    /**
     * Instancia del cliente Anthropic
     */
    static client = null;

    /**
     * Inicializar cliente de Anthropic
     */
    static initializeClient() {
        if (!this.client) {
            logInfo('🤖 Inicializando cliente Claude API');

            this.client = new Anthropic({
                apiKey: AnthropicConfig.claude.apiKey,
                timeout: AnthropicConfig.claude.timeout,
                maxRetries: AnthropicConfig.claude.retries
            });

            logInfo('✅ Cliente Claude inicializado correctamente');
        }

        return this.client;
    }

    /**
     * Validar configuración de API
     */
    static validateConfiguration() {
        const config = AnthropicConfig.claude;

        if (!config.apiKey) {
            throw ErrorFactory.internal('API Key de Anthropic no configurada');
        }

        if (config.apiKey === 'your-api-key-here' || config.apiKey.length < 20) {
            throw ErrorFactory.internal('API Key de Anthropic inválida');
        }

        if (!config.model) {
            throw ErrorFactory.internal('Modelo de Claude no especificado');
        }

        logDebug('✅ Configuración de Claude validada');
        return true;
    }

    /**
     * Realizar análisis con Claude
     */
    static async analyzeWithClaude(inputData, analysisType = 'financial') {
        try {
            logInfo('🧠 Iniciando análisis con Claude', { 
                analysisType, 
                inputSize: JSON.stringify(inputData).length 
            });

            // Validar configuración
            this.validateConfiguration();

            // Inicializar cliente
            const client = this.initializeClient();

            // Preparar prompt según tipo de análisis
            const prompt = this.buildPrompt(inputData, analysisType);

            // Realizar llamada a Claude
            const startTime = Date.now();
            const response = await this.callClaudeAPI(client, prompt);
            const endTime = Date.now();

            logInfo('✅ Análisis Claude completado', {
                analysisType,
                duration: `${endTime - startTime}ms`,
                responseLength: response.length
            });

            // Procesar y validar respuesta
            const processedResponse = this.processClaudeResponse(response, analysisType);

            return {
                success: true,
                analysis: processedResponse,
                metadata: {
                    model: AnthropicConfig.claude.model,
                    analysisType,
                    processingTime: endTime - startTime,
                    timestamp: new Date().toISOString()
                }
            };

        } catch (error) {
            logError('❌ Error en análisis con Claude', {
                analysisType,
                error: error.message,
                stack: error.stack?.split('\n')[0]
            });

            return this.handleClaudeError(error, analysisType);
        }
    }

    /**
     * Construir prompt optimizado para Claude
     */
    static buildPrompt(inputData, analysisType) {
        const config = AnthropicConfig.claudePrompts;
        
        switch (analysisType) {
            case 'financial':
                return config.analysisPrompt.replace('{input_data}', JSON.stringify(inputData, null, 2));
            
            case 'location':
                return config.locationPrompt.replace('{location_data}', JSON.stringify(inputData, null, 2));
            
            case 'risk':
                return config.riskPrompt.replace('{risk_data}', JSON.stringify(inputData, null, 2));
            
            default:
                return config.analysisPrompt.replace('{input_data}', JSON.stringify(inputData, null, 2));
        }
    }

    /**
     * Realizar llamada a la API de Claude con manejo de errores
     */
    static async callClaudeAPI(client, prompt) {
        const config = AnthropicConfig.claude;
        
        logDebug('📤 Enviando solicitud a Claude API', {
            model: config.model,
            maxTokens: config.maxTokens,
            temperature: config.temperature,
            promptLength: prompt.length
        });

        try {
            const message = await client.messages.create({
                model: config.model,
                max_tokens: config.maxTokens,
                temperature: config.temperature,
                system: AnthropicConfig.claudePrompts.systemPrompt,
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ]
            });

            // Extraer contenido de la respuesta
            const content = message.content[0]?.text || '';
            
            if (!content) {
                throw new Error('Respuesta vacía de Claude API');
            }

            logDebug('📥 Respuesta recibida de Claude API', {
                contentLength: content.length,
                inputTokens: message.usage?.input_tokens || 0,
                outputTokens: message.usage?.output_tokens || 0
            });

            return content;

        } catch (error) {
            // Manejar errores específicos de la API
            if (error.status) {
                const errorMessage = AnthropicConfig.errorHandling.claudeApiErrors[error.status] || error.message;
                throw ErrorFactory.internal(`Claude API Error ${error.status}: ${errorMessage}`, error);
            }

            throw ErrorFactory.internal('Error comunicándose con Claude API', error);
        }
    }

    /**
     * Procesar respuesta de Claude
     */
    static processClaudeResponse(response, analysisType) {
        try {
            logDebug('🔄 Procesando respuesta de Claude', { analysisType });

            // Limpiar respuesta (remover markdown, comentarios, etc.)
            let cleanedResponse = response.trim();
            
            // Remover bloques de código markdown si los hay
            cleanedResponse = cleanedResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '');
            
            // Intentar parsear JSON
            let parsedResponse;
            try {
                parsedResponse = JSON.parse(cleanedResponse);
            } catch (parseError) {
                logWarn('⚠️ Respuesta no es JSON válido, intentando extraer JSON', {
                    response: cleanedResponse.substring(0, 200) + '...'
                });

                // Intentar extraer JSON de la respuesta
                const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    parsedResponse = JSON.parse(jsonMatch[0]);
                } else {
                    throw new Error('No se pudo extraer JSON válido de la respuesta');
                }
            }

            // Validar estructura según tipo de análisis
            this.validateResponseStructure(parsedResponse, analysisType);

            logInfo('✅ Respuesta de Claude procesada correctamente', { analysisType });
            return parsedResponse;

        } catch (error) {
            logError('❌ Error procesando respuesta de Claude', {
                error: error.message,
                analysisType,
                responsePreview: response.substring(0, 100) + '...'
            });

            // Retornar análisis de fallback
            return this.generateFallbackAnalysis(analysisType);
        }
    }

    /**
     * Validar estructura de respuesta
     */
    static validateResponseStructure(response, analysisType) {
        const requiredFields = {
            financial: ['executiveSummary', 'financialMetrics', 'locationAnalysis', 'riskAssessment'],
            location: ['overallScore', 'securityScore', 'accessibilityScore'],
            risk: ['overall', 'factors']
        };

        const required = requiredFields[analysisType] || requiredFields.financial;

        for (const field of required) {
            if (!response[field]) {
                logWarn(`⚠️ Campo requerido '${field}' faltante en respuesta`, { analysisType });
            }
        }
    }

    /**
     * Generar análisis de fallback cuando Claude falla
     */
    static generateFallbackAnalysis(analysisType) {
        logInfo('🔄 Generando análisis de fallback', { analysisType });

        const fallbackAnalysis = {
            financial: {
                executiveSummary: {
                    recommendation: "EVALUAR",
                    confidence: "Media",
                    keyPoints: [
                        "Análisis generado con datos limitados",
                        "Se recomienda validación adicional",
                        "Considerar factores de mercado actuales"
                    ]
                },
                financialMetrics: {
                    yieldBruto: 6.5,
                    yieldNeto: 5.2,
                    capRate: 5.2,
                    roi: 8.5,
                    paybackPeriod: 12,
                    flujoCajaMensual: 50000
                },
                locationAnalysis: {
                    overallScore: 7.0,
                    securityScore: 7.0,
                    accessibilityScore: 7.0,
                    servicesScore: 7.0,
                    growthPotential: "Medio"
                },
                riskAssessment: {
                    overall: "Medio",
                    factors: {
                        market: "Medio",
                        location: "Medio",
                        financial: "Medio",
                        liquidity: "Medio"
                    },
                    riskDescription: "Análisis de riesgo generado con información limitada"
                },
                marketComparison: {
                    priceComparison: "Competitivo",
                    marketPosition: "Medio",
                    trendAnalysis: "Análisis de tendencias no disponible"
                },
                recommendations: {
                    mainRecommendation: "Realizar análisis detallado adicional antes de proceder",
                    actionItems: [
                        "Validar datos de mercado actuales",
                        "Consultar con experto local",
                        "Revisar documentación legal"
                    ],
                    considerations: [
                        "Análisis generado con datos limitados",
                        "Verificar información antes de tomar decisiones"
                    ]
                },
                _fallback: true,
                _reason: "Claude API no disponible o error en procesamiento"
            }
        };

        return fallbackAnalysis[analysisType] || fallbackAnalysis.financial;
    }

    /**
     * Manejar errores específicos de Claude
     */
    static handleClaudeError(error, analysisType) {
        const errorInfo = {
            success: false,
            analysis: this.generateFallbackAnalysis(analysisType),
            error: {
                type: error.name || 'ClaudeAPIError',
                message: error.message,
                code: error.status || 'UNKNOWN',
                timestamp: new Date().toISOString()
            },
            metadata: {
                fallbackUsed: true,
                analysisType,
                errorHandled: true
            }
        };

        // Determinar si el error es recuperable
        if (error.status === 429) {
            errorInfo.error.recoverable = true;
            errorInfo.error.retryAfter = '60 segundos';
        } else if ([500, 502, 503, 504].includes(error.status)) {
            errorInfo.error.recoverable = true;
            errorInfo.error.retryAfter = '5 minutos';
        } else {
            errorInfo.error.recoverable = false;
        }

        logError('🚨 Error manejado en Claude API', errorInfo.error);
        return errorInfo;
    }

    /**
     * Test de conectividad con Claude API
     */
    static async testConnection() {
        try {
            logInfo('🧪 Probando conexión con Claude API');

            this.validateConfiguration();
            const client = this.initializeClient();

            const testMessage = await client.messages.create({
                model: AnthropicConfig.claude.model,
                max_tokens: 100,
                messages: [
                    {
                        role: 'user',
                        content: 'Responde con "OK" si recibes este mensaje.'
                    }
                ]
            });

            const response = testMessage.content[0]?.text || '';
            
            if (response.toLowerCase().includes('ok')) {
                logInfo('✅ Conexión con Claude API exitosa');
                return { success: true, message: 'Conexión establecida' };
            } else {
                throw new Error('Respuesta inesperada de Claude');
            }

        } catch (error) {
            logError('❌ Test de conexión Claude falló', { error: error.message });
            return { 
                success: false, 
                error: error.message,
                code: error.status || 'CONNECTION_FAILED'
            };
        }
    }
}

module.exports = ClaudeApiHelper;