// src/controllers/AnthropicController.js
const { logInfo, logError, logWarn } = require('../utils/logger');
const { ErrorFactory } = require('../utils/errors');
const { asyncErrorHandler } = require('../middleware/errorHandler');
const AnthropicService = require('../services/anthropic/AnthropicService');
const ClaudeApiHelper = require('../services/anthropic/ClaudeApiHelper'); // NUEVO
const AnthropicConfig = require('../services/anthropic/AnthropicConfig'); // NUEVO

/**
 * Controlador para servicios de análisis financiero inmobiliario con Claude API Real
 */
class AnthropicController {

    /**
     * Generar reporte completo de análisis financiero inmobiliario
     * POST /api/anthropic/financial-report
     */
    static generateFinancialReport = asyncErrorHandler(async (req, res) => {
        const { propertyUrl, options = {} } = req.body;
        const startTime = req.startTime || Date.now(); // Usar startTime del middleware si está disponible

        logInfo('📊 Nueva solicitud de reporte financiero con Claude API', {
            propertyUrl,
            options,
            ip: req.ip,
            userAgent: req.get('User-Agent')?.substring(0, 100),
            timestamp: new Date().toISOString()
        });

        // Verificar que no se haya enviado respuesta ya (por timeout)
        if (res.headersSent) {
            logWarn('⚠️ Headers ya enviados, cancelando procesamiento', {
                propertyUrl,
                requestId: req.anthropicRequestId
            });
            return;
        }

        // Validaciones de entrada
        AnthropicController.validateFinancialReportRequest({ propertyUrl, options });

        // Procesar opciones con valores por defecto
        const processedOptions = AnthropicController.processReportOptions(options);

        try {
            // Generar reporte usando AnthropicService con API real
            const reportResult = await AnthropicService.generateFinancialReport(
                propertyUrl,
                processedOptions
            );

            // Verificar nuevamente que no se haya enviado respuesta (por timeout)
            if (res.headersSent) {
                logWarn('⚠️ Headers ya enviados después del procesamiento, no enviando respuesta', {
                    propertyUrl,
                    requestId: req.anthropicRequestId
                });
                return;
            }

            const processingTime = Date.now() - startTime;

            // Log de éxito con métricas detalladas
            logInfo('✅ Reporte financiero generado exitosamente', {
                propertyUrl,
                confidence: reportResult.metadata?.confidence,
                dataQuality: reportResult.data?.metadata?.dataQuality?.overall,
                claudeApiUsed: reportResult.metadata?.claudeApi?.used,
                claudeModel: reportResult.metadata?.claudeApi?.model,
                fallbackUsed: reportResult.metadata?.claudeApi?.fallbackUsed,
                processingTime: `${processingTime}ms`,
                servicesUsed: Object.keys(reportResult.data?.metadata?.services || {})
            });

            // Respuesta estructurada mejorada para el frontend
            res.json({
                success: true,
                message: reportResult.metadata?.claudeApi?.used ? 
                    'Reporte financiero generado con Claude AI' :
                    'Reporte financiero generado con análisis de respaldo',
                data: reportResult.data,
                metadata: {
                    ...reportResult.metadata,
                    requestId: req.anthropicRequestId || AnthropicController.generateRequestId(),
                    totalProcessingTime: `${processingTime}ms`,
                    apiVersion: '1.0.0',
                    // NUEVA: Información específica de Claude
                    aiAnalysis: {
                        provider: 'Anthropic',
                        model: reportResult.metadata?.claudeApi?.model || 'N/A',
                        apiUsed: reportResult.metadata?.claudeApi?.used || false,
                        fallbackReason: reportResult.metadata?.claudeApi?.fallbackUsed ? 
                            'Claude API no disponible o error en procesamiento' : null,
                        analysisQuality: reportResult.metadata?.claudeApi?.used ? 'AI-Enhanced' : 'Standard'
                    }
                }
            });

        } catch (error) {
            // Verificar que no se haya enviado respuesta antes de manejar error
            if (res.headersSent) {
                logWarn('⚠️ Headers ya enviados, no enviando respuesta de error', {
                    propertyUrl,
                    error: error.message,
                    requestId: req.anthropicRequestId
                });
                return;
            }

            // Manejo específico de errores del servicio
            const errorResponse = AnthropicController.handleServiceError(error, propertyUrl);
            const processingTime = Date.now() - startTime;
            
            logError('❌ Error generando reporte financiero', {
                propertyUrl,
                error: error.message,
                errorType: error.name,
                processingTime: `${processingTime}ms`,
                stack: error.stack?.split('\n')[0]
            });

            return res.status(errorResponse.status).json({
                ...errorResponse.response,
                metadata: {
                    ...errorResponse.response.metadata,
                    processingTime: `${processingTime}ms`,
                    requestId: req.anthropicRequestId || AnthropicController.generateRequestId()
                }
            });
        }
    });

