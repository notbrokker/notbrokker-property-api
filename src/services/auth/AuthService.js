// src/services/auth/AuthService.js
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { logInfo, logError } = require('../../utils/logger');

class AuthService {
    constructor() {
        this.JWT_SECRET = process.env.JWT_SECRET || 'notbrokker-secret-key-2024';
        this.JWT_EXPIRES_IN = '24h';
        
        // Sistema de tiers y límites
        this.TIERS = {
            FREE_TIER: {
                name: 'FREE_TIER',
                rateLimit: { requests: 10, window: '15m' },
                features: ['scraping', 'search'],
                description: 'Tier gratuito con funcionalidades básicas'
            },
            PREMIUM_TIER: {
                name: 'PREMIUM_TIER', 
                rateLimit: { requests: 100, window: '15m' },
                features: ['scraping', 'search', 'mortgage', 'anthropic', 'pdf'],
                description: 'Tier premium con IA y PDF'
            },
            ENTERPRISE_TIER: {
                name: 'ENTERPRISE_TIER',
                rateLimit: { requests: 1000, window: '15m' },
                features: ['scraping', 'search', 'mortgage', 'anthropic', 'pdf', 'cache', 'batch'],
                description: 'Tier empresarial con funcionalidades avanzadas'
            }
        };

        // Simulamos una base de datos de API keys
        this.apiKeys = new Map([
            // FREE TIER
            ['free_mde0ufw4_adc5cf27dcd6e8c9a9f2f6eb8a13e05d73cf40a03f4f40671cd7da2d8a63cf56', {
                tier: 'FREE_TIER',
                userId: 'free_user_1',
                name: 'Usuario Free 1',
                email: 'free1@notbrokker.com',
                created: new Date('2024-01-01'),
                isActive: true
            }],
            ['free_mde0ufxv_da427ed14b8c6e6b89680a60a71e4f66e70342b78c81eaa9040854e569c2bbaf', {
                tier: 'FREE_TIER',
                userId: 'free_user_2', 
                name: 'Usuario Free 2',
                email: 'free2@notbrokker.com',
                created: new Date('2024-01-02'),
                isActive: true
            }],
            
            // PREMIUM TIER
            ['pre_mde0uof8_638680b94d92c43dd3242a7266b22f756042f59672d8ddd49b6fa4ab701c244f', {
                tier: 'PREMIUM_TIER',
                userId: 'premium_user_1',
                name: 'Usuario Premium 1',
                email: 'premium1@notbrokker.com',
                created: new Date('2024-01-01'),
                isActive: true
            }],
            ['pre_mde0uofg_47f699d67457c82acb232971c647b6195cb9c70b3f76d8925d0a8efb6a0a1e33', {
                tier: 'PREMIUM_TIER',
                userId: 'premium_user_2',
                name: 'Usuario Premium 2', 
                email: 'premium2@notbrokker.com',
                created: new Date('2024-01-02'),
                isActive: true
            }],
            
            // ENTERPRISE TIER
            ['ent_mde0utgm_eff257d35eb9d826aaf39541bd932cf6c105a2a27ffcab348a1ed8288e32c0fb', {
                tier: 'ENTERPRISE_TIER',
                userId: 'enterprise_user_1',
                name: 'Usuario Enterprise 1',
                email: 'enterprise1@notbrokker.com',
                created: new Date('2024-01-01'),
                isActive: true
            }]
        ]);

        logInfo('🔐 AuthService inicializado', {
            totalApiKeys: this.apiKeys.size,
            freeTier: Array.from(this.apiKeys.values()).filter(k => k.tier === 'FREE_TIER').length,
            premiumTier: Array.from(this.apiKeys.values()).filter(k => k.tier === 'PREMIUM_TIER').length,
            enterpriseTier: Array.from(this.apiKeys.values()).filter(k => k.tier === 'ENTERPRISE_TIER').length
        });
    }

    /**
     * Validar API Key y obtener información del usuario
     */
    validateApiKey(apiKey) {
        if (!apiKey) {
            return { isValid: false, error: 'API key requerida' };
        }

        const keyInfo = this.apiKeys.get(apiKey);
        if (!keyInfo) {
            return { isValid: false, error: 'API key inválida' };
        }

        if (!keyInfo.isActive) {
            return { isValid: false, error: 'API key desactivada' };
        }

        const tierInfo = this.TIERS[keyInfo.tier];
        
        return {
            isValid: true,
            user: keyInfo,
            tier: tierInfo,
            apiKeyPrefix: apiKey.substring(0, 12) + '...',
            features: tierInfo.features,
            rateLimit: tierInfo.rateLimit
        };
    }

