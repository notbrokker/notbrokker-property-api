// src/middleware/pdfMiddleware.js
const { logInfo, logWarn, logError } = require('../utils/logger');
const { ErrorFactory } = require('../utils/errors');

/**
 * Middleware específico para el servicio de generación de PDFs
 */

/**
 * Rate limiting específico para PDFs (más restrictivo)
 * Limita a 5 PDFs por hora por IP
 */
const rateLimitMiddleware = (() => {
    const requests = new Map();
    const LIMIT_PER_HOUR = 5; // Más restrictivo que Anthropic
    const HOUR_IN_MS = 60 * 60 * 1000;

    return (req, res, next) => {
        const clientIP = req.ip || req.connection.remoteAddress;
        const now = Date.now();

        // Limpiar requests antiguos
        const cutoff = now - HOUR_IN_MS;
        for (const [ip, data] of requests.entries()) {
            data.timestamps = data.timestamps.filter(timestamp => timestamp > cutoff);
            if (data.timestamps.length === 0) {
                requests.delete(ip);
            }
        }

        // Verificar límite para la IP actual
        if (!requests.has(clientIP)) {
            requests.set(clientIP, { timestamps: [] });
        }

        const clientData = requests.get(clientIP);
        const recentRequests = clientData.timestamps.filter(timestamp => timestamp > cutoff);

        if (recentRequests.length >= LIMIT_PER_HOUR) {
            logWarn('Rate limit excedido para servicio PDF', {
                ip: clientIP,
                requests: recentRequests.length,
                limit: LIMIT_PER_HOUR,
                endpoint: req.path
            });

            return res.status(429).json({
                success: false,
                error: 'Límite de generación de PDFs excedido',
                code: 'PDF_RATE_LIMIT_EXCEEDED',
                message: `Máximo ${LIMIT_PER_HOUR} PDFs por hora`,
                retryAfter: 3600,
                currentCount: recentRequests.length,
                limit: LIMIT_PER_HOUR,
                resetTime: new Date(now + HOUR_IN_MS).toISOString(),
                help: {
                    message: 'Los PDFs requieren recursos intensivos y tienen límite estricto',
                    suggestions: [
                        'Usa el endpoint /preview para validaciones rápidas',
                        'Considera generar PDFs solo para decisiones finales',
                        'Usa quality=medium o low para reducir tiempo de procesamiento'
                    ]
                }
            });
        }

        // Registrar el request actual
        clientData.timestamps.push(now);
        requests.set(clientIP, clientData);

        // Headers informativos
        res.setHeader('X-PDF-RateLimit-Limit', LIMIT_PER_HOUR);
        res.setHeader('X-PDF-RateLimit-Remaining', LIMIT_PER_HOUR - recentRequests.length - 1);
        res.setHeader('X-PDF-RateLimit-Reset', Math.ceil((now + HOUR_IN_MS) / 1000));

        next();
    };
})();

/**
 * Middleware de validación de contenido específico para PDFs
 */
