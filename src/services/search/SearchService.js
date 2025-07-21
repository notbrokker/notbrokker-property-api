// src/services/search/SearchService.js
const { chromium } = require('playwright');
const { logInfo, logError, logDebug } = require('../../utils/logger');
const { ErrorFactory } = require('../../utils/errors');

/**
 * Servicio de búsqueda de propiedades con soporte para UF y pesos
 */
class SearchService {

    /**
 * Búsqueda de propiedades con flujo correcto en 2 etapas
 */
    static async searchProperties(tipo, operacion, ubicacion, maxPaginas = 3, filtrosPrecio = null, filtrosAvanzados = null) {
        logInfo('🔍 Iniciando búsqueda con flujo correcto de Portal Inmobiliario', {
            tipo, operacion, ubicacion, maxPaginas,
            filtrosPrecio: !!filtrosPrecio,
            filtrosAvanzados: !!filtrosAvanzados
        });

        const browser = await this.launchBrowser();
        let context, page;

        try {
            context = await this.createContext(browser);
            page = await context.newPage();

            // ==========================================
            // ETAPA 1: BÚSQUEDA INICIAL
            // ==========================================
            logInfo('📍 ETAPA 1: Configurando búsqueda inicial');

            // 1.1 Navegar a la página principal
            const urlBase = 'https://www.portalinmobiliario.com';
            await page.goto(urlBase, {
                timeout: 30000,
                waitUntil: 'domcontentloaded'
            });

            // 1.2 Esperar que cargue la interfaz de búsqueda
            await this.esperarCargaBusquedaInicial(page);

            // 1.3 Configurar la búsqueda básica
            await this.configurarBusquedaBasica(page, tipo, operacion, ubicacion);

            // 1.4 Ejecutar búsqueda inicial
            await this.ejecutarBusquedaInicial(page);

            // ==========================================
            // ETAPA 2: APLICAR FILTROS EN RESULTADOS
            // ==========================================
            logInfo('🎛️ ETAPA 2: Aplicando filtros en página de resultados');

            // 2.1 Esperar que cargue la página de resultados
            await this.esperarCargaPaginaResultados(page);

            // 2.2 Aplicar filtros adicionales si existen
            let filtrosAplicados = false;
            if (filtrosPrecio || filtrosAvanzados) {
                try {
                    await this.aplicarFiltrosEnResultados(page, filtrosPrecio, filtrosAvanzados);
                    filtrosAplicados = true;

                    // Esperar que se actualicen los resultados
                    await page.waitForTimeout(5000);
                    await this.esperarCargaPaginaResultados(page);

                } catch (error) {
                    logError('Error aplicando filtros, continuando sin filtros', { error: error.message });
                    filtrosAplicados = false;
                }
            }

            // ==========================================
            // ETAPA 3: EXTRAER PROPIEDADES
            // ==========================================
            logInfo('📋 ETAPA 3: Extrayendo propiedades de resultados');

            const todasLasPropiedades = [];
            let paginaActual = 1;
            let paginasSinResultados = 0;
            const maxPaginasSinResultados = 2;

            while (paginaActual <= maxPaginas && paginasSinResultados < maxPaginasSinResultados) {
                logInfo(`📄 Procesando página ${paginaActual}/${maxPaginas}`);

                try {
                    await this.esperarCargaPaginaResultados(page);
                    const propiedadesPagina = await this.extraerPropiedadesPagina(page, paginaActual);

                    if (propiedadesPagina.length === 0) {
                        paginasSinResultados++;
                        logInfo(`⚠️ Página ${paginaActual} sin resultados (${paginasSinResultados}/${maxPaginasSinResultados})`);

                        if (paginasSinResultados >= maxPaginasSinResultados) {
                            break;
                        }
                    } else {
                        paginasSinResultados = 0;
                        todasLasPropiedades.push(...propiedadesPagina);
                        logInfo(`✅ Página ${paginaActual}: ${propiedadesPagina.length} propiedades extraídas`);
                    }

                    // Navegar a siguiente página
                    if (paginaActual < maxPaginas) {
                        const navegacionExitosa = await this.navegarSiguientePagina(page);
                        if (!navegacionExitosa) {
                            break;
                        }
                        await page.waitForTimeout(3000);
                    }

                } catch (error) {
                    logError(`Error procesando página ${paginaActual}`, { error: error.message });
                    paginasSinResultados++;
                }

                paginaActual++;
            }

            // Validación final de resultados
            let propiedadesFiltradas = todasLasPropiedades;
            if (filtrosAplicados && todasLasPropiedades.length > 0) {
                propiedadesFiltradas = this.validarResultadosContraFiltros(todasLasPropiedades, filtrosPrecio, filtrosAvanzados);
            }

            logInfo(`✅ Búsqueda completada: ${propiedadesFiltradas.length} propiedades encontradas`);

            return {
                success: true,
                data: propiedadesFiltradas,
                metadata: {
                    busqueda: {
                        tipo,
                        operacion,
                        ubicacion,
                        flujo: 'Portal Inmobiliario 2 etapas'
                    },
                    resultados: {
                        totalPropiedades: propiedadesFiltradas.length,
                        propiedadesOriginales: todasLasPropiedades.length,
                        paginasProcesadas: paginaActual - 1
                    },
                    filtros: {
                        aplicados: filtrosAplicados,
                        precio: filtrosPrecio,
                        avanzados: filtrosAvanzados
                    },
                    timestamp: new Date().toISOString()
                }
            };

        } catch (error) {
            logError('❌ Error durante búsqueda', { error: error.message });
            throw ErrorFactory.searchFailed({ tipo, operacion, ubicacion }, error);

        } finally {
            try {
                if (context) await context.close();
                await browser.close();
                logDebug('🔒 Browser cerrado');
            } catch (closeError) {
                logError('Error cerrando browser', { error: closeError.message });
            }
        }
    }

    /**
     * Esperar carga de la interfaz de búsqueda inicial
     */
    static async esperarCargaBusquedaInicial(page) {
        try {
            logInfo('⏳ Esperando carga de interfaz de búsqueda...');

            // Esperar elementos principales de búsqueda
            const selectoresBusqueda = [
                '.faceted-search-desktop__main-container',
                'button[aria-label="Tipo de operación"]',
                'button[aria-label="Tipo de propiedad"]',
                'input[placeholder*="comuna"]'
            ];

            for (const selector of selectoresBusqueda) {
                await page.waitForSelector(selector, { timeout: 10000 });
            }

            await page.waitForTimeout(2000);
            logInfo('✅ Interfaz de búsqueda cargada');

        } catch (error) {
            logError('Error esperando interfaz de búsqueda', { error: error.message });
            throw error;
        }
    }

    /**
     * Configurar búsqueda básica (operación + tipo + ubicación)
     */
    static async configurarBusquedaBasica(page, tipo, operacion, ubicacion) {
        try {
            logInfo('⚙️ Configurando búsqueda básica', { tipo, operacion, ubicacion });

            // 1. SELECCIONAR TIPO DE OPERACIÓN
            await this.seleccionarTipoOperacion(page, operacion);
            await page.waitForTimeout(1000);

            // 2. SELECCIONAR TIPO DE PROPIEDAD  
            await this.seleccionarTipoPropiedad(page, tipo);
            await page.waitForTimeout(1000);

            // 3. INGRESAR UBICACIÓN
            await this.ingresarUbicacion(page, ubicacion);
            await page.waitForTimeout(1000);

            logInfo('✅ Búsqueda básica configurada correctamente');

        } catch (error) {
            logError('Error configurando búsqueda básica', { error: error.message });
            throw error;
        }
    }

    /**
     * Seleccionar tipo de operación (Venta/Arriendo)
     */
    static async seleccionarTipoOperacion(page, operacion) {
        try {
            logInfo(`📝 Seleccionando operación: ${operacion}`);

            // Hacer click en el dropdown de operación
            const selectorDropdownOperacion = 'button[aria-label="Tipo de operación"]';
            await page.waitForSelector(selectorDropdownOperacion, { timeout: 10000 });
            await page.click(selectorDropdownOperacion);

            // Esperar que aparezca el menú
            await page.waitForTimeout(1000);

            // Buscar y hacer click en la opción correcta
            const textoOperacion = operacion === 'Venta' ? 'Venta' :
                operacion === 'Arriendo' ? 'Arriendo' :
                    'Venta'; // default

            const selectorOpcion = `span:has-text("${textoOperacion}")`;
            await page.waitForSelector(selectorOpcion, { timeout: 5000 });
            await page.click(selectorOpcion);

            logInfo(`✅ Operación seleccionada: ${textoOperacion}`);

        } catch (error) {
            logError(`Error seleccionando operación ${operacion}`, { error: error.message });
            throw error;
        }
    }

    /**
     * Seleccionar tipo de propiedad (Casa/Departamento)
     */
    static async seleccionarTipoPropiedad(page, tipo) {
        try {
            logInfo(`🏠 Seleccionando tipo de propiedad: ${tipo}`);

            // Hacer click en el dropdown de tipo de propiedad
            const selectorDropdownTipo = 'button[aria-label="Tipo de propiedad"]';
            await page.waitForSelector(selectorDropdownTipo, { timeout: 10000 });
            await page.click(selectorDropdownTipo);

            // Esperar que aparezca el menú
            await page.waitForTimeout(1000);

            // Mapear tipos
            const textoTipo = tipo === 'Casa' ? 'Casas' :
                tipo === 'Departamento' ? 'Departamentos' :
                    'Casas'; // default

            const selectorOpcion = `span:has-text("${textoTipo}")`;
            await page.waitForSelector(selectorOpcion, { timeout: 5000 });
            await page.click(selectorOpcion);

            logInfo(`✅ Tipo de propiedad seleccionado: ${textoTipo}`);

        } catch (error) {
            logError(`Error seleccionando tipo ${tipo}`, { error: error.message });
            throw error;
        }
    }

    /**
     * Ingresar ubicación
     */
    static async ingresarUbicacion(page, ubicacion) {
        try {
            logInfo(`📍 Ingresando ubicación: ${ubicacion}`);

            // Hacer click y llenar el campo de ubicación
            const selectorUbicacion = 'input[placeholder*="comuna"], input[placeholder*="ciudad"]';
            await page.waitForSelector(selectorUbicacion, { timeout: 10000 });

            // Limpiar y escribir ubicación
            await page.click(selectorUbicacion);
            await page.fill(selectorUbicacion, '');
            await page.type(selectorUbicacion, ubicacion, { delay: 100 });

            // Esperar sugerencias y seleccionar la primera
            await page.waitForTimeout(2000);

            try {
                const selectorSugerencia = '.faceted-search-highlighted-text';
                await page.waitForSelector(selectorSugerencia, { timeout: 3000 });
                await page.click(selectorSugerencia);
                logInfo('✅ Sugerencia de ubicación seleccionada');
            } catch (error) {
                logInfo('ℹ️ Sin sugerencias, usando texto ingresado');
            }

            logInfo(`✅ Ubicación ingresada: ${ubicacion}`);

        } catch (error) {
            logError(`Error ingresando ubicación ${ubicacion}`, { error: error.message });
            throw error;
        }
    }

    /**
     * Ejecutar búsqueda inicial
     */
    static async ejecutarBusquedaInicial(page) {
        try {
            logInfo('🔍 Ejecutando búsqueda inicial...');

            // Hacer click en el botón "Buscar"
            const selectoresBuscar = [
                'button:has-text("Buscar")',
                '.andes-button:has-text("Buscar")',
                '.faceted-search-desktop__elem-actions button'
            ];

            let botonEncontrado = false;
            for (const selector of selectoresBuscar) {
                try {
                    await page.waitForSelector(selector, { timeout: 3000 });
                    await page.click(selector);
                    botonEncontrado = true;
                    logInfo(`✅ Búsqueda ejecutada con selector: ${selector}`);
                    break;
                } catch (error) {
                    continue;
                }
            }

            if (!botonEncontrado) {
                throw new Error('No se encontró el botón de búsqueda');
            }

            // Esperar navegación a resultados
            await page.waitForTimeout(3000);
            await page.waitForLoadState('domcontentloaded');

            logInfo('✅ Búsqueda inicial completada');

        } catch (error) {
            logError('Error ejecutando búsqueda inicial', { error: error.message });
            throw error;
        }
    }

