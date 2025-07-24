// src/routes/auth.routes.js
const express = require('express');
const AuthController = require('../controllers/AuthController');
const { 
    validateApiKey, 
    validateJWT, 
    requireFeature 
} = require('../middleware/authMiddleware');

const router = express.Router();

// ==========================================
// RUTAS DE AUTENTICACIÓN
// ==========================================

/**
 * POST /api/auth/token
 * Generar JWT Token a partir de API key
 * 
 * Headers requeridos:
 * - x-api-key: API key válida de cualquier tier
 * 
 * Body:
 * - userId (requerido): ID único del usuario
 * - email (opcional): Email del usuario  
 * - name (opcional): Nombre del usuario
 */
router.post('/token', validateApiKey, AuthController.generateToken);

/**
 * GET /api/auth/info
 * Información de la API key y tier actual
 * 
 * Headers requeridos:
 * - x-api-key: API key válida
 * 
 * Headers opcionales:
 * - Authorization: Bearer [token] (para info de JWT también)
 */
router.get('/info', validateApiKey, AuthController.getApiKeyInfo);

/**
 * GET /api/auth/me
 * Información completa del usuario autenticado
 * 
 * Headers requeridos:
 * - x-api-key: API key válida
 * - Authorization: Bearer [token]: JWT token válido
 */
router.get('/me', validateApiKey, validateJWT, AuthController.getUserInfo);

/**
 * GET /api/auth/stats
 * Estadísticas del sistema de autenticación
 * 
 * Requiere: ENTERPRISE tier
 * Headers requeridos:
 * - x-api-key: API key ENTERPRISE
 */
router.get('/stats', ...requireFeature('cache'), AuthController.getAuthStats);

/**
 * POST /api/auth/verify
 * Verificar validez de tokens (utilidad de testing)
 * 
 * Headers requeridos:
 * - x-api-key: API key válida
 * 
 * Body:
 * - apiKey (opcional): API key a verificar
 * - jwtToken (opcional): JWT token a verificar
 */
router.post('/verify', validateApiKey, AuthController.verifyTokens);

// ==========================================
// RUTA DE INFORMACIÓN DEL MÓDULO
// ==========================================

/**
 * GET /api/auth - Información general del módulo de autenticación
 */
router.get('/', (req, res) => {
    res.json({
        success: true,
        module: 'Authentication System',
        version: '1.0.0',
        description: 'Sistema de autenticación por API key + JWT con tiers',
        
        endpoints: {
            'POST /api/auth/token': {
                description: 'Generar JWT token desde API key',
                requires: 'API key válida',
                body: ['userId (required)', 'email (optional)', 'name (optional)'],
                response: 'JWT token + info usuario'
            },
            'GET /api/auth/info': {
                description: 'Información de API key y tier',
                requires: 'API key válida',
                response: 'Info de tier, límites y funcionalidades'
            },
            'GET /api/auth/me': {
                description: 'Información del usuario autenticado',
                requires: 'API key + JWT token',
                response: 'Info completa del usuario y sesión'
            },
            'GET /api/auth/stats': {
                description: 'Estadísticas del sistema',
                requires: 'ENTERPRISE tier',
                response: 'Estadísticas de uso y rendimiento'
            },
            'POST /api/auth/verify': {
                description: 'Verificar validez de tokens',
                requires: 'API key válida',
                body: ['apiKey (optional)', 'jwtToken (optional)'],
                response: 'Resultado de validación'
            }
        },
        
        tiers: {
            'FREE_TIER': {
                rateLimit: '10 requests/15min',
                features: ['scraping', 'search'],
                apiKeyPrefix: 'free_'
            },
            'PREMIUM_TIER': {
                rateLimit: '100 requests/15min', 
                features: ['scraping', 'search', 'mortgage', 'anthropic', 'pdf'],
                apiKeyPrefix: 'pre_'
            },
            'ENTERPRISE_TIER': {
                rateLimit: '1000 requests/15min',
                features: ['scraping', 'search', 'mortgage', 'anthropic', 'pdf', 'cache', 'batch'],
                apiKeyPrefix: 'ent_'
            }
        },
        
        authentication: {
            methods: ['API Key only', 'API Key + JWT'],
            jwtExpiration: '24 hours',
            headerNames: {
                apiKey: 'x-api-key',
                jwt: 'Authorization: Bearer [token]'
            }
        },
        
        examples: {
            generateToken: {
                method: 'POST',
                url: '/api/auth/token',
                headers: {
                    'x-api-key': 'pre_mde0uof8_638680b...',
                    'Content-Type': 'application/json'
                },
                body: {
                    userId: 'user123',
                    email: 'user@example.com',
                    name: 'Usuario Test'
                }
            },
            useAuthenticatedEndpoint: {
                method: 'GET',
                url: '/api/auth/me',
                headers: {
                    'x-api-key': 'pre_mde0uof8_638680b...',
                    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIs...'
                }
            }
        },
        
        timestamp: new Date().toISOString()
    });
});

module.exports = router;