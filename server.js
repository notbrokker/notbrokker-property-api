const express = require('express');
const { chromium } = require('playwright');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Función para logging detallado
function log(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    
    if (data) {
        console.log(logMessage, data);
    } else {
        console.log(logMessage);
    }
}

// Función de espera robusta para evitar timeouts
async function esperarCargaRobusta(page, timeout = 30000) {
    try {
        log('debug', 'Iniciando espera robusta de carga...');
        
        // 1. Esperar que el DOM se cargue (más rápido que networkidle)
        await page.waitForLoadState('domcontentloaded', { timeout: 10000 });
        log('debug', '✓ DOM cargado');
        
        // 2. Esperar por elementos específicos críticos
        const selectoresCriticos = [
            '.ui-pdp-title',           // Título en MercadoLibre
            'h1',                      // Título genérico
            '.andes-money-amount',     // Precio en MercadoLibre
            '[class*="price"]'         // Precio genérico
        ];
        
        let elementoEncontrado = false;
        
        for (const selector of selectoresCriticos) {
            try {
                await page.waitForSelector(selector, { timeout: 8000 });
                log('debug', `✓ Elemento crítico encontrado: ${selector}`);
                elementoEncontrado = true;
                break;
            } catch (error) {
                log('debug', `Elemento no encontrado: ${selector}, continuando...`);
            }
        }
        
        if (!elementoEncontrado) {
            log('warn', 'No se encontraron elementos críticos, pero continuando...');
        }
        
        // 3. Espera adicional para contenido dinámico
        await page.waitForTimeout(3000);
        
        // 4. Verificar que la página no esté en estado de carga
        const isLoading = await page.evaluate(() => {
            return document.readyState === 'loading';
        });
        
        if (!isLoading) {
            log('debug', '✅ Página completamente cargada');
            return true;
        }
        
        // 5. Espera final por networkidle solo si es necesario (con timeout reducido)
        try {
            await page.waitForLoadState('networkidle', { timeout: 8000 });
            log('debug', '✓ Network idle alcanzado');
        } catch (error) {
            log('warn', 'Network idle no alcanzado, pero continuando con la extracción');
        }
        
        return true;
        
    } catch (error) {
        log('error', `Error en espera robusta: ${error.message}`);
        // No lanzar error, permitir que continúe la extracción
        return false;
    }
}

// Función con retry logic para casos extremos
async function esperarCargaConRetry(page, maxReintentos = 3) {
    for (let intento = 1; intento <= maxReintentos; intento++) {
        try {
            log('debug', `Intento ${intento}/${maxReintentos} de carga`);
            
            const exito = await esperarCargaRobusta(page);
            
            if (exito) {
                log('info', `✅ Carga exitosa en intento ${intento}`);
                return true;
            }
            
            if (intento < maxReintentos) {
                log('warn', `Intento ${intento} falló, reintentando en 2 segundos...`);
                await page.waitForTimeout(2000);
            }
            
        } catch (error) {
            log('error', `Error en intento ${intento}: ${error.message}`);
            
            if (intento === maxReintentos) {
                log('error', 'Todos los intentos fallaron, continuando con extracción parcial');
                return false;
            }
        }
    }
    
    return false;
}

// Función para verificar si un selector existe
async function verificarSelector(page, selector, descripcion, timeout = 5000) {
    try {
        log('debug', `Verificando selector: ${selector} (${descripcion})`);
        await page.waitForSelector(selector, { timeout });
        const count = await page.locator(selector).count();
        log('info', `✓ Selector encontrado: ${selector} (${count} elementos) - ${descripcion}`);
        return true;
    } catch (error) {
        log('warn', `✗ Selector no encontrado: ${selector} - ${descripcion}`, { error: error.message });
        return false;
    }
}

// Función para extraer texto de forma segura
async function extraerTextoSeguro(page, selector, descripcion, valorDefault = 'No disponible') {
    try {
        log('debug', `Extrayendo texto de: ${selector} (${descripcion})`);
        
        const elemento = page.locator(selector).first();
        const existe = await elemento.count() > 0;
        
        if (!existe) {
            log('warn', `Elemento no encontrado: ${selector} - ${descripcion}`);
            return valorDefault;
        }
        
        const texto = await elemento.textContent({ timeout: 5000 });
        const textoLimpio = texto ? texto.trim() : valorDefault;
        
        log('info', `✓ Texto extraído de ${descripcion}: "${textoLimpio}"`);
        return textoLimpio || valorDefault;
    } catch (error) {
        log('error', `Error extrayendo texto de ${selector} (${descripcion}): ${error.message}`);
        return valorDefault;
    }
}

// Función para extraer atributo de forma segura
async function extraerAtributoSeguro(page, selector, atributo, descripcion, valorDefault = 'No disponible') {
    try {
        log('debug', `Extrayendo atributo '${atributo}' de: ${selector} (${descripcion})`);
        
        const elemento = page.locator(selector).first();
        const existe = await elemento.count() > 0;
        
        if (!existe) {
            log('warn', `Elemento no encontrado: ${selector} - ${descripcion}`);
            return valorDefault;
        }
        
        const valor = await elemento.getAttribute(atributo, { timeout: 5000 });
        const valorLimpio = valor ? valor.trim() : valorDefault;
        
        log('info', `✓ Atributo '${atributo}' extraído de ${descripcion}: "${valorLimpio}"`);
        return valorLimpio || valorDefault;
    } catch (error) {
        log('error', `Error extrayendo atributo '${atributo}' de ${selector} (${descripcion}): ${error.message}`);
        return valorDefault;
    }
}

// Función para listar todos los selectores disponibles en la página
async function analizarEstructuraPagina(page, screenshotName) {
    try {
        log('info', '🔍 Analizando estructura de la página...');
        
        // Obtener título de la página
        const titulo = await page.title();
        log('info', `Título de la página: "${titulo}"`);
        
        // Obtener URL actual
        const url = page.url();
        log('info', `URL actual: ${url}`);
        
        // Buscar elementos comunes con texto visible
        const selectoresComunes = [
            'h1', 'h2', 'h3',
            '[class*="title"]', '[class*="titulo"]',
            '[class*="price"]', '[class*="precio"]',
            '[class*="location"]', '[class*="ubicacion"]',
            '[class*="bedroom"]', '[class*="dormitorio"]',
            '[class*="bathroom"]', '[class*="baño"]',
            '[class*="surface"]', '[class*="superficie"]',
            '[class*="m2"]', '[class*="metro"]'
        ];
        
        const elementosEncontrados = [];
        
        for (const selector of selectoresComunes) {
            try {
                const elementos = await page.locator(selector).all();
                for (let i = 0; i < Math.min(elementos.length, 3); i++) {
                    const texto = await elementos[i].textContent();
                    const clases = await elementos[i].getAttribute('class');
                    if (texto && texto.trim()) {
                        elementosEncontrados.push({
                            selector: `${selector}:nth-child(${i + 1})`,
                            texto: texto.trim().substring(0, 100),
                            clases: clases || 'sin-clase'
                        });
                    }
                }
            } catch (error) {
                // Continuar con el siguiente selector
            }
        }
        
        log('info', '📋 Elementos encontrados en la página:', elementosEncontrados.slice(0, 10));
        
        return elementosEncontrados;
    } catch (error) {
        log('error', `Error analizando estructura de página: ${error.message}`);
        return [];
    }
}

// Función para formatear precios (mejorada)
function formatearPrecio(precio, moneda) {
    try {
        log('debug', `Formateando precio: "${precio}" con moneda: "${moneda}"`);
        
        // Limpiar el precio de caracteres no numéricos excepto puntos y comas
        let precioLimpio = precio.replace(/[^\d.,]/g, '');
        
        if (!precioLimpio) {
            log('warn', 'Precio vacío después de limpiar');
            return { precio: "0", moneda };
        }
        
        log('debug', `Precio limpio: "${precioLimpio}"`);
        
        if (moneda === 'UF') {
            if (precioLimpio.includes(',')) {
                const precioFloat = parseFloat(precioLimpio.replace(',', '.'));
                const precioFormateado = precioFloat.toLocaleString('es-CL', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                });
                log('info', `Precio UF formateado: ${precioFormateado}`);
                return { precio: precioFormateado, moneda };
            } else {
                const precioInt = parseInt(precioLimpio);
                const precioFormateado = precioInt.toLocaleString('es-CL');
                log('info', `Precio UF formateado (entero): ${precioFormateado}`);
                return { precio: precioFormateado, moneda };
            }
        } else {
            const precioInt = parseInt(precioLimpio);
            const precioFormateado = `$${precioInt.toLocaleString('es-CL')}`;
            log('info', `Precio CLP formateado: ${precioFormateado}`);
            return { precio: precioFormateado, moneda };
        }
    } catch (error) {
        log('error', `Error formateando precio: ${precio} ${moneda}`, error);
        return { precio, moneda };
    }
}

// Función para detectar el tipo de portal (mejorada)
function detectarPortal(url) {
    log('debug', `Detectando tipo de portal para URL: ${url}`);
    
    if (url.includes('portalinmobiliario.com')) {
        log('info', 'Portal detectado: Portal Inmobiliario');
        return 'portal_inmobiliario';
    } else if (url.includes('mercadolibre.cl') || url.includes('casa.mercadolibre.cl')) {
        log('info', 'Portal detectado: MercadoLibre');
        return 'mercadolibre';
    } else if (url.includes('yapo.cl')) {
        log('info', 'Portal detectado: Yapo');
        return 'yapo';
    } else if (url.includes('toctoc.com')) {
        log('info', 'Portal detectado: TocToc');
        return 'toctoc';
    } else if (url.includes('cmfchile.cl')) {
        log('info', 'Portal detectado: CMF Chile - Simulador Hipotecario');
        return 'cmf_simulador';
    }
    
    log('warn', 'Portal no reconocido, usando extractor genérico');
    return 'desconocido';
}

// ===== NUEVAS FUNCIONES PARA SIMULADOR CMF =====

// Función para llenar el formulario del simulador CMF

// Función específica basada en el análisis del formulario CMF
async function llenarFormularioSimulador(page, monto, plazo) {
    try {
        log('info', `📝 Llenando formulario CMF específico: ${monto} UF por ${plazo} años`);
        
        // Esperar a que cargue la página
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(3000);
        
        // ========================================
        // 1. SELECCIONAR UF (usando ID específico)
        // ========================================
        log('debug', 'Paso 1: Seleccionando UF');
        
        try {
            await page.waitForSelector('#UF', { timeout: 10000 });
            await page.check('#UF');
            log('info', '✓ UF seleccionado correctamente');
        } catch (error) {
            log('error', `No se pudo seleccionar UF: ${error.message}`);
            throw new Error('No se pudo seleccionar la moneda UF');
        }
        
        await page.waitForTimeout(1000);
        
        // ========================================
        // 2. INGRESAR MONTO (usando ID específico)
        // ========================================
        log('debug', 'Paso 2: Ingresando monto');
        
        try {
            await page.waitForSelector('#monto', { timeout: 10000 });
            
            // Limpiar y llenar el campo
            await page.fill('#monto', '');
            await page.waitForTimeout(500);
            await page.fill('#monto', monto.toString());
            
            // Verificar que el valor se ingresó
            const valorActual = await page.inputValue('#monto');
            if (valorActual === monto.toString()) {
                log('info', `✓ Monto ingresado correctamente: ${monto} UF`);
            } else {
                throw new Error(`Monto no se ingresó correctamente. Esperado: ${monto}, Actual: ${valorActual}`);
            }
        } catch (error) {
            log('error', `No se pudo ingresar el monto: ${error.message}`);
            throw new Error('No se pudo ingresar el monto');
        }
        
        await page.waitForTimeout(1000);
        
        // ========================================
        // 3. ESPERAR Y SELECCIONAR PLAZO (SELECT DINÁMICO)
        // ========================================
        log('debug', 'Paso 3: Esperando que se carguen las opciones de plazo');
        
        try {
            // Esperar a que el select esté presente
            await page.waitForSelector('select[name="plazo"]', { timeout: 10000 });
            
            // Esperar a que se carguen las opciones dinámicamente
            // Esto puede tomar un momento después de seleccionar UF y/o ingresar monto
            await page.waitForTimeout(3000);
            
            // Verificar si hay opciones disponibles
            let intentos = 0;
            let opcionesDisponibles = false;
            
            while (intentos < 10 && !opcionesDisponibles) {
                const opciones = await page.locator('select[name="plazo"] option').allTextContents();
                log('debug', `Intento ${intentos + 1}: Opciones encontradas:`, opciones);
                
                // Si hay más de una opción (la primera suele ser "Seleccione...")
                if (opciones.length > 1) {
                    opcionesDisponibles = true;
                    log('info', `✓ Opciones de plazo cargadas: ${opciones.length} opciones`);
                } else {
                    log('debug', 'Esperando más opciones...');
                    await page.waitForTimeout(1000);
                    intentos++;
                }
            }
            
            if (!opcionesDisponibles) {
                throw new Error('No se cargaron las opciones de plazo después de 10 intentos');
            }
            
            // Intentar seleccionar el plazo exacto
            const opcionesTexto = await page.locator('select[name="plazo"] option').allTextContents();
            log('info', 'Opciones de plazo disponibles:', opcionesTexto);
            
            // Buscar la opción que coincida con el plazo deseado
            let opcionSeleccionada = false;
            
            // Estrategias para encontrar la opción correcta
            const estrategiasSeleccion = [
                plazo.toString(), // Valor exacto
                `${plazo} años`, // Con "años"
                `${plazo} año`, // Singular
                `${plazo} Años`, // Con mayúscula
                `${plazo} Año` // Singular con mayúscula
            ];
            
            for (const estrategia of estrategiasSeleccion) {
                try {
                    // Buscar opción que contenga el texto
                    const opcionEncontrada = opcionesTexto.find(opcion => 
                        opcion.includes(estrategia) || opcion.includes(plazo.toString())
                    );
                    
                    if (opcionEncontrada) {
                        await page.selectOption('select[name="plazo"]', { label: opcionEncontrada });
                        log('info', `✓ Plazo seleccionado: ${opcionEncontrada}`);
                        opcionSeleccionada = true;
                        break;
                    }
                } catch (error) {
                    log('debug', `Estrategia "${estrategia}" no funcionó`);
                }
            }
            
            // Si no se pudo seleccionar exactamente, buscar el más cercano
            if (!opcionSeleccionada) {
                log('warn', `No se encontró plazo exacto de ${plazo} años, buscando el más cercano...`);
                
                // Extraer números de las opciones y encontrar el más cercano
                const opcionesConNumero = opcionesTexto
                    .map(opcion => {
                        const match = opcion.match(/(\d+)/);
                        return match ? { texto: opcion, numero: parseInt(match[1]) } : null;
                    })
                    .filter(item => item !== null);
                
                if (opcionesConNumero.length > 0) {
                    // Encontrar la opción más cercana al plazo deseado
                    const masCercana = opcionesConNumero.reduce((prev, curr) => 
                        Math.abs(curr.numero - plazo) < Math.abs(prev.numero - plazo) ? curr : prev
                    );
                    
                    await page.selectOption('select[name="plazo"]', { label: masCercana.texto });
                    log('info', `✓ Plazo más cercano seleccionado: ${masCercana.texto} (solicitado: ${plazo} años)`);
                    opcionSeleccionada = true;
                } else {
                    throw new Error('No se encontraron opciones válidas de plazo');
                }
            }
            
        } catch (error) {
            log('error', `Error seleccionando plazo: ${error.message}`);
            throw new Error('No se pudo seleccionar el plazo');
        }
        
        await page.waitForTimeout(1000);
        
        // ========================================
        // 4. ENVIAR FORMULARIO (BOTÓN ESPECÍFICO)
        // ========================================
        log('debug', 'Paso 4: Enviando formulario');
        
        try {
            // Usar el selector específico del botón submit identificado
            await page.waitForSelector('input[type="submit"][value="Simular »"]', { timeout: 10000 });
            await page.click('input[type="submit"][value="Simular »"]');
            log('info', '✓ Formulario enviado correctamente');
        } catch (error) {
            log('error', `No se pudo enviar el formulario: ${error.message}`);
            throw new Error('No se pudo enviar el formulario');
        }
        
        // Esperar a que se carguen los resultados
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(8000); // Tiempo extra para que se procesen los resultados
        
        log('info', '✅ Formulario CMF completado exitosamente');
        return true;
        
    } catch (error) {
        log('error', `Error en formulario CMF específico: ${error.message}`);
        
        // Captura adicional para debugging
        try {
            await page.screenshot({ path: 'error-cmf-especifico.png', fullPage: true });
            log('info', 'Captura de error guardada: error-cmf-especifico.png');
        } catch (screenshotError) {
            log('warn', 'No se pudo tomar captura de error');
        }
        
        throw error;
    }
}

