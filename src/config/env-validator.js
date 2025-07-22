// src/config/env-validator.js
/**
 * Validador de variables de entorno críticas
 */

const { logInfo, logError } = require('../utils/logger');

/**
 * Variables de entorno requeridas para funcionamiento básico
 */
const REQUIRED_ENV_VARS = [
    'NODE_ENV'
];

/**
 * Variables de entorno críticas para funcionalidad completa
 */
const CRITICAL_ENV_VARS = [
    'ANTHROPIC_API_KEY'
];

/**
 * Variables opcionales con valores por defecto
 */
const OPTIONAL_ENV_VARS = {
    'PORT': '3000',
    'CLAUDE_API_ENABLED': 'false',
    'ALLOWED_ORIGINS': 'http://localhost:3000',
    'LOG_LEVEL': 'info'
};

/**
 * Validar variable individual
 */
const validateEnvVar = (varName, isRequired = true) => {
    const value = process.env[varName];
    
    if (!value || value.trim() === '') {
        if (isRequired) {
            return {
                valid: false,
                error: `Variable requerida '${varName}' no está definida`
            };
        } else {
            // Aplicar valor por defecto si existe
            if (OPTIONAL_ENV_VARS[varName]) {
                process.env[varName] = OPTIONAL_ENV_VARS[varName];
                logInfo(`✅ Variable '${varName}' usando valor por defecto: ${OPTIONAL_ENV_VARS[varName]}`);
            }
            return { valid: true, defaultApplied: true };
        }
    }

    // Validaciones específicas por variable
    switch (varName) {
        case 'NODE_ENV':
            const validEnvs = ['development', 'production', 'test'];
            if (!validEnvs.includes(value)) {
                return {
                    valid: false,
                    error: `NODE_ENV debe ser uno de: ${validEnvs.join(', ')}`
                };
            }
            break;
            
        case 'PORT':
            const port = parseInt(value);
            if (isNaN(port) || port < 1 || port > 65535) {
                return {
                    valid: false,
                    error: `PORT debe ser un número entre 1 y 65535`
                };
            }
            break;
            
        case 'ANTHROPIC_API_KEY':
            if (value.length < 20) {
                return {
                    valid: false,
                    error: `ANTHROPIC_API_KEY parece inválida (muy corta)`
                };
            }
            break;
    }

    return { valid: true };
};

/**
 * Validar todas las variables de entorno
 */
const validateEnvironment = () => {
    const results = {
        valid: true,
        errors: [],
        warnings: [],
        summary: {
            required: 0,
            critical: 0,
            optional: 0,
            total: 0
        }
    };

    logInfo('🔍 Validando variables de entorno...');

    // Validar variables requeridas
    REQUIRED_ENV_VARS.forEach(varName => {
        const result = validateEnvVar(varName, true);
        results.summary.required++;
        results.summary.total++;
        
        if (!result.valid) {
            results.valid = false;
            results.errors.push(result.error);
            logError(`❌ ${result.error}`);
        } else {
            logInfo(`✅ Variable requerida '${varName}' OK`);
        }
    });

    // Validar variables críticas (pueden funcionar sin ellas pero con limitaciones)
    CRITICAL_ENV_VARS.forEach(varName => {
        const result = validateEnvVar(varName, false);
        results.summary.critical++;
        results.summary.total++;
        
        if (!result.valid && process.env[varName]) {
            results.warnings.push(`Variable crítica '${varName}': ${result.error}`);
            logError(`⚠️ ${result.error}`);
        } else if (!process.env[varName]) {
            results.warnings.push(`Variable crítica '${varName}' no configurada - funcionalidad limitada`);
            logError(`⚠️ Variable crítica '${varName}' no configurada`);
        } else {
            logInfo(`✅ Variable crítica '${varName}' OK`);
        }
    });

    // Aplicar valores por defecto para variables opcionales
    Object.keys(OPTIONAL_ENV_VARS).forEach(varName => {
        validateEnvVar(varName, false);
        results.summary.optional++;
        results.summary.total++;
    });

    // Log resumen
    if (results.valid) {
        logInfo('✅ Validación de entorno completada exitosamente', {
            required: results.summary.required,
            critical: results.summary.critical,
            optional: results.summary.optional,
            warnings: results.warnings.length
        });
    } else {
        logError('❌ Validación de entorno falló', {
            errors: results.errors.length,
            warnings: results.warnings.length
        });
    }

    return results;
};

/**
 * Función para verificar entorno al inicio de la aplicación
 */
const checkEnvironmentOnStartup = () => {
    const validation = validateEnvironment();
    
    if (!validation.valid) {
        console.error('\n🚨 ERROR CRÍTICO: Variables de entorno requeridas no configuradas\n');
        validation.errors.forEach(error => console.error(`   ❌ ${error}`));
        console.error('\n💡 Revisa tu archivo .env o variables del sistema\n');
        
        process.exit(1);
    }
    
    if (validation.warnings.length > 0) {
        console.warn('\n⚠️ ADVERTENCIAS de configuración:\n');
        validation.warnings.forEach(warning => console.warn(`   ⚠️ ${warning}`));
        console.warn('\n');
    }
    
    return validation;
};

module.exports = {
    validateEnvironment,
    checkEnvironmentOnStartup,
    validateEnvVar
};