    /**
     * Generar reporte financiero vía GET (para testing)
     * GET /api/anthropic/financial-report?url=...
     */
    static generateFinancialReportGet = asyncErrorHandler(async (req, res) => {
        const { url, ...queryOptions } = req.query;

        logInfo('📊 Solicitud GET de reporte financiero', {
            url,
            queryOptions,
            ip: req.ip
        });

        if (!url) {
            return res.status(400).json({
                success: false,
                error: 'URL de propiedad es requerida',
                code: 'URL_REQUIRED',
                example: '/api/anthropic/financial-report?url=https://casa.mercadolibre.cl/...',
                help: {
                    message: 'Proporciona una URL válida de propiedad como query parameter',
                    format: '?url=<property_url>&includeLocationAnalysis=true'
                }
            });
        }

        // Convertir query parameters a formato de opciones
        const options = AnthropicController.parseQueryOptions(queryOptions);

        // Reutilizar lógica del POST
        req.body = { propertyUrl: url, options };
        return AnthropicController.generateFinancialReport(req, res);
    });

    /**
     * Obtener información del servicio de análisis - ACTUALIZADA
     * GET /api/anthropic/info
     */
    static getServiceInfo = asyncErrorHandler(async (req, res) => {
        logInfo('ℹ️ Solicitud de información del servicio Anthropic');

        // Test de conectividad con Claude API
        const claudeStatus = await ClaudeApiHelper.testConnection();

        const info = {
            success: true,
            service: 'Análisis Financiero Inmobiliario con Claude AI',
            version: '1.0.0',
            description: 'Generación automática de reportes financieros completos usando Claude Sonnet 4',
            status: 'Operativo',
            
            // NUEVA: Información de Claude API
            aiProvider: {
                name: 'Anthropic Claude',
                model: AnthropicConfig.claude.model,
                status: claudeStatus.success ? 'Conectado' : 'No disponible',
                fallbackAvailable: true,
                lastTest: new Date().toISOString(),
                features: [
                    'Análisis financiero avanzado',
                    'Evaluación de riesgos inteligente',
                    'Análisis de ubicación contextual',
                    'Recomendaciones personalizadas'
                ]
            },
            
            capabilities: {
                propertyAnalysis: 'Análisis completo de propiedades inmobiliarias',
                marketComparison: 'Comparación con propiedades similares en el mercado',
                mortgageSimulation: 'Simulación hipotecaria con múltiples bancos',
                financialMetrics: 'Cálculo de indicadores financieros clave',
                locationIntelligence: 'Análisis inteligente de ubicación y servicios',
                riskAssessment: 'Evaluación de riesgos de inversión',
                aiAnalysis: 'Análisis avanzado con Claude Sonnet 4',
                fallbackAnalysis: 'Análisis de respaldo cuando Claude no está disponible'
            },

            supportedPortals: [
                {
                    name: 'MercadoLibre',
                    domain: 'casa.mercadolibre.cl',
                    status: 'Completamente soportado',
                    features: ['Scraping completo', 'Precios UF/CLP', 'Características detalladas']
                },
                {
                    name: 'Portal Inmobiliario',
                    domain: 'portalinmobiliario.com',
                    status: 'Soportado para comparables',
                    features: ['Búsqueda de comparables', 'Análisis de mercado']
                }
            ],

            dataServices: {
                scraping: {
                    service: 'ScrapingService',
                    purpose: 'Extracción de datos de propiedad',
                    accuracy: '95%+',
                    avgTime: '10-15 segundos'
                },
                search: {
                    service: 'SearchService', 
                    purpose: 'Búsqueda de propiedades comparables',
                    coverage: 'Portal Inmobiliario',
                    avgTime: '15-20 segundos'
                },
                mortgage: {
                    service: 'MortgageService',
                    purpose: 'Simulación hipotecaria CMF',
                    banks: 10,
                    accuracy: 'Datos oficiales',
                    avgTime: '20-25 segundos'
                },
                ai: {
                    service: 'Claude Sonnet 4',
                    purpose: 'Análisis inteligente y generación de insights',
                    provider: 'Anthropic',
                    status: claudeStatus.success ? 'Operativo' : 'Fallback disponible',
                    avgTime: '5-10 segundos'
                }
            },

            endpoints: {
                'POST /api/anthropic/financial-report': {
                    description: 'Generar reporte financiero completo con Claude AI',
                    parameters: {
                        propertyUrl: 'URL de la propiedad (requerido)',
                        options: 'Opciones de análisis (opcional)'
                    },
                    avgResponseTime: '45-60 segundos'
                },
                'GET /api/anthropic/financial-report': {
                    description: 'Generar reporte vía query parameters (testing)',
                    parameters: {
                        url: 'URL de la propiedad (requerido)',
                        'includeLocationAnalysis': 'Incluir análisis de ubicación (opcional)',
                        'includeSecurityAnalysis': 'Incluir análisis de seguridad (opcional)',
                        'confidenceLevel': 'Nivel de confianza: low|medium|high'
                    }
                },
                'GET /api/anthropic/info': {
                    description: 'Información detallada del servicio',
                    parameters: 'Ninguno'
                },
                'POST /api/anthropic/test-claude': {
                    description: 'Probar conectividad con Claude API',
                    parameters: 'Ninguno'
                }
            },

            // ACTUALIZADA: Información de ejemplos con Claude
            exampleRequests: {
                basic: {
                    method: 'POST',
                    url: '/api/anthropic/financial-report',
                    body: {
                        propertyUrl: 'https://casa.mercadolibre.cl/MLC-2950253622-casa-en-venta-condominio-lomas-de-montemar-concon-_JM'
                    },
                    expectedResult: 'Análisis completo con Claude AI si está disponible'
                },
                advanced: {
                    method: 'POST',
                    url: '/api/anthropic/financial-report',
                    body: {
                        propertyUrl: 'https://casa.mercadolibre.cl/MLC-2950253622-casa-en-venta-condominio-lomas-de-montemar-concon-_JM',
                        options: {
                            includeLocationAnalysis: true,
                            includeSecurityAnalysis: true,
                            includeFinancialMetrics: true,
                            includeRiskAssessment: true,
                            confidenceLevel: 'high'
                        }
                    },
                    expectedResult: 'Análisis premium con todas las características'
                },
                get_request: {
                    method: 'GET',
                    url: '/api/anthropic/financial-report?url=https://casa.mercadolibre.cl/MLC-2950253622-casa-en-venta-condominio-lomas-de-montemar-concon-_JM&includeLocationAnalysis=true',
                    expectedResult: 'Prueba rápida del servicio'
                }
            },

            reportSections: {
                reportHeader: 'Información del reporte y confiabilidad (incluye estado de Claude)',
                propertySummary: 'Resumen ejecutivo de la propiedad',
                financialMetrics: 'Indicadores financieros calculados por Claude AI',
                mortgageAnalysis: 'Análisis completo de financiamiento hipotecario',
                marketComparison: 'Comparación con propiedades similares',
                locationAnalysis: 'Análisis inteligente de ubicación por Claude',
                securityAnalysis: 'Evaluación de seguridad de la zona',
                executiveSummary: 'Resumen ejecutivo y recomendaciones de Claude',
                riskAssessment: 'Evaluación de riesgos por IA',
                recommendations: 'Recomendaciones específicas generadas por Claude',
                dataSources: 'Fuentes de información utilizadas'
            },

            processingTime: {
                average: '45-60 segundos',
                breakdown: {
                    validation: '2-3 segundos',
                    scraping: '10-15 segundos',
                    comparables: '15-20 segundos', 
                    mortgage: '20-25 segundos',
                    claudeAnalysis: claudeStatus.success ? '5-10 segundos' : '2-3 segundos (fallback)',
                    reportGeneration: '3-5 segundos'
                }
            },

            limitations: {
                supportedRegions: ['Chile'],
                maxRequestsPerHour: AnthropicConfig.service.maxRequestsPerHour,
                maxComparables: AnthropicConfig.defaults.searchOptions.maxComparables,
                cacheTime: '1 hora',
                claudeApi: {
                    maxTokens: AnthropicConfig.claude.maxTokens,
                    temperature: AnthropicConfig.claude.temperature,
                    retries: AnthropicConfig.claude.retries
                }
            },

            // NUEVA: Configuración actual
            currentConfig: {
                claudeModel: AnthropicConfig.claude.model,
                claudeStatus: claudeStatus.success ? 'Operativo' : 'Fallback activo',
                fallbackEnabled: true,
                realTimeAnalysis: claudeStatus.success
            },

            timestamp: new Date().toISOString()
        };

        res.json(info);
    });