    /**
     * Esperar carga de página de resultados
     */
    static async esperarCargaPaginaResultados(page) {
        try {
            logInfo('⏳ Esperando carga de página de resultados...');

            // Esperar elementos de la página de resultados
            const selectoresResultados = [
                '.ui-search-filter-dl', // Filtros laterales
                '.andes-card.poly-card', // Tarjetas de propiedades
                '.ui-search-layout__item', // Items de resultados
                '.ui-search-money-picker-desktop' // Selector de moneda
            ];

            let resultadosEncontrados = false;
            for (const selector of selectoresResultados) {
                try {
                    await page.waitForSelector(selector, { timeout: 8000 });
                    resultadosEncontrados = true;
                    logInfo(`✅ Página de resultados cargada: ${selector}`);
                    break;
                } catch (error) {
                    continue;
                }
            }

            if (!resultadosEncontrados) {
                logInfo('⚠️ No se detectaron elementos de resultados, continuando...');
            }

            await page.waitForTimeout(2000);

        } catch (error) {
            logError('Error esperando página de resultados', { error: error.message });
        }
    }

    /**
     * Aplicar filtros en la página de resultados
     */
    static async aplicarFiltrosEnResultados(page, filtrosPrecio, filtrosAvanzados) {
        try {
            logInfo('🎛️ Aplicando filtros en página de resultados');

            // Aplicar filtros de precio primero
            if (filtrosPrecio) {
                await this.aplicarFiltrosPrecioEnResultados(page, filtrosPrecio);
                await page.waitForTimeout(2000);
            }

            // Aplicar filtros avanzados después
            if (filtrosAvanzados) {
                await this.aplicarFiltrosAvanzadosEnResultados(page, filtrosAvanzados);
                await page.waitForTimeout(2000);
            }

            logInfo('✅ Filtros aplicados en página de resultados');

        } catch (error) {
            logError('Error aplicando filtros en resultados', { error: error.message });
            throw error;
        }
    }


