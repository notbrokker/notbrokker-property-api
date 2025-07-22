// src/services/anthropic/ClaudeApiHelper.js
const Anthropic = require('@anthropic-ai/sdk');
const { logInfo, logError, logDebug, logWarn } = require('../../utils/logger');
const { ErrorFactory } = require('../../utils/errors');
const AnthropicConfig = require('./AnthropicConfig');
const PromptManager = require('../../config/PromptManager');

/**
 * Helper para integración con Claude API - VERSIÓN CORREGIDA
 * Maneja comunicación directa con Anthropic Claude API
 */
class ClaudeApiHelper {
    static client = null;
    static lastConnectionTest = null;
    static connectionTested = false;

    // Circuit breaker properties
    static circuitBreakerFailures = 0;
    static circuitBreakerLastFailure = null;
    static circuitBreakerThreshold = 5;
    static circuitBreakerTimeout = 300000; // 5 minutos

    // Rate limiting
    static rateLimitWindow = null;
    static tokenUsage = 0;
    static maxTokensPerHour = 50000;

    /**
     * Inicializar cliente de Anthropic
     */
    static initializeClient() {
        if (this.client) {
            return this.client;
        }

        try {
            this.validateConfiguration();

            const config = AnthropicConfig.claude;
            this.client = new Anthropic({
                apiKey: config.apiKey,
                timeout: config.timeout || 180000,
                maxRetries: 0 // Manejamos reintentos manualmente
            });

            logInfo('✅ Cliente Claude inicializado correctamente', {
                model: config.model,
                timeout: config.timeout,
                maxTokens: config.maxTokens
            });

        } catch (error) {
            logError('❌ Error inicializando cliente Claude', {
                error: error.message,
                hasApiKey: !!AnthropicConfig.claude.apiKey,
                keyLength: AnthropicConfig.claude.apiKey ? AnthropicConfig.claude.apiKey.length : 0
            });
            throw error;
        }

        return this.client;
    }

    /**
     * Validar configuración de API
     */
    static validateConfiguration() {
        const config = AnthropicConfig.claude;

        if (!config.apiKey) {
            throw ErrorFactory.internal('ANTHROPIC_API_KEY no está configurada');
        }

        if (config.apiKey === 'your-api-key-here' || config.apiKey.length < 20) {
            throw ErrorFactory.internal('API Key de Anthropic inválida');
        }

        if (!config.apiKey.startsWith('sk-ant-')) {
            logWarn('⚠️ API Key no tiene el formato esperado');
        }

        const validModels = [
            'claude-sonnet-4-20250514',
            'claude-3-5-sonnet-20241022',
            'claude-3-5-haiku-20241022'
        ];

        if (!validModels.includes(config.model)) {
            logWarn('⚠️ Modelo no reconocido', {
                provided: config.model,
                defaulting: 'claude-sonnet-4-20250514'
            });
        }
    }

    /**
     * ✅ MÉTODO PRINCIPAL CORREGIDO: Generar análisis financiero
     */
    static async generateFinancialAnalysis(inputData, options = {}) {
        const analysisType = options.analysisType || 'financial';
        const startTime = Date.now();
        const requestId = options.requestId || this.generateRequestId();

        logInfo('🧠 Iniciando análisis financiero con Claude', {
            analysisType,
            requestId,
            hasInputData: !!inputData
        });

        try {
            // 1. Validaciones previas
            await this.validateInputData(inputData, analysisType);

            // 2. Rate limiting check
            await this.checkRateLimit();

            // 3. Inicializar cliente
            const client = this.initializeClient();

            // 4. ✅ CORREGIDO: Construir prompt optimizado
            const prompt = this.buildOptimizedPrompt(inputData, analysisType);

            // 5. Ejecutar con circuit breaker
            const rawResponse = await this.executeWithCircuitBreaker(
                client,
                prompt,
                analysisType,
                requestId
            );

            // 6. ✅ CORREGIDO: Procesar respuesta
            const processedAnalysis = await this.processClaudeResponse(
                rawResponse,
                analysisType,
                options
            );

            const totalTime = Date.now() - startTime;
            const qualityMetrics = this.calculateQualityMetrics(processedAnalysis);

            logInfo('✅ Análisis Claude completado exitosamente', {
                analysisType,
                duration: `${totalTime}ms`,
                sectionsGenerated: Object.keys(processedAnalysis).length,
                qualityScore: qualityMetrics.qualityScore
            });

            return {
                success: true,
                analysis: processedAnalysis,
                metadata: {
                    provider: 'Claude API',
                    model: AnthropicConfig.claude.model,
                    fallbackUsed: false,
                    processingTime: `${totalTime}ms`,
                    analysisType,
                    timestamp: new Date().toISOString(),
                    quality: 'ai-enhanced',
                    requestId,
                    qualityMetrics
                }
            };

        } catch (error) {
            const totalTime = Date.now() - startTime;
            logError('❌ Error en análisis con Claude', {
                analysisType,
                error: error.message,
                duration: `${totalTime}ms`,
                requestId
            });

            return this.handleClaudeError(error, analysisType, {
                processingTime: `${totalTime}ms`,
                requestId
            });
        }
    }

