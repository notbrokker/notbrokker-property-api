// src/middleware/errorHandler.js
const { logger } = require('../utils/logger');
const { isOperationalError, formatErrorResponse } = require('../utils/errors');

/**
 * Middleware centralizado para manejo de errores
 */
const errorHandler = (err, req, res, next) => {
    // Log del error con contexto completo
    const errorContext = {
        url: req.url,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        body: req.method !== 'GET' ? req.body : undefined,
        query: req.query,
        params: req.params,
        errorType: err.name || 'UnknownError',
        statusCode: err.statusCode || 500
    };

    // Log según severidad del error
    if (err.statusCode && err.statusCode < 500) {
        // Errores del cliente (4xx) - nivel warn
        logger.warn('Error del cliente', {
            error: err.message,
            ...errorContext
        });
    } else {
        // Errores del servidor (5xx) - nivel error
        logger.error('Error del servidor', {
            error: err.message,
            stack: err.stack,
            ...errorContext
        });
    }

    // Determinar si incluir stack trace
    const includeStack = process.env.NODE_ENV === 'development';
    
    // Formatear respuesta de error
    const errorResponse = formatErrorResponse(err, includeStack);
    
    // Agregar información adicional en desarrollo
    if (includeStack) {
        errorResponse.context = {
            url: req.url,
            method: req.method,
            timestamp: new Date().toISOString()
        };
    }

    // Enviar respuesta
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json(errorResponse);
};

/**
 * Middleware para manejar errores asíncronos
 * Wrapper que automáticamente pasa errores al error handler
 */
const asyncErrorHandler = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};

/**
 * Middleware para manejar rutas no encontradas
 */
const notFoundHandler = (req, res, next) => {
    const error = new Error(`Ruta no encontrada: ${req.method} ${req.url}`);
    error.statusCode = 404;
    error.name = 'NotFoundError';
    
    // Pasar al error handler
    next(error);
};

/**
 * Manejador para errores no capturados
 */
const uncaughtErrorHandler = () => {
    // Manejar excepciones no capturadas
    process.on('uncaughtException', (err) => {
        logger.error('Excepción no capturada', {
            error: err.message,
            stack: err.stack,
            critical: true
        });
        
        // En producción, cerrar el proceso gracefully
        if (process.env.NODE_ENV === 'production') {
            process.exit(1);
        }
    });

    // Manejar promesas rechazadas
    process.on('unhandledRejection', (reason, promise) => {
        logger.error('Promesa rechazada no manejada', {
            reason: reason instanceof Error ? reason.message : reason,
            stack: reason instanceof Error ? reason.stack : undefined,
            promise: promise.toString(),
            critical: true
        });
        
        // En producción, cerrar el proceso gracefully
        if (process.env.NODE_ENV === 'production') {
            process.exit(1);
        }
    });
};


module.exports = {
    errorHandler,
    asyncErrorHandler,
    notFoundHandler,
    uncaughtErrorHandler
};




// src/middleware/errorHandler.js
const { logError, logWarn } = require('../utils/logger');

/**
 * Wrapper para manejar errores asíncronos en Express
 */