    /**
 * Aplicar filtros de precio en página de resultados
 */
static async aplicarFiltrosPrecioEnResultados(page, filtrosPrecio) {
    const { precioMinimo, precioMaximo, moneda } = filtrosPrecio;

    try {
        logInfo('💰 Aplicando filtros de precio en resultados', { precioMinimo, precioMaximo, moneda });

        // 1. SELECCIONAR MONEDA CORRECTA
        if (moneda) {
            await this.seleccionarMonedaEnResultados(page, moneda);
        }

        // 2. APLICAR RANGO DE PRECIOS
        if (precioMinimo !== undefined || precioMaximo !== undefined) {
            await this.aplicarRangoPrecioEnResultados(page, precioMinimo, precioMaximo);
        }

        logInfo('✅ Filtros de precio aplicados en resultados');

    } catch (error) {
        logError('Error aplicando filtros de precio en resultados', { error: error.message });
        throw error;
    }
}

/**
 * Seleccionar moneda en página de resultados
 */
static async seleccionarMonedaEnResultados(page, moneda) {
    try {
        logInfo(`💱 Seleccionando moneda en resultados: ${moneda}`);

        // Mapear moneda a ID del botón
        const monedaId = moneda === 'CLF' ? 'CLF' : 
                        moneda === 'CLP' ? 'CLP' : 
                        moneda === 'USD' ? 'USD' : 
                        'CLP'; // default

        const selectorMoneda = `button[id="${monedaId}"]`;
        
        // Verificar si ya está seleccionado (disabled)
        await page.waitForSelector(selectorMoneda, { timeout: 5000 });
        const yaSeleccionado = await page.isDisabled(selectorMoneda);

        if (!yaSeleccionado) {
            await page.click(selectorMoneda);
            logInfo(`✅ Moneda seleccionada: ${monedaId}`);
            
            // Esperar que se actualice la página
            await page.waitForTimeout(3000);
            await this.esperarCargaPaginaResultados(page);
        } else {
            logInfo(`✅ Moneda ${monedaId} ya estaba seleccionada`);
        }

    } catch (error) {
        logError(`Error seleccionando moneda ${moneda}`, { error: error.message });
        throw error;
    }
}

/**
 * Aplicar rango de precios en página de resultados
 */
static async aplicarRangoPrecioEnResultados(page, precioMinimo, precioMaximo) {
    try {
        logInfo('💵 Aplicando rango de precios', { precioMinimo, precioMaximo });

        // Selectores para el formulario de precio
        const selectorFormulario = '.ui-search-range-filter--price';
        const selectorMinimo = 'input[data-testid="Minimum-price"]';
        const selectorMaximo = 'input[data-testid="Maximum-price"]';
        const selectorBotonAplicar = '.ui-search-range-filter--price .ui-search-range-filter__action-btn';

        // Esperar que aparezca el formulario
        await page.waitForSelector(selectorFormulario, { timeout: 10000 });

        // Aplicar precio mínimo
        if (precioMinimo !== undefined) {
            try {
                await page.waitForSelector(selectorMinimo, { timeout: 5000 });
                await page.fill(selectorMinimo, precioMinimo.toString());
                logInfo(`✅ Precio mínimo aplicado: ${precioMinimo}`);
            } catch (error) {
                logError(`Error aplicando precio mínimo: ${error.message}`);
            }
        }

        // Aplicar precio máximo
        if (precioMaximo !== undefined) {
            try {
                await page.waitForSelector(selectorMaximo, { timeout: 5000 });
                await page.fill(selectorMaximo, precioMaximo.toString());
                logInfo(`✅ Precio máximo aplicado: ${precioMaximo}`);
            } catch (error) {
                logError(`Error aplicando precio máximo: ${error.message}`);
            }
        }

        // Hacer click en "Aplicar"
        if (precioMinimo !== undefined || precioMaximo !== undefined) {
            try {
                await page.waitForSelector(selectorBotonAplicar, { timeout: 5000 });
                
                // Verificar si el botón está habilitado
                const botonHabilitado = !(await page.isDisabled(selectorBotonAplicar));
                if (botonHabilitado) {
                    await page.click(selectorBotonAplicar);
                    logInfo('✅ Filtro de precio activado');
                    
                    // Esperar actualización de resultados
                    await page.waitForTimeout(5000);
                } else {
                    logInfo('⚠️ Botón de aplicar precio deshabilitado');
                }
                
            } catch (error) {
                logError(`Error activando filtro de precio: ${error.message}`);
            }
        }

    } catch (error) {
        logError('Error aplicando rango de precios', { error: error.message });
        throw error;
    }
}

/**
 * CORRECCIÓN: Aplicar filtros avanzados con manejo robusto de errores
 */
static async aplicarFiltrosAvanzadosEnResultados(page, filtrosAvanzados) {
    try {
        logInfo('🏠 Aplicando filtros avanzados en resultados (versión robusta)', filtrosAvanzados);

        const filtrosExitosos = [];
        const filtrosFallidos = [];

        // Procesar cada tipo de filtro con manejo individual de errores
        for (const [tipoFiltro, configFiltro] of Object.entries(filtrosAvanzados)) {
            try {
                logInfo(`🎯 Intentando aplicar filtro: ${tipoFiltro}`, configFiltro);
                
                // Verificar que el browser y página sigan activos
                if (page.isClosed()) {
                    logError('Browser cerrado, deteniendo aplicación de filtros');
                    break;
                }

                await this.aplicarFiltroEspecificoEnResultados(page, tipoFiltro, configFiltro);
                filtrosExitosos.push(tipoFiltro);
                
                // Pausa entre filtros SOLO si el filtro fue exitoso
                await page.waitForTimeout(1500);
                
            } catch (error) {
                logError(`❌ Error aplicando filtro ${tipoFiltro}`, { error: error.message });
                filtrosFallidos.push({ filtro: tipoFiltro, error: error.message });
                
                // NO romper el loop, continuar con otros filtros
                logInfo(`Continuando con otros filtros...`);
            }
        }

        // Log de resumen
        logInfo('📊 Resumen de aplicación de filtros', {
            exitosos: filtrosExitosos,
            fallidos: filtrosFallidos.map(f => f.filtro),
            totalProcesados: Object.keys(filtrosAvanzados).length
        });

        // Considerar exitoso si al menos la mitad de los filtros se aplicaron
        const exito = filtrosExitosos.length >= Math.ceil(Object.keys(filtrosAvanzados).length / 2);
        
        if (exito) {
            logInfo('✅ Filtros avanzados aplicados (al menos parcialmente)');
        } else {
            logInfo('⚠️ La mayoría de filtros fallaron, continuando sin filtros avanzados');
        }

    } catch (error) {
        logError('❌ Error general en filtros avanzados', { error: error.message });
        logInfo('Continuando sin filtros avanzados...');
        // NO lanzar error, permitir continuar
    }
}

/**
 * CORRECCIÓN: Esperar carga de página de resultados con manejo robusto
 */
static async esperarCargaPaginaResultados(page) {
    try {
        logInfo('⏳ Esperando carga de página de resultados (versión robusta)...');

        // Verificar que la página no esté cerrada
        if (page.isClosed()) {
            logError('Página cerrada, no se puede esperar carga');
            throw new Error('Página cerrada');
        }

        // Esperar elementos de la página de resultados con múltiples opciones
        const selectoresResultados = [
            '.ui-search-filter-dl', // Filtros laterales
            '.andes-card.poly-card', // Tarjetas de propiedades
            '.ui-search-layout__item', // Items de resultados  
            '.ui-search-money-picker-desktop', // Selector de moneda
            '.ui-search-results', // Contenedor de resultados
            '.ui-search-layout', // Layout de búsqueda
            '.search-results' // Fallback genérico
        ];

        let resultadosEncontrados = false;
        let selectorExitoso = null;

        // Intentar cada selector con timeout individual
        for (const selector of selectoresResultados) {
            try {
                await page.waitForSelector(selector, { timeout: 5000 });
                const elementos = await page.locator(selector).count();
                
                if (elementos > 0) {
                    resultadosEncontrados = true;
                    selectorExitoso = selector;
                    logInfo(`✅ Página de resultados cargada: ${selector} (${elementos} elementos)`);
                    break;
                }
            } catch (error) {
                logDebug(`Selector no encontrado: ${selector}`);
                continue;
            }
        }

        if (!resultadosEncontrados) {
            logInfo('⚠️ No se detectaron elementos específicos, verificando carga básica...');
            
            // Verificación básica: que la página responda
            try {
                await page.waitForLoadState('domcontentloaded', { timeout: 10000 });
                const titulo = await page.title();
                const url = page.url();
                
                logInfo(`📄 Página básica cargada: "${titulo}" en ${url}`);
                
                // Si llegamos aquí, al menos la página cargó
                resultadosEncontrados = true;
                
            } catch (error) {
                logError('Error en verificación básica de página', { error: error.message });
                throw error;
            }
        }

        // Pausa adicional para asegurar carga completa
        await page.waitForTimeout(2000);

        return resultadosEncontrados;

    } catch (error) {
        logError('❌ Error esperando página de resultados', { error: error.message });
        
        // En lugar de lanzar error, intentar continuar
        logInfo('Intentando continuar con extracción básica...');
        return false;
    }
}

/**
 * CORRECCIÓN: Método searchProperties con manejo robusto de errores
 */
static async searchProperties(tipo, operacion, ubicacion, maxPaginas = 3, filtrosPrecio = null, filtrosAvanzados = null) {
    logInfo('🔍 Iniciando búsqueda con manejo robusto de errores', {
        tipo, operacion, ubicacion, maxPaginas
    });

    const browser = await this.launchBrowser();
    let context, page;

    try {
        context = await this.createContext(browser);
        page = await context.newPage();

        // ETAPA 1: Búsqueda inicial con timeout extendido
        logInfo('📍 ETAPA 1: Configurando búsqueda inicial');
        
        const urlBase = 'https://www.portalinmobiliario.com';
        await page.goto(urlBase, {
            timeout: 45000, // Timeout extendido
            waitUntil: 'domcontentloaded'
        });

        await this.esperarCargaBusquedaInicial(page);
        await this.configurarBusquedaBasica(page, tipo, operacion, ubicacion);
        await this.ejecutarBusquedaInicial(page);

        // ETAPA 2: Aplicar filtros con manejo robusto
        logInfo('🎛️ ETAPA 2: Aplicando filtros (con manejo robusto)');
        
        const cargaResultadosExitosa = await this.esperarCargaPaginaResultados(page);
        
        let filtrosAplicados = false;
        if (cargaResultadosExitosa && (filtrosPrecio || filtrosAvanzados)) {
            try {
                logInfo('Intentando aplicar filtros...');
                await this.aplicarFiltrosEnResultados(page, filtrosPrecio, filtrosAvanzados);
                filtrosAplicados = true;
                
                // Verificar que la página siga funcionando después de filtros
                if (!page.isClosed()) {
                    await page.waitForTimeout(3000);
                    await this.esperarCargaPaginaResultados(page);
                }
                
            } catch (error) {
                logError('Error aplicando filtros, continuando sin filtros', { error: error.message });
                filtrosAplicados = false;
            }
        } else {
            logInfo('Saltando aplicación de filtros (página no cargó correctamente o sin filtros)');
        }

        // ETAPA 3: Extraer propiedades con fallbacks
        logInfo('📋 ETAPA 3: Extrayendo propiedades (con fallbacks)');
        
        const todasLasPropiedades = [];
        let paginaActual = 1;
        let intentosExtracciones = 0;
        const maxIntentosExtraccion = 3;

        while (paginaActual <= maxPaginas && intentosExtracciones < maxIntentosExtraccion) {
            try {
                logInfo(`📄 Procesando página ${paginaActual}/${maxPaginas}`);

                // Verificar que el browser siga activo
                if (page.isClosed()) {
                    logError('Browser cerrado durante extracción, terminando');
                    break;
                }

                await this.esperarCargaPaginaResultados(page);
                const propiedadesPagina = await this.extraerPropiedadesPagina(page, paginaActual);

                if (propiedadesPagina.length === 0) {
                    logInfo(`⚠️ Página ${paginaActual} sin resultados`);
                    intentosExtracciones++;
                    
                    if (intentosExtracciones >= maxIntentosExtraccion) {
                        logInfo('Demasiadas páginas sin resultados, terminando');
                        break;
                    }
                } else {
                    intentosExtracciones = 0; // Reset contador
                    todasLasPropiedades.push(...propiedadesPagina);
                    logInfo(`✅ Página ${paginaActual}: ${propiedadesPagina.length} propiedades extraídas`);
                }

                // Navegar a siguiente página si no es la última
                if (paginaActual < maxPaginas) {
                    const navegacionExitosa = await this.navegarSiguientePagina(page);
                    if (!navegacionExitosa) {
                        logInfo('No se pudo navegar a siguiente página, terminando');
                        break;
                    }
                    await page.waitForTimeout(2000);
                }

            } catch (error) {
                logError(`Error procesando página ${paginaActual}`, { error: error.message });
                intentosExtracciones++;
                
                if (intentosExtracciones >= maxIntentosExtraccion) {
                    logInfo('Demasiados errores de extracción, terminando');
                    break;
                }
            }

            paginaActual++;
        }

        // Validación final de resultados
        let propiedadesFiltradas = todasLasPropiedades;
        if (filtrosAplicados && todasLasPropiedades.length > 0) {
            try {
                propiedadesFiltradas = this.validarResultadosContraFiltros(todasLasPropiedades, filtrosPrecio, filtrosAvanzados);
            } catch (error) {
                logError('Error en validación final, usando resultados sin validar', { error: error.message });
            }
        }

        logInfo(`✅ Búsqueda completada: ${propiedadesFiltradas.length} propiedades encontradas`);

        return {
            success: true,
            data: propiedadesFiltradas,
            metadata: {
                busqueda: { tipo, operacion, ubicacion },
                resultados: {
                    totalPropiedades: propiedadesFiltradas.length,
                    propiedadesOriginales: todasLasPropiedades.length,
                    paginasProcesadas: paginaActual - 1
                },
                filtros: {
                    aplicados: filtrosAplicados,
                    precio: filtrosPrecio,
                    avanzados: filtrosAvanzados
                },
                estado: {
                    busquedaInicialExitosa: true,
                    cargaResultadosExitosa,
                    filtrosAplicados,
                    extraccionCompleta: todasLasPropiedades.length > 0
                },
                timestamp: new Date().toISOString()
            }
        };

    } catch (error) {
        logError('❌ Error crítico durante búsqueda', { error: error.message });
        throw ErrorFactory.searchFailed({ tipo, operacion, ubicacion }, error);

    } finally {
        // Cierre seguro del browser
        try {
            if (page && !page.isClosed()) {
                await page.close();
            }
            if (context) {
                await context.close();
            }
            if (browser && browser.isConnected()) {
                await browser.close();
            }
            logDebug('🔒 Browser cerrado correctamente');
        } catch (closeError) {
            logError('Error cerrando browser', { error: closeError.message });
        }
    }
}

/**
 * CORRECCIÓN: Aplicar filtro específico en página de resultados
 * Problema: Selector de estacionamientos incorrecto
 */
static async aplicarFiltroEspecificoEnResultados(page, tipoFiltro, configFiltro) {
    const { minimo, maximo, opcion } = configFiltro;
    
    logInfo(`🔧 Aplicando filtro específico: ${tipoFiltro}`, { minimo, maximo, opcion });

    // CORRECCIÓN: Mapeo actualizado con selectores reales del HTML
    const mapeoFiltros = {
        'dormitorios': {
            formulario: '.ui-search-range-filter--BEDROOMS',
            inputMin: 'input[data-testid="Minimum-BEDROOMS"]',
            inputMax: 'input[data-testid="Maximum-BEDROOMS"]',
            botonAplicar: '.ui-search-range-filter--BEDROOMS .ui-search-range-filter__action-btn'
        },
        'banos': {
            formulario: '.ui-search-range-filter--FULL_BATHROOMS',
            inputMin: 'input[data-testid="Minimum-FULL_BATHROOMS"]',
            inputMax: 'input[data-testid="Maximum-FULL_BATHROOMS"]',
            botonAplicar: '.ui-search-range-filter--FULL_BATHROOMS .ui-search-range-filter__action-btn'
        },
        'superficieTotal': {
            formulario: '.ui-search-range-filter--TOTAL_AREA',
            inputMin: 'input[data-testid="Minimum-TOTAL_AREA"]',
            inputMax: 'input[data-testid="Maximum-TOTAL_AREA"]',
            botonAplicar: '.ui-search-range-filter--TOTAL_AREA .ui-search-range-filter__action-btn'
        },
        'superficieUtil': {
            formulario: '.ui-search-range-filter--COVERED_AREA',
            inputMin: 'input[data-testid="Minimum-COVERED_AREA"]',
            inputMax: 'input[data-testid="Maximum-COVERED_AREA"]',
            botonAplicar: '.ui-search-range-filter--COVERED_AREA .ui-search-range-filter__action-btn'
        },
        'estacionamientos': {
            // CORRECCIÓN: Selector correcto según el HTML real
            formulario: '.ui-search-range-filter--PARKING_LOTS',
            inputMin: 'input[data-testid="Minimum-PARKING_LOTS"]',
            inputMax: 'input[data-testid="Maximum-PARKING_LOTS"]',
            botonAplicar: '.ui-search-range-filter--PARKING_LOTS .ui-search-range-filter__action-btn',
            // ALTERNATIVA: Si no existe el formulario, usar enlaces directos
            alternativaEnlaces: true
        }
    };

    const selectores = mapeoFiltros[tipoFiltro];
    if (!selectores) {
        logError(`Tipo de filtro no soportado: ${tipoFiltro}`);
        return;
    }

    try {
        // 1. VERIFICAR SI EXISTE EL FORMULARIO (con timeout reducido para estacionamientos)
        const timeoutFormulario = tipoFiltro === 'estacionamientos' ? 3000 : 8000;
        
        try {
            await page.waitForSelector(selectores.formulario, { timeout: timeoutFormulario });
            logInfo(`✅ Formulario encontrado para ${tipoFiltro}`);
            
            // Aplicar método normal de formulario
            await this.aplicarFiltroFormulario(page, tipoFiltro, selectores, minimo, maximo);
            
        } catch (formularioError) {
            logInfo(`⚠️ Formulario no encontrado para ${tipoFiltro}, intentando método alternativo`);
            
            // MÉTODO ALTERNATIVO: Enlaces directos (especialmente para estacionamientos)
            if (selectores.alternativaEnlaces || tipoFiltro === 'estacionamientos') {
                await this.aplicarFiltroMedianteEnlacesMejorado(page, tipoFiltro, configFiltro);
            } else {
                throw formularioError;
            }
        }

    } catch (error) {
        logError(`Error general aplicando filtro ${tipoFiltro}`, { error: error.message });
        
        // NO lanzar error, solo continuar con otros filtros
        logInfo(`Continuando con otros filtros sin ${tipoFiltro}`);
    }
}

/**
 * Aplicar filtro usando formulario (método normal)
 */
static async aplicarFiltroFormulario(page, tipoFiltro, selectores, minimo, maximo) {
    // 1. APLICAR VALOR MÍNIMO
    if (minimo !== undefined) {
        try {
            await page.waitForSelector(selectores.inputMin, { timeout: 5000 });
            await page.fill(selectores.inputMin, minimo.toString());
            logInfo(`✅ ${tipoFiltro} mínimo aplicado: ${minimo}`);
        } catch (error) {
            logError(`Error aplicando ${tipoFiltro} mínimo: ${error.message}`);
        }
    }

    // 2. APLICAR VALOR MÁXIMO
    if (maximo !== undefined) {
        try {
            await page.waitForSelector(selectores.inputMax, { timeout: 5000 });
            await page.fill(selectores.inputMax, maximo.toString());
            logInfo(`✅ ${tipoFiltro} máximo aplicado: ${maximo}`);
        } catch (error) {
            logError(`Error aplicando ${tipoFiltro} máximo: ${error.message}`);
        }
    }

    // 3. ACTIVAR FILTRO
    if (minimo !== undefined || maximo !== undefined) {
        try {
            await page.waitForSelector(selectores.botonAplicar, { timeout: 5000 });
            
            const botonHabilitado = !(await page.isDisabled(selectores.botonAplicar));
            if (botonHabilitado) {
                await page.click(selectores.botonAplicar);
                logInfo(`✅ Filtro ${tipoFiltro} activado`);
                await page.waitForTimeout(4000);
            } else {
                logInfo(`⚠️ Botón de ${tipoFiltro} deshabilitado`);
            }
            
        } catch (error) {
            logError(`Error activando filtro ${tipoFiltro}: ${error.message}`);
        }
    }
}

static async aplicarFiltroMedianteEnlacesMejorado(page, tipoFiltro, configFiltro) {
    try {
        logInfo(`🔗 Aplicando ${tipoFiltro} mediante método simplificado`, configFiltro);

        // Solo manejar estacionamientos por ahora (los otros filtros que funcionaron)
        if (tipoFiltro === 'estacionamientos') {
            await this.aplicarEstacionamientosEspecial(page, configFiltro);
        } else {
            logInfo(`⚠️ Filtro ${tipoFiltro} se saltará (formulario no encontrado)`);
        }

    } catch (error) {
        logError(`Error aplicando ${tipoFiltro} mediante enlaces: ${error.message}`);
    }
}


/**
 * PASO 2: Agrega este método si no existe:
 */
static encontrarRangoApropiado(minimo, maximo, rangosDisponibles) {
    // Método simple - solo retorna el primer rango para evitar errores
    return rangosDisponibles.length > 0 ? rangosDisponibles[0] : null;
}

/**
 * NUEVO: Aplicar estacionamientos con estrategia especial
 */
static async aplicarEstacionamientosEspecial(page, configFiltro) {
    const { minimo, maximo, opcion } = configFiltro;
    
    try {
        logInfo('🚗 Aplicando filtro de estacionamientos con estrategia especial', configFiltro);

        // Estrategia 1: Usar valor específico si está en el rango
        let valorAUsar = opcion;
        
        if (!valorAUsar && minimo !== undefined && maximo !== undefined) {
            // Si es un rango específico como minimo:2, maximo:2, usar ese valor
            if (minimo === maximo) {
                valorAUsar = minimo.toString();
            } else {
                // Para rango amplio, usar el mínimo
                valorAUsar = minimo.toString();
            }
        } else if (!valorAUsar && minimo !== undefined) {
            valorAUsar = minimo.toString();
        }

        if (valorAUsar) {
            // Selectores específicos para enlaces de estacionamientos según HTML
            const selectoresEstacionamientos = [
                `a[href*="_Cocheras_${valorAUsar}"]:has-text("${valorAUsar} estacionamiento")`,
                `a[href*="_Cocheras_${valorAUsar}"]`,
                `a:has-text("${valorAUsar} estacionamiento")`,
                `a:has-text("${valorAUsar} estacionamientos")`
            ];

            // Casos especiales
            if (valorAUsar === '0') {
                selectoresEstacionamientos.unshift(
                    'a[href*="_Cocheras_No-tiene"]:has-text("No tiene estacionamientos")',
                    'a:has-text("No tiene estacionamientos")'
                );
            } else if (parseInt(valorAUsar) >= 4) {
                selectoresEstacionamientos.unshift(
                    'a[href*="_PARKING*LOTS_4-*"]:has-text("4 estacionamientos o más")',
                    'a:has-text("4 estacionamientos o más")'
                );
            }

            // Intentar hacer click en el enlace
            for (const selector of selectoresEstacionamientos) {
                try {
                    await page.waitForSelector(selector, { timeout: 3000 });
                    await page.click(selector);
                    logInfo(`✅ Estacionamientos aplicado mediante enlace: ${valorAUsar}`);
                    await page.waitForTimeout(4000);
                    return;
                } catch (error) {
                    logDebug(`Enlace estacionamientos no encontrado: ${selector}`);
                    continue;
                }
            }
        }

        logInfo('⚠️ No se pudo aplicar filtro de estacionamientos, continuando sin él');

    } catch (error) {
        logError(`Error en estrategia especial de estacionamientos: ${error.message}`);
    }
}

/**
 * Hacer click en enlace de filtro específico
 */
static async clickEnlaceFiltro(page, tipoFiltro, valor) {
    let selectores = [];
    
    switch (tipoFiltro) {
        case 'dormitorios':
            if (valor === '4' || valor === '5' || parseInt(valor) >= 4) {
                selectores = [
                    'a[href*="mas-de-4-dormitorios"]:has-text("4 dormitorios o más")',
                    'a:has-text("4 dormitorios o más")'
                ];
            } else {
                selectores = [
                    `a[href*="${valor}-dormitorio"]:has-text("${valor} dormitorio")`,
                    `a:has-text("${valor} dormitorio")`
                ];
            }
            break;
            
        case 'banos':
            if (valor === '5' || parseInt(valor) >= 5) {
                selectores = [
                    'a[href*="_Banos_5-o-mas"]:has-text("5 baños o más")',
                    'a:has-text("5 baños o más")'
                ];
            } else {
                selectores = [
                    `a[href*="_Banos_${valor}"]:has-text("${valor} baño")`,
                    `a:has-text("${valor} baño")`
                ];
            }
            break;
    }

    for (const selector of selectores) {
        try {
            await page.waitForSelector(selector, { timeout: 3000 });
            await page.click(selector);
            logInfo(`✅ ${tipoFiltro} aplicado mediante enlace: ${valor}`);
            await page.waitForTimeout(4000);
            return;
        } catch (error) {
            continue;
        }
    }
    
    logInfo(`⚠️ No se encontró enlace para ${tipoFiltro}: ${valor}`);
}

static construirURLBase() {
    return 'https://www.portalinmobiliario.com';
}

/**
 * Aplicar filtro mediante enlace directo en página de resultados
 */
static async aplicarFiltroMedianteEnlaceEnResultados(page, tipoFiltro, opcion) {
    try {
        logInfo(`🔗 Intentando aplicar ${tipoFiltro} mediante enlace: ${opcion}`);

        // Construir selectores de enlaces según el HTML de resultados
        let selectorEnlace;
        
        switch (tipoFiltro) {
            case 'dormitorios':
                if (opcion === '4' || opcion === '5') {
                    // Para 4+ dormitorios usar el enlace especial
                    selectorEnlace = `a[href*="mas-de-4-dormitorios"]`;
                } else {
                    selectorEnlace = `a[href*="${opcion}-dormitorio"]`;
                }
                break;
            case 'banos':
                if (opcion === '5') {
                    selectorEnlace = `a[href*="_Banos_5-o-mas"]`;
                } else {
                    selectorEnlace = `a[href*="_Banos_${opcion}"]`;
                }
                break;
            case 'estacionamientos':
                if (opcion === '4' || opcion === '5') {
                    selectorEnlace = `a[href*="_PARKING*LOTS_4-*"]`;
                } else if (opcion === '0') {
                    selectorEnlace = `a[href*="_Cocheras_No-tiene"]`;
                } else {
                    selectorEnlace = `a[href*="_Cocheras_${opcion}"]`;
                }
                break;
            default:
                logDebug(`No hay enlace directo para ${tipoFiltro}`);
                return;
        }

        // Intentar hacer click en el enlace
        await page.waitForSelector(selectorEnlace, { timeout: 5000 });
        await page.click(selectorEnlace);
        logInfo(`✅ Filtro ${tipoFiltro} aplicado mediante enlace: ${opcion}`);
        
        // Esperar actualización de resultados
        await page.waitForTimeout(5000);
        
    } catch (error) {
        logDebug(`No se pudo aplicar ${tipoFiltro} mediante enlace: ${error.message}`);
    }
}

/**
 * Configuración específica del browser para Portal Inmobiliario
 */
static async launchBrowser() {
    return await chromium.launch({
        headless: true, // Portal Inmobiliario puede requerir interacción visual
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled',
            '--disable-web-security',
            '--disable-features=VizDisplayCompositor',
            '--disable-background-timer-throttling',
            '--disable-renderer-backgrounding'
        ]
    });
}

