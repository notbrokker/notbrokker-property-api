// src/services/cache/CacheService.js
const NodeCache = require('node-cache');
const { getRedisConfig } = require('../../config/redis');
const { logInfo, logError, logWarning } = require('../../utils/logger');

class CacheService {
    constructor() {
        this.redisConfig = getRedisConfig();
        this.redis = null;
        this.isRedisInitialized = false;
        
        // Cache en memoria como fallback
        this.memoryCache = new NodeCache({
            stdTTL: 24 * 60 * 60, // 24 horas por defecto (igual que Redis)
            checkperiod: 600, // Verificar expiración cada 10 minutos
            useClones: false,
            deleteOnExpire: true,
            enableLegacyCallbacks: false,
            maxKeys: 1000 // Máximo 1000 keys en memoria
        });

        // Estadísticas de cache
        this.stats = {
            hits: 0,
            misses: 0,
            sets: 0,
            deletes: 0,
            errors: 0,
            memoryHits: 0,
            redisHits: 0,
            startTime: Date.now()
        };

        // Configuración de prefijos por tipo de datos
        this.prefixes = {
            claude: 'claude:analysis:',
            scraping: 'scraping:property:',
            search: 'search:results:',
            mortgage: 'mortgage:simulation:',
            pdf: 'pdf:report:',
            session: 'session:',
            rateLimit: 'ratelimit:'
        };

        logInfo('🧠 CacheService inicializado', {
            memoryCache: 'NodeCache activo',
            maxKeys: 1000,
            defaultTTL: '24 horas'
        });

        // Inicializar Redis en background
        this.initRedis();
    }

    /**
     * Inicializar Redis de forma asíncrona (solo una vez)
     */
    async initRedis() {
        // Evitar múltiples inicializaciones
        if (this.isRedisInitialized) {
            return;
        }
        
        this.isRedisInitialized = true;

        try {
            this.redis = await this.redisConfig.connect();
            if (this.redis) {
                logInfo('🔴 Redis conectado al CacheService');
            } else {
                logInfo('⚠️ Redis no disponible, usando solo cache en memoria');
            }
        } catch (error) {
            logInfo('⚠️ Redis no disponible, usando solo cache en memoria', {
                error: error.message
            });
            this.redis = null;
        }
    }

    /**
     * Generar key completa con prefijo
     */
    generateKey(type, identifier) {
        const prefix = this.prefixes[type] || 'cache:';
        return `${prefix}${identifier}`;
    }

    /**
     * Obtener datos del cache (multi-nivel)
     */
    async get(type, identifier) {
        const key = this.generateKey(type, identifier);
        
        try {
            // Intentar cache en memoria primero (más rápido)
            const memoryResult = this.memoryCache.get(key);
            if (memoryResult !== undefined) {
                this.stats.hits++;
                this.stats.memoryHits++;
                
                logInfo('🧠 Cache hit (memoria)', { 
                    type, 
                    key: key.substring(0, 50) + '...' 
                });
                
                return {
                    success: true,
                    data: memoryResult,
                    source: 'memory',
                    key
                };
            }

            // Si no está en memoria, intentar Redis
            if (this.redis) {
                const redisResult = await this.redis.get(key);
                if (redisResult) {
                    const data = JSON.parse(redisResult);
                    
                    // Guardar en memoria para próximas consultas
                    const ttl = this.redisConfig.getTTL(type);
                    this.memoryCache.set(key, data, ttl);
                    
                    this.stats.hits++;
                    this.stats.redisHits++;
                    
                    logInfo('🔴 Cache hit (Redis)', { 
                        type, 
                        key: key.substring(0, 50) + '...' 
                    });
                    
                    return {
                        success: true,
                        data,
                        source: 'redis',
                        key
                    };
                }
            }

            // Cache miss
            this.stats.misses++;
            logInfo('❌ Cache miss', { 
                type, 
                key: key.substring(0, 50) + '...' 
            });
            
            return {
                success: false,
                data: null,
                source: 'none',
                key
            };

        } catch (error) {
            this.stats.errors++;
            logError('❌ Error obteniendo del cache', { 
                error: error.message, 
                type, 
                key 
            });
            
            return {
                success: false,
                data: null,
                source: 'error',
                key,
                error: error.message
            };
        }
    }

