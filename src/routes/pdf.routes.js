// src/routes/pdf.routes.js
const express = require('express');
const PDFController = require('../controllers/PDFController');
const { asyncErrorHandler } = require('../middleware/errorHandler');
const pdfMiddleware = require('../middleware/pdfMiddleware');
const { cacheForPDF } = require('../middleware/cacheMiddleware');

const router = express.Router();

// =================================
// MIDDLEWARE GLOBAL PARA PDF
// =================================

// Aplicar middleware básico a todas las rutas PDF
router.use(pdfMiddleware.basic);

// =================================
// RUTAS PRINCIPALES PDF
// =================================

/**
 * POST /api/pdf/financial-report
 * Generar PDF de reporte financiero completo con cache
 */
router.post('/financial-report', 
    cacheForPDF(), // Cache para PDFs
    pdfMiddleware.protected,
    asyncErrorHandler(PDFController.generateFinancialReportPDF)
);

/**
 * POST /api/pdf/generate-report (ALIAS para compatibilidad)
 * Redirigir a financial-report para mantener compatibilidad
 */
router.post('/generate-report', 
    cacheForPDF(), // Cache para compatibilidad
    pdfMiddleware.protected,
    asyncErrorHandler(PDFController.generateFinancialReportPDF)
);

/**
 * GET /api/pdf/financial-report
 * Generar PDF vía query parameters (para testing) con cache
 */
router.get('/financial-report', 
    cacheForPDF(), // Cache para testing
    pdfMiddleware.standard,
    asyncErrorHandler(PDFController.generateFinancialReportPDFGet)
);

/**
 * POST /api/pdf/from-analysis
 * Generar PDF con datos pre-computados (flujo optimizado) con cache
 */
router.post('/from-analysis', 
    cacheForPDF(), // Cache para PDFs optimizados
    pdfMiddleware.protected,
    asyncErrorHandler(PDFController.generatePDFFromAnalysis)
);

// =================================
// RUTAS AUXILIARES
// =================================

/**
 * GET /api/pdf/health
 * Health check específico del servicio PDF
 */
router.get('/health', 
    pdfMiddleware.basic,
    asyncErrorHandler(async (req, res) => {
        res.json({
            success: true,
            service: 'PDF Generator Service',
            status: 'healthy',
            version: '2.0.0-modular',
            timestamp: new Date().toISOString(),
            endpoints: {
                main: '/api/pdf/financial-report',
                alias: '/api/pdf/generate-report',
                optimized: '/api/pdf/from-analysis',
                testing: '/api/pdf/financial-report?url=...'
            }
        });
    })
);

/**
 * GET /api/pdf/info
 * Información del servicio PDF
 */
router.get('/info', 
    pdfMiddleware.basic,
    asyncErrorHandler(async (req, res) => {
        res.json({
            success: true,
            service: 'PDF Generator Service',
            version: '2.0.0-modular',
            description: 'Servicio de generación de reportes PDF financieros inmobiliarios',
            features: [
                'Generación de PDFs de alta calidad',
                'Análisis financiero completo',
                'Múltiples opciones de financiamiento',
                'Comparación de mercado',
                'Métricas de rentabilidad'
            ],
            endpoints: {
                generate: {
                    method: 'POST',
                    url: '/api/pdf/financial-report',
                    description: 'Generar PDF completo desde URL de propiedad'
                },
                generateAlias: {
                    method: 'POST',
                    url: '/api/pdf/generate-report',
                    description: 'Alias para compatibilidad con versiones anteriores'
                },
                optimized: {
                    method: 'POST',
                    url: '/api/pdf/from-analysis',
                    description: 'Generar PDF desde datos pre-computados'
                },
                quickTest: {
                    method: 'GET',
                    url: '/api/pdf/financial-report?url=...',
                    description: 'Generación rápida vía query parameters'
                }
            },
            rateLimit: {
                requests: 5,
                period: 'per hour',
                remaining: res.get('X-PDF-RateLimit-Remaining') || 'N/A'
            },
            timestamp: new Date().toISOString()
        });
    })
);

/**
 * POST /api/pdf/validate-template
 * Validar template de PDF
 */
router.post('/validate-template', 
    pdfMiddleware.standard,
    asyncErrorHandler(PDFController.validateTemplate)
);