// Función para extraer la tabla comparativa de bancos
async function extraerTablaComparativa(page) {
    try {
        log('info', '📊 Extrayendo tabla comparativa de bancos...');
        
        // Esperar a que aparezca la tabla
        const selectorTabla = '#simuladorCreditoHipotecario table';
        await page.waitForSelector(selectorTabla, { timeout: 15000 });
        
        // Extraer datos de la tabla
        const bancos = [];
        const filas = await page.locator(`${selectorTabla} tbody tr`).all();
        
        log('info', `Encontradas ${filas.length} entidades bancarias`);
        
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
                
                // Obtener el atributo data-target del botón detalle para referencia
                const botonDetalle = fila.locator('button[data-target]');
                const dataTarget = await botonDetalle.getAttribute('data-target');
                
                const bancoData = {
                    banco: banco?.trim() || 'No disponible',
                    tipoCredito: tipoCredito?.trim() || 'No disponible',
                    dividendoMensual: dividendoMensual?.trim() || 'No disponible',
                    monedaCredito: monedaCredito?.trim() || 'No disponible',
                    tipoTasa: tipoTasa?.trim() || 'No disponible',
                    tasaCredito: tasaCredito?.trim() || 'No disponible',
                    cae: cae?.trim() || 'No disponible',
                    modalId: dataTarget || `#myModal${i + 1}`,
                    posicion: i + 1
                };
                
                bancos.push(bancoData);
                log('info', `✓ Banco ${i + 1} extraído: ${bancoData.banco}`);
                
            } catch (error) {
                log('error', `Error extrayendo banco ${i + 1}: ${error.message}`);
            }
        }
        
        // Extraer información adicional del valor UF
        let valorUF = 'No disponible';
        try {
            const selectorUF = '.info';
            const textoUF = await extraerTextoSeguro(page, selectorUF, 'valor UF');
            if (textoUF.includes('Valor UF')) {
                valorUF = textoUF;
            }
        } catch (error) {
            log('debug', 'No se pudo extraer valor UF');
        }
        
        log('info', `✅ Tabla comparativa extraída: ${bancos.length} bancos`);
        
        return {
            bancos,
            valorUF,
            totalBancos: bancos.length
        };
        
    } catch (error) {
        log('error', `Error extrayendo tabla comparativa: ${error.message}`);
        throw error;
    }
}

// Función para extraer detalle específico de un crédito
async function extraerDetalleCredito(page, modalId) {
    try {
        log('info', `🔍 Extrayendo detalle del crédito para modal: ${modalId}`);
        
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
            log('debug', 'Error extrayendo valores única vez');
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
            log('debug', 'Error extrayendo dividendo mensual');
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
                    log('debug', `Error extrayendo seguro ${tipoSeguro}`);
                }
            }
        } catch (error) {
            log('debug', 'Error extrayendo seguros');
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
            log('debug', 'Error extrayendo dividendos con seguros');
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
            log('debug', 'Error extrayendo información de actualización');
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
        
        log('info', `✅ Detalle extraído para modal: ${modalId}`);
        return detalle;
        
    } catch (error) {
        log('error', `Error extrayendo detalle del crédito ${modalId}: ${error.message}`);
        return {
            valoresUnicaVez: {},
            valoresMensuales: {},
            seguros: {},
            actualizacion: {},
            error: error.message
        };
    }
}

// Función principal actualizada que usa la solución específica
async function simularCreditoHipotecario_old(monto, plazo) {
    log('info', `🏦 Iniciando simulación hipotecaria específica: ${monto} UF por ${plazo} años`);
    
    const browser = await chromium.launch({ 
        headless: false, // Mantener false para debugging
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
        
        // Navegar al simulador CMF (URL específica que funciona)
        const url = 'https://servicios.cmfchile.cl/simuladorhipotecario/aplicacion?indice=101.2.1';
        log('info', `🌐 Navegando al simulador CMF: ${url}`);
        
        await page.goto(url, { 
            timeout: 30000,
            waitUntil: 'domcontentloaded'
        });
        
        // Llenar formulario usando función específica
        await llenarFormularioCMFEspecifico(page, monto, plazo);
        
        // Esperar que se carguen los resultados
        await esperarResultadosCMF(page);
        
        // Extraer tabla comparativa (usar tu función existente)
        const tablaComparativa = await extraerTablaComparativa(page);
        
        // Extraer detalles de cada banco (usar tu función existente)
        const bancosConDetalle = [];
        
        for (const banco of tablaComparativa.bancos) {
            try {
                log('info', `📋 Extrayendo detalle para: ${banco.banco}`);
                
                const detalle = await extraerDetalleCredito(page, banco.modalId);
                
                bancosConDetalle.push({
                    ...banco,
                    detalle
                });
                
                log('info', `✅ Detalle extraído para: ${banco.banco}`);
                
            } catch (error) {
                log('error', `Error extrayendo detalle para ${banco.banco}: ${error.message}`);
                
                bancosConDetalle.push({
                    ...banco,
                    detalle: {
                        error: error.message
                    }
                });
            }
        }
        
        // Construir resultado final
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
        
        log('info', `🎉 Simulación específica completada: ${bancosConDetalle.length} bancos procesados`);
        
        return {
            success: true,
            data: resultado
        };
        
    } catch (error) {
        log('error', `💥 Error durante la simulación específica: ${error.message}`);
        
        return {
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        };
        
    } finally {
        try {
            if (context) await context.close();
            await browser.close();
            log('info', '🔒 Browser cerrado correctamente');
        } catch (closeError) {
            log('error', `Error cerrando browser: ${closeError.message}`);
        }
    }
}

// Función optimizada para manejar la carga dinámica de opciones del CMF
async function llenarFormularioCMFDinamico(page, monto, plazo) {
    try {
        log('info', `📝 Llenando formulario CMF con carga dinámica: ${monto} UF por ${plazo} años`);
        
        // Esperar a que cargue la página completamente
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(3000);
        
        // Tomar captura inicial
        await page.screenshot({ path: 'cmf-inicial.png', fullPage: true });
        log('debug', 'Captura inicial guardada: cmf-inicial.png');
        
        // ========================================
        // 1. SELECCIONAR UF - TRIGGER PARA OPCIONES DINÁMICAS
        // ========================================
        log('debug', 'Paso 1: Seleccionando UF (puede activar carga de opciones)');
        
        try {
            await page.waitForSelector('#UF', { timeout: 10000 });
            
            // Verificar si ya está seleccionado
            const yaSeleccionado = await page.isChecked('#UF');
            if (!yaSeleccionado) {
                await page.check('#UF');
                log('info', '✓ UF seleccionado');
                
                // Esperar a que se procese la selección
                await page.waitForTimeout(2000);
            } else {
                log('info', '✓ UF ya estaba seleccionado');
            }
        } catch (error) {
            throw new Error(`No se pudo seleccionar UF: ${error.message}`);
        }
        
        // ========================================
        // 2. INGRESAR MONTO - OTRO TRIGGER POSIBLE
        // ========================================
        log('debug', 'Paso 2: Ingresando monto (puede activar carga de opciones)');
        
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
                log('info', `✓ Monto ingresado correctamente: ${monto} UF`);
            } else {
                throw new Error(`Monto no coincide. Esperado: ${monto}, Actual: ${valorActual}`);
            }
        } catch (error) {
            throw new Error(`No se pudo ingresar el monto: ${error.message}`);
        }
        
        // ========================================
        // 3. ESPERAR CARGA DINÁMICA DE OPCIONES DE PLAZO
        // ========================================
        log('debug', 'Paso 3: Esperando carga dinámica de opciones de plazo...');
        
        try {
            // Función para verificar si las opciones se han cargado
            const verificarOpcionesCargadas = async () => {
                const opciones = await page.locator('select#plazo option').allTextContents();
                log('debug', `Opciones actuales de plazo: [${opciones.join(', ')}]`);
                return opciones.length > 1 && !opciones.every(opt => opt.includes('Seleccione'));
            };
            
            // Esperar hasta 30 segundos a que se carguen las opciones
            let intentos = 0;
            const maxIntentos = 30;
            let opcionesCargadas = false;
            
            while (intentos < maxIntentos && !opcionesCargadas) {
                opcionesCargadas = await verificarOpcionesCargadas();
                
                if (!opcionesCargadas) {
                    log('debug', `Intento ${intentos + 1}/${maxIntentos}: Esperando opciones...`);
                    
                    // En algunos intentos, hacer acciones que podrían triggear la carga
                    if (intentos === 5) {
                        log('debug', 'Intentando click en el select para activar carga...');
                        await page.click('select#plazo');
                        await page.waitForTimeout(1000);
                    }
                    
                    if (intentos === 10) {
                        log('debug', 'Intentando hacer focus en monto nuevamente...');
                        await page.focus('#monto');
                        await page.waitForTimeout(500);
                        await page.press('#monto', 'Enter');
                        await page.waitForTimeout(1000);
                    }
                    
                    if (intentos === 15) {
                        log('debug', 'Intentando hacer click en UF nuevamente...');
                        await page.click('#UF');
                        await page.waitForTimeout(1000);
                    }
                    
                    await page.waitForTimeout(1000);
                    intentos++;
                } else {
                    log('info', `✓ Opciones de plazo cargadas después de ${intentos + 1} intentos`);
                }
            }
            
            if (!opcionesCargadas) {
                // Tomar captura para debugging
                await page.screenshot({ path: 'cmf-sin-opciones.png', fullPage: true });
                throw new Error('Las opciones de plazo no se cargaron después de 30 segundos');
            }
            
            // Obtener todas las opciones disponibles
            const opcionesDisponibles = await page.locator('select#plazo option').allTextContents();
            log('info', `Opciones de plazo disponibles: [${opcionesDisponibles.join(', ')}]`);
            
        } catch (error) {
            throw new Error(`Error esperando opciones de plazo: ${error.message}`);
        }
        
        // ========================================
        // 4. SELECCIONAR PLAZO ESPECÍFICO
        // ========================================
        log('debug', `Paso 4: Seleccionando plazo de ${plazo} años`);
        
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
                        log('info', `✓ Plazo seleccionado: "${opcionEncontrada}" (patrón: ${patron})`);
                        opcionSeleccionada = true;
                        break;
                    } catch (selectError) {
                        log('debug', `Error con patrón "${patron}": ${selectError.message}`);
                    }
                }
            }
            
            // Si no se encontró coincidencia exacta, buscar la más cercana
            if (!opcionSeleccionada) {
                log('warn', `No se encontró plazo exacto de ${plazo} años, buscando el más cercano...`);
                
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
                    log('info', `✓ Plazo más cercano seleccionado: "${masCercana.texto}" (solicitado: ${plazo} años)`);
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
        log('debug', 'Paso 5: Enviando formulario');
        
        try {
            // Verificar que el botón submit esté disponible
            await page.waitForSelector('input[type="submit"][value="Simular »"]', { timeout: 10000 });
            
            // Tomar captura antes del envío
            await page.screenshot({ path: 'cmf-antes-envio.png', fullPage: true });
            
            // Click en el botón submit
            await page.click('input[type="submit"][value="Simular »"]');
            log('info', '✓ Formulario enviado');
            
            // Esperar navegación o carga de resultados
            await page.waitForLoadState('domcontentloaded');
            
        } catch (error) {
            throw new Error(`Error enviando formulario: ${error.message}`);
        }
        
        // ========================================
        // 6. VERIFICAR CARGA DE RESULTADOS
        // ========================================
        log('debug', 'Paso 6: Verificando carga de resultados...');
        
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
                        log('info', `✓ Resultados encontrados con selector: ${selector} (${elementos} elementos)`);
                        resultadosEncontrados = true;
                        break;
                    }
                } catch (error) {
                    log('debug', `Selector de resultados no encontrado: ${selector}`);
                }
            }
            
            if (!resultadosEncontrados) {
                // Buscar por texto que indique resultados
                const textosResultado = ['banco', 'institución', 'dividendo', 'tasa', 'cae'];
                for (const texto of textosResultado) {
                    try {
                        await page.waitForSelector(`:text-is("${texto}")`, { timeout: 3000 });
                        log('info', `✓ Texto de resultados encontrado: ${texto}`);
                        resultadosEncontrados = true;
                        break;
                    } catch (error) {
                        // Continuar con el siguiente texto
                    }
                }
            }
            
            // Tomar captura final
            await page.screenshot({ path: 'cmf-resultados.png', fullPage: true });
            
            if (resultadosEncontrados) {
                log('info', '✅ Formulario completado y resultados cargados exitosamente');
            } else {
                log('warn', '⚠️ Formulario enviado pero no se pudieron verificar resultados específicos');
            }
            
        } catch (error) {
            log('warn', `Advertencia verificando resultados: ${error.message}`);
        }
        
        return true;
        
    } catch (error) {
        log('error', `Error en formulario CMF dinámico: ${error.message}`);
        
        // Captura de error final
        try {
            await page.screenshot({ path: 'cmf-error-final.png', fullPage: true });
            log('info', 'Captura de error guardada: cmf-error-final.png');
        } catch (screenshotError) {
            log('warn', 'No se pudo tomar captura de error');
        }
        
        throw error;
    }
}