/**
 * Crear contexto optimizado para Portal Inmobiliario
 */
static async createContext(browser) {
    return await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 },
        extraHTTPHeaders: {
            'Accept-Language': 'es-CL,es;q=0.9,en;q=0.8',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
        },
        // Ignorar errores de SSL en caso de problemas de certificados
        ignoreHTTPSErrors: true
    });
}
    

    /**
     * Validar que los resultados cumplen con los filtros aplicados
     */
    static validarResultadosContraFiltros(propiedades, filtrosPrecio, filtrosAvanzados) {
        try {
            logInfo('🔍 Validando resultados contra filtros aplicados...');

            return propiedades.filter(propiedad => {
                let cumpleFiltros = true;

                // Validar filtros de precio
                if (filtrosPrecio && cumpleFiltros) {
                    cumpleFiltros = this.validarFiltroPrecio(propiedad, filtrosPrecio);
                }

                // Validar filtros avanzados
                if (filtrosAvanzados && cumpleFiltros) {
                    cumpleFiltros = this.validarFiltrosAvanzados(propiedad, filtrosAvanzados);
                }

                return cumpleFiltros;
            });

        } catch (error) {
            logError('Error validando resultados', { error: error.message });
            return propiedades; // Devolver todas si hay error en validación
        }
    }


    /**
     * Validar filtro de precio individual
     */
    static validarFiltroPrecio(propiedad, filtrosPrecio) {
        try {
            const { precioMinimo, precioMaximo } = filtrosPrecio;

            // Extraer precio numérico de la propiedad
            let precioNumerico = null;

            // Intentar extraer precio de diferentes campos
            const precioTexto = propiedad.precio_uf || propiedad.precio_clp || propiedad.precio || '';
            const match = precioTexto.toString().match(/[\d.,]+/);

            if (match) {
                precioNumerico = parseFloat(match[0].replace(/[.,]/g, ''));
            }

            if (precioNumerico === null) {
                return true; // Si no se puede extraer precio, no filtrar
            }

            // Validar rangos
            if (precioMinimo && precioNumerico < precioMinimo) {
                return false;
            }

            if (precioMaximo && precioNumerico > precioMaximo) {
                return false;
            }

            return true;

        } catch (error) {
            return true; // En caso de error, no filtrar
        }
    }

    /**
     * Validar filtros avanzados individual
     */
    static validarFiltrosAvanzados(propiedad, filtrosAvanzados) {
        try {
            for (const [tipoFiltro, configFiltro] of Object.entries(filtrosAvanzados)) {
                if (!this.validarFiltroIndividual(propiedad, tipoFiltro, configFiltro)) {
                    return false;
                }
            }
            return true;
        } catch (error) {
            return true; // En caso de error, no filtrar
        }
    }

    /**
     * Validar filtro individual (dormitorios, baños, etc.)
     */
    static validarFiltroIndividual(propiedad, tipoFiltro, configFiltro) {
        try {
            const { minimo, maximo } = configFiltro;

            // Mapear campo de propiedad según tipo de filtro
            let campoPropiedad;
            switch (tipoFiltro) {
                case 'dormitorios':
                    campoPropiedad = propiedad.dormitorios;
                    break;
                case 'banos':
                    campoPropiedad = propiedad.banos;
                    break;
                case 'superficieTotal':
                case 'superficieUtil':
                    campoPropiedad = propiedad.superficie;
                    break;
                case 'estacionamientos':
                    // Los estacionamientos generalmente vienen en características
                    campoPropiedad = propiedad.estacionamientos || 'No disponible';
                    break;
                default:
                    return true;
            }

            if (!campoPropiedad || campoPropiedad === 'No disponible') {
                return true; // Si no hay información, no filtrar
            }

            // Extraer número del texto
            const match = campoPropiedad.toString().match(/(\d+)/);
            if (!match) {
                return true;
            }

            const valorNumerico = parseInt(match[1]);

            // Validar rangos
            if (minimo && valorNumerico < minimo) {
                return false;
            }

            if (maximo && valorNumerico > maximo) {
                return false;
            }

            return true;

        } catch (error) {
            return true; // En caso de error, no filtrar
        }
    }

    /**
     * Lanzar browser
     */
    static async launchBrowser() {
        return await chromium.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--disable-web-security'
            ]
        });
    }

    /**
     * Crear contexto
     */
    static async createContext(browser) {
        return await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            viewport: { width: 1920, height: 1080 },
            extraHTTPHeaders: {
                'Accept-Language': 'es-CL,es;q=0.9,en;q=0.8'
            }
        });
    }

    /**
 * Construir URL de búsqueda corregida para Portal Inmobiliario
 */
    static construirURLBusqueda(tipo, operacion, ubicacion) {
        try {
            logInfo('🔗 Construyendo URL de búsqueda', { tipo, operacion, ubicacion });

            const baseURL = 'https://www.portalinmobiliario.com';

            // Mapear operación (más específico)
            const operacionMap = {
                'Venta': 'venta',
                'Arriendo': 'arriendo',
                'Arriendo temporal': 'arriendo-temporal'
            };

            // Mapear tipo de propiedad (más específico según el HTML)
            const tipoMap = {
                'Casa': 'casa',
                'Departamento': 'departamento',
                'Departamentos': 'departamento', // Alternativa
                'Casas': 'casa', // Alternativa
                'Oficina': 'oficina',
                'Oficinas': 'oficina',
                'Parcela': 'parcela',
                'Parcelas': 'parcela',
                'Local': 'local',
                'Locales': 'local',
                'Terreno': 'terreno',
                'Terrenos': 'terreno',
                'Bodega': 'bodega',
                'Bodegas': 'bodega'
            };

            const operacionURL = operacionMap[operacion] || 'venta';
            const tipoURL = tipoMap[tipo] || 'casa';

            // Limpiar y formatear ubicación más robustamente
            let ubicacionURL = ubicacion
                .toLowerCase()
                .replace(/[áàäâ]/g, 'a')
                .replace(/[éèëê]/g, 'e')
                .replace(/[íìïî]/g, 'i')
                .replace(/[óòöô]/g, 'o')
                .replace(/[úùüû]/g, 'u')
                .replace(/ñ/g, 'n')
                .replace(/[^\w\s-]/g, '') // Remover caracteres especiales
                .replace(/\s+/g, '-') // Reemplazar espacios con guiones
                .replace(/^-+|-+$/g, ''); // Remover guiones al inicio y final

            const urlCompleta = `${baseURL}/${operacionURL}/${tipoURL}/${ubicacionURL}`;

            logInfo('✅ URL construida', { url: urlCompleta });
            return urlCompleta;

        } catch (error) {
            logError('Error construyendo URL', { error: error.message });
            // URL de fallback
            return 'https://www.portalinmobiliario.com/venta/casa/santiago';
        }
    }

    /**
     * Esperar carga de página con validación de filtros
     */
    static async esperarCargaPagina(page) {
        try {
            logInfo('⏳ Esperando carga de página con validación de filtros...');

            // 1. Esperar carga básica
            await page.waitForLoadState('domcontentloaded');
            await page.waitForTimeout(3000);

            // 2. Esperar elementos de filtros (indica que la página está completamente cargada)
            const selectoresFiltros = [
                '.ui-search-filter-dl', // Contenedor de filtros
                '.ui-search-money-picker-desktop', // Selector de moneda
                'input[data-testid*="Minimum"]', // Inputs de filtros
                '.faceted-search-desktop' // Barra de búsqueda
            ];

            let filtrosEncontrados = false;
            for (const selector of selectoresFiltros) {
                try {
                    await page.waitForSelector(selector, { timeout: 8000 });
                    logDebug(`✓ Filtros cargados: ${selector}`);
                    filtrosEncontrados = true;
                    break;
                } catch (error) {
                    logDebug(`Filtro no encontrado: ${selector}`);
                    continue;
                }
            }

            if (!filtrosEncontrados) {
                logInfo('⚠️ No se encontraron elementos de filtros, pero continuando...');
            }

            // 3. Esperar propiedades o elementos de búsqueda
            const selectoresPropiedades = [
                '.andes-card.poly-card',
                '.ui-search-layout__item',
                '.property-item',
                '.ui-search-layout', // Contenedor de resultados
                '.ui-search-results' // Resultados de búsqueda
            ];

            let propiedadesEncontradas = false;
            for (const selector of selectoresPropiedades) {
                try {
                    await page.waitForSelector(selector, { timeout: 8000 });
                    const elementos = await page.locator(selector).count();
                    if (elementos > 0) {
                        logDebug(`✓ ${elementos} propiedades encontradas con selector: ${selector}`);
                        propiedadesEncontradas = true;
                        break;
                    }
                } catch (error) {
                    continue;
                }
            }

            if (!propiedadesEncontradas) {
                logInfo('⚠️ No se encontraron propiedades inmediatamente, esperando más tiempo...');
                await page.waitForTimeout(5000);
            }

            // 4. Verificar si hay resultados o mensaje de "sin resultados"
            try {
                const sinResultados = await page.locator(':text("No encontramos publicaciones"), :text("sin resultados"), :text("No hay resultados")').count();
                if (sinResultados > 0) {
                    logInfo('⚠️ Página indica que no hay resultados para los filtros aplicados');
                }
            } catch (error) {
                // Continuar normalmente
            }

            logInfo('✅ Página cargada completamente');
            return true;

        } catch (error) {
            logError('Error esperando carga de página', { error: error.message });
            return false;
        }
    }

    /**
 * Aplicar filtros de precio y características - VERSIÓN CORREGIDA
 */
    static async aplicarFiltros(page, filtrosPrecio, filtrosAvanzados) {
        try {
            logInfo('🎛️ Aplicando filtros corregidos', {
                precio: !!filtrosPrecio,
                avanzados: !!filtrosAvanzados
            });

            // 1. APLICAR FILTROS DE PRECIO PRIMERO
            if (filtrosPrecio) {
                await this.aplicarFiltrosPrecioCorregido(page, filtrosPrecio);
            }

            // 2. APLICAR FILTROS AVANZADOS DESPUÉS
            if (filtrosAvanzados) {
                await this.aplicarFiltrosAvanzadosCorregido(page, filtrosAvanzados);
            }

            // 3. ESPERAR Y ACTIVAR BÚSQUEDA
            await page.waitForTimeout(2000);

            // Buscar botón de aplicar filtros o buscar
            const botonesBuscar = [
                'button:has-text("Buscar")',
                'button:has-text("Aplicar")',
                '.faceted-search-desktop__elem-actions button',
                'input[type="submit"]'
            ];

            for (const selectorBoton of botonesBuscar) {
                try {
                    await page.waitForSelector(selectorBoton, { timeout: 3000 });
                    await page.click(selectorBoton);
                    logInfo(`✅ Filtros aplicados con botón: ${selectorBoton}`);
                    break;
                } catch (error) {
                    logDebug(`Botón no encontrado: ${selectorBoton}`);
                    continue;
                }
            }

            // Esperar a que se apliquen los filtros
            await page.waitForTimeout(3000);
            await page.waitForLoadState('domcontentloaded');

            logInfo('✅ Filtros aplicados correctamente');

        } catch (error) {
            logError('Error aplicando filtros', { error: error.message });
            // No lanzar error, continuar sin filtros
        }
    }

    /**
     * Aplicar filtros de precio corregido para Portal Inmobiliario
     */
    static async aplicarFiltrosPrecioCorregido(page, filtrosPrecio) {
        const { precioMinimo, precioMaximo, moneda } = filtrosPrecio;

        try {
            logInfo('💰 Aplicando filtros de precio corregidos', { precioMinimo, precioMaximo, moneda });

            // 1. SELECCIONAR MONEDA CORRECTA
            if (moneda) {
                const selectorMoneda = `button[id="${moneda}"]`;
                try {
                    await page.waitForSelector(selectorMoneda, { timeout: 5000 });

                    // Verificar si ya está seleccionado
                    const yaSeleccionado = await page.isDisabled(selectorMoneda);
                    if (!yaSeleccionado) {
                        await page.click(selectorMoneda);
                        logInfo(`✅ Moneda seleccionada: ${moneda}`);
                        await page.waitForTimeout(1000);
                    } else {
                        logInfo(`✅ Moneda ${moneda} ya estaba seleccionada`);
                    }
                } catch (error) {
                    logError(`Error seleccionando moneda ${moneda}: ${error.message}`);
                }
            }

            // 2. APLICAR PRECIO MÍNIMO
            if (precioMinimo) {
                const selectoresPrecioMin = [
                    'input[data-testid="Minimum-price"]',
                    'input[name="Minimum"]',
                    'input[placeholder*="Mínimo"]',
                    '.ui-search-range-filter input:first-child'
                ];

                for (const selector of selectoresPrecioMin) {
                    try {
                        await page.waitForSelector(selector, { timeout: 3000 });
                        await page.fill(selector, precioMinimo.toString());
                        logInfo(`✅ Precio mínimo aplicado: ${precioMinimo}`);
                        break;
                    } catch (error) {
                        logDebug(`Selector precio mínimo no encontrado: ${selector}`);
                        continue;
                    }
                }
            }

            // 3. APLICAR PRECIO MÁXIMO
            if (precioMaximo) {
                const selectoresPrecioMax = [
                    'input[data-testid="Maximum-price"]',
                    'input[name="Maximum"]',
                    'input[placeholder*="Máximo"]',
                    '.ui-search-range-filter input:last-child'
                ];

                for (const selector of selectoresPrecioMax) {
                    try {
                        await page.waitForSelector(selector, { timeout: 3000 });
                        await page.fill(selector, precioMaximo.toString());
                        logInfo(`✅ Precio máximo aplicado: ${precioMaximo}`);
                        break;
                    } catch (error) {
                        logDebug(`Selector precio máximo no encontrado: ${selector}`);
                        continue;
                    }
                }
            }

            // 4. ACTIVAR FILTRO DE PRECIO
            try {
                const botonAplicarPrecio = '.ui-search-range-filter__action-btn';
                await page.waitForSelector(botonAplicarPrecio, { timeout: 3000 });
                await page.click(botonAplicarPrecio);
                await page.waitForTimeout(1000);
                logInfo('✅ Filtro de precio activado');
            } catch (error) {
                logDebug('No se pudo activar el filtro de precio con botón específico');
            }

        } catch (error) {
            logError('Error aplicando filtros de precio', { error: error.message });
        }
    }

    /**
     * Aplicar filtros avanzados corregido (dormitorios, baños, superficie, estacionamientos)
     */
    static async aplicarFiltrosAvanzadosCorregido(page, filtrosAvanzados) {
        try {
            logInfo('🏠 Aplicando filtros avanzados corregidos', filtrosAvanzados);

            // Procesar cada tipo de filtro
            for (const [tipoFiltro, configFiltro] of Object.entries(filtrosAvanzados)) {
                try {
                    await this.aplicarFiltroEspecifico(page, tipoFiltro, configFiltro);
                    await page.waitForTimeout(1000); // Pausa entre filtros
                } catch (error) {
                    logError(`Error aplicando filtro ${tipoFiltro}`, { error: error.message });
                }
            }

        } catch (error) {
            logError('Error aplicando filtros avanzados', { error: error.message });
        }
    }

    /**
     * Aplicar un filtro específico (dormitorios, baños, etc.)
     */
    static async aplicarFiltroEspecifico(page, tipoFiltro, configFiltro) {
        const { minimo, maximo, opcion } = configFiltro;

        logInfo(`🎯 Aplicando filtro ${tipoFiltro}`, { minimo, maximo, opcion });

        // Mapeo de filtros a sus selectores
        const mapeoFiltros = {
            'dormitorios': {
                inputMin: 'input[data-testid="Minimum-BEDROOMS"]',
                inputMax: 'input[data-testid="Maximum-BEDROOMS"]',
                botonAplicar: '.ui-search-range-filter--BEDROOMS .ui-search-range-filter__action-btn'
            },
            'banos': {
                inputMin: 'input[data-testid="Minimum-FULL_BATHROOMS"]',
                inputMax: 'input[data-testid="Maximum-FULL_BATHROOMS"]',
                botonAplicar: '.ui-search-range-filter--FULL_BATHROOMS .ui-search-range-filter__action-btn'
            },
            'superficieTotal': {
                inputMin: 'input[data-testid="Minimum-TOTAL_AREA"]',
                inputMax: 'input[data-testid="Maximum-TOTAL_AREA"]',
                botonAplicar: '.ui-search-range-filter--TOTAL_AREA .ui-search-range-filter__action-btn'
            },
            'superficieUtil': {
                inputMin: 'input[data-testid="Minimum-COVERED_AREA"]',
                inputMax: 'input[data-testid="Maximum-COVERED_AREA"]',
                botonAplicar: '.ui-search-range-filter--COVERED_AREA .ui-search-range-filter__action-btn'
            },
            'estacionamientos': {
                inputMin: 'input[data-testid="Minimum-PARKING_LOTS"]',
                inputMax: 'input[data-testid="Maximum-PARKING_LOTS"]',
                botonAplicar: '.ui-search-range-filter--PARKING_LOTS .ui-search-range-filter__action-btn'
            }
        };

        const selectores = mapeoFiltros[tipoFiltro];
        if (!selectores) {
            logError(`Tipo de filtro no soportado: ${tipoFiltro}`);
            return;
        }

        try {
            // 1. APLICAR VALOR MÍNIMO
            if (minimo !== undefined) {
                try {
                    await page.waitForSelector(selectores.inputMin, { timeout: 5000 });
                    await page.fill(selectores.inputMin, minimo.toString());
                    logInfo(`✅ ${tipoFiltro} mínimo aplicado: ${minimo}`);
                } catch (error) {
                    logError(`Error aplicando ${tipoFiltro} mínimo: ${error.message}`);
                }
            }

            // 2. APLICAR VALOR MÁXIMO
            if (maximo !== undefined) {
                try {
                    await page.waitForSelector(selectores.inputMax, { timeout: 5000 });
                    await page.fill(selectores.inputMax, maximo.toString());
                    logInfo(`✅ ${tipoFiltro} máximo aplicado: ${maximo}`);
                } catch (error) {
                    logError(`Error aplicando ${tipoFiltro} máximo: ${error.message}`);
                }
            }

            // 3. ACTIVAR FILTRO
            if (minimo !== undefined || maximo !== undefined) {
                try {
                    await page.waitForSelector(selectores.botonAplicar, { timeout: 3000 });
                    await page.click(selectores.botonAplicar);
                    logInfo(`✅ Filtro ${tipoFiltro} activado`);
                    await page.waitForTimeout(1500); // Esperar aplicación
                } catch (error) {
                    logError(`Error activando filtro ${tipoFiltro}: ${error.message}`);
                }
            }

            // 4. MÉTODO ALTERNATIVO: Enlaces directos si los inputs no funcionan
            if (opcion !== undefined) {
                await this.aplicarFiltroMedianteEnlace(page, tipoFiltro, opcion);
            }

        } catch (error) {
            logError(`Error general aplicando filtro ${tipoFiltro}`, { error: error.message });
        }
    }

    /**
     * Aplicar filtro mediante enlace directo (método alternativo)
     */
    static async aplicarFiltroMedianteEnlace(page, tipoFiltro, opcion) {
        try {
            // Construir selectores de enlaces según el HTML proporcionado
            let selectorEnlace;

            switch (tipoFiltro) {
                case 'dormitorios':
                    selectorEnlace = `a[href*="${opcion}-dormitorio"]`;
                    break;
                case 'banos':
                    selectorEnlace = `a[href*="_Banos_${opcion}"]`;
                    break;
                case 'estacionamientos':
                    selectorEnlace = `a[href*="_Cocheras_${opcion}"]`;
                    break;
                default:
                    logDebug(`No hay enlace directo para ${tipoFiltro}`);
                    return;
            }

            await page.waitForSelector(selectorEnlace, { timeout: 3000 });
            await page.click(selectorEnlace);
            logInfo(`✅ Filtro ${tipoFiltro} aplicado mediante enlace: ${opcion}`);

        } catch (error) {
            logDebug(`No se pudo aplicar ${tipoFiltro} mediante enlace: ${error.message}`);
        }
    }

    /**
     * Aplicar filtros de precio
     */
    static async aplicarFiltrosPrecio(page, filtrosPrecio) {
        const { precioMinimo, precioMaximo, moneda } = filtrosPrecio;

        try {
            // Buscar inputs de precio
            const precioMinSelector = 'input[name="precio_desde"], input[id*="precio"][id*="min"]';
            const precioMaxSelector = 'input[name="precio_hasta"], input[id*="precio"][id*="max"]';

            if (precioMinimo) {
                await page.fill(precioMinSelector, precioMinimo.toString());
            }

            if (precioMaximo) {
                await page.fill(precioMaxSelector, precioMaximo.toString());
            }

            // Aplicar filtros
            const aplicarBtn = 'button:has-text("Aplicar"), button:has-text("Buscar")';
            await page.click(aplicarBtn);

        } catch (error) {
            logDebug('No se pudieron aplicar filtros de precio');
        }
    }

    /**
     * Aplicar filtros avanzados
     */
    static async aplicarFiltrosAvanzados(page, filtrosAvanzados) {
        // Implementación básica - se puede expandir según necesidades
        logDebug('Aplicando filtros avanzados', filtrosAvanzados);
    }

    /**
     * Esperar carga de página
     */
    static async esperarCargaPagina(page) {
        try {
            await page.waitForLoadState('domcontentloaded');
            await page.waitForTimeout(2000);

            // Esperar elementos de propiedades
            const selectoresPropiedades = [
                '.andes-card.poly-card',
                '.ui-search-layout__item',
                '.property-item'
            ];

            for (const selector of selectoresPropiedades) {
                try {
                    await page.waitForSelector(selector, { timeout: 5000 });
                    logDebug(`Propiedades encontradas con selector: ${selector}`);
                    break;
                } catch (error) {
                    continue;
                }
            }

        } catch (error) {
            logDebug('Timeout esperando carga, continuando...');
        }
    }

    /**
 * CORRECCIÓN: Extraer propiedades con detección mejorada
 */
