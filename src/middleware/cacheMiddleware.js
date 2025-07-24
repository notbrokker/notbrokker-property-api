// src/middleware/cacheMiddleware.js
const { getCacheService } = require('../services/cache/CacheService');
const { logInfo, logError } = require('../utils/logger');
const crypto = require('crypto');

class CacheMiddleware {
    constructor() {
        this.cacheService = getCacheService();
        logInfo('🧠 CacheMiddleware inicializado');
    }

    /**
     * Generar key de cache basada en la request
     */
    generateCacheKey(req, cacheType) {
        const baseData = {
            method: req.method,
            url: req.originalUrl,
            body: req.body,
            query: req.query,
            params: req.params
        };

        const dataString = JSON.stringify(baseData);
        const hash = crypto.createHash('md5').update(dataString).digest('hex');
        
        return `${cacheType}_${hash}`;
    }

    /**
     * Middleware de cache para scraping
     */
    cacheForScraping() {
        return async (req, res, next) => {
            try {
                // Solo cachear si hay URL válida
                const url = req.body.url || req.query.url;
                if (!url) {
                    return next();
                }

                const cacheKey = this.generateCacheKey(req, 'scraping');
                
                // Intentar obtener del cache
                const cached = await this.cacheService.get('scraping', cacheKey);
                
                if (cached.success) {
                    logInfo('🚀 Cache hit - Scraping', { 
                        url: url.substring(0, 50) + '...',
                        source: cached.source,
                        key: cacheKey.substring(0, 20) + '...'
                    });
                    
                    // Agregar headers de cache
                    res.set({
                        'X-Cache': 'HIT',
                        'X-Cache-Source': cached.source,
                        'X-Cache-Key': cacheKey.substring(0, 20) + '...'
                    });
                    
                    return res.json(cached.data);
                }

                // Cache miss - continuar con la request normal
                logInfo('❌ Cache miss - Scraping', { 
                    url: url.substring(0, 50) + '...',
                    key: cacheKey.substring(0, 20) + '...'
                });

                // Interceptar el response para cachear
                const originalJson = res.json;
                res.json = (data) => {
                    // Solo cachear respuestas exitosas
                    if (data.success !== false && !data.error) {
                        this.cacheService.set('scraping', cacheKey, data)
                            .then(result => {
                                if (result.success) {
                                    logInfo('💾 Datos guardados en cache - Scraping', { 
                                        url: url.substring(0, 50) + '...',
                                        stored: result.stored
                                    });
                                }
                            })
                            .catch(err => {
                                logError('❌ Error guardando en cache - Scraping', { 
                                    error: err.message 
                                });
                            });
                    }

                    // Agregar headers de cache
                    res.set({
                        'X-Cache': 'MISS',
                        'X-Cache-Key': cacheKey.substring(0, 20) + '...'
                    });

                    return originalJson.call(res, data);
                };

                next();

            } catch (error) {
                logError('❌ Error en cache middleware - Scraping', { 
                    error: error.message 
                });
                next(); // Continuar sin cache en caso de error
            }
        };
    }

    /**
     * Middleware de cache para búsquedas
     */
    cacheForSearch() {
        return async (req, res, next) => {
            try {
                const cacheKey = this.generateCacheKey(req, 'search');
                
                // Intentar obtener del cache
                const cached = await this.cacheService.get('search', cacheKey);
                
                if (cached.success) {
                    logInfo('🚀 Cache hit - Search', { 
                        source: cached.source,
                        key: cacheKey.substring(0, 20) + '...'
                    });
                    
                    res.set({
                        'X-Cache': 'HIT',
                        'X-Cache-Source': cached.source,
                        'X-Cache-Key': cacheKey.substring(0, 20) + '...'
                    });
                    
                    return res.json(cached.data);
                }

                // Cache miss - continuar con la request normal
                logInfo('❌ Cache miss - Search', { 
                    key: cacheKey.substring(0, 20) + '...'
                });

                // Interceptar el response para cachear
                const originalJson = res.json;
                res.json = (data) => {
                    // Solo cachear respuestas exitosas
                    if (data.success !== false && !data.error) {
                        this.cacheService.set('search', cacheKey, data)
                            .then(result => {
                                if (result.success) {
                                    logInfo('💾 Datos guardados en cache - Search', { 
                                        stored: result.stored
                                    });
                                }
                            })
                            .catch(err => {
                                logError('❌ Error guardando en cache - Search', { 
                                    error: err.message 
                                });
                            });
                    }

                    res.set({
                        'X-Cache': 'MISS',
                        'X-Cache-Key': cacheKey.substring(0, 20) + '...'
                    });

                    return originalJson.call(res, data);
                };

                next();

            } catch (error) {
                logError('❌ Error en cache middleware - Search', { 
                    error: error.message 
                });
                next();
            }
        };
    }

