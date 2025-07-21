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
 * POST /api/anthropic/financial-report
 * ✅ VERSIÓN CORREGIDA: Validación defensiva + estructura de respuesta con nodo data
 */
    static async generateFinancialReport(req, res) {
        const startTime = Date.now();
        const { propertyUrl, options = {} } = req.body;
        const requestId = req.anthropicRequestId || `anthropic_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // ✅ VALIDACIÓN DEFENSIVA DE TIPOS ANTES DE CUALQUIER USO
        let validatedPropertyUrl = null;
        let propertyUrlForLogging = 'undefined';

        try {
            if (propertyUrl && typeof propertyUrl === 'string' && propertyUrl.trim().length > 0) {
                validatedPropertyUrl = propertyUrl.trim();
                propertyUrlForLogging = validatedPropertyUrl.substring(0, 50) + '...';
            } else {
                // ✅ ERROR TEMPRANO con información de debugging
                const errorInfo = {
                    receivedType: typeof propertyUrl,
                    receivedValue: propertyUrl,
                    isNull: propertyUrl === null,
                    isUndefined: propertyUrl === undefined,
                    isEmpty: propertyUrl === '',
                    length: propertyUrl?.length || 0,
                    requestId
                };

                logError('❌ propertyUrl inválido recibido', errorInfo);
                throw ErrorFactory.validation('URL de propiedad es requerida y debe ser una cadena válida', 'propertyUrl');
            }

            // Marcar procesamiento como activo
            req.processingActive = true;

            logInfo('🏠 Nueva solicitud de reporte financiero con validación defensiva', {
                requestId,
                propertyUrl: propertyUrlForLogging,
                hasOptions: Object.keys(options).length > 0,
                optionKeys: Object.keys(options),
                ip: req.ip,
                userAgent: req.get('User-Agent')?.substring(0, 100)
            });

            // ✅ COMPLETAR OPCIONES CON DEFAULTS SEGUROS
            const completeOptions = {
                includeLocationAnalysis: options.includeLocationAnalysis !== false,
                includeSecurityAnalysis: options.includeSecurityAnalysis !== false,
                includeFinancialMetrics: options.includeFinancialMetrics !== false,
                includeRiskAssessment: options.includeRiskAssessment !== false,
                confidenceLevel: options.confidenceLevel || 'high',
                propertyPrice: options.propertyPrice || null,
                marketRadius: options.marketRadius || '2km',
                maxComparables: Math.min(parseInt(options.maxComparables) || 15, 30),
                forceClaudeAnalysis: options.forceClaudeAnalysis === true,
                analysisDepth: options.analysisDepth || 'complete',
                requestId,
                startTime,
                coordinationContext: options.coordinationContext,
                propertyUrlLength: validatedPropertyUrl.length
            };

            // ✅ LLAMAR AL SERVICIO CON URL VALIDADA
            const reportResult = await Promise.race([
                AnthropicService.generateFinancialReport(validatedPropertyUrl, completeOptions),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Service timeout')), 230000) // 3.8 minutos
                )
            ]);

            // VERIFICACIÓN CRÍTICA ANTES DE RESPONDER
            if (res.headersSent || res.finished || res.destroyed || !req.processingActive) {
                logWarn('⚠️ No se puede enviar respuesta - estado de response comprometido', {
                    requestId,
                    headersSent: res.headersSent,
                    finished: res.finished,
                    destroyed: res.destroyed,
                    processingActive: req.processingActive
                });
                return;
            }

            const totalTime = Date.now() - startTime;

            // ✅ VALIDAR DATOS DE UBICACIÓN (con validación defensiva)
            const locationValidation = AnthropicController.validateLocationConsistency(reportResult);
            if (!locationValidation.isConsistent) {
                logWarn('⚠️ Inconsistencia de ubicación detectada en respuesta final', locationValidation);
            }

            logInfo('✅ Reporte financiero generado exitosamente con ubicación corregida', {
                requestId,
                totalTime: `${totalTime}ms`,
                hasProperty: !!reportResult.property,
                hasAnalysis: !!reportResult.analysis,
                hasMetrics: !!reportResult.metrics,
                claudeUsed: reportResult.metadata?.claudeAnalysisUsed,
                dataQuality: reportResult.metadata?.dataQuality,
                locationConsistent: locationValidation.isConsistent
            });

            // Marcar procesamiento como completo
            req.processingActive = false;

            // ✅ ESTRUCTURA DE RESPUESTA CORREGIDA CON NODO DATA
            const successResponse = {
                success: true,
                message: "Reporte financiero generado exitosamente",
                data: reportResult, // ✅ AGREGAR NODO DATA CON EL REPORTE COMPLETO
                metadata: {
                    ...reportResult.metadata,
                    generatedAt: new Date().toISOString(),
                    requestId,
                    totalTime: `${totalTime}ms`,
                    locationValidation,
                    processingSteps: [
                        'URL validation',
                        'Property data extraction',
                        'Location mapping correction',
                        'Comparable properties search',
                        'Mortgage analysis',
                        'Claude AI analysis',
                        'Final report generation'
                    ]
                }
            };

            // Verificación final antes de enviar
            if (!res.headersSent && !res.finished && !res.destroyed) {
                res.json(successResponse);
            } else {
                logWarn('⚠️ Respuesta exitosa generada pero no se pudo enviar', { requestId });
            }

        } catch (error) {
            // Marcar procesamiento como completo
            req.processingActive = false;

            // ✅ MANEJO DE ERRORES CON VALIDACIÓN DEFENSIVA
            if (res.headersSent || res.finished || res.destroyed) {
                logError('❌ Error después de headers enviados', error, {
                    requestId,
                    propertyUrl: propertyUrlForLogging,
                    headersSent: res.headersSent,
                    finished: res.finished
                });
                return;
            }

            const totalTime = Date.now() - startTime;

            logError('❌ Error generando reporte financiero', error, {
                requestId,
                propertyUrl: propertyUrlForLogging,
                error: error.message,
                errorType: error.constructor.name,
                processingTime: `${totalTime}ms`,
                stack: error.stack?.split('\n')[0]
            });

            // Determinar código de estado del error
            const statusCode = error.statusCode ||
                (error.name === 'ValidationError' ? 400 :
                    error.message.includes('timeout') ? 408 : 500);

            // ✅ RESPUESTA DE ERROR CON VALIDACIÓN DEFENSIVA
            const errorResponse = {
                success: false,
                error: error.message || 'Error interno generando reporte financiero',
                code: error.code || 'FINANCIAL_REPORT_ERROR',
                requestId,
                metadata: {
                    processingTime: `${totalTime}ms`,
                    errorType: error.constructor.name,
                    timestamp: new Date().toISOString(),
                    recoverable: statusCode < 500,
                    locationContext: {
                        propertyUrl: propertyUrlForLogging,
                        detectedDomain: validatedPropertyUrl ?
                            (() => {
                                try {
                                    return new URL(validatedPropertyUrl).hostname;
                                } catch {
                                    return 'invalid_url';
                                }
                            })() : 'unknown'
                    }
                },
                help: {
                    message: 'Error procesando el análisis financiero',
                    possibleCauses: [
                        'URL de propiedad inválida o inaccesible',
                        'Timeout en servicios externos',
                        'Error en mapeo de ubicación',
                        'Fallo temporal en Claude API'
                    ],
                    nextSteps: [
                        'Verificar que la URL sea válida y accesible',
                        'Intentar nuevamente en unos momentos',
                        'Contactar soporte si el problema persiste'
                    ]
                }
            };

            // Envío seguro de error
            if (!res.headersSent && !res.finished && !res.destroyed) {
                res.status(statusCode).json(errorResponse);
            }
        }
    }

    /**
     * ✅ MÉTODO CORREGIDO: Validar consistencia alineado con estructura real del service
     */
    static validateLocationConsistency(reportResult) {
        try {
            // ✅ RUTAS CORREGIDAS según estructura real del service (sin nodo data)
            const propertyLocation = reportResult.property?.ubicacion;
            const serviceMetadata = reportResult.metadata?.locationMapping;

            // ✅ FALLBACK: Si no hay locationMapping en metadata del service, usar datos de propiedad
            const searchLocation = serviceMetadata?.searchLocation ||
                serviceMetadata?.originalLocation ||
                reportResult.property?.ubicacion;

            const mappingMethod = serviceMetadata?.mappingMethod || 'direct_extraction';

            logInfo('🔍 Validando consistencia de ubicación', {
                propertyLocation: propertyLocation?.substring(0, 50),
                searchLocation: searchLocation?.substring(0, 50),
                mappingMethod,
                hasServiceMetadata: !!serviceMetadata,
                hasPropertyData: !!reportResult.property
            });

            if (!propertyLocation) {
                return {
                    isConsistent: false,
                    reason: 'Missing property location data',
                    propertyLocation: 'N/A',
                    searchLocation: searchLocation || 'N/A',
                    mappingMethod,
                    debugInfo: {
                        hasReportData: !!reportResult.property, // ✅ CORREGIDO: verificar reportResult.property
                        hasProperty: !!reportResult.property,   // ✅ CORREGIDO: verificar reportResult.property
                        propertyKeys: reportResult.property ? Object.keys(reportResult.property) : [],
                        hasMetadata: !!reportResult.metadata,
                        hasLocationMapping: !!serviceMetadata
                    }
                };
            }

            if (!searchLocation) {
                // ✅ Si no hay searchLocation, usar propertyLocation como referencia
                return {
                    isConsistent: true,
                    reason: 'Using property location as reference',
                    propertyLocation: propertyLocation.substring(0, 50) + '...',
                    searchLocation: propertyLocation.substring(0, 50) + '...',
                    mappingMethod: 'property_location_reference',
                    confidence: 'medium'
                };
            }

            // ✅ USAR VERIFICADOR DEL SERVICE
            const consistency = AnthropicService.verifyLocationConsistency(propertyLocation, searchLocation);

            return {
                isConsistent: consistency.isConsistent,
                consistencyRatio: consistency.consistencyRatio,
                propertyLocation: propertyLocation.substring(0, 50) + '...',
                searchLocation: searchLocation.substring(0, 50) + '...',
                mappingMethod,
                confidence: consistency.isConsistent ?
                    (consistency.consistencyRatio >= 0.8 ? 'high' : 'medium') : 'low',
                matches: consistency.matches,
                totalElements: consistency.totalElements,
                recommendation: consistency.recommendation
            };

        } catch (error) {
            logError('Error validando consistencia de ubicación en respuesta', error);
            return {
                isConsistent: false,
                error: error.message,
                reason: 'Validation error',
                propertyLocation: 'Error',
                searchLocation: 'Error',
                confidence: 'unknown',
                debugInfo: {
                    errorType: error.constructor.name,
                    errorMessage: error.message
                }
            };
        }
    }

    /**
     * GET /api/anthropic/financial-report - Version GET para testing
     */
    static async generateFinancialReportGet(req, res) {
        const { url, ...queryOptions } = req.query;

        // Convertir query params a opciones
        const options = {
            includeLocationAnalysis: queryOptions.includeLocationAnalysis === 'true',
            includeSecurityAnalysis: queryOptions.includeSecurityAnalysis === 'true',
            includeFinancialMetrics: queryOptions.includeFinancialMetrics === 'true',
            confidenceLevel: queryOptions.confidenceLevel || 'medium',
            maxComparables: parseInt(queryOptions.maxComparables) || 15
        };

        // Reutilizar lógica del POST
        req.body = { propertyUrl: url, options };
        return AnthropicController.generateFinancialReport(req, res);
    }

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
     * POST/GET /api/anthropic/test-claude
     * Probar conectividad con Claude API
     */
    static async testClaudeConnection(req, res) {
        const requestId = req.anthropicRequestId || `test_${Date.now()}`;

        logInfo('🧪 Testing Claude API connection', { requestId });

        try {
            const testResult = await ClaudeApiHelper.testConnection();

            return res.json({
                success: true,
                claude: {
                    status: testResult.success ? 'connected' : 'unavailable',
                    model: 'claude-sonnet-4-20250514',
                    latency: testResult.latency,
                    error: testResult.error || null
                },
                timestamp: new Date().toISOString(),
                requestId
            });
        } catch (error) {
            logError('Error testing Claude connection', error);

            return res.status(500).json({
                success: false,
                error: 'Error testing Claude API',
                claude: {
                    status: 'error',
                    error: error.message
                },
                requestId
            });
        }
    }

    /**
     * POST /api/anthropic/force-claude-analysis
     * Forzar análisis con Claude (debugging)
     */
    static async forceClaudeAnalysis(req, res) {
        const { propertyUrl, options = {} } = req.body;
        const requestId = req.anthropicRequestId || `force_${Date.now()}`;

        try {
            const forceOptions = {
                ...options,
                forceClaudeAnalysis: true,
                skipFallback: true,
                requestId
            };

            const result = await AnthropicService.generateFinancialReport(propertyUrl, forceOptions);

            return res.json({
                success: true,
                message: 'Análisis forzado con Claude',
                data: result,
                forced: true,
                requestId
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                error: 'Error en análisis forzado',
                details: error.message,
                requestId
            });
        }
    }

    /**
  * GET /api/anthropic/info
  * Información del servicio
  */
    static async getServiceInfo(req, res) {
        try {
            const claudeTest = await ClaudeApiHelper.testConnection();

            return res.json({
                success: true,
                service: 'AnthropicService',
                version: '1.0.0',
                claude: {
                    status: claudeTest.success ? 'connected' : 'unavailable',
                    model: 'claude-sonnet-4-20250514',
                    latency: claudeTest.latency
                },
                capabilities: [
                    'Análisis financiero inmobiliario',
                    'Evaluación de riesgos con IA',
                    'Recomendaciones personalizadas',
                    'Métricas calculadas por IA'
                ],
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                error: 'Error obteniendo información del servicio'
            });
        }
    }

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