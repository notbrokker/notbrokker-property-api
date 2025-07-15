// src/services/mortgage/MortgageService.js
const { chromium } = require('playwright');
const { logInfo, logError, logDebug } = require('../../utils/logger');
const { ErrorFactory } = require('../../utils/errors');

/**
 * Servicio real de simulación hipotecaria CMF
 */
class MortgageService {

    /**
     * Simular crédito hipotecario en CMF
     */
    static async simulateMortgage(monto, plazo, incluirAnalisis = false) {
        logInfo('🏦 Iniciando simulación hipotecaria CMF', { monto, plazo });

        const browser = await this.launchBrowser();
        let context, page;

        try {
            context = await this.createContext(browser);
            page = await context.newPage();

            // Navegar al simulador CMF
            const url = 'https://servicios.cmfchile.cl/simuladorhipotecario/aplicacion?indice=101.2.1';
            logInfo('🌐 Navegando al simulador CMF', { url });

            await page.goto(url, {
                timeout: 30000,
                waitUntil: 'domcontentloaded'
            });

            // Llenar formulario CMF
            await this.llenarFormularioCMF(page, monto, plazo);

            // Extraer tabla comparativa
            const tablaComparativa = await this.extraerTablaComparativa(page);

            // Extraer detalles de cada banco
            const bancosConDetalle = await this.extraerDetallesBancos(page, tablaComparativa.bancos);

            // Construir resultado
            const resultado = {
                parametrosSimulacion: {
                    monto: `${monto} UF`,
                    plazo: `${plazo} años`,
                    tipoCredito: 'Mutuo No Endosable',
                    tipoTasa: 'Fija'
                },
                resumenComparativo: {
                    totalBancos: bancosConDetalle.length,
                    valorUF: tablaComparativa.valorUF,
                    mejorOferta: bancosConDetalle.length > 0 ? bancosConDetalle[0] : null
                },
                bancos: bancosConDetalle,
                timestamp: new Date().toISOString()
            };

            // Agregar análisis si se solicita
            if (incluirAnalisis && bancosConDetalle.length > 0) {
                resultado.analisis = this.generarAnalisisComparativo(bancosConDetalle);
            }

            logInfo('✅ Simulación CMF completada', {
                bancos: bancosConDetalle.length,
                monto,
                plazo
            });

            return {
                success: true,
                data: this.limpiarDatosCMF(resultado)
            };

        } catch (error) {
            logError('❌ Error durante simulación CMF', {
                monto, plazo,
                error: error.message
            });

            throw ErrorFactory.internal('Error procesando simulación hipotecaria', error);

        } finally {
            try {
                if (context) await context.close();
                await browser.close();
                logDebug('🔒 Browser CMF cerrado correctamente');
            } catch (closeError) {
                logError('Error cerrando browser CMF', { error: closeError.message });
            }
        }
    }

    /**
     * Comparar múltiples escenarios
     */
    static async compareScenarios(escenarios, incluirAnalisis = false) {
        logInfo('📊 Iniciando comparación de escenarios', { escenarios: escenarios.length });

        const resultados = [];

        for (const [index, escenario] of escenarios.entries()) {
            try {
                logInfo(`🔄 Procesando escenario ${index + 1}/${escenarios.length}`, escenario);

                const resultado = await this.simulateMortgage(escenario.monto, escenario.plazo, incluirAnalisis);

                resultados.push({
                    escenario: {
                        numero: index + 1,
                        monto: escenario.monto,
                        plazo: escenario.plazo,
                        etiqueta: escenario.etiqueta || `${escenario.monto} UF x ${escenario.plazo} años`
                    },
                    resultado: resultado.data,
                    resumen: {
                        mejorOferta: resultado.data.bancos[0] ? {
                            banco: resultado.data.bancos[0].banco,
                            dividendo: resultado.data.bancos[0].dividendoMensual,
                            tasa: resultado.data.bancos[0].tasaCredito
                        } : null,
                        totalBancos: resultado.data.bancos.length
                    }
                });

                // Pausa entre simulaciones para no sobrecargar CMF
                if (index < escenarios.length - 1) {
                    logDebug('Esperando entre simulaciones...');
                    await new Promise(resolve => setTimeout(resolve, 3000));
                }

            } catch (error) {
                logError(`Error en escenario ${index + 1}`, { error: error.message });

                resultados.push({
                    escenario: {
                        numero: index + 1,
                        monto: escenario.monto,
                        plazo: escenario.plazo,
                        etiqueta: escenario.etiqueta || `${escenario.monto} UF x ${escenario.plazo} años`
                    },
                    error: error.message,
                    mensaje: 'Error procesando este escenario'
                });
            }
        }

        // Generar comparación entre escenarios exitosos
        const escenariosExitosos = resultados.filter(r => !r.error);
        let comparacionGeneral = null;

        if (escenariosExitosos.length > 1) {
            comparacionGeneral = this.generarComparacionEscenarios(escenariosExitosos);
        }

        return {
            success: true,
            comparacion: {
                escenarios: resultados,
                resumen: {
                    totalEscenarios: escenarios.length,
                    escenariosProcesados: escenariosExitosos.length,
                    escenariosConError: escenarios.length - escenariosExitosos.length
                },
                comparacionGeneral
            },
            metadata: {
                timestamp: new Date().toISOString(),
                tiempoProcesamiento: `Aproximadamente ${escenarios.length * 30} segundos`
            }
        };
    }

