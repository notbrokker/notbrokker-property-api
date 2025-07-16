// src/middleware/anthropicMiddleware.js
const { logInfo, logWarn, logError } = require('../utils/logger');
const { ErrorFactory } = require('../utils/errors');

/**
 * Middleware específico para el servicio Anthropic - CORREGIDO
 */

/**
 * Rate limiting para el servicio Anthropic
 * Limita a 10 requests por hora por IP
 */
const rateLimitMiddleware = (() => {
    const requests = new Map();
    const LIMIT_PER_HOUR = 10;
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
            logWarn('Rate limit excedido para servicio Anthropic', {
                ip: clientIP,
                requests: recentRequests.length,
                limit: LIMIT_PER_HOUR
            });

            return res.status(429).json({
                success: false,
                error: 'Límite de solicitudes excedido',
                code: 'RATE_LIMIT_EXCEEDED',
                message: `Máximo ${LIMIT_PER_HOUR} reportes por hora`,
                retryAfter: 3600,
                currentCount: recentRequests.length,
                limit: LIMIT_PER_HOUR,
                resetTime: new Date(now + HOUR_IN_MS).toISOString(),
                help: {
                    message: 'Los reportes financieros tienen un límite para garantizar calidad del servicio',
                    suggestion: 'Espera antes de realizar otra solicitud o considera el plan premium'
                }
            });
        }

        // Registrar el request actual
        clientData.timestamps.push(now);
        requests.set(clientIP, clientData);

        // Agregar headers informativos
        res.setHeader('X-RateLimit-Limit', LIMIT_PER_HOUR);
        res.setHeader('X-RateLimit-Remaining', LIMIT_PER_HOUR - recentRequests.length - 1);
        res.setHeader('X-RateLimit-Reset', Math.ceil((now + HOUR_IN_MS) / 1000));

        next();
    };
})();

/**
 * Middleware de validación de contenido
 */
const contentValidationMiddleware = (req, res, next) => {
    // Solo aplicar a requests POST con body
    if (req.method === 'POST' && req.body) {
        const { propertyUrl, options } = req.body;

        // Validación básica de URL
        if (propertyUrl) {
            // Verificar que no sea una URL maliciosa
            const suspiciousPatterns = [
                'javascript:',
                'data:',
                'file:',
                'ftp:',
                '<script',
                'eval(',
                'alert('
            ];

            const urlLower = propertyUrl.toLowerCase();
            for (const pattern of suspiciousPatterns) {
                if (urlLower.includes(pattern)) {
                    logWarn('URL sospechosa detectada', { 
                        url: propertyUrl,
                        ip: req.ip,
                        pattern 
                    });

                    return res.status(400).json({
                        success: false,
                        error: 'URL no válida',
                        code: 'INVALID_URL_CONTENT',
                        message: 'La URL contiene contenido no permitido'
                    });
                }
            }
        }

        // Validación de opciones
        if (options && typeof options === 'object') {
            // Verificar que las opciones no sean excesivamente grandes
            const optionsString = JSON.stringify(options);
            if (optionsString.length > 5000) {
                return res.status(400).json({
                    success: false,
                    error: 'Opciones demasiado extensas',
                    code: 'OPTIONS_TOO_LARGE',
                    message: 'Las opciones exceden el tamaño máximo permitido'
                });
            }
        }
    }

    next();
};

/**
 * Middleware de logging específico para Anthropic - CORREGIDO
 */
