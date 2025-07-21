// src/middleware/anthropicMiddleware.js
const { logInfo, logWarn, logError } = require('../utils/logger');

/**
 * Middleware específico para Anthropic - COMPLETAMENTE CORREGIDO
 */

/**
 * Rate limiting para el servicio Anthropic
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
                resetTime: new Date(now + HOUR_IN_MS).toISOString()
            });
        }

        // Registrar el request actual
        clientData.timestamps.push(now);
        requests.set(clientIP, clientData);

        // Headers informativos
        res.setHeader('X-RateLimit-Limit', LIMIT_PER_HOUR);
        res.setHeader('X-RateLimit-Remaining', LIMIT_PER_HOUR - recentRequests.length - 1);
        res.setHeader('X-RateLimit-Reset', Math.ceil((now + HOUR_IN_MS) / 1000));

        next();
    };
})();

/**
 * ✅ MIDDLEWARE DE LOGGING CORREGIDO - SIN INTERCEPTACIONES
 */
const anthropicLoggingMiddleware = (req, res, next) => {
    const startTime = Date.now();
    const requestId = `anthropic_${startTime}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Agregar al request
    req.anthropicRequestId = requestId;
    req.startTime = startTime;

    logInfo('🤖 AnthropicService Request iniciado', {
        requestId,
        method: req.method,
        path: req.path,
        ip: req.ip,
        userAgent: req.get('User-Agent')?.substring(0, 100),
        bodySize: req.body ? JSON.stringify(req.body).length : 0,
        timestamp: new Date().toISOString()
    });

    // ✅ SOLO logging al final - SIN INTERCEPTAR res.send
    res.on('finish', () => {
        const duration = Date.now() - startTime;
        logInfo('🤖 AnthropicService Request completado', {
            requestId,
            statusCode: res.statusCode,
            success: res.statusCode < 400,
            duration: `${duration}ms`,
            endpoint: req.path,
            method: req.method,
            coordinationUsed: !!req.processingActive,
            finalState: {
                headersSent: res.headersSent,
                finished: res.finished,
                statusCode: res.statusCode
            }
        });
    });

    // ✅ LOG adicional para debugging de errores
    res.on('error', (error) => {
        const duration = Date.now() - startTime;
        logError('🤖 AnthropicService Request error', error, {
            requestId,
            duration: `${duration}ms`,
            endpoint: req.path,
            method: req.method
        });
    });

    next();
};

/**
 * ✅ MIDDLEWARE DE TIMEOUT COMPLETAMENTE CORREGIDO
 * Elimina race conditions y coordina con req.processingActive
 */
const timeoutMiddleware = (timeoutMs = 240000) => { // 4 minutos
    return (req, res, next) => {
        let timeoutTriggered = false;
        
        const timeout = setTimeout(() => {
            // ✅ VERIFICACIÓN COMPLETA: Headers + processingActive + timeoutTriggered
            if (!res.headersSent && 
                !res.finished && 
                !res.destroyed && 
                !req.processingActive && 
                !timeoutTriggered) {
                
                timeoutTriggered = true;
                
                logError('Timeout en AnthropicService', {
                    requestId: req.anthropicRequestId,
                    timeout: timeoutMs,
                    path: req.path,
                    method: req.method,
                    processingActive: !!req.processingActive,
                    headersSent: res.headersSent,
                    timestamp: new Date().toISOString()
                });

                try {
                    res.status(408).json({
                        success: false,
                        error: 'Tiempo de espera agotado',
                        code: 'REQUEST_TIMEOUT',
                        message: 'El procesamiento del reporte tardó demasiado tiempo',
                        timeout: `${timeoutMs / 1000} segundos`,
                        requestId: req.anthropicRequestId,
                        metadata: {
                            timestamp: new Date().toISOString(),
                            processingTime: `${timeoutMs}ms`,
                            suggestions: [
                                'Intenta nuevamente con una URL más simple',
                                'Verifica que la URL sea accesible',
                                'Contacta soporte si el problema persiste'
                            ],
                            coordinationFlags: {
                                processingActive: !!req.processingActive,
                                timeoutTriggered: true,
                                headersSent: res.headersSent,
                                finished: res.finished,
                                destroyed: res.destroyed
                            },
                            troubleshooting: {
                                step1: 'Verifica conectividad a la URL de la propiedad',
                                step2: 'Asegúrate que la URL sea de un portal inmobiliario soportado',
                                step3: 'Contacta soporte técnico si el problema persiste'
                            }
                        }
                    });
                } catch (timeoutError) {
                    logError('Error enviando respuesta de timeout', timeoutError, {
                        requestId: req.anthropicRequestId,
                        originalTimeout: timeoutMs
                    });
                }
            } else {
                // ✅ LOG DETALLADO cuando timeout no se dispara (para debugging)
                logInfo('⏰ Timeout no disparado por coordinación activa', {
                    requestId: req.anthropicRequestId,
                    timeoutMs,
                    coordinationState: {
                        headersSent: res.headersSent,
                        finished: res.finished,
                        destroyed: res.destroyed,
                        processingActive: !!req.processingActive,
                        timeoutTriggered
                    },
                    reason: res.headersSent ? 'HEADERS_ALREADY_SENT' :
                           res.finished ? 'RESPONSE_FINISHED' :
                           res.destroyed ? 'RESPONSE_DESTROYED' :
                           req.processingActive ? 'PROCESSING_ACTIVE' :
                           timeoutTriggered ? 'TIMEOUT_ALREADY_TRIGGERED' : 'UNKNOWN'
                });
            }
        }, timeoutMs);

        // ✅ CLEANUP SIN INTERCEPTACIÓN - Solo event listeners nativos
        const cleanup = () => {
            if (!timeoutTriggered) {
                clearTimeout(timeout);
                timeoutTriggered = true;
                
                logInfo('🧹 Timeout cleanup ejecutado', {
                    requestId: req.anthropicRequestId,
                    trigger: 'response_event'
                });
            }
        };

        // Event listeners para cleanup automático - SIN INTERCEPTAR res.send
        res.on('finish', cleanup);
        res.on('close', cleanup);
        res.on('error', cleanup);

        // ✅ OPCIONAL: Cleanup manual adicional por si acaso
        res.on('end', cleanup);

        next();
    };
};




/**
 * Headers de seguridad
 */
const securityHeadersMiddleware = (req, res, next) => {
    res.setHeader('X-Service', 'AnthropicService');
    res.setHeader('X-API-Version', '1.0.0');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    
    if (req.path.includes('financial-report')) {
        res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
    }

    next();
};
/**
 * ✅ PERFORMANCE MIDDLEWARE CORREGIDO - SIN INTERCEPTACIONES
 */
const performanceMiddleware = (req, res, next) => {
    const startTime = process.hrtime.bigint();
    
    // Solo agregar headers al final - SIN interceptar
    res.on('finish', () => {
        const endTime = process.hrtime.bigint();
        const durationNs = endTime - startTime;
        const durationMs = Number(durationNs) / 1000000;

        // Agregar headers de performance si no fueron enviados
        if (!res.headersSent) {
            try {
                res.setHeader('X-Response-Time', `${durationMs.toFixed(2)}ms`);
                res.setHeader('X-Process-Memory', `${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`);
                res.setHeader('X-Request-ID', req.anthropicRequestId || 'unknown');
            } catch (headerError) {
                // Headers ya enviados, no hacer nada
                logInfo('Headers de performance no agregados (ya enviados)');
            }
        }
    });

    next();
};

/**
 * Validación de contenido
 */
const contentValidationMiddleware = (req, res, next) => {
    if (req.method === 'POST' && req.body) {
        const { propertyUrl, options } = req.body;

        if (propertyUrl) {
            const suspiciousPatterns = [
                'javascript:', 'data:', 'file:', 'ftp:', '<script', 'eval(', 'alert('
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
                        code: 'INVALID_URL_CONTENT'
                    });
                }
            }
        }

        if (options && typeof options === 'object') {
            const optionsString = JSON.stringify(options);
            if (optionsString.length > 5000) {
                return res.status(400).json({
                    success: false,
                    error: 'Opciones demasiado extensas',
                    code: 'OPTIONS_TOO_LARGE'
                });
            }
        }
    }

    next();
};

/**
 * ✅ MIDDLEWARE COMBINADO CORREGIDO
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

    // ✅ MIDDLEWARE PARA ENDPOINTS PRINCIPALES - COORDINACIÓN COMPLETA
    protected: [
        securityHeadersMiddleware,
        rateLimitMiddleware,
        anthropicLoggingMiddleware,
        performanceMiddleware,
        contentValidationMiddleware,
        timeoutMiddleware(240000) // 4 minutos con coordinación
    ],

    // Middleware básico para endpoints informativos
    basic: [
        securityHeadersMiddleware,
        anthropicLoggingMiddleware,
        performanceMiddleware
    ]
};

module.exports = anthropicMiddleware;