    /**
     * Lanzar browser para CMF
     */
    static async launchBrowser() {
        return await chromium.launch({
            headless: true, // CMF puede requerir interacción visual
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

    // src/services/mortgage/MortgageService.js (REEMPLAZAR MÉTODO llenarFormularioCMF)

    /**
     * Llenar formulario CMF con manejo de carga dinámica
     */
    static async llenarFormularioCMF(page, monto, plazo) {
        try {
            logInfo(`📝 Llenando formulario CMF con carga dinámica: ${monto} UF por ${plazo} años`);

            // Esperar a que cargue la página completamente
            await page.waitForLoadState('domcontentloaded');
            await page.waitForTimeout(3000);

            // ========================================
            // 1. SELECCIONAR UF - TRIGGER PARA OPCIONES DINÁMICAS
            // ========================================
            logDebug('Paso 1: Seleccionando UF (puede activar carga de opciones)');

            try {
                await page.waitForSelector('#UF', { timeout: 10000 });

                // Verificar si ya está seleccionado
                const yaSeleccionado = await page.isChecked('#UF');
                if (!yaSeleccionado) {
                    await page.check('#UF');
                    logInfo('✓ UF seleccionado');

                    // Esperar a que se procese la selección
                    await page.waitForTimeout(2000);
                } else {
                    logInfo('✓ UF ya estaba seleccionado');
                }
            } catch (error) {
                throw new Error(`No se pudo seleccionar UF: ${error.message}`);
            }

            // ========================================
            // 2. INGRESAR MONTO - OTRO TRIGGER POSIBLE
            // ========================================
            logDebug('Paso 2: Ingresando monto (puede activar carga de opciones)');

            try {
                await page.waitForSelector('#monto', { timeout: 10000 });

                // Limpiar campo y enfocar
                await page.click('#monto');
                await page.fill('#monto', '');
                await page.waitForTimeout(500);

                // Ingresar monto
                await page.type('#monto', monto.toString(), { delay: 100 });

                // Trigger eventos que pueden cargar opciones
                await page.press('#monto', 'Tab'); // Tab out del campo
                await page.waitForTimeout(1000);

                // Verificar que el valor se ingresó
                const valorActual = await page.inputValue('#monto');
                if (valorActual === monto.toString()) {
                    logInfo(`✓ Monto ingresado correctamente: ${monto} UF`);
                } else {
                    throw new Error(`Monto no coincide. Esperado: ${monto}, Actual: ${valorActual}`);
                }
            } catch (error) {
                throw new Error(`No se pudo ingresar el monto: ${error.message}`);
            }

            // ========================================
            // 3. ESPERAR CARGA DINÁMICA DE OPCIONES DE PLAZO
            // ========================================
            logDebug('Paso 3: Esperando carga dinámica de opciones de plazo...');

            try {
                // Función para verificar si las opciones se han cargado
                const verificarOpcionesCargadas = async () => {
                    const opciones = await page.locator('select#plazo option').allTextContents();
                    logDebug(`Opciones actuales de plazo: [${opciones.join(', ')}]`);
                    return opciones.length > 1 && !opciones.every(opt => opt.includes('Seleccione'));
                };

                // Esperar hasta 30 segundos a que se carguen las opciones
                let intentos = 0;
                const maxIntentos = 30;
                let opcionesCargadas = false;

                while (intentos < maxIntentos && !opcionesCargadas) {
                    opcionesCargadas = await verificarOpcionesCargadas();

                    if (!opcionesCargadas) {
                        logDebug(`Intento ${intentos + 1}/${maxIntentos}: Esperando opciones...`);

                        // En algunos intentos, hacer acciones que podrían triggear la carga
                        if (intentos === 5) {
                            logDebug('Intentando click en el select para activar carga...');
                            await page.click('select#plazo');
                            await page.waitForTimeout(1000);
                        }

                        if (intentos === 10) {
                            logDebug('Intentando hacer focus en monto nuevamente...');
                            await page.focus('#monto');
                            await page.waitForTimeout(500);
                            await page.press('#monto', 'Enter');
                            await page.waitForTimeout(1000);
                        }

                        if (intentos === 15) {
                            logDebug('Intentando hacer click en UF nuevamente...');
                            await page.click('#UF');
                            await page.waitForTimeout(1000);
                        }

                        await page.waitForTimeout(1000);
                        intentos++;
                    } else {
                        logInfo(`✓ Opciones de plazo cargadas después de ${intentos + 1} intentos`);
                    }
                }

                if (!opcionesCargadas) {
                    throw new Error('Las opciones de plazo no se cargaron después de 30 segundos');
                }

                // Obtener todas las opciones disponibles
                const opcionesDisponibles = await page.locator('select#plazo option').allTextContents();
                logInfo(`Opciones de plazo disponibles: [${opcionesDisponibles.join(', ')}]`);

            } catch (error) {
                throw new Error(`Error esperando opciones de plazo: ${error.message}`);
            }

            // ========================================
            // 4. SELECCIONAR PLAZO ESPECÍFICO
            // ========================================
            logDebug(`Paso 4: Seleccionando plazo de ${plazo} años`);

            try {
                const opcionesTexto = await page.locator('select#plazo option').allTextContents();

                // Estrategias para encontrar la opción correcta
                let opcionSeleccionada = false;
                const buscarPatrones = [
                    plazo.toString(),
                    `${plazo} años`,
                    `${plazo} año`,
                    `${plazo} Años`,
                    `${plazo} Año`,
                    `${plazo}años`, // Sin espacio
                    `año ${plazo}`,
                    `años ${plazo}`
                ];

                // Buscar coincidencia exacta primero
                for (const patron of buscarPatrones) {
                    const opcionEncontrada = opcionesTexto.find(opcion =>
                        opcion.toLowerCase().includes(patron.toLowerCase())
                    );

                    if (opcionEncontrada) {
                        try {
                            await page.selectOption('select#plazo', { label: opcionEncontrada });
                            logInfo(`✓ Plazo seleccionado: "${opcionEncontrada}" (patrón: ${patron})`);
                            opcionSeleccionada = true;
                            break;
                        } catch (selectError) {
                            logDebug(`Error con patrón "${patron}": ${selectError.message}`);
                        }
                    }
                }

                // Si no se encontró coincidencia exacta, buscar la más cercana
                if (!opcionSeleccionada) {
                    logInfo(`No se encontró plazo exacto de ${plazo} años, buscando el más cercano...`);

                    const opcionesConNumero = opcionesTexto
                        .map((opcion, index) => {
                            const match = opcion.match(/(\d+)/);
                            return match ? {
                                texto: opcion,
                                numero: parseInt(match[1]),
                                index
                            } : null;
                        })
                        .filter(item => item !== null);

                    if (opcionesConNumero.length > 0) {
                        // Encontrar la opción más cercana
                        const masCercana = opcionesConNumero.reduce((prev, curr) =>
                            Math.abs(curr.numero - plazo) < Math.abs(prev.numero - plazo) ? curr : prev
                        );

                        await page.selectOption('select#plazo', { label: masCercana.texto });
                        logInfo(`✓ Plazo más cercano seleccionado: "${masCercana.texto}" (solicitado: ${plazo} años)`);
                        opcionSeleccionada = true;
                    } else {
                        throw new Error('No se encontraron opciones válidas con números');
                    }
                }

                if (!opcionSeleccionada) {
                    throw new Error('No se pudo seleccionar ninguna opción de plazo');
                }

            } catch (error) {
                throw new Error(`Error seleccionando plazo: ${error.message}`);
            }

            await page.waitForTimeout(1000);

            // ========================================
            // 5. ENVIAR FORMULARIO
            // ========================================
            logDebug('Paso 5: Enviando formulario');

            try {
                // Verificar que el botón submit esté disponible
                await page.waitForSelector('input[type="submit"][value="Simular »"]', { timeout: 10000 });

                // Click en el botón submit
                await page.click('input[type="submit"][value="Simular »"]');
                logInfo('✓ Formulario enviado');

                // Esperar navegación o carga de resultados
                await page.waitForLoadState('domcontentloaded');

            } catch (error) {
                throw new Error(`Error enviando formulario: ${error.message}`);
            }

            // ========================================
            // 6. VERIFICAR CARGA DE RESULTADOS
            // ========================================
            logDebug('Paso 6: Verificando carga de resultados...');

            try {
                // Esperar tiempo adicional para procesar
                await page.waitForTimeout(5000);

                // Verificar si aparecieron resultados
                const posiblesSelectoresResultados = [
                    '#simuladorCreditoHipotecario',
                    'table tbody tr',
                    '.tabla-resultados',
                    '[id*="resultado"]',
                    'table.table tbody',
                    'tr:has-text("Banco")',
                    'tr:has-text("banco")',
                    'tr:has-text("institución")'
                ];

                let resultadosEncontrados = false;
                for (const selector of posiblesSelectoresResultados) {
                    try {
                        await page.waitForSelector(selector, { timeout: 8000 });
                        const elementos = await page.locator(selector).count();
                        if (elementos > 0) {
                            logInfo(`✓ Resultados encontrados con selector: ${selector} (${elementos} elementos)`);
                            resultadosEncontrados = true;
                            break;
                        }
                    } catch (error) {
                        logDebug(`Selector de resultados no encontrado: ${selector}`);
                    }
                }

                if (!resultadosEncontrados) {
                    // Buscar por texto que indique resultados
                    const textosResultado = ['banco', 'institución', 'dividendo', 'tasa', 'cae'];
                    for (const texto of textosResultado) {
                        try {
                            await page.waitForSelector(`:text-is("${texto}")`, { timeout: 3000 });
                            logInfo(`✓ Texto de resultados encontrado: ${texto}`);
                            resultadosEncontrados = true;
                            break;
                        } catch (error) {
                            // Continuar con el siguiente texto
                        }
                    }
                }

                if (resultadosEncontrados) {
                    logInfo('✅ Formulario completado y resultados cargados exitosamente');
                } else {
                    logInfo('⚠️ Formulario enviado pero no se pudieron verificar resultados específicos');
                }

            } catch (error) {
                logInfo(`Advertencia verificando resultados: ${error.message}`);
            }

            return true;

        } catch (error) {
            logError(`Error en formulario CMF dinámico: ${error.message}`);
            throw error;
        }
    }

    /**
     * Extraer tabla comparativa de bancos
     */
    static async extraerTablaComparativa(page) {
        try {
            logInfo('📊 Extrayendo tabla comparativa');

            const selectorTabla = '#simuladorCreditoHipotecario table';
            await page.waitForSelector(selectorTabla, { timeout: 15000 });

            const bancos = [];
            const filas = await page.locator(`${selectorTabla} tbody tr`).all();

            for (let i = 0; i < filas.length; i++) {
                try {
                    const fila = filas[i];

                    const banco = await fila.locator('td').nth(0).textContent();
                    const tipoCredito = await fila.locator('td').nth(1).textContent();
                    const dividendoMensual = await fila.locator('td').nth(2).textContent();
                    const monedaCredito = await fila.locator('td').nth(3).textContent();
                    const tipoTasa = await fila.locator('td').nth(4).textContent();
                    const tasaCredito = await fila.locator('td').nth(5).textContent();
                    const cae = await fila.locator('td').nth(6).textContent();

                    const botonDetalle = fila.locator('button[data-target]');
                    const dataTarget = await botonDetalle.getAttribute('data-target');

                    bancos.push({
                        banco: banco?.trim() || 'No disponible',
                        tipoCredito: tipoCredito?.trim() || 'No disponible',
                        dividendoMensual: dividendoMensual?.trim() || 'No disponible',
                        monedaCredito: monedaCredito?.trim() || 'No disponible',
                        tipoTasa: tipoTasa?.trim() || 'No disponible',
                        tasaCredito: tasaCredito?.trim() || 'No disponible',
                        cae: cae?.trim() || 'No disponible',
                        modalId: dataTarget || `#myModal${i + 1}`,
                        posicion: i + 1
                    });

                } catch (error) {
                    logError(`Error extrayendo banco ${i + 1}`, { error: error.message });
                }
            }

            // Extraer valor UF
            let valorUF = 'No disponible';
            try {
                const textoUF = await page.locator('.info').textContent();
                if (textoUF && textoUF.includes('Valor UF')) {
                    valorUF = textoUF;
                }
            } catch (error) {
                logDebug('No se pudo extraer valor UF');
            }

            logInfo(`✅ Tabla extraída: ${bancos.length} bancos`);

            return {
                bancos,
                valorUF,
                totalBancos: bancos.length
            };

        } catch (error) {
            logError('Error extrayendo tabla comparativa', { error: error.message });
            throw error;
        }
    }


    // src/services/mortgage/MortgageService.js (REEMPLAZAR MÉTODO extraerDetallesBancos)

    /**
     * Extraer detalles completos de cada banco
     */
    static async extraerDetallesBancos(page, bancos) {
        const bancosConDetalle = [];

        for (const banco of bancos) {
            try {
                logInfo(`📋 Extrayendo detalle para: ${banco.banco}`);

                const detalle = await this.extraerDetalleCredito(page, banco.modalId);

                bancosConDetalle.push({
                    ...banco,
                    detalle
                });

                logInfo(`✅ Detalle extraído para: ${banco.banco}`);

            } catch (error) {
                logError(`Error extrayendo detalle para ${banco.banco}: ${error.message}`);

                bancosConDetalle.push({
                    ...banco,
                    detalle: {
                        error: error.message,
                        valoresUnicaVez: {},
                        valoresMensuales: {},
                        seguros: {},
                        actualizacion: {}
                    }
                });
            }
        }

        return bancosConDetalle;
    }

    /**
     * Extraer detalle específico de un crédito (migrado del server.js original)
     */
    static async extraerDetalleCredito(page, modalId) {
        try {
            logInfo(`🔍 Extrayendo detalle del crédito para modal: ${modalId}`);

            // Hacer clic en el botón detalle correspondiente
            const selectorBoton = `button[data-target="${modalId}"]`;
            await page.waitForSelector(selectorBoton, { timeout: 10000 });
            await page.click(selectorBoton);

            // Esperar a que aparezca el modal
            await page.waitForSelector(modalId, { timeout: 10000 });
            await page.waitForTimeout(2000);

            const detalle = {
                valoresUnicaVez: {},
                valoresMensuales: {},
                seguros: {},
                actualizacion: {}
            };

            // Extraer valores a pagar por única vez
            try {
                const selectorUnicaVez = `${modalId} .fieldset:has(h5:has-text("única vez")) ul.list-group li`;
                const itemsUnicaVez = await page.locator(selectorUnicaVez).all();

                for (const item of itemsUnicaVez) {
                    const texto = await item.textContent();
                    if (texto) {
                        const lineas = texto.split('\t').filter(l => l.trim());
                        if (lineas.length >= 2) {
                            const concepto = lineas[0].replace(':', '').trim();
                            const valor = lineas[1].trim();
                            detalle.valoresUnicaVez[concepto] = valor;
                        }
                    }
                }
            } catch (error) {
                logDebug('Error extrayendo valores única vez');
            }

            // Extraer dividendo mensual sin seguros
            try {
                const selectorDividendo = `${modalId} h6:has-text("sin seguros") + ul.list-group li`;
                const itemsDividendo = await page.locator(selectorDividendo).all();

                for (const item of itemsDividendo) {
                    const texto = await item.textContent();
                    if (texto) {
                        if (texto.includes('Unidades de Fomento')) {
                            detalle.valoresMensuales.dividendoUF = texto.replace('Valor en Unidades de Fomento :', '').trim();
                        } else if (texto.includes('Pesos')) {
                            detalle.valoresMensuales.dividendoPesos = texto.replace('Valor en Pesos :', '').trim();
                        }
                    }
                }
            } catch (error) {
                logDebug('Error extrayendo dividendo mensual');
            }

            // Extraer información de seguros
            try {
                const tiposSeguros = ['desgravamen', 'incendio', 'incendio más sismo'];

                for (const tipoSeguro of tiposSeguros) {
                    try {
                        const selectorSeguro = `${modalId} h6:has-text("${tipoSeguro}") + ul.list-group li`;
                        const itemsSeguro = await page.locator(selectorSeguro).all();

                        const seguroData = {};
                        for (const item of itemsSeguro) {
                            const texto = await item.textContent();
                            if (texto) {
                                if (texto.includes('Unidades de Fomento')) {
                                    seguroData.valorUF = texto.split(':')[1]?.trim();
                                } else if (texto.includes('Pesos')) {
                                    seguroData.valorPesos = texto.split(':')[1]?.trim();
                                }
                            }
                        }

                        if (Object.keys(seguroData).length > 0) {
                            detalle.seguros[tipoSeguro] = seguroData;
                        }
                    } catch (error) {
                        logDebug(`Error extrayendo seguro ${tipoSeguro}`);
                    }
                }
            } catch (error) {
                logDebug('Error extrayendo seguros');
            }

            // Extraer dividendos totales con seguros
            try {
                const selectorConSeguros = `${modalId} h6:has-text("con seguros") + ul.list-group li`;
                const itemsConSeguros = await page.locator(selectorConSeguros).all();

                for (const item of itemsConSeguros) {
                    const texto = await item.textContent();
                    if (texto) {
                        if (texto.includes('Unidades de Fomento')) {
                            detalle.valoresMensuales.dividendoConSegurosUF = texto.split(':')[1]?.trim();
                        } else if (texto.includes('Pesos')) {
                            detalle.valoresMensuales.dividendoConSegurosPesos = texto.split(':')[1]?.trim();
                        }
                    }
                }
            } catch (error) {
                logDebug('Error extrayendo dividendos con seguros');
            }

            // Extraer información de actualización
            try {
                const selectorActualizacion = `${modalId} .fieldset:has(h5:has-text("Actualización")) ul.list-group li`;
                const itemsActualizacion = await page.locator(selectorActualizacion).all();

                for (const item of itemsActualizacion) {
                    const texto = await item.textContent();
                    if (texto) {
                        if (texto.includes('Datos actualizados')) {
                            detalle.actualizacion.entidad = texto.replace('Datos actualizados por', '').trim();
                        } else if (texto.includes('Fecha de Actualización')) {
                            detalle.actualizacion.fecha = texto.split(':')[1]?.trim();
                        }
                    }
                }
            } catch (error) {
                logDebug('Error extrayendo información de actualización');
            }

            // Cerrar el modal
            try {
                const selectorCerrar = `${modalId} .close, ${modalId} button:has-text("Cerrar")`;
                await page.click(selectorCerrar);
                await page.waitForTimeout(1000);
            } catch (error) {
                // Si no se puede cerrar el modal, presionar ESC
                await page.keyboard.press('Escape');
                await page.waitForTimeout(1000);
            }

            logInfo(`✅ Detalle extraído para modal: ${modalId}`);
            return detalle;

        } catch (error) {
            logError(`Error extrayendo detalle del crédito ${modalId}: ${error.message}`);
            return {
                valoresUnicaVez: {},
                valoresMensuales: {},
                seguros: {},
                actualizacion: {},
                error: error.message
            };
        }
    }

    // src/services/mortgage/MortgageService.js (REEMPLAZAR MÉTODO limpiarDatosCMF)

    /**
     * Limpiar datos CMF
     */
    static limpiarDatosCMF(data) {
        const limpiarTexto = (texto) => {
            if (typeof texto !== 'string') return texto;
            return texto
                .replace(/\n\s*\n/g, ' ')
                .replace(/\t+/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
        };

        const limpiarTasa = (tasa) => {
            if (typeof tasa !== 'string') return tasa;
            return tasa.replace(/\n\t+/g, '').replace(/\s+%/, '%').trim();
        };

        // Limpiar datos de cada banco
        const bancosLimpios = data.bancos.map(banco => ({
            ...banco,
            tasaCredito: limpiarTasa(banco.tasaCredito),
            cae: limpiarTexto(banco.cae),
            dividendoMensual: limpiarTexto(banco.dividendoMensual),
            banco: limpiarTexto(banco.banco),
            tipoCredito: limpiarTexto(banco.tipoCredito)
        }));

        return {
            ...data,
            bancos: bancosLimpios,
            resumenComparativo: {
                ...data.resumenComparativo,
                mejorOferta: bancosLimpios[0] || null
            }
        };
    }

    /**
   * Generar análisis comparativo COMPLETO con cálculos reales
   */
    static generarAnalisisComparativo(bancos) {
        if (!bancos || bancos.length === 0) {
            return { error: 'No hay datos para analizar' };
        }

        try {
            logInfo(`📊 Generando análisis comparativo para ${bancos.length} bancos`);

            // 1. EXTRAER Y LIMPIAR DIVIDENDOS
            const dividendos = [];
            const tasas = [];

            for (const banco of bancos) {
                // Extraer dividendo mensual (eliminar formato y convertir a número)
                const dividendoTexto = banco.dividendoMensual || '';
                const dividendoMatch = dividendoTexto.match(/[\d.,]+/);
                if (dividendoMatch) {
                    const dividendoNumero = parseFloat(dividendoMatch[0].replace(',', ''));
                    if (!isNaN(dividendoNumero)) {
                        dividendos.push({
                            banco: banco.banco,
                            dividendo: dividendoNumero,
                            texto: dividendoTexto
                        });
                    }
                }

                // Extraer tasa de crédito
                const tasaTexto = banco.tasaCredito || '';
                const tasaMatch = tasaTexto.match(/(\d+[.,]\d+)%?/);
                if (tasaMatch) {
                    const tasaNumero = parseFloat(tasaMatch[1].replace(',', '.'));
                    if (!isNaN(tasaNumero)) {
                        tasas.push({
                            banco: banco.banco,
                            tasa: tasaNumero,
                            texto: tasaTexto
                        });
                    }
                }
            }

            // 2. CALCULAR ESTADÍSTICAS DE DIVIDENDOS
            let rangoDividendos = 'No disponible';
            let mejorDividendo = null;
            let peorDividendo = null;

            if (dividendos.length > 0) {
                dividendos.sort((a, b) => a.dividendo - b.dividendo);

                mejorDividendo = dividendos[0];
                peorDividendo = dividendos[dividendos.length - 1];

                const diferencia = peorDividendo.dividendo - mejorDividendo.dividendo;

                rangoDividendos = `${mejorDividendo.dividendo.toLocaleString('es-CL')} UF - ${peorDividendo.dividendo.toLocaleString('es-CL')} UF (diferencia: ${diferencia.toLocaleString('es-CL')} UF)`;
            }

            // 3. CALCULAR ESTADÍSTICAS DE TASAS
            let rangoTasas = 'No disponible';
            let mejorTasa = null;
            let peorTasa = null;

            if (tasas.length > 0) {
                tasas.sort((a, b) => a.tasa - b.tasa);

                mejorTasa = tasas[0];
                peorTasa = tasas[tasas.length - 1];

                const diferenciaTasa = peorTasa.tasa - mejorTasa.tasa;

                rangoTasas = `${mejorTasa.tasa}% - ${peorTasa.tasa}% (diferencia: ${diferenciaTasa.toFixed(2)}%)`;
            }

            // 4. CALCULAR POTENCIAL AHORRO
            let ahorroMensual = 'No disponible';
            let ahorroTotal30Anos = 'No disponible';

            if (dividendos.length >= 2) {
                const ahorroMensualUF = peorDividendo.dividendo - mejorDividendo.dividendo;
                const ahorroTotal30AnosUF = ahorroMensualUF * 12 * 30;

                // Convertir a pesos (aproximado con UF = $35,000)
                const valorUFAproximado = 35000;
                const ahorroMensualPesos = ahorroMensualUF * valorUFAproximado;
                const ahorroTotal30AnosPesos = ahorroTotal30AnosUF * valorUFAproximado;

                ahorroMensual = `${ahorroMensualUF.toLocaleString('es-CL')} UF (~$${ahorroMensualPesos.toLocaleString('es-CL')})`;
                ahorroTotal30Anos = `${ahorroTotal30AnosUF.toLocaleString('es-CL')} UF (~$${ahorroTotal30AnosPesos.toLocaleString('es-CL')})`;
            }

            // 5. CONSTRUIR ANÁLISIS COMPLETO
            const analisis = {
                estadisticas: {
                    totalBancos: bancos.length,
                    bancosConDividendo: dividendos.length,
                    bancosConTasa: tasas.length,
                    rangoDividendos,
                    rangoTasas
                },
                mejoresOfertas: {
                    menorDividendo: mejorDividendo ? {
                        banco: mejorDividendo.banco,
                        dividendo: mejorDividendo.texto,
                        valor: mejorDividendo.dividendo
                    } : null,
                    menorTasa: mejorTasa ? {
                        banco: mejorTasa.banco,
                        tasa: mejorTasa.texto,
                        valor: mejorTasa.tasa
                    } : null
                },
                potencialAhorro: {
                    mensual: ahorroMensual,
                    total30Anos: ahorroTotal30Anos,
                    explicacion: dividendos.length >= 2 ?
                        `Comparando ${mejorDividendo.banco} (mejor) vs ${peorDividendo.banco} (peor)` :
                        'Insuficientes datos para calcular ahorro'
                },
                recomendaciones: this.generarRecomendacionesPersonalizadas(mejorDividendo, mejorTasa, dividendos.length, tasas.length)
            };

            logInfo('✅ Análisis comparativo completado con cálculos reales');
            return analisis;

        } catch (error) {
            logError(`Error generando análisis comparativo: ${error.message}`);
            return {
                error: `Error en análisis: ${error.message}`,
                estadisticas: {
                    totalBancos: bancos.length,
                    rangoDividendos: 'Error en cálculo',
                    rangoTasas: 'Error en cálculo'
                },
                potencialAhorro: {
                    mensual: 'Error en cálculo',
                    total30Anos: 'Error en cálculo'
                }
            };
        }
    }

    /**
     * Generar comparación de escenarios COMPLETA con análisis real
     */
    static generarComparacionEscenarios(escenarios) {
        try {
            logInfo(`📊 Generando comparación completa de ${escenarios.length} escenarios`);

            // 1. PREPARAR DATOS PARA COMPARACIÓN
            const comparaciones = escenarios.map(esc => {
                const mejorOferta = esc.resultado.bancos[0];

                // Extraer dividendo numérico para comparaciones
                let dividendoNumerico = null;
                if (mejorOferta && mejorOferta.dividendoMensual) {
                    const match = mejorOferta.dividendoMensual.match(/[\d.,]+/);
                    if (match) {
                        dividendoNumerico = parseFloat(match[0].replace(',', ''));
                    }
                }

                return {
                    escenario: esc.escenario.etiqueta,
                    monto: esc.escenario.monto,
                    plazo: esc.escenario.plazo,
                    mejorDividendo: mejorOferta ? mejorOferta.dividendoMensual : 'N/A',
                    mejorBanco: mejorOferta ? mejorOferta.banco : 'N/A',
                    totalBancos: esc.resultado.bancos.length,
                    dividendoNumerico,
                    costoTotalAproximado: dividendoNumerico ? dividendoNumerico * 12 * esc.escenario.plazo : null
                };
            });

            // 2. IDENTIFICAR MEJOR ESCENARIO
            const escenariosConDividendo = comparaciones.filter(c => c.dividendoNumerico !== null);
            let mejorEscenario = null;
            let peorEscenario = null;

            if (escenariosConDividendo.length > 0) {
                escenariosConDividendo.sort((a, b) => a.dividendoNumerico - b.dividendoNumerico);
                mejorEscenario = escenariosConDividendo[0];
                peorEscenario = escenariosConDividendo[escenariosConDividendo.length - 1];
            }

            // 3. CALCULAR AHORRO ENTRE ESCENARIOS
            let ahorroEntreEscenarios = null;
            if (mejorEscenario && peorEscenario && mejorEscenario !== peorEscenario) {
                const ahorroMensual = peorEscenario.dividendoNumerico - mejorEscenario.dividendoNumerico;
                const ahorroTotalUF = ahorroMensual * 12 * mejorEscenario.plazo;

                ahorroEntreEscenarios = {
                    mensual: `${ahorroMensual.toLocaleString('es-CL')} UF`,
                    total: `${ahorroTotalUF.toLocaleString('es-CL')} UF`,
                    escenarioOptimo: mejorEscenario.escenario,
                    escenarioCaro: peorEscenario.escenario
                };
            }

            // 4. ANÁLISIS POR PLAZO
            const analisisPorPlazo = this.analizarImpactoPlazo(comparaciones);

            // 5. ANÁLISIS POR MONTO
            const analisisPorMonto = this.analizarImpactoMonto(comparaciones);

            // 6. GENERAR RECOMENDACIÓN INTELIGENTE
            const recomendacionDetallada = this.generarRecomendacionInteligente({
                comparaciones,
                mejorEscenario,
                ahorroEntreEscenarios,
                analisisPorPlazo,
                analisisPorMonto
            });

            return {
                comparacionDetallada: comparaciones,
                analisisOptimizacion: {
                    mejorEscenario: mejorEscenario ? {
                        escenario: mejorEscenario.escenario,
                        dividendo: mejorEscenario.mejorDividendo,
                        banco: mejorEscenario.mejorBanco,
                        ventaja: ahorroEntreEscenarios ? `Ahorra ${ahorroEntreEscenarios.mensual} mensual vs peor opción` : 'Es la opción más económica'
                    } : null,
                    ahorroEntreEscenarios,
                    analisisPorPlazo,
                    analisisPorMonto
                },
                recomendacion: recomendacionDetallada,
                metadatos: {
                    escenariosAnalizados: escenarios.length,
                    escenariosConDatos: escenariosConDividendo.length,
                    timestamp: new Date().toISOString()
                }
            };

        } catch (error) {
            logError(`Error generando comparación de escenarios: ${error.message}`);
            return {
                error: `Error en comparación: ${error.message}`,
                recomendacion: 'No se pudo completar el análisis debido a un error técnico'
            };
        }
    }

    /**
 * Generar recomendaciones personalizadas
 */
    static generarRecomendacionesPersonalizadas(mejorDividendo, mejorTasa, totalDividendos, totalTasas) {

        // DEBUG TEMPORAL - REMOVER DESPUÉS
        console.log('DEBUG - mejorDividendo:', mejorDividendo);
        console.log('DEBUG - mejorTasa:', mejorTasa);

        const recomendaciones = [];

        // Validar que los datos existen antes de usarlos
        if (mejorDividendo && mejorDividendo.banco) {
            recomendaciones.push(`💰 Menor dividendo: ${mejorDividendo.banco} con ${mejorDividendo.texto}`);
        }

        if (mejorTasa && mejorTasa.banco) {
            recomendaciones.push(`📈 Menor tasa: ${mejorTasa.banco} con ${mejorTasa.texto}`);
        }

        if (mejorDividendo && mejorTasa && mejorDividendo.banco === mejorTasa.banco) {
            recomendaciones.push(`⭐ RECOMENDACIÓN: ${mejorDividendo.banco} ofrece tanto el menor dividendo como la menor tasa`);
        } else if (mejorDividendo && mejorTasa && mejorDividendo.banco && mejorTasa.banco) {
            recomendaciones.push(`⚖️ DECISIÓN: Evalúa entre menor dividendo (${mejorDividendo.banco}) vs menor tasa (${mejorTasa.banco})`);
        }

        // Agregar información sobre la cobertura de datos
        if (totalDividendos > 0 && totalTasas > 0) {
            recomendaciones.push(`📊 Datos analizados: ${totalDividendos} bancos con dividendo, ${totalTasas} bancos con tasa`);
        } else if (totalDividendos === 0 && totalTasas === 0) {
            recomendaciones.push('⚠️ No se pudieron extraer datos numéricos de dividendos ni tasas');
        }

        recomendaciones.push('📋 Considera también: costos notariales, seguros y condiciones especiales de cada banco');
        recomendaciones.push('⏰ Verifica las tasas actualizadas directamente con los bancos antes de decidir');

        return recomendaciones;
    }

    /**
 * Analizar impacto del plazo en los dividendos
 */
    static analizarImpactoPlazo(comparaciones) {
        const plazos = [...new Set(comparaciones.map(c => c.plazo))].sort((a, b) => a - b);

        if (plazos.length < 2) {
            return { conclusion: 'Se necesitan al menos 2 plazos diferentes para analizar impacto' };
        }

        const analisisPlazo = plazos.map(plazo => {
            const escenariosEnPlazo = comparaciones.filter(c => c.plazo === plazo && c.dividendoNumerico);

            if (escenariosEnPlazo.length === 0) return null;

            const dividendoPromedio = escenariosEnPlazo.reduce((sum, esc) => sum + esc.dividendoNumerico, 0) / escenariosEnPlazo.length;

            return {
                plazo,
                dividendoPromedio: dividendoPromedio.toFixed(2),
                escenarios: escenariosEnPlazo.length
            };
        }).filter(a => a !== null);

        return {
            tendencia: analisisPlazo.length >= 2 ?
                (analisisPlazo[1].dividendoPromedio < analisisPlazo[0].dividendoPromedio ?
                    'Dividendos menores con plazos más largos' :
                    'Dividendos mayores con plazos más largos') :
                'Insuficientes datos',
            detalles: analisisPlazo
        };
    }

    /**
     * Analizar impacto del monto en los dividendos
     */
    static analizarImpactoMonto(comparaciones) {
        const montos = [...new Set(comparaciones.map(c => c.monto))].sort((a, b) => a - b);

        if (montos.length < 2) {
            return { conclusion: 'Se necesitan al menos 2 montos diferentes para analizar impacto' };
        }

        const analisisMonto = montos.map(monto => {
            const escenariosEnMonto = comparaciones.filter(c => c.monto === monto && c.dividendoNumerico);

            if (escenariosEnMonto.length === 0) return null;

            const dividendoPromedio = escenariosEnMonto.reduce((sum, esc) => sum + esc.dividendoNumerico, 0) / escenariosEnMonto.length;

            return {
                monto,
                dividendoPromedio: dividendoPromedio.toFixed(2),
                escenarios: escenariosEnMonto.length
            };
        }).filter(a => a !== null);

        return {
            tendencia: analisisMonto.length >= 2 ?
                'Dividendos proporcionales al monto solicitado' :
                'Insuficientes datos',
            detalles: analisisMonto
        };
    }

    /**
     * Generar recomendación inteligente basada en todos los análisis
     */
    static generarRecomendacionInteligente({ comparaciones, mejorEscenario, ahorroEntreEscenarios, analisisPorPlazo, analisisPorMonto }) {
        const recomendaciones = [];

        // Recomendación principal
        if (mejorEscenario) {
            recomendaciones.push(`🏆 MEJOR OPCIÓN: ${mejorEscenario.escenario} con ${mejorEscenario.mejorBanco}`);
            recomendaciones.push(`   └ Dividendo: ${mejorEscenario.mejorDividendo}`);
        }

        // Ahorro potencial
        if (ahorroEntreEscenarios) {
            recomendaciones.push(`💰 AHORRO POTENCIAL: ${ahorroEntreEscenarios.mensual} mensual (${ahorroEntreEscenarios.total} total)`);
            recomendaciones.push(`   └ Entre ${ahorroEntreEscenarios.escenarioOptimo} vs ${ahorroEntreEscenarios.escenarioCaro}`);
        }

        // Análisis de plazo
        if (analisisPorPlazo.tendencia && !analisisPorPlazo.tendencia.includes('Insuficientes')) {
            recomendaciones.push(`📅 IMPACTO PLAZO: ${analisisPorPlazo.tendencia}`);
        }

        // Recomendaciones finales
        recomendaciones.push('');
        recomendaciones.push('📋 PRÓXIMOS PASOS RECOMENDADOS:');
        recomendaciones.push('• Contacta directamente al banco recomendado para confirmar condiciones');
        recomendaciones.push('• Solicita una simulación oficial con tus datos específicos');
        recomendaciones.push('• Considera costos adicionales (notariales, tasación, seguros)');
        recomendaciones.push('• Evalúa tu capacidad de pago con holgura de al menos 20%');

        return recomendaciones.join('\n');
    }

}

module.exports = MortgageService;