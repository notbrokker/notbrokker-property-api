// src/utils/logger.js
const winston = require('winston');
const path = require('path');

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

// Configuración del logger
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: customFormat,
    defaultMeta: { 
        service: 'property-scraper',
        version: '2.0.0-modular'
    },
    transports: [
        // Log de errores
        new winston.transports.File({ 
            filename: path.join('logs', 'error.log'), 
            level: 'error',
            maxsize: 5242880, // 5MB
            maxFiles: 5
        }),
        
        // Log combinado
        new winston.transports.File({ 
            filename: path.join('logs', 'combined.log'),
            maxsize: 5242880, // 5MB
            maxFiles: 5
        })
    ],
});

// En desarrollo, también mostrar en consola
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
        )
    }));
}

// Función helper para logging con contexto
const log = (level, message, data = null) => {
    const logData = {
        timestamp: new Date().toISOString(),
        ...(data && { data })
    };
    
    logger[level](message, logData);
};

// Funciones de conveniencia
const logInfo = (message, data) => log('info', message, data);
const logError = (message, data) => log('error', message, data);
const logWarn = (message, data) => log('warn', message, data);
const logDebug = (message, data) => log('debug', message, data);

module.exports = { 
    logger, 
    log, 
    logInfo, 
    logError, 
    logWarn, 
    logDebug 
};