    /**
     * ✅ NUEVO: Prompt optimizado y corregido
     */
    static buildOptimizedPrompt_old(inputData, analysisType) {
        const contextData = this.prepareContextData(inputData);

        return `Eres un experto analista financiero inmobiliario especializado en el mercado chileno con 15 años de experiencia en inversiones inmobiliarias.

DATOS DE ENTRADA PARA ANÁLISIS:
${JSON.stringify(contextData, null, 2)}

INSTRUCCIONES ESPECÍFICAS:
- Usa los datos reales de propertyInfo, marketComparison y mortgageAnalysis
- Calcula métricas financieras precisas basadas en datos actuales
- Infiere análisis de ubicación usando la dirección de la propiedad
- Genera recomendaciones ejecutivas fundamentadas

ESTRUCTURA JSON REQUERIDA (responde SOLO con este JSON, sin texto adicional):

{
  "indicadoresFinancieros": {
    "flujoCajaMensual": {
      "valor": [calcular: arriendo_estimado - gastos_operacionales - dividendo_hipotecario],
      "composicion": {
        "ingresoArriendo": [usar promedio de comparables similares de marketComparison],
        "gastosOperacionales": [calcular 13% del arriendo + gastos_comunes de propertyInfo],
        "dividendoHipotecario": [usar mejor dividendo de mortgageAnalysis para 30 años]
      }
    },
    "yieldBruto": [calcular: (arriendo_anual / precio_propiedad_clp) * 100],
    "yieldNeto": [calcular: ((arriendo_anual - gastos_anuales) / precio_propiedad_clp) * 100],
    "capRate": [mismo valor que yieldNeto],
    "puntoEquilibrio": [gastos_operacionales + dividendo_hipotecario],
    "plusvaliaEsperada": [estimar 3.5% para zona premium, ajustar según ubicación]
  },
  "analisisUbicacion": {
    "educacion": [
      {
        "nombre": "Institución educativa cercana",
        "distancia": "X.X km",
        "tipo": "Educación inicial/básica/media/superior",
        "descripcion": "Breve descripción"
      }
    ],
    "areasVerdes": [
      {
        "nombre": "Área verde cercana",
        "distancia": "X.X km",
        "tipo": "Parque/Playa/Reserva natural",
        "descripcion": "Actividades disponibles"
      }
    ],
    "comercio": [
      {
        "nombre": "Servicio comercial",
        "distancia": "X.X km",
        "tipo": "Supermercado/Centro comercial/Banco/Farmacia",
        "descripcion": "Servicios disponibles"
      }
    ],
    "salud": [
      {
        "nombre": "Centro de salud",
        "distancia": "X.X km",
        "tipo": "Atención primaria/Hospital/Clínica/Farmacia",
        "descripcion": "Servicios médicos disponibles"
      }
    ]
  },
  "analisisSeguridad": {
    "indiceSeguridad": [número entre 1-10, estimar 8-10 para zonas premium],
    "detalleSeguridad": {
      "factores": [
        "Condominio cerrado con portería 24/7",
        "Patrullaje policial frecuente",
        "Acceso controlado a la zona",
        "Sistema de cámaras de seguridad"
      ],
      "clasificacion": "Muy Seguro/Seguro/Moderado"
    },
    "serviciosEmergencia": {
      "tiempoRespuesta": "< X min",
      "detalles": [
        "Carabineros: X.X km (X min)",
        "Bomberos: X.X km (X min)",
        "Hospital más cercano: X.X km (X min)"
      ]
    },
    "riesgosNaturales": {
      "nivel": "Bajo/Moderado/Alto",
      "detalles": [
        "Tsunami: Sin riesgo/Riesgo bajo (zona elevada)",
        "Inundación: Riesgo bajo/moderado",
        "Incendio forestal: Riesgo bajo/moderado",
        "Sismo: Construcción con normas antisísmicas"
      ]
    }
  },
  "resumenEjecutivo": {
    "viabilidadInversion": {
      "decision": "Recomendada/No recomendada/Condicionada",
      "justificacion": "Análisis detallado de viabilidad basado en métricas calculadas",
      "nivelRiesgo": "Bajo/Moderado/Alto",
      "puntosACavor": [
        "Yield neto del X.X%",
        "Flujo de caja positivo",
        "Ubicación en zona premium"
      ]
    },
    "optimizacionFinanciera": {
      "recomendacion": "Descripción de la mejor estrategia de financiamiento",
      "ventajas": [
        "Mejor tasa del mercado",
        "Flujo positivo desde mes 1",
        "Máxima liquidez"
      ],
      "bancoRecomendado": "[usar mejor banco de mortgageAnalysis]",
      "plazoOptimo": "[usar mejor plazo de mortgageAnalysis]"
    },
    "potencialCrecimiento": {
      "proyeccion": "Proyección de crecimiento a 5-10 años",
      "factores": [
        "Plusvalía esperada del X.X% anual",
        "Incrementos de arriendo del 3-5% anual",
        "Zona en consolidación/consolidada"
      ],
      "roi": "ROI proyectado considerando plusvalía y flujo"
    },
    "recomendacionFinal": {
      "accion": "PROCEDER/EVALUAR/DESCARTAR",
      "resumen": "Resumen ejecutivo de 2-3 líneas",
      "siguientesPasos": [
        "Contactar banco recomendado",
        "Solicitar simulación oficial",
        "Evaluar capacidad de pago"
      ]
    }
  }
}

CÁLCULOS IMPORTANTES:
- Arriendo estimado: Usar promedio de comparables similares en marketComparison
- Gastos operacionales: 13% del arriendo + gastos comunes reales
- Dividendo hipotecario: Usar mejor opción de mortgageAnalysis (plazo 30 años)
- Yield bruto: (arriendo_anual / precio_propiedad) * 100
- Yield neto: ((arriendo_anual - gastos_anuales) / precio_propiedad) * 100
- Flujo de caja: arriendo_mensual - gastos_mensuales - dividendo_mensual

INFERENCIA DE UBICACIÓN:
Basándote en la ubicación "${contextData.propertyInfo?.ubicacion || 'Chile'}", infiere servicios y amenidades típicas de esa zona, considerando:
- Nivel socioeconómico de la zona
- Servicios urbanos disponibles
- Distancias realistas en contexto chileno
- Características geográficas y topográficas

RESPONDE ÚNICAMENTE CON EL JSON VÁLIDO, SIN TEXTO ADICIONAL NI MARKDOWN.`;
    }


