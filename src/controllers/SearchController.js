// src/controllers/SearchController.js
const { logInfo, logError } = require('../utils/logger');
const { ErrorFactory } = require('../utils/errors');
const { asyncErrorHandler } = require('../middleware/errorHandler');

/**
 * Controlador para operaciones de búsqueda de propiedades
 */
class SearchController {

    /**
     * Búsqueda parametrizada - POST
     */

    // src/controllers/SearchController.js (REEMPLAZAR MÉTODO COMPLETO)

    /**
     * Búsqueda parametrizada - POST
     */
    static searchProperties = asyncErrorHandler(async (req, res) => {
        const { tipo, operacion, ubicacion, maxPaginas, precioMinimo, precioMaximo, moneda, filtros } = req.body;

        logInfo('Nueva solicitud de búsqueda POST', {
            tipo,
            operacion,
            ubicacion,
            maxPaginas,
            filtros: filtros ? Object.keys(filtros) : [],
            ip: req.ip
        });

        // Validaciones básicas
        SearchController.validateSearchParams({ tipo, operacion, ubicacion });

        // Validar filtros de precio si existen
        if (precioMinimo !== undefined || precioMaximo !== undefined) {
            SearchController.validatePriceFilters(precioMinimo, precioMaximo, moneda);
        }

        // Validar filtros avanzados si existen
        if (filtros && Object.keys(filtros).length > 0) {
            SearchController.validateAdvancedFilters(filtros);
        }

        // Preparar filtros
        const filtrosPrecio = (precioMinimo !== undefined || precioMaximo !== undefined) ?
            { precioMinimo, precioMaximo, moneda: moneda || 'CLF' } : null;

        // USAR SERVICIO REAL
        const SearchService = require('../services/search/SearchService');
        const resultado = await SearchService.searchProperties(
            tipo, operacion, ubicacion, maxPaginas || 3, filtrosPrecio, filtros
        );

        res.json(resultado);
    });

    /**
     * Búsqueda parametrizada - GET (query parameters)
     */
    static searchPropertiesGet = asyncErrorHandler(async (req, res) => {
        const {
            tipo, operacion, ubicacion, maxPaginas, precioMinimo, precioMaximo, moneda,
            // Filtros avanzados como query parameters
            dormitoriosMin, dormitoriosMax, dormitoriosOpcion,
            banosMin, banosMax, banosOpcion,
            superficieTotalMin, superficieTotalMax, superficieTotalOpcion,
            estacionamientosMin, estacionamientosMax, estacionamientosOpcion
        } = req.query;

        logInfo('Nueva solicitud de búsqueda GET', {
            tipo,
            operacion,
            ubicacion,
            ip: req.ip
        });

        // Construir objeto de filtros desde query parameters
        const filtros = this.buildFiltersFromQuery(req.query);

        // Convertir a formato del POST para reutilizar lógica
        req.body = {
            tipo,
            operacion,
            ubicacion,
            maxPaginas: maxPaginas ? parseInt(maxPaginas) : undefined,
            precioMinimo: precioMinimo ? parseFloat(precioMinimo) : undefined,
            precioMaximo: precioMaximo ? parseFloat(precioMaximo) : undefined,
            moneda,
            filtros: Object.keys(filtros).length > 0 ? filtros : undefined
        };

        return SearchController.searchProperties(req, res);
    });

