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
 * Búsqueda parametrizada - POST - ACTUALIZADO para flujo de 2 etapas
 */
static searchProperties = asyncErrorHandler(async (req, res) => {
    const { tipo, operacion, ubicacion, maxPaginas, precioMinimo, precioMaximo, moneda, filtros } = req.body;

    logInfo('🔍 Nueva solicitud de búsqueda POST (flujo 2 etapas)', {
        tipo,
        operacion,
        ubicacion,
        maxPaginas,
        tieneFiltrosPrecio: !!(precioMinimo || precioMaximo),
        tieneFiltrosAvanzados: !!(filtros && Object.keys(filtros).length > 0),
        ip: req.ip
    });

    // ==========================================
    // VALIDACIONES BÁSICAS
    // ==========================================
    
    // Validar parámetros requeridos
    SearchController.validateSearchParams({ tipo, operacion, ubicacion });

    // Validar filtros de precio si existen
    if (precioMinimo !== undefined || precioMaximo !== undefined) {
        SearchController.validatePriceFilters(precioMinimo, precioMaximo, moneda);
    }

    // Validar filtros avanzados si existen
    if (filtros && Object.keys(filtros).length > 0) {
        SearchController.validateAdvancedFilters(filtros);
    }

    // Validar maxPaginas
    const maxPaginasValidas = Math.min(Math.max(parseInt(maxPaginas) || 3, 1), 10);
    if (maxPaginasValidas !== (maxPaginas || 3)) {
        logInfo(`maxPaginas ajustado de ${maxPaginas} a ${maxPaginasValidas}`);
    }

    // ==========================================
    // PREPARAR FILTROS PARA EL SERVICIO
    // ==========================================
    
    // Preparar filtros de precio
    const filtrosPrecio = (precioMinimo !== undefined || precioMaximo !== undefined) ? {
        precioMinimo,
        precioMaximo,
        moneda: moneda || 'CLP' // Default a pesos chilenos
    } : null;

    // Preparar filtros avanzados
    const filtrosAvanzados = (filtros && Object.keys(filtros).length > 0) ? filtros : null;

    // ==========================================
    // EJECUTAR BÚSQUEDA CON SERVICIO
    // ==========================================
    
    try {
        logInfo('🚀 Iniciando búsqueda con SearchService (flujo 2 etapas)');
        
        const SearchService = require('../services/search/SearchService');
        const resultado = await SearchService.searchProperties(
            tipo, 
            operacion, 
            ubicacion, 
            maxPaginasValidas, 
            filtrosPrecio, 
            filtrosAvanzados
        );

        // ==========================================
        // PREPARAR RESPUESTA
        // ==========================================
        
        const respuesta = {
            ...resultado,
            metadata: {
                ...resultado.metadata,
                parametros: {
                    tipo,
                    operacion,
                    ubicacion,
                    maxPaginas: maxPaginasValidas,
                    filtrosPrecio,
                    filtrosAvanzados
                },
                flujo: 'Portal Inmobiliario - 2 etapas',
                estadisticas: {
                    propiedadesEncontradas: resultado.data.length,
                    filtrosAplicados: !!(filtrosPrecio || filtrosAvanzados),
                    tiempoProcesamiento: new Date().toISOString()
                }
            }
        };

        logInfo('✅ Búsqueda completada exitosamente', {
            propiedades: resultado.data.length,
            paginasProcesadas: resultado.metadata.resultados.paginasProcesadas,
            filtrosAplicados: resultado.metadata.filtros.aplicados
        });

        res.json(respuesta);

    } catch (error) {
        logError('❌ Error durante búsqueda', {
            error: error.message,
            tipo,
            operacion,
            ubicacion,
            stack: error.stack?.split('\n')[0]
        });

        // Responder con error específico
        const statusCode = error.statusCode || 500;
        const errorResponse = {
            success: false,
            error: error.message,
            codigo: error.name || 'SEARCH_ERROR',
            timestamp: new Date().toISOString(),
            parametros: {
                tipo,
                operacion,
                ubicacion,
                maxPaginas: maxPaginasValidas
            },
            ayuda: {
                problema: 'Error durante la búsqueda de propiedades',
                solucion: 'Verifica los parámetros e intenta nuevamente',
                contacto: 'Si el problema persiste, reporta el error'
            }
        };

        res.status(statusCode).json(errorResponse);
    }
});

/**
 * Búsqueda parametrizada - GET - ACTUALIZADO
 */
