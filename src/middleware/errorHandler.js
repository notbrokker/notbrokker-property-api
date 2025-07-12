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