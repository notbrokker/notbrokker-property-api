// src/services/search/SearchService.js
const { chromium } = require('playwright');
const { logInfo, logError, logDebug } = require('../../utils/logger');
const { ErrorFactory } = require('../../utils/errors');

/**
 * Servicio real de búsqueda de propiedades
 */
class SearchService {
    
    /**
     * Buscar propiedades con filtros
     */
    static async searchProperties(tipo, operacion, ubicacion, maxPaginas = 3, filtrosPrecio = null, filtrosAvanzados = null) {
        logInfo('🔍 Iniciando búsqueda real de propiedades', { 
            tipo, operacion, ubicacion, maxPaginas 
        });
        
        if (filtrosPrecio) {
            logInfo('💰 Con filtros de precio', filtrosPrecio);
        }
        if (filtrosAvanzados) {
            logInfo('🏠 Con filtros avanzados', { filtros: Object.keys(filtrosAvanzados) });
        }
        
        const browser = await this.launchBrowser();
        let context, page;
        
        try {
            context = await this.createContext(browser);
            page = await context.newPage();
            
            // Navegar a Portal Inmobiliario
            logInfo('🌐 Navegando a Portal Inmobiliario');
            await page.goto('https://www.portalinmobiliario.com/', { 
                timeout: 30000,
                waitUntil: 'domcontentloaded'
            });
            
            // Llenar formulario con filtros
            const resultadoFormulario = await this.llenarFormularioBusqueda(
                page, tipo, operacion, ubicacion, filtrosPrecio, filtrosAvanzados
            );
            
            if (!resultadoFormulario.exito) {
                throw ErrorFactory.searchFailed({ tipo, operacion, ubicacion }, 
                    new Error('No se pudo llenar el formulario de búsqueda'));
            }
            
            // Extraer propiedades de todas las páginas
            const todasLasPropiedades = await this.extraerPropiedadesDeTodasLasPaginas(page, maxPaginas);
            
            const metadata = {
                tipo,
                operacion,
                ubicacion,
                totalPropiedades: todasLasPropiedades.length,
                paginasProcesadas: Math.ceil(todasLasPropiedades.length / 20) || 1,
                timestamp: new Date().toISOString(),
                filtrosAplicados: {
                    precio: filtrosPrecio,
                    avanzados: filtrosAvanzados,
                    ...resultadoFormulario.filtrosResultado
                }
            };
            
            logInfo('✅ Búsqueda real completada', { 
                propiedades: todasLasPropiedades.length,
                paginas: metadata.paginasProcesadas 
            });
            
            return {
                success: true,
                data: todasLasPropiedades,
                metadata
            };
            
        } catch (error) {
            logError('❌ Error durante búsqueda real', { 
                tipo, operacion, ubicacion,
                error: error.message 
            });
            
            throw ErrorFactory.searchFailed({ tipo, operacion, ubicacion }, error);
            
        } finally {
            try {
                if (context) await context.close();
                await browser.close();
                logDebug('🔒 Browser cerrado correctamente');
            } catch (closeError) {
                logError('Error cerrando browser', { error: closeError.message });
            }
        }
    }
    