    /**
     * ✅ NUEVO: Construir prompt usando PromptManager
     */
    static buildOptimizedPrompt(inputData, analysisType) {
        try {
            const contextData = this.prepareContextData(inputData);
            const ubicacion = contextData.propertyInfo?.ubicacion || 'Chile';
            
            // Usar PromptManager para construir el prompt
            return PromptManager.buildFinancialAnalysisPrompt(contextData, ubicacion);
            
        } catch (error) {
            logError('❌ Error construyendo prompt desde PromptManager', {
                error: error.message,
                analysisType
            });
            
            // Fallback al prompt anterior si falla
            return this.buildOptimizedPrompt_fallback(inputData, analysisType);
        }
    }



    /**
     * ✅ CORREGIDO: Preparar datos de contexto con nombres correctos
     */
    static prepareContextData(inputData) {
        return {
            propertyInfo: inputData.propertyInfo || null,           // ✅ Correcto
            marketComparison: inputData.marketComparison || [],     // ✅ Correcto
            mortgageAnalysis: inputData.mortgageAnalysis || null,   // ✅ Correcto
            analysisConfig: inputData.analysisConfig || {},
            dataQuality: inputData.dataQuality || {}
        };
    }

    /**
     * ✅ CORREGIDO: Validación semántica para nueva estructura
     */
    static validateResponseSemantic(response, analysisType) {
        const issues = [];
        let completeness = 0;

        // Validar estructura principal
        const requiredSections = [
            'indicadoresFinancieros',
            'analisisUbicacion',
            'analisisSeguridad',
            'resumenEjecutivo'
        ];

        const foundSections = requiredSections.filter(section => response[section]);
        completeness = (foundSections.length / requiredSections.length) * 100;

        // Validar subsecciones críticas
        if (response.indicadoresFinancieros) {
            if (!response.indicadoresFinancieros.flujoCajaMensual) {
                issues.push('Falta flujo de caja mensual');
            }
            if (!response.indicadoresFinancieros.yieldBruto) {
                issues.push('Falta yield bruto');
            }
            if (!response.indicadoresFinancieros.yieldNeto) {
                issues.push('Falta yield neto');
            }
        } else {
            issues.push('Falta sección indicadores financieros');
        }

        if (response.analisisUbicacion) {
            const locationSections = ['educacion', 'areasVerdes', 'comercio', 'salud'];
            const foundLocationSections = locationSections.filter(section =>
                response.analisisUbicacion[section] && Array.isArray(response.analisisUbicacion[section])
            );
            if (foundLocationSections.length < 2) {
                issues.push('Análisis de ubicación incompleto');
            }
        } else {
            issues.push('Falta análisis de ubicación');
        }

        if (response.analisisSeguridad) {
            if (!response.analisisSeguridad.indiceSeguridad) {
                issues.push('Falta índice de seguridad');
            }
        } else {
            issues.push('Falta análisis de seguridad');
        }

        if (response.resumenEjecutivo) {
            if (!response.resumenEjecutivo.recomendacionFinal) {
                issues.push('Falta recomendación final');
            }
            if (!response.resumenEjecutivo.viabilidadInversion) {
                issues.push('Falta análisis de viabilidad');
            }
        } else {
            issues.push('Falta resumen ejecutivo');
        }

        return {
            isValid: issues.length === 0,
            completeness,
            issues
        };
    }

