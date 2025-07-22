// src/server.js (AGREGAR después de require('dotenv').config())
require('dotenv').config();

// ✅ NUEVO: Validar entorno antes de continuar
const { checkEnvironmentOnStartup } = require('./config/env-validator');
checkEnvironmentOnStartup();

// Resto del código igual...
console.log('🔧 Configuración cargada:', {
    NODE_ENV: process.env.NODE_ENV,
    CLAUDE_API_ENABLED: process.env.CLAUDE_API_ENABLED,
    HAS_ANTHROPIC_KEY: !!process.env.ANTHROPIC_API_KEY,
    PORT: process.env.PORT || 3000
});

// src/server.js (MODIFICAR la sección de CORS)
const express = require('express');
const cors = require('cors');
const { getCorsConfig, getSecurityHeaders } = require('./config/security'); // NUEVO
const { logger, logInfo, logError } = require('./utils/logger');
const { ErrorFactory, formatErrorResponse } = require('./utils/errors');
const { errorHandler, notFoundHandler, uncaughtErrorHandler } = require('./middleware/errorHandler');
const { setupRoutes } = require('./routes');

const app = express();
const PORT = process.env.PORT || 3000;

// Configurar manejo de errores globales
uncaughtErrorHandler();

// ✅ NUEVO: Headers de seguridad básicos
app.use((req, res, next) => {
    const securityHeaders = getSecurityHeaders();
    Object.entries(securityHeaders).forEach(([header, value]) => {
        res.setHeader(header, value);
    });
    next();
});

// ✅ NUEVO: CORS configurado de forma segura
const corsConfig = getCorsConfig();
app.use(cors(corsConfig));

// Middleware básico
app.use(express.json({ limit: '10mb' })); // Límite de payload

// Resto del código igual...

// Configurar todas las rutas
setupRoutes(app); // NUEVO - REEMPLAZA LAS RUTAS MANUALES


// Health check
app.get('/health', (req, res) => {
    logInfo('Health check solicitado', { ip: req.ip });

    res.json({
        status: 'OK',
        message: 'API en migración - arquitectura modular',
        timestamp: new Date().toISOString(),
        version: '2.0.0-modular'
    });
});

// Ruta temporal para testing
app.get('/test', (req, res) => {
    logInfo('Test endpoint solicitado', { ip: req.ip });

    res.json({
        success: true,
        message: 'Servidor modular funcionando correctamente',
        estructura: 'Archivo por archivo'
    });
});

// Ruta de prueba de errores
app.get('/test-error', (req, res, next) => { // AGREGAR next
    try {
        logInfo('Probando sistema de errores');

        const error = ErrorFactory.validation('Este es un error de prueba', 'test_field');
        throw error;

    } catch (error) {
        next(error); // USAR MIDDLEWARE EN LUGAR DE MANEJO MANUAL
    }
});

// NUEVA RUTA: Prueba de error async
app.get('/test-async-error', async (req, res, next) => {
    try {
        logInfo('Probando error asíncrono');

        // Simular operación async que falla
        await new Promise((resolve, reject) => {
            setTimeout(() => {
                reject(ErrorFactory.internal('Error asíncrono de prueba'));
            }, 100);
        });

    } catch (error) {
        next(error);
    }
});

// Middleware de rutas no encontradas (ANTES del error handler)
app.use(notFoundHandler); // NUEVO

// Middleware de manejo de errores (DEBE IR AL FINAL)
app.use(errorHandler); // NUEVO




app.listen(PORT, () => {
    logInfo(`Servidor modular iniciado en puerto ${PORT}`);
    console.log('🚀 Servidor modular iniciado en puerto', PORT);
    console.log('📍 Health check: http://localhost:' + PORT + '/health');
    console.log('🧪 Test endpoint: http://localhost:' + PORT + '/test');
    console.log('🧪 Test error: http://localhost:' + PORT + '/test-error');
    console.log('🧪 Test async error: http://localhost:' + PORT + '/test-async-error');
    console.log('📋 Arquitectura: Modular - Implementación gradual');
    console.log('✅ Sistema de logging activado');
    console.log('✅ Sistema de errores activado');
    console.log('✅ Middleware de errores activado');

});

module.exports = app;