// src/services/scraping/ScrapingService.js
const { chromium } = require('playwright');
const { logInfo, logError, logDebug } = require('../../utils/logger');
const { ErrorFactory } = require('../../utils/errors');

/**
 * Servicio real de scraping de propiedades con validaciones robustas
 */
class ScrapingService {

    /**
     * Scraping principal de una propiedad
     */
    static async scrapeProperty(url) {
        // 1. VALIDACIÓN INICIAL DE URL
        const validacionUrl = this.validarURL(url);
        if (!validacionUrl.valida) {
            throw ErrorFactory.invalidUrl(url + ' - ' + validacionUrl.razon);
        }

        const tipoPortal = this.detectarPortal(url);
        logInfo(`🚀 Iniciando scraping de ${tipoPortal} para URL: ${url}`);

        const browser = await chromium.launch({
            headless: false,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--disable-web-security',
                '--disable-features=VizDisplayCompositor'
            ]
        });

        let context, page;

        try {
            context = await browser.newContext({
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                viewport: { width: 1920, height: 1080 },
                extraHTTPHeaders: {
                    'Accept-Language': 'es-CL,es;q=0.9,en;q=0.8'
                }
            });

            page = await context.newPage();

            // 2. NAVEGACIÓN CON VALIDACIÓN DE RESPUESTA
            logInfo(`📱 Navegando a: ${url}`);
            const response = await page.goto(url, {
                timeout: 30000,
                waitUntil: 'domcontentloaded'
            });

            // 3. VALIDAR RESPUESTA HTTP
            const validacionRespuesta = await this.validarRespuestaHTTP(response, page);
            if (!validacionRespuesta.valida) {
                throw ErrorFactory.scrapingFailed(url, new Error(validacionRespuesta.razon));
            }

            // 4. ESPERAR CARGA COMPLETA
            await this.esperarCargaConRetry(page);

            // 5. VALIDAR QUE ES UNA PÁGINA DE PROPIEDAD
            const validacionPropiedad = await this.validarPaginaPropiedad(page, tipoPortal);
            if (!validacionPropiedad.valida) {
                throw ErrorFactory.scrapingFailed(url, new Error(validacionPropiedad.razon));
            }

            // 6. EXTRAER DATOS SEGÚN EL PORTAL
            let resultado;

            switch (tipoPortal) {
                case 'portal_inmobiliario':
                    resultado = await this.extraerPortalInmobiliario(page);
                    break;
                case 'mercadolibre':
                    resultado = await this.extraerMercadoLibreCorregido(page);
                    break;
                default:
                    logInfo('⚠️ Usando extractor genérico para portal desconocido');
                    resultado = await this.extraerGenerico(page);
            }

            // 7. VALIDAR QUE SE EXTRAJERON DATOS MÍNIMOS
            const validacionDatos = this.validarDatosExtraidos(resultado);
            if (!validacionDatos.valida) {
                throw ErrorFactory.scrapingFailed(url, new Error(validacionDatos.razon));
            }

            logInfo('🎉 Scraping completado exitosamente');
            return {
                success: true,
                data: resultado,
                portal: tipoPortal,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            logError(`💥 Error durante el scraping: ${error.message}`);

            // Clasificar tipo de error para respuesta más específica
            const errorClasificado = this.clasificarError(error, url);
            throw errorClasificado;

        } finally {
            try {
                if (context) {
                    await context.close();
                }
                await browser.close();
                logInfo('🔒 Browser y contexto cerrados correctamente');
            } catch (closeError) {
                logError(`Error cerrando browser: ${closeError.message}`);
            }
        }
    }

    /**
     * Detectar el tipo de portal basado en la URL
     */
    static detectarPortal(url) {
        logDebug(`Detectando tipo de portal para URL: ${url}`);

        if (url.includes('portalinmobiliario.com')) {
            logInfo('Portal detectado: Portal Inmobiliario');
            return 'portal_inmobiliario';
        } else if (url.includes('mercadolibre.cl') || url.includes('casa.mercadolibre.cl')) {
            logInfo('Portal detectado: MercadoLibre');
            return 'mercadolibre';
        } else if (url.includes('yapo.cl')) {
            logInfo('Portal detectado: Yapo');
            return 'yapo';
        } else if (url.includes('toctoc.com')) {
            logInfo('Portal detectado: TocToc');
            return 'toctoc';
        }

        logInfo('Portal no reconocido, usando extractor genérico');
        return 'desconocido';
    }

    // ===== FUNCIONES DE VALIDACIÓN =====

    /**
     * Validar formato y estructura de URL
     */
    static validarURL(url) {
        try {
            // Validar que sea una URL válida
            const urlObj = new URL(url);

            // Validar protocolo
            if (!['http:', 'https:'].includes(urlObj.protocol)) {
                return {
                    valida: false,
                    razon: 'La URL debe usar protocolo HTTP o HTTPS'
                };
            }

            // Validar que no esté vacía
            if (!url || url.trim().length === 0) {
                return {
                    valida: false,
                    razon: 'URL vacía o nula'
                };
            }

            // Validar longitud mínima
            if (url.length < 10) {
                return {
                    valida: false,
                    razon: 'URL demasiado corta para ser válida'
                };
            }

            // Validar que tenga un dominio válido
            if (!urlObj.hostname || urlObj.hostname.length < 3) {
                return {
                    valida: false,
                    razon: 'Dominio inválido en la URL'
                };
            }

            logInfo(`✅ URL válida: ${url}`);
            return { valida: true };

        } catch (error) {
            return {
                valida: false,
                razon: `Formato de URL inválido: ${error.message}`
            };
        }
    }