/**
 * GET /api/pdf/examples
 * Ejemplos de uso del servicio PDF
 */
router.get('/examples', 
    pdfMiddleware.basic,
    asyncErrorHandler(async (req, res) => {
        res.json({
            success: true,
            service: 'PDF Generator Service',
            examples: {
                basicPDF: {
                    method: 'POST',
                    endpoint: '/api/pdf/financial-report',
                    description: 'Generar PDF desde URL de propiedad',
                    body: {
                        propertyUrl: 'https://casa.mercadolibre.cl/MLC-...',
                        options: {
                            filename: 'reporte-financiero.pdf',
                            quality: 'high',
                            device: 'desktop'
                        }
                    }
                },
                compatibilityEndpoint: {
                    method: 'POST',
                    endpoint: '/api/pdf/generate-report',
                    description: 'Endpoint de compatibilidad (mismo que financial-report)',
                    body: {
                        propertyUrl: 'https://casa.mercadolibre.cl/MLC-...',
                        options: {
                            filename: 'reporte-financiero.pdf',
                            quality: 'high'
                        }
                    }
                },
                optimizedPDF: {
                    method: 'POST',
                    endpoint: '/api/pdf/from-analysis',
                    description: 'Generar PDF desde datos pre-computados',
                    body: {
                        analysisData: {
                            property: { /* datos de propiedad */ },
                            metrics: { /* métricas calculadas */ },
                            financing: { /* opciones de financiamiento */ }
                        },
                        options: {
                            filename: 'reporte-optimizado.pdf',
                            quality: 'medium'
                        }
                    }
                },
                quickTest: {
                    method: 'GET',
                    endpoint: '/api/pdf/financial-report?url=https://casa.mercadolibre.cl/MLC-...',
                    description: 'Generación rápida para testing'
                }
            },
            qualityOptions: ['low', 'medium', 'high'],
            deviceOptions: ['desktop', 'tablet', 'mobile'],
            timestamp: new Date().toISOString()
        });
    })
);

// =================================
// COMPATIBILIDAD v1
// =================================

/**
 * Mantener compatibilidad con endpoint raíz
 */
router.post('/', 
    pdfMiddleware.protected,
    asyncErrorHandler(PDFController.generateFinancialReportPDF)
);

// =================================
// MIDDLEWARE DE ERROR ESPECÍFICO
// =================================

/**
 * Middleware de manejo de errores específico para PDF
 */
router.use((error, req, res, next) => {
    const { logError } = require('../utils/logger');
    
    logError('Error en PDF Service', {
        error: error.message,
        stack: error.stack,
        requestId: req.pdfRequestId,
        path: req.path,
        method: req.method,
        body: req.body ? JSON.stringify(req.body).substring(0, 500) : null
    });

    // Errores específicos de PDF
    if (error.name === 'PDFGenerationError') {
        return res.status(500).json({
            success: false,
            error: 'Error al generar PDF',
            code: 'PDF_GENERATION_FAILED',
            message: error.message,
            requestId: req.pdfRequestId,
            help: {
                message: 'Error interno en la generación del PDF',
                suggestions: [
                    'Verifica que la URL de la propiedad sea válida',
                    'Intenta con una calidad menor (medium o low)',
                    'Verifica que los datos del análisis estén completos'
                ]
            }
        });
    }

    // Errores de timeout
    if (error.name === 'TimeoutError') {
        return res.status(408).json({
            success: false,
            error: 'Timeout en generación de PDF',
            code: 'PDF_TIMEOUT',
            message: 'La generación del PDF tardó demasiado',
            requestId: req.pdfRequestId,
            help: {
                message: 'El procesamiento excedió el tiempo límite',
                suggestions: [
                    'Intenta nuevamente en unos minutos',
                    'Usa quality=medium para procesamiento más rápido',
                    'Verifica la conexión a internet'
                ]
            }
        });
    }

    // Error genérico
    res.status(500).json({
        success: false,
        error: 'Error interno del servidor PDF',
        code: 'PDF_INTERNAL_ERROR',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Error interno',
        requestId: req.pdfRequestId,
        timestamp: new Date().toISOString()
    });
});

module.exports = router;