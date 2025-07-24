// src/config/redis.js
const Redis = require('ioredis');
const { logInfo, logError, logWarning } = require('../utils/logger');

class RedisConfig {
    constructor() {
        this.redis = null;
        this.isConnected = false;
        this.connectionAttempts = 0;
        this.maxConnectionAttempts = 1; // Solo 1 intento rápido
        this.reconnectDelay = 500; // Delay más corto
        
        // Configuración Redis
        this.config = {
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT) || 6379,
            password: process.env.REDIS_PASSWORD || undefined,
            db: parseInt(process.env.REDIS_DB) || 0,
            
            // Configuración de conexión
            connectTimeout: 2000, // Timeout más corto
            lazyConnect: true,
            maxRetriesPerRequest: 0, // No reintentos
            retryDelayOnFailover: 0,
            enableOfflineQueue: false,
            
            // Deshabilitar reconexión automática para fallback rápido
            retryStrategy: null,
            
            // Configuración de familia de IP (IPv4)
            family: 4
        };

        logInfo('🔧 RedisConfig inicializado', {
            host: this.config.host,
            port: this.config.port,
            db: this.config.db,
            hasPassword: !!this.config.password
        });
    }

    /**
     * Inicializar conexión Redis
     */
    async connect() {
        try {
            if (this.redis && this.isConnected) {
                logInfo('🔴 Redis ya está conectado');
                return this.redis;
            }

            logInfo('🔴 Iniciando conexión Redis...', this.config);
            
            this.redis = new Redis(this.config);

            // Event listeners
            this.redis.on('connect', () => {
                logInfo('🟢 Redis conectado exitosamente', {
                    host: this.config.host,
                    port: this.config.port
                });
                this.isConnected = true;
                this.connectionAttempts = 0;
            });

            this.redis.on('ready', () => {
                logInfo('✅ Redis listo para recibir comandos');
            });

            this.redis.on('error', (error) => {
                logError('❌ Redis error', { 
                    error: error.message,
                    code: error.code 
                });
                this.isConnected = false;
            });

            this.redis.on('close', () => {
                logInfo('🔴 Conexión Redis cerrada');
                this.isConnected = false;
            });

            this.redis.on('reconnecting', (ms) => {
                logInfo('🔄 Redis reconectando...', { delay: ms });
            });

            // Intentar conectar
            await this.redis.connect();
            
            // Verificar conexión con ping
            const pong = await this.redis.ping();
            if (pong === 'PONG') {
                logInfo('🏓 Redis ping exitoso');
                return this.redis;
            }

        } catch (error) {
            this.connectionAttempts++;
            logError('❌ Error conectando a Redis', { 
                error: error.message,
                attempts: this.connectionAttempts,
                maxAttempts: this.maxConnectionAttempts
            });

            if (this.connectionAttempts >= this.maxConnectionAttempts) {
                logError('💥 Máximo de intentos de conexión Redis alcanzado - continuando sin Redis');
                this.redis = null;
                this.isConnected = false;
                return null; // Fallback a cache en memoria
            }

            // Reintento con delay
            await new Promise(resolve => setTimeout(resolve, this.reconnectDelay));
            return this.connect();
        }
    }

    /**
     * Obtener cliente Redis (lazy connect)
     */
    async getClient() {
        if (!this.redis || !this.isConnected) {
            return await this.connect();
        }
        return this.redis;
    }

    /**
     * Verificar estado de Redis
     */
    async healthCheck() {
        try {
            if (!this.redis) {
                return {
                    connected: false,
                    error: 'Redis client not initialized'
                };
            }

            const start = Date.now();
            const pong = await this.redis.ping();
            const responseTime = Date.now() - start;

            const info = await this.redis.info('server');
            const memoryInfo = await this.redis.info('memory');
            
            return {
                connected: this.isConnected,
                ping: pong === 'PONG',
                responseTime: `${responseTime}ms`,
                server: this.parseRedisInfo(info),
                memory: this.parseRedisInfo(memoryInfo),
                config: {
                    host: this.config.host,
                    port: this.config.port,
                    db: this.config.db
                }
            };

        } catch (error) {
            logError('❌ Redis health check failed', { error: error.message });
            return {
                connected: false,
                error: error.message,
                config: {
                    host: this.config.host,
                    port: this.config.port,
                    db: this.config.db
                }
            };
        }
    }

    /**
     * Parsear información de Redis
     */
    parseRedisInfo(infoString) {
        const info = {};
        const lines = infoString.split('\r\n');
        
        for (const line of lines) {
            if (line && !line.startsWith('#')) {
                const [key, value] = line.split(':');
                if (key && value) {
                    info[key] = value;
                }
            }
        }
        
        return info;
    }

    /**
     * Cerrar conexión Redis
     */
    async disconnect() {
        if (this.redis) {
            logInfo('🔴 Cerrando conexión Redis...');
            await this.redis.quit();
            this.redis = null;
            this.isConnected = false;
            logInfo('✅ Redis desconectado');
        }
    }

    /**
     * Obtener estadísticas de conexión
     */
    getConnectionStats() {
        return {
            isConnected: this.isConnected,
            connectionAttempts: this.connectionAttempts,
            maxConnectionAttempts: this.maxConnectionAttempts,
            config: {
                host: this.config.host,
                port: this.config.port,
                db: this.config.db,
                hasPassword: !!this.config.password
            }
        };
    }

    /**
     * Configurar TTL por defecto según el tipo de datos
     */
    getTTL(dataType) {
        const ttlConfig = {
            claude: 24 * 60 * 60, // 24 horas
            scraping: 24 * 60 * 60, // 24 horas  
            search: 24 * 60 * 60, // 24 horas
            mortgage: 24 * 60 * 60, // 24 horas
            pdf: 24 * 60 * 60, // 24 horas
            default: 60 * 60 // 1 hora
        };

        return ttlConfig[dataType] || ttlConfig.default;
    }
}

// Singleton instance
let redisConfigInstance = null;

const getRedisConfig = () => {
    if (!redisConfigInstance) {
        redisConfigInstance = new RedisConfig();
    }
    return redisConfigInstance;
};

module.exports = { RedisConfig, getRedisConfig };