const asyncErrorHandler = (fn) => {
    // Validar que fn sea una función
    if (typeof fn !== 'function') {
        throw new Error('asyncErrorHandler expects a function as argument');
    }
    
    return (req, res, next) => {
        // Asegurar que fn retorne una Promise
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};

/**
 * Middleware global de manejo de errores
 */
const globalErrorHandler = (error, req, res, next) => {
    // Si ya se enviaron headers, delegar a Express
    if (res.headersSent) {
        return next(error);
    }

    // Obtener información del request
    const requestInfo = {
        method: req.method,
        url: req.url,
        ip: req.ip || req.connection?.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        timestamp: new Date().toISOString(),
        service: 'property-scraper',
        version: '2.0.0-modular'
    };

    // Información adicional para debugging
    const errorDetails = {
        ...requestInfo,
        error: error.message,
        errorType: error.name || 'Error',
        stack: error.stack,
        statusCode: error.statusCode || 500,
        params: req.params || {},
        query: req.query || {},
        body: req.body ? (typeof req.body === 'object' ? JSON.stringify(req.body).substring(0, 500) : req.body) : null
    };

    // Determinar nivel de log según el tipo de error
    const statusCode = error.statusCode || 500;
    
    if (statusCode >= 500) {
        logError('Error del servidor', errorDetails);
    } else if (statusCode >= 400) {
        logWarn('Error del cliente', errorDetails);
    }

    // Respuestas específicas según el tipo de error
    let response = {
        success: false,
        error: 'Error interno del servidor',
        code: 'INTERNAL_SERVER_ERROR',
        timestamp: new Date().toISOString()
    };

    // Errores específicos de la aplicación
    switch (error.name) {
        case 'ValidationError':
            response = {
                success: false,
                error: 'Datos de entrada inválidos',
                code: 'VALIDATION_ERROR',
                message: error.message,
                statusCode: 400,
                timestamp: new Date().toISOString()
            };
            break;

        case 'NotFoundError':
            response = {
                success: false,
                error: error.message || 'Recurso no encontrado',
                code: 'NOT_FOUND',
                statusCode: 404,
                timestamp: new Date().toISOString(),
                help: {
                    message: 'Verifica que la URL y el método sean correctos',
                    availableEndpoints: [
                        'GET /api/health',
                        'GET /api/info',
                        'POST /api/pdf/financial-report',
                        'POST /api/pdf/generate-report',
                        'GET /api/pdf/examples'
                    ]
                }
            };
            break;

        case 'AuthenticationError':
            response = {
                success: false,
                error: 'Autenticación requerida',
                code: 'AUTHENTICATION_ERROR',
                message: error.message,
                statusCode: 401,
                timestamp: new Date().toISOString()
            };
            break;

        case 'AuthorizationError':
            response = {
                success: false,
                error: 'Acceso no autorizado',
                code: 'AUTHORIZATION_ERROR',
                message: error.message,
                statusCode: 403,
                timestamp: new Date().toISOString()
            };
            break;

        case 'RateLimitError':
            response = {
                success: false,
                error: 'Límite de solicitudes excedido',
                code: 'RATE_LIMIT_EXCEEDED',
                message: error.message,
                statusCode: 429,
                retryAfter: error.retryAfter || 3600,
                timestamp: new Date().toISOString()
            };
            break;

        case 'TimeoutError':
            response = {
                success: false,
                error: 'Tiempo de respuesta agotado',
                code: 'TIMEOUT_ERROR',
                message: error.message,
                statusCode: 408,
                timestamp: new Date().toISOString()
            };
            break;

        case 'PDFGenerationError':
            response = {
                success: false,
                error: 'Error al generar PDF',
                code: 'PDF_GENERATION_ERROR',
                message: error.message,
                statusCode: 500,
                timestamp: new Date().toISOString(),
                help: {
                    message: 'Error en la generación del PDF',
                    suggestions: [
                        'Verifica que la URL de la propiedad sea válida',
                        'Intenta con una calidad menor',
                        'Verifica los datos del análisis'
                    ]
                }
            };
            break;

        case 'NetworkError':
            response = {
                success: false,
                error: 'Error de conexión',
                code: 'NETWORK_ERROR',
                message: error.message,
                statusCode: 503,
                timestamp: new Date().toISOString()
            };
            break;

        default:
            // Error genérico del servidor
            response = {
                success: false,
                error: 'Error interno del servidor',
                code: 'INTERNAL_SERVER_ERROR',
                message: process.env.NODE_ENV === 'development' ? error.message : 'Error interno',
                statusCode: statusCode,
                timestamp: new Date().toISOString()
            };
    }

    // Agregar información adicional en modo desarrollo
    if (process.env.NODE_ENV === 'development') {
        response.debug = {
            originalError: error.message,
            stack: error.stack,
            requestId: req.requestId || 'unknown'
        };
    }

    // Enviar respuesta
    res.status(response.statusCode || 500).json(response);
};

/**
 * Middleware para manejar rutas no encontradas
 */
const notFoundHandler = (req, res, next) => {
    const error = new Error(`Ruta no encontrada: ${req.method} ${req.originalUrl}`);
    error.name = 'NotFoundError';
    error.statusCode = 404;
    next(error);
};

/**
 * Crear error personalizado
 */
const createError = (message, statusCode = 500, name = 'Error') => {
    const error = new Error(message);
    error.name = name;
    error.statusCode = statusCode;
    return error;
};

/**
 * Factory de errores comunes
 */
const ErrorFactory = {
    notFound: (message = 'Recurso no encontrado') => createError(message, 404, 'NotFoundError'),
    validation: (message = 'Datos inválidos') => createError(message, 400, 'ValidationError'),
    authentication: (message = 'Autenticación requerida') => createError(message, 401, 'AuthenticationError'),
    authorization: (message = 'Acceso no autorizado') => createError(message, 403, 'AuthorizationError'),
    rateLimit: (message = 'Límite excedido', retryAfter = 3600) => {
        const error = createError(message, 429, 'RateLimitError');
        error.retryAfter = retryAfter;
        return error;
    },
    timeout: (message = 'Tiempo agotado') => createError(message, 408, 'TimeoutError'),
    pdfGeneration: (message = 'Error al generar PDF') => createError(message, 500, 'PDFGenerationError'),
    network: (message = 'Error de conexión') => createError(message, 503, 'NetworkError'),
    internal: (message = 'Error interno') => createError(message, 500, 'InternalError')
};

module.exports = {
    asyncErrorHandler,
    globalErrorHandler,
    notFoundHandler,
    createError,
    ErrorFactory
};