    /**
     * Validar respuesta HTTP y detectar páginas de error
     */
    static async validarRespuestaHTTP(response, page) {
        try {
            const status = response.status();
            const url = response.url();

            logInfo(`📡 Respuesta HTTP: ${status} para ${url}`);

            // Validar códigos de estado HTTP
            if (status === 404) {
                return {
                    valida: false,
                    razon: 'Página no encontrada (Error 404). La URL del portal puede haber vencido o no existir.'
                };
            }

            if (status === 403) {
                return {
                    valida: false,
                    razon: 'Acceso prohibido (Error 403). El sitio web bloquea el acceso automatizado.'
                };
            }

            if (status === 500) {
                return {
                    valida: false,
                    razon: 'Error interno del servidor (Error 500). El sitio web tiene problemas técnicos.'
                };
            }

            if (status >= 400) {
                return {
                    valida: false,
                    razon: `Error HTTP ${status}. El servidor respondió con un error.`
                };
            }

            // Verificar si la página redirigió a una página de error
            const titulo = await page.title().catch(() => '');
            const url_actual = page.url();

            // Detectar páginas de error comunes
            const indicadoresError = [
                'página no encontrada',
                'page not found',
                'error 404',
                'not found',
                'no existe',
                'página expirada',
                'contenido no disponible',
                'publicación pausada',
                'publicación finalizada',
                'anuncio vencido'
            ];

            const tituloLower = titulo.toLowerCase();
            const urlLower = url_actual.toLowerCase();

            for (const indicador of indicadoresError) {
                if (tituloLower.includes(indicador) || urlLower.includes(indicador)) {
                    return {
                        valida: false,
                        razon: `La página indica que el contenido no existe o ha vencido: "${titulo}"`
                    };
                }
            }

            logInfo(`✅ Respuesta HTTP válida: ${status}`);
            return { valida: true };

        } catch (error) {
            return {
                valida: false,
                razon: `Error validando respuesta HTTP: ${error.message}`
            };
        }
    }

    /**
     * Validar que es realmente una página de propiedad
     */
    static async validarPaginaPropiedad(page, tipoPortal) {
        try {
            logInfo(`🏠 Validando que es una página de propiedad (${tipoPortal})`);

            // Detectores específicos por portal
            const detectores = {
                'mercadolibre': [
                    '.ui-pdp-title',
                    '.ui-pdp-price',
                    '.ui-pdp-description',
                    '.ui-vpp-highlighted-specs'
                ],
                'portal_inmobiliario': [
                    '.property-title',
                    '.property-price',
                    '.property-features',
                    '.ui-search-item'
                ],
                'desconocido': [
                    'h1',
                    '[class*="price"]',
                    '[class*="property"]'
                ]
            };

            const selectoresParaValidar = detectores[tipoPortal] || detectores['desconocido'];
            let elementosEncontrados = 0;

            // Buscar elementos que indiquen que es una página de propiedad
            for (const selector of selectoresParaValidar) {
                try {
                    const count = await page.locator(selector).count();
                    if (count > 0) {
                        elementosEncontrados++;
                        logDebug(`✓ Encontrado elemento de propiedad: ${selector} (${count} elementos)`);
                    }
                } catch (error) {
                    // Continuar con el siguiente selector
                }
            }

            // Validar contenido del texto
            const contenidoPagina = await page.textContent('body').catch(() => '');
            const indicadoresPropiedad = [
                'dormitorio', 'habitación', 'bedroom',
                'baño', 'bathroom',
                'm²', 'm2', 'metros cuadrados',
                'estacionamiento', 'garage', 'parking',
                'propiedad', 'property', 'inmueble',
                'venta', 'arriendo', 'sale', 'rent'
            ];

            let indicadoresEncontrados = 0;
            const contenidoLower = contenidoPagina.toLowerCase();

            for (const indicador of indicadoresPropiedad) {
                if (contenidoLower.includes(indicador)) {
                    indicadoresEncontrados++;
                }
            }

            // Criterios de validación
            const elementosSuficientes = elementosEncontrados >= 1;
            const indicadoresSuficientes = indicadoresEncontrados >= 2;

            if (elementosSuficientes || indicadoresSuficientes) {
                logInfo(`✅ Página validada como propiedad (elementos: ${elementosEncontrados}, indicadores: ${indicadoresEncontrados})`);
                return { valida: true };
            } else {
                return {
                    valida: false,
                    razon: `La página no contiene información de una propiedad. Elementos: ${elementosEncontrados}, indicadores: ${indicadoresEncontrados}. Puede ser una página de listado o contenido no relacionado.`
                };
            }

        } catch (error) {
            logError(`Error validando página de propiedad: ${error.message}`);
            // En caso de error, permitir continuar pero con advertencia
            return { valida: true, advertencia: error.message };
        }
    }