static searchPropertiesGet = asyncErrorHandler(async (req, res) => {
    const {
        tipo, operacion, ubicacion, maxPaginas, precioMinimo, precioMaximo, moneda,
        // Filtros avanzados como query parameters
        dormitoriosMin, dormitoriosMax, dormitoriosOpcion,
        banosMin, banosMax, banosOpcion,
        superficieTotalMin, superficieTotalMax, superficieTotalOpcion,
        superficieUtilMin, superficieUtilMax, superficieUtilOpcion,
        estacionamientosMin, estacionamientosMax, estacionamientosOpcion
    } = req.query;

    logInfo('🔍 Nueva solicitud de búsqueda GET (flujo 2 etapas)', {
        tipo,
        operacion,
        ubicacion,
        ip: req.ip
    });

    // Construir objeto de filtros desde query parameters
    const filtros = SearchController.buildFiltersFromQuery(req.query);

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
 * Obtener información sobre el servicio de búsqueda - ACTUALIZADO
 */
static getInfo = asyncErrorHandler(async (req, res) => {
    logInfo('ℹ️ Solicitud de información de búsqueda (flujo 2 etapas)');

    const info = {
        success: true,
        servicio: 'Búsqueda de Propiedades',
        version: '2.1.0-flujo-corregido',
        estado: 'Funcionando con flujo de 2 etapas',
        flujo: {
            descripcion: 'Portal Inmobiliario - Búsqueda en 2 etapas',
            etapa1: 'Configurar búsqueda básica (operación + tipo + ubicación) y ejecutar',
            etapa2: 'Aplicar filtros adicionales en página de resultados',
            ventajas: [
                'Utiliza la interfaz nativa del Portal Inmobiliario',
                'Mayor compatibilidad con actualizaciones del sitio',
                'Filtros aplicados en el contexto correcto'
            ]
        },
        portales_soportados: [
            {
                nombre: 'Portal Inmobiliario',
                dominio: 'portalinmobiliario.com',
                metodo: 'Interfaz nativa de búsqueda',
                flujo: '2 etapas optimizado'
            }
        ],
        parametros_busqueda: {
            requeridos: ['tipo', 'operacion', 'ubicacion'],
            opcionales: ['maxPaginas', 'precioMinimo', 'precioMaximo', 'moneda', 'filtros']
        },
        tipos_propiedad: ['Casa', 'Departamento', 'Oficina', 'Parcela', 'Local', 'Terreno'],
        operaciones: ['Venta', 'Arriendo', 'Arriendo temporal'],
        monedas_precio: ['CLP', 'CLF', 'USD'],
        filtros_avanzados: {
            dormitorios: {
                descripcion: 'Número de dormitorios',
                rango: '0-10',
                opciones: ['0', '1', '2', '3', '4+']
            },
            banos: {
                descripcion: 'Número de baños',
                rango: '1-10',
                opciones: ['1', '2', '3', '4', '5+']
            },
            superficieTotal: {
                descripcion: 'Superficie total en m²',
                rango: '20-2000',
                unidad: 'm²'
            },
            superficieUtil: {
                descripcion: 'Superficie útil en m²',
                rango: '15-1500',
                unidad: 'm²'
            },
            estacionamientos: {
                descripcion: 'Número de estacionamientos',
                rango: '0-10',
                opciones: ['0', '1', '2', '3', '4+']
            }
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
            busqueda_con_precio_uf: {
                tipo: 'Casa',
                operacion: 'Venta',
                ubicacion: 'Concón, Valparaíso',
                maxPaginas: 2,
                precioMinimo: 8800,
                precioMaximo: 9200,
                moneda: 'CLF'
            },
            busqueda_completa: {
                tipo: 'Casa',
                operacion: 'Venta',
                ubicacion: 'Concón, Valparaíso',
                maxPaginas: 2,
                precioMinimo: 8800,
                precioMaximo: 9200,
                moneda: 'CLF',
                filtros: {
                    dormitorios: {
                        minimo: 4,
                        maximo: 5
                    },
                    banos: {
                        minimo: 2,
                        maximo: 4
                    },
                    superficieTotal: {
                        minimo: 140,
                        maximo: 184
                    },
                    estacionamientos: {
                        minimo: 2,
                        maximo: 2
                    }
                }
            }
        },
        notas_tecnicas: {
            flujo_corregido: 'Implementa el flujo real del Portal Inmobiliario',
            compatibilidad: 'Optimizado para cambios en la interfaz del sitio',
            rendimiento: 'Tiempo promedio: 30-60 segundos dependiendo de filtros'
        },
        timestamp: new Date().toISOString()
    };

    res.json(info);
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
 * Validar filtros avanzados - VERSIÓN CORREGIDA con rangos realistas
 */
    static validateAdvancedFilters(filtros) {
        const validFilters = ['dormitorios', 'banos', 'superficieTotal', 'superficieUtil', 'estacionamientos'];

        // Rangos realistas para propiedades en Chile
        const rangosPermitidos = {
            dormitorios: { min: 0, max: 10 },
            banos: { min: 1, max: 10 },
            superficieTotal: { min: 20, max: 2000 }, // m²
            superficieUtil: { min: 15, max: 1500 }, // m²
            estacionamientos: { min: 0, max: 10 }
        };

        for (const [key, value] of Object.entries(filtros)) {
            // 1. Validar que el filtro es válido
            if (!validFilters.includes(key)) {
                throw ErrorFactory.validation(
                    `Filtro "${key}" no es válido. Filtros válidos: ${validFilters.join(', ')}`,
                    'filtros'
                );
            }

            // 2. Validar estructura del filtro
            if (typeof value !== 'object' || value === null) {
                throw ErrorFactory.validation(
                    `El filtro "${key}" debe ser un objeto`,
                    'filtros'
                );
            }

            // 3. Validar que tenga al menos una propiedad válida
            const propiedadesValidas = ['minimo', 'maximo', 'opcion'];
            const tieneAlgunaProp = propiedadesValidas.some(prop => value.hasOwnProperty(prop));

            if (!tieneAlgunaProp) {
                throw ErrorFactory.validation(
                    `El filtro "${key}" debe tener al menos una de estas propiedades: ${propiedadesValidas.join(', ')}`,
                    'filtros'
                );
            }

            // 4. Validar rangos específicos
            const rango = rangosPermitidos[key];

            if (value.minimo !== undefined) {
                const min = Number(value.minimo);
                if (isNaN(min) || min < rango.min || min > rango.max) {
                    throw ErrorFactory.validation(
                        `${key}.minimo debe ser un número entre ${rango.min} y ${rango.max}`,
                        'filtros'
                    );
                }
            }

            if (value.maximo !== undefined) {
                const max = Number(value.maximo);
                if (isNaN(max) || max < rango.min || max > rango.max) {
                    throw ErrorFactory.validation(
                        `${key}.maximo debe ser un número entre ${rango.min} y ${rango.max}`,
                        'filtros'
                    );
                }
            }

            // 5. Validar que mínimo <= máximo
            if (value.minimo !== undefined && value.maximo !== undefined) {
                const min = Number(value.minimo);
                const max = Number(value.maximo);

                if (min > max) {
                    throw ErrorFactory.validation(
                        `En ${key}: el valor mínimo (${min}) debe ser menor o igual al máximo (${max})`,
                        'filtros'
                    );
                }
            }

            // 6. Validar opciones predefinidas si se usan
            if (value.opcion !== undefined) {
                this.validatePredefinedOption(key, value.opcion);
            }
        }
    }

    /**
     * Validar opciones predefinidas para filtros
     */
    static validatePredefinedOption(filterType, option) {
        const opcionesValidas = {
            dormitorios: ['0', '1', '2', '3', '4', '5', '6+'],
            banos: ['1', '2', '3', '4', '5', '6+'],
            superficieTotal: ['100-200', '200-300', '300-450', '450-600', '600+'],
            superficieUtil: ['50-100', '100-150', '150-200', '200-300', '300+'],
            estacionamientos: ['0', '1', '2', '3', '4', '5+']
        };

        const opcionesPermitidas = opcionesValidas[filterType];
        if (opcionesPermitidas && !opcionesPermitidas.includes(option.toString())) {
            throw ErrorFactory.validation(
                `Opción "${option}" no válida para ${filterType}. Opciones válidas: ${opcionesPermitidas.join(', ')}`,
                'filtros'
            );
        }
    }

    /**
     * Validar filtros de precio - VERSIÓN MEJORADA
     */
    static validatePriceFilters(precioMinimo, precioMaximo, moneda = 'CLF') {
        // Rangos actualizados para 2025
        const rangos = {
            'CLP': { min: 10000000, max: 15000000000, nombre: 'Pesos chilenos' }, // 10M - 15B
            'CLF': { min: 100, max: 50000, nombre: 'UF' }, // 100 - 50,000 UF
            'USD': { min: 50000, max: 10000000, nombre: 'Dólares americanos' } // 50K - 10M USD
        };

        // Validar moneda
        if (!rangos[moneda]) {
            throw ErrorFactory.validation(
                `Moneda inválida: "${moneda}". Monedas válidas: ${Object.keys(rangos).join(', ')}`,
                'moneda'
            );
        }

        const rango = rangos[moneda];

        // Validar precio mínimo
        if (precioMinimo !== undefined) {
            const min = Number(precioMinimo);
            if (isNaN(min)) {
                throw ErrorFactory.validation(
                    `Precio mínimo debe ser un número válido`,
                    'precioMinimo'
                );
            }
            if (min < rango.min || min > rango.max) {
                throw ErrorFactory.validation(
                    `Precio mínimo en ${rango.nombre} debe estar entre ${rango.min.toLocaleString()} y ${rango.max.toLocaleString()}`,
                    'precioMinimo'
                );
            }
        }

        // Validar precio máximo
        if (precioMaximo !== undefined) {
            const max = Number(precioMaximo);
            if (isNaN(max)) {
                throw ErrorFactory.validation(
                    `Precio máximo debe ser un número válido`,
                    'precioMaximo'
                );
            }
            if (max < rango.min || max > rango.max) {
                throw ErrorFactory.validation(
                    `Precio máximo en ${rango.nombre} debe estar entre ${rango.min.toLocaleString()} y ${rango.max.toLocaleString()}`,
                    'precioMaximo'
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