    /**
     * Generar JWT Token
     */
    generateJWT(userData, apiKeyInfo) {
        try {
            const payload = {
                userId: userData.userId || apiKeyInfo.user.userId,
                email: userData.email || apiKeyInfo.user.email,
                name: userData.name || apiKeyInfo.user.name,
                tier: apiKeyInfo.tier.name,
                features: apiKeyInfo.features,
                apiKeyPrefix: apiKeyInfo.apiKeyPrefix,
                originalApiKeyUser: apiKeyInfo.user.userId, // Para validación
                iat: Math.floor(Date.now() / 1000)
            };

            const token = jwt.sign(payload, this.JWT_SECRET, { 
                expiresIn: this.JWT_EXPIRES_IN,
                algorithm: 'HS256'
            });

            logInfo('🎫 JWT Token generado', {
                userId: payload.userId,
                tier: payload.tier,
                expiresIn: this.JWT_EXPIRES_IN
            });

            return {
                success: true,
                token,
                expiresIn: this.JWT_EXPIRES_IN,
                user: {
                    id: payload.userId,
                    email: payload.email,
                    name: payload.name,
                    tier: payload.tier,
                    features: payload.features
                }
            };

        } catch (error) {
            logError('❌ Error generando JWT', { error: error.message });
            return {
                success: false,
                error: 'Error interno generando token'
            };
        }
    }

    /**
     * Verificar JWT Token
     */
    verifyJWT(token) {
        try {
            if (!token) {
                return { isValid: false, error: 'Token requerido' };
            }

            // Remover 'Bearer ' si está presente
            const cleanToken = token.replace('Bearer ', '');

            const decoded = jwt.verify(cleanToken, this.JWT_SECRET);
            
            // Verificar que el token no haya expirado
            const now = Math.floor(Date.now() / 1000);
            if (decoded.exp < now) {
                return { isValid: false, error: 'Token expirado' };
            }

            return {
                isValid: true,
                user: {
                    id: decoded.userId,
                    email: decoded.email,
                    name: decoded.name,
                    tier: decoded.tier,
                    features: decoded.features,
                    apiKeyPrefix: decoded.apiKeyPrefix
                },
                tokenData: decoded
            };

        } catch (error) {
            logError('❌ Error verificando JWT', { error: error.message });
            
            if (error.name === 'TokenExpiredError') {
                return { isValid: false, error: 'Token expirado' };
            } else if (error.name === 'JsonWebTokenError') {
                return { isValid: false, error: 'Token inválido' };
            }
            
            return { isValid: false, error: 'Error verificando token' };
        }
    }

    /**
     * Verificar si un tier tiene acceso a una funcionalidad
     */
    hasFeatureAccess(userTier, requiredFeature) {
        const tierInfo = this.TIERS[userTier];
        if (!tierInfo) {
            return { hasAccess: false, error: 'Tier inválido' };
        }

        const hasAccess = tierInfo.features.includes(requiredFeature);
        
        return {
            hasAccess,
            userTier,
            requiredFeature,
            availableFeatures: tierInfo.features
        };
    }

    /**
     * Verificar si un tier puede acceder a un endpoint específico
     */
    canAccessEndpoint(userTier, endpoint) {
        const endpointFeatureMap = {
            '/api/scraping': 'scraping',
            '/api/search': 'search', 
            '/api/mortgage': 'mortgage',
            '/api/anthropic': 'anthropic',
            '/api/pdf': 'pdf',
            '/api/cache': 'cache'
        };

        const requiredFeature = endpointFeatureMap[endpoint];
        if (!requiredFeature) {
            return { canAccess: true }; // Endpoint público
        }

        const access = this.hasFeatureAccess(userTier, requiredFeature);
        return {
            canAccess: access.hasAccess,
            requiredFeature,
            userTier,
            error: access.hasAccess ? null : `Tier insuficiente. Requiere acceso a '${requiredFeature}'`
        };
    }

    /**
     * Obtener información completa de autenticación
     */
    getAuthInfo(apiKey, jwtToken = null) {
        const apiKeyValidation = this.validateApiKey(apiKey);
        if (!apiKeyValidation.isValid) {
            return { success: false, error: apiKeyValidation.error };
        }

        const result = {
            success: true,
            apiKey: {
                prefix: apiKeyValidation.apiKeyPrefix,
                tier: apiKeyValidation.tier.name,
                rateLimit: apiKeyValidation.rateLimit,
                features: apiKeyValidation.features,
                description: apiKeyValidation.tier.description
            },
            user: apiKeyValidation.user
        };

        // Si hay JWT token, validarlo también
        if (jwtToken) {
            const jwtValidation = this.verifyJWT(jwtToken);
            if (jwtValidation.isValid) {
                result.jwt = {
                    valid: true,
                    user: jwtValidation.user,
                    expiresAt: new Date(jwtValidation.tokenData.exp * 1000).toISOString()
                };
            } else {
                result.jwt = {
                    valid: false,
                    error: jwtValidation.error
                };
            }
        }

        return result;
    }

    /**
     * Obtener estadísticas del sistema de autenticación
     */
    getAuthStats() {
        const stats = {
            totalApiKeys: this.apiKeys.size,
            tierDistribution: {},
            features: Object.keys(this.TIERS).reduce((acc, tier) => {
                acc[tier] = this.TIERS[tier].features;
                return acc;
            }, {}),
            rateLimits: Object.keys(this.TIERS).reduce((acc, tier) => {
                acc[tier] = this.TIERS[tier].rateLimit;
                return acc;
            }, {})
        };

        // Contar distribución por tier
        Array.from(this.apiKeys.values()).forEach(keyInfo => {
            stats.tierDistribution[keyInfo.tier] = (stats.tierDistribution[keyInfo.tier] || 0) + 1;
        });

        return stats;
    }
}

module.exports = AuthService;