// Función principal actualizada con mejor manejo de carga dinámica
async function simularCreditoHipotecario(monto, plazo) {
    log('info', `🏦 Iniciando simulación hipotecaria con carga dinámica: ${monto} UF por ${plazo} años`);
    
    const browser = await chromium.launch({ 
        headless: false, // Mantener false para debugging
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
        
        // Navegar al simulador CMF
        const url = 'https://servicios.cmfchile.cl/simuladorhipotecario/aplicacion?indice=101.2.1';
        log('info', `🌐 Navegando al simulador CMF: ${url}`);
        
        await page.goto(url, { 
            timeout: 30000,
            waitUntil: 'domcontentloaded'
        });
        
        // Llenar formulario con manejo dinámico
        await llenarFormularioCMFDinamico(page, monto, plazo);
        
        // Extraer tabla comparativa (usar función existente)
        let tablaComparativa;
        try {
            tablaComparativa = await extraerTablaComparativa(page);
        } catch (error) {
            log('error', `Error extrayendo tabla comparativa: ${error.message}`);
            tablaComparativa = {
                bancos: [],
                valorUF: 'No disponible',
                totalBancos: 0
            };
        }
        
        // Extraer detalles de cada banco
        const bancosConDetalle = [];
        
        for (const banco of tablaComparativa.bancos) {
            try {
                log('info', `📋 Extrayendo detalle para: ${banco.banco}`);
                
                const detalle = await extraerDetalleCredito(page, banco.modalId);
                
                bancosConDetalle.push({
                    ...banco,
                    detalle
                });
                
                log('info', `✅ Detalle extraído para: ${banco.banco}`);
                
            } catch (error) {
                log('error', `Error extrayendo detalle para ${banco.banco}: ${error.message}`);
                
                bancosConDetalle.push({
                    ...banco,
                    detalle: {
                        error: error.message
                    }
                });
            }
        }
        
        // Construir resultado final
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
        
        log('info', `🎉 Simulación dinámica completada: ${bancosConDetalle.length} bancos procesados`);
        
        return {
            success: true,
            data: resultado
        };
        
    } catch (error) {
        log('error', `💥 Error durante la simulación dinámica: ${error.message}`);
        
        return {
            success: false,
            error: error.message,
            timestamp: new Date().toISOString(),
            capturas: [
                'cmf-inicial.png',
                'cmf-sin-opciones.png', 
                'cmf-antes-envio.png',
                'cmf-resultados.png',
                'cmf-error-final.png'
            ]
        };
        
    } finally {
        try {
            if (context) await context.close();
            await browser.close();
            log('info', '🔒 Browser cerrado correctamente');
        } catch (closeError) {
            log('error', `Error cerrando browser: ${closeError.message}`);
        }
    }
}

// Función específica basada en el análisis del formulario CMF
async function llenarFormularioCMFEspecifico(page, monto, plazo) {
    try {
        log('info', `📝 Llenando formulario CMF específico: ${monto} UF por ${plazo} años`);
        
        // Esperar a que cargue la página
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(3000);
        
        // ========================================
        // 1. SELECCIONAR UF (usando ID específico)
        // ========================================
        log('debug', 'Paso 1: Seleccionando UF');
        
        try {
            await page.waitForSelector('#UF', { timeout: 10000 });
            await page.check('#UF');
            log('info', '✓ UF seleccionado correctamente');
        } catch (error) {
            log('error', `No se pudo seleccionar UF: ${error.message}`);
            throw new Error('No se pudo seleccionar la moneda UF');
        }
        
        await page.waitForTimeout(1000);
        
        // ========================================
        // 2. INGRESAR MONTO (usando ID específico)
        // ========================================
        log('debug', 'Paso 2: Ingresando monto');
        
        try {
            await page.waitForSelector('#monto', { timeout: 10000 });
            
            // Limpiar y llenar el campo
            await page.fill('#monto', '');
            await page.waitForTimeout(500);
            await page.fill('#monto', monto.toString());
            
            // Verificar que el valor se ingresó
            const valorActual = await page.inputValue('#monto');
            if (valorActual === monto.toString()) {
                log('info', `✓ Monto ingresado correctamente: ${monto} UF`);
            } else {
                throw new Error(`Monto no se ingresó correctamente. Esperado: ${monto}, Actual: ${valorActual}`);
            }
        } catch (error) {
            log('error', `No se pudo ingresar el monto: ${error.message}`);
            throw new Error('No se pudo ingresar el monto');
        }
        
        await page.waitForTimeout(1000);
        
        // ========================================
        // 3. ESPERAR Y SELECCIONAR PLAZO (SELECT DINÁMICO)
        // ========================================
        log('debug', 'Paso 3: Esperando que se carguen las opciones de plazo');
        
        try {
            // Esperar a que el select esté presente
            await page.waitForSelector('select[name="plazo"]', { timeout: 10000 });
            
            // Esperar a que se carguen las opciones dinámicamente
            // Esto puede tomar un momento después de seleccionar UF y/o ingresar monto
            await page.waitForTimeout(3000);
            
            // Verificar si hay opciones disponibles
            let intentos = 0;
            let opcionesDisponibles = false;
            
            while (intentos < 10 && !opcionesDisponibles) {
                const opciones = await page.locator('select[name="plazo"] option').allTextContents();
                log('debug', `Intento ${intentos + 1}: Opciones encontradas:`, opciones);
                
                // Si hay más de una opción (la primera suele ser "Seleccione...")
                if (opciones.length > 1) {
                    opcionesDisponibles = true;
                    log('info', `✓ Opciones de plazo cargadas: ${opciones.length} opciones`);
                } else {
                    log('debug', 'Esperando más opciones...');
                    await page.waitForTimeout(1000);
                    intentos++;
                }
            }
            
            if (!opcionesDisponibles) {
                throw new Error('No se cargaron las opciones de plazo después de 10 intentos');
            }
            
            // Intentar seleccionar el plazo exacto
            const opcionesTexto = await page.locator('select[name="plazo"] option').allTextContents();
            log('info', 'Opciones de plazo disponibles:', opcionesTexto);
            
            // Buscar la opción que coincida con el plazo deseado
            let opcionSeleccionada = false;
            
            // Estrategias para encontrar la opción correcta
            const estrategiasSeleccion = [
                plazo.toString(), // Valor exacto
                `${plazo} años`, // Con "años"
                `${plazo} año`, // Singular
                `${plazo} Años`, // Con mayúscula
                `${plazo} Año` // Singular con mayúscula
            ];
            
            for (const estrategia of estrategiasSeleccion) {
                try {
                    // Buscar opción que contenga el texto
                    const opcionEncontrada = opcionesTexto.find(opcion => 
                        opcion.includes(estrategia) || opcion.includes(plazo.toString())
                    );
                    
                    if (opcionEncontrada) {
                        await page.selectOption('select[name="plazo"]', { label: opcionEncontrada });
                        log('info', `✓ Plazo seleccionado: ${opcionEncontrada}`);
                        opcionSeleccionada = true;
                        break;
                    }
                } catch (error) {
                    log('debug', `Estrategia "${estrategia}" no funcionó`);
                }
            }
            
            // Si no se pudo seleccionar exactamente, buscar el más cercano
            if (!opcionSeleccionada) {
                log('warn', `No se encontró plazo exacto de ${plazo} años, buscando el más cercano...`);
                
                // Extraer números de las opciones y encontrar el más cercano
                const opcionesConNumero = opcionesTexto
                    .map(opcion => {
                        const match = opcion.match(/(\d+)/);
                        return match ? { texto: opcion, numero: parseInt(match[1]) } : null;
                    })
                    .filter(item => item !== null);
                
                if (opcionesConNumero.length > 0) {
                    // Encontrar la opción más cercana al plazo deseado
                    const masCercana = opcionesConNumero.reduce((prev, curr) => 
                        Math.abs(curr.numero - plazo) < Math.abs(prev.numero - plazo) ? curr : prev
                    );
                    
                    await page.selectOption('select[name="plazo"]', { label: masCercana.texto });
                    log('info', `✓ Plazo más cercano seleccionado: ${masCercana.texto} (solicitado: ${plazo} años)`);
                    opcionSeleccionada = true;
                } else {
                    throw new Error('No se encontraron opciones válidas de plazo');
                }
            }
            
        } catch (error) {
            log('error', `Error seleccionando plazo: ${error.message}`);
            throw new Error('No se pudo seleccionar el plazo');
        }
        
        await page.waitForTimeout(1000);
        
        // ========================================
        // 4. ENVIAR FORMULARIO (BOTÓN ESPECÍFICO)
        // ========================================
        log('debug', 'Paso 4: Enviando formulario');
        
        try {
            // Usar el selector específico del botón submit identificado
            await page.waitForSelector('input[type="submit"][value="Simular »"]', { timeout: 10000 });
            await page.click('input[type="submit"][value="Simular »"]');
            log('info', '✓ Formulario enviado correctamente');
        } catch (error) {
            log('error', `No se pudo enviar el formulario: ${error.message}`);
            throw new Error('No se pudo enviar el formulario');
        }
        
        // Esperar a que se carguen los resultados
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(8000); // Tiempo extra para que se procesen los resultados
        
        log('info', '✅ Formulario CMF completado exitosamente');
        return true;
        
    } catch (error) {
        log('error', `Error en formulario CMF específico: ${error.message}`);
        
        // Captura adicional para debugging
        try {
            await page.screenshot({ path: 'error-cmf-especifico.png', fullPage: true });
            log('info', 'Captura de error guardada: error-cmf-especifico.png');
        } catch (screenshotError) {
            log('warn', 'No se pudo tomar captura de error');
        }
        
        throw error;
    }
}

async function analizarFormularioCMF(page) {
    try {
        log('info', '🔍 Analizando estructura actual del formulario CMF...');
        
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(3000);
        
        // Tomar captura
        await page.screenshot({ path: 'cmf-analisis.png', fullPage: true });
        log('info', 'Captura guardada: cmf-analisis.png');
        
        // Información básica de la página
        const url = page.url();
        const titulo = await page.title();
        log('info', `URL actual: ${url}`);
        log('info', `Título de página: ${titulo}`);
        
        // Analizar formularios
        const cantidadForms = await page.locator('form').count();
        log('info', `Formularios encontrados: ${cantidadForms}`);
        
        // Analizar todos los elementos input
        const inputs = await page.locator('input').all();
        const datosInputs = [];
        
        for (let i = 0; i < inputs.length; i++) {
            try {
                const input = inputs[i];
                const datos = {
                    indice: i,
                    tipo: await input.getAttribute('type') || 'sin-tipo',
                    nombre: await input.getAttribute('name') || 'sin-nombre',
                    id: await input.getAttribute('id') || 'sin-id',
                    valor: await input.getAttribute('value') || 'sin-valor',
                    placeholder: await input.getAttribute('placeholder') || 'sin-placeholder',
                    clase: await input.getAttribute('class') || 'sin-clase',
                    esVisible: await input.isVisible(),
                    estaHabilitado: await input.isEnabled()
                };
                datosInputs.push(datos);
            } catch (error) {
                log('warn', `No se pudo analizar input ${i}: ${error.message}`);
            }
        }
        
        log('info', '📋 ANÁLISIS DE ELEMENTOS INPUT:');
        console.table(datosInputs);
        
        // Analizar elementos select
        const selects = await page.locator('select').all();
        const datosSelects = [];
        
        for (let i = 0; i < selects.length; i++) {
            try {
                const select = selects[i];
                const opciones = await select.locator('option').allTextContents();
                const datos = {
                    indice: i,
                    nombre: await select.getAttribute('name') || 'sin-nombre',
                    id: await select.getAttribute('id') || 'sin-id',
                    clase: await select.getAttribute('class') || 'sin-clase',
                    esVisible: await select.isVisible(),
                    estaHabilitado: await select.isEnabled(),
                    opciones: opciones.slice(0, 5) // Primeras 5 opciones
                };
                datosSelects.push(datos);
            } catch (error) {
                log('warn', `No se pudo analizar select ${i}: ${error.message}`);
            }
        }
        
        if (datosSelects.length > 0) {
            log('info', '📋 ANÁLISIS DE ELEMENTOS SELECT:');
            console.table(datosSelects);
        }
        
        // Analizar botones
        const botones = await page.locator('button, input[type="submit"], input[type="button"]').all();
        const datosBotones = [];
        
        for (let i = 0; i < botones.length; i++) {
            try {
                const boton = botones[i];
                const datos = {
                    indice: i,
                    tipo: await boton.getAttribute('type') || 'sin-tipo',
                    nombre: await boton.getAttribute('name') || 'sin-nombre',
                    id: await boton.getAttribute('id') || 'sin-id',
                    valor: await boton.getAttribute('value') || 'sin-valor',
                    texto: (await boton.textContent() || 'sin-texto').trim(),
                    esVisible: await boton.isVisible(),
                    estaHabilitado: await boton.isEnabled()
                };
                datosBotones.push(datos);
            } catch (error) {
                log('warn', `No se pudo analizar botón ${i}: ${error.message}`);
            }
        }
        
        if (datosBotones.length > 0) {
            log('info', '📋 ANÁLISIS DE BOTONES:');
            console.table(datosBotones);
        }
        
        // Buscar patrones de texto relevantes
        const textoPage = await page.textContent('body');
        const textosRelevantes = [];
        
        const patrones = [
            /monto/gi,
            /plazo/gi,
            /años/gi,
            /uf/gi,
            /unidades.*fomento/gi,
            /simular/gi,
            /calcular/gi,
            /pesos/gi
        ];
        
        patrones.forEach(patron => {
            const coincidencias = textoPage.match(patron);
            if (coincidencias) {
                textosRelevantes.push({
                    patron: patron.source,
                    coincidencias: coincidencias.length,
                    primera: coincidencias[0]
                });
            }
        });
        
        log('info', '📋 PATRONES DE TEXTO ENCONTRADOS:');
        console.table(textosRelevantes);
        
        return {
            formularios: cantidadForms,
            inputs: datosInputs,
            selects: datosSelects,
            botones: datosBotones,
            textosRelevantes: textosRelevantes
        };
        
    } catch (error) {
        log('error', `Error analizando formulario CMF: ${error.message}`);
        throw error;
    }
}

// Función para esperar y validar que la tabla de resultados se haya cargado
async function esperarResultadosCMF(page) {
    try {
        log('info', '⏳ Esperando que se carguen los resultados del simulador...');
        
        // Selectores posibles para la tabla de resultados
        const selectoresTabla = [
            '#simuladorCreditoHipotecario table',
            'table.table',
            '.tabla-resultados',
            'table tbody tr',
            '[id*="resultado"]',
            '[class*="resultado"]'
        ];
        
        let tablaEncontrada = false;
        
        for (const selector of selectoresTabla) {
            try {
                await page.waitForSelector(selector, { timeout: 15000 });
                const filas = await page.locator(`${selector}`).count();
                
                if (filas > 0) {
                    log('info', `✓ Tabla de resultados encontrada con selector: ${selector}`);
                    log('info', `✓ Elementos encontrados: ${filas}`);
                    tablaEncontrada = true;
                    break;
                }
            } catch (error) {
                log('debug', `Selector de tabla no encontrado: ${selector}`);
            }
        }
        
        if (!tablaEncontrada) {
            // Intentar buscar texto que indique resultados
            const textosResultado = [
                'Banco',
                'Institución',
                'Dividendo',
                'Tasa',
                'CAE'
            ];
            
            for (const texto of textosResultado) {
                try {
                    await page.waitForSelector(`:text("${texto}")`, { timeout: 5000 });
                    log('info', `✓ Texto de resultado encontrado: ${texto}`);
                    tablaEncontrada = true;
                    break;
                } catch (error) {
                    log('debug', `Texto no encontrado: ${texto}`);
                }
            }
        }
        
        if (tablaEncontrada) {
            log('info', '✅ Resultados del simulador cargados correctamente');
            return true;
        } else {
            log('warn', '⚠️ No se pudo verificar la carga de resultados, continuando...');
            return false;
        }
        
    } catch (error) {
        log('error', `Error esperando resultados: ${error.message}`);
        return false;
    }
}

// ===== FUNCIONES ORIGINALES (mantener compatibilidad) =====

// Función para llenar el formulario de búsqueda CORREGIDA con selectores de Portal Inmobiliario
async function llenarFormularioBusqueda(page, tipo, operacion, ubicacion) {
    try {
        log('info', `🔍 Llenando formulario: ${operacion} de ${tipo} en ${ubicacion}`);
        
        // Esperar a que cargue la página principal
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(3000);
        
        // =================================================================
        // 1. SELECCIONAR OPERACIÓN (Venta/Arriendo) - CORREGIDO
        // =================================================================
        log('debug', `Seleccionando operación: ${operacion}`);
        
        // Primero hacer clic en el dropdown de operación para abrirlo
        const selectorDropdownOperacion = 'button[aria-label="Tipo de operación"]';
        try {
            await page.waitForSelector(selectorDropdownOperacion, { timeout: 10000 });
            await page.click(selectorDropdownOperacion);
            log('info', '✓ Dropdown de operación abierto');
            await page.waitForTimeout(1000);
            
            // Ahora seleccionar la opción correcta
            let selectorOpcion;
            if (operacion.toLowerCase() === 'venta') {
                // Buscar la opción "Venta" por texto
                selectorOpcion = 'li:has-text("Venta"):not(:has-text("temporal"))';
            } else {
                // Buscar la opción "Arriendo" (no temporal)
                selectorOpcion = 'li:has-text("Arriendo"):not(:has-text("temporal"))';
            }
            
            await page.waitForSelector(selectorOpcion, { timeout: 5000 });
            await page.click(selectorOpcion);
            log('info', `✓ Operación seleccionada: ${operacion}`);
            
        } catch (error) {
            log('warn', `No se pudo seleccionar operación: ${error.message}`);
        }
        
        await page.waitForTimeout(1000);
        
        // =================================================================
        // 2. SELECCIONAR TIPO DE PROPIEDAD (Casa/Departamento) - CORREGIDO
        // =================================================================
        log('debug', `Seleccionando tipo: ${tipo}`);
        
        // Hacer clic en el dropdown de tipo de propiedad
        const selectorDropdownTipo = 'button[aria-label="Tipo de propiedad"]';
        try {
            await page.waitForSelector(selectorDropdownTipo, { timeout: 10000 });
            await page.click(selectorDropdownTipo);
            log('info', '✓ Dropdown de tipo abierto');
            await page.waitForTimeout(1000);
            
            // Seleccionar la opción correcta
            let selectorTipoOpcion;
            if (tipo.toLowerCase() === 'casa') {
                selectorTipoOpcion = 'li:has-text("Casas")';
            } else {
                selectorTipoOpcion = 'li:has-text("Departamentos")';
            }
            
            await page.waitForSelector(selectorTipoOpcion, { timeout: 5000 });
            await page.click(selectorTipoOpcion);
            log('info', `✓ Tipo seleccionado: ${tipo}`);
            
        } catch (error) {
            log('warn', `No se pudo seleccionar tipo: ${error.message}`);
        }
        
        await page.waitForTimeout(1000);
        
        // =================================================================
        // 3. INGRESAR UBICACIÓN - CORREGIDO
        // =================================================================
        log('debug', `Ingresando ubicación: ${ubicacion}`);
        
        // Selector correcto para el campo de ubicación basado en el HTML
        const selectorUbicacion = 'input[placeholder="Ingresa comuna o ciudad"]';
        
        try {
            await page.waitForSelector(selectorUbicacion, { timeout: 10000 });
            
            // Limpiar campo y escribir ubicación
            await page.fill(selectorUbicacion, '');
            await page.waitForTimeout(500);
            await page.fill(selectorUbicacion, ubicacion);
            await page.waitForTimeout(2000); // Esperar a que aparezcan sugerencias
            
            log('info', `✓ Ubicación ingresada: ${ubicacion}`);
            
            // Intentar seleccionar la primera sugerencia si aparece
            try {
                const selectorSugerencia = '.andes-list__item .andes-list__item-action';
                await page.waitForSelector(selectorSugerencia, { timeout: 3000 });
                await page.click(`${selectorSugerencia}:first-child`);
                log('info', `✓ Primera sugerencia seleccionada`);
            } catch (error) {
                log('info', `Continuando sin seleccionar sugerencia`);
            }
            
        } catch (error) {
            log('warn', `No se pudo ingresar ubicación: ${error.message}`);
        }
        
        await page.waitForTimeout(1000);
        
        // =================================================================
        // 4. HACER CLIC EN BOTÓN DE BÚSQUEDA - CORREGIDO
        // =================================================================
        log('debug', 'Haciendo clic en botón de búsqueda');
        
        // Selector correcto para el botón de búsqueda basado en el HTML
        const selectorBusqueda = '.andes-button:has-text("Buscar")';
        
        try {
            await page.waitForSelector(selectorBusqueda, { timeout: 10000 });
            await page.click(selectorBusqueda);
            log('info', '✓ Botón de búsqueda presionado');
            
            // Esperar a que se carguen los resultados
            log('debug', 'Esperando carga de resultados...');
            await page.waitForLoadState('domcontentloaded');
            await page.waitForTimeout(5000); // Espera más tiempo para los resultados
            
        } catch (error) {
            log('warn', `No se pudo hacer clic en botón de búsqueda: ${error.message}`);
            
            // Intentar presionar Enter en el campo de ubicación como alternativa
            try {
                await page.press(selectorUbicacion, 'Enter');
                log('info', '✓ Enter presionado en campo de ubicación');
                await page.waitForTimeout(5000);
            } catch (enterError) {
                log('error', `Tampoco funcionó presionar Enter: ${enterError.message}`);
            }
        }
        
        log('info', '✅ Formulario llenado exitosamente');
        return true;
        
    } catch (error) {
        log('error', `Error llenando formulario: ${error.message}`);
        return false;
    }
}

// Función para extraer propiedades de una página de resultados - CORREGIDA
async function extraerPropiedadesPagina(page) {
    try {
        log('info', '🏠 Extrayendo propiedades de la página actual...');
        
        // Esperar a que se carguen los resultados
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(3000);
        
        // Selectores para elementos de propiedades basados en Portal Inmobiliario
        const selectoresItems = [
            '.ui-search-layout__item',
            '.ui-search-results__item', 
            '[class*="ui-search"]',
            '.poly-component',
            '[class*="item"]'
        ];
        
        let selectorItems = null;
        let cantidadItems = 0;
        
        // Encontrar el selector correcto
        for (const selector of selectoresItems) {
            try {
                await page.waitForSelector(selector, { timeout: 5000 });
                cantidadItems = await page.locator(selector).count();
                if (cantidadItems > 0) {
                    selectorItems = selector;
                    log('info', `✓ Encontrados ${cantidadItems} elementos con selector: ${selector}`);
                    break;
                }
            } catch (error) {
                log('debug', `Selector ${selector} no encontrado o sin resultados`);
            }
        }
        
        if (!selectorItems || cantidadItems === 0) {
            log('warn', 'No se encontraron propiedades en esta página');
            
            // Intentar capturar lo que sí hay en la página para debug
            try {
                const contenidoPagina = await page.content();
                if (contenidoPagina.includes('Sin resultados') || contenidoPagina.includes('No se encontraron')) {
                    log('info', 'La página indica que no hay resultados para esta búsqueda');
                } else {
                    log('debug', 'Estructura de página no reconocida');
                }
            } catch (debugError) {
                log('debug', 'No se pudo analizar contenido de página');
            }
            
            return [];
        }
        
        const propiedades = [];
        const items = await page.locator(selectorItems).all();
        
        log('info', `📋 Procesando ${items.length} propiedades...`);
        
        // Limitar a primeros 20 elementos para evitar timeout
        const limitItems = Math.min(items.length, 20);
        
        for (let i = 0; i < limitItems; i++) {
            try {
                log('debug', `Procesando propiedad ${i + 1}/${limitItems}`);
                
                const item = items[i];
                const propiedad = await extraerDatosPropiedad(item, page);
                
                if (propiedad.titulo !== 'No disponible') {
                    propiedades.push({
                        ...propiedad,
                        posicion: i + 1,
                        timestamp: new Date().toISOString()
                    });
                    log('info', `✓ Propiedad ${i + 1} extraída: ${propiedad.titulo.substring(0, 50)}...`);
                } else {
                    log('warn', `⚠ Propiedad ${i + 1} omitida por falta de datos`);
                }
                
            } catch (error) {
                log('error', `Error procesando propiedad ${i + 1}: ${error.message}`);
            }
        }
        
        log('info', `✅ Extraídas ${propiedades.length} propiedades de ${limitItems} elementos procesados`);
        return propiedades;
        
    } catch (error) {
        log('error', `Error extrayendo propiedades de página: ${error.message}`);
        return [];
    }
}

// Función para extraer datos de una propiedad individual - MEJORADA
async function extraerDatosPropiedad(item, page) {
    try {
        // Extraer título - selectores basados en Portal Inmobiliario
        const selectoresTitulo = [
            '.poly-component__title a',
            '.ui-search-item__title a',
            '.ui-search-item__title-label',
            'h2 a',
            'h3 a',
            'a[title]',
            '.title a'
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
                // Continuar con el siguiente selector
            }
        }
        
        // Extraer precio - selectores basados en Portal Inmobiliario
        const selectoresPrecio = [
            '.andes-money-amount__fraction',
            '.ui-search-price__fraction',
            '.price-fraction',
            '[class*="price"] [class*="fraction"]',
            '[class*="money-amount"]'
        ];
        
        let precio = 'No disponible';
        let moneda = '$';
        
        // Primero buscar la moneda
        const selectoresMoneda = [
            '.andes-money-amount__currency-symbol',
            '.ui-search-price__currency',
            '[class*="currency"]'
        ];
        
        for (const selector of selectoresMoneda) {
            try {
                const elemento = item.locator(selector).first();
                if (await elemento.count() > 0) {
                    const monedaText = await elemento.textContent({ timeout: 3000 });
                    if (monedaText && monedaText.trim()) {
                        moneda = monedaText.trim();
                        break;
                    }
                }
            } catch (error) {
                // Continuar con el siguiente selector
            }
        }
        
        // Luego buscar el precio
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
                // Continuar con el siguiente selector
            }
        }
        
        // Extraer ubicación
        const selectoresUbicacion = [
            '.poly-component__location',
            '.ui-search-item__location',
            '.ui-search-item__group__element--location',
            '[class*="location"]',
            '[class*="address"]'
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
                // Continuar con el siguiente selector
            }
        }
        
        // Extraer atributos (dormitorios, baños, superficie)
        let dormitorios = 'No disponible';
        let banos = 'No disponible';
        let superficie = 'No disponible';
        
        const selectoresAtributos = [
            '.poly-attributes_list__item',
            '.ui-search-item__attributes li',
            '.ui-search-item__group__element',
            '[class*="attributes"] li',
            '[class*="attribute"]'
        ];
        
        for (const selector of selectoresAtributos) {
            try {
                const elementos = item.locator(selector);
                const count = await elementos.count();
                
                for (let i = 0; i < count; i++) {
                    const texto = await elementos.nth(i).textContent({ timeout: 2000 });
                    if (texto) {
                        const textoLower = texto.toLowerCase();
                        
                        if ((textoLower.includes('dormitorio') || textoLower.includes('habitación') || textoLower.includes('dorm')) && dormitorios === 'No disponible') {
                            dormitorios = texto.trim();
                        } else if (textoLower.includes('baño') && banos === 'No disponible') {
                            banos = texto.trim();
                        } else if ((textoLower.includes('m²') || textoLower.includes('m2') || textoLower.includes('superficie')) && superficie === 'No disponible') {
                            superficie = texto.trim();
                        }
                    }
                }
                
                if (dormitorios !== 'No disponible' && banos !== 'No disponible' && superficie !== 'No disponible') {
                    break;
                }
                
            } catch (error) {
                // Continuar con el siguiente selector
            }
        }
        
        // Extraer link
        const selectoresLink = [
            '.poly-component__title a',
            '.ui-search-item__title a',
            'a[href*="/MLC"]',
            'a[href*="/propiedad"]',
            'a[href]'
        ];
        
        let link = 'No disponible';
        for (const selector of selectoresLink) {
            try {
                const elemento = item.locator(selector).first();
                if (await elemento.count() > 0) {
                    link = await elemento.getAttribute('href', { timeout: 3000 });
                    if (link) {
                        // Convertir a URL absoluta si es necesario
                        if (link.startsWith('/')) {
                            link = `https://www.portalinmobiliario.com${link}`;
                        }
                        break;
                    }
                }
            } catch (error) {
                // Continuar con el siguiente selector
            }
        }
        
        // Extraer imagen
        const selectoresImagen = [
            '.poly-component__picture img',
            '.ui-search-item__image img',
            'img[src*="http"]'
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
                // Continuar con el siguiente selector
            }
        }
        
        return {
            titulo,
            precio,
            moneda,
            ubicacion,
            dormitorios,
            banos,
            superficie,
            link,
            imagen
        };
        
    } catch (error) {
        log('error', `Error extrayendo datos de propiedad: ${error.message}`);
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

// Función para verificar si existe página siguiente - CORREGIDA
async function existePaginaSiguiente(page) {
    try {
        const selectoresSiguiente = [
            '.andes-pagination__button--next:not([disabled])',
            '.ui-search-pagination .ui-search-link:has-text("Siguiente")',
            'a[aria-label="Siguiente"]:not([disabled])',
            '.pagination-next:not([disabled])',
            '[title="Siguiente página"]:not([disabled])'
        ];
        
        for (const selector of selectoresSiguiente) {
            try {
                const elemento = page.locator(selector);
                if (await elemento.count() > 0) {
                    const esVisible = await elemento.first().isVisible();
                    const estaHabilitado = await elemento.first().isEnabled();
                    
                    if (esVisible && estaHabilitado) {
                        log('info', `✓ Página siguiente disponible con selector: ${selector}`);
                        return { existe: true, selector };
                    }
                }
            } catch (error) {
                // Continuar con el siguiente selector
            }
        }
        
        log('info', 'No se encontró página siguiente disponible');
        return { existe: false, selector: null };
        
    } catch (error) {
        log('error', `Error verificando página siguiente: ${error.message}`);
        return { existe: false, selector: null };
    }
}

// Función para navegar a la página siguiente
async function irPaginaSiguiente(page, selector) {
    try {
        log('info', '➡️ Navegando a página siguiente...');
        
        await page.click(selector);
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(3000);
        
        log('info', '✅ Navegación a página siguiente completada');
        return true;
        
    } catch (error) {
        log('error', `Error navegando a página siguiente: ${error.message}`);
        return false;
    }
}

// Función principal para búsqueda parametrizada
async function buscarPropiedades(tipo, operacion, ubicacion, maxPaginas = 3) {
    log('info', `🔍 Iniciando búsqueda: ${operacion} de ${tipo} en ${ubicacion} (máx ${maxPaginas} páginas)`);
    
    const browser = await chromium.launch({ 
        headless: true,
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
        
        // Navegar a Portal Inmobiliario
        log('info', '🌐 Navegando a Portal Inmobiliario...');
        await page.goto('https://www.portalinmobiliario.com/', { 
            timeout: 30000,
            waitUntil: 'domcontentloaded'
        });
        
        // Llenar formulario de búsqueda
        const formularioLlenado = await llenarFormularioBusqueda(page, tipo, operacion, ubicacion);
        
        if (!formularioLlenado) {
            throw new Error('No se pudo llenar el formulario de búsqueda');
        }
        
        // Array para almacenar todas las propiedades
        const todasLasPropiedades = [];
        let paginaActual = 1;
        
        // Recorrer páginas
        while (paginaActual <= maxPaginas) {
            log('info', `📄 Procesando página ${paginaActual}/${maxPaginas}`);
            
            // Extraer propiedades de la página actual
            const propiedadesPagina = await extraerPropiedadesPagina(page);
            
            if (propiedadesPagina.length === 0) {
                log('warn', `No se encontraron propiedades en página ${paginaActual}, terminando búsqueda`);
                break;
            }
            
            // Agregar número de página a cada propiedad
            const propiedadesConPagina = propiedadesPagina.map(prop => ({
                ...prop,
                pagina: paginaActual
            }));
            
            todasLasPropiedades.push(...propiedadesConPagina);
            
            log('info', `✅ Página ${paginaActual}: ${propiedadesPagina.length} propiedades extraídas`);
            
            // Verificar si hay página siguiente
            if (paginaActual < maxPaginas) {
                const { existe, selector } = await existePaginaSiguiente(page);
                
                if (existe) {
                    const navegacionExitosa = await irPaginaSiguiente(page, selector);
                    if (!navegacionExitosa) {
                        log('warn', 'No se pudo navegar a la página siguiente, terminando búsqueda');
                        break;
                    }
                    paginaActual++;
                } else {
                    log('info', 'No hay más páginas disponibles, terminando búsqueda');
                    break;
                }
            } else {
                paginaActual++;
            }
        }
        
        log('info', `🎉 Búsqueda completada: ${todasLasPropiedades.length} propiedades encontradas en ${paginaActual - 1} páginas`);
        
        return {
            success: true,
            data: todasLasPropiedades,
            metadata: {
                tipo,
                operacion,
                ubicacion,
                totalPropiedades: todasLasPropiedades.length,
                paginasProcesadas: paginaActual - 1,
                timestamp: new Date().toISOString()
            }
        };
        
    } catch (error) {
        log('error', `💥 Error durante la búsqueda: ${error.message}`);
        
        return {
            success: false,
            error: error.message,
            metadata: {
                tipo,
                operacion,
                ubicacion,
                timestamp: new Date().toISOString()
            }
        };
        
    } finally {
        try {
            if (context) await context.close();
            await browser.close();
            log('info', '🔒 Browser cerrado correctamente');
        } catch (closeError) {
            log('error', `Error cerrando browser: ${closeError.message}`);
        }
    }
}

// Función auxiliar para extraer imagen principal
async function extraerImagenPrincipal(page) {
    const selectoresImagen = [
        '.ui-pdp-gallery__figure img',
        '.gallery-image img',
        '.item-image img',
        '.ui-pdp-image img',
        'img[src*="http"]'
    ];
    
    for (const selector of selectoresImagen) {
        try {
            await page.waitForSelector(selector, { timeout: 3000 });
            const imagen = await extraerAtributoSeguro(page, selector, 'src', `imagen ML (${selector})`);
            
            if (imagen !== 'No disponible' && 
                imagen.startsWith('http') && 
                !imagen.includes('placeholder')) {
                log('info', `✅ Imagen encontrada: ${imagen.substring(0, 50)}...`);
                return imagen;
            }
        } catch (error) {
            log('debug', `Selector de imagen no encontrado: ${selector}`);
        }
    }
    
    return 'No disponible';
}

// Función de emergencia para casos extremos
async function extraccionEmergenciaMercadoLibre(page) {
    log('warn', '⚠️ Ejecutando extracción de emergencia...');
    
    try {
        const titulo = await page.title() || 'No disponible';
        const url = page.url();
        
        // Extraer cualquier texto que pueda ser útil
        const h1Text = await extraerTextoSeguro(page, 'h1', 'título h1 emergencia');
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
        log('error', `Error en extracción de emergencia: ${error.message}`);
        throw error;
    }
}

// Función para extraer PRECIO (UF y CLP) correctamente
async function extraerPrecioMercadoLibre(page) {
    try {
        log('info', '💰 Extrayendo precios de MercadoLibre...');
        
        // Buscar el contenedor principal de precios
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
                log('info', `✅ Precio UF extraído: ${precioUF}`);
            }
        } catch (error) {
            log('warn', 'No se pudo extraer precio en UF, intentando con selector alternativo');
            
            // Selector alternativo para precio principal
            try {
                const precioElement = await page.locator('.andes-money-amount').first();
                const moneda = await precioElement.locator('.andes-money-amount__currency-symbol').textContent();
                const cantidad = await precioElement.locator('.andes-money-amount__fraction').textContent();
                
                if (moneda && cantidad) {
                    precioUF = `${moneda} ${cantidad.trim()}`;
                    monedaPrincipal = moneda.trim();
                    log('info', `✅ Precio principal extraído (alternativo): ${precioUF}`);
                }
            } catch (altError) {
                log('error', 'No se pudo extraer precio principal con selectores alternativos');
            }
        }
        
        // Extraer PRECIO SECUNDARIO (CLP)
        try {
            const contenedorSubtitulos = '.ui-pdp-price__subtitles';
            const monedaCLP = await page.locator(`${contenedorSubtitulos} .andes-money-amount__currency-symbol`).textContent();
            const cantidadCLP = await page.locator(`${contenedorSubtitulos} .andes-money-amount__fraction`).textContent();
            
            if (monedaCLP && cantidadCLP) {
                precioCLP = `${monedaCLP} ${cantidadCLP.trim()}`;
                log('info', `✅ Precio CLP extraído: ${precioCLP}`);
            }
        } catch (error) {
            log('warn', 'No se pudo extraer precio secundario en CLP');
        }
        
        return {
            precio_principal: precioUF,
            precio_secundario: precioCLP,
            moneda: monedaPrincipal
        };
        
    } catch (error) {
        log('error', `Error extrayendo precios: ${error.message}`);
        return {
            precio_principal: 'No disponible',
            precio_secundario: 'No disponible',
            moneda: '$'
        };
    }
}

