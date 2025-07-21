// src/controllers/AnthropicController.js
const { logInfo, logError, logWarn } = require('../utils/logger');
const { ErrorFactory } = require('../utils/errors');
const AnthropicService = require('../services/anthropic/AnthropicService');
const ClaudeApiHelper = require('../services/anthropic/ClaudeApiHelper');

/**
 * Controlador para servicios de Anthropic Claude - CORREGIDO
 */
class AnthropicController {

    /**
     * POST /api/anthropic/financial-report
     * Generar reporte financiero completo con Claude API - CORREGIDO
     */
    static async generateFinancialReport(req, res) {
        const startTime = Date.now();
        const { propertyUrl, options = {} } = req.body;
        const requestId = req.anthropicRequestId || `anthropic_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        logInfo('🏠 Nueva solicitud de reporte financiero', {
            requestId,
            propertyUrl: propertyUrl?.substring(0, 50) + '...',
            options: {
                includeLocationAnalysis: options.includeLocationAnalysis,
                confidenceLevel: options.confidenceLevel,
                maxComparables: options.maxComparables
            },
            ip: req.ip,
            userAgent: req.get('User-Agent')?.substring(0, 100)
        });

        // CRÍTICO: Verificar que no se hayan enviado headers por timeout
        if (res.headersSent) {
            logWarn('⚠️ Headers ya enviados por timeout, cancelando procesamiento', {
                requestId,
                propertyUrl: propertyUrl?.substring(0, 50)
            });
            return; // Salir sin enviar respuesta
        }

        try {
            // Validaciones de entrada
            if (!propertyUrl) {
                return res.status(400).json({
                    success: false,
                    error: 'URL de propiedad es requerida',
                    code: 'PROPERTY_URL_REQUIRED',
                    requestId
                });
            }

            // Preparar opciones completas con requestId
            const completeOptions = {
                ...options,
                requestId,
                startTime,
                optimizedForReport: true // Flag especial para generar reporte HTML
            };

            // Llamar al servicio con timeout propio
            const reportResult = await Promise.race([
                AnthropicService.generateFinancialReport(propertyUrl, completeOptions),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Service timeout')), 240000) // 4 minutos
                )
            ]);

            // CRÍTICO: Verificar nuevamente headers antes de enviar respuesta
            if (res.headersSent) {
                logWarn('⚠️ Headers enviados durante procesamiento, no enviando respuesta', {
                    requestId
                });
                return;
            }

            const totalTime = Date.now() - startTime;
            
            logInfo('✅ Reporte financiero generado exitosamente', {
                requestId,
                totalTime: `${totalTime}ms`,
                confidence: reportResult.metadata?.confidence,
                claudeUsed: reportResult.metadata?.claudeApi?.used,
                dataQuality: reportResult.metadata?.dataQuality
            });

            // ❌ LÍNEA 94 ORIGINAL PROBLEMÁTICA ❌
            // res.json(reportResult); 

            // ✅ LÍNEA 94 CORREGIDA ✅
            return res.status(200).json(reportResult);

        } catch (error) {
            const totalTime = Date.now() - startTime;
            
            logError('❌ Error generando reporte financiero', {
                requestId,
                propertyUrl,
                error: error.message,
                errorType: error.name,
                processingTime: `${totalTime}ms`,
                stack: error.stack
            });

            // CRÍTICO: Verificar headers antes de enviar error
            if (res.headersSent) {
                logWarn('⚠️ Headers ya enviados, no enviando error response', {
                    requestId,
                    error: error.message
                });
                return;
            }

            // Determinar tipo de error
            if (error.message === 'Service timeout') {
                return res.status(408).json({
                    success: false,
                    error: 'Timeout del servicio',
                    code: 'SERVICE_TIMEOUT',
                    message: 'El análisis tardó más de 4 minutos',
                    requestId,
                    processingTime: `${totalTime}ms`
                });
            }

            if (error.type === 'validation') {
                return res.status(400).json({
                    success: false,
                    error: error.message,
                    code: 'VALIDATION_ERROR',
                    requestId
                });
            }

            return res.status(500).json({
                success: false,
                error: 'Error interno del servidor',
                code: 'INTERNAL_ERROR',
                requestId,
                processingTime: `${totalTime}ms`
            });
        }
    }

    /**
     * GET /api/anthropic/financial-report - Version GET para testing
     */
    static async generateFinancialReportGet(req, res) {
        const { url, ...queryOptions } = req.query;
        
        // Convertir query params a opciones
        const options = {
            includeLocationAnalysis: queryOptions.includeLocationAnalysis === 'true',
            includeSecurityAnalysis: queryOptions.includeSecurityAnalysis === 'true',
            includeFinancialMetrics: queryOptions.includeFinancialMetrics === 'true',
            confidenceLevel: queryOptions.confidenceLevel || 'medium',
            maxComparables: parseInt(queryOptions.maxComparables) || 15
        };

        // Reutilizar lógica del POST
        req.body = { propertyUrl: url, options };
        return AnthropicController.generateFinancialReport(req, res);
    }

    /**
     * POST/GET /api/anthropic/test-claude
     * Probar conectividad con Claude API
     */
    static async testClaudeConnection(req, res) {
        const requestId = req.anthropicRequestId || `test_${Date.now()}`;
        
        logInfo('🧪 Testing Claude API connection', { requestId });

        try {
            const testResult = await ClaudeApiHelper.testConnection();
            
            return res.json({
                success: true,
                claude: {
                    status: testResult.success ? 'connected' : 'unavailable',
                    model: 'claude-sonnet-4-20250514',
                    latency: testResult.latency,
                    error: testResult.error || null
                },
                timestamp: new Date().toISOString(),
                requestId
            });
        } catch (error) {
            logError('Error testing Claude connection', error);
            
            return res.status(500).json({
                success: false,
                error: 'Error testing Claude API',
                claude: {
                    status: 'error',
                    error: error.message
                },
                requestId
            });
        }
    }

    /**
     * POST /api/anthropic/force-claude-analysis
     * Forzar análisis con Claude (debugging)
     */
    static async forceClaudeAnalysis(req, res) {
        const { propertyUrl, options = {} } = req.body;
        const requestId = req.anthropicRequestId || `force_${Date.now()}`;

        try {
            const forceOptions = {
                ...options,
                forceClaudeAnalysis: true,
                skipFallback: true,
                requestId
            };

            const result = await AnthropicService.generateFinancialReport(propertyUrl, forceOptions);
            
            return res.json({
                success: true,
                message: 'Análisis forzado con Claude',
                data: result,
                forced: true,
                requestId
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                error: 'Error en análisis forzado',
                details: error.message,
                requestId
            });
        }
    }

    /**
     * GET /api/anthropic/info
     * Información del servicio
     */
    static async getServiceInfo(req, res) {
        try {
            const claudeTest = await ClaudeApiHelper.testConnection();
            
            return res.json({
                success: true,
                service: 'AnthropicService',
                version: '1.0.0',
                claude: {
                    status: claudeTest.success ? 'connected' : 'unavailable',
                    model: 'claude-sonnet-4-20250514',
                    latency: claudeTest.latency
                },
                capabilities: [
                    'Análisis financiero inmobiliario',
                    'Evaluación de riesgos con IA',
                    'Recomendaciones personalizadas',
                    'Métricas calculadas por IA'
                ],
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                error: 'Error obteniendo información del servicio'
            });
        }
    }
}

module.exports = AnthropicController;