    /**
     * NUEVO: Probar conectividad con Claude API
     * POST /api/anthropic/test-claude
     */
    static testClaudeConnection = asyncErrorHandler(async (req, res) => {
        logInfo('🧪 Test de conectividad con Claude API solicitado');

        try {
            const connectionTest = await ClaudeApiHelper.testConnection();
            
            const response = {
                success: connectionTest.success,
                service: 'Claude API Connection Test',
                timestamp: new Date().toISOString(),
                result: connectionTest.success ? 'Conexión exitosa' : 'Conexión fallida',
                details: {
                    model: AnthropicConfig.claude.model,
                    apiKey: AnthropicConfig.claude.apiKey ? 
                        `Configurada (${AnthropicConfig.claude.apiKey.substring(0, 10)}...)` : 
                        'No configurada',
                    timeout: `${AnthropicConfig.claude.timeout}ms`,
                    retries: AnthropicConfig.claude.retries
                }
            };

            if (!connectionTest.success) {
                response.error = connectionTest.error;
                response.code = connectionTest.code;
                response.fallbackAvailable = true;
                response.recommendation = 'El servicio funcionará con análisis de fallback';
            }

            const statusCode = connectionTest.success ? 200 : 503;
            res.status(statusCode).json(response);

        } catch (error) {
            logError('Error en test de Claude API', { error: error.message });
            
            res.status(500).json({
                success: false,
                service: 'Claude API Connection Test',
                error: 'Error interno durante el test',
                details: error.message,
                timestamp: new Date().toISOString()
            });
        }
    });

