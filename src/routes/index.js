// src/routes/index.js (VERSIÓN COMPLETA CON MORTGAGE)
const { logInfo } = require('../utils/logger');

const setupRoutes = (app) => {
    logInfo('🔥 CONFIGURANDO RUTAS MODULARES');

    try {
        // IMPORTAR RUTAS MODULARES
        const scrapingRoutes = require('./scraping.routes');
        const searchRoutes = require('./search.routes');
        const mortgageRoutes = require('./mortgage.routes'); // NUEVO
        
        logInfo('✅ Rutas importadas correctamente');

        // ==========================================
        // RUTAS API v2 (NUEVAS)
        // ==========================================
        app.use('/api/scraping', scrapingRoutes);
        app.use('/api/search', searchRoutes);
        app.use('/api/mortgage', mortgageRoutes); // NUEVO
        
        logInfo('✅ API v2 configurado: /api/scraping, /api/search, /api/mortgage');

        // ==========================================
        // RUTAS API v1 (COMPATIBILIDAD) - OPCIONAL
        // ==========================================
        app.use('/scrape-property', scrapingRoutes);
        app.use('/search-properties', searchRoutes);
        app.use('/simulate-mortgage', mortgageRoutes); // NUEVO
        
        logInfo('✅ API v1 (compatibilidad) configurado');

        // ==========================================
        // RUTAS ESPECIALES
        // ==========================================
        
        // Health check principal - ACTUALIZADO
        app.get('/health', (req, res) => {
            res.json({
                status: 'OK',
                message: 'API de Scraping de Propiedades - Arquitectura Modular',
                timestamp: new Date().toISOString(),
                version: '2.0.0-modular',
                endpoints: {
                    'GET /health': '✅ Health check',
                    'GET /info': '✅ Información del sistema',
                    // API v2
                    'POST /api/scraping/property': '✅ Scraping',
                    'POST /api/search/properties': '✅ Búsqueda',
                    'GET /api/search/info': '✅ Info búsqueda',
                    'POST /api/mortgage/simulate': '✅ Simulación hipotecaria', // NUEVO
                    'POST /api/mortgage/compare': '✅ Comparación de escenarios', // NUEVO
                    'GET /api/mortgage/info': '✅ Info simulación', // NUEVO
                    // API v1 (compatibilidad)
                    'POST /scrape-property': '✅ Scraping (v1)',
                    'POST /search-properties': '✅ Búsqueda (v1)',
                    'POST /simulate-mortgage': '✅ Simulación (v1)' // NUEVO
                },
                modulos: {
                    scraping: '✅ Funcionando',
                    search: '✅ Funcionando',
                    mortgage: '✅ Funcionando' // NUEVO (actualizado)
                }
            });
        });

        // Información del sistema - ACTUALIZADO
        app.get('/info', (req, res) => {
            res.json({
                success: true,
                sistema: 'Property Scraper API',
                arquitectura: 'Modular - Monolito organizado',
                version: '2.0.0-modular',
                estado: 'Completamente funcional', // ACTUALIZADO
                timestamp: new Date().toISOString(),
                modulos_completados: ['scraping', 'search', 'mortgage'], // ACTUALIZADO
                proximos_pasos: ['optimizaciones', 'cache', 'tests'] // ACTUALIZADO
            });
        });

        logInfo('🎉 TODAS LAS RUTAS CONFIGURADAS EXITOSAMENTE', {
            api_v2: ['/api/scraping', '/api/search', '/api/mortgage'], // ACTUALIZADO
            api_v1_compatibilidad: ['/scrape-property', '/search-properties', '/simulate-mortgage'], // ACTUALIZADO
            modulos_completos: ['scraping', 'search', 'mortgage'] // NUEVO
        });

    } catch (error) {
        logInfo('❌ ERROR CONFIGURANDO RUTAS', { error: error.message });
        throw error;
    }
};

module.exports = { setupRoutes };