const anthropicLoggingMiddleware = (req, res, next) => {
    const startTime = Date.now();
    const requestId = `anthropic_${startTime}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Agregar requestId al request
    req.anthropicRequestId = requestId;
    req.startTime = startTime; // NUEVO: Agregar startTime al request

    logInfo('🤖 AnthropicService Request iniciado', {
        requestId,
        method: req.method,
        path: req.path,
        ip: req.ip,
        userAgent: req.get('User-Agent')?.substring(0, 100),
        bodySize: req.body ? JSON.stringify(req.body).length : 0,
        timestamp: new Date().toISOString()
    });

    // CORREGIDO: Interceptar la respuesta solo UNA VEZ
    if (!res.anthropicIntercepted) {
        res.anthropicIntercepted = true; // Marcar como interceptado
        
        const originalSend = res.send;
        res.send = function(data) {
            const endTime = Date.now();
            const duration = endTime - startTime;

            let responseSize = 0;
            let success = res.statusCode < 400;

            try {
                if (typeof data === 'string') {
                    responseSize = data.length;
                } else if (data) {
                    responseSize = JSON.stringify(data).length;
                }
            } catch (error) {
                responseSize = 0;
            }

            logInfo('🤖 AnthropicService Request completado', {
                requestId,
                statusCode: res.statusCode,
                success,
                duration: `${duration}ms`,
                responseSize,
                endpoint: req.path,
                method: req.method
            });

            // Si es un reporte completo, log adicional con métricas
            if (req.path.includes('financial-report') && success) {
                try {
                    const responseData = typeof data === 'string' ? JSON.parse(data) : data;
                    if (responseData?.data?.metadata) {
                        logInfo('📊 Reporte financiero generado', {
                            requestId,
                            confidence: responseData.data.metadata.confidence,
                            dataQuality: responseData.data.metadata.dataQuality?.overall,
                            servicesUsed: Object.keys(responseData.data.metadata.services || {}),
                            processingTime: duration
                        });
                    }
                } catch (error) {
                    // No hacer nada si no se puede parsear
                }
            }

            return originalSend.call(this, data);
        };
    }

    next();
};

/**
 * Middleware de timeout específico para operaciones largas - AUMENTADO
 */
const timeoutMiddleware = (timeoutMs = 180000) => { // CAMBIADO: 3 minutos en lugar de 2
    return (req, res, next) => {
        const timeout = setTimeout(() => {
            if (!res.headersSent) { // CORREGIDO: Verificar si headers ya fueron enviados
                logError('Timeout en AnthropicService', {
                    requestId: req.anthropicRequestId,
                    timeout: timeoutMs,
                    path: req.path,
                    method: req.method
                });

                res.status(408).json({
                    success: false,
                    error: 'Tiempo de espera agotado',
                    code: 'REQUEST_TIMEOUT',
                    message: 'El procesamiento del reporte tardó demasiado tiempo',
                    timeout: `${timeoutMs / 1000} segundos`,
                    help: {
                        message: 'Los reportes financieros pueden tomar hasta 3 minutos',
                        suggestion: 'Intenta nuevamente o verifica la URL de la propiedad'
                    },
                    requestId: req.anthropicRequestId
                });
            }
        }, timeoutMs);

        // CORREGIDO: Limpiar timeout cuando la respuesta se envía
        const originalSend = res.send;
        res.send = function(data) {
            clearTimeout(timeout);
            return originalSend.call(this, data);
        };

        // También limpiar timeout en caso de error
        res.on('finish', () => {
            clearTimeout(timeout);
        });

        next();
    };
};

/**
 * Middleware de headers de seguridad específicos
 */
const securityHeadersMiddleware = (req, res, next) => {
    // Headers específicos para el servicio Anthropic
    res.setHeader('X-Service', 'AnthropicService');
    res.setHeader('X-API-Version', '1.0.0');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    
    // Cache control para reportes
    if (req.path.includes('financial-report')) {
        res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
    }

    next();
};

/**
 * Middleware de métricas de performance - SIMPLIFICADO
 */
const performanceMiddleware = (req, res, next) => {
    const startTime = process.hrtime.bigint();
    
    // CORREGIDO: Interceptar solo si no ha sido interceptado
    if (!res.performanceIntercepted) {
        res.performanceIntercepted = true;
        
        const originalSend = res.send;
        res.send = function(data) {
            const endTime = process.hrtime.bigint();
            const durationNs = endTime - startTime;
            const durationMs = Number(durationNs) / 1000000;

            // Agregar headers de performance
            res.setHeader('X-Response-Time', `${durationMs.toFixed(2)}ms`);
            res.setHeader('X-Process-Memory', `${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`);
            
            // Log métricas si es un endpoint principal
            if (req.path.includes('financial-report')) {
                logInfo('⚡ Performance metrics', {
                    requestId: req.anthropicRequestId,
                    duration: `${durationMs.toFixed(2)}ms`,
                    memoryUsage: `${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`,
                    endpoint: req.path,
                    statusCode: res.statusCode
                });
            }

            return originalSend.call(this, data);
        };
    }

    next();
};

/**
 * Middleware compuesto para el servicio Anthropic - CORREGIDO
 */
const anthropicMiddleware = {
    // Middleware individual
    rateLimit: rateLimitMiddleware,
    contentValidation: contentValidationMiddleware,
    logging: anthropicLoggingMiddleware,
    timeout: timeoutMiddleware,
    securityHeaders: securityHeadersMiddleware,
    performance: performanceMiddleware,

    // Middleware combinado para usar en las rutas
    standard: [
        securityHeadersMiddleware,
        anthropicLoggingMiddleware,
        performanceMiddleware,
        contentValidationMiddleware
    ],

    // Middleware para endpoints principales (con rate limiting) - TIMEOUT AUMENTADO
    protected: [
        securityHeadersMiddleware,
        rateLimitMiddleware,
        anthropicLoggingMiddleware,
        performanceMiddleware,
        contentValidationMiddleware,
        timeoutMiddleware(180000) // CAMBIADO: 3 minutos para reportes
    ],

    // Middleware básico para endpoints informativos
    basic: [
        securityHeadersMiddleware,
        anthropicLoggingMiddleware,
        performanceMiddleware
    ]
};

module.exports = anthropicMiddleware;