    /**
     * Validar que se extrajeron datos mínimos útiles
     */
    static validarDatosExtraidos(datos) {
        try {
            logInfo('📊 Validando datos extraídos...');

            // Verificar que el objeto de datos existe
            if (!datos || typeof datos !== 'object') {
                return {
                    valida: false,
                    razon: 'No se pudieron extraer datos válidos de la página'
                };
            }

            // Campos mínimos requeridos
            const camposRequeridos = ['titulo'];
            const camposUtiles = ['precio', 'precio_uf', 'precio_clp', 'ubicacion', 'dormitorios', 'banos'];

            // Verificar campos requeridos
            for (const campo of camposRequeridos) {
                if (!datos[campo] || datos[campo] === 'No disponible' || datos[campo].trim().length === 0) {
                    return {
                        valida: false,
                        razon: `No se pudo extraer información básica: ${campo}`
                    };
                }
            }

            // Verificar que al menos algunos campos útiles tienen datos
            let camposUtilesCongatos = 0;
            for (const campo of camposUtiles) {
                if (datos[campo] && datos[campo] !== 'No disponible' && datos[campo].trim().length > 0) {
                    camposUtilesCongatos++;
                }
            }

            if (camposUtilesCongatos === 0) {
                return {
                    valida: false,
                    razon: 'La página no contiene información útil de la propiedad (precio, ubicación, características)'
                };
            }

            logInfo(`✅ Datos validados correctamente (${camposUtilesCongatos} campos útiles extraídos)`);
            return { valida: true };

        } catch (error) {
            return {
                valida: false,
                razon: `Error validando datos extraídos: ${error.message}`
            };
        }
    }

    /**
     * Clasificar error para respuesta más específica
     */
    static clasificarError(error, url) {
        const mensaje = error.message.toLowerCase();

        // Error de URL inválida
        if (mensaje.includes('url') && (mensaje.includes('inválid') || mensaje.includes('format'))) {
            return ErrorFactory.invalidUrl(url);
        }

        // Error de página no encontrada
        if (mensaje.includes('404') || mensaje.includes('no encontrada') || mensaje.includes('not found')) {
            const error404 = ErrorFactory.scrapingFailed(url, new Error('PAGINA_NO_ENCONTRADA: La página no existe o ha vencido. Verifica que la URL sea correcta y esté activa.'));
            error404.codigoEspecifico = 'PAGINA_NO_ENCONTRADA';
            return error404;
        }

        // Error de acceso prohibido
        if (mensaje.includes('403') || mensaje.includes('prohibido') || mensaje.includes('forbidden')) {
            const error403 = ErrorFactory.scrapingFailed(url, new Error('ACCESO_PROHIBIDO: Acceso bloqueado por el sitio web. El portal puede estar limitando el acceso automatizado.'));
            error403.codigoEspecifico = 'ACCESO_PROHIBIDO';
            return error403;
        }

        // Error de timeout
        if (mensaje.includes('timeout') || mensaje.includes('tiempo') || mensaje.includes('navigation')) {
            const errorTimeout = ErrorFactory.scrapingFailed(url, new Error('TIMEOUT: La página tardó demasiado en cargar. Intenta nuevamente o verifica tu conexión.'));
            errorTimeout.codigoEspecifico = 'TIMEOUT';
            return errorTimeout;
        }

        // Error de contenido no válido
        if (mensaje.includes('no parece') || mensaje.includes('no contiene') || mensaje.includes('información')) {
            const errorContenido = ErrorFactory.scrapingFailed(url, new Error('NO_ES_PROPIEDAD: La URL no contiene información válida de una propiedad. Verifica que sea un enlace directo a una propiedad específica.'));
            errorContenido.codigoEspecifico = 'NO_ES_PROPIEDAD';
            return errorContenido;
        }

        // Error genérico de scraping
        return ErrorFactory.scrapingFailed(url, error);
    }

    // ===== FUNCIONES DE EXTRACCIÓN (Métodos originales) =====

    /**
     * Función de espera robusta para evitar timeouts
     */
    static async esperarCargaRobusta(page, timeout = 30000) {
        try {
            logDebug('Iniciando espera robusta de carga...');

            await page.waitForLoadState('domcontentloaded', { timeout: 10000 });
            logDebug('✓ DOM cargado');

            const selectoresCriticos = [
                '.ui-pdp-title',
                'h1',
                '.andes-money-amount',
                '[class*="price"]'
            ];

            let elementoEncontrado = false;

            for (const selector of selectoresCriticos) {
                try {
                    await page.waitForSelector(selector, { timeout: 8000 });
                    logDebug(`✓ Elemento crítico encontrado: ${selector}`);
                    elementoEncontrado = true;
                    break;
                } catch (error) {
                    logDebug(`Elemento no encontrado: ${selector}, continuando...`);
                }
            }

            if (!elementoEncontrado) {
                logInfo('No se encontraron elementos críticos, pero continuando...');
            }

            await page.waitForTimeout(3000);

            const isLoading = await page.evaluate(() => {
                return document.readyState === 'loading';
            });

            if (!isLoading) {
                logDebug('✅ Página completamente cargada');
                return true;
            }

            try {
                await page.waitForLoadState('networkidle', { timeout: 8000 });
                logDebug('✓ Network idle alcanzado');
            } catch (error) {
                logInfo('Network idle no alcanzado, pero continuando con la extracción');
            }

            return true;

        } catch (error) {
            logError(`Error en espera robusta: ${error.message}`);
            return false;
        }
    }