const contentValidationMiddleware = (req, res, next) => {
    if (req.method === 'POST' && req.body) {
        const { analysisData, propertyUrl, options } = req.body;

        // Validar tamaño de payload (PDFs pueden ser pesados)
        const bodySize = JSON.stringify(req.body).length;
        const MAX_BODY_SIZE = 10 * 1024 * 1024; // 10MB

        if (bodySize > MAX_BODY_SIZE) {
            logWarn('Payload muy grande para PDF', { 
                bodySize: `${Math.round(bodySize / 1024)}KB`,
                maxAllowed: `${Math.round(MAX_BODY_SIZE / 1024)}KB`,
                ip: req.ip 
            });

            return res.status(413).json({
                success: false,
                error: 'Datos demasiado extensos para generación PDF',
                code: 'PDF_PAYLOAD_TOO_LARGE',
                bodySize: `${Math.round(bodySize / 1024)}KB`,
                maxAllowed: `${Math.round(MAX_BODY_SIZE / 1024)}KB`,
                help: {
                    message: 'Reduce el tamaño de los datos de análisis',
                    suggestions: [
                        'Elimina campos innecesarios del analysisData',
                        'Usa datos resumidos en lugar de completos',
                        'Considera dividir en múltiples PDFs'
                    ]
                }
            });
        }

        // Validar estructura mínima
        if (!analysisData && !propertyUrl) {
            return res.status(400).json({
                success: false,
                error: 'Se requiere analysisData o propertyUrl',
                code: 'PDF_MISSING_DATA',
                help: {
                    message: 'Para generar PDF necesitas datos de análisis o URL de propiedad',
                    examples: {
                        withAnalysisData: '{ "analysisData": {...}, "options": {...} }',
                        withPropertyUrl: '{ "propertyUrl": "https://...", "options": {...} }'
                    }
                }
            });
        }

        // Validar opciones de PDF si existen
        if (options) {
            if (options.quality && !['low', 'medium', 'high'].includes(options.quality)) {
                return res.status(400).json({
                    success: false,
                    error: 'Opción de calidad inválida',
                    code: 'PDF_INVALID_QUALITY',
                    received: options.quality,
                    valid: ['low', 'medium', 'high']
                });
            }

            if (options.device && !['desktop', 'tablet', 'mobile'].includes(options.device)) {
                return res.status(400).json({
                    success: false,
                    error: 'Tipo de dispositivo inválido',
                    code: 'PDF_INVALID_DEVICE',
                    received: options.device,
                    valid: ['desktop', 'tablet', 'mobile']
                });
            }

            // Validar filename si se proporciona
            if (options.filename) {
                const invalidChars = /[<>:"/\\|?*]/g;
                if (invalidChars.test(options.filename)) {
                    return res.status(400).json({
                        success: false,
                        error: 'Nombre de archivo inválido',
                        code: 'PDF_INVALID_FILENAME',
                        filename: options.filename,
                        help: 'El nombre no debe contener: < > : " / \\ | ? *'
                    });
                }
            }
        }
    }

    next();
};

/**
 * Middleware de logging específico para PDFs
 */
const pdfLoggingMiddleware = (req, res, next) => {
    const startTime = Date.now();
    const requestId = `pdf_${startTime}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Agregar requestId al request
    req.pdfRequestId = requestId;
    req.pdfStartTime = startTime;

    // Determinar tipo de operación PDF
    const operationType = req.path.includes('preview') ? 'preview' :
                         req.path.includes('batch') ? 'batch' :
                         req.path.includes('template') ? 'template' :
                         req.path.includes('validate') ? 'validation' : 'generation';

    logInfo('📄 PDF Service Request iniciado', {
        requestId,
        operationType,
        method: req.method,
        path: req.path,
        ip: req.ip,
        userAgent: req.get('User-Agent')?.substring(0, 100),
        bodySize: req.body ? JSON.stringify(req.body).length : 0,
        hasAnalysisData: !!(req.body?.analysisData),
        hasPropertyUrl: !!(req.body?.propertyUrl),
        quality: req.body?.options?.quality || 'default',
        timestamp: new Date().toISOString()
    });

    // Interceptar respuesta para logging
    if (!res.pdfIntercepted) {
        res.pdfIntercepted = true;
        
        const originalSend = res.send;
        res.send = function(data) {
            const endTime = Date.now();
            const duration = endTime - startTime;

            let responseSize = 0;
            let success = res.statusCode < 400;
            let isPDFResponse = res.get('Content-Type') === 'application/pdf';

            try {
                if (isPDFResponse && Buffer.isBuffer(data)) {
                    responseSize = data.length;
                } else if (typeof data === 'string') {
                    responseSize = Buffer.byteLength(data, 'utf8');
                } else if (data) {
                    responseSize = JSON.stringify(data).length;
                }
            } catch (error) {
                responseSize = 0;
            }

            const logData = {
                requestId,
                operationType,
                statusCode: res.statusCode,
                success,
                duration: `${duration}ms`,
                responseType: isPDFResponse ? 'PDF Binary' : 'JSON',
                responseSize: isPDFResponse ? `${Math.round(responseSize / 1024)}KB` : `${responseSize} bytes`,
                endpoint: req.path,
                method: req.method
            };

            if (isPDFResponse && success) {
                // Log específico para PDFs generados exitosamente
                logInfo('📄 PDF generado exitosamente', {
                    ...logData,
                    sizeMB: Math.round(responseSize / (1024 * 1024) * 100) / 100,
                    pages: res.get('X-PDF-Pages') || 'Unknown',
                    processingTime: res.get('X-Processing-Time') || duration + 'ms',
                    quality: req.body?.options?.quality || 'default'
                });
            } else {
                logInfo('📄 PDF Service Request completado', logData);
            }

            return originalSend.call(this, data);
        };
    }

    next();
};

/**
 * Middleware de timeout específico para PDFs (más largo)
 */
const timeoutMiddleware = (timeoutMs = 180000) => { // 3 minutos para PDFs
    return (req, res, next) => {
        const timeout = setTimeout(() => {
            if (!res.headersSent) {
                logError('Timeout en PDF Service', {
                    requestId: req.pdfRequestId,
                    timeout: timeoutMs,
                    path: req.path,
                    method: req.method,
                    operationType: req.path.includes('preview') ? 'preview' : 'generation'
                });

                res.status(408).json({
                    success: false,
                    error: 'Tiempo de generación de PDF agotado',
                    code: 'PDF_TIMEOUT',
                    message: 'La generación del PDF tardó demasiado tiempo',
                    timeout: `${timeoutMs / 1000} segundos`,
                    help: {
                        message: 'Los PDFs pueden tardar hasta 3 minutos en generarse',
                        suggestions: [
                            'Intenta con quality=medium o low',
                            'Usa el endpoint /preview para validaciones rápidas',
                            'Verifica que los datos del análisis no sean excesivamente grandes'
                        ]
                    },
                    requestId: req.pdfRequestId,
                    timestamp: new Date().toISOString()
                });
            }
        }, timeoutMs);

        // Limpiar timeout cuando la respuesta se envía
        const originalSend = res.send;
        res.send = function(data) {
            clearTimeout(timeout);
            return originalSend.call(this, data);
        };

        res.on('finish', () => {
            clearTimeout(timeout);
        });

        next();
    };
};

/**
 * Middleware de headers de seguridad específicos para PDF
 */
const securityHeadersMiddleware = (req, res, next) => {
    // Headers específicos para el servicio PDF
    res.setHeader('X-Service', 'PDFGeneratorService');
    res.setHeader('X-API-Version', '1.0.0');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    
    // Cache control específico para PDFs
    if (req.path.includes('generate') || req.path.includes('preview')) {
        res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
    }

    // Headers específicos para respuestas PDF
    if (req.path.includes('generate') && req.method === 'POST') {
        res.setHeader('X-PDF-Service', 'NotBrokker Premium Reports');
        res.setHeader('X-PDF-Version', 'v4.0');
    }

    next();
};

/**
 * Middleware de métricas de performance para PDFs
 */
const performanceMiddleware = (req, res, next) => {
    const startTime = process.hrtime.bigint();
    const startMemory = process.memoryUsage();
    
    if (!res.pdfPerformanceIntercepted) {
        res.pdfPerformanceIntercepted = true;
        
        const originalSend = res.send;
        res.send = function(data) {
            const endTime = process.hrtime.bigint();
            const endMemory = process.memoryUsage();
            
            const durationNs = endTime - startTime;
            const durationMs = Number(durationNs) / 1000000;
            const memoryDelta = endMemory.rss - startMemory.rss;

            // Headers de performance específicos para PDF
            res.setHeader('X-PDF-Response-Time', `${durationMs.toFixed(2)}ms`);
            res.setHeader('X-PDF-Memory-Used', `${Math.round(memoryDelta / 1024 / 1024)}MB`);
            res.setHeader('X-PDF-Process-Memory', `${Math.round(endMemory.rss / 1024 / 1024)}MB`);
            
            // Log métricas si es generación de PDF
            if (req.path.includes('generate') || req.path.includes('preview')) {
                logInfo('📊 PDF Performance metrics', {
                    requestId: req.pdfRequestId,
                    duration: `${durationMs.toFixed(2)}ms`,
                    memoryDelta: `${Math.round(memoryDelta / 1024 / 1024)}MB`,
                    totalMemory: `${Math.round(endMemory.rss / 1024 / 1024)}MB`,
                    endpoint: req.path,
                    statusCode: res.statusCode,
                    operationType: req.path.includes('preview') ? 'preview' : 'generation'
                });
            }

            return originalSend.call(this, data);
        };
    }

    next();
};

/**
 * Middleware compuesto para el servicio PDF
 */
const pdfMiddleware = {
    // Middleware individual
    rateLimit: rateLimitMiddleware,
    contentValidation: contentValidationMiddleware,
    logging: pdfLoggingMiddleware,
    timeout: timeoutMiddleware,
    securityHeaders: securityHeadersMiddleware,
    performance: performanceMiddleware,

    // Middleware combinado para usar en las rutas
    basic: [
        securityHeadersMiddleware,
        pdfLoggingMiddleware,
        performanceMiddleware
    ],

    // Middleware estándar (sin rate limiting)
    standard: [
        securityHeadersMiddleware,
        pdfLoggingMiddleware,
        performanceMiddleware,
        contentValidationMiddleware
    ],

    // Middleware para endpoints principales (con rate limiting y timeout)
    protected: [
        securityHeadersMiddleware,
        rateLimitMiddleware,
        pdfLoggingMiddleware,
        performanceMiddleware,
        contentValidationMiddleware,
        timeoutMiddleware(180000) // 3 minutos para generación PDF
    ],

    // Middleware para previews (timeout más corto)
    preview: [
        securityHeadersMiddleware,
        pdfLoggingMiddleware,
        performanceMiddleware,
        contentValidationMiddleware,
        timeoutMiddleware(60000) // 1 minuto para previews
    ]
};

module.exports = pdfMiddleware;