    /**
     * Obtener información sobre el servicio de búsqueda
     */
    static getInfo = asyncErrorHandler(async (req, res) => {
        logInfo('Solicitud de información de búsqueda');

        const info = {
            success: true,
            servicio: 'Búsqueda de Propiedades',
            version: '2.0.0-modular',
            estado: 'En desarrollo',
            portales_soportados: [
                'Portal Inmobiliario (pendiente)'
            ],
            parametros_busqueda: {
                requeridos: ['tipo', 'operacion', 'ubicacion'],
                opcionales: ['maxPaginas', 'precioMinimo', 'precioMaximo', 'moneda', 'filtros']
            },
            tipos_propiedad: ['Casa', 'Departamento'],
            operaciones: ['Venta', 'Arriendo'],
            monedas_precio: ['CLP', 'CLF', 'USD'],
            filtros_avanzados: {
                dormitorios: 'Número de dormitorios (0-10)',
                banos: 'Número de baños (1-10)',
                superficieTotal: 'Superficie total en m² (20-2000)',
                superficieUtil: 'Superficie útil en m² (15-1500)',
                estacionamientos: 'Número de estacionamientos (0-10)'
            },
            endpoints: {
                'POST /api/search/properties': 'Búsqueda con filtros en body',
                'GET /api/search/properties': 'Búsqueda con filtros en query',
                'GET /api/search/info': 'Información del servicio'
            },
            ejemplos: {
                busqueda_basica: {
                    tipo: 'Casa',
                    operacion: 'Venta',
                    ubicacion: 'Las Condes',
                    maxPaginas: 2
                },
                busqueda_completa_con_filtros: {
                    tipo: "Casa",
                    operacion: "Venta",
                    ubicacion: "Las Condes",
                    maxPaginas: 2,
                    precioMinimo: 3000,
                    precioMaximo: 8000,
                    moneda: "CLF",
                    filtros: {
                        dormitorios: {
                            minimo: 2,
                            maximo: 4
                            // "O alternativamente: 'opcion': '3' para usar links predefinidos"
                        },
                        banos: {
                            minimo: 2,
                            maximo: 3
                            // "O alternativamente: 'opcion': '2'"
                        },
                        superficieTotal: {
                            minimo: 300,
                            maximo: 750
                            // "En metros cuadrados"
                        },
                        superficieUtil: {
                            minimo: 150,
                            maximo: 300
                            // "En metros cuadrados útiles"
                        },
                        estacionamientos: {
                            minimo: 1,
                            maximo: 2
                            // "O alternativamente: 'opcion': '1'"
                        }
                    }
                },
                busqueda_con_opciones_predefinidas: {
                    tipo: "Departamento",
                    operacion: "Venta",
                    ubicacion: "Providencia",
                    filtros: {
                        dormitorios: { opcion: "3" },
                        banos: { opcion: "2" },
                        superficieTotal: { opcion: "300-450" },
                        estacionamientos: { opcion: "1" }
                    }
                }
            },
            timestamp: new Date().toISOString()
        };

        res.json(info);
    });

    /**
     * Validar parámetros básicos de búsqueda
     */
    static validateSearchParams({ tipo, operacion, ubicacion }) {
        if (!tipo || !operacion || !ubicacion) {
            throw ErrorFactory.validation(
                'Los parámetros tipo, operacion y ubicacion son requeridos'
            );
        }

        if (!['Casa', 'Departamento'].includes(tipo)) {
            throw ErrorFactory.validation(
                'El parámetro tipo debe ser "Casa" o "Departamento"',
                'tipo'
            );
        }

        if (!['Venta', 'Arriendo'].includes(operacion)) {
            throw ErrorFactory.validation(
                'El parámetro operacion debe ser "Venta" o "Arriendo"',
                'operacion'
            );
        }
    }

    /**
     * Validar filtros de precio
     */
    static validatePriceFilters(precioMinimo, precioMaximo, moneda = 'CLF') {
        const rangos = {
            'CLP': { min: 1000000, max: 5000000000 },
            'CLF': { min: 50, max: 20000 },
            'USD': { min: 50000, max: 5000000 }
        };

        if (!rangos[moneda]) {
            throw ErrorFactory.validation(
                `Moneda inválida. Valores válidos: ${Object.keys(rangos).join(', ')}`,
                'moneda'
            );
        }

        const rango = rangos[moneda];

        if (precioMinimo !== undefined) {
            const min = parseFloat(precioMinimo);
            if (isNaN(min) || min < rango.min || min > rango.max) {
                throw ErrorFactory.validation(
                    `Precio mínimo debe estar entre ${rango.min} y ${rango.max}`,
                    'precioMinimo'
                );
            }
        }

        if (precioMaximo !== undefined) {
            const max = parseFloat(precioMaximo);
            if (isNaN(max) || max < rango.min || max > rango.max) {
                throw ErrorFactory.validation(
                    `Precio máximo debe estar entre ${rango.min} y ${rango.max}`,
                    'precioMaximo'
                );
            }
        }

        if (precioMinimo !== undefined && precioMaximo !== undefined) {
            if (parseFloat(precioMinimo) >= parseFloat(precioMaximo)) {
                throw ErrorFactory.validation(
                    'El precio mínimo debe ser menor que el precio máximo'
                );
            }
        }
    }