    /**
     * Función con retry logic para casos extremos
     */
    static async esperarCargaConRetry(page, maxReintentos = 3) {
        for (let intento = 1; intento <= maxReintentos; intento++) {
            try {
                logDebug(`Intento ${intento}/${maxReintentos} de carga`);

                const exito = await this.esperarCargaRobusta(page);

                if (exito) {
                    logInfo(`✅ Carga exitosa en intento ${intento}`);
                    return true;
                }

                if (intento < maxReintentos) {
                    logInfo(`Intento ${intento} falló, reintentando en 2 segundos...`);
                    await page.waitForTimeout(2000);
                }

            } catch (error) {
                logError(`Error en intento ${intento}: ${error.message}`);

                if (intento === maxReintentos) {
                    logError('Todos los intentos fallaron, continuando con extracción parcial');
                    return false;
                }
            }
        }

        return false;
    }

    /**
     * Función para extraer texto de forma segura
     */
    static async extraerTextoSeguro(page, selector, descripcion, valorDefault = 'No disponible') {
        try {
            logDebug(`Extrayendo texto de: ${selector} (${descripcion})`);

            const elemento = page.locator(selector).first();
            const existe = await elemento.count() > 0;

            if (!existe) {
                logInfo(`Elemento no encontrado: ${selector} - ${descripcion}`);
                return valorDefault;
            }

            const texto = await elemento.textContent({ timeout: 5000 });
            const textoLimpio = texto ? texto.trim() : valorDefault;

            logInfo(`✓ Texto extraído de ${descripcion}: "${textoLimpio}"`);
            return textoLimpio || valorDefault;
        } catch (error) {
            logError(`Error extrayendo texto de ${selector} (${descripcion}): ${error.message}`);
            return valorDefault;
        }
    }

    /**
     * Función para extraer atributo de forma segura
     */
    static async extraerAtributoSeguro(page, selector, atributo, descripcion, valorDefault = 'No disponible') {
        try {
            logDebug(`Extrayendo atributo '${atributo}' de: ${selector} (${descripcion})`);

            const elemento = page.locator(selector).first();
            const existe = await elemento.count() > 0;

            if (!existe) {
                logInfo(`Elemento no encontrado: ${selector} - ${descripcion}`);
                return valorDefault;
            }

            const valor = await elemento.getAttribute(atributo, { timeout: 5000 });
            const valorLimpio = valor ? valor.trim() : valorDefault;

            logInfo(`✓ Atributo '${atributo}' extraído de ${descripcion}: "${valorLimpio}"`);
            return valorLimpio || valorDefault;
        } catch (error) {
            logError(`Error extrayendo atributo '${atributo}' de ${selector} (${descripcion}): ${error.message}`);
            return valorDefault;
        }
    }

    /**
     * Extractor para MercadoLibre corregido
     */
    static async extraerMercadoLibreCorregido(page) {
        logInfo('🛒 Iniciando extracción CORREGIDA de MercadoLibre...');

        try {
            await this.esperarCargaConRetry(page);

            // 1. Extraer TÍTULO
            const selectoresTitulo = [
                '.ui-pdp-title',
                'h1'
            ];

            let titulo = 'No disponible';
            for (const selector of selectoresTitulo) {
                try {
                    await page.waitForSelector(selector, { timeout: 5000 });
                    titulo = await this.extraerTextoSeguro(page, selector, `título ML (${selector})`);
                    if (titulo !== 'No disponible') {
                        logInfo(`✅ Título encontrado con selector: ${selector}`);
                        break;
                    }
                } catch (error) {
                    logDebug(`Selector de título no encontrado: ${selector}`);
                }
            }

            // 2. Extraer PRECIOS (UF y CLP) 
            const precios = await this.extraerPrecioMercadoLibre(page);

            // 3. Extraer UBICACIÓN exacta
            const ubicacion = await this.extraerUbicacionExacta(page);

            // 4. Extraer CARACTERÍSTICAS detalladas
            const caracteristicas = await this.extraerCaracteristicasDetalladas(page);

            // 5. Extraer DESCRIPCIÓN completa
            const descripcion = await this.extraerDescripcionCompleta(page);

            // 6. Extraer datos básicos
            const datosBasicos = await this.extraerDatosBasicos(page);

            // 7. Extraer imagen principal
            const imagen = await this.extraerImagenPrincipal(page);

            // Construir resultado completo
            const resultado = {
                titulo,
                precio_uf: precios.precio_principal,
                precio_clp: precios.precio_secundario,
                moneda: precios.moneda,
                ubicacion,
                dormitorios: datosBasicos.dormitorios,
                banos: datosBasicos.banos,
                superficie: datosBasicos.superficie,
                descripcion,
                caracteristicas: {
                    pisos: caracteristicas.pisos,
                    jardin: caracteristicas.jardin,
                    quincho: caracteristicas.quincho,
                    piscina: caracteristicas.piscina,
                    estacionamientos: caracteristicas.estacionamientos,
                    antiguedad: caracteristicas.antiguedad,
                    condominio_cerrado: caracteristicas.condominio_cerrado
                },
                caracteristicas_completas: caracteristicas.caracteristicas_completas,
                link: page.url(),
                imagen
            };

            logInfo('✅ Extracción MercadoLibre completada');
            return resultado;

        } catch (error) {
            logError(`Error en extracción de MercadoLibre: ${error.message}`);
            return await this.extraccionEmergenciaMercadoLibre(page);
        }
    }

