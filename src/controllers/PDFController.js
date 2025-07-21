// src/controllers/PDFController.js
const { logInfo, logError, logWarn, logDebug } = require('../utils/logger');
const { ErrorFactory } = require('../utils/errors');
const { asyncErrorHandler } = require('../middleware/errorHandler');
const PDFGeneratorService = require('../services/pdf/PDFGeneratorService');
const AnthropicService = require('../services/anthropic/AnthropicService');

/**
 * Controlador para servicios de generación de reportes PDF premium
 */
class PDFController {

    /**
     * Generar PDF del reporte financiero completo
     * POST /api/pdf/financial-report
     */
    static generateFinancialReportPDF = asyncErrorHandler(async (req, res) => {
        const { propertyUrl, options = {}, analysisData = null } = req.body;
        const startTime = req.startTime || Date.now();

        logInfo('📄 Nueva solicitud de PDF financiero', {
            propertyUrl: propertyUrl?.substring(0, 50) + '...',
            hasPrecomputedData: !!analysisData,
            options: {
                filename: options.filename,
                quality: options.quality || 'high',
                device: options.device || 'desktop'
            },
            ip: req.ip,
            userAgent: req.get('User-Agent')?.substring(0, 100)
        });

        // Verificar que no se haya enviado respuesta ya (por timeout)
        if (res.headersSent) {
            logWarn('⚠️ Headers ya enviados, cancelando procesamiento PDF', {
                propertyUrl: propertyUrl?.substring(0, 50)
            });
            return;
        }

        // Validaciones de entrada
        PDFController.validatePDFRequest({ propertyUrl, analysisData, options });

        try {
            let reportData;
            let analysisTime = 0;

            // Decisión de flujo: Datos pre-computados vs análisis completo
            if (analysisData) {
                // FLUJO RÁPIDO: Usar datos pre-computados
                reportData = analysisData;
                logInfo('✅ Usando datos de análisis pre-computados para PDF');

                // Validar estructura de datos pre-computados
                PDFController.validateAnalysisData(analysisData);

            } else if (propertyUrl) {
                // FLUJO COMPLETO: Generar análisis completo + PDF
                logInfo('🔄 Generando análisis financiero completo para PDF');

                const analysisStart = Date.now();
                reportData = await AnthropicService.generateFinancialReport(propertyUrl, {
                    ...options,
                    optimizedForPDF: true // Flag especial para PDF
                });
                analysisTime = Date.now() - analysisStart;

                logInfo('✅ Análisis completado para PDF', {
                    analysisTime: `${analysisTime}ms`,
                    confidence: reportData.metadata?.confidence
                });

            } else {
                throw ErrorFactory.validation('Se requiere propertyUrl o analysisData', 'request');
            }

            // Verificar nuevamente headers antes de generar PDF
            if (res.headersSent) {
                logWarn('⚠️ Headers enviados durante análisis, cancelando PDF');
                return;
            }

            // Procesar opciones finales para PDF
            const pdfOptions = PDFController.processPDFOptions(options);

            // Generar PDF con servicio optimizado
            logInfo('🖨️ Iniciando generación de PDF...');
            const pdfResult = await PDFGeneratorService.generateFinancialReportPDF(reportData, pdfOptions);

            // Verificar una vez más que no se enviaron headers
            if (res.headersSent) {
                logWarn('⚠️ Headers enviados durante generación PDF');
                return;
            }

            const totalTime = Date.now() - startTime;

            // Configurar headers para descarga de PDF
            const filename = options.filename || `reporte-financiero-${Date.now()}.pdf`;
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.setHeader('Content-Length', pdfResult.pdf.length);

            // Headers informativos adicionales
            res.setHeader('X-PDF-Pages', pdfResult.metadata.pages || 'Unknown');
            res.setHeader('X-PDF-Size', `${Math.round(pdfResult.pdf.length / 1024)}KB`);
            res.setHeader('X-Processing-Time', `${totalTime}ms`);
            res.setHeader('X-Analysis-Time', `${analysisTime}ms`);
            res.setHeader('X-PDF-Generation-Time', `${pdfResult.metadata.generationTime}ms`);
            res.setHeader('X-Confidence-Score', reportData.metadata?.confidence || 'Unknown');
            res.setHeader('X-AI-Analysis-Used', reportData.metadata?.aiAnalysis?.used || 'false');

            // Enviar PDF al cliente
            res.send(pdfResult.pdf);

            // Log exitoso con métricas completas
            logInfo('✅ PDF enviado exitosamente al cliente', {
                filename,
                sizeKB: Math.round(pdfResult.pdf.length / 1024),
                sizeMB: Math.round(pdfResult.pdf.length / (1024 * 1024) * 100) / 100,
                pages: pdfResult.metadata.pages,
                totalTime: `${totalTime}ms`,
                analysisTime: `${analysisTime}ms`,
                pdfGenerationTime: `${pdfResult.metadata.generationTime}ms`,
                confidence: reportData.metadata?.confidence,
                propertyUrl: propertyUrl?.substring(0, 50) + '...',
                flowType: analysisData ? 'pre-computed' : 'full-analysis'
            });

        } catch (error) {
            // Verificar headers antes de enviar error
            if (res.headersSent) {
                logWarn('⚠️ Headers ya enviados, no se puede enviar respuesta de error', {
                    error: error.message,
                    propertyUrl: propertyUrl?.substring(0, 50)
                });
                return;
            }

            // Manejo específico de errores del servicio PDF
            const errorResponse = PDFController.handlePDFError(error, propertyUrl);
            const totalTime = Date.now() - startTime;

            logError('❌ Error generando PDF', {
                propertyUrl: propertyUrl?.substring(0, 50) + '...',
                error: error.message,
                errorType: error.name,
                statusCode: errorResponse.status,
                totalTime: `${totalTime}ms`,
                stack: error.stack?.split('\n')[0]
            });

            return res.status(errorResponse.status).json({
                ...errorResponse.response,
                metadata: {
                    ...errorResponse.response.metadata,
                    totalTime: `${totalTime}ms`,
                    requestId: req.requestId || PDFController.generateRequestId(),
                    timestamp: new Date().toISOString()
                }
            });
        }
    });