static async extraerPropiedadesPagina(page, numeroPagina) {
    try {
        logInfo(`📋 Extrayendo propiedades de página ${numeroPagina} (versión mejorada)`);

        // Verificar que la página esté activa
        if (page.isClosed()) {
            logError('Página cerrada, no se pueden extraer propiedades');
            return [];
        }

        // Selectores más amplios para tarjetas de propiedades
        const selectoresTarjetas = [
            '.andes-card.poly-card', // Selector principal
            '.ui-search-layout__item', // Alternativo 1
            '.property-card', // Alternativo 2
            '.search-result-item', // Alternativo 3
            '.listing-item', // Alternativo 4
            '.property-listing', // Alternativo 5
            '.ui-search-item', // Genérico
            '[class*="card"][class*="property"]', // Genérico con atributos
            '.andes-card', // Muy genérico
            'article', // Súper genérico
            '[data-testid*="item"]', // Por data-testid
            '[class*="result"]' // Último recurso
        ];

        let tarjetas = [];
        let selectorExitoso = null;

        // Intentar cada selector hasta encontrar elementos
        for (const selector of selectoresTarjetas) {
            try {
                // Esperar un poco a que carguen los elementos
                await page.waitForSelector(selector, { timeout: 8000 });
                tarjetas = await page.locator(selector).all();
                
                if (tarjetas.length > 0) {
                    selectorExitoso = selector;
                    logInfo(`✅ ${tarjetas.length} tarjetas encontradas con selector: ${selector}`);
                    break;
                }
            } catch (error) {
                logDebug(`Selector no encontrado: ${selector}`);
                continue;
            }
        }

        // Si no encontramos tarjetas, intentar método alternativo
        if (tarjetas.length === 0) {
            logInfo('⚠️ No se encontraron tarjetas con selectores estándar, intentando extracción alternativa...');
            return await this.extraccionAlternativaPropiedades(page, numeroPagina);
        }

        // Extraer propiedades de las tarjetas encontradas
        const propiedades = [];
        const maxPropiedades = Math.min(tarjetas.length, 50); // Limitar para evitar timeouts

        for (let i = 0; i < maxPropiedades; i++) {
            try {
                const tarjeta = tarjetas[i];
                
                // Verificar que la tarjeta sea válida
                const esVisible = await tarjeta.isVisible();
                if (!esVisible) {
                    logDebug(`Tarjeta ${i + 1} no visible, saltando...`);
                    continue;
                }

                const propiedad = await this.extraerPropiedadIndividualMejorada(tarjeta, i + 1, numeroPagina);
                
                if (propiedad && propiedad.titulo !== 'No disponible') {
                    propiedades.push(propiedad);
                    logDebug(`✓ Propiedad ${i + 1} extraída: ${propiedad.titulo.substring(0, 50)}...`);
                } else {
                    logDebug(`⚠️ Propiedad ${i + 1} con datos insuficientes, saltando...`);
                }

            } catch (error) {
                logError(`Error extrayendo propiedad ${i + 1}`, { error: error.message });
                // Continuar con la siguiente propiedad
            }
        }

        logInfo(`✅ ${propiedades.length} propiedades válidas extraídas de página ${numeroPagina}`);
        return propiedades;

    } catch (error) {
        logError('Error general extrayendo propiedades de página', { error: error.message });
        
        // Intentar extracción de emergencia
        try {
            return await this.extraccionEmergenciaPropiedades(page, numeroPagina);
        } catch (emergencyError) {
            logError('Error en extracción de emergencia', { error: emergencyError.message });
            return [];
        }
    }
}