    /**
     * Extraer PRECIO (UF y CLP) correctamente
     */
    static async extraerPrecioMercadoLibre(page) {
        try {
            logInfo('💰 Extrayendo precios de MercadoLibre...');

            const contenedorPrecio = '.ui-pdp-price';
            await page.waitForSelector(contenedorPrecio, { timeout: 8000 });

            let precioUF = 'No disponible';
            let precioCLP = 'No disponible';
            let monedaPrincipal = '$';

            // Extraer PRECIO PRINCIPAL (UF)
            try {
                const monedaUF = await page.locator('.ui-pdp-price__second-line .andes-money-amount__currency-symbol').first().textContent();
                const cantidadUF = await page.locator('.ui-pdp-price__second-line .andes-money-amount__fraction').first().textContent();

                if (monedaUF && cantidadUF) {
                    precioUF = `${monedaUF} ${cantidadUF.trim()}`;
                    monedaPrincipal = monedaUF.trim();
                    logInfo(`✅ Precio UF extraído: ${precioUF}`);
                }
            } catch (error) {
                // Selector alternativo
                try {
                    const precioElement = await page.locator('.andes-money-amount').first();
                    const moneda = await precioElement.locator('.andes-money-amount__currency-symbol').textContent();
                    const cantidad = await precioElement.locator('.andes-money-amount__fraction').textContent();

                    if (moneda && cantidad) {
                        precioUF = `${moneda} ${cantidad.trim()}`;
                        monedaPrincipal = moneda.trim();
                        logInfo(`✅ Precio principal extraído (alternativo): ${precioUF}`);
                    }
                } catch (altError) {
                    logError('No se pudo extraer precio principal');
                }
            }

            // Extraer PRECIO SECUNDARIO (CLP)
            try {
                const contenedorSubtitulos = '.ui-pdp-price__subtitles';
                const monedaCLP = await page.locator(`${contenedorSubtitulos} .andes-money-amount__currency-symbol`).textContent();
                const cantidadCLP = await page.locator(`${contenedorSubtitulos} .andes-money-amount__fraction`).textContent();

                if (monedaCLP && cantidadCLP) {
                    precioCLP = `${monedaCLP} ${cantidadCLP.trim()}`;
                    logInfo(`✅ Precio CLP extraído: ${precioCLP}`);
                }
            } catch (error) {
                logInfo('No se pudo extraer precio secundario en CLP');
            }

            return {
                precio_principal: precioUF,
                precio_secundario: precioCLP,
                moneda: monedaPrincipal
            };

        } catch (error) {
            logError(`Error extrayendo precios: ${error.message}`);
            return {
                precio_principal: 'No disponible',
                precio_secundario: 'No disponible',
                moneda: '$'
            };
        }
    }

    /**
     * Extraer UBICACIÓN exacta
     */
    static async extraerUbicacionExacta(page) {
        try {
            logInfo('📍 Extrayendo ubicación exacta...');

            // NUEVO: Selectores actualizados basados en el HTML real
            const selectoresUbicacion = [
                '.ui-vip-location .ui-pdp-media__body .ui-pdp-media__title', // Selector principal correcto
                '.ui-pdp-media__title', // Selector fallback
                '.ui-vip-location__subtitle .ui-pdp-media__title', // Otra variante
                '.ui-vip-location .ui-pdp-media__title' // Variante simplificada
            ];

            for (const selector of selectoresUbicacion) {
                try {
                    await page.waitForSelector(selector, { timeout: 3000 });
                    const ubicacion = await page.locator(selector).textContent();

                    if (ubicacion && ubicacion.trim().length > 10) {
                        const ubicacionLimpia = ubicacion.trim();
                        logInfo(`✅ Ubicación extraída con ${selector}: ${ubicacionLimpia}`);
                        return ubicacionLimpia;
                    }
                } catch (error) {
                    logDebug(`Selector de ubicación no encontrado: ${selector}`);
                    continue;
                }
            }

            // FALLBACK: Buscar en cualquier elemento que contenga coordenadas o ubicación
            try {
                const elementosUbicacion = await page.locator('p:has-text("RM (Metropolitana)")').all();
                for (const elemento of elementosUbicacion) {
                    const texto = await elemento.textContent();
                    if (texto && texto.includes(',') && texto.length > 15) {
                        logInfo(`✅ Ubicación encontrada via fallback: ${texto.trim()}`);
                        return texto.trim();
                    }
                }
            } catch (error) {
                logDebug('Fallback de ubicación falló');
            }

            logInfo('⚠️ No se pudo extraer ubicación');
            return 'No disponible';

        } catch (error) {
            logError(`Error extrayendo ubicación: ${error.message}`);
            return 'No disponible';
        }
    }