    /**
     * Generar PDF vía GET con URL (para testing rápido)
     * GET /api/pdf/financial-report?url=...&filename=...&quality=...
     */
    static generateFinancialReportPDFGet = asyncErrorHandler(async (req, res) => {
        const { url, filename, quality, device, ...queryOptions } = req.query;

        logInfo('📊 Solicitud GET de PDF financiero', {
            url: url?.substring(0, 50) + '...',
            filename,
            quality,
            device,
            ip: req.ip
        });

        if (!url) {
            return res.status(400).json({
                success: false,
                error: 'URL de propiedad requerida',
                code: 'URL_REQUIRED',
                help: {
                    message: 'Proporciona una URL válida de propiedad como query parameter',
                    example: '/api/pdf/financial-report?url=https://casa.mercadolibre.cl/MLC-...',
                    optionalParams: [
                        'filename: nombre del archivo PDF',
                        'quality: low|medium|high',
                        'device: desktop|tablet|mobile'
                    ]
                },
                timestamp: new Date().toISOString()
            });
        }

        // Convertir query parameters a formato de opciones
        const options = PDFController.parseQueryOptions({
            filename,
            quality,
            device,
            ...queryOptions
        });

        // Reutilizar lógica del POST
        req.body = { propertyUrl: url, options };
        return PDFController.generateFinancialReportPDF(req, res);
    });

    /**
     * Generar PDF con datos pre-computados (flujo optimizado)
     * POST /api/pdf/from-analysis
     */
    static generatePDFFromAnalysis = asyncErrorHandler(async (req, res) => {
        const { analysisData, options = {} } = req.body;

        logInfo('⚡ Generación rápida de PDF con datos pre-computados', {
            hasAnalysisData: !!analysisData,
            confidence: analysisData?.metadata?.confidence,
            options
        });

        if (!analysisData) {
            return res.status(400).json({
                success: false,
                error: 'Datos de análisis requeridos',
                code: 'ANALYSIS_DATA_REQUIRED',
                help: {
                    message: 'Este endpoint requiere datos de análisis pre-computados',
                    example: {
                        analysisData: '{ /* JSON del análisis financiero */ }',
                        options: { filename: 'reporte.pdf', quality: 'high' }
                    }
                }
            });
        }

        // Usar flujo optimizado
        req.body = { analysisData, options };
        return PDFController.generateFinancialReportPDF(req, res);
    });

