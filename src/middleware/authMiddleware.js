// src/middleware/authMiddleware.js
const AuthService = require('../services/auth/AuthService');
const { logInfo, logWarning, logError } = require('../utils/logger');

const authService = new AuthService();

/**
 * Middleware para validar API Key
 */
const validateApiKey = (req, res, next) => {
    try {
        const apiKey = req.headers['x-api-key'];
        
        if (!apiKey) {
            logInfo('🔑 API key faltante', { 
                endpoint: req.originalUrl, 
                method: req.method,
                ip: req.ip 
            });
            
            return res.status(401).json({
                success: false,
                error: 'API key requerida',
                message: 'Incluye el header x-api-key con tu API key válida',
                timestamp: new Date().toISOString()
            });
        }

        const validation = authService.validateApiKey(apiKey);
        
        if (!validation.isValid) {
            logInfo('🔑 API key inválida', { 
                apiKeyPrefix: apiKey.substring(0, 12) + '...',
                endpoint: req.originalUrl,
                error: validation.error
            });
            
            return res.status(401).json({
                success: false,
                error: 'API key inválida',
                message: validation.error,
                timestamp: new Date().toISOString()
            });
        }

        // Agregar información de autenticación al request
        req.auth = {
            apiKey: apiKey,
            user: validation.user,
            tier: validation.tier,
            features: validation.features,
            rateLimit: validation.rateLimit
        };

        logInfo('🔑 API key validada', {
            userId: validation.user.userId,
            tier: validation.tier.name,
            endpoint: req.originalUrl
        });

        next();

    } catch (error) {
        logError('❌ Error en validación de API key', { 
            error: error.message,
            endpoint: req.originalUrl 
        });
        
        return res.status(500).json({
            success: false,
            error: 'Error interno de autenticación',
            timestamp: new Date().toISOString()
        });
    }
};

/**
 * Middleware para validar JWT Token (requiere API key también)
 */
const validateJWT = (req, res, next) => {
    try {
        // Primero validar API key
        if (!req.auth) {
            return res.status(401).json({
                success: false,
                error: 'Validación de API key requerida primero',
                message: 'Este endpoint requiere x-api-key válida',
                timestamp: new Date().toISOString()
            });
        }

        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            logInfo('🎫 JWT token faltante', { 
                endpoint: req.originalUrl,
                userId: req.auth.user.userId 
            });
            
            return res.status(401).json({
                success: false,
                error: 'JWT token requerido',
                message: 'Incluye el header Authorization: Bearer [token]',
                timestamp: new Date().toISOString()
            });
        }

        const token = authHeader.substring(7); // Remover 'Bearer '
        const validation = authService.verifyJWT(token);
        
        if (!validation.isValid) {
            logInfo('🎫 JWT token inválido', {
                endpoint: req.originalUrl,
                error: validation.error,
                apiKeyPrefix: req.auth.user.userId
            });
            
            return res.status(401).json({
                success: false,
                error: 'JWT token inválido',
                message: validation.error,
                timestamp: new Date().toISOString()
            });
        }

        // Verificar que el JWT tenga un tier válido y compatible
        if (!validation.user.tier) {
            logInfo('🎫 JWT sin tier válido', {
                endpoint: req.originalUrl
            });
            
            return res.status(401).json({
                success: false,
                error: 'JWT token inválido',
                message: 'Token sin información de tier válida',
                timestamp: new Date().toISOString()
            });
        }

        // Solo verificar que el tier del JWT sea compatible (no necesariamente idéntico)
        const jwtTierLevel = validation.user.tier.includes('ENTERPRISE') ? 3 : 
                            validation.user.tier.includes('PREMIUM') ? 2 : 1;
        const apiTierLevel = req.auth.tier.name.includes('ENTERPRISE') ? 3 :
                            req.auth.tier.name.includes('PREMIUM') ? 2 : 1;

        if (jwtTierLevel !== apiTierLevel) {
            logInfo('🎫 JWT/API key tier incompatible', {
                jwtTier: validation.user.tier,
                apiKeyTier: req.auth.tier.name,
                endpoint: req.originalUrl
            });
            
            return res.status(401).json({
                success: false,
                error: 'Token y API key incompatibles',
                message: 'El JWT token y la API key tienen tiers diferentes',
                timestamp: new Date().toISOString()
            });
        }

        // Agregar información JWT al request
        req.auth.jwt = validation.user;
        req.auth.jwtToken = token;

        logInfo('🎫 JWT token validado', {
            userId: validation.user.id,
            tier: validation.user.tier,
            endpoint: req.originalUrl
        });

        next();

    } catch (error) {
        logError('❌ Error en validación de JWT', { 
            error: error.message,
            endpoint: req.originalUrl 
        });
        
        return res.status(500).json({
            success: false,
            error: 'Error interno de autenticación JWT',
            timestamp: new Date().toISOString()
        });
    }
};

/**
 * Middleware para verificar tier/funcionalidad requerida
 */
const requireTier = (requiredFeature) => {
    return (req, res, next) => {
        try {
            if (!req.auth) {
                return res.status(401).json({
                    success: false,
                    error: 'Autenticación requerida',
                    timestamp: new Date().toISOString()
                });
            }

            const access = authService.hasFeatureAccess(req.auth.tier.name, requiredFeature);
            
            if (!access.hasAccess) {
                logInfo('🚫 Acceso denegado por tier', {
                    userId: req.auth.user.userId,
                    userTier: req.auth.tier.name,
                    requiredFeature,
                    endpoint: req.originalUrl
                });
                
                return res.status(403).json({
                    success: false,
                    error: 'Tier insuficiente',
                    message: `Esta operación requiere ${requiredFeature.toUpperCase()}_TIER, tu API key tiene ${req.auth.tier.name}`,
                    userTier: req.auth.tier.name,
                    requiredFeature: requiredFeature.toUpperCase() + '_TIER',
                    availableFeatures: req.auth.features,
                    timestamp: new Date().toISOString()
                });
            }

            logInfo('✅ Acceso autorizado por tier', {
                userId: req.auth.user.userId,
                tier: req.auth.tier.name,
                feature: requiredFeature,
                endpoint: req.originalUrl
            });

            next();

        } catch (error) {
            logError('❌ Error en verificación de tier', { 
                error: error.message,
                endpoint: req.originalUrl 
            });
            
            return res.status(500).json({
                success: false,
                error: 'Error interno de autorización',
                timestamp: new Date().toISOString()
            });
        }
    };
};

/**
 * Middleware combinado: API key + funcionalidad específica
 */
const requireFeature = (feature) => {
    return [validateApiKey, requireTier(feature)];
};

/**
 * Middleware combinado: API key + JWT + funcionalidad específica
 */
const requireJWTAndFeature = (feature) => {
    return [validateApiKey, validateJWT, requireTier(feature)];
};

/**
 * Middleware de rate limiting básico (simulado)
 */
const rateLimit = (req, res, next) => {
    // TODO: Implementar rate limiting real con Redis o similar
    // Por ahora solo logging
    
    if (req.auth) {
        const { requests, window } = req.auth.rateLimit;
        
        logInfo('📊 Rate limit check', {
            userId: req.auth.user.userId,
            tier: req.auth.tier.name,
            limit: `${requests}/${window}`,
            endpoint: req.originalUrl
        });
    }
    
    next();
};

module.exports = {
    validateApiKey,
    validateJWT,
    requireTier,
    requireFeature,
    requireJWTAndFeature,
    rateLimit,
    authService
};