    /**
   * CORRECCIÓN 3: Extraer características detalladas con selectores mejorados
   */
    static async extraerCaracteristicasDetalladas(page) {
        try {
            logInfo('🏠 Extrayendo características detalladas...');

            const caracteristicas = {};

            // MÉTODO 1: Extraer de highlighted-specs (para specs básicas como estacionamientos)
            try {
                const elementosHighlighted = await page.locator('.ui-vpp-highlighted-specs__key-value').all();

                for (let elemento of elementosHighlighted) {
                    try {
                        const clave = await elemento.locator('.ui-pdp-color--BLACK.ui-pdp-size--XSMALL.ui-pdp-family--REGULAR').textContent();
                        const valor = await elemento.locator('.ui-pdp-color--BLACK.ui-pdp-size--XSMALL.ui-pdp-family--SEMIBOLD').textContent();

                        if (clave && valor) {
                            const claveNormalizada = clave.replace(':', '').trim().toLowerCase();
                            caracteristicas[claveNormalizada] = valor.trim();
                            logDebug(`Característica highlighted extraída: ${clave} = ${valor}`);
                        }
                    } catch (error) {
                        logDebug(`Error extrayendo característica highlighted individual: ${error.message}`);
                    }
                }
            } catch (error) {
                logDebug('No se pudieron extraer características highlighted');
            }

            // MÉTODO 2: Extraer de la tabla de especificaciones técnicas
            try {
                const filasTabla = await page.locator('.andes-table tbody tr').all();

                for (const fila of filasTabla) {
                    try {
                        const header = await fila.locator('th').textContent();
                        const value = await fila.locator('td span').textContent();

                        if (header && value) {
                            const headerNormalizado = header.trim().toLowerCase();
                            caracteristicas[headerNormalizado] = value.trim();
                            logDebug(`Característica tabla extraída: ${header} = ${value}`);
                        }
                    } catch (error) {
                        logDebug(`Error extrayendo fila de tabla: ${error.message}`);
                    }
                }
            } catch (error) {
                logDebug('No se pudieron extraer características de tabla');
            }

            // MÉTODO 3: Extraer de comodidades y equipamiento
            try {
                const comodidades = await page.locator('.ui-pdp-specs__tab-spec .ui-pdp-specs__specs-list span').allTextContents();

                // Procesar comodidades para detectar características específicas
                const comodidadesText = comodidades.join(' ').toLowerCase();

                if (comodidadesText.includes('quincho')) {
                    caracteristicas['quincho'] = 'Sí';
                }
                if (comodidadesText.includes('piscina')) {
                    caracteristicas['piscina'] = 'Sí';
                }
                if (comodidadesText.includes('gimnasio')) {
                    caracteristicas['gimnasio'] = 'Sí';
                }
                if (comodidadesText.includes('estacionamiento')) {
                    caracteristicas['estacionamiento de visitas'] = 'Sí';
                }

                logDebug(`Comodidades procesadas: ${comodidades.length} elementos`);
            } catch (error) {
                logDebug('No se pudieron extraer comodidades');
            }

            // CONSTRUIR RESULTADO FINAL con mapeo mejorado
            const resultado = {
                pisos: caracteristicas['cantidad de pisos'] || 'No disponible',
                jardin: caracteristicas['jardín'] || (caracteristicas['jardin'] ? 'Sí' : 'No disponible'),
                quincho: caracteristicas['quincho'] || 'No disponible',
                piscina: caracteristicas['piscina'] || 'No disponible',
                estacionamientos: caracteristicas['estacionamientos'] || 'No disponible',
                antiguedad: caracteristicas['antigüedad'] || caracteristicas['antiguedad'] || 'No disponible',
                condominio_cerrado: caracteristicas['con condominio cerrado'] || 'No disponible',
                caracteristicas_completas: caracteristicas
            };

            logInfo('✅ Características extraídas con métodos mejorados');
            return resultado;

        } catch (error) {
            logError(`Error extrayendo características: ${error.message}`);
            return {
                pisos: 'No disponible',
                jardin: 'No disponible',
                quincho: 'No disponible',
                piscina: 'No disponible',
                estacionamientos: 'No disponible',
                antiguedad: 'No disponible',
                condominio_cerrado: 'No disponible',
                caracteristicas_completas: {}
            };
        }
    }

    /**
     * Extraer DESCRIPCIÓN completa
     */
    static async extraerDescripcionCompleta(page) {
        try {
            logInfo('📝 Extrayendo descripción completa...');

            const selectorDescripcion = '.ui-pdp-description__content';
            await page.waitForSelector(selectorDescripcion, { timeout: 8000 });

            const descripcion = await page.locator(selectorDescripcion).textContent();

            if (descripcion && descripcion.trim().length > 0) {
                const descripcionLimpia = descripcion.trim()
                    .replace(/\n\s*\n/g, '\n')
                    .replace(/\s+/g, ' ')
                    .trim();

                logInfo(`✅ Descripción extraída (${descripcionLimpia.length} caracteres)`);
                return descripcionLimpia;
            } else {
                logInfo('Descripción vacía encontrada');
                return 'No disponible';
            }

        } catch (error) {
            logError(`Error extrayendo descripción: ${error.message}`);
            return 'No disponible';
        }
    }