    // ✅ MANTENER: Resto de métodos helper existentes
    static async executeWithCircuitBreaker(client, prompt, analysisType, requestId) {
        if (this.isCircuitBreakerOpen()) {
            logWarn('⚡ Circuit breaker OPEN - usando fallback');
            throw new Error('Circuit breaker open - Claude API temporalmente no disponible');
        }

        try {
            const result = await this.executeWithRetry(client, prompt, analysisType, 0, requestId);
            this.resetCircuitBreaker();
            return result;
        } catch (error) {
            this.recordCircuitBreakerFailure();
            throw error;
        }
    }

    static async executeWithRetry(client, prompt, analysisType, retryCount = 0, requestId) {
        const config = AnthropicConfig.claude;
        const maxRetries = config.retries || 3;

        try {
            logDebug(`📤 Enviando solicitud a Claude (intento ${retryCount + 1}/${maxRetries + 1})`, {
                model: config.model,
                promptLength: prompt.length,
                requestId
            });

            const startTime = Date.now();
            const message = await client.messages.create({
                model: config.model,
                max_tokens: config.maxTokens,
                temperature: config.temperature,
                system: this.getSystemPrompt(analysisType),
                messages: [
                    {
                        role: 'user',
                        content: [{ type: 'text', text: prompt }]
                    }
                ]
            });

            const requestTime = Date.now() - startTime;
            const content = this.extractContentFromResponse(message);

            if (!content || content.length < 10) {
                throw new Error('Respuesta vacía o muy corta de Claude API');
            }

            logDebug('📥 Respuesta recibida de Claude API', {
                contentLength: content.length,
                requestTime: `${requestTime}ms`,
                requestId
            });

            this.updateRateLimitMetrics(message.usage);
            return content;

        } catch (error) {
            logWarn(`⚠️ Error en intento ${retryCount + 1} de Claude API`, {
                error: error.message,
                retryCount,
                requestId
            });

            if (this.shouldRetry(error, retryCount, maxRetries)) {
                const retryDelay = this.calculateRetryDelay(retryCount);
                await this.sleep(retryDelay);
                return this.executeWithRetry(client, prompt, analysisType, retryCount + 1, requestId);
            }

            throw this.enrichError(error, retryCount);
        }
    }

