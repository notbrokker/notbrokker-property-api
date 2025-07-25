// src/utils/logger.js
const winston = require('winston');
const path = require('path');


// src/utils/logger.js (AGREGAR al inicio del archivo existente)

/**
 * ✅ NUEVO: Función para sanitizar datos sensibles en logs
 */
const sanitizeSensitiveData = (data) => {
    if (!data || typeof data !== 'object') {
        return data;
    }

    // Palabras clave que indican información sensible
    const sensitiveKeys = [
        'password', 'pass', 'pwd', 'secret', 'token', 'key', 'auth',
        'api_key', 'apikey', 'api-key', 'anthropic_api_key', 
        'claude_api_key', 'authorization', 'bearer'
    ];

    const sanitized = Array.isArray(data) ? [] : {};

    for (const [key, value] of Object.entries(data)) {
        const keyLower = key.toLowerCase();
        
        // Verificar si la clave es sensible
        const isSensitiveKey = sensitiveKeys.some(sensitive => 
            keyLower.includes(sensitive)
        );

        if (isSensitiveKey) {
            // Redactar información sensible
            if (typeof value === 'string' && value.length > 0) {
                sanitized[key] = value.length > 8 ? 
                    `${value.substring(0, 4)}***REDACTED***` : 
                    '***REDACTED***';
            } else {
                sanitized[key] = '***REDACTED***';
            }
        } else if (value && typeof value === 'object') {
            // Recursivo para objetos anidados
            sanitized[key] = sanitizeSensitiveData(value);
        } else {
            sanitized[key] = value;
        }
    }

    return sanitized;
};

/**
 * ✅ NUEVO: Wrapper seguro para logging
 */
const createSecureLogger = (originalLogFunction) => {
    return (message, data = {}) => {
        try {
            const sanitizedData = sanitizeSensitiveData(data);
            return originalLogFunction(message, sanitizedData);
        } catch (error) {
            // Fallback en caso de error en sanitización
            return originalLogFunction(message, { 
                _sanitizationError: 'Error sanitizando datos',
                _originalDataType: typeof data 
            });
        }
    };
};

// Crear formato personalizado para logs
const customFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
        let log = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
        
        // Agregar metadata si existe
        if (Object.keys(meta).length > 0) {
            log += ` ${JSON.stringify(meta)}`;
        }
        
        // Agregar stack trace si es un error
        if (stack) {
            log += `\n${stack}`;
        }
        
        return log;
    })
);

// Configuración del logger con manejo de errores mejorado
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'debug', // Mostrar más logs en desarrollo
    format: customFormat,
    defaultMeta: { 
        service: 'property-scraper',
        version: '2.2.0-pdf-premium'
    },
    transports: [
        // Log de errores
        new winston.transports.File({ 
            filename: path.join(__dirname, '../../logs', 'error.log'), 
            level: 'error',
            handleExceptions: false,
            handleRejections: false
        }),
        
        // Log combinado
        new winston.transports.File({ 
            filename: path.join(__dirname, '../../logs', 'combined.log'),
            handleExceptions: false,
            handleRejections: false
        })
    ],
    exitOnError: false
});

// Siempre mostrar en consola para desarrollo (forzado)
const consoleTransport = new winston.transports.Console({
    level: 'debug', // Mostrar todos los niveles
    format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
    ),
    handleExceptions: false,
    handleRejections: false,
    silent: false
});

// Manejar errores del transport de consola
consoleTransport.on('error', (error) => {
    // Silenciar errores EPIPE para evitar bucles
    if (error.code !== 'EPIPE') {
        console.error('Console transport error:', error.message);
    }
});

logger.add(consoleTransport);

// Función helper para logging con contexto
const log = (level, message, data = null) => {
    const logData = {
        timestamp: new Date().toISOString(),
        ...(data && { data })
    };
    
    logger[level](message, logData);
};

// ✅ MODIFICAR: Aplicar sanitización a todas las funciones de log existentes
const logInfo = createSecureLogger(logger.info.bind(logger));
const logError = createSecureLogger(logger.error.bind(logger));
const logWarn = createSecureLogger(logger.warn.bind(logger));
const logDebug = createSecureLogger(logger.debug.bind(logger));

// Manejo global de excepciones no capturadas para evitar bucles EPIPE
process.on('uncaughtException', (error) => {
    // Evitar bucles infinitos con errores EPIPE del propio logger
    if (error.code === 'EPIPE' || error.message.includes('write EPIPE')) {
        return; // Silenciar errores EPIPE
    }
    
    try {
        // Usar el logger principal pero solo file transports para evitar EPIPE
        logger.error('Excepción no capturada', {
            error: error.message,
            critical: true
        });
    } catch (loggingError) {
        // Si falla el logging, no hacer nada para evitar bucles
    }
});

process.on('unhandledRejection', (reason) => {
    // Evitar bucles con errores de logging
    if (reason && reason.code === 'EPIPE') {
        return;
    }
    
    try {
        logger.error('Promise rechazada no manejada', {
            reason: reason,
            critical: true
        });
    } catch (loggingError) {
        // Si falla el logging, no hacer nada para evitar bucles
    }
});

module.exports = {
    logger,
    logInfo,
    logError, 
    logWarn,
    logDebug,
    sanitizeSensitiveData // Exportar para uso manual si es necesario
};