    /**
     * Guardar datos en cache (multi-nivel)
     */
    async set(type, identifier, data, customTTL = null) {
        const key = this.generateKey(type, identifier);
        const ttl = customTTL || this.redisConfig.getTTL(type);
        
        try {
            // Guardar en memoria
            this.memoryCache.set(key, data, ttl);
            
            // Guardar en Redis si está disponible
            if (this.redis) {
                const serializedData = JSON.stringify(data);
                await this.redis.setex(key, ttl, serializedData);
                
                logInfo('💾 Datos guardados en cache (memoria + Redis)', { 
                    type, 
                    key: key.substring(0, 50) + '...',
                    ttl: `${ttl}s`,
                    size: `${Math.round(serializedData.length / 1024)}KB`
                });
            } else {
                logInfo('🧠 Datos guardados en cache (solo memoria)', { 
                    type, 
                    key: key.substring(0, 50) + '...',
                    ttl: `${ttl}s`
                });
            }
            
            this.stats.sets++;
            
            return {
                success: true,
                key,
                ttl,
                stored: this.redis ? 'memory+redis' : 'memory'
            };

        } catch (error) {
            this.stats.errors++;
            logError('❌ Error guardando en cache', { 
                error: error.message, 
                type, 
                key 
            });
            
            return {
                success: false,
                key,
                error: error.message
            };
        }
    }

    /**
     * Eliminar datos del cache
     */
    async delete(type, identifier) {
        const key = this.generateKey(type, identifier);
        
        try {
            // Eliminar de memoria
            const memoryDeleted = this.memoryCache.del(key);
            
            // Eliminar de Redis
            let redisDeleted = 0;
            if (this.redis) {
                redisDeleted = await this.redis.del(key);
            }
            
            this.stats.deletes++;
            
            logInfo('🗑️ Datos eliminados del cache', { 
                type, 
                key: key.substring(0, 50) + '...',
                memoryDeleted,
                redisDeleted
            });
            
            return {
                success: true,
                key,
                memoryDeleted,
                redisDeleted
            };

        } catch (error) {
            this.stats.errors++;
            logError('❌ Error eliminando del cache', { 
                error: error.message, 
                type, 
                key 
            });
            
            return {
                success: false,
                key,
                error: error.message
            };
        }
    }

    /**
     * Limpiar cache por tipo o completamente
     */
    async clear(type = 'all') {
        try {
            let cleared = {
                memory: 0,
                redis: 0
            };

            if (type === 'all') {
                // Limpiar todo el cache en memoria
                const memoryKeys = this.memoryCache.keys();
                cleared.memory = memoryKeys.length;
                this.memoryCache.flushAll();
                
                // Limpiar Redis
                if (this.redis) {
                    const redisKeys = await this.redis.keys('*');
                    if (redisKeys.length > 0) {
                        cleared.redis = await this.redis.del(...redisKeys);
                    }
                }
                
                logInfo('🧹 Cache completo limpiado', cleared);
                
            } else {
                // Limpiar solo un tipo específico
                const prefix = this.prefixes[type];
                if (!prefix) {
                    throw new Error(`Tipo de cache desconocido: ${type}`);
                }
                
                // Limpiar memoria por patrón
                const memoryKeys = this.memoryCache.keys().filter(key => key.startsWith(prefix));
                cleared.memory = this.memoryCache.del(memoryKeys);
                
                // Limpiar Redis por patrón
                if (this.redis) {
                    const redisKeys = await this.redis.keys(`${prefix}*`);
                    if (redisKeys.length > 0) {
                        cleared.redis = await this.redis.del(...redisKeys);
                    }
                }
                
                logInfo('🧹 Cache tipo específico limpiado', { type, cleared });
            }
            
            return {
                success: true,
                type,
                cleared
            };

        } catch (error) {
            this.stats.errors++;
            logError('❌ Error limpiando cache', { 
                error: error.message, 
                type 
            });
            
            return {
                success: false,
                type,
                error: error.message
            };
        }
    }