    static extractContentFromResponse(message) {
        if (!message || !message.content) {
            throw new Error('Mensaje sin contenido');
        }

        if (Array.isArray(message.content)) {
            const textBlock = message.content.find(block => block.type === 'text');
            return textBlock ? textBlock.text : '';
        }

        if (message.content.text) {
            return message.content.text;
        }

        if (typeof message.content === 'string') {
            return message.content;
        }

        throw new Error('Estructura de respuesta no reconocida');
    }

    static async processClaudeResponse(response, analysisType, options = {}) {
        try {
            logDebug('🔄 Procesando respuesta de Claude', {
                analysisType,
                responseLength: response.length
            });

            let cleanedResponse = this.preprocessResponse(response);
            let parsedResponse;

            try {
                parsedResponse = JSON.parse(cleanedResponse);
            } catch (parseError) {
                logWarn('⚠️ Error parsing JSON inicial', {
                    parseError: parseError.message
                });
                parsedResponse = await this.rescueJsonParsing(cleanedResponse, parseError);
            }

            const validationResult = this.validateResponseSemantic(parsedResponse, analysisType);

            if (!validationResult.isValid) {
                logWarn('⚠️ Respuesta requiere corrección semántica', validationResult);
                parsedResponse = this.correctSemanticIssues(parsedResponse, validationResult);
            }

            parsedResponse = this.enhanceResponseWithInference(parsedResponse, analysisType);

            logInfo('✅ Respuesta Claude procesada exitosamente', {
                analysisType,
                sectionsFound: Object.keys(parsedResponse),
                completeness: `${validationResult.completeness}%`
            });

            return parsedResponse;

        } catch (error) {
            logError('❌ ERROR CRÍTICO EN PROCESAMIENTO CLAUDE', {
                error: error.message,
                analysisType
            });

            return this.generateEnhancedFallbackAnalysis(analysisType, response);
        }
    }

    // ✅ MANTENER: Resto de métodos helper (preprocessResponse, rescueJsonParsing, etc.)
    static preprocessResponse(response) {
        let cleaned = response.trim();

        const cleanupPatterns = [
            /```json\s*/g,
            /```\s*$/g,
            /^[^{]*({[\s\S]*})[^}]*$/,
            /^\s*Here's the analysis[\s\S]*?({[\s\S]*})/i,
            /^\s*Based on[\s\S]*?({[\s\S]*})/i
        ];

        for (const pattern of cleanupPatterns) {
            const match = cleaned.match(pattern);
            if (match && match[1]) {
                cleaned = match[1];
                break;
            }
        }

        return cleaned;
    }

    static async rescueJsonParsing(response, originalError) {
        try {
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
        } catch (error) {
            // Si falla, intentar crear estructura básica
            return this.createBasicStructure();
        }

        throw originalError;
    }

    static createBasicStructure() {
        return {
            indicadoresFinancieros: {
                flujoCajaMensual: { valor: 0, composicion: {} },
                yieldBruto: 0,
                yieldNeto: 0,
                capRate: 0,
                puntoEquilibrio: 0,
                plusvaliaEsperada: 0
            },
            analisisUbicacion: {
                educacion: [],
                areasVerdes: [],
                comercio: [],
                salud: []
            },
            analisisSeguridad: {
                indiceSeguridad: 0,
                detalleSeguridad: { factores: [], clasificacion: "No disponible" },
                serviciosEmergencia: { tiempoRespuesta: "No disponible", detalles: [] },
                riesgosNaturales: { nivel: "No disponible", detalles: [] }
            },
            resumenEjecutivo: {
                viabilidadInversion: { decision: "Datos insuficientes" },
                optimizacionFinanciera: { recomendacion: "Consultar experto" },
                potencialCrecimiento: { proyeccion: "No disponible" },
                recomendacionFinal: { accion: "EVALUAR", resumen: "Datos insuficientes" }
            }
        };
    }