// Función para extraer CARACTERÍSTICAS detalladas
async function extraerCaracteristicasDetalladas(page) {
    try {
        log('info', '🏠 Extrayendo características detalladas...');
        
        const caracteristicas = {};
        
        // Esperar por el contenedor de características
        const selectorCaracteristicas = '.ui-vpp-highlighted-specs__key-value';
        await page.waitForSelector(selectorCaracteristicas, { timeout: 8000 });
        
        // Extraer todas las características
        const elementos = await page.locator(selectorCaracteristicas).all();
        
        for (let elemento of elementos) {
            try {
                // Extraer clave y valor de cada característica
                const clave = await elemento.locator('.ui-pdp-color--BLACK.ui-pdp-size--XSMALL.ui-pdp-family--REGULAR').textContent();
                const valor = await elemento.locator('.ui-pdp-color--BLACK.ui-pdp-size--XSMALL.ui-pdp-family--SEMIBOLD').textContent();
                
                if (clave && valor) {
                    const claveNormalizada = clave.replace(':', '').trim().toLowerCase();
                    caracteristicas[claveNormalizada] = valor.trim();
                    log('debug', `Característica extraída: ${clave} = ${valor}`);
                }
            } catch (error) {
                log('debug', `Error extrayendo característica individual: ${error.message}`);
            }
        }
        
        // Mapear a campos específicos que necesitamos
        const resultado = {
            pisos: caracteristicas['cantidad de pisos'] || 'No disponible',
            jardin: caracteristicas['jardín'] || 'No disponible',
            quincho: caracteristicas['quincho'] || 'No disponible',
            piscina: caracteristicas['piscina'] || 'No disponible',
            estacionamientos: caracteristicas['estacionamientos'] || 'No disponible',
            antiguedad: caracteristicas['antigüedad'] || 'No disponible',
            condominio_cerrado: caracteristicas['con condominio cerrado'] || 'No disponible',
            caracteristicas_completas: caracteristicas
        };
        
        log('info', '✅ Características extraídas:', resultado);
        return resultado;
        
    } catch (error) {
        log('error', `Error extrayendo características: ${error.message}`);
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

// Función para extraer DESCRIPCIÓN completa
async function extraerDescripcionCompleta(page) {
    try {
        log('info', '📝 Extrayendo descripción completa...');
        
        // Selector específico para la descripción
        const selectorDescripcion = '.ui-pdp-description__content';
        await page.waitForSelector(selectorDescripcion, { timeout: 8000 });
        
        const descripcion = await page.locator(selectorDescripcion).textContent();
        
        if (descripcion && descripcion.trim().length > 0) {
            const descripcionLimpia = descripcion.trim()
                .replace(/\n\s*\n/g, '\n')  // Remover líneas vacías múltiples
                .replace(/\s+/g, ' ')       // Normalizar espacios
                .trim();
            
            log('info', `✅ Descripción extraída (${descripcionLimpia.length} caracteres)`);
            return descripcionLimpia;
        } else {
            log('warn', 'Descripción vacía encontrada');
            return 'No disponible';
        }
        
    } catch (error) {
        log('error', `Error extrayendo descripción: ${error.message}`);
        return 'No disponible';
    }
}

// Función para extraer UBICACIÓN exacta
async function extraerUbicacionExacta(page) {
    try {
        log('info', '📍 Extrayendo ubicación exacta...');
        
        // Selector específico para la ubicación
        const selectorUbicacion = '.ui-pdp-media__title';
        await page.waitForSelector(selectorUbicacion, { timeout: 8000 });
        
        const ubicacion = await page.locator(selectorUbicacion).textContent();
        
        if (ubicacion && ubicacion.trim().length > 0) {
            const ubicacionLimpia = ubicacion.trim();
            log('info', `✅ Ubicación extraída: ${ubicacionLimpia}`);
            return ubicacionLimpia;
        } else {
            log('warn', 'Ubicación vacía, intentando selectores alternativos');
            
            // Selectores alternativos para ubicación
            const selectoresAlternativos = [
                '.ui-pdp-color--BLACK.ui-pdp-size--SMALL',
                '.ui-vip-location',
                '[class*="location"]'
            ];
            
            for (const selector of selectoresAlternativos) {
                try {
                    const ubicacionAlt = await extraerTextoSeguro(page, selector, `ubicación alternativa (${selector})`);
                    if (ubicacionAlt !== 'No disponible' && ubicacionAlt.length > 10) {
                        log('info', `✅ Ubicación encontrada con selector alternativo: ${ubicacionAlt}`);
                        return ubicacionAlt;
                    }
                } catch (error) {
                    log('debug', `Selector alternativo falló: ${selector}`);
                }
            }
            
            return 'No disponible';
        }
        
    } catch (error) {
        log('error', `Error extrayendo ubicación: ${error.message}`);
        return 'No disponible';
    }
}

// Función mejorada para extraer datos básicos (dormitorios, baños, superficie)
async function extraerDatosBasicos(page) {
    try {
        log('info', '🏠 Extrayendo datos básicos de la propiedad...');
        
        let dormitorios = 'No disponible';
        let banos = 'No disponible';  
        let superficie = 'No disponible';
        
        // Intentar extraer de la descripción si está disponible
        try {
            const descripcion = await page.locator('.ui-pdp-description__content').textContent();
            if (descripcion) {
                const texto = descripcion.toLowerCase();
                
                // Buscar dormitorios
                const matchDormitorios = texto.match(/(\d+)\s*dormitorio/i);
                if (matchDormitorios) {
                    dormitorios = `${matchDormitorios[1]} dormitorios`;
                    log('info', `✅ Dormitorios extraídos de descripción: ${dormitorios}`);
                }
                
                // Buscar baños
                const matchBanos = texto.match(/(\d+)\s*baño/i);
                if (matchBanos) {
                    banos = `${matchBanos[1]} baños`;
                    log('info', `✅ Baños extraídos de descripción: ${banos}`);
                }
                
                // Buscar superficie
                const matchSuperficie = texto.match(/(\d+)\s*m2?\s*(construidos?|terreno|superficie)/i);
                if (matchSuperficie) {
                    superficie = `${matchSuperficie[1]} m²`;
                    log('info', `✅ Superficie extraída de descripción: ${superficie}`);
                }
            }
        } catch (error) {
            log('debug', 'No se pudo extraer datos básicos de la descripción');
        }
        
        // Si no encontramos en la descripción, buscar en características
        if (dormitorios === 'No disponible' || banos === 'No disponible' || superficie === 'No disponible') {
            const selectoresAtributos = [
                '.ui-vpp-striped-specs__table tr',
                '.ui-vpp-highlighted-specs__key-value',
                '.specs-item'
            ];
            
            for (const selector of selectoresAtributos) {
                try {
                    const atributos = await page.locator(selector).allTextContents();
                    
                    atributos.forEach(attr => {
                        const txt = attr.toLowerCase();
                        
                        if (txt.includes('dormitorio') && dormitorios === 'No disponible') {
                            dormitorios = attr.trim();
                        }
                        if (txt.includes('baño') && banos === 'No disponible') {
                            banos = attr.trim();
                        }
                        if ((txt.includes('m²') || txt.includes('superficie')) && superficie === 'No disponible') {
                            superficie = attr.trim();
                        }
                    });
                    
                    if (dormitorios !== 'No disponible' && banos !== 'No disponible' && superficie !== 'No disponible') {
                        break;
                    }
                } catch (error) {
                    log('debug', `Error con selector de atributos: ${selector}`);
                }
            }
        }
        
        return { dormitorios, banos, superficie };
        
    } catch (error) {
        log('error', `Error extrayendo datos básicos: ${error.message}`);
        return {
            dormitorios: 'No disponible',
            banos: 'No disponible',
            superficie: 'No disponible'
        };
    }
}

// FUNCIÓN PRINCIPAL DE MERCADOLIBRE CORREGIDA
async function extraerMercadoLibreCorregido(page) {
    log('info', '🛒 Iniciando extracción CORREGIDA de MercadoLibre...');
    
    try {
        await analizarEstructuraPagina(page, 'mercadolibre');
        await esperarCargaConRetry(page);
        
        // 1. Extraer TÍTULO
        const selectoresTitulo = [
            '.ui-pdp-title',
            'h1'
        ];
        
        let titulo = 'No disponible';
        for (const selector of selectoresTitulo) {
            try {
                await page.waitForSelector(selector, { timeout: 5000 });
                titulo = await extraerTextoSeguro(page, selector, `título ML (${selector})`);
                if (titulo !== 'No disponible') {
                    log('info', `✅ Título encontrado con selector: ${selector}`);
                    break;
                }
            } catch (error) {
                log('debug', `Selector de título no encontrado: ${selector}`);
            }
        }
        
        // 2. Extraer PRECIOS (UF y CLP)
        const precios = await extraerPrecioMercadoLibre(page);
        
        // 3. Extraer UBICACIÓN exacta
        const ubicacion = await extraerUbicacionExacta(page);
        
        // 4. Extraer CARACTERÍSTICAS detalladas
        const caracteristicas = await extraerCaracteristicasDetalladas(page);
        
        // 5. Extraer DESCRIPCIÓN completa
        const descripcion = await extraerDescripcionCompleta(page);
        
        // 6. Extraer datos básicos (dormitorios, baños, superficie)
        const datosBasicos = await extraerDatosBasicos(page);
        
        // 7. Extraer imagen principal
        const imagen = await extraerImagenPrincipal(page);
        
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
        
        log('info', '✅ Extracción MercadoLibre CORREGIDA completada');
        log('info', 'Datos extraídos:', {
            titulo: resultado.titulo.substring(0, 50) + '...',
            precio_uf: resultado.precio_uf,
            precio_clp: resultado.precio_clp,
            ubicacion: resultado.ubicacion,
            caracteristicas_count: Object.keys(resultado.caracteristicas_completas).length
        });
        
        return resultado;
        
    } catch (error) {
        log('error', `Error en extracción CORREGIDA de MercadoLibre: ${error.message}`);
        
        // Fallback con extracción de emergencia
        log('info', '🔄 Intentando extracción de emergencia...');
        return await extraccionEmergenciaMercadoLibre(page);
    }
}

// Función para extraer datos de Portal Inmobiliario (mejorada)
async function extraerPortalInmobiliario(page) {
    log('info', '🏠 Iniciando extracción de Portal Inmobiliario...');
    
    try {
        // Analizar estructura de la página
        await analizarEstructuraPagina(page, 'portal_inmobiliario');
        
        // Usar la nueva función de espera robusta
        await esperarCargaConRetry(page);
        
        // Verificar si es una página de listado o detalle
        const selectoresListado = [
            '.ui-search-layout__item',
            '.ui-search-results__item',
            '[data-testid="search-result-item"]'
        ];
        
        let esListado = false;
        let selectorListado = null;
        
        for (const selector of selectoresListado) {
            if (await verificarSelector(page, selector, 'elemento de listado', 3000)) {
                esListado = true;
                selectorListado = selector;
                break;
            }
        }
        
        if (esListado) {
            log('info', '📋 Detectada página de listado - extrayendo primera propiedad');
            return await extraerPrimeraPropiedad(page, selectorListado);
        } else {
            log('info', '🏠 Detectada página de detalle de propiedad');
            return await extraerDetallePropiedadPI(page);
        }
        
    } catch (error) {
        log('error', `Error en extracción de Portal Inmobiliario: ${error.message}`);
        throw error;
    }
}

async function extraerPrimeraPropiedad(page, selectorListado) {
    const primerItem = page.locator(selectorListado).first();
    
    // Verificar que el primer item existe
    const count = await primerItem.count();
    if (count === 0) {
        throw new Error('No se encontró ningún elemento en el listado');
    }
    
    log('info', `Extrayendo datos del primer elemento encontrado`);
    
    // Selectores alternativos para título
    const selectoresTitulo = [
        '.poly-component__title',
        '.ui-search-item__title',
        'h2 a',
        '[data-testid="item-title"]',
        '.item-title'
    ];
    
    let titulo = 'No disponible';
    for (const selector of selectoresTitulo) {
        titulo = await extraerTextoSeguro(primerItem, selector, `título (${selector})`);
        if (titulo !== 'No disponible') break;
    }
    
    // Selectores alternativos para ubicación
    const selectoresUbicacion = [
        '.poly-component__location',
        '.ui-search-item__location',
        '.item-location',
        '[data-testid="item-location"]'
    ];
    
    let ubicacion = 'No disponible';
    for (const selector of selectoresUbicacion) {
        ubicacion = await extraerTextoSeguro(primerItem, selector, `ubicación (${selector})`);
        if (ubicacion !== 'No disponible') break;
    }
    
    // Selectores para precio
    const selectoresMoneda = [
        '.andes-money-amount__currency-symbol',
        '.price-tag-symbol',
        '.ui-search-price__currency'
    ];
    
    const selectoresPrecio = [
        '.andes-money-amount__fraction',
        '.price-tag-fraction',
        '.ui-search-price__fraction'
    ];
    
    let monedaElement = '$';
    for (const selector of selectoresMoneda) {
        const moneda = await extraerTextoSeguro(primerItem, selector, `moneda (${selector})`);
        if (moneda !== 'No disponible') {
            monedaElement = moneda;
            break;
        }
    }
    
    let precioElement = '0';
    for (const selector of selectoresPrecio) {
        const precio = await extraerTextoSeguro(primerItem, selector, `precio (${selector})`);
        if (precio !== 'No disponible') {
            precioElement = precio;
            break;
        }
    }
    
    const { precio, moneda } = formatearPrecio(precioElement, monedaElement);
    
    // Extraer atributos
    const selectoresAtributos = [
        '.poly-attributes_list__item',
        '.ui-search-item__attributes li',
        '.item-attributes li'
    ];
    
    let atributos = [];
    for (const selector of selectoresAtributos) {
        try {
            atributos = await primerItem.locator(selector).allTextContents();
            if (atributos.length > 0) {
                log('info', `Atributos encontrados con selector ${selector}:`, atributos);
                break;
            }
        } catch (error) {
            log('debug', `No se pudieron extraer atributos con selector ${selector}`);
        }
    }
    
    // Procesar atributos
    let dormitorios = 'No disponible';
    let banos = 'No disponible';
    let superficie = 'No disponible';
    
    atributos.forEach(attr => {
        const txt = attr.toLowerCase();
        log('debug', `Procesando atributo: "${attr}"`);
        
        if (txt.includes('dormitorio') || txt.includes('habitación')) {
            dormitorios = attr;
        } else if (txt.includes('baño')) {
            banos = attr;
        } else if (txt.includes('m²') || txt.includes('m2')) {
            superficie = attr;
        }
    });
    
    // Extraer link
    const selectoresLink = [
        '.poly-component__title',
        '.ui-search-item__title a',
        'h2 a'
    ];
    
    let link = 'No disponible';
    for (const selector of selectoresLink) {
        link = await extraerAtributoSeguro(primerItem, selector, 'href', `link (${selector})`);
        if (link !== 'No disponible') {
            // Convertir a URL absoluta si es necesario
            if (link.startsWith('/')) {
                link = `https://www.portalinmobiliario.com${link}`;
            }
            break;
        }
    }
    
    // Extraer imagen
    const selectoresImagen = [
        '.poly-component__picture',
        '.ui-search-item__image img',
        '.item-image img'
    ];
    
    let imagen = 'No disponible';
    for (const selector of selectoresImagen) {
        imagen = await extraerAtributoSeguro(primerItem, selector, 'src', `imagen (${selector})`);
        if (imagen !== 'No disponible') break;
    }
    
    const resultado = {
        titulo,
        precio,
        moneda,
        ubicacion,
        dormitorios,
        banos,
        superficie,
        link,
        imagen
    };
    
    log('info', '✅ Extracción completada:', resultado);
    return resultado;
}

async function extraerDetallePropiedadPI(page) {
    log('info', '🏠 Extrayendo detalle de propiedad...');
    
    // Selectores para página de detalle
    const selectoresTitulo = [
        'h1',
        '.property-title',
        '.ui-pdp-title',
        '[data-testid="property-title"]'
    ];
    
    const selectoresPrecio = [
        '.price',
        '.property-price',
        '.ui-pdp-price',
        '[data-testid="price"]'
    ];
    
    const selectoresUbicacion = [
        '.location',
        '.property-location',
        '.ui-pdp-color--BLACK',
        '[data-testid="location"]'
    ];
    
    let titulo = 'No disponible';
    for (const selector of selectoresTitulo) {
        titulo = await extraerTextoSeguro(page, selector, `título detalle (${selector})`);
        if (titulo !== 'No disponible') break;
    }
    
    let precio = 'No disponible';
    for (const selector of selectoresPrecio) {
        precio = await extraerTextoSeguro(page, selector, `precio detalle (${selector})`);
        if (precio !== 'No disponible') break;
    }
    
    let ubicacion = 'No disponible';
    for (const selector of selectoresUbicacion) {
        ubicacion = await extraerTextoSeguro(page, selector, `ubicación detalle (${selector})`);
        if (ubicacion !== 'No disponible') break;
    }
    
    const resultado = {
        titulo,
        precio,
        moneda: '$',
        ubicacion,
        dormitorios: 'No disponible',
        banos: 'No disponible',
        superficie: 'No disponible',
        link: page.url(),
        imagen: 'No disponible'
    };
    
    log('info', '✅ Extracción de detalle completada:', resultado);
    return resultado;
}

// Función mejorada para extraer datos de MercadoLibre (REEMPLAZADA)
async function extraerMercadoLibre(page) {
    // Usar la nueva función corregida
    return await extraerMercadoLibreCorregido(page);
}

// Función principal de scraping mejorada
async function scrapearPropiedad(url) {
    const tipoPortal = detectarPortal(url);
    log('info', `🚀 Iniciando scraping de ${tipoPortal} para URL: ${url}`);
    
    const browser = await chromium.launch({ 
        headless: true,
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
        
        log('info', `📱 Navegando a: ${url}`);
        await page.goto(url, { 
            timeout: 30000,
            waitUntil: 'domcontentloaded'
        });
        
        // Usar la nueva función de espera robusta
        await esperarCargaConRetry(page);
        
        let resultado;
        
        switch (tipoPortal) {
            case 'portal_inmobiliario':
                resultado = await extraerPortalInmobiliario(page);
                break;
            case 'mercadolibre':
                resultado = await extraerMercadoLibre(page);
                break;
            default:
                log('warn', '⚠️ Usando extractor genérico para portal desconocido');
                resultado = await extraerGenerico(page);
        }
        
        log('info', '🎉 Scraping completado exitosamente');
        return {
            success: true,
            data: resultado,
            portal: tipoPortal,
            timestamp: new Date().toISOString()
        };
        
    } catch (error) {
        log('error', `💥 Error durante el scraping: ${error.message}`);
        
        return {
            success: false,
            error: error.message,
            portal: tipoPortal,
            timestamp: new Date().toISOString(),
            errorType: error.name || 'UnknownError'
        };
        
    } finally {
        try {
            if (context) {
                await context.close();
            }
            await browser.close();
            log('info', '🔒 Browser y contexto cerrados correctamente');
        } catch (closeError) {
            log('error', `Error cerrando browser: ${closeError.message}`);
        }
    }
}

// Extractor genérico mejorado
async function extraerGenerico(page) {
    log('info', '🔧 Usando extractor genérico...');
    
    await analizarEstructuraPagina(page, 'generico');
    
    const selectoresTitulo = ['h1', 'h2', '[class*="title"]', '[class*="titulo"]'];
    const selectoresPrecio = ['[class*="price"]', '[class*="precio"]', '[class*="valor"]'];
    const selectoresUbicacion = ['[class*="location"]', '[class*="ubicacion"]', '[class*="direccion"]'];
    
    let titulo = 'No disponible';
    for (const selector of selectoresTitulo) {
        titulo = await extraerTextoSeguro(page, selector, `título genérico (${selector})`);
        if (titulo !== 'No disponible') break;
    }
    
    let precio = 'No disponible';
    for (const selector of selectoresPrecio) {
        precio = await extraerTextoSeguro(page, selector, `precio genérico (${selector})`);
        if (precio !== 'No disponible') break;
    }
    
    let ubicacion = 'No disponible';
    for (const selector of selectoresUbicacion) {
        ubicacion = await extraerTextoSeguro(page, selector, `ubicación genérica (${selector})`);
        if (ubicacion !== 'No disponible') break;
    }
    
    const resultado = {
        titulo,
        precio,
        moneda,
        ubicacion,
        dormitorios: 'No disponible',
        banos: 'No disponible',
        superficie: 'No disponible',
        link: page.url(),
        imagen: 'No disponible'
    };
    
    log('info', '✅ Extracción genérica completada:', resultado);
    return resultado;
}

// ===== AGREGAR ESTAS FUNCIONES AQUÍ =====
function validarParametrosSimulacion(monto, plazo) {
    const errores = [];
    
    // Validar monto
    const montoNum = parseFloat(monto);
    if (isNaN(montoNum)) {
        errores.push('El monto debe ser un número válido');
    } else if (montoNum <= 0) {
        errores.push('El monto debe ser mayor a 0');
    } else if (montoNum > 20000) {
        errores.push('El monto no puede ser mayor a 20.000 UF');
    } else if (montoNum < 100) {
        errores.push('El monto debe ser al menos 100 UF');
    }
    
    // Validar plazo
    const plazoNum = parseInt(plazo);
    if (isNaN(plazoNum)) {
        errores.push('El plazo debe ser un número válido');
    } else if (plazoNum <= 0) {
        errores.push('El plazo debe ser mayor a 0');
    } else if (plazoNum > 40) {
        errores.push('El plazo no puede ser mayor a 40 años');
    } else if (plazoNum < 5) {
        errores.push('El plazo debe ser al menos 5 años');
    }
    
    return {
        valido: errores.length === 0,
        errores: errores,
        valores: {
            monto: montoNum,
            plazo: plazoNum
        }
    };
}

// Función para limpiar y formatear los datos extraídos
function limpiarDatosCMF(data) {
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
        detalle: {
            ...banco.detalle,
            valoresUnicaVez: Object.fromEntries(
                Object.entries(banco.detalle.valoresUnicaVez || {}).map(([key, value]) => [
                    key,
                    limpiarTexto(value)
                ])
            ),
            actualizacion: {
                ...banco.detalle.actualizacion,
                entidad: limpiarTexto(banco.detalle.actualizacion?.entidad || ''),
                fecha: limpiarTexto(banco.detalle.actualizacion?.fecha || '')
            }
        }
    }));

    return {
        ...data,
        bancos: bancosLimpios,
        resumenComparativo: {
            ...data.resumenComparativo,
            valorUF: limpiarTexto(data.resumenComparativo.valorUF),
            mejorOferta: bancosLimpios[0] || null
        }
    };
}

