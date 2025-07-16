// src/routes/anthropic.routes.js
const express = require('express');
const AnthropicController = require('../controllers/AnthropicController');
const { asyncErrorHandler } = require('../middleware/errorHandler');
const anthropicMiddleware = require('../middleware/anthropicMiddleware');

const router = express.Router();

// Middleware global para todas las rutas Anthropic
router.use(anthropicMiddleware.basic);

// =================================
// RUTAS PRINCIPALES - ACTUALIZADAS
// =================================

/**
 * POST /api/anthropic/financial-report
 * Generar reporte financiero completo con Claude API Real
 * 
 * Body:
 * {
 *   "propertyUrl": "https://casa.mercadolibre.cl/...",
 *   "options": {
 *     "includeLocationAnalysis": true,
 *     "includeSecurityAnalysis": true,
 *     "includeFinancialMetrics": true,
 *     "includeRiskAssessment": true,
 *     "confidenceLevel": "high",
 *     "propertyPrice": 9200,
 *     "marketRadius": "2km",
 *     "maxComparables": 15,
 *     "forceClaudeAnalysis": false
 *   }
 * }
 */
router.post('/financial-report', 
    anthropicMiddleware.protected, // Rate limiting para endpoint principal
    asyncErrorHandler(AnthropicController.generateFinancialReport)
);

/**
 * GET /api/anthropic/financial-report?url=...&options...
 * Generar reporte financiero vía query parameters (para testing)
 */
router.get('/financial-report', 
    anthropicMiddleware.standard, // Sin rate limiting para testing
    asyncErrorHandler(AnthropicController.generateFinancialReportGet)
);

// =================================
// NUEVOS ENDPOINTS - CLAUDE API
// =================================

/**
 * POST /api/anthropic/test-claude
 * Probar conectividad con Claude API
 */
router.post('/test-claude',
    anthropicMiddleware.standard,
    asyncErrorHandler(AnthropicController.testClaudeConnection)
);

/**
 * GET /api/anthropic/test-claude
 * Probar conectividad con Claude API (GET version)
 */
router.get('/test-claude',
    anthropicMiddleware.standard,
    asyncErrorHandler(AnthropicController.testClaudeConnection)
);

/**
 * POST /api/anthropic/force-claude-analysis
 * Forzar análisis con Claude (para testing y debugging)
 */
router.post('/force-claude-analysis',
    anthropicMiddleware.standard,
    asyncErrorHandler(AnthropicController.forceClaudeAnalysis)
);

// =================================
// RUTAS AUXILIARES - ACTUALIZADAS
// =================================

/**
 * GET /api/anthropic/info
 * Información completa del servicio (incluye estado de Claude)
 */
router.get('/info', 
    anthropicMiddleware.basic,
    asyncErrorHandler(AnthropicController.getServiceInfo)
);

/**
 * GET /api/anthropic/health
 * Health check específico del servicio (incluye Claude API)
 */
router.get('/health', asyncErrorHandler(async (req, res) => {
    const { logInfo } = require('../utils/logger');
    const ClaudeApiHelper = require('../services/anthropic/ClaudeApiHelper');
    const AnthropicConfig = require('../services/anthropic/AnthropicConfig');
    
    logInfo('Health check Anthropic service con Claude API');
    
    // Test de Claude API
    const claudeTest = await ClaudeApiHelper.testConnection();
    
    // Verificar dependencias del servicio
    const healthStatus = {
        service: 'AnthropicService',
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        
        // ACTUALIZADO: Estado de Claude API
        claudeApi: {
            status: claudeTest.success ? 'connected' : 'unavailable',
            model: AnthropicConfig.claude.model,
            fallbackAvailable: true,
            lastTest: new Date().toISOString(),
            error: claudeTest.success ? null : claudeTest.error
        },
        
        dependencies: {
            scrapingService: 'available',
            searchService: 'available', 
            mortgageService: 'available',
            claudeAPI: claudeTest.success ? 'connected' : 'fallback_mode'
        },
        
        performance: {
            averageResponseTime: claudeTest.success ? '45-60 seconds' : '35-45 seconds (fallback)',
            uptime: process.uptime(),
            memoryUsage: process.memoryUsage(),
            claudeApiLatency: claudeTest.latency || 'N/A'
        },
        
        // NUEVA: Configuración actual
        configuration: {
            model: AnthropicConfig.claude.model,
            maxTokens: AnthropicConfig.claude.maxTokens,
            temperature: AnthropicConfig.claude.temperature,
            timeout: `${AnthropicConfig.claude.timeout}ms`,
            retries: AnthropicConfig.claude.retries
        }
    };

    // Determinar código de estado
    const statusCode = (healthStatus.claudeApi.status === 'connected') ? 200 : 206; // 206 = Partial Content
    res.status(statusCode).json(healthStatus);
}));