    /**
     * Obtener estadísticas del cache
     */
    async getStats() {
        try {
            const memoryStats = this.memoryCache.getStats();
            const redisHealth = await this.redisConfig.healthCheck();
            
            const uptime = Date.now() - this.stats.startTime;
            const hitRate = this.stats.hits + this.stats.misses > 0 ? 
                ((this.stats.hits / (this.stats.hits + this.stats.misses)) * 100).toFixed(2) : 0;

            return {
                success: true,
                performance: {
                    hitRate: `${hitRate}%`,
                    totalHits: this.stats.hits,
                    totalMisses: this.stats.misses,
                    totalSets: this.stats.sets,
                    totalDeletes: this.stats.deletes,
                    totalErrors: this.stats.errors,
                    memoryHits: this.stats.memoryHits,
                    redisHits: this.stats.redisHits,
                    uptime: `${Math.round(uptime / 1000)}s`
                },
                memory: {
                    keys: memoryStats.keys,
                    hits: memoryStats.hits,
                    misses: memoryStats.misses,
                    ksize: memoryStats.ksize,
                    vsize: memoryStats.vsize
                },
                redis: redisHealth,
                configuration: {
                    prefixes: this.prefixes,
                    ttlConfig: {
                        claude: '24h',
                        scraping: '24h',
                        search: '24h', 
                        mortgage: '24h',
                        pdf: '24h'
                    }
                },
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            logError('❌ Error obteniendo estadísticas', { error: error.message });
            return {
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Verificar salud del sistema de cache
     */
    async healthCheck() {
        try {
            const memoryTest = 'memory_test_' + Date.now();
            const testData = { test: true, timestamp: Date.now() };
            
            // Test memoria
            this.memoryCache.set(memoryTest, testData, 60);
            const memoryResult = this.memoryCache.get(memoryTest);
            const memoryWorking = memoryResult && memoryResult.test === true;
            this.memoryCache.del(memoryTest);
            
            // Test Redis
            let redisWorking = false;
            if (this.redis) {
                const redisTest = 'redis_test_' + Date.now();
                await this.redis.setex(redisTest, 60, JSON.stringify(testData));
                const redisResult = await this.redis.get(redisTest);
                redisWorking = redisResult && JSON.parse(redisResult).test === true;
                await this.redis.del(redisTest);
            }
            
            const overallHealth = memoryWorking && (redisWorking || !this.redis);
            
            return {
                success: true,
                healthy: overallHealth,
                components: {
                    memory: {
                        available: true,
                        working: memoryWorking,
                        keys: this.memoryCache.keys().length
                    },
                    redis: {
                        available: !!this.redis,
                        working: redisWorking,
                        connected: this.redisConfig.isConnected
                    }
                },
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            logError('❌ Cache health check failed', { error: error.message });
            return {
                success: false,
                healthy: false,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Obtener información del cache por tipo
     */
    async getTypeInfo(type) {
        try {
            const prefix = this.prefixes[type];
            if (!prefix) {
                throw new Error(`Tipo de cache desconocido: ${type}`);
            }
            
            // Contar keys en memoria
            const memoryKeys = this.memoryCache.keys().filter(key => key.startsWith(prefix));
            
            // Contar keys en Redis
            let redisKeys = [];
            if (this.redis) {
                redisKeys = await this.redis.keys(`${prefix}*`);
            }
            
            return {
                success: true,
                type,
                prefix,
                counts: {
                    memory: memoryKeys.length,
                    redis: redisKeys.length,
                    total: memoryKeys.length + redisKeys.length
                },
                ttl: this.redisConfig.getTTL(type),
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            logError('❌ Error obteniendo info de tipo', { error: error.message, type });
            return {
                success: false,
                type,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }
}

// Singleton pattern para evitar múltiples instancias
let cacheServiceInstance = null;

const getCacheService = () => {
    if (!cacheServiceInstance) {
        cacheServiceInstance = new CacheService();
    }
    return cacheServiceInstance;
};

module.exports = { CacheService, getCacheService };