    static correctSemanticIssues(response, validationResult) {
        const corrected = { ...response };

        // Corregir estructura faltante
        if (!corrected.indicadoresFinancieros) {
            corrected.indicadoresFinancieros = {
                flujoCajaMensual: { valor: 0, composicion: {} },
                yieldBruto: 0,
                yieldNeto: 0,
                capRate: 0,
                puntoEquilibrio: 0,
                plusvaliaEsperada: 3.5
            };
        }

        if (!corrected.analisisUbicacion) {
            corrected.analisisUbicacion = {
                educacion: [],
                areasVerdes: [],
                comercio: [],
                salud: []
            };
        }

        if (!corrected.analisisSeguridad) {
            corrected.analisisSeguridad = {
                indiceSeguridad: 7.0,
                detalleSeguridad: { factores: [], clasificacion: "Moderado" },
                serviciosEmergencia: { tiempoRespuesta: "5-10 min", detalles: [] },
                riesgosNaturales: { nivel: "Moderado", detalles: [] }
            };
        }

        if (!corrected.resumenEjecutivo) {
            corrected.resumenEjecutivo = {
                viabilidadInversion: { decision: "Evaluar", justificacion: "Análisis básico" },
                optimizacionFinanciera: { recomendacion: "Revisar opciones financieras" },
                potencialCrecimiento: { proyeccion: "Moderado" },
                recomendacionFinal: { accion: "EVALUAR", resumen: "Revisar condiciones" }
            };
        }

        return corrected;
    }

    static enhanceResponseWithInference(response, analysisType) {
        const enhanced = { ...response };

        // Inferir valores faltantes basándose en datos existentes
        if (enhanced.indicadoresFinancieros) {
            const financial = enhanced.indicadoresFinancieros;

            if (financial.yieldBruto && !financial.yieldNeto) {
                financial.yieldNeto = Math.round((financial.yieldBruto * 0.75) * 100) / 100;
            }

            if (!financial.capRate && financial.yieldNeto) {
                financial.capRate = financial.yieldNeto;
            }

            if (!financial.plusvaliaEsperada) {
                financial.plusvaliaEsperada = 3.5;
            }
        }

        return enhanced;
    }

    static generateEnhancedFallbackAnalysis(analysisType, originalResponse) {
        return this.createBasicStructure();
    }

    static calculateQualityMetrics(analysis) {
        let score = 0;
        let checks = 0;

        // Verificar indicadores financieros
        if (analysis.indicadoresFinancieros?.yieldBruto > 0) score += 25;
        if (analysis.indicadoresFinancieros?.flujoCajaMensual?.valor) score += 25;
        checks += 2;

        // Verificar análisis de ubicación
        if (analysis.analisisUbicacion?.educacion?.length > 0) score += 15;
        if (analysis.analisisUbicacion?.comercio?.length > 0) score += 15;
        checks += 2;

        // Verificar análisis de seguridad
        if (analysis.analisisSeguridad?.indiceSeguridad > 0) score += 10;
        checks += 1;

        // Verificar resumen ejecutivo
        if (analysis.resumenEjecutivo?.recomendacionFinal?.accion) score += 10;
        checks += 1;

        return {
            qualityScore: score,
            maxScore: 100,
            completeness: (score / 100) * 100,
            averageConfidence: score > 70 ? 85 : score > 40 ? 70 : 50
        };
    }

    // ✅ MANTENER: Métodos helper existentes
    static getSystemPrompt(analysisType) {
        try {
            return PromptManager.getSystemPrompt('financial_analysis');
        } catch (error) {
            logWarn('⚠️ Usando system prompt por defecto', { error: error.message });
            return `Eres un asistente experto en análisis financiero inmobiliario para el mercado chileno. 
                    Siempre respondes en formato JSON válido con análisis precisos y recomendaciones accionables.
                    Incluyes niveles de confianza para cada sección del análisis.
                    NUNCA incluyas texto adicional fuera del JSON.
                    Usa la estructura exacta especificada en el prompt del usuario.`;
        }
    }