// Función para generar análisis comparativo
function generarAnalisisComparativo(data) {
    const bancos = data.bancos;
    
    if (!bancos || bancos.length === 0) {
        return { error: 'No hay datos de bancos para analizar' };
    }

    // Extraer valores numéricos de dividendos
    const dividendos = bancos.map(banco => ({
        banco: banco.banco,
        dividendo: parseFloat(banco.dividendoMensual.replace(/[$.,]/g, '')),
        tasa: parseFloat(banco.tasaCredito.replace(/[%\s\n\t]/g, '').replace(',', '.')),
        cae: parseFloat(banco.cae.replace(/[%\s]/g, '').replace(',', '.'))
    }));

    // Calcular estadísticas
    const dividendosValores = dividendos.map(b => b.dividendo);
    const tasasValores = dividendos.map(b => b.tasa);
    const caeValores = dividendos.map(b => b.cae);

    const stats = {
        dividendos: {
            minimo: Math.min(...dividendosValores),
            maximo: Math.max(...dividendosValores),
            promedio: dividendosValores.reduce((a, b) => a + b, 0) / dividendosValores.length
        },
        tasas: {
            minima: Math.min(...tasasValores),
            maxima: Math.max(...tasasValores),
            promedio: tasasValores.reduce((a, b) => a + b, 0) / tasasValores.length
        }
    };

    // Calcular ahorros
    const diferenciaDividendo = stats.dividendos.maximo - stats.dividendos.minimo;
    const ahorroTotal30Anos = diferenciaDividendo * 12 * 30;

    return {
        estadisticas: {
            totalBancos: bancos.length,
            rangoDividendos: `$${stats.dividendos.minimo.toLocaleString()} - $${stats.dividendos.maximo.toLocaleString()}`,
            rangoTasas: `${stats.tasas.minima.toFixed(2)}% - ${stats.tasas.maxima.toFixed(2)}%`
        },
        potencialAhorro: {
            mensual: `$${diferenciaDividendo.toLocaleString()}`,
            total30Anos: `$${ahorroTotal30Anos.toLocaleString()}`
        }
    };
}