    /**
     * Middleware de cache para simulaciones hipotecarias
     */
    cacheForMortgage() {
        return async (req, res, next) => {
            try {
                const cacheKey = this.generateCacheKey(req, 'mortgage');
                
                // Intentar obtener del cache
                const cached = await this.cacheService.get('mortgage', cacheKey);
                
                if (cached.success) {
                    logInfo('🚀 Cache hit - Mortgage', { 
                        source: cached.source,
                        key: cacheKey.substring(0, 20) + '...'
                    });
                    
                    res.set({
                        'X-Cache': 'HIT',
                        'X-Cache-Source': cached.source,
                        'X-Cache-Key': cacheKey.substring(0, 20) + '...'
                    });
                    
                    return res.json(cached.data);
                }

                // Cache miss - continuar con la request normal
                logInfo('❌ Cache miss - Mortgage', { 
                    key: cacheKey.substring(0, 20) + '...'
                });

                // Interceptar el response para cachear
                const originalJson = res.json;
                res.json = (data) => {
                    // Solo cachear respuestas exitosas
                    if (data.success !== false && !data.error) {
                        this.cacheService.set('mortgage', cacheKey, data)
                            .then(result => {
                                if (result.success) {
                                    logInfo('💾 Datos guardados en cache - Mortgage', { 
                                        stored: result.stored
                                    });
                                }
                            })
                            .catch(err => {
                                logError('❌ Error guardando en cache - Mortgage', { 
                                    error: err.message 
                                });
                            });
                    }

                    res.set({
                        'X-Cache': 'MISS',
                        'X-Cache-Key': cacheKey.substring(0, 20) + '...'
                    });

                    return originalJson.call(res, data);
                };

                next();

            } catch (error) {
                logError('❌ Error en cache middleware - Mortgage', { 
                    error: error.message 
                });
                next();
            }
        };
    }

    /**
     * Middleware de cache para análisis con IA
     */
    cacheForAnthropicAnalysis() {
        return async (req, res, next) => {
            try {
                const cacheKey = this.generateCacheKey(req, 'claude');
                
                // Intentar obtener del cache
                const cached = await this.cacheService.get('claude', cacheKey);
                
                if (cached.success) {
                    logInfo('🚀 Cache hit - Claude Analysis', { 
                        source: cached.source,
                        key: cacheKey.substring(0, 20) + '...',
                        savings: '80% cost reduction'
                    });
                    
                    res.set({
                        'X-Cache': 'HIT',
                        'X-Cache-Source': cached.source,
                        'X-Cache-Key': cacheKey.substring(0, 20) + '...',
                        'X-Cache-Savings': '80% cost reduction'
                    });
                    
                    return res.json(cached.data);
                }

                // Cache miss - continuar con la request normal
                logInfo('❌ Cache miss - Claude Analysis', { 
                    key: cacheKey.substring(0, 20) + '...',
                    note: 'Will generate fresh AI analysis'
                });

                // Interceptar el response para cachear
                const originalJson = res.json;
                res.json = (data) => {
                    // Solo cachear respuestas exitosas de análisis
                    if (data.success !== false && !data.error && data.analisisFinanciero) {
                        this.cacheService.set('claude', cacheKey, data)
                            .then(result => {
                                if (result.success) {
                                    logInfo('💾 Análisis IA guardado en cache', { 
                                        stored: result.stored,
                                        impact: 'Future requests will be 80% cheaper'
                                    });
                                }
                            })
                            .catch(err => {
                                logError('❌ Error guardando análisis en cache', { 
                                    error: err.message 
                                });
                            });
                    }

                    res.set({
                        'X-Cache': 'MISS',
                        'X-Cache-Key': cacheKey.substring(0, 20) + '...'
                    });

                    return originalJson.call(res, data);
                };

                next();

            } catch (error) {
                logError('❌ Error en cache middleware - Claude', { 
                    error: error.message 
                });
                next();
            }
        };
    }