    /**
     * Validar filtros avanzados
     */
    static validateAdvancedFilters(filtros) {
        const validFilters = ['dormitorios', 'banos', 'superficieTotal', 'superficieUtil', 'estacionamientos'];

        for (const [key, value] of Object.entries(filtros)) {
            if (!validFilters.includes(key)) {
                throw ErrorFactory.validation(
                    `Filtro "${key}" no es válido. Filtros válidos: ${validFilters.join(', ')}`,
                    'filtros'
                );
            }

            // Validar estructura del filtro
            if (typeof value !== 'object' || value === null) {
                throw ErrorFactory.validation(
                    `El filtro "${key}" debe ser un objeto`,
                    'filtros'
                );
            }

            // Validar que tenga minimo, maximo o opcion
            if (!value.minimo && !value.maximo && !value.opcion) {
                throw ErrorFactory.validation(
                    `El filtro "${key}" debe tener "minimo", "maximo" o "opcion"`,
                    'filtros'
                );
            }
        }
    }

    /**
     * Construir filtros desde query parameters
     */
    static buildFiltersFromQuery(query) {
        const filtros = {};

        // Dormitorios
        if (query.dormitoriosMin || query.dormitoriosMax || query.dormitoriosOpcion) {
            filtros.dormitorios = {};
            if (query.dormitoriosOpcion) {
                filtros.dormitorios.opcion = query.dormitoriosOpcion;
            } else {
                if (query.dormitoriosMin) filtros.dormitorios.minimo = parseInt(query.dormitoriosMin);
                if (query.dormitoriosMax) filtros.dormitorios.maximo = parseInt(query.dormitoriosMax);
            }
        }

        // Baños
        if (query.banosMin || query.banosMax || query.banosOpcion) {
            filtros.banos = {};
            if (query.banosOpcion) {
                filtros.banos.opcion = query.banosOpcion;
            } else {
                if (query.banosMin) filtros.banos.minimo = parseInt(query.banosMin);
                if (query.banosMax) filtros.banos.maximo = parseInt(query.banosMax);
            }
        }

        // Superficie Total
        if (query.superficieTotalMin || query.superficieTotalMax || query.superficieTotalOpcion) {
            filtros.superficieTotal = {};
            if (query.superficieTotalOpcion) {
                filtros.superficieTotal.opcion = query.superficieTotalOpcion;
            } else {
                if (query.superficieTotalMin) filtros.superficieTotal.minimo = parseFloat(query.superficieTotalMin);
                if (query.superficieTotalMax) filtros.superficieTotal.maximo = parseFloat(query.superficieTotalMax);
            }
        }

        // Estacionamientos
        if (query.estacionamientosMin || query.estacionamientosMax || query.estacionamientosOpcion) {
            filtros.estacionamientos = {};
            if (query.estacionamientosOpcion) {
                filtros.estacionamientos.opcion = query.estacionamientosOpcion;
            } else {
                if (query.estacionamientosMin) filtros.estacionamientos.minimo = parseInt(query.estacionamientosMin);
                if (query.estacionamientosMax) filtros.estacionamientos.maximo = parseInt(query.estacionamientosMax);
            }
        }

        return filtros;
    }

    /**
     * Generar resultados mock para testing
     */
    static generateMockResults(tipo, operacion, ubicacion) {
        return [
            {
                titulo: `${tipo} en ${ubicacion} - Resultado 1`,
                precio: '$150.000.000',
                moneda: '$',
                ubicacion: ubicacion,
                dormitorios: '3',
                banos: '2',
                superficie: '120 m²',
                link: 'https://ejemplo.com/propiedad1',
                imagen: 'https://ejemplo.com/imagen1.jpg',
                posicion: 1,
                pagina: 1
            },
            {
                titulo: `${tipo} en ${ubicacion} - Resultado 2`,
                precio: '$180.000.000',
                moneda: '$',
                ubicacion: ubicacion,
                dormitorios: '4',
                banos: '3',
                superficie: '150 m²',
                link: 'https://ejemplo.com/propiedad2',
                imagen: 'https://ejemplo.com/imagen2.jpg',
                posicion: 2,
                pagina: 1
            }
        ];
    }
}

module.exports = SearchController;