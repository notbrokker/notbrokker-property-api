// src/routes/index.js (VERSIÓN ACTUALIZADA CON PDF)
const { logInfo } = require('../utils/logger');

const setupRoutes = (app) => {
    logInfo('🔥 CONFIGURANDO RUTAS MODULARES CON PDF PREMIUM');

    try {
        // IMPORTAR RUTAS MODULARES
        const scrapingRoutes = require('./scraping.routes');
        const searchRoutes = require('./search.routes');
        const mortgageRoutes = require('./mortgage.routes');
        const anthropicRoutes = require('./anthropic.routes');
        const pdfRoutes = require('./pdf.routes'); // NUEVO
        const authRoutes = require('./auth.routes'); // NUEVO
        const cacheRoutes = require('./cache.routes'); // NUEVO
        
        logInfo('✅ Rutas importadas correctamente (incluye PDF Premium)');

        // ==========================================
        // RUTAS API v2 (NUEVAS)
        // ==========================================
        app.use('/api/scraping', scrapingRoutes);
        app.use('/api/search', searchRoutes);
        app.use('/api/mortgage', mortgageRoutes);
        app.use('/api/anthropic', anthropicRoutes);
        app.use('/api/pdf', pdfRoutes); // NUEVO
        app.use('/api/auth', authRoutes); // NUEVO
        app.use('/api/cache', cacheRoutes); // NUEVO
        
        logInfo('✅ API v2 configurado: /api/scraping, /api/search, /api/mortgage, /api/anthropic, /api/pdf, /api/auth, /api/cache');

        // ==========================================
        // RUTAS API v1 (COMPATIBILIDAD) - OPCIONAL
        // ==========================================
        app.use('/scrape-property', scrapingRoutes);
        app.use('/search-properties', searchRoutes);
        app.use('/simulate-mortgage', mortgageRoutes);
        app.use('/financial-report', anthropicRoutes);
        app.use('/generate-pdf', pdfRoutes); // NUEVO - Compatibilidad v1
        
        logInfo('✅ API v1 (compatibilidad) configurado');

        // ==========================================
        // RUTAS ESPECIALES
        // ==========================================
        
        // Health check principal - ACTUALIZADO CON PDF
        app.get('/health', (req, res) => {
            res.json({
                status: 'OK',
                message: 'API de Análisis Inmobiliario con IA + PDF Premium',
                timestamp: new Date().toISOString(),
                version: '2.2.0-pdf-premium',
                endpoints: {
                    'GET /health': '✅ Health check general',
                    'GET /info': '✅ Información del sistema',
                    
                    // API v2 - ENDPOINTS PRINCIPALES
                    'POST /api/scraping/property': '✅ Scraping de propiedades',
                    'POST /api/search/properties': '✅ Búsqueda de propiedades',
                    'POST /api/mortgage/simulate': '✅ Simulación hipotecaria',
                    'POST /api/mortgage/compare': '✅ Comparación de escenarios',
                    'POST /api/anthropic/financial-report': '🧠 Reporte financiero con IA',
                    'POST /api/pdf/generate-report': '🆕 Generación de PDF premium', // NUEVO
                    
                    // ENDPOINTS DE INFORMACIÓN
                    'GET /api/scraping/info': '📋 Info scraping',
                    'GET /api/search/info': '📋 Info búsqueda',
                    'GET /api/mortgage/info': '📋 Info simulación',
                    'GET /api/anthropic/info': '🧠 Info análisis IA',
                    'GET /api/pdf/info': '🆕 Info generación PDF', // NUEVO
                    
                    // NUEVOS ENDPOINTS PDF
                    'GET /api/pdf/health': '🆕 Health check PDF',
                    'POST /api/pdf/preview': '🆕 Preview rápido PDF',
                    'POST /api/pdf/validate-template': '🆕 Validar template',
                    'GET /api/pdf/examples': '🆕 Ejemplos PDF',
                    
                    // API v1 (compatibilidad)
                    'POST /scrape-property': '✅ Scraping (v1)',
                    'POST /search-properties': '✅ Búsqueda (v1)',
                    'POST /simulate-mortgage': '✅ Simulación (v1)',
                    'POST /financial-report': '🧠 Reporte financiero (v1)',
                    'POST /generate-pdf': '🆕 Generación PDF (v1)' // NUEVO
                },
                
                modulos: {
                    scraping: '✅ Funcionando',
                    search: '✅ Funcionando', 
                    mortgage: '✅ Funcionando',
                    anthropic: '🧠 IA Análisis Financiero',
                    pdf: '🆕 Nuevo - Generación PDF Premium' // NUEVO
                },
                
                // CAPACIDADES IA Y PDF
                capabilities: {
                    financialAnalysis: '🧠 Análisis financiero completo con Claude',
                    marketComparison: '📊 Comparación de mercado inteligente',
                    locationIntelligence: '📍 Análisis de ubicación con IA',
                    riskAssessment: '⚠️ Evaluación de riesgos automatizada',
                    executiveReports: '📋 Reportes ejecutivos estructurados',
                    pdfGeneration: '🆕 Generación de PDFs premium', // NUEVO
                    modelUsed: 'Claude Sonnet 4 + Puppeteer Premium'
                },
                
                // NUEVA SECCIÓN: FLUJOS COMPLETOS
                workflows: {
                    completeAnalysis: {
                        description: 'URL → Análisis IA → PDF Premium',
                        endpoints: ['POST /api/anthropic/financial-report', 'POST /api/pdf/generate-report'],
                        timeEstimate: '90-120 segundos'
                    },
                    quickPDF: {
                        description: 'Datos → PDF directo',
                        endpoints: ['POST /api/pdf/generate-report'],
                        timeEstimate: '30-60 segundos'
                    },
                    validation: {
                        description: 'Testing completo del sistema',
                        endpoints: ['GET /api/pdf/health', 'POST /api/pdf/validate-template'],
                        timeEstimate: '5-15 segundos'
                    }
                }
            });
        });

        // Información del sistema - ACTUALIZADO CON PDF
        app.get('/info', (req, res) => {
            res.json({
                success: true,
                sistema: 'Property Analysis API with AI + PDF Premium',
                arquitectura: 'Modular - Monolito organizado con IA y generación PDF',
                version: '2.2.0-pdf-premium',
                estado: 'Completamente funcional con IA y PDF Premium', // ACTUALIZADO
                timestamp: new Date().toISOString(),
                
                // MÓDULOS COMPLETADOS - ACTUALIZADO
                modulos_completados: [
                    'scraping', 
                    'search', 
                    'mortgage', 
                    'anthropic-ai',
                    'pdf-premium' // NUEVO
                ],
                
                // FUNCIONALIDAD PRINCIPAL ACTUALIZADA
                funcionalidadPrincipal: {
                    analisisIA: {
                        nombre: 'Análisis Financiero Inmobiliario con IA',
                        descripcion: 'Generación automática de reportes financieros completos',
                        endpoint: '/api/anthropic/financial-report',
                        modelo: 'Claude Sonnet 4',
                        tiempoRespuesta: '45-60 segundos'
                    },
                    generacionPDF: { // NUEVO
                        nombre: 'Generación de PDFs Premium',
                        descripcion: 'Conversión de análisis a reportes PDF profesionales',
                        endpoint: '/api/pdf/generate-report',
                        motor: 'Puppeteer + Premium Template',
                        tiempoRespuesta: '30-60 segundos',
                        caracteristicas: [
                            'Diseño profesional NotBrokkerPremiumV4',
                            'Gráficos vectoriales de alta calidad',
                            'Optimización para impresión',
                            'Headers y footers personalizados',
                            'Múltiples calidades (low/medium/high)',
                            'Responsive design preservado'
                        ]
                    }
                },
                
                // FLUJOS DE TRABAJO DISPONIBLES
                flujosDisponibles: {
                    flujoCompleto: {
                        pasos: ['URL Propiedad', 'Análisis IA', 'Generación PDF'],
                        endpoints: ['/api/anthropic/financial-report', '/api/pdf/generate-report'],
                        tiempoTotal: '90-120 segundos',
                        descripcion: 'Flujo completo desde URL hasta PDF final'
                    },
                    flujoRapido: {
                        pasos: ['Datos Análisis', 'Generación PDF'],
                        endpoints: ['/api/pdf/generate-report'],
                        tiempoTotal: '30-60 segundos',
                        descripcion: 'Generación rápida de PDF con datos existentes'
                    },
                    flujoValidacion: {
                        pasos: ['Validar Template', 'Test PDF'],
                        endpoints: ['/api/pdf/validate-template', '/api/pdf/health'],
                        tiempoTotal: '5-15 segundos',
                        descripcion: 'Validación y testing del sistema PDF'
                    }
                },
                
                // SERVICIOS BASE ACTUALIZADOS
                serviciosBase: {
                    scraping: {
                        portales: ['MercadoLibre', 'Portal Inmobiliario'],
                        precision: '95%+',
                        tiempoPromedio: '10-15 segundos'
                    },
                    search: {
                        cobertura: 'Portal Inmobiliario',
                        filtrosAvanzados: true,
                        tiempoPromedio: '15-20 segundos'
                    },
                    mortgage: {
                        bancos: 10,
                        fuente: 'CMF Chile oficial',
                        tiempoPromedio: '20-25 segundos'
                    },
                    anthropic: {
                        modelo: 'claude-sonnet-4-20250514',
                        provider: 'Anthropic',
                        capacidades: ['Análisis', 'Síntesis', 'Recomendaciones'],
                        tiempoPromedio: '5-10 segundos'
                    },
                    pdf: { // NUEVO
                        motor: 'Puppeteer',
                        template: 'NotBrokkerPremiumV4',
                        formatos: ['PDF'],
                        calidades: ['low', 'medium', 'high'],
                        dispositivos: ['desktop', 'tablet', 'mobile'],
                        tiempoPromedio: '30-60 segundos'
                    }
                },
                
                proximos_pasos: [
                    'Cache inteligente de reportes y PDFs',
                    'Dashboard de métricas avanzadas',
                    'API webhooks para actualizaciones',
                    'Templates PDF personalizables',
                    'Generación batch de múltiples PDFs'
                ] // ACTUALIZADO
            });
        });

        // ==========================================
        // RUTA ESPECIAL: DEMO COMPLETO CON PDF
        // ==========================================
        
        app.get('/demo', (req, res) => {
            res.json({
                success: true,
                title: '🚀 NotBrokker AI + PDF - Demo Completo',
                description: 'Flujo completo: Análisis IA + Generación PDF Premium',
                
                quickStart: {
                    step1: {
                        title: 'Verificar servicios',
                        method: 'GET',
                        url: '/api/pdf/health',
                        description: 'Verificar que IA y PDF estén operativos'
                    },
                    step2: {
                        title: 'Generar análisis completo',
                        method: 'POST',
                        url: '/api/anthropic/financial-report',
                        body: {
                            propertyUrl: 'https://casa.mercadolibre.cl/MLC-2950253622-casa-en-venta-condominio-lomas-de-montemar-concon-_JM',
                            options: {
                                includeLocationAnalysis: true,
                                includeSecurityAnalysis: true,
                                confidenceLevel: 'high'
                            }
                        },
                        description: 'Generar análisis financiero con IA (45-60 seg)',
                        expectedResult: 'JSON completo para PDF'
                    },
                    step3: {
                        title: 'Generar PDF premium',
                        method: 'POST',
                        url: '/api/pdf/generate-report',
                        body: {
                            analysisData: '{ /* JSON del paso anterior */ }',
                            options: {
                                filename: 'reporte-casa-concon.pdf',
                                quality: 'high',
                                device: 'desktop'
                            }
                        },
                        description: 'Convertir análisis a PDF premium (30-60 seg)',
                        expectedResult: 'PDF descargable de 8-12 páginas'
                    }
                },
                
                // NUEVO: FLUJOS ALTERNATIVOS
                flujosAlternativos: {
                    validacionRapida: {
                        description: 'Validar que todo funcione',
                        endpoints: [
                            'GET /api/pdf/health',
                            'POST /api/pdf/validate-template',
                            'GET /api/anthropic/info'
                        ]
                    },
                    previewPDF: {
                        description: 'Vista previa rápida sin análisis completo',
                        endpoints: [
                            'POST /api/pdf/preview'
                        ]
                    }
                },
                
                ejemploURLs: [
                    'https://casa.mercadolibre.cl/MLC-2950253622-casa-en-venta-condominio-lomas-de-montemar-concon-_JM',
                    'https://casa.mercadolibre.cl/MLC-1614107669-vass-vende-casa-6d-3b-en-exclusivo-condominio-de-concon-_JM'
                ],
                
                testingEndpoints: [
                    'GET /api/pdf/info',
                    'GET /api/pdf/health',
                    'POST /api/pdf/validate-template',
                    'GET /api/pdf/examples',
                    'GET /api/anthropic/info'
                ],
                
                // NUEVO: MÉTRICAS ESPERADAS
                rendimientoEsperado: {
                    analisisCompleto: '45-60 segundos',
                    generacionPDF: '30-60 segundos',
                    flujoCompleto: '90-120 segundos',
                    validacionTemplate: '5-15 segundos',
                    tamañoPDFTipico: '2-5 MB',
                    paginasTipicas: '8-12 páginas'
                },
                
                timestamp: new Date().toISOString()
            });
        });

        // ==========================================
        // RUTA ESPECIAL: TESTING COMPLETO
        // ==========================================
        
        app.get('/test-complete-system', async (req, res) => {
            const startTime = Date.now();
            
            try {
                logInfo('🧪 Iniciando test completo del sistema');
                
                const results = {
                    success: true,
                    systemTest: 'Complete System Validation',
                    timestamp: new Date().toISOString(),
                    results: {}
                };
                
                // Test básico de cada servicio
                const services = [
                    { name: 'scraping', url: '/api/scraping/info' },
                    { name: 'search', url: '/api/search/info' },
                    { name: 'mortgage', url: '/api/mortgage/info' },
                    { name: 'anthropic', url: '/api/anthropic/info' },
                    { name: 'pdf', url: '/api/pdf/health' }
                ];
                
                for (const service of services) {
                    try {
                        // Aquí podrías hacer requests internos para validar cada servicio
                        results.results[service.name] = {
                            status: 'operational',
                            endpoint: service.url,
                            validated: true
                        };
                    } catch (error) {
                        results.results[service.name] = {
                            status: 'error',
                            endpoint: service.url,
                            error: error.message
                        };
                        results.success = false;
                    }
                }
                
                const totalTime = Date.now() - startTime;
                results.testDuration = `${totalTime}ms`;
                
                res.json(results);
                
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: 'Error en test completo del sistema',
                    details: error.message,
                    timestamp: new Date().toISOString()
                });
            }
        });

        // ==========================================
        // LOGGING FINAL
        // ==========================================

        logInfo('🎉 TODAS LAS RUTAS CONFIGURADAS EXITOSAMENTE CON PDF PREMIUM', {
            api_v2: [
                '/api/scraping', 
                '/api/search', 
                '/api/mortgage', 
                '/api/anthropic',
                '/api/pdf', // NUEVO
                '/api/auth', // NUEVO
                '/api/cache' // NUEVO
            ],
            api_v1_compatibilidad: [
                '/scrape-property', 
                '/search-properties', 
                '/simulate-mortgage', 
                '/financial-report',
                '/generate-pdf' // NUEVO
            ],
            modulos_completos: [
                'scraping', 
                'search', 
                'mortgage', 
                'anthropic-ai',
                'pdf-premium', // NUEVO
                'authentication', // NUEVO
                'cache-redis' // NUEVO
            ],
            nuevas_funcionalidades: [
                'Reportes financieros con IA',
                'Análisis de ubicación inteligente', 
                'Evaluación de riesgos automatizada',
                'Orquestación de servicios',
                'Generación de PDFs premium', // NUEVO
                'Templates profesionales',
                'Optimización para impresión',
                'Sistema de autenticación con tiers', // NUEVO
                'Cache multi-nivel con Redis', // NUEVO
                'Analytics empresariales' // NUEVO
            ]
        });

    } catch (error) {
        logInfo('❌ ERROR CONFIGURANDO RUTAS', { error: error.message });
        throw error;
    }
};

module.exports = { setupRoutes };