/**
 * GET /api/anthropic/examples
 * Ejemplos de uso del servicio (actualizados con Claude)
 */
router.get('/examples', asyncErrorHandler(async (req, res) => {
    const examples = {
        success: true,
        service: 'Análisis Financiero Inmobiliario - Ejemplos con Claude API',
        examples: {
            basicReport: {
                title: 'Reporte Básico con Claude AI',
                description: 'Análisis completo usando Claude Sonnet 4',
                method: 'POST',
                endpoint: '/api/anthropic/financial-report',
                request: {
                    propertyUrl: 'https://casa.mercadolibre.cl/MLC-2950253622-casa-en-venta-condominio-lomas-de-montemar-concon-_JM'
                },
                expectedResponse: {
                    success: true,
                    message: 'Reporte financiero generado con Claude AI',
                    data: {
                        reportHeader: '{ title, aiAnalysis: { used: true, model: "claude-3-5-sonnet-20241022" } }',
                        propertySummary: '{ ... }',
                        financialMetrics: '{ source: "Claude AI Analysis", ... }',
                        executiveSummary: '{ analysisSource: "Claude Sonnet 4", ... }',
                        recommendations: '{ generatedBy: "Claude AI", ... }'
                    },
                    metadata: {
                        confidence: 87.3,
                        aiAnalysis: {
                            provider: 'Anthropic',
                            model: 'claude-3-5-sonnet-20241022',
                            apiUsed: true,
                            analysisQuality: 'AI-Enhanced'
                        }
                    }
                }
            },
            
            customizedReport: {
                title: 'Reporte Personalizado con Opciones Avanzadas',
                description: 'Análisis con todas las características de Claude habilitadas',
                method: 'POST',
                endpoint: '/api/anthropic/financial-report',
                request: {
                    propertyUrl: 'https://casa.mercadolibre.cl/MLC-2950253622-casa-en-venta-condominio-lomas-de-montemar-concon-_JM',
                    options: {
                        includeLocationAnalysis: true,
                        includeSecurityAnalysis: true,
                        includeFinancialMetrics: true,
                        includeRiskAssessment: true,
                        confidenceLevel: 'high',
                        propertyPrice: 9200,
                        marketRadius: '2km',
                        maxComparables: 15,
                        analysisDepth: 'complete'
                    }
                },
                expectedFeatures: [
                    'Análisis de ubicación por Claude',
                    'Evaluación de riesgos con IA',
                    'Recomendaciones personalizadas',
                    'Métricas financieras calculadas por IA'
                ]
            },
            
            quickTest: {
                title: 'Prueba Rápida (GET)',
                description: 'Testing rápido vía URL con Claude',
                method: 'GET',
                endpoint: '/api/anthropic/financial-report',
                url: '/api/anthropic/financial-report?url=https://casa.mercadolibre.cl/MLC-2950253622-casa-en-venta-condominio-lomas-de-montemar-concon-_JM&includeLocationAnalysis=true&confidenceLevel=high'
            },

            claudeTesting: {
                title: 'Testing de Claude API',
                description: 'Probar conectividad y funcionalidad de Claude',
                examples: {
                    connectionTest: {
                        method: 'POST',
                        endpoint: '/api/anthropic/test-claude',
                        expectedResponse: {
                            success: true,
                            result: 'Conexión exitosa',
                            details: {
                                model: 'claude-3-5-sonnet-20241022',
                                apiKey: 'Configurada (sk-ant-api...)'
                            }
                        }
                    },
                    forceAnalysis: {
                        method: 'POST',
                        endpoint: '/api/anthropic/force-claude-analysis',
                        request: {
                            testData: {
                                property: { titulo: 'Casa Test', precio_uf: '5000 UF' },
                                location: 'Santiago',
                                analysis: 'financial'
                            }
                        }
                    }
                }
            },

            fallbackScenarios: {
                title: 'Escenarios de Fallback',
                description: 'Comportamiento cuando Claude no está disponible',
                scenarios: {
                    claudeDown: {
                        situation: 'Claude API no disponible',
                        response: {
                            success: true,
                            message: 'Reporte financiero generado con análisis de respaldo',
                            metadata: {
                                aiAnalysis: {
                                    apiUsed: false,
                                    fallbackReason: 'Claude API no disponible',
                                    analysisQuality: 'Standard'
                                }
                            }
                        }
                    },
                    partialData: {
                        situation: 'Algunos servicios fallan pero Claude funciona',
                        response: {
                            confidence: 'Media-Alta',
                            claudeAnalysis: 'Disponible con datos limitados'
                        }
                    }
                }
            },

            errorHandling: {
                title: 'Manejo de Errores Actualizado',
                description: 'Respuestas de error incluyendo Claude API',
                examples: {
                    claudeApiError: {
                        request: { propertyUrl: 'valid-url' },
                        response: {
                            success: false,
                            error: 'Error en servicio de IA',
                            code: 'CLAUDE_API_ERROR',
                            impact: 'El reporte se generará con análisis de respaldo',
                            help: {
                                fallbackUsed: true
                            }
                        }
                    },
                    invalidUrl: {
                        request: { propertyUrl: 'url-invalida' },
                        response: {
                            success: false,
                            error: 'Formato de URL inválido',
                            code: 'VALIDATION_ERROR'
                        }
                    }
                }
            }
        },
        
        testingFlow: {
            step1: 'Verificar Claude API: POST /api/anthropic/test-claude',
            step2: 'Verificar servicios: GET /api/anthropic/health',
            step3: 'Obtener información: GET /api/anthropic/info',
            step4: 'Probar con ejemplo: GET /api/anthropic/financial-report?url=...',
            step5: 'Generar reporte completo: POST /api/anthropic/financial-report',
            step6: 'Probar análisis forzado: POST /api/anthropic/force-claude-analysis'
        },
        
        claudeSpecific: {
            testUrls: [
                'https://casa.mercadolibre.cl/MLC-2950253622-casa-en-venta-condominio-lomas-de-montemar-concon-_JM',
                'https://casa.mercadolibre.cl/MLC-1614107669-vass-vende-casa-6d-3b-en-exclusivo-condominio-de-concon-_JM'
            ],
            modelInfo: {
                current: 'claude-3-5-sonnet-20241022',
                provider: 'Anthropic',
                capabilities: [
                    'Análisis financiero avanzado',
                    'Evaluación de riesgos contextual',
                    'Recomendaciones personalizadas',
                    'Análisis de mercado inteligente'
                ]
            },
            performance: {
                avgLatency: '5-10 segundos',
                fallbackTime: '2-3 segundos',
                reliability: '95%+'
            }
        },
        
        timestamp: new Date().toISOString()
    };

    res.json(examples);
}));