// 4. FUNCIÓN AUXILIAR PARA COMPARAR ESCENARIOS
function generarComparacionEscenarios(escenariosExitosos) {
    try {
        const comparaciones = escenariosExitosos.map(esc => {
            const mejorOferta = esc.resultado.bancos[0];
            return {
                escenario: esc.escenario.etiqueta,
                monto: esc.escenario.monto,
                plazo: esc.escenario.plazo,
                mejorDividendo: mejorOferta ? parseFloat(mejorOferta.dividendoMensual.replace(/[$.,]/g, '')) : 0,
                mejorBanco: mejorOferta ? mejorOferta.banco : 'N/A',
                totalBancos: esc.resultado.bancos.length
            };
        });
        
        // Encontrar el escenario más económico
        const escenarioMasEconomico = comparaciones.reduce((prev, curr) => 
            curr.mejorDividendo < prev.mejorDividendo ? curr : prev
        );
        
        // Calcular diferencias de dividendos
        const diferencias = comparaciones.map(comp => ({
            ...comp,
            diferenciaMensual: comp.mejorDividendo - escenarioMasEconomico.mejorDividendo,
            diferenciaAnual: (comp.mejorDividendo - escenarioMasEconomico.mejorDividendo) * 12
        }));
        
        return {
            escenarioMasEconomico: {
                descripcion: escenarioMasEconomico.escenario,
                banco: escenarioMasEconomico.mejorBanco,
                dividendo: `$${Math.round(escenarioMasEconomico.mejorDividendo).toLocaleString('es-CL')}`
            },
            comparacionDetallada: diferencias.map(diff => ({
                escenario: diff.escenario,
                dividendo: `$${Math.round(diff.mejorDividendo).toLocaleString('es-CL')}`,
                diferenciaMensual: `$${Math.round(diff.diferenciaMensual).toLocaleString('es-CL')}`,
                diferenciaAnual: `$${Math.round(diff.diferenciaAnual).toLocaleString('es-CL')}`,
                banco: diff.mejorBanco
            })),
            recomendacion: `El escenario más económico es ${escenarioMasEconomico.escenario} con ${escenarioMasEconomico.mejorBanco}`
        };
    } catch (error) {
        return {
            error: `Error generando comparación: ${error.message}`
        };
    }
}

