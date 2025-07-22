// src/config/security.js
/**
 * Configuraciones de seguridad centralizadas
 */

/**
 * Configuración segura de CORS
 */
const getCorsConfig = () => {
    const allowedOrigins = process.env.ALLOWED_ORIGINS ? 
        process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim()) : 
        ['http://localhost:3000', 'http://localhost:3001'];

    return {
        origin: (origin, callback) => {
            // Permitir requests sin origin (como Postman, apps móviles)
            if (!origin) return callback(null, true);
            
            if (allowedOrigins.includes(origin)) {
                callback(null, true);
            } else {
                console.warn('🚨 CORS: Origen bloqueado:', origin);
                callback(new Error('Acceso denegado por política CORS'));
            }
        },
        methods: ['GET', 'POST'],
        allowedHeaders: [
            'Content-Type', 
            'Authorization',
            'X-API-Key',
            'X-Requested-With'
        ],
        credentials: true,
        optionsSuccessStatus: 200 // Para IE11
    };
};

/**
 * Headers de seguridad básicos
 */
const getSecurityHeaders = () => ({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()'
});

module.exports = {
    getCorsConfig,
    getSecurityHeaders
};