    /**
 * CORRECCIÓN 2: Extraer datos básicos de los elementos highlighted-specs
 */
    static async extraerDatosBasicos(page) {
        try {
            logInfo('🏠 Extrayendo datos básicos de highlighted-specs...');

            let dormitorios = 'No disponible';
            let banos = 'No disponible';
            let superficie = 'No disponible';

            // NUEVO: Extraer de los elementos highlighted-specs primero
            try {
                const elementosSpecs = await page.locator('.ui-pdp-highlighted-specs-res .ui-pdp-highlighted-specs-res__icon-label').all();

                for (const elemento of elementosSpecs) {
                    try {
                        const texto = await elemento.locator('.ui-pdp-label').textContent();
                        if (!texto) continue;

                        const textoLower = texto.toLowerCase();

                        // Detectar dormitorios
                        if (textoLower.includes('dormitorio')) {
                            if (textoLower.includes('estudio a')) {
                                // Caso: "Estudio a 2 dormitorios"
                                const match = textoLower.match(/estudio a (\d+) dormitorio/);
                                if (match) {
                                    dormitorios = `${match[1]} dormitorios`;
                                }
                            } else {
                                // Caso: "3 dormitorios"
                                const match = textoLower.match(/(\d+) dormitorio/);
                                if (match) {
                                    dormitorios = `${match[1]} dormitorios`;
                                }
                            }
                            logInfo(`✅ Dormitorios extraídos de specs: ${dormitorios}`);
                        }

                        // Detectar baños
                        if (textoLower.includes('baño')) {
                            if (textoLower.includes('a')) {
                                // Caso: "1 a 2 baños"
                                const match = textoLower.match(/(\d+) a (\d+) baño/);
                                if (match) {
                                    banos = `${match[1]} a ${match[2]} baños`;
                                }
                            } else {
                                // Caso: "1 baño" o "2 baños"
                                const match = textoLower.match(/(\d+) baño/);
                                if (match) {
                                    banos = `${match[1]} baños`;
                                }
                            }
                            logInfo(`✅ Baños extraídos de specs: ${banos}`);
                        }

                        // Detectar superficie
                        if (textoLower.includes('m²') || textoLower.includes('m2')) {
                            if (textoLower.includes('totales')) {
                                // Caso: "160 m² totales"
                                superficie = texto.trim();
                                logInfo(`✅ Superficie extraída de specs: ${superficie}`);
                            } else if (textoLower.includes('útiles')) {
                                // Caso: "25.33 a 68.5 m² útiles"
                                superficie = texto.trim();
                                logInfo(`✅ Superficie útil extraída de specs: ${superficie}`);
                            }
                        }

                    } catch (error) {
                        logDebug(`Error procesando elemento spec: ${error.message}`);
                    }
                }
            } catch (error) {
                logDebug('No se pudieron extraer datos básicos de highlighted-specs');
            }

            // FALLBACK: Extraer de tabla de especificaciones si no se encontraron en highlighted-specs
            if (superficie === 'No disponible') {
                try {
                    const tablaSuperficie = await page.locator('.andes-table th:has-text("Superficie útil") + td span').textContent();
                    if (tablaSuperficie && tablaSuperficie.trim()) {
                        superficie = tablaSuperficie.trim();
                        logInfo(`✅ Superficie extraída de tabla: ${superficie}`);
                    }
                } catch (error) {
                    logDebug('No se pudo extraer superficie de tabla');
                }
            }

            if (dormitorios === 'No disponible') {
                try {
                    const tablaDormitorios = await page.locator('.andes-table th:has-text("Dormitorios") + td span').textContent();
                    if (tablaDormitorios && tablaDormitorios.trim()) {
                        dormitorios = `${tablaDormitorios.trim()} dormitorios`;
                        logInfo(`✅ Dormitorios extraídos de tabla: ${dormitorios}`);
                    }
                } catch (error) {
                    logDebug('No se pudieron extraer dormitorios de tabla');
                }
            }

            if (banos === 'No disponible') {
                try {
                    const tablaBanos = await page.locator('.andes-table th:has-text("Baños") + td span').textContent();
                    if (tablaBanos && tablaBanos.trim()) {
                        banos = `${tablaBanos.trim()} baños`;
                        logInfo(`✅ Baños extraídos de tabla: ${banos}`);
                    }
                } catch (error) {
                    logDebug('No se pudieron extraer baños de tabla');
                }
            }

            // SEGUNDO FALLBACK: Intentar extraer de la descripción (método original como último recurso)
            if (dormitorios === 'No disponible' || banos === 'No disponible' || superficie === 'No disponible') {
                try {
                    const descripcion = await page.locator('.ui-pdp-description__content').textContent();
                    if (descripcion) {
                        const texto = descripcion.toLowerCase();

                        if (dormitorios === 'No disponible') {
                            const matchDormitorios = texto.match(/(\d+)\s*dormitorio/i);
                            if (matchDormitorios) {
                                dormitorios = `${matchDormitorios[1]} dormitorios`;
                                logInfo(`✅ Dormitorios extraídos de descripción: ${dormitorios}`);
                            }
                        }

                        if (banos === 'No disponible') {
                            const matchBanos = texto.match(/(\d+)\s*baño/i);
                            if (matchBanos) {
                                banos = `${matchBanos[1]} baños`;
                                logInfo(`✅ Baños extraídos de descripción: ${banos}`);
                            }
                        }

                        if (superficie === 'No disponible') {
                            const matchSuperficie = texto.match(/(\d+)\s*m2?\s*(construidos?|terreno|superficie)/i);
                            if (matchSuperficie) {
                                superficie = `${matchSuperficie[1]} m²`;
                                logInfo(`✅ Superficie extraída de descripción: ${superficie}`);
                            }
                        }
                    }
                } catch (error) {
                    logDebug('No se pudo extraer datos básicos de la descripción');
                }
            }

            return { dormitorios, banos, superficie };

        } catch (error) {
            logError(`Error extrayendo datos básicos: ${error.message}`);
            return {
                dormitorios: 'No disponible',
                banos: 'No disponible',
                superficie: 'No disponible'
            };
        }
    }
    /**
 * CORRECCIÓN 4: Extraer imagen principal con selectores más robustos
 */
    static async extraerImagenPrincipal(page) {
        const selectoresImagen = [
            '.ui-pdp-gallery__figure img', // Selector original
            '.ui-pdp-image', // Selector del HTML proporcionado
            '.gallery-image img',
            '.item-image img',
            'img[src*="mlstatic.com"]', // Específico para MercadoLibre
            'img[srcset*="mlstatic.com"]', // Con srcset
            'img[src*="http"]'
        ];

        for (const selector of selectoresImagen) {
            try {
                await page.waitForSelector(selector, { timeout: 3000 });

                // Intentar obtener srcset primero (mejor calidad)
                let imagen = await page.locator(selector).first().getAttribute('srcset');
                if (imagen) {
                    // Extraer la URL de mayor resolución del srcset
                    const urls = imagen.split(',').map(url => url.trim().split(' ')[0]);
                    imagen = urls[urls.length - 1]; // Tomar la última (generalmente mayor resolución)
                } else {
                    // Fallback a src normal
                    imagen = await page.locator(selector).first().getAttribute('src');
                }

                if (imagen &&
                    imagen.startsWith('http') &&
                    !imagen.includes('placeholder') &&
                    !imagen.includes('default')) {
                    logInfo(`✅ Imagen encontrada con ${selector}: ${imagen.substring(0, 50)}...`);
                    return imagen;
                }
            } catch (error) {
                logDebug(`Selector de imagen no encontrado: ${selector}`);
                continue;
            }
        }

        return 'No disponible';
    }