    /**
     * Middleware de cache para generación de PDFs
     */
    cacheForPDF() {
        return async (req, res, next) => {
            try {
                const cacheKey = this.generateCacheKey(req, 'pdf');
                
                // Intentar obtener del cache
                const cached = await this.cacheService.get('pdf', cacheKey);
                
                if (cached.success) {
                    logInfo('🚀 Cache hit - PDF Generation', { 
                        source: cached.source,
                        key: cacheKey.substring(0, 20) + '...'
                    });
                    
                    res.set({
                        'X-Cache': 'HIT',
                        'X-Cache-Source': cached.source,
                        'X-Cache-Key': cacheKey.substring(0, 20) + '...'
                    });
                    
                    return res.json(cached.data);
                }

                // Cache miss - continuar con la request normal
                logInfo('❌ Cache miss - PDF Generation', { 
                    key: cacheKey.substring(0, 20) + '...'
                });

                // Interceptar el response para cachear
                const originalJson = res.json;
                res.json = (data) => {
                    // Solo cachear respuestas exitosas
                    if (data.success !== false && !data.error) {
                        this.cacheService.set('pdf', cacheKey, data)
                            .then(result => {
                                if (result.success) {
                                    logInfo('💾 PDF data guardado en cache', { 
                                        stored: result.stored
                                    });
                                }
                            })
                            .catch(err => {
                                logError('❌ Error guardando PDF en cache', { 
                                    error: err.message 
                                });
                            });
                    }

                    res.set({
                        'X-Cache': 'MISS',
                        'X-Cache-Key': cacheKey.substring(0, 20) + '...'
                    });

                    return originalJson.call(res, data);
                };

                next();

            } catch (error) {
                logError('❌ Error en cache middleware - PDF', { 
                    error: error.message 
                });
                next();
            }
        };
    }

    /**
     * Middleware general de cache (detecta automáticamente el tipo)
     */
    smartCache() {
        return (req, res, next) => {
            const url = req.originalUrl;
            
            if (url.includes('/api/scraping')) {
                return this.cacheForScraping()(req, res, next);
            } else if (url.includes('/api/search')) {
                return this.cacheForSearch()(req, res, next);
            } else if (url.includes('/api/mortgage')) {
                return this.cacheForMortgage()(req, res, next);
            } else if (url.includes('/api/anthropic')) {
                return this.cacheForAnthropicAnalysis()(req, res, next);
            } else if (url.includes('/api/pdf')) {
                return this.cacheForPDF()(req, res, next);
            } else {
                return next();
            }
        };
    }
}

// Singleton instance
const cacheMiddleware = new CacheMiddleware();

module.exports = {
    cacheForScraping: () => cacheMiddleware.cacheForScraping(),
    cacheForSearch: () => cacheMiddleware.cacheForSearch(),
    cacheForMortgage: () => cacheMiddleware.cacheForMortgage(),
    cacheForAnthropicAnalysis: () => cacheMiddleware.cacheForAnthropicAnalysis(),
    cacheForPDF: () => cacheMiddleware.cacheForPDF(),
    smartCache: () => cacheMiddleware.smartCache()
};