    static async validateInputData(inputData, analysisType) {
        if (!inputData || typeof inputData !== 'object') {
            throw new Error('Datos de entrada inválidos');
        }

        if (!inputData.propertyInfo) {
            throw new Error('Información de propiedad requerida');
        }

        return true;
    }

    static async checkRateLimit() {
        const now = Date.now();
        const hourInMs = 3600000;

        if (!this.rateLimitWindow || (now - this.rateLimitWindow) > hourInMs) {
            this.rateLimitWindow = now;
            this.tokenUsage = 0;
        }

        if (this.tokenUsage > this.maxTokensPerHour) {
            throw new Error('Rate limit exceeded');
        }

        return true;
    }

    static updateRateLimitMetrics(usage) {
        if (usage && usage.output_tokens) {
            this.tokenUsage += usage.output_tokens;
        }
    }

    static isCircuitBreakerOpen() {
        if (this.circuitBreakerFailures < this.circuitBreakerThreshold) {
            return false;
        }

        const now = Date.now();
        const timeSinceLastFailure = now - this.circuitBreakerLastFailure;

        if (timeSinceLastFailure > this.circuitBreakerTimeout) {
            this.circuitBreakerFailures = 0;
            return false;
        }

        return true;
    }

    static recordCircuitBreakerFailure() {
        this.circuitBreakerFailures++;
        this.circuitBreakerLastFailure = Date.now();
    }

    static resetCircuitBreaker() {
        this.circuitBreakerFailures = 0;
        this.circuitBreakerLastFailure = null;
    }

    static shouldRetry(error, retryCount, maxRetries) {
        if (retryCount >= maxRetries) return false;

        const retryableStatuses = [429, 500, 502, 503, 504];
        const retryableErrors = ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND'];

        return retryableStatuses.includes(error.status) ||
            retryableErrors.includes(error.code) ||
            error.message?.includes('timeout') ||
            error.message?.includes('network');
    }

    static calculateRetryDelay(retryCount) {
        const baseDelay = 2000;
        const maxDelay = 30000;
        return Math.min(baseDelay * Math.pow(2, retryCount), maxDelay);
    }

    static enrichError(error, retryCount) {
        return {
            ...error,
            retryCount,
            timestamp: new Date().toISOString(),
            service: 'Claude API'
        };
    }

    static handleClaudeError(error, analysisType, metadata) {
        return {
            success: false,
            error: error.message,
            analysisType,
            metadata: {
                ...metadata,
                fallbackUsed: true,
                provider: 'Error Handler'
            }
        };
    }

    static generateRequestId() {
        return `claude_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    static async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    static async testConnection() {
        try {
            const client = this.initializeClient();
            const startTime = Date.now();

            const message = await client.messages.create({
                model: AnthropicConfig.claude.model,
                max_tokens: 50,
                temperature: 0.1,
                messages: [
                    {
                        role: 'user',
                        content: [{ type: 'text', text: 'Responde únicamente: "OK"' }]
                    }
                ]
            });

            const latency = Date.now() - startTime;
            const content = this.extractContentFromResponse(message);

            this.lastConnectionTest = {
                success: true,
                latency: `${latency}ms`,
                timestamp: new Date().toISOString(),
                model: AnthropicConfig.claude.model
            };

            this.connectionTested = true;
            return this.lastConnectionTest;

        } catch (error) {
            this.lastConnectionTest = {
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            };

            this.connectionTested = true;
            return this.lastConnectionTest;
        }
    }

    static getDebugInfo() {
        return {
            client: {
                initialized: !!this.client,
                lastConnectionTest: this.lastConnectionTest,
                connectionTested: this.connectionTested
            },
            configuration: {
                model: AnthropicConfig.claude?.model,
                timeout: AnthropicConfig.claude?.timeout,
                maxRetries: AnthropicConfig.claude?.retries,
                maxTokens: AnthropicConfig.claude?.maxTokens
            },
            circuitBreaker: {
                failures: this.circuitBreakerFailures,
                isOpen: this.isCircuitBreakerOpen(),
                lastFailure: this.circuitBreakerLastFailure
            },
            rateLimiting: {
                currentWindow: this.rateLimitWindow,
                tokenUsage: this.tokenUsage,
                maxTokensPerHour: this.maxTokensPerHour
            }
        };
    }
}

module.exports = ClaudeApiHelper;