    /**
     * Extractor para Portal Inmobiliario
     */
    static async extraerPortalInmobiliario(page) {
        logInfo('🏠 Iniciando extracción de Portal Inmobiliario...');

        try {
            await this.esperarCargaConRetry(page);

            // Verificar si es listado o detalle
            const selectoresListado = [
                '.ui-search-layout__item',
                '.ui-search-results__item'
            ];

            let esListado = false;
            for (const selector of selectoresListado) {
                try {
                    const count = await page.locator(selector).count();
                    if (count > 0) {
                        esListado = true;
                        break;
                    }
                } catch (error) {
                    continue;
                }
            }

            if (esListado) {
                return await this.extraerPrimeraPropiedad(page);
            } else {
                return await this.extraerDetallePropiedadPI(page);
            }

        } catch (error) {
            logError(`Error en Portal Inmobiliario: ${error.message}`);
            throw error;
        }
    }

    /**
     * Extraer primera propiedad del listado
     */
    static async extraerPrimeraPropiedad(page) {
        const primerItem = page.locator('.ui-search-layout__item').first();

        const count = await primerItem.count();
        if (count === 0) {
            throw new Error('No se encontró ningún elemento en el listado');
        }

        const titulo = await this.extraerTextoSeguro(primerItem, '.poly-component__title', 'título');
        const ubicacion = await this.extraerTextoSeguro(primerItem, '.poly-component__location', 'ubicación');

        const resultado = {
            titulo,
            precio: 'No disponible',
            moneda: '$',
            ubicacion,
            dormitorios: 'No disponible',
            banos: 'No disponible',
            superficie: 'No disponible',
            link: page.url(),
            imagen: 'No disponible'
        };

        logInfo('✅ Extracción de primera propiedad completada');
        return resultado;
    }

    /**
     * Extraer detalle de propiedad PI
     */
    static async extraerDetallePropiedadPI(page) {
        const titulo = await this.extraerTextoSeguro(page, 'h1', 'título detalle');

        const resultado = {
            titulo,
            precio: 'No disponible',
            moneda: '$',
            ubicacion: 'No disponible',
            dormitorios: 'No disponible',
            banos: 'No disponible',
            superficie: 'No disponible',
            link: page.url(),
            imagen: 'No disponible'
        };

        logInfo('✅ Extracción de detalle PI completada');
        return resultado;
    }

    /**
     * Extractor genérico
     */
    static async extraerGenerico(page) {
        logInfo('🔧 Usando extractor genérico...');

        const titulo = await this.extraerTextoSeguro(page, 'h1', 'título genérico');

        const resultado = {
            titulo,
            precio: 'No disponible',
            moneda: '$',
            ubicacion: 'No disponible',
            dormitorios: 'No disponible',
            banos: 'No disponible',
            superficie: 'No disponible',
            link: page.url(),
            imagen: 'No disponible'
        };

        logInfo('✅ Extracción genérica completada');
        return resultado;
    }

    /**
     * Extracción de emergencia para MercadoLibre
     */
    static async extraccionEmergenciaMercadoLibre(page) {
        logInfo('⚠️ Ejecutando extracción de emergencia...');

        try {
            const titulo = await page.title() || 'No disponible';
            const url = page.url();

            const h1Text = await this.extraerTextoSeguro(page, 'h1', 'título h1 emergencia');
            const tituloFinal = h1Text !== 'No disponible' ? h1Text : titulo;

            return {
                titulo: tituloFinal,
                precio_uf: 'No disponible',
                precio_clp: 'No disponible',
                moneda: '$',
                ubicacion: 'No disponible',
                dormitorios: 'No disponible',
                banos: 'No disponible',
                superficie: 'No disponible',
                descripcion: 'No disponible',
                caracteristicas: {
                    pisos: 'No disponible',
                    jardin: 'No disponible',
                    quincho: 'No disponible',
                    piscina: 'No disponible',
                    estacionamientos: 'No disponible',
                    antiguedad: 'No disponible',
                    condominio_cerrado: 'No disponible'
                },
                caracteristicas_completas: {},
                link: url,
                imagen: 'No disponible',
                nota: 'Datos extraídos en modo de emergencia'
            };
        } catch (error) {
            logError(`Error en extracción de emergencia: ${error.message}`);
            throw error;
        }
    }
}

module.exports = ScrapingService;