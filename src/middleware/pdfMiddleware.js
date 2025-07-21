// src/middleware/pdfMiddleware.js
const { logInfo, logWarn, logError } = require('../utils/logger');

/**
 * Middleware específico para el servicio de generación de PDFs - CORREGIDO
 */

/**
 * Rate limiting específico para PDFs
 */
const rateLimitMiddleware = (() => {
    const requests = new Map();
    const LIMIT_PER_HOUR = 10;
    const HOUR_IN_MS = 60 * 60 * 1000;

    return (req, res, next) => {
        const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
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
                limit: LIMIT_PER_HOUR
            });

            return res.status(429).json({
                success: false,
                error: 'Límite de generación de PDFs excedido',
                code: 'PDF_RATE_LIMIT_EXCEEDED',
                limit: LIMIT_PER_HOUR,
                retryAfter: Math.ceil((now + HOUR_IN_MS) / 1000)
            });
        }

        // Registrar request
        clientData.timestamps.push(now);
        requests.set(clientIP, clientData);

        // Headers informativos
        res.setHeader('X-PDF-RateLimit-Limit', LIMIT_PER_HOUR);
        res.setHeader('X-PDF-RateLimit-Remaining', LIMIT_PER_HOUR - recentRequests.length - 1);

        next();
    };
})();

/**
 * Middleware de validación de contenido para PDF
 */
const contentValidationMiddleware = (req, res, next) => {
    if (req.method === 'POST' && req.body) {
        const { propertyUrl, analysisData, options } = req.body;

        // Validar que haya al menos propertyUrl o analysisData
        if (!propertyUrl && !analysisData) {
            return res.status(400).json({
                success: false,
                error: 'Se requiere propertyUrl o analysisData',
                code: 'PDF_MISSING_DATA'
            });
        }

        // Validar opciones si se proporcionan
        if (options) {
            if (options.quality && !['low', 'medium', 'high'].includes(options.quality)) {
                return res.status(400).json({
                    success: false,
                    error: 'Calidad inválida',
                    code: 'PDF_INVALID_QUALITY',
                    valid: ['low', 'medium', 'high']
                });
            }

            if (options.device && !['desktop', 'tablet', 'mobile'].includes(options.device)) {
                return res.status(400).json({
                    success: false,
                    error: 'Dispositivo inválido',
                    code: 'PDF_INVALID_DEVICE',
                    valid: ['desktop', 'tablet', 'mobile']
                });
            }
        }
    }

    next();
};

/**
 * Middleware de logging para PDFs
 */
const pdfLoggingMiddleware = (req, res, next) => {
    const startTime = Date.now();
    const requestId = `pdf_${startTime}_${Math.random().toString(36).substr(2, 9)}`;
    
    req.pdfRequestId = requestId;
    req.pdfStartTime = startTime;

    logInfo('📄 PDF Service Request iniciado', {
        requestId,
        method: req.method,
        path: req.path,
        ip: req.ip,
        hasAnalysisData: !!(req.body?.analysisData),
        hasPropertyUrl: !!(req.body?.propertyUrl)
    });

    next();
};

/**
 * Middleware de timeout para PDFs
 */
const timeoutMiddleware = (timeoutMs = 300000) => {
    return (req, res, next) => {
        const timeout = setTimeout(() => {
            if (!res.headersSent) {
                logError('Timeout en PDF Service', {
                    requestId: req.pdfRequestId,
                    timeout: timeoutMs,
                    path: req.path
                });

                res.status(408).json({
                    success: false,
                    error: 'Timeout en generación de PDF',
                    code: 'PDF_TIMEOUT',
                    timeout: `${timeoutMs / 1000} segundos`,
                    requestId: req.pdfRequestId
                });
            }
        }, timeoutMs);

        const originalSend = res.send;
        res.send = function(data) {
            clearTimeout(timeout);
            return originalSend.call(this, data);
        };

        res.on('finish', () => clearTimeout(timeout));

        next();
    };
};

/**
 * Middleware de headers de seguridad
 */
const securityHeadersMiddleware = (req, res, next) => {
    res.setHeader('X-Service', 'PDFGeneratorService');
    res.setHeader('X-API-Version', '1.0.0');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    
    if (req.path.includes('generate')) {
        res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
    }

    next();
};

/**
 * Middleware de performance
 */
const performanceMiddleware = (req, res, next) => {
    const startTime = process.hrtime.bigint();
    
    if (!res.pdfPerformanceIntercepted) {
        res.pdfPerformanceIntercepted = true;
        
        const originalSend = res.send;
        res.send = function(data) {
            const endTime = process.hrtime.bigint();
            const durationMs = Number(endTime - startTime) / 1000000;

            res.setHeader('X-PDF-Response-Time', `${durationMs.toFixed(2)}ms`);
            res.setHeader('X-PDF-Process-Memory', `${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`);
            
            logInfo('📊 PDF Performance metrics', {
                requestId: req.pdfRequestId,
                duration: `${durationMs.toFixed(2)}ms`,
                endpoint: req.path,
                statusCode: res.statusCode
            });

            return originalSend.call(this, data);
        };
    }

    next();
};

/**
 * Middleware compuesto para el servicio PDF
 */
const pdfMiddleware = {
    basic: [
        securityHeadersMiddleware,
        pdfLoggingMiddleware,
        performanceMiddleware
    ],

    standard: [
        securityHeadersMiddleware,
        pdfLoggingMiddleware,
        performanceMiddleware,
        contentValidationMiddleware
    ],

    protected: [
        securityHeadersMiddleware,
        rateLimitMiddleware,
        pdfLoggingMiddleware,
        performanceMiddleware,
        contentValidationMiddleware,
        timeoutMiddleware(300000)
    ]
};

module.exports = pdfMiddleware;