    /**
     * Lanzar browser optimizado
     */
    static async launchBrowser() {
        return await chromium.launch({ 
            headless: true,
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--disable-web-security',
                '--disable-features=VizDisplayCompositor'
            ]
        });
    }
    
    /**
     * Crear contexto del browser
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
     * Llenar formulario de búsqueda con filtros
     */
    static async llenarFormularioBusqueda(page, tipo, operacion, ubicacion, filtrosPrecio, filtrosAvanzados) {
        try {
            logInfo('📝 Llenando formulario de búsqueda', { tipo, operacion, ubicacion });
            
            await page.waitForLoadState('domcontentloaded');
            await page.waitForTimeout(3000);
            
            // 1. SELECCIONAR OPERACIÓN
            logDebug(`Seleccionando operación: ${operacion}`);
            const selectorDropdownOperacion = 'button[aria-label="Tipo de operación"]';
            
            try {
                await page.waitForSelector(selectorDropdownOperacion, { timeout: 10000 });
                await page.click(selectorDropdownOperacion);
                await page.waitForTimeout(1000);
                
                const selectorOpcion = operacion.toLowerCase() === 'venta' 
                    ? 'li:has-text("Venta"):not(:has-text("temporal"))'
                    : 'li:has-text("Arriendo"):not(:has-text("temporal"))';
                
                await page.waitForSelector(selectorOpcion, { timeout: 5000 });
                await page.click(selectorOpcion);
                logInfo(`✓ Operación seleccionada: ${operacion}`);
            } catch (error) {
                logError(`Error seleccionando operación: ${error.message}`);
            }
            
            await page.waitForTimeout(1000);
            
            // 2. SELECCIONAR TIPO DE PROPIEDAD
            logDebug(`Seleccionando tipo: ${tipo}`);
            const selectorDropdownTipo = 'button[aria-label="Tipo de propiedad"]';
            
            try {
                await page.waitForSelector(selectorDropdownTipo, { timeout: 10000 });
                await page.click(selectorDropdownTipo);
                await page.waitForTimeout(1000);
                
                const selectorTipoOpcion = tipo.toLowerCase() === 'casa' 
                    ? 'li:has-text("Casas")'
                    : 'li:has-text("Departamentos")';
                
                await page.waitForSelector(selectorTipoOpcion, { timeout: 5000 });
                await page.click(selectorTipoOpcion);
                logInfo(`✓ Tipo seleccionado: ${tipo}`);
            } catch (error) {
                logError(`Error seleccionando tipo: ${error.message}`);
            }
            
            await page.waitForTimeout(1000);
            
            // 3. INGRESAR UBICACIÓN
            logDebug(`Ingresando ubicación: ${ubicacion}`);
            const selectorUbicacion = 'input[placeholder="Ingresa comuna o ciudad"]';
            
            try {
                await page.waitForSelector(selectorUbicacion, { timeout: 10000 });
                await page.fill(selectorUbicacion, '');
                await page.waitForTimeout(500);
                await page.fill(selectorUbicacion, ubicacion);
                await page.waitForTimeout(2000);
                
                // Intentar seleccionar primera sugerencia
                try {
                    const selectorSugerencia = '.andes-list__item .andes-list__item-action';
                    await page.waitForSelector(selectorSugerencia, { timeout: 3000 });
                    await page.click(`${selectorSugerencia}:first-child`);
                    logInfo(`✓ Ubicación seleccionada: ${ubicacion}`);
                } catch (error) {
                    logInfo(`Continuando sin sugerencia de ubicación`);
                }
            } catch (error) {
                logError(`Error ingresando ubicación: ${error.message}`);
            }
            
            await page.waitForTimeout(1000);
            
            // 4. HACER CLIC EN BOTÓN DE BÚSQUEDA
            logDebug('Ejecutando búsqueda');
            const selectorBusqueda = '.andes-button:has-text("Buscar")';
            
            try {
                await page.waitForSelector(selectorBusqueda, { timeout: 10000 });
                await page.click(selectorBusqueda);
                logInfo('✓ Búsqueda ejecutada');
                
                await page.waitForLoadState('domcontentloaded');
                await page.waitForTimeout(5000);
            } catch (error) {
                // Fallback: presionar Enter
                try {
                    await page.press(selectorUbicacion, 'Enter');
                    logInfo('✓ Enter ejecutado como fallback');
                    await page.waitForTimeout(5000);
                } catch (enterError) {
                    throw new Error('No se pudo ejecutar la búsqueda');
                }
            }
            
            // 5. APLICAR FILTROS SI EXISTEN
            let resultadoFiltros = { aplicado: false };
            
            // TODO: Aplicar filtros de precio y avanzados
            // (implementar después si es necesario)
            
            return {
                exito: true,
                filtrosResultado: resultadoFiltros
            };
            
        } catch (error) {
            logError('Error llenando formulario', { error: error.message });
            return {
                exito: false,
                error: error.message
            };
        }
    }
    
    /**
     * Extraer propiedades de todas las páginas
     */
    static async extraerPropiedadesDeTodasLasPaginas(page, maxPaginas) {
        const todasLasPropiedades = [];
        let paginaActual = 1;
        
        while (paginaActual <= maxPaginas) {
            logInfo(`📄 Procesando página ${paginaActual}/${maxPaginas}`);
            
            const propiedadesPagina = await this.extraerPropiedadesPagina(page);
            
            if (propiedadesPagina.length === 0) {
                logInfo(`No se encontraron propiedades en página ${paginaActual}`);
                break;
            }
            
            const propiedadesConPagina = propiedadesPagina.map(prop => ({
                ...prop,
                pagina: paginaActual
            }));
            
            todasLasPropiedades.push(...propiedadesConPagina);
            logInfo(`✅ Página ${paginaActual}: ${propiedadesPagina.length} propiedades extraídas`);
            
            if (paginaActual < maxPaginas) {
                const hayPaginaSiguiente = await this.irPaginaSiguiente(page);
                if (!hayPaginaSiguiente) {
                    logInfo('No hay más páginas disponibles');
                    break;
                }
                paginaActual++;
            } else {
                paginaActual++;
            }
        }
        
        return todasLasPropiedades;
    }
    
    /**
     * Extraer propiedades de la página actual
     */
    static async extraerPropiedadesPagina(page) {
        try {
            await page.waitForLoadState('domcontentloaded');
            await page.waitForTimeout(3000);
            
            // Buscar elementos de propiedades
            const selectoresItems = [
                '.ui-search-layout__item',
                '.ui-search-results__item', 
                '[class*="ui-search"]',
                '.poly-component'
            ];
            
            let selectorItems = null;
            let cantidadItems = 0;
            
            for (const selector of selectoresItems) {
                try {
                    await page.waitForSelector(selector, { timeout: 5000 });
                    cantidadItems = await page.locator(selector).count();
                    if (cantidadItems > 0) {
                        selectorItems = selector;
                        logDebug(`Encontrados ${cantidadItems} elementos con: ${selector}`);
                        break;
                    }
                } catch (error) {
                    continue;
                }
            }
            
            if (!selectorItems || cantidadItems === 0) {
                logError('No se encontraron propiedades en esta página');
                return [];
            }
            
            const propiedades = [];
            const items = await page.locator(selectorItems).all();
            const limitItems = Math.min(items.length, 20);
            
            for (let i = 0; i < limitItems; i++) {
                try {
                    const item = items[i];
                    const propiedad = await this.extraerDatosPropiedad(item, page);
                    
                    if (propiedad.titulo !== 'No disponible') {
                        propiedades.push({
                            ...propiedad,
                            posicion: i + 1,
                            timestamp: new Date().toISOString()
                        });
                    }
                } catch (error) {
                    logError(`Error procesando propiedad ${i + 1}`, { error: error.message });
                }
            }
            
            return propiedades;
            
        } catch (error) {
            logError('Error extrayendo propiedades de página', { error: error.message });
            return [];
        }
    }
    
    /**
     * Extraer datos de una propiedad individual
     */
    static async extraerDatosPropiedad(item, page) {
        try {
            // Extraer título
            const selectoresTitulo = [
                '.poly-component__title a',
                '.ui-search-item__title a',
                'h2 a',
                'h3 a'
            ];
            
            let titulo = 'No disponible';
            for (const selector of selectoresTitulo) {
                try {
                    const elemento = item.locator(selector).first();
                    if (await elemento.count() > 0) {
                        titulo = await elemento.textContent({ timeout: 3000 });
                        if (titulo && titulo.trim()) {
                            titulo = titulo.trim();
                            break;
                        }
                    }
                } catch (error) {
                    continue;
                }
            }
            
            // Extraer precio
            const selectoresPrecio = [
                '.andes-money-amount__fraction',
                '.ui-search-price__fraction',
                '.price-fraction'
            ];
            
            let precio = 'No disponible';
            for (const selector of selectoresPrecio) {
                try {
                    const elemento = item.locator(selector).first();
                    if (await elemento.count() > 0) {
                        precio = await elemento.textContent({ timeout: 3000 });
                        if (precio && precio.trim()) {
                            precio = precio.trim();
                            break;
                        }
                    }
                } catch (error) {
                    continue;
                }
            }
            
            // Extraer ubicación
            const selectoresUbicacion = [
                '.poly-component__location',
                '.ui-search-item__location'
            ];
            
            let ubicacion = 'No disponible';
            for (const selector of selectoresUbicacion) {
                try {
                    const elemento = item.locator(selector).first();
                    if (await elemento.count() > 0) {
                        ubicacion = await elemento.textContent({ timeout: 3000 });
                        if (ubicacion && ubicacion.trim()) {
                            ubicacion = ubicacion.trim();
                            break;
                        }
                    }
                } catch (error) {
                    continue;
                }
            }
            
            // Extraer atributos básicos
            let dormitorios = 'No disponible';
            let banos = 'No disponible';
            let superficie = 'No disponible';
            
            const selectoresAtributos = [
                '.poly-attributes_list__item',
                '.ui-search-item__attributes li'
            ];
            
            for (const selector of selectoresAtributos) {
                try {
                    const elementos = item.locator(selector);
                    const count = await elementos.count();
                    
                    for (let i = 0; i < count; i++) {
                        const texto = await elementos.nth(i).textContent({ timeout: 2000 });
                        if (texto) {
                            const textoLower = texto.toLowerCase();
                            
                            if ((textoLower.includes('dormitorio') || textoLower.includes('habitación')) && dormitorios === 'No disponible') {
                                dormitorios = texto.trim();
                            } else if (textoLower.includes('baño') && banos === 'No disponible') {
                                banos = texto.trim();
                            } else if ((textoLower.includes('m²') || textoLower.includes('superficie')) && superficie === 'No disponible') {
                                superficie = texto.trim();
                            }
                        }
                    }
                    
                    if (dormitorios !== 'No disponible' && banos !== 'No disponible' && superficie !== 'No disponible') {
                        break;
                    }
                } catch (error) {
                    continue;
                }
            }
            
            // Extraer link
            const selectoresLink = [
                '.poly-component__title a',
                '.ui-search-item__title a'
            ];
            
            let link = 'No disponible';
            for (const selector of selectoresLink) {
                try {
                    const elemento = item.locator(selector).first();
                    if (await elemento.count() > 0) {
                        link = await elemento.getAttribute('href', { timeout: 3000 });
                        if (link) {
                            if (link.startsWith('/')) {
                                link = `https://www.portalinmobiliario.com${link}`;
                            }
                            break;
                        }
                    }
                } catch (error) {
                    continue;
                }
            }
            
            // Extraer imagen
            const selectoresImagen = [
                '.poly-component__picture img',
                '.ui-search-item__image img'
            ];
            
            let imagen = 'No disponible';
            for (const selector of selectoresImagen) {
                try {
                    const elemento = item.locator(selector).first();
                    if (await elemento.count() > 0) {
                        imagen = await elemento.getAttribute('src', { timeout: 3000 });
                        if (imagen && imagen.startsWith('http')) {
                            break;
                        }
                    }
                } catch (error) {
                    continue;
                }
            }
            
            return {
                titulo,
                precio,
                moneda: '$',
                ubicacion,
                dormitorios,
                banos,
                superficie,
                link,
                imagen
            };
            
        } catch (error) {
            logError('Error extrayendo datos de propiedad', { error: error.message });
            return {
                titulo: 'No disponible',
                precio: 'No disponible',
                moneda: '$',
                ubicacion: 'No disponible',
                dormitorios: 'No disponible',
                banos: 'No disponible',
                superficie: 'No disponible',
                link: 'No disponible',
                imagen: 'No disponible'
            };
        }
    }
    
    /**
     * Navegar a página siguiente
     */
    static async irPaginaSiguiente(page) {
        try {
            const selectoresSiguiente = [
                '.andes-pagination__button--next:not([disabled])',
                '.ui-search-pagination .ui-search-link:has-text("Siguiente")',
                'a[aria-label="Siguiente"]:not([disabled])'
            ];
            
            for (const selector of selectoresSiguiente) {
                try {
                    const elemento = page.locator(selector);
                    if (await elemento.count() > 0) {
                        const esVisible = await elemento.first().isVisible();
                        const estaHabilitado = await elemento.first().isEnabled();
                        
                        if (esVisible && estaHabilitado) {
                            await elemento.first().click();
                            await page.waitForLoadState('domcontentloaded');
                            await page.waitForTimeout(3000);
                            logInfo('✓ Navegación a página siguiente completada');
                            return true;
                        }
                    }
                } catch (error) {
                    continue;
                }
            }
            
            return false;
            
        } catch (error) {
            logError('Error navegando a página siguiente', { error: error.message });
            return false;
        }
    }
}

module.exports = SearchService;