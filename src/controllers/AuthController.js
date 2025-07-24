// src/controllers/AuthController.js
const { logInfo, logError } = require('../utils/logger');
const { authService } = require('../middleware/authMiddleware');

class AuthController {
    /**
     * POST /api/auth/token - Generar JWT Token
     */
    async generateToken(req, res) {
        try {
            logInfo('🎫 Generando JWT token', { 
                userId: req.body.userId,
                tier: req.auth.tier.name 
            });

            const { userId, email, name } = req.body;

            // Validar datos requeridos
            if (!userId) {
                return res.status(400).json({
                    success: false,
                    error: 'userId requerido',
                    message: 'Debe proporcionar un userId válido',
                    timestamp: new Date().toISOString()
                });
            }

            // Generar JWT usando la información del usuario y API key
            const tokenResult = authService.generateJWT(
                { userId, email, name },
                req.auth
            );

            if (!tokenResult.success) {
                return res.status(500).json({
                    success: false,
                    error: tokenResult.error,
                    timestamp: new Date().toISOString()
                });
            }

            // Respuesta exitosa
            res.json({
                success: true,
                token: tokenResult.token,
                expiresIn: tokenResult.expiresIn,
                user: tokenResult.user,
                apiKey: {
                    tier: req.auth.tier.name,
                    features: req.auth.features
                },
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            logError('❌ Error generando token JWT', { 
                error: error.message,
                userId: req.body.userId 
            });

            res.status(500).json({
                success: false,
                error: 'Error interno generando token',
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * GET /api/auth/info - Información de API Key y Tier
     */
    async getApiKeyInfo(req, res) {
        try {
            logInfo('ℹ️ Consultando info de API key', { 
                userId: req.auth.user.userId,
                tier: req.auth.tier.name 
            });

            const jwtToken = req.headers.authorization;
            const authInfo = authService.getAuthInfo(req.auth.apiKey, jwtToken);

            if (!authInfo.success) {
                return res.status(500).json({
                    success: false,
                    error: authInfo.error,
                    timestamp: new Date().toISOString()
                });
            }

            // Preparar respuesta con información completa
            const response = {
                success: true,
                apiKey: {
                    prefix: authInfo.apiKey.prefix,
                    tier: authInfo.apiKey.tier,
                    description: authInfo.apiKey.description,
                    rateLimit: authInfo.apiKey.rateLimit,
                    features: authInfo.apiKey.features,
                    created: authInfo.user.created
                },
                user: {
                    id: authInfo.user.userId,
                    name: authInfo.user.name,
                    email: authInfo.user.email,
                    tier: authInfo.apiKey.tier,
                    isActive: authInfo.user.isActive
                },
                authentication: {
                    hasApiKey: true,
                    hasJWT: !!authInfo.jwt,
                    jwtValid: authInfo.jwt ? authInfo.jwt.valid : false
                },
                timestamp: new Date().toISOString()
            };

            // Agregar info de JWT si está presente
            if (authInfo.jwt) {
                response.jwt = authInfo.jwt;
            }

            res.json(response);

        } catch (error) {
            logError('❌ Error obteniendo info de API key', { 
                error: error.message,
                userId: req.auth?.user?.userId 
            });

            res.status(500).json({
                success: false,
                error: 'Error interno obteniendo información',
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * GET /api/auth/me - Información del usuario autenticado (requiere JWT)
     */
    async getUserInfo(req, res) {
        try {
            logInfo('👤 Consultando info de usuario autenticado', { 
                userId: req.auth.jwt.id,
                tier: req.auth.jwt.tier 
            });

            // Preparar respuesta con información completa del usuario autenticado
            const response = {
                success: true,
                user: {
                    id: req.auth.jwt.id,
                    email: req.auth.jwt.email,
                    name: req.auth.jwt.name,
                    tier: req.auth.jwt.tier,
                    features: req.auth.jwt.features
                },
                apiKey: {
                    prefix: req.auth.jwt.apiKeyPrefix,
                    tier: req.auth.tier.name,
                    rateLimit: req.auth.rateLimit,
                    features: req.auth.features
                },
                authentication: {
                    method: 'API Key + JWT',
                    jwtValid: true,
                    apiKeyValid: true,
                    authenticatedAt: new Date().toISOString()
                },
                session: {
                    tokenType: 'JWT',
                    validFor: '24h',
                    canAccess: req.auth.features
                },
                timestamp: new Date().toISOString()
            };

            res.json(response);

        } catch (error) {
            logError('❌ Error obteniendo info de usuario', { 
                error: error.message,
                userId: req.auth?.jwt?.id 
            });

            res.status(500).json({
                success: false,
                error: 'Error interno obteniendo información de usuario',
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * GET /api/auth/stats - Estadísticas del sistema de autenticación (ENTERPRISE)
     */
    async getAuthStats(req, res) {
        try {
            logInfo('📊 Consultando estadísticas de auth', { 
                userId: req.auth.user.userId,
                tier: req.auth.tier.name 
            });

            const stats = authService.getAuthStats();

            const response = {
                success: true,
                stats: {
                    system: {
                        totalApiKeys: stats.totalApiKeys,
                        tierDistribution: stats.tierDistribution,
                        features: stats.features,
                        rateLimits: stats.rateLimits
                    },
                    runtime: {
                        uptime: process.uptime(),
                        nodeVersion: process.version,
                        platform: process.platform,
                        memoryUsage: process.memoryUsage()
                    },
                    request: {
                        authenticatedAs: req.auth.user.userId,
                        tier: req.auth.tier.name,
                        hasJWT: !!req.auth.jwt,
                        endpoint: req.originalUrl,
                        timestamp: new Date().toISOString()
                    }
                },
                timestamp: new Date().toISOString()
            };

            res.json(response);

        } catch (error) {
            logError('❌ Error obteniendo estadísticas de auth', { 
                error: error.message,
                userId: req.auth?.user?.userId 
            });

            res.status(500).json({
                success: false,
                error: 'Error interno obteniendo estadísticas',
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * POST /api/auth/verify - Verificar tokens (utilidad de testing)
     */
    async verifyTokens(req, res) {
        try {
            const { apiKey, jwtToken } = req.body;

            const results = {
                success: true,
                verification: {
                    apiKey: null,
                    jwt: null,
                    compatibility: null
                },
                timestamp: new Date().toISOString()
            };

            // Verificar API Key si se proporciona
            if (apiKey) {
                const apiKeyValidation = authService.validateApiKey(apiKey);
                results.verification.apiKey = {
                    valid: apiKeyValidation.isValid,
                    error: apiKeyValidation.error || null,
                    tier: apiKeyValidation.isValid ? apiKeyValidation.tier.name : null,
                    features: apiKeyValidation.isValid ? apiKeyValidation.features : null
                };
            }

            // Verificar JWT si se proporciona
            if (jwtToken) {
                const jwtValidation = authService.verifyJWT(jwtToken);
                results.verification.jwt = {
                    valid: jwtValidation.isValid,
                    error: jwtValidation.error || null,
                    user: jwtValidation.isValid ? jwtValidation.user : null
                };
            }

            // Verificar compatibilidad si ambos están presentes
            if (apiKey && jwtToken && 
                results.verification.apiKey.valid && 
                results.verification.jwt.valid) {
                
                const apiKeyInfo = authService.validateApiKey(apiKey);
                const jwtInfo = authService.verifyJWT(jwtToken);
                
                const compatible = apiKeyInfo.user.userId === jwtInfo.user.id;
                results.verification.compatibility = {
                    compatible,
                    message: compatible ? 
                        'API key y JWT pertenecen al mismo usuario' : 
                        'API key y JWT pertenecen a usuarios diferentes'
                };
            }

            res.json(results);

        } catch (error) {
            logError('❌ Error verificando tokens', { error: error.message });

            res.status(500).json({
                success: false,
                error: 'Error interno verificando tokens',
                timestamp: new Date().toISOString()
            });
        }
    }
}

module.exports = new AuthController();