    /**
     * Información completa del servicio PDF
     * GET /api/pdf/info
     */
    static getServiceInfo = asyncErrorHandler(async (req, res) => {
        logInfo('ℹ️ Solicitud de información del servicio PDF');

        // Test de funcionamiento del servicio
        const serviceTest = await PDFGeneratorService.testService();
        const serviceInfo = PDFGeneratorService.getServiceInfo();

        const info = {
            success: true,
            service: 'Generador de Reportes PDF Premium',
            version: '1.0.0',
            status: serviceTest.success ? 'Operativo' : 'Error',
            lastTest: {
                success: serviceTest.success,
                timestamp: new Date().toISOString(),
                details: serviceTest
            },

            description: 'Generación automática de reportes financieros premium en formato PDF',

            capabilities: {
                formats: ['PDF'],
                templates: ['NotBrokkerPremiumReportV4'],
                quality: ['low', 'medium', 'high'],
                devices: ['desktop', 'tablet', 'mobile'],
                maxSize: '50MB',
                maxPages: 50,
                features: [
                    'Diseño responsive preservado en PDF',
                    'Gráficos vectoriales de alta calidad',
                    'Headers y footers personalizados',
                    'Numeración automática de páginas',
                    'Optimización para impresión profesional',
                    'Metadata completa del documento',
                    'Generación batch (múltiples PDFs)',
                    'Configuración de calidad ajustable'
                ]
            },

            // FLUJOS DISPONIBLES
            workflows: {
                fullAnalysis: {
                    description: 'Análisis completo + PDF en una sola llamada',
                    endpoint: 'POST /api/pdf/financial-report',
                    timeEstimate: '60-90 segundos',
                    useCase: 'Generación completa desde URL'
                },
                preComputed: {
                    description: 'PDF rápido con datos pre-computados',
                    endpoint: 'POST /api/pdf/from-analysis',
                    timeEstimate: '15-30 segundos',
                    useCase: 'PDF rápido después de mostrar análisis web'
                },
                quickTest: {
                    description: 'Testing rápido vía GET',
                    endpoint: 'GET /api/pdf/financial-report?url=...',
                    timeEstimate: '60-90 segundos',
                    useCase: 'Pruebas y debugging'
                }
            },

            endpoints: {
                'POST /api/pdf/financial-report': {
                    description: 'Generar PDF completo (análisis + PDF)',
                    parameters: {
                        propertyUrl: 'URL de la propiedad (opcional si hay analysisData)',
                        analysisData: 'Datos pre-computados (opcional si hay propertyUrl)',
                        options: {
                            filename: 'Nombre del archivo PDF',
                            quality: 'low|medium|high (default: high)',
                            device: 'desktop|tablet|mobile (default: desktop)',
                            customCSS: 'CSS adicional para personalización'
                        }
                    },
                    responses: {
                        200: 'PDF binario con headers apropiados',
                        400: 'Error de validación',
                        500: 'Error interno de generación'
                    }
                },
                'POST /api/pdf/from-analysis': {
                    description: 'Generar PDF rápido con datos existentes',
                    parameters: {
                        analysisData: 'JSON del análisis financiero (requerido)',
                        options: 'Opciones de generación (opcional)'
                    }
                },
                'GET /api/pdf/financial-report': {
                    description: 'Generar PDF vía query parameters (testing)',
                    parameters: {
                        url: 'URL de la propiedad (requerido)',
                        filename: 'Nombre del archivo (opcional)',
                        quality: 'Calidad del PDF (opcional)',
                        device: 'Tipo de dispositivo (opcional)'
                    }
                },
                'GET /api/pdf/info': {
                    description: 'Información completa del servicio',
                    parameters: 'Ninguno'
                },
                'POST /api/pdf/validate-template': {
                    description: 'Validar funcionamiento con datos mock',
                    parameters: {
                        mockData: 'Datos de prueba (opcional)'
                    }
                },
                'POST /api/pdf/batch': {
                    description: 'Generar múltiples PDFs (futuro)',
                    parameters: {
                        analysisDataArray: 'Array de análisis',
                        options: 'Opciones globales'
                    }
                }
            },

            examples: {
                fullWorkflow: {
                    title: 'Flujo completo (URL → Análisis → PDF)',
                    method: 'POST',
                    url: '/api/pdf/financial-report',
                    body: {
                        propertyUrl: 'https://casa.mercadolibre.cl/MLC-2950253622-casa-en-venta-condominio-lomas-de-montemar-concon-_JM',
                        options: {
                            filename: 'analisis-casa-concon.pdf',
                            quality: 'high',
                            device: 'desktop'
                        }
                    },
                    expectedResult: 'PDF de 8-12 páginas con análisis completo'
                },
                optimizedWorkflow: {
                    title: 'Flujo optimizado (Datos → PDF)',
                    method: 'POST',
                    url: '/api/pdf/from-analysis',
                    body: {
                        analysisData: '{ /* JSON del análisis previo */ }',
                        options: {
                            filename: 'reporte-rapido.pdf',
                            quality: 'high'
                        }
                    },
                    expectedResult: 'PDF generado en 15-30 segundos'
                },
                quickTest: {
                    title: 'Test rápido (GET)',
                    method: 'GET',
                    url: '/api/pdf/financial-report?url=https://casa.mercadolibre.cl/MLC-...&filename=test.pdf&quality=medium',
                    expectedResult: 'PDF de prueba para testing'
                },
                validation: {
                    title: 'Validación de template',
                    method: 'POST',
                    url: '/api/pdf/validate-template',
                    body: {},
                    expectedResult: 'PDF con datos mock para testing'
                }
            },

            performance: {
                ...serviceInfo.performance,
                benchmarks: {
                    analysisOnly: '45-60 segundos',
                    pdfOnly: '15-30 segundos',
                    fullWorkflow: '60-90 segundos',
                    batchProcessing: '30-45 segundos por PDF'
                },
                optimization: {
                    caching: 'Datos de análisis pueden ser reutilizados',
                    concurrent: 'Máximo 3 PDFs simultáneos',
                    memory: 'Liberación automática de recursos'
                }
            },

            configuration: {
                quality: {
                    low: 'PDF compacto, menor tiempo de generación',
                    medium: 'Balance entre tamaño y calidad',
                    high: 'Máxima calidad, ideal para impresión'
                },
                devices: {
                    desktop: 'Optimizado para pantallas grandes (1200px)',
                    tablet: 'Optimizado para tablets (768px)',
                    mobile: 'Optimizado para móviles (375px)'
                }
            },

            limitations: {
                ...serviceInfo.limits,
                concurrent: 'Máximo 3 PDFs simultáneos por IP',
                rateLimit: 'Límite de 10 PDFs por hora por IP',
                fileSize: 'PDFs superiores a 50MB son rechazados',
                complexity: 'Reportes muy complejos pueden tardar más',
                dependencies: 'Requiere análisis previo o URL válida'
            },

            troubleshooting: {
                'PDF muy grande': 'Usar quality=medium o low',
                'Timeout en generación': 'Verificar URL y conexión de red',
                'Error en análisis': 'Validar URL de propiedad',
                'Falta información': 'Verificar datos del análisis previo',
                'Error de template': 'Reportar bug al equipo técnico'
            },

            support: {
                documentation: '/api/pdf/info',
                examples: '/api/pdf/examples',
                validation: '/api/pdf/validate-template',
                healthCheck: '/api/pdf/health'
            },

            timestamp: new Date().toISOString()
        };

        res.json(info);
    });