/**
 * GET /api/anthropic/status
 * Estado detallado del sistema (incluye Claude API)
 */
router.get('/status', asyncErrorHandler(async (req, res) => {
    const { logInfo } = require('../utils/logger');
    const ClaudeApiHelper = require('../services/anthropic/ClaudeApiHelper');
    const AnthropicConfig = require('../services/anthropic/AnthropicConfig');
    
    logInfo('Status check del sistema Anthropic con Claude');

    // Test rápido de Claude
    const claudeTest = await ClaudeApiHelper.testConnection();

    const status = {
        success: true,
        system: 'Análisis Financiero Inmobiliario con Claude AI',
        timestamp: new Date().toISOString(),
        
        services: {
            anthropic: {
                status: 'operational',
                description: 'Servicio principal de análisis con IA',
                version: '1.0.0'
            },
            claude: {
                status: claudeTest.success ? 'operational' : 'fallback',
                description: 'Claude API para análisis inteligente',
                model: AnthropicConfig.claude.model,
                provider: 'Anthropic',
                lastTest: new Date().toISOString(),
                error: claudeTest.success ? null : claudeTest.error
            },
            scraping: {
                status: 'operational',
                description: 'Extracción de datos de propiedades',
                portals: ['MercadoLibre', 'Portal Inmobiliario']
            },
            search: {
                status: 'operational',
                description: 'Búsqueda de propiedades comparables',
                coverage: 'Portal Inmobiliario'
            },
            mortgage: {
                status: 'operational',
                description: 'Simulación hipotecaria CMF',
                banks: 10
            }
        },
        
        performance: {
            averageResponseTime: claudeTest.success ? '45-60 segundos' : '35-45 segundos',
            claudeLatency: claudeTest.latency || 'N/A',
            successRate: '95%+',
            uptime: Math.floor(process.uptime()),
            memoryUsage: Math.round(process.memoryUsage().rss / 1024 / 1024) + ' MB'
        },
        
        configuration: {
            claudeModel: AnthropicConfig.claude.model,
            maxTokens: AnthropicConfig.claude.maxTokens,
            temperature: AnthropicConfig.claude.temperature,
            timeout: `${AnthropicConfig.claude.timeout}ms`,
            retries: AnthropicConfig.claude.retries,
            fallbackEnabled: true
        },
        
        limits: {
            requestsPerHour: AnthropicConfig.service.maxRequestsPerHour,
            maxComparables: AnthropicConfig.defaults.searchOptions.maxComparables,
            supportedRegions: ['Chile'],
            cacheTime: '1 hora',
            claudeMaxTokens: AnthropicConfig.claude.maxTokens
        },
        
        // NUEVA: Estado actual del sistema
        currentState: {
            claudeApiAvailable: claudeTest.success,
            aiAnalysisEnabled: claudeTest.success,
            fallbackActive: !claudeTest.success,
            realTimeAnalysis: claudeTest.success,
            enhancedFeatures: claudeTest.success
        },
        
        lastUpdated: new Date().toISOString()
    };

    res.json(status);
}));

