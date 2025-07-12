// src/utils/errors.js
/**
 * Clase de error personalizada para la aplicación
 */
class AppError extends Error {
    constructor(message, statusCode = 500, originalError = null) {
        super(message);
        
        this.name = 'AppError';
        this.statusCode = statusCode;
        this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
        this.isOperational = true; // Error operacional vs error de programación
        this.originalError = originalError;
        this.timestamp = new Date().toISOString();

        // Capturar stack trace
        Error.captureStackTrace(this, this.constructor);
    }
}

/**
 * Errores específicos del dominio
 */
class ValidationError extends AppError {
    constructor(message, field = null) {
        super(message, 400);
        this.name = 'ValidationError';
        this.field = field;
    }
}

class ScrapingError extends AppError {
    constructor(message, url = null, originalError = null) {
        super(message, 500, originalError);
        this.name = 'ScrapingError';
        this.url = url;
    }
}

class SearchError extends AppError {
    constructor(message, searchParams = null, originalError = null) {
        super(message, 500, originalError);
        this.name = 'SearchError';
        this.searchParams = searchParams;
    }
}

class MortgageError extends AppError {
    constructor(message, simulationParams = null, originalError = null) {
        super(message, 500, originalError);
        this.name = 'MortgageError';
        this.simulationParams = simulationParams;
    }
}

/**
 * Factory para crear errores comunes
 */
const ErrorFactory = {
    // Errores de validación
    validation: (message, field = null) => new ValidationError(message, field),
    
    // Errores de URL
    invalidUrl: (url) => new ValidationError(`URL inválida: ${url}`, 'url'),
    
    // Errores de scraping
    scrapingFailed: (url, originalError) => new ScrapingError(
        'Error durante el scraping de la propiedad', 
        url, 
        originalError
    ),
    
    portalNotSupported: (url) => new ScrapingError(
        'Portal no soportado para scraping', 
        url
    ),
    
    // Errores de búsqueda
    searchFailed: (params, originalError) => new SearchError(
        'Error durante la búsqueda de propiedades',
        params,
        originalError
    ),
    
    // Errores de simulación
    simulationFailed: (params, originalError) => new MortgageError(
        'Error durante la simulación hipotecaria',
        params,
        originalError
    ),
    
    // Errores de parámetros
    invalidParameters: (message) => new ValidationError(message),
    
    // Error genérico
    internal: (message, originalError = null) => new AppError(
        message || 'Error interno del servidor',
        500,
        originalError
    )
};

/**
 * Función para determinar si un error es operacional
 */
const isOperationalError = (error) => {
    if (error instanceof AppError) {
        return error.isOperational;
    }
    return false;
};

/**
 * Función para formatear errores para respuesta HTTP
 */
const formatErrorResponse = (error, includeStack = false) => {
    const response = {
        success: false,
        error: error.message,
        timestamp: error.timestamp || new Date().toISOString(),
        type: error.name || 'Error'
    };

    // Agregar información específica según el tipo de error
    if (error instanceof ValidationError && error.field) {
        response.field = error.field;
    }
    
    if (error instanceof ScrapingError && error.url) {
        response.url = error.url;
    }
    
    if (error instanceof SearchError && error.searchParams) {
        response.searchParams = error.searchParams;
    }
    
    if (error instanceof MortgageError && error.simulationParams) {
        response.simulationParams = error.simulationParams;
    }

    // Incluir stack trace solo en desarrollo
    if (includeStack && error.stack) {
        response.stack = error.stack;
    }

    return response;
};

module.exports = {
    AppError,
    ValidationError,
    ScrapingError,
    SearchError,
    MortgageError,
    ErrorFactory,
    isOperationalError,
    formatErrorResponse
};