// ===== ENDPOINTS =====

// Endpoint original para scraping de URLs individuales
app.post('/scrape-property', async (req, res) => {
    try {
        const { url } = req.body;
        
        if (!url) {
            return res.status(400).json({
                success: false,
                error: 'URL es requerida'
            });
        }
        
        try {
            new URL(url);
        } catch {
            return res.status(400).json({
                success: false,
                error: 'URL inválida'
            });
        }
        
        log('info', `🌐 Nueva solicitud de scraping recibida: ${url}`);
        const resultado = await scrapearPropiedad(url);
        
        res.json(resultado);
        
    } catch (error) {
        log('error', `💥 Error en el endpoint: ${error.message}`);
        res.status(500).json({
            success: false,
            error: 'Error interno del servidor',
            timestamp: new Date().toISOString()
        });
    }
});

// NUEVO ENDPOINT para búsqueda parametrizada
app.post('/search-properties', async (req, res) => {
    try {
        const { tipo, operacion, ubicacion, maxPaginas } = req.body;
        
        // Validar parámetros requeridos
        if (!tipo || !operacion || !ubicacion) {
            return res.status(400).json({
                success: false,
                error: 'Los parámetros tipo, operacion y ubicacion son requeridos',
                parametros_requeridos: {
                    tipo: 'Casa o Departamento',
                    operacion: 'Venta o Arriendo',
                    ubicacion: 'Nombre de la ubicación/comuna',
                    maxPaginas: 'Número opcional (por defecto 3, máximo 3)'
                }
            });
        }
        
        // Validar valores de tipo
        if (!['Casa', 'Departamento'].includes(tipo)) {
            return res.status(400).json({
                success: false,
                error: 'El parámetro tipo debe ser "Casa" o "Departamento"'
            });
        }
        
        // Validar valores de operacion
        if (!['Venta', 'Arriendo'].includes(operacion)) {
            return res.status(400).json({
                success: false,
                error: 'El parámetro operacion debe ser "Venta" o "Arriendo"'
            });
        }
        
        // Validar maxPaginas
        const maxPaginasNum = maxPaginas ? parseInt(maxPaginas) : 3;
        if (maxPaginasNum < 1 || maxPaginasNum > 3) {
            return res.status(400).json({
                success: false,
                error: 'El parámetro maxPaginas debe ser un número entre 1 y 3'
            });
        }
        
        log('info', `🔍 Nueva solicitud de búsqueda: ${operacion} de ${tipo} en ${ubicacion} (${maxPaginasNum} páginas)`);
        
        const resultado = await buscarPropiedades(tipo, operacion, ubicacion, maxPaginasNum);
        
        res.json(resultado);
        
    } catch (error) {
        log('error', `💥 Error en endpoint de búsqueda: ${error.message}`);
        res.status(500).json({
            success: false,
            error: 'Error interno del servidor',
            timestamp: new Date().toISOString()
        });
    }
});

// Endpoint GET para búsqueda parametrizada (query parameters)
app.get('/search-properties', async (req, res) => {
    try {
        const { tipo, operacion, ubicacion, maxPaginas } = req.query;
        
        // Validar parámetros requeridos
        if (!tipo || !operacion || !ubicacion) {
            return res.status(400).json({
                success: false,
                error: 'Los parámetros tipo, operacion y ubicacion son requeridos',
                ejemplo: '/search-properties?tipo=Casa&operacion=Venta&ubicacion=Las Condes&maxPaginas=2'
            });
        }
        
        // Validar valores de tipo
        if (!['Casa', 'Departamento'].includes(tipo)) {
            return res.status(400).json({
                success: false,
                error: 'El parámetro tipo debe ser "Casa" o "Departamento"'
            });
        }
        
        // Validar valores de operacion
        if (!['Venta', 'Arriendo'].includes(operacion)) {
            return res.status(400).json({
                success: false,
                error: 'El parámetro operacion debe ser "Venta" o "Arriendo"'
            });
        }
        
        // Validar maxPaginas
        const maxPaginasNum = maxPaginas ? parseInt(maxPaginas) : 3;
        if (maxPaginasNum < 1 || maxPaginasNum > 3) {
            return res.status(400).json({
                success: false,
                error: 'El parámetro maxPaginas debe ser un número entre 1 y 3'
            });
        }
        
        log('info', `🔍 Nueva solicitud GET de búsqueda: ${operacion} de ${tipo} en ${ubicacion} (${maxPaginasNum} páginas)`);
        
        const resultado = await buscarPropiedades(tipo, operacion, ubicacion, maxPaginasNum);
        
        res.json(resultado);
        
    } catch (error) {
        log('error', `💥 Error en endpoint GET de búsqueda: ${error.message}`);
        res.status(500).json({
            success: false,
            error: 'Error interno del servidor',
            timestamp: new Date().toISOString()
        });
    }
});

// NUEVO ENDPOINT para simulador de crédito hipotecario CMF
app.post('/simulate-mortgage', async (req, res) => {
    try {
        const { monto, plazo, incluirAnalisis } = req.body;
        
        // Validar parámetros requeridos
        if (!monto || !plazo) {
            return res.status(400).json({
                success: false,
                error: 'Los parámetros monto y plazo son requeridos',
                parametros_requeridos: {
                    monto: 'Número en UF (ejemplo: 3000)',
                    plazo: 'Número de años (ejemplo: 30)'
                },
                ejemplo: {
                    monto: 3000,
                    plazo: 30
                }
            });
        }
        
        // Validar que monto sea numérico y esté en rango válido
        const montoNum = parseFloat(monto);
        if (isNaN(montoNum) || montoNum <= 0 || montoNum > 20000) {
            return res.status(400).json({
                success: false,
                error: 'El monto debe ser un número entre 1 y 20000 UF'
            });
        }
        
        // Validar que plazo sea numérico y esté en rango válido
        const plazoNum = parseInt(plazo);
        if (isNaN(plazoNum) || plazoNum <= 0 || plazoNum > 40) {
            return res.status(400).json({
                success: false,
                error: 'El plazo debe ser un número entre 1 y 40 años'
            });
        }
        
        log('info', `🏦 Nueva solicitud de simulación: ${montoNum} UF por ${plazoNum} años`);
        
        const resultado = await simularCreditoHipotecario(montoNum, plazoNum);

           // AGREGAR ESTA LÍNEA - Limpiar datos si la simulación fue exitosa
        if (resultado.success) {
            resultado.data = limpiarDatosCMF(resultado.data);

             // AGREGAR ANÁLISIS SI SE SOLICITA
            if (incluirAnalisis) {
                resultado.analisis = generarAnalisisComparativo(resultado.data);
            }
        }
        
        res.json(resultado);
        
    } catch (error) {
        log('error', `💥 Error en endpoint de simulación: ${error.message}`);
        res.status(500).json({
            success: false,
            error: 'Error interno del servidor',
            timestamp: new Date().toISOString()
        });
    }
});