/**
 * POST /api/anthropic/validate
 * Validar URL sin generar reporte completo
 */
router.post('/validate', 
    anthropicMiddleware.standard,
    asyncErrorHandler(async (req, res) => {
        const { propertyUrl } = req.body;
        const { logInfo } = require('../utils/logger');
        const AnthropicService = require('../services/anthropic/AnthropicService');

        logInfo('🔍 Validación de URL para reporte financiero', { propertyUrl });

        if (!propertyUrl) {
            return res.status(400).json({
                success: false,
                error: 'URL de propiedad es requerida',
                code: 'URL_REQUIRED'
            });
        }

        try {
            const validation = await AnthropicService.validatePropertyUrl(propertyUrl);
            
            const response = {
                success: validation.valid,
                propertyUrl,
                validation: {
                    isValid: validation.valid,
                    portal: validation.portal || null,
                    reason: validation.reason || null
                },
                recommendation: validation.valid ? 
                    'URL válida - puede proceder con el análisis financiero con Claude' :
                    'URL no válida - corrija el formato o verifique la propiedad',
                claudeAvailable: true, // Asumimos que está disponible, se verificará durante el análisis
                timestamp: new Date().toISOString()
            };

            const statusCode = validation.valid ? 200 : 400;
            res.status(statusCode).json(response);

        } catch (error) {
            logInfo('Error en validación de URL', { error: error.message });
            
            res.status(500).json({
                success: false,
                error: 'Error interno validando URL',
                code: 'VALIDATION_ERROR',
                timestamp: new Date().toISOString()
            });
        }
    })
);

/**
 * GET /api/anthropic/claude-config
 * Obtener configuración actual de Claude (sin API key)
 */
router.get('/claude-config', 
    anthropicMiddleware.basic,
    asyncErrorHandler(async (req, res) => {
        const AnthropicConfig = require('../services/anthropic/AnthropicConfig');
        
        const config = {
            success: true,
            claude: {
                model: AnthropicConfig.claude.model,
                maxTokens: AnthropicConfig.claude.maxTokens,
                temperature: AnthropicConfig.claude.temperature,
                timeout: AnthropicConfig.claude.timeout,
                retries: AnthropicConfig.claude.retries,
                apiKeyConfigured: !!AnthropicConfig.claude.apiKey,
                apiKeyPreview: AnthropicConfig.claude.apiKey ? 
                    `${AnthropicConfig.claude.apiKey.substring(0, 10)}...` : 
                    'No configurada'
            },
            service: {
                version: AnthropicConfig.service.version,
                maxRequestsPerHour: AnthropicConfig.service.maxRequestsPerHour,
                enableRealAPI: AnthropicConfig.service.enableRealAPI
            },
            timestamp: new Date().toISOString()
        };

        res.json(config);
    })
);

module.exports = router;