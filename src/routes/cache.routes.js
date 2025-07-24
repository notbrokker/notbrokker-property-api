// src/routes/cache.routes.js
const express = require('express');
const cacheController = require('../controllers/CacheController'); // instancia, no clase
const { requireFeature } = require('../middleware/authMiddleware');

const router = express.Router();

// ==========================================
// RUTAS DE CACHE - ENTERPRISE TIER ONLY
// ==========================================

/**
 * GET /api/cache/health
 * Health check completo del sistema de cache
 * 
 * Requiere: ENTERPRISE tier
 * Headers requeridos:
 * - x-api-key: API key ENTERPRISE
 */
router.get('/health', ...requireFeature('cache'), cacheController.getHealth.bind(cacheController));

/**
 * GET /api/cache/stats
 * Estadísticas detalladas del sistema de cache
 * 
 * Requiere: ENTERPRISE tier
 * Headers requeridos:
 * - x-api-key: API key ENTERPRISE
 */
router.get('/stats', ...requireFeature('cache'), cacheController.getStats.bind(cacheController));

/**
 * POST /api/cache/clear
 * Limpiar cache del sistema (usar con precaución)
 * 
 * Requiere: ENTERPRISE tier
 * Headers requeridos:
 * - x-api-key: API key ENTERPRISE
 * 
 * Body:
 * - type: 'all' | 'claude' | 'scraping' | 'search' | 'mortgage' | 'pdf'
 * - confirm: true (requerido para confirmación)
 */
router.post('/clear', ...requireFeature('cache'), cacheController.clearCache.bind(cacheController));

/**
 * GET /api/cache/info/:type
 * Información específica por tipo de cache
 * 
 * Requiere: ENTERPRISE tier
 * Headers requeridos:
 * - x-api-key: API key ENTERPRISE
 * 
 * Params:
 * - type: 'claude' | 'scraping' | 'search' | 'mortgage' | 'pdf'
 */
router.get('/info/:type', ...requireFeature('cache'), cacheController.getTypeInfo.bind(cacheController));

/**
 * POST /api/cache/test
 * Test de funcionamiento del cache
 * 
 * Requiere: ENTERPRISE tier
 * Headers requeridos:
 * - x-api-key: API key ENTERPRISE
 * 
 * Body:
 * - testType: 'basic' | 'performance' | 'stress' (opcional)
 */
router.post('/test', ...requireFeature('cache'), cacheController.testCache.bind(cacheController));

// ==========================================
// RUTA DE INFORMACIÓN DEL MÓDULO
// ==========================================

/**
 * GET /api/cache - Información general del módulo de cache
 */
router.get('/', ...requireFeature('cache'), (req, res) => {
    res.json({
        success: true,
        module: 'Enterprise Cache System',
        version: '1.0.0',
        description: 'Sistema de cache multi-nivel con Redis + NodeCache para tier ENTERPRISE',
        
        tier: {
            required: 'ENTERPRISE_TIER',
            rateLimit: '1000 requests/15min',
            description: 'Acceso completo a gestión de cache y analytics'
        },
        
        endpoints: {
            'GET /api/cache/health': {
                description: 'Health check completo del sistema',
                response: 'Estado detallado de Redis y memoria',
                performance: 'Verificaciones de conectividad y funcionamiento'
            },
            'GET /api/cache/stats': {
                description: 'Estadísticas detalladas de rendimiento',
                response: 'Métricas de hits/misses, memoria, Redis',
                insights: 'Ahorro de costos y mejoras de velocidad'
            },
            'POST /api/cache/clear': {
                description: 'Limpiar cache (precaución requerida)',
                body: ['type (required)', 'confirm: true (required)'],
                types: ['all', 'claude', 'scraping', 'search', 'mortgage', 'pdf'],
                warning: 'Afecta rendimiento temporalmente'
            },
            'GET /api/cache/info/:type': {
                description: 'Información específica por tipo',
                params: ['type: claude|scraping|search|mortgage|pdf'],
                response: 'Conteos, TTL, rendimiento por tipo'
            },
            'POST /api/cache/test': {
                description: 'Test de funcionamiento del cache',
                body: ['testType (optional)'],
                response: 'Resultados de pruebas de escritura/lectura'
            }
        },
        
        architecture: {
            levels: ['Memory Cache (NodeCache)', 'Persistent Cache (Redis)'],
            strategy: 'Memory-first with Redis fallback',
            ttl: '24 hours for all data types',
            benefits: [
                '80% reducción en costos de API',
                'Respuestas de 30s a 100ms',
                'Persistencia distribuida',
                'Fallback automático'
            ]
        },
        
        dataTypes: {
            claude: {
                prefix: 'claude:analysis:',
                description: 'Resultados de análisis con IA',
                impact: 'Alto ahorro en costos'
            },
            scraping: {
                prefix: 'scraping:property:',
                description: 'Datos de scraping de propiedades',
                impact: 'Carga rápida de propiedades'
            },
            search: {
                prefix: 'search:results:',
                description: 'Resultados de búsqueda',
                impact: 'Respuestas instantáneas'
            },
            mortgage: {
                prefix: 'mortgage:simulation:',
                description: 'Simulaciones hipotecarias',
                impact: 'Cálculos financieros rápidos'
            },
            pdf: {
                prefix: 'pdf:report:',
                description: 'Datos de generación PDF',
                impact: 'Reportes más rápidos'
            }
        },
        
        performance: {
            memoryAccess: '< 10ms',
            redisAccess: '< 50ms',
            fallbackBehavior: 'Graceful degradation',
            errorHandling: 'Continue without cache'
        },
        
        enterprise: {
            user: req.auth.user.userId,
            tier: req.auth.tier.name,
            features: req.auth.features,
            accessLevel: 'FULL_CACHE_MANAGEMENT'
        },
        
        examples: {
            healthCheck: {
                method: 'GET',
                url: '/api/cache/health',
                headers: {
                    'x-api-key': 'ent_mde0utgm_eff257d...'
                }
            },
            clearSpecific: {
                method: 'POST',
                url: '/api/cache/clear',
                headers: {
                    'x-api-key': 'ent_mde0utgm_eff257d...',
                    'Content-Type': 'application/json'
                },
                body: {
                    type: 'claude',
                    confirm: true
                }
            }
        },
        
        timestamp: new Date().toISOString()
    });
});

module.exports = router;