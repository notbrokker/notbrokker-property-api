// src/controllers/MortgageController.js (VERSIÓN COMPLETA)
const { logInfo, logError } = require('../utils/logger');
const { ErrorFactory } = require('../utils/errors');
const { asyncErrorHandler } = require('../middleware/errorHandler');

/**
 * Controlador para operaciones de simulación hipotecaria
 */
class MortgageController {
    
    /**
     * Simulación hipotecaria - POST
     */
    static async simulateMortgage(req, res) {
        const { monto, plazo, incluirAnalisis } = req.body;
        
        logInfo('Nueva solicitud de simulación POST', { 
            monto, 
            plazo,
            incluirAnalisis,
            ip: req.ip
        });

        // Validaciones básicas
        MortgageController.validateSimulationParams({ monto, plazo });

        // USAR SERVICIO REAL
        const MortgageService = require('../services/mortgage/MortgageService');
        const resultado = await MortgageService.simulateMortgage(monto, plazo, incluirAnalisis);

        res.json(resultado);
    }

    /**
     * Simulación hipotecaria - GET (query parameters)
     */
    static async simulateMortgageGet(req, res) {
        const { monto, plazo, incluirAnalisis } = req.query;
        
        logInfo('Nueva solicitud de simulación GET', { 
            monto, 
            plazo,
            ip: req.ip
        });

        // Convertir a formato del POST para reutilizar lógica
        req.body = {
            monto: monto ? parseFloat(monto) : undefined,
            plazo: plazo ? parseInt(plazo) : undefined,
            incluirAnalisis: incluirAnalisis === 'true'
        };

        return MortgageController.simulateMortgage(req, res);
    }

    /**
     * Comparar múltiples escenarios de simulación
     */
    static async compareScenarios(req, res) {
        const { escenarios, incluirAnalisis } = req.body;
        
        logInfo('Nueva solicitud de comparación de escenarios', { 
            cantidadEscenarios: escenarios?.length || 0,
            ip: req.ip
        });

        // Validaciones
        MortgageController.validateScenariosParams(escenarios);

        // USAR SERVICIO REAL
        const MortgageService = require('../services/mortgage/MortgageService');
        const resultado = await MortgageService.compareScenarios(escenarios, incluirAnalisis);

        res.json(resultado);
    }

    /**
     * Obtener información sobre el servicio de simulación
     */
    static async getInfo(req, res) {
        logInfo('Solicitud de información de simulación');

        const info = {
            success: true,
            servicio: 'Simulador de Crédito Hipotecario CMF',
            version: '2.0.0-modular',
            estado: 'Funcionando',
            fuente: 'https://servicios.cmfchile.cl/simuladorhipotecario/',
            limitaciones: {
                montoMinimo: '100 UF',
                montoMaximo: '20.000 UF',
                plazoMinimo: '5 años',
                plazoMaximo: '40 años',
                tipoCredito: 'Mutuo No Endosable',
                tipoTasa: 'Fija',
                moneda: 'UF (Unidades de Fomento)'
            },
            endpoints: {
                'POST /api/mortgage/simulate': 'Simulación individual',
                'GET /api/mortgage/simulate': 'Simulación individual (query)',
                'POST /api/mortgage/compare': 'Comparación de escenarios',
                'GET /api/mortgage/info': 'Información del servicio'
            },
            ejemplos: {
                simulacion_basica: {
                    monto: 3000,
                    plazo: 30
                },
                simulacion_con_analisis: {
                    monto: 3000,
                    plazo: 30,
                    incluirAnalisis: true
                },
                comparacion_escenarios: {
                    escenarios: [
                        { monto: 3000, plazo: 20 },
                        { monto: 3000, plazo: 30 },
                        { monto: 4000, plazo: 30 }
                    ],
                    incluirAnalisis: true
                }
            },
            timestamp: new Date().toISOString()
        };

        res.json(info);
    }

    /**
     * Validar parámetros de simulación
     */
    static validateSimulationParams({ monto, plazo }) {
        if (!monto || !plazo) {
            throw ErrorFactory.validation('Los parámetros monto y plazo son requeridos');
        }

        const montoNum = parseFloat(monto);
        if (isNaN(montoNum) || montoNum <= 0 || montoNum > 20000) {
            throw ErrorFactory.validation(
                'El monto debe ser un número entre 100 y 20.000 UF',
                'monto'
            );
        }

        const plazoNum = parseInt(plazo);
        if (isNaN(plazoNum) || plazoNum <= 0 || plazoNum > 40) {
            throw ErrorFactory.validation(
                'El plazo debe ser un número entre 5 y 40 años',
                'plazo'
            );
        }
    }

    /**
     * Validar parámetros de comparación de escenarios
     */
    static validateScenariosParams(escenarios) {
        if (!escenarios || !Array.isArray(escenarios)) {
            throw ErrorFactory.validation('Se requiere un array de escenarios');
        }

        if (escenarios.length === 0) {
            throw ErrorFactory.validation('Debe incluir al menos un escenario');
        }

        if (escenarios.length > 5) {
            throw ErrorFactory.validation('Máximo 5 escenarios por comparación');
        }

        escenarios.forEach((escenario, index) => {
            if (!escenario.monto || !escenario.plazo) {
                throw ErrorFactory.validation(`Escenario ${index + 1}: monto y plazo son requeridos`);
            }

            try {
                MortgageController.validateSimulationParams(escenario);
            } catch (error) {
                throw ErrorFactory.validation(`Escenario ${index + 1}: ${error.message}`);
            }
        });
    }
}

module.exports = MortgageController;