// Endpoint GET para simulador de crédito hipotecario (query parameters)
app.get('/simulate-mortgage', async (req, res) => {
    try {
        const { monto, plazo } = req.query;
        
        // Validar parámetros requeridos
        if (!monto || !plazo) {
            return res.status(400).json({
                success: false,
                error: 'Los parámetros monto y plazo son requeridos',
                ejemplo: '/simulate-mortgage?monto=3000&plazo=30'
            });
        }
        
        // Validar que monto sea numérico y esté en rango válido
        const montoNum = parseFloat(monto);
        if (isNaN(montoNum) || montoNum <= 0 || montoNum > 20000) {
            return res.status(400).json({
                success: false,
                error: 'El monto debe ser un número entre 1 y 20000 UF'
            });
        }
        
        // Validar que plazo sea numérico y esté en rango válido
        const plazoNum = parseInt(plazo);
        if (isNaN(plazoNum) || plazoNum <= 0 || plazoNum > 40) {
            return res.status(400).json({
                success: false,
                error: 'El plazo debe ser un número entre 1 y 40 años'
            });
        }
        
        log('info', `🏦 Nueva solicitud GET de simulación: ${montoNum} UF por ${plazoNum} años`);
        
        const resultado = await simularCreditoHipotecario(montoNum, plazoNum);
        
        res.json(resultado);
        
    } catch (error) {
        log('error', `💥 Error en endpoint GET de simulación: ${error.message}`);
        res.status(500).json({
            success: false,
            error: 'Error interno del servidor',
            timestamp: new Date().toISOString()
        });
    }
});

// Endpoint original GET (mantener compatibilidad)
app.get('/scrape-property', async (req, res) => {
    const { url } = req.query;
    
    if (!url) {
        return res.status(400).json({
            success: false,
            error: 'URL es requerida como query parameter'
        });
    }
    
    try {
        new URL(url);
    } catch {
        return res.status(400).json({
            success: false,
            error: 'URL inválida'
        });
    }
    
    log('info', `🌐 Nueva solicitud GET de scraping: ${url}`);
    const resultado = await scrapearPropiedad(url);
    
    res.json(resultado);
});

// ===== NUEVOS ENDPOINTS AVANZADOS =====
// Agregar estos endpoints DESPUÉS de tu endpoint /simulate-mortgage existente

// 1. ENDPOINT MEJORADO CON ANÁLISIS Y EXPORTACIÓN
app.post('/simulate-mortgage-enhanced', async (req, res) => {
    try {
        const { monto, plazo, formato, incluirAnalisis } = req.body;
        
        log('info', `🚀 Nueva solicitud de simulación mejorada: ${monto} UF por ${plazo} años`);
        
        // Validar parámetros usando función mejorada
        const validacion = validarParametrosSimulacion(monto, plazo);
        
        if (!validacion.valido) {
            return res.status(400).json({
                success: false,
                error: 'Parámetros inválidos',
                errores: validacion.errores,
                ayuda: {
                    monto: 'Debe ser un número entre 100 y 20.000 UF',
                    plazo: 'Debe ser un número entre 5 y 40 años'
                }
            });
        }
        
        const { monto: montoNum, plazo: plazoNum } = validacion.valores;
        
        // Ejecutar simulación
        const resultado = await simularCreditoHipotecario(montoNum, plazoNum);
        
        if (!resultado.success) {
            return res.json(resultado);
        }
        
        // Limpiar datos
        const datosLimpios = limpiarDatosCMF(resultado.data);
        
        // Generar análisis si se solicita
        let analisis = null;
        if (incluirAnalisis !== false) { // Por defecto incluir análisis
            analisis = generarAnalisisComparativo(datosLimpios);
        }
        
        // Preparar respuesta base
        const respuesta = {
            success: true,
            data: datosLimpios,
            metadata: {
                parametros: {
                    monto: `${montoNum} UF`,
                    plazo: `${plazoNum} años`,
                    montoEnPesos: datosLimpios.resumenComparativo.valorUF ? 
                        `$${Math.round(montoNum * parseFloat(datosLimpios.resumenComparativo.valorUF.match(/[\d,]+/)?.[0]?.replace(',', '') || 0)).toLocaleString('es-CL')}` : 
                        'No disponible'
                },
                procesamiento: {
                    timestamp: new Date().toISOString(),
                    bancosEncontrados: datosLimpios.bancos.length,
                    valorUF: datosLimpios.resumenComparativo.valorUF,
                    tiempoRespuesta: 'Datos en tiempo real del CMF'
                }
            }
        };
        
        // Agregar análisis si se generó
        if (analisis && !analisis.error) {
            respuesta.analisis = analisis;
        } else if (analisis && analisis.error) {
            respuesta.advertencia = `Análisis no disponible: ${analisis.error}`;
        }
        
        // Exportar en formato solicitado
        if (formato && formato !== 'json') {
            try {
                const datosExportados = exportarDatos(datosLimpios, formato);
                respuesta.exportacion = {
                    formato: formato,
                    datos: datosExportados,
                    instrucciones: formato === 'csv' ? 
                        'Puedes copiar los datos CSV y pegarlos en Excel o Google Sheets' :
                        'Datos exportados en el formato solicitado'
                };
            } catch (exportError) {
                respuesta.advertencia = `Error en exportación: ${exportError.message}`;
            }
        }
        
        res.json(respuesta);
        
    } catch (error) {
        log('error', `💥 Error en simulación mejorada: ${error.message}`);
        res.status(500).json({
            success: false,
            error: 'Error interno del servidor',
            mensaje: 'Ocurrió un error procesando la simulación',
            timestamp: new Date().toISOString()
        });
    }
});

// 2. ENDPOINT PARA COMPARAR MÚLTIPLES ESCENARIOS
app.post('/compare-scenarios', async (req, res) => {
    try {
        const { escenarios, incluirAnalisis } = req.body;
        
        log('info', `📊 Nueva solicitud de comparación de escenarios: ${escenarios?.length || 0} escenarios`);
        
        // Validaciones
        if (!escenarios || !Array.isArray(escenarios)) {
            return res.status(400).json({
                success: false,
                error: 'Se requiere un array de escenarios',
                ejemplo: {
                    escenarios: [
                        { monto: 3000, plazo: 20 },
                        { monto: 3000, plazo: 30 },
                        { monto: 4000, plazo: 30 }
                    ]
                }
            });
        }
        
        if (escenarios.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Debe incluir al menos un escenario'
            });
        }
        
        if (escenarios.length > 5) {
            return res.status(400).json({
                success: false,
                error: 'Máximo 5 escenarios por comparación para evitar sobrecarga del servidor CMF'
            });
        }
        
        // Validar cada escenario
        const erroresValidacion = [];
        escenarios.forEach((escenario, index) => {
            if (!escenario.monto || !escenario.plazo) {
                erroresValidacion.push(`Escenario ${index + 1}: monto y plazo son requeridos`);
            } else {
                const validacion = validarParametrosSimulacion(escenario.monto, escenario.plazo);
                if (!validacion.valido) {
                    erroresValidacion.push(`Escenario ${index + 1}: ${validacion.errores.join(', ')}`);
                }
            }
        });
        
        if (erroresValidacion.length > 0) {
            return res.status(400).json({
                success: false,
                error: 'Errores en los escenarios',
                errores: erroresValidacion
            });
        }
        
        const resultados = [];
        let escenariosProcesados = 0;
        
        for (const [index, escenario] of escenarios.entries()) {
            try {
                log('info', `🔄 Procesando escenario ${index + 1}/${escenarios.length}: ${escenario.monto} UF x ${escenario.plazo} años`);
                
                const resultado = await simularCreditoHipotecario(escenario.monto, escenario.plazo);
                
                if (resultado.success) {
                    const datosLimpios = limpiarDatosCMF(resultado.data);
                    
                    const resultadoEscenario = {
                        escenario: {
                            numero: index + 1,
                            monto: escenario.monto,
                            plazo: escenario.plazo,
                            etiqueta: escenario.etiqueta || `${escenario.monto} UF x ${escenario.plazo} años`
                        },
                        resultado: datosLimpios,
                        resumen: {
                            mejorOferta: datosLimpios.bancos[0] ? {
                                banco: datosLimpios.bancos[0].banco,
                                dividendo: datosLimpios.bancos[0].dividendoMensual,
                                tasa: datosLimpios.bancos[0].tasaCredito
                            } : null,
                            totalBancos: datosLimpios.bancos.length
                        }
                    };
                    
                    // Generar análisis si se solicita
                    if (incluirAnalisis !== false) {
                        const analisis = generarAnalisisComparativo(datosLimpios);
                        if (!analisis.error) {
                            resultadoEscenario.analisis = analisis;
                        }
                    }
                    
                    resultados.push(resultadoEscenario);
                    escenariosProcesados++;
                } else {
                    resultados.push({
                        escenario: {
                            numero: index + 1,
                            monto: escenario.monto,
                            plazo: escenario.plazo,
                            etiqueta: escenario.etiqueta || `${escenario.monto} UF x ${escenario.plazo} años`
                        },
                        error: resultado.error,
                        mensaje: 'Error procesando este escenario'
                    });
                }
                
                // Pausa entre simulaciones para no sobrecargar el servidor CMF
                if (index < escenarios.length - 1) {
                    log('debug', 'Esperando 3 segundos antes del siguiente escenario...');
                    await new Promise(resolve => setTimeout(resolve, 3000));
                }
                
            } catch (error) {
                log('error', `Error en escenario ${index + 1}: ${error.message}`);
                resultados.push({
                    escenario: {
                        numero: index + 1,
                        monto: escenario.monto,
                        plazo: escenario.plazo,
                        etiqueta: escenario.etiqueta || `${escenario.monto} UF x ${escenario.plazo} años`
                    },
                    error: error.message,
                    mensaje: 'Error técnico procesando este escenario'
                });
            }
        }
        
        // Generar comparación entre escenarios exitosos
        const escenariosExitosos = resultados.filter(r => !r.error);
        let comparacionGeneral = null;
        
        if (escenariosExitosos.length > 1) {
            try {
                comparacionGeneral = generarComparacionEscenarios(escenariosExitosos);
            } catch (error) {
                log('warn', `Error generando comparación general: ${error.message}`);
            }
        }
        
        res.json({
            success: true,
            comparacion: {
                escenarios: resultados,
                resumen: {
                    totalEscenarios: escenarios.length,
                    escenariosProcesados: escenariosProcesados,
                    escenariosConError: escenarios.length - escenariosProcesados
                },
                comparacionGeneral: comparacionGeneral
            },
            metadata: {
                timestamp: new Date().toISOString(),
                tiempoProcesamiento: `Aproximadamente ${escenarios.length * 30} segundos`,
                nota: 'Los datos son obtenidos en tiempo real del simulador oficial CMF'
            }
        });
        
    } catch (error) {
        log('error', `💥 Error en comparación de escenarios: ${error.message}`);
        res.status(500).json({
            success: false,
            error: 'Error interno del servidor',
            mensaje: 'Error procesando la comparación de escenarios',
            timestamp: new Date().toISOString()
        });
    }
});

// Actualizar el endpoint /health existente
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'API de Scraping de Propiedades y Simulador Hipotecario CMF funcionando correctamente',
        timestamp: new Date().toISOString(),
        version: '4.0.0-enhanced-cmf-simulator',
        endpoints: {
            // Tus endpoints existentes...
            'POST /simulate-mortgage': 'Simulación básica de crédito hipotecario',
            'POST /simulate-mortgage-enhanced': 'Simulación avanzada con análisis y exportación',
            'POST /compare-scenarios': 'Comparación de múltiples escenarios',
            'GET /simulator-info': 'Información detallada del simulador',
            'GET /health': 'Health check'
        },
        nuevasFuncionalidades: {
            'Análisis automático': 'Estadísticas y potencial de ahorro',
            'Exportación CSV': 'Datos exportables para Excel',
            'Comparación de escenarios': 'Hasta 5 escenarios simultáneos',
            'Validación mejorada': 'Mensajes de error más descriptivos',
            'Limpieza de datos': 'Formato consistente de respuestas'
        }
    });
});

// 3. ENDPOINT PARA OBTENER INFORMACIÓN DEL SIMULADOR
app.get('/simulator-info', (req, res) => {
    try {
        res.json({
            success: true,
            informacion: {
                nombre: 'Simulador de Crédito Hipotecario CMF',
                version: '1.0.0',
                descripcion: 'API para simular créditos hipotecarios usando datos oficiales de la Comisión para el Mercado Financiero de Chile',
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
                    '/simulate-mortgage': 'Simulación básica',
                    '/simulate-mortgage-enhanced': 'Simulación con análisis y exportación',
                    '/compare-scenarios': 'Comparación de múltiples escenarios',
                    '/simulator-info': 'Información del simulador'
                },
                formatosExportacion: ['json', 'csv', 'resumen'],
                datosIncluidos: [
                    'Dividendo mensual por banco',
                    'Tasas de interés y CAE',
                    'Costos por única vez',
                    'Detalles de seguros',
                    'Fechas de actualización',
                    'Análisis comparativo',
                    'Potencial de ahorro'
                ]
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Error obteniendo información del simulador'
        });
    }
});

app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint no encontrado',
        endpoints_disponibles: [
            'POST /scrape-property',
            'GET /scrape-property',
            'POST /search-properties',
            'GET /search-properties',
            'POST /simulate-mortgage',
            'GET /simulate-mortgage',
            'GET /health'
        ]
    });
});

app.listen(PORT, () => {
    log('info', `🏠 API de Scraping de Propiedades y Simulador Hipotecario ejecutándose en puerto ${PORT}`);
    log('info', `📍 Health check: http://localhost:${PORT}/health`);
    log('info', `🔍 Scraping individual: POST http://localhost:${PORT}/scrape-property`);
    log('info', `🔍 Búsqueda parametrizada: POST http://localhost:${PORT}/search-properties`);
    log('info', `🏦 Simulador hipotecario: POST http://localhost:${PORT}/simulate-mortgage`);
    log('info', `📖 Ejemplos de uso:`);
    log('info', `   POST /search-properties {"tipo":"Casa","operacion":"Venta","ubicacion":"Las Condes","maxPaginas":2}`);
    log('info', `   GET  /search-properties?tipo=Departamento&operacion=Arriendo&ubicacion=Providencia&maxPaginas=1`);
    log('info', `   POST /simulate-mortgage {"monto":3000,"plazo":30}`);
    log('info', `   GET  /simulate-mortgage?monto=3000&plazo=30`);
});

module.exports = app;