/**
 * Extracción alternativa cuando no se encuentran selectores estándar
 */
static async extraccionAlternativaPropiedades(page, numeroPagina) {
    try {
        logInfo('🔄 Intentando extracción alternativa de propiedades...');

        // Buscar cualquier elemento que contenga información de propiedades
        const selectoresAlternativos = [
            'a[href*="/venta/"]', // Enlaces de venta
            'a[href*="/arriendo/"]', // Enlaces de arriendo  
            'div:has-text("UF")', // Elementos con UF
            'div:has-text("$")', // Elementos con precios
            'div:has-text("dormitorio")', // Elementos con dormitorios
            'div:has-text("m²")', // Elementos con superficie
            '[class*="price"]', // Elementos con clase price
            '[class*="title"]', // Elementos con clase title
            'h2, h3, h4', // Headers que podrían ser títulos
            'span:has-text("UF")', // Spans con UF
            'div[class*="listing"]' // Divs con listing
        ];

        const elementosEncontrados = [];

        for (const selector of selectoresAlternativos) {
            try {
                const elementos = await page.locator(selector).all();
                if (elementos.length > 0) {
                    elementosEncontrados.push({
                        selector,
                        elementos: elementos.slice(0, 10) // Máximo 10 por selector
                    });
                    logDebug(`Encontrados ${elementos.length} elementos con ${selector}`);
                }
            } catch (error) {
                continue;
            }
        }

        // Si encontramos elementos, intentar construir propiedades básicas
        const propiedadesBasicas = [];
        
        if (elementosEncontrados.length > 0) {
            logInfo(`Construyendo propiedades básicas de ${elementosEncontrados.length} tipos de elementos`);
            
            // Tomar los primeros elementos de cada tipo para construir propiedades
            const maxPropiedades = 10;
            
            for (let i = 0; i < maxPropiedades && i < elementosEncontrados[0].elementos.length; i++) {
                try {
                    const propiedadBasica = await this.construirPropiedadBasica(
                        page, 
                        elementosEncontrados, 
                        i, 
                        numeroPagina
                    );
                    
                    if (propiedadBasica) {
                        propiedadesBasicas.push(propiedadBasica);
                    }
                } catch (error) {
                    logDebug(`Error construyendo propiedad básica ${i}: ${error.message}`);
                }
            }
        }

        logInfo(`✅ Extracción alternativa completada: ${propiedadesBasicas.length} propiedades básicas`);
        return propiedadesBasicas;

    } catch (error) {
        logError('Error en extracción alternativa', { error: error.message });
        return [];
    }
}