    /**
     * NUEVO: Endpoint para forzar análisis con Claude (testing)
     * POST /api/anthropic/force-claude-analysis
     */
    static forceClaudeAnalysis = asyncErrorHandler(async (req, res) => {
        const { testData } = req.body;

        logInfo('🔬 Análisis forzado con Claude solicitado');

        if (!testData) {
            return res.status(400).json({
                success: false,
                error: 'Se requiere testData para el análisis',
                example: {
                    testData: {
                        property: { titulo: 'Test Property', precio_uf: '5000 UF' },
                        location: 'Santiago',
                        analysis: 'financial'
                    }
                }
            });
        }

        try {
            const analysisResult = await ClaudeApiHelper.analyzeWithClaude(testData, 'financial');
            
            res.json({
                success: true,
                message: 'Análisis Claude completado',
                result: analysisResult,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            logError('Error en análisis forzado Claude', { error: error.message });
            
            res.status(500).json({
                success: false,
                error: 'Error durante análisis Claude',
                details: error.message,
                timestamp: new Date().toISOString()
            });
        }
    });

    /**
     * Validar solicitud de reporte financiero
     */
    static validateFinancialReportRequest({ propertyUrl, options }) {
        // Validar URL
        if (!propertyUrl) {
            throw ErrorFactory.validation('URL de propiedad es requerida', 'propertyUrl');
        }

        if (typeof propertyUrl !== 'string') {
            throw ErrorFactory.validation('URL debe ser una cadena de texto', 'propertyUrl');
        }

        if (propertyUrl.length < 10) {
            throw ErrorFactory.validation('URL demasiado corta para ser válida', 'propertyUrl');
        }

        // Validar que sea una URL
        try {
            new URL(propertyUrl);
        } catch (error) {
            throw ErrorFactory.validation('Formato de URL inválido', 'propertyUrl');
        }

        // Validar opciones si existen
        if (options && typeof options !== 'object') {
            throw ErrorFactory.validation('Las opciones deben ser un objeto', 'options');
        }

        // Validar opciones específicas
        if (options.confidenceLevel && !['low', 'medium', 'high'].includes(options.confidenceLevel)) {
            throw ErrorFactory.validation(
                'confidenceLevel debe ser "low", "medium" o "high"',
                'options.confidenceLevel'
            );
        }
    }

    /**
     * Procesar opciones del reporte con valores por defecto
     */
    static processReportOptions(options) {
        return {
            includeLocationAnalysis: options.includeLocationAnalysis !== false,
            includeSecurityAnalysis: options.includeSecurityAnalysis !== false,
            includeFinancialMetrics: options.includeFinancialMetrics !== false,
            includeRiskAssessment: options.includeRiskAssessment !== false,
            confidenceLevel: options.confidenceLevel || 'high',
            propertyPrice: options.propertyPrice || null,
            customFilters: options.customFilters || null,
            marketRadius: options.marketRadius || '2km',
            analysisDepth: options.analysisDepth || 'complete',
            maxComparables: options.maxComparables || AnthropicConfig.defaults.searchOptions.maxComparables,
            forceClaudeAnalysis: options.forceClaudeAnalysis || false // NUEVO: para testing
        };
    }

    /**
     * Parsear opciones desde query parameters
     */
    static parseQueryOptions(queryOptions) {
        const options = {};

        // Convertir strings booleanos
        ['includeLocationAnalysis', 'includeSecurityAnalysis', 'includeFinancialMetrics', 'includeRiskAssessment', 'forceClaudeAnalysis']
            .forEach(key => {
                if (queryOptions[key] !== undefined) {
                    options[key] = queryOptions[key] === 'true';
                }
            });

        // Convertir otros parámetros
        if (queryOptions.confidenceLevel) {
            options.confidenceLevel = queryOptions.confidenceLevel;
        }

        if (queryOptions.propertyPrice) {
            const price = parseFloat(queryOptions.propertyPrice);
            if (!isNaN(price)) {
                options.propertyPrice = price;
            }
        }

        if (queryOptions.marketRadius) {
            options.marketRadius = queryOptions.marketRadius;
        }

        if (queryOptions.maxComparables) {
            const max = parseInt(queryOptions.maxComparables);
            if (!isNaN(max) && max > 0 && max <= 25) {
                options.maxComparables = max;
            }
        }

        return options;
    }

    /**
     * Manejar errores específicos del servicio - ACTUALIZADO
     */
    static handleServiceError(error, propertyUrl) {
        const baseResponse = {
            success: false,
            propertyUrl,
            timestamp: new Date().toISOString(),
            requestId: AnthropicController.generateRequestId()
        };

        // Error de validación
        if (error.name === 'ValidationError') {
            return {
                status: 400,
                response: {
                    ...baseResponse,
                    error: error.message,
                    code: 'VALIDATION_ERROR',
                    field: error.field || 'unknown',
                    help: {
                        message: 'Verifica que la URL sea válida y esté correctamente formateada',
                        example: 'https://casa.mercadolibre.cl/MLC-1234567890-casa-_JM'
                    }
                }
            };
        }

        // Error de Claude API
        if (error.message.includes('Claude') || error.message.includes('Anthropic')) {
            return {
                status: 503,
                response: {
                    ...baseResponse,
                    error: 'Error en servicio de IA',
                    code: 'CLAUDE_API_ERROR',
                    message: 'Claude AI temporalmente no disponible',
                    impact: 'El reporte se generará con análisis de respaldo',
                    help: {
                        message: 'El análisis básico está disponible aunque Claude falle',
                        fallbackUsed: true
                    }
                }
            };
        }

        // Error de scraping
        if (error.name === 'ScrapingError') {
            return {
                status: 422,
                response: {
                    ...baseResponse,
                    error: 'Error procesando la propiedad',
                    code: 'SCRAPING_ERROR',
                    message: error.message,
                    help: {
                        message: 'La URL puede no ser válida o el sitio puede estar temporalmente inaccesible',
                        suggestions: [
                            'Verifica que la URL sea de una propiedad específica',
                            'Intenta nuevamente en unos minutos',
                            'Asegúrate de que la propiedad aún esté disponible'
                        ]
                    }
                }
            };
        }

        // Error de búsqueda
        if (error.name === 'SearchError') {
            return {
                status: 503,
                response: {
                    ...baseResponse,
                    error: 'Error en búsqueda de comparables',
                    code: 'SEARCH_ERROR',
                    message: 'No se pudieron obtener propiedades comparables',
                    impact: 'El reporte se generará con datos limitados',
                    help: {
                        message: 'Error temporal en el servicio de búsqueda'
                    }
                }
            };
        }

        // Error de simulación hipotecaria
        if (error.name === 'MortgageError') {
            return {
                status: 503,
                response: {
                    ...baseResponse,
                    error: 'Error en simulación hipotecaria',
                    code: 'MORTGAGE_ERROR',
                    message: 'No se pudo completar el análisis de financiamiento',
                    impact: 'El reporte se generará sin análisis hipotecario',
                    help: {
                        message: 'Error temporal en el servicio CMF'
                    }
                }
            };
        }

        // Error de límite de requests
        if (error.message.includes('rate limit') || error.message.includes('too many requests')) {
            return {
                status: 429,
                response: {
                    ...baseResponse,
                    error: 'Límite de solicitudes excedido',
                    code: 'RATE_LIMIT_EXCEEDED',
                    message: 'Has excedido el límite de reportes por hora',
                    retryAfter: '3600',
                    help: {
                        message: 'Espera antes de realizar otra solicitud',
                        limits: {
                            perHour: AnthropicConfig.service.maxRequestsPerHour,
                            current: 'Límite alcanzado'
                        }
                    }
                }
            };
        }

        // Error genérico
        return {
            status: 500,
            response: {
                ...baseResponse,
                error: 'Error interno generando reporte',
                code: 'INTERNAL_ERROR',
                message: 'Ocurrió un error técnico procesando su solicitud',
                help: {
                    message: 'Error temporal del sistema',
                    action: 'Intente nuevamente en unos minutos o contacte soporte técnico',
                    fallbackAvailable: 'Análisis de respaldo disponible'
                },
                debug: process.env.NODE_ENV === 'development' ? {
                    originalError: error.message,
                    errorType: error.name
                } : undefined
            }
        };
    }

    /**
     * Generar ID único de solicitud
     */
    static generateRequestId() {
        return `claude_req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Calcular tiempo de procesamiento
     */
    static calculateProcessingTime(startTime) {
        if (!startTime) return null;
        
        const duration = Date.now() - startTime;
        return {
            milliseconds: duration,
            seconds: Math.round(duration / 1000),
            human: `${Math.round(duration / 1000)} segundos`
        };
    }
}

module.exports = AnthropicController;