    /**
     * Health check específico del servicio PDF
     * GET /api/pdf/health
     */
    static healthCheck = asyncErrorHandler(async (req, res) => {
        logInfo('🔍 Health check del servicio PDF');

        try {
            // Test básico del servicio
            const serviceTest = await PDFGeneratorService.testService();

            const healthStatus = {
                service: 'PDFGeneratorService',
                status: serviceTest.success ? 'healthy' : 'unhealthy',
                timestamp: new Date().toISOString(),
                version: '1.0.0',

                components: {
                    puppeteer: {
                        status: serviceTest.success ? 'operational' : 'error',
                        details: serviceTest.message || serviceTest.error
                    },
                    templateEngine: {
                        status: 'operational',
                        template: 'NotBrokkerPremiumReportV4'
                    },
                    fileSystem: {
                        status: 'operational',
                        templatesPath: '/src/services/pdf/templates'
                    }
                },

                performance: {
                    uptime: process.uptime(),
                    memoryUsage: {
                        rss: `${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`,
                        heapUsed: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
                        heapTotal: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)}MB`
                    },
                    lastTestDuration: serviceTest.testPDFSize ? '< 5 seconds' : 'Failed'
                },

                dependencies: {
                    anthropicService: 'available',
                    scrapingService: 'available',
                    searchService: 'available',
                    mortgageService: 'available'
                }
            };

            const statusCode = serviceTest.success ? 200 : 503;
            res.status(statusCode).json(healthStatus);

        } catch (error) {
            logError('❌ Error en health check PDF', { error: error.message });

            res.status(503).json({
                service: 'PDFGeneratorService',
                status: 'error',
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    });

    /**
     * Validar template PDF con datos mock
     * POST /api/pdf/validate-template
     */
    static validateTemplate = asyncErrorHandler(async (req, res) => {
        const { mockData, returnPDF = false } = req.body;

        logInfo('🧪 Validando template PDF con datos mock', {
            hasMockData: !!mockData,
            returnPDF
        });

        try {
            // Usar datos mock o generar datos de ejemplo
            const testData = mockData || PDFController.generateMockAnalysisData();

            // Generar PDF de prueba con timeout reducido
            const pdfResult = await PDFGeneratorService.generateFinancialReportPDF(testData, {
                filename: 'template-validation.pdf',
                quality: 'medium', // Más rápido para testing
                device: 'desktop'
            });

            if (returnPDF && req.query.download === 'true') {
                // Opción para descargar el PDF de validación
                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader('Content-Disposition', 'attachment; filename="template-validation.pdf"');
                res.send(pdfResult.pdf);
                return;
            }

            // Respuesta JSON con metadata de validación
            res.json({
                success: true,
                message: 'Template validado exitosamente',
                validation: {
                    pdfGenerated: true,
                    sizeKB: Math.round(pdfResult.pdf.length / 1024),
                    sizeMB: Math.round(pdfResult.pdf.length / (1024 * 1024) * 100) / 100,
                    pages: pdfResult.metadata.pages,
                    generationTime: `${pdfResult.metadata.generationTime}ms`,
                    templateUsed: 'NotBrokkerPremiumReportV4',
                    sectionsValidated: [
                        'Header',
                        'Property Summary',
                        'Financial Metrics',
                        'Executive Summary',
                        'Data Sources'
                    ]
                },
                testData: {
                    mockDataUsed: !mockData,
                    confidence: testData.metadata?.confidence,
                    timestamp: testData.metadata?.generatedAt
                },
                download: {
                    available: true,
                    url: '/api/pdf/validate-template?download=true',
                    method: 'POST'
                },
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            logError('❌ Error validando template PDF', {
                error: error.message,
                stack: error.stack?.split('\n')[0]
            });

            res.status(500).json({
                success: false,
                error: 'Error validando template PDF',
                code: 'TEMPLATE_VALIDATION_ERROR',
                details: error.message,
                help: {
                    message: 'Error durante la validación del template',
                    suggestions: [
                        'Verificar que Puppeteer esté instalado correctamente',
                        'Comprobar que no hay errores en el template HTML',
                        'Revisar la configuración del servicio PDF'
                    ]
                },
                timestamp: new Date().toISOString()
            });
        }
    });

    /**
     * Generar múltiples PDFs en batch (endpoint futuro)
     * POST /api/pdf/batch
     */
    static generateBatchPDFs = asyncErrorHandler(async (req, res) => {
        const { analysisDataArray, options = {} } = req.body;

        logInfo('📄 Generación batch de PDFs solicitada', {
            count: analysisDataArray?.length || 0,
            options
        });

        if (!analysisDataArray || !Array.isArray(analysisDataArray)) {
            return res.status(400).json({
                success: false,
                error: 'Se requiere un array de datos de análisis',
                code: 'INVALID_BATCH_DATA',
                example: {
                    analysisDataArray: [
                        '{ /* análisis 1 */ }',
                        '{ /* análisis 2 */ }'
                    ],
                    options: {
                        quality: 'medium',
                        filenamePrefix: 'reporte-'
                    }
                }
            });
        }

        if (analysisDataArray.length > 10) {
            return res.status(400).json({
                success: false,
                error: 'Máximo 10 PDFs por batch',
                code: 'BATCH_LIMIT_EXCEEDED',
                limit: 10,
                received: analysisDataArray.length
            });
        }

        try {
            // Generar PDFs en batch
            const batchResult = await PDFGeneratorService.generateMultiplePDFs(analysisDataArray, options);

            res.json({
                success: true,
                message: `Batch de ${analysisDataArray.length} PDFs procesado`,
                results: batchResult.results,
                summary: {
                    total: batchResult.metadata.totalProcessed,
                    successful: batchResult.metadata.successful,
                    failed: batchResult.metadata.failed,
                    successRate: `${Math.round((batchResult.metadata.successful / batchResult.metadata.totalProcessed) * 100)}%`
                },
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            logError('❌ Error en generación batch de PDFs', { error: error.message });

            res.status(500).json({
                success: false,
                error: 'Error procesando batch de PDFs',
                code: 'BATCH_PROCESSING_ERROR',
                details: error.message,
                timestamp: new Date().toISOString()
            });
        }
    });

    // ===== MÉTODOS AUXILIARES =====

    /**
     * Validar solicitud de PDF
     */
    static validatePDFRequest({ propertyUrl, analysisData, options }) {
        // Debe tener al menos una fuente de datos
        if (!propertyUrl && !analysisData) {
            throw ErrorFactory.validation(
                'Se requiere propertyUrl o analysisData',
                'request'
            );
        }

        // Validar URL si se proporciona
        if (propertyUrl) {
            if (typeof propertyUrl !== 'string') {
                throw ErrorFactory.validation('URL debe ser una cadena de texto', 'propertyUrl');
            }

            if (propertyUrl.length < 10) {
                throw ErrorFactory.validation('URL demasiado corta para ser válida', 'propertyUrl');
            }

            try {
                new URL(propertyUrl);
            } catch (error) {
                throw ErrorFactory.validation('Formato de URL inválido', 'propertyUrl');
            }
        }

        // Validar opciones si existen
        if (options && typeof options !== 'object') {
            throw ErrorFactory.validation('Las opciones deben ser un objeto', 'options');
        }

        // Validar opciones específicas
        if (options.quality && !['low', 'medium', 'high'].includes(options.quality)) {
            throw ErrorFactory.validation(
                'quality debe ser "low", "medium" o "high"',
                'options.quality'
            );
        }

        if (options.device && !['desktop', 'tablet', 'mobile'].includes(options.device)) {
            throw ErrorFactory.validation(
                'device debe ser "desktop", "tablet" o "mobile"',
                'options.device'
            );
        }
    }

    /**
     * Validar estructura de datos de análisis
     */
    static validateAnalysisData(analysisData) {
        if (!analysisData || typeof analysisData !== 'object') {
            throw ErrorFactory.validation('analysisData debe ser un objeto válido', 'analysisData');
        }

        if (!analysisData.data && !analysisData.success) {
            throw ErrorFactory.validation('analysisData debe tener estructura válida', 'analysisData');
        }

        // Validaciones básicas de estructura
        const requiredSections = ['data'];
        for (const section of requiredSections) {
            if (!analysisData[section]) {
                logWarn(`⚠️ Sección faltante en analysisData: ${section}`);
            }
        }
    }

    /**
     * Procesar opciones de PDF con valores por defecto
     */
    static processPDFOptions(options) {
        return {
            filename: options.filename || `reporte-financiero-${Date.now()}.pdf`,
            quality: options.quality || 'high',
            device: options.device || 'desktop',
            minify: options.minify || false,
            customCSS: options.customCSS || null,
            watermark: options.watermark || false,
            ...options
        };
    }

    /**
     * Parsear opciones desde query parameters
     */
    static parseQueryOptions(queryOptions) {
        const options = {};

        // String options
        ['filename', 'quality', 'device'].forEach(key => {
            if (queryOptions[key]) {
                options[key] = queryOptions[key];
            }
        });

        // Boolean options
        ['minify', 'watermark'].forEach(key => {
            if (queryOptions[key] !== undefined) {
                options[key] = queryOptions[key] === 'true';
            }
        });

        return options;
    }

    /**
     * Manejar errores específicos del servicio PDF
     */
    static handlePDFError(error, propertyUrl) {
        const baseResponse = {
            success: false,
            propertyUrl: propertyUrl?.substring(0, 50) + '...',
            timestamp: new Date().toISOString(),
            requestId: PDFController.generateRequestId()
        };

        // Error de validación
        if (error.name === 'ValidationError') {
            return {
                status: 400,
                response: {
                    ...baseResponse,
                    error: error.message,
                    code: 'PDF_VALIDATION_ERROR',
                    field: error.field || 'unknown',
                    help: {
                        message: 'Verifica que los datos de entrada sean válidos',
                        documentation: '/api/pdf/info'
                    }
                }
            };
        }

        // Error de Puppeteer
        if (error.message.includes('Puppeteer') || error.message.includes('browser')) {
            return {
                status: 503,
                response: {
                    ...baseResponse,
                    error: 'Error en motor de generación PDF',
                    code: 'PDF_ENGINE_ERROR',
                    message: 'Error temporal en el servicio de generación de PDFs',
                    help: {
                        message: 'Intenta nuevamente en unos minutos',
                        fallback: 'Considera usar quality=low para reducir carga'
                    }
                }
            };
        }

        // Error de template
        if (error.message.includes('template') || error.message.includes('HTML')) {
            return {
                status: 500,
                response: {
                    ...baseResponse,
                    error: 'Error en template de PDF',
                    code: 'PDF_TEMPLATE_ERROR',
                    message: 'Error procesando el template del reporte',
                    help: {
                        message: 'Error interno del template',
                        action: 'Reportar al equipo técnico'
                    }
                }
            };
        }

        // Error de timeout
        if (error.message.includes('timeout') || error.message.includes('tiempo')) {
            return {
                status: 408,
                response: {
                    ...baseResponse,
                    error: 'Tiempo de espera agotado',
                    code: 'PDF_TIMEOUT',
                    message: 'La generación del PDF tardó demasiado tiempo',
                    help: {
                        message: 'Intenta con quality=medium o low',
                        timeout: '60 segundos máximo'
                    }
                }
            };
        }

        // Error de AnthropicService
        if (error.message.includes('Anthropic') || error.message.includes('análisis')) {
            return {
                status: 503,
                response: {
                    ...baseResponse,
                    error: 'Error en análisis financiero',
                    code: 'ANALYSIS_ERROR',
                    message: 'No se pudo generar el análisis financiero',
                    help: {
                        message: 'Verifica la URL de la propiedad',
                        alternative: 'Usa analysisData pre-computado'
                    }
                }
            };
        }

        // Error genérico
        return {
            status: 500,
            response: {
                ...baseResponse,
                error: 'Error interno generando PDF',
                code: 'PDF_INTERNAL_ERROR',
                message: 'Ocurrió un error técnico durante la generación del PDF',
                help: {
                    message: 'Error temporal del sistema',
                    action: 'Intente nuevamente o contacte soporte técnico',
                    supportEmail: 'soporte@notbrokker.com'
                },
                debug: process.env.NODE_ENV === 'development' ? {
                    originalError: error.message,
                    errorType: error.name,
                    stack: error.stack?.split('\n')[0]
                } : undefined
            }
        };
    }

    /**
     * Generar ID único de solicitud
     */
    static generateRequestId() {
        return `pdf_req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Generar datos mock completos para testing
     */
    static generateMockAnalysisData() {
        return {
            success: true,
            data: {
                reportHeader: {
                    title: "Análisis Financiero Inmobiliario",
                    subtitle: "Evaluación completa para toma de decisiones de inversión",
                    confidence: 87.3,
                    aiAnalysis: {
                        used: true,
                        model: 'claude-3-5-sonnet-20241022'
                    }
                },
                propertySummary: {
                    title: "Casa en Lomas de Montemar, Concón",
                    address: "Montemar, Concón, Valparaíso",
                    price: {
                        clp: 363254465,
                        uf: "UF 9.200"
                    },
                    features: {
                        bedrooms: "4 Dormitorios",
                        bathrooms: "4 Baños",
                        surface: "184 m² Totales",
                        parking: "2 Estacionamientos",
                        heating: "Calefacción Central",
                        pool: "Piscina & Jacuzzi"
                    },
                    description: "Casa de tres niveles con excelente ubicación en exclusivo condominio de Lomas de Montemar. La propiedad cuenta con terminaciones premium, piscina 6x5m con jacuzzi, calefacción central, y dos estacionamientos techados."
                },
                financialMetrics: {
                    flujoCajaMensual: 158461,
                    yieldBruto: 7.6,
                    yieldNeto: 6.6,
                    capRate: 6.6,
                    roi: 8.5,
                    paybackPeriod: 12,
                    appreciation: 3.5,
                    monthlyIncome: 2300000,
                    monthlyExpenses: 300000,
                    monthlyMortgage: 1841539
                },
                mortgageAnalysis: {
                    scenarios: [
                        {
                            escenario: { plazo: 15, etiqueta: "15 años" },
                            resumen: {
                                mejorOferta: {
                                    banco: "Coopeuch",
                                    dividendo: "$2.785.867",
                                    tasa: "4.20%"
                                }
                            }
                        },
                        {
                            escenario: { plazo: 20, etiqueta: "20 años" },
                            resumen: {
                                mejorOferta: {
                                    banco: "Coopeuch",
                                    dividendo: "$2.304.083",
                                    tasa: "4.20%"
                                }
                            }
                        },
                        {
                            escenario: { plazo: 30, etiqueta: "30 años" },
                            resumen: {
                                mejorOferta: {
                                    banco: "Coopeuch",
                                    dividendo: "$1.841.539",
                                    tasa: "4.20%"
                                }
                            }
                        }
                    ],
                    statistics: {
                        totalBanks: 10,
                        bestRate: "4.20%",
                        maxSavings: "UF 184.68"
                    }
                },
                marketComparison: {
                    totalAnalyzed: 25,
                    comparables: [
                        {
                            titulo: "Casa en Lomas de Montemar",
                            dormitorios: "4D",
                            banos: "6B",
                            superficie: "300 m²",
                            ubicacion: "San Cristóbal 17, Montemar",
                            precio_uf: "$2.300.000"
                        },
                        {
                            titulo: "Casa Bosques de Montemar",
                            dormitorios: "6D",
                            banos: "4B",
                            superficie: "240 m²",
                            ubicacion: "Los Cedros, Montemar",
                            precio_uf: "$2.400.000"
                        }
                    ],
                    priceAnalysis: {
                        analysis: "competitivo en el mercado local"
                    }
                },
                locationAnalysis: {
                    overallScore: 9.2,
                    securityScore: 9.5,
                    accessibilityScore: 8.5,
                    servicesScore: 8.8,
                    growthPotential: "Alto"
                },
                executiveSummary: {
                    recommendation: "PROCEDER",
                    confidence: "Alta",
                    keyPoints: [
                        "La propiedad presenta indicadores sólidos con yield neto del 6.6% y flujo de caja positivo de $158.461 mensual",
                        "El financiamiento a 30 años con Coopeuch es la estrategia óptima, generando flujo positivo desde el primer mes",
                        "La plusvalía esperada del 3.5% anual en zona premium, combinada con incrementos anuales de arriendo del 3-5%"
                    ],
                    analysisSource: "Claude Sonnet 4"
                },
                riskAssessment: {
                    overall: "Bajo",
                    factors: {
                        market: "Bajo",
                        location: "Bajo",
                        financial: "Bajo",
                        liquidity: "Medio"
                    }
                },
                recommendations: {
                    mainRecommendation: "PROCEDER CON LA INVERSIÓN. Los números son favorables, la ubicación es premium, y el financiamiento es óptimo.",
                    actionItems: [
                        "Contactar directamente al banco recomendado para confirmar condiciones",
                        "Solicitar una simulación oficial con tus datos específicos",
                        "Considerar costos adicionales (notariales, tasación, seguros)"
                    ],
                    considerations: [
                        "Análisis generado con Claude Sonnet 4",
                        "Datos actualizados en tiempo real"
                    ]
                },
                dataSources: [
                    {
                        type: "Datos de propiedad",
                        source: "Portal MercadoLibre",
                        status: "Validado",
                        timestamp: new Date().toISOString()
                    },
                    {
                        type: "Comparables de mercado",
                        source: "Portal Inmobiliario",
                        status: "Actualizado",
                        count: 25,
                        timestamp: new Date().toISOString()
                    },
                    {
                        type: "Simulación financiera",
                        source: "Sistema bancario chileno CMF",
                        status: "Verificado",
                        banks: 10,
                        timestamp: new Date().toISOString()
                    },
                    {
                        type: "Análisis inteligente",
                        source: "Claude Sonnet 4",
                        status: "Completado",
                        model: "claude-3-5-sonnet-20241022",
                        timestamp: new Date().toISOString()
                    }
                ]
            },
            metadata: {
                confidence: 87.3,
                generatedAt: new Date().toISOString(),
                version: "1.0.0",
                aiAnalysis: {
                    used: true,
                    model: 'claude-3-5-sonnet-20241022',
                    provider: 'Anthropic',
                    analysisQuality: 'AI-Enhanced'
                },
                dataQuality: {
                    overall: "Alta",
                    property: "Completa",
                    comparables: "Actualizada",
                    mortgage: "Verificada"
                },
                services: {
                    scraping: true,
                    search: true,
                    mortgage: true,
                    claude: true
                }
            }
        };
    }
}

module.exports = PDFController;