/**
 * Construir propiedad básica desde elementos diversos
 */
static async construirPropiedadBasica(page, elementosEncontrados, indice, numeroPagina) {
    try {
        const propiedad = {
            titulo: 'Propiedad encontrada',
            precio: 'No disponible',
            precio_uf: null,
            precio_clp: null,
            moneda: '$',
            ubicacion: 'No disponible',
            dormitorios: 'No disponible',
            banos: 'No disponible',
            superficie: 'No disponible',
            link: 'No disponible',
            imagen: 'No disponible',
            posicion: indice + 1,
            pagina: numeroPagina,
            metodo_extraccion: 'alternativo',
            timestamp: new Date().toISOString()
        };

        // Intentar extraer información de diferentes elementos
        for (const grupo of elementosEncontrados) {
            if (indice < grupo.elementos.length) {
                try {
                    const elemento = grupo.elementos[indice];
                    const texto = await elemento.textContent();
                    
                    if (texto) {
                        // Detectar precios
                        if (texto.includes('UF') && propiedad.precio_uf === null) {
                            const matchUF = texto.match(/UF\s*([\d.,]+)/);
                            if (matchUF) {
                                propiedad.precio_uf = matchUF[1];
                                propiedad.precio = `UF ${matchUF[1]}`;
                                propiedad.moneda = 'UF';
                            }
                        }
                        
                        if (texto.includes('$') && propiedad.precio_clp === null) {
                            const matchCLP = texto.match(/\$\s*([\d.,]+)/);
                            if (matchCLP) {
                                propiedad.precio_clp = matchCLP[1];
                                if (propiedad.precio === 'No disponible') {
                                    propiedad.precio = `$ ${matchCLP[1]}`;
                                }
                            }
                        }

                        // Detectar dormitorios
                        if (texto.includes('dormitorio') && propiedad.dormitorios === 'No disponible') {
                            const matchDorm = texto.match(/(\d+)\s*dormitorio/);
                            if (matchDorm) {
                                propiedad.dormitorios = `${matchDorm[1]} dormitorios`;
                            }
                        }

                        // Detectar superficie
                        if ((texto.includes('m²') || texto.includes('m2')) && propiedad.superficie === 'No disponible') {
                            const matchSuperficie = texto.match(/([\d.,]+)\s*m²?/);
                            if (matchSuperficie) {
                                propiedad.superficie = `${matchSuperficie[1]} m²`;
                            }
                        }

                        // Usar como título si es más descriptivo
                        if (texto.length > 20 && texto.length < 200 && !texto.includes('UF') && !texto.includes('$')) {
                            propiedad.titulo = texto.trim();
                        }
                    }

                    // Intentar extraer link
                    if (grupo.selector.includes('a[href') && propiedad.link === 'No disponible') {
                        const href = await elemento.getAttribute('href');
                        if (href) {
                            propiedad.link = href.startsWith('http') ? href : `https://www.portalinmobiliario.com${href}`;
                        }
                    }

                } catch (error) {
                    logDebug(`Error procesando elemento ${grupo.selector}: ${error.message}`);
                }
            }
        }

        // Solo retornar si tenemos información mínima útil
        if (propiedad.precio !== 'No disponible' || propiedad.dormitorios !== 'No disponible') {
            return propiedad;
        }

        return null;

    } catch (error) {
        logError('Error construyendo propiedad básica', { error: error.message });
        return null;
    }
}

/**
 * Extracción de emergencia cuando todo falla
 */
static async extraccionEmergenciaPropiedades(page, numeroPagina) {
    try {
        logInfo('🚨 Ejecutando extracción de emergencia...');

        const url = page.url();
        const titulo = await page.title();

        // Crear al menos una propiedad básica con la información disponible
        const propiedadEmergencia = {
            titulo: titulo || 'Búsqueda realizada',
            precio: 'No disponible',
            precio_uf: null,
            precio_clp: null,
            moneda: '$',
            ubicacion: 'Según búsqueda realizada',
            dormitorios: 'No disponible',
            banos: 'No disponible',
            superficie: 'No disponible',
            link: url,
            imagen: 'No disponible',
            posicion: 1,
            pagina: numeroPagina,
            metodo_extraccion: 'emergencia',
            nota: 'Extracción de emergencia - datos limitados',
            timestamp: new Date().toISOString()
        };

        logInfo('✅ Extracción de emergencia completada con propiedad básica');
        return [propiedadEmergencia];

    } catch (error) {
        logError('Error en extracción de emergencia', { error: error.message });
        return [];
    }
}

/**
 * REEMPLAZA ESTE MÉTODO en SearchService.js
 * Busca "extraerPropiedadIndividualMejorada" y reemplázalo con esto:
 */
static async extraerPropiedadIndividualMejorada(tarjeta, posicion, pagina) {
    try {
        // CORREGIDO: Usar métodos originales que SÍ existen
        const tituloYLink = await this.extraerTituloYLink(tarjeta);
        const precios = await this.extraerPreciosCompletos(tarjeta);
        const ubicacion = await this.extraerTextoSeguro(tarjeta, '.poly-component__location, .location', 'ubicación');
        const caracteristicas = await this.extraerCaracteristicas(tarjeta);
        const imagen = await this.extraerImagenReal(tarjeta);

        return {
            titulo: tituloYLink.titulo,
            precio: precios.precio_principal,
            precio_uf: precios.precio_uf,
            precio_clp: precios.precio_clp,
            precio_completo: precios.precio_completo,
            moneda: precios.moneda_principal,
            ubicacion,
            dormitorios: caracteristicas.dormitorios,
            banos: caracteristicas.banos,
            superficie: caracteristicas.superficie,
            link: tituloYLink.link,
            imagen,
            posicion,
            pagina,
            metodo_extraccion: 'estandar_corregido',
            timestamp: new Date().toISOString()
        };

    } catch (error) {
        logError('Error en extracción individual', { error: error.message });
        return null;
    }
}

/**
 * Métodos auxiliares mejorados con mejor manejo de errores
 */
static async extraerTextoSeguroMejorado(locator, selector, descripcion, valorDefault = 'No disponible') {
    try {
        const selectores = Array.isArray(selector) ? selector : [selector];
        
        for (const sel of selectores) {
            try {
                const elemento = locator.locator(sel).first();
                const count = await elemento.count();
                
                if (count > 0) {
                    const texto = await elemento.textContent({ timeout: 3000 });
                    if (texto && texto.trim().length > 0) {
                        return texto.trim();
                    }
                }
            } catch (error) {
                continue;
            }
        }
        
        return valorDefault;
    } catch (error) {
        return valorDefault;
    }
}

// Otros métodos auxiliares seguirían el mismo patrón...

    /**
     * MEJORA 2: Extraer propiedad individual con precios UF/Pesos y links/imágenes
     */
    static async extraerPropiedadIndividual(tarjeta, posicion, pagina) {
        try {
            // 1. EXTRAER TÍTULO CON LINK
            const linkYTitulo = await this.extraerTituloYLink(tarjeta);

            // 2. EXTRAER PRECIOS (UF Y PESOS) - MEJORA PRINCIPAL
            const precios = await this.extraerPreciosCompletos(tarjeta);

            // 3. EXTRAER UBICACIÓN
            const ubicacion = await this.extraerTextoSeguro(
                tarjeta,
                '.poly-component__location, .ui-search-item__location',
                'ubicación'
            );

            // 4. EXTRAER CARACTERÍSTICAS
            const caracteristicas = await this.extraerCaracteristicas(tarjeta);

            // 5. EXTRAER IMAGEN - MEJORA PRINCIPAL
            const imagen = await this.extraerImagenReal(tarjeta);

            // Construir objeto de respuesta MEJORADO
            const propiedad = {
                titulo: linkYTitulo.titulo,

                // COMPATIBILIDAD: Mantener campos originales
                precio: precios.precio_principal,
                moneda: precios.moneda_principal,

                // MEJORA: Nuevos campos para UF y Pesos
                precio_uf: precios.precio_uf,
                precio_clp: precios.precio_clp,
                precio_completo: precios.precio_completo,

                ubicacion,
                dormitorios: caracteristicas.dormitorios,
                banos: caracteristicas.banos,
                superficie: caracteristicas.superficie,

                // MEJORA: Links e imágenes reales
                link: linkYTitulo.link,
                imagen,

                posicion,
                timestamp: new Date().toISOString(),
                pagina
            };

            return propiedad;

        } catch (error) {
            logError('Error extrayendo propiedad individual', { error: error.message });
            return null;
        }
    }

    /**
     * MEJORA: Extraer título y link real
     */
    static async extraerTituloYLink(tarjeta) {
        try {
            const selectoresLink = [
                '.poly-component__title',
                'a.poly-component__title',
                '.ui-search-item__title a',
                'h3 a'
            ];

            for (const selector of selectoresLink) {
                try {
                    const elemento = tarjeta.locator(selector).first();
                    const count = await elemento.count();

                    if (count > 0) {
                        const titulo = await elemento.textContent() || 'Sin título';
                        const link = await elemento.getAttribute('href') || 'No disponible';

                        // Convertir link relativo a absoluto
                        const linkCompleto = link.startsWith('http') ?
                            link :
                            link !== 'No disponible' ? `https://www.portalinmobiliario.com${link}` : 'No disponible';

                        return {
                            titulo: titulo.trim(),
                            link: linkCompleto
                        };
                    }
                } catch (error) {
                    continue;
                }
            }

            // Fallback: solo título
            const titulo = await this.extraerTextoSeguro(tarjeta, 'h3, .title', 'título fallback');
            return {
                titulo,
                link: 'No disponible'
            };

        } catch (error) {
            return {
                titulo: 'No disponible',
                link: 'No disponible'
            };
        }
    }

    /**
     * MEJORA PRINCIPAL: Extraer precios en UF y Pesos por separado
     */
    static async extraerPreciosCompletos(tarjeta) {
        try {
            logDebug('💰 Extrayendo precios UF/Pesos...');

            let precio_uf = null;
            let precio_clp = null;
            let precio_principal = 'No disponible';
            let moneda_principal = '$';

            // Buscar todos los elementos de precio
            const selectoresPrecios = [
                '.poly-component__price .andes-money-amount',
                '.price .andes-money-amount',
                '.ui-search-price .andes-money-amount'
            ];

            for (const selector of selectoresPrecios) {
                try {
                    const elementosPrecios = await tarjeta.locator(selector).all();

                    for (const elementoPrecio of elementosPrecios) {
                        // Extraer moneda y valor
                        const moneda = await elementoPrecio.locator('.andes-money-amount__currency-symbol').textContent();
                        const valor = await elementoPrecio.locator('.andes-money-amount__fraction').textContent();

                        if (moneda && valor) {
                            const monedaLimpia = moneda.trim();
                            const valorLimpio = valor.trim();

                            logDebug(`Precio encontrado: ${monedaLimpia} ${valorLimpio}`);

                            if (monedaLimpia === 'UF') {
                                precio_uf = valorLimpio;
                                // Si no hay precio principal aún, usar UF
                                if (precio_principal === 'No disponible') {
                                    precio_principal = valorLimpio;
                                    moneda_principal = 'UF';
                                }
                            } else if (monedaLimpia === '$') {
                                precio_clp = valorLimpio;
                                // Los pesos tienen prioridad como precio principal
                                precio_principal = valorLimpio;
                                moneda_principal = '$';
                            }
                        }
                    }

                    // Si encontramos precios, salir del loop
                    if (precio_uf || precio_clp) {
                        break;
                    }

                } catch (error) {
                    logDebug(`Error con selector ${selector}: ${error.message}`);
                    continue;
                }
            }

            // Construir precio completo para display
            let precio_completo = 'No disponible';
            if (precio_uf && precio_clp) {
                precio_completo = `UF ${precio_uf} ($ ${precio_clp})`;
            } else if (precio_uf) {
                precio_completo = `UF ${precio_uf}`;
            } else if (precio_clp) {
                precio_completo = `$ ${precio_clp}`;
            }

            logDebug('✅ Precios extraídos', {
                precio_uf,
                precio_clp,
                precio_principal,
                moneda_principal
            });

            return {
                precio_uf,
                precio_clp,
                precio_principal,
                moneda_principal,
                precio_completo
            };

        } catch (error) {
            logError('Error extrayendo precios', { error: error.message });
            return {
                precio_uf: null,
                precio_clp: null,
                precio_principal: 'No disponible',
                moneda_principal: '$',
                precio_completo: 'No disponible'
            };
        }
    }

    /**
     * MEJORA: Extraer imagen real
     */
    static async extraerImagenReal(tarjeta) {
        try {
            const selectoresImagen = [
                '.poly-component__picture',
                '.poly-card__portada img',
                '.ui-search-item__image img',
                'img[src*="mlstatic"]',
                'img[src*="portalinmobiliario"]',
                'img'
            ];

            for (const selector of selectoresImagen) {
                try {
                    const elemento = tarjeta.locator(selector).first();
                    const count = await elemento.count();

                    if (count > 0) {
                        // Intentar srcset primero (mejor calidad)
                        let imagen = await elemento.getAttribute('srcset');
                        if (imagen) {
                            // Extraer la URL de mayor resolución
                            const urls = imagen.split(',').map(url => url.trim().split(' ')[0]);
                            imagen = urls[urls.length - 1];
                        } else {
                            // Fallback a src normal
                            imagen = await elemento.getAttribute('src');
                        }

                        if (imagen &&
                            imagen.startsWith('http') &&
                            !imagen.includes('placeholder') &&
                            !imagen.includes('default') &&
                            !imagen.includes('loading')) {

                            logDebug(`✓ Imagen extraída: ${imagen.substring(0, 50)}...`);
                            return imagen;
                        }
                    }
                } catch (error) {
                    continue;
                }
            }

            return 'No disponible';

        } catch (error) {
            logError('Error extrayendo imagen', { error: error.message });
            return 'No disponible';
        }
    }

    /**
     * Extraer características (dormitorios, baños, superficie)
     */
    static async extraerCaracteristicas(tarjeta) {
        try {
            // Buscar lista de atributos
            const selectoresAtributos = [
                '.poly-attributes_list__item',
                '.ui-search-item__details li',
                '.property-features li'
            ];

            let dormitorios = 'No disponible';
            let banos = 'No disponible';
            let superficie = 'No disponible';

            for (const selector of selectoresAtributos) {
                try {
                    const atributos = await tarjeta.locator(selector).allTextContents();

                    for (const atributo of atributos) {
                        const texto = atributo.toLowerCase();

                        if (texto.includes('dormitorio') && dormitorios === 'No disponible') {
                            dormitorios = atributo.trim();
                        }

                        if (texto.includes('baño') && banos === 'No disponible') {
                            banos = atributo.trim();
                        }

                        if ((texto.includes('m²') || texto.includes('m2')) && superficie === 'No disponible') {
                            superficie = atributo.trim();
                        }
                    }

                    if (dormitorios !== 'No disponible' &&
                        banos !== 'No disponible' &&
                        superficie !== 'No disponible') {
                        break;
                    }

                } catch (error) {
                    continue;
                }
            }

            return { dormitorios, banos, superficie };

        } catch (error) {
            return {
                dormitorios: 'No disponible',
                banos: 'No disponible',
                superficie: 'No disponible'
            };
        }
    }

    /**
 * Navegar a siguiente página en resultados - ACTUALIZADO para Portal Inmobiliario
 */
static async navegarSiguientePagina(page) {
    try {
        logInfo('▶️ Intentando navegar a siguiente página en resultados...');

        // Selectores específicos para paginación en Portal Inmobiliario
        const selectoresSiguiente = [
            '.andes-pagination__button--next:not([disabled])', // Botón siguiente habilitado
            'a.andes-pagination__button--next:not(.disabled)',
            'button[aria-label*="iguiente"]:not([disabled])',
            'a[aria-label*="iguiente"]:not(.disabled)',
            '.ui-search-pagination .andes-pagination__button:last-child:not([disabled])',
            '.pagination .next:not(.disabled)',
            'a:has-text("Siguiente"):not(.disabled)'
        ];

        // 1. BUSCAR BOTÓN DE SIGUIENTE PÁGINA
        let botonSiguiente = null;
        let selectorUsado = null;

        for (const selector of selectoresSiguiente) {
            try {
                await page.waitForSelector(selector, { timeout: 3000 });
                const elementos = await page.locator(selector).all();
                
                for (const elemento of elementos) {
                    const esVisible = await elemento.isVisible();
                    const estaHabilitado = !(await elemento.isDisabled());
                    const tieneClick = await elemento.evaluate(el => {
                        return el.tagName === 'A' || el.tagName === 'BUTTON';
                    });
                    
                    if (esVisible && estaHabilitado && tieneClick) {
                        botonSiguiente = elemento;
                        selectorUsado = selector;
                        break;
                    }
                }
                
                if (botonSiguiente) {
                    break;
                }
                
            } catch (error) {
                logDebug(`Selector paginación no encontrado: ${selector}`);
                continue;
            }
        }

        if (!botonSiguiente) {
            logInfo('❌ No se encontró botón de siguiente página disponible');
            return false;
        }

        // 2. OBTENER URL ACTUAL PARA VERIFICAR NAVEGACIÓN
        const urlAnterior = page.url();

        // 3. HACER CLICK EN SIGUIENTE PÁGINA
        try {
            logInfo(`🖱️ Haciendo click en siguiente página con selector: ${selectorUsado}`);
            
            // Scroll al elemento para asegurar que sea visible
            await botonSiguiente.scrollIntoViewIfNeeded();
            await page.waitForTimeout(500);
            
            // Click en el botón
            await botonSiguiente.click();
            
            // 4. ESPERAR NAVEGACIÓN O ACTUALIZACIÓN DE CONTENIDO
            logInfo('⏳ Esperando navegación a siguiente página...');
            
            // Intentar detectar cambio de URL o contenido
            try {
                // Opción 1: Esperar cambio de URL
                await page.waitForFunction(
                    (urlAnterior) => window.location.href !== urlAnterior,
                    urlAnterior,
                    { timeout: 8000 }
                );
                
                const urlNueva = page.url();
                logInfo(`✅ Navegación exitosa: ${urlAnterior} → ${urlNueva}`);
                
            } catch (urlError) {
                // Opción 2: Esperar actualización de contenido (AJAX)
                logInfo('URL no cambió, esperando actualización de contenido...');
                
                try {
                    // Esperar que aparezcan nuevas propiedades
                    await page.waitForFunction(() => {
                        const propiedades = document.querySelectorAll('.andes-card.poly-card, .ui-search-layout__item');
                        return propiedades.length > 0;
                    }, { timeout: 8000 });
                    
                    logInfo('✅ Contenido actualizado exitosamente');
                    
                } catch (contentError) {
                    logInfo('⚠️ No se detectó actualización clara, continuando...');
                }
            }

            // 5. ESPERAR CARGA COMPLETA DE LA NUEVA PÁGINA
            await page.waitForTimeout(3000);
            
            // Verificar que efectivamente hay contenido nuevo
            try {
                const propiedades = await page.locator('.andes-card.poly-card, .ui-search-layout__item').count();
                if (propiedades > 0) {
                    logInfo(`✅ Página cargada con ${propiedades} elementos`);
                    return true;
                } else {
                    logInfo('⚠️ No se detectaron propiedades en la nueva página');
                    return false;
                }
            } catch (error) {
                logInfo('⚠️ Error verificando contenido, asumiendo éxito');
                return true;
            }

        } catch (clickError) {
            logError(`Error haciendo click en siguiente página: ${clickError.message}`);
            return false;
        }

    } catch (error) {
        logError(`Error general navegando a siguiente página: ${error.message}`);
        return false;
    }
}

/**
 * Método alternativo: Construir URL de siguiente página manualmente
 */
static async navegarSiguientePaginaAlternativo(page, numeroPaginaSiguiente) {
    try {
        logInfo(`🔄 Método alternativo: navegando a página ${numeroPaginaSiguiente} via URL`);

        const urlActual = page.url();
        
        // Portal Inmobiliario usa parámetro _Desde_ para paginación
        // Cada página tiene 48 resultados
        const resultadosPorPagina = 48;
        const desde = (numeroPaginaSiguiente - 1) * resultadosPorPagina;
        
        let urlSiguientePagina;
        
        if (urlActual.includes('_Desde_')) {
            // Reemplazar valor existente
            urlSiguientePagina = urlActual.replace(/_Desde_\d+/, `_Desde_${desde}`);
        } else {
            // Agregar parámetro nuevo
            const separador = urlActual.includes('#') ? '' : '_Desde_' + desde;
            urlSiguientePagina = urlActual + separador;
        }

        if (urlSiguientePagina !== urlActual) {
            await page.goto(urlSiguientePagina, {
                timeout: 20000,
                waitUntil: 'domcontentloaded'
            });
            
            // Esperar que carguen las propiedades
            await this.esperarCargaPaginaResultados(page);
            
            logInfo(`✅ Navegación alternativa exitosa a: ${urlSiguientePagina}`);
            return true;
        }

        return false;

    } catch (error) {
        logError(`Error en navegación alternativa: ${error.message}`);
        return false;
    }
}

    /**
     * Método alternativo: Navegar mediante URL directa de paginación
     */
    static async navegarSiguientePaginaAlternativo(page, numeroPaginaSiguiente) {
        try {
            logInfo(`🔄 Método alternativo: navegando a página ${numeroPaginaSiguiente} via URL`);

            const urlActual = page.url();

            // Construir URL de la siguiente página
            let urlSiguientePagina;

            if (urlActual.includes('_Desde_')) {
                // URL ya tiene paginación, reemplazar el número
                const desde = (numeroPaginaSiguiente - 1) * 48; // Portal Inmobiliario usa 48 resultados por página
                urlSiguientePagina = urlActual.replace(/_Desde_\d+/, `_Desde_${desde}`);
            } else {
                // Agregar paginación a la URL
                const desde = (numeroPaginaSiguiente - 1) * 48;
                const separador = urlActual.includes('?') ? '&' : '?';
                urlSiguientePagina = `${urlActual}${separador}_Desde_${desde}`;
            }

            if (urlSiguientePagina !== urlActual) {
                await page.goto(urlSiguientePagina, {
                    timeout: 15000,
                    waitUntil: 'domcontentloaded'
                });

                logInfo(`✅ Navegación alternativa exitosa a: ${urlSiguientePagina}`);
                return true;
            }

            return false;

        } catch (error) {
            logError(`Error en navegación alternativa: ${error.message}`);
            return false;
        }
    }

    /**
     * Extraer texto de forma segura
     */
    static async extraerTextoSeguro(locator, selector, descripcion, valorDefault = 'No disponible') {
        try {
            const elemento = locator.locator(selector).first();
            const count = await elemento.count();

            if (count > 0) {
                const texto = await elemento.textContent();
                return texto ? texto.trim() : valorDefault;
            }

            return valorDefault;
        } catch (error) {
            return valorDefault;
        }
    }
}

module.exports = SearchService;