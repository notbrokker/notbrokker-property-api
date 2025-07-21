// src/services/anthropic/AnthropicService.js
const { logInfo, logError, logDebug, logWarn } = require('../../utils/logger');
const { ErrorFactory } = require('../../utils/errors');
const ClaudeApiHelper = require('./ClaudeApiHelper');

// Importar servicios existentes para orquestación
const ScrapingService = require('../scraping/ScrapingService');
const SearchService = require('../search/SearchService');
const MortgageService = require('../mortgage/MortgageService');
const AnthropicConfig = require('./AnthropicConfig');

/**
 * Servicio de orquestación e integración con Anthropic Claude - VERSION REAL
 * Genera reportes completos de análisis financiero inmobiliario usando Claude API
 */
class AnthropicService {

    /**
     * ✅ MANTENER: Generar reporte completo de análisis financiero inmobiliario
     */
    static async generateFinancialReport(propertyUrl, options = {}) {
        logInfo('🚀 Iniciando generación de reporte financiero con Claude API', {
            propertyUrl,
            options
        });

        try {
            // 1. VALIDAR URL DE PROPIEDAD
            const validationResult = await this.validatePropertyUrl(propertyUrl);
            if (!validationResult.valid) {
                throw ErrorFactory.validation(validationResult.reason, 'propertyUrl');
            }

            // 2. PROBAR CONEXIÓN CON CLAUDE (opcional, solo en development)
            if (process.env.NODE_ENV === 'development') {
                const connectionTest = await ClaudeApiHelper.testConnection();
                if (!connectionTest.success) {
                    logInfo('⚠️ Claude API no disponible, usando análisis de fallback');
                }
            }

            // 3. ORQUESTAR FLUJO DE SERVICIOS - ACTUALIZADO CON VALIDACIÓN DE MONTO
            const orchestrationStart = Date.now();

            // PASO 3A: Obtener datos de propiedad PRIMERO (necesarios para validaciones)
            logInfo('📊 Paso 1: Obteniendo datos de propiedad para validaciones');
            const propertyDataResult = await Promise.allSettled([
                this.getPropertyData(propertyUrl)
            ]);

            // Extraer datos de propiedad para usar en siguientes pasos
            let scrapedPropertyData = null;
            if (propertyDataResult[0].status === 'fulfilled') {
                scrapedPropertyData = propertyDataResult[0].value;
                logInfo('✅ Datos de propiedad obtenidos para validaciones', {
                    precio_uf: scrapedPropertyData?.precio_uf,
                    dormitorios: scrapedPropertyData?.dormitorios,
                    banos: scrapedPropertyData?.banos,
                    superficie: scrapedPropertyData?.superficie
                });
            } else {
                logWarn('⚠️ Error obteniendo datos de propiedad', {
                    error: propertyDataResult[0].reason?.message
                });
            }

            // PASO 3B: Ejecutar servicios restantes con datos validados
            logInfo('📊 Paso 2: Ejecutando búsqueda y análisis hipotecario con datos validados');
            const [
                comparableProperties,
                mortgageAnalysis
            ] = await Promise.allSettled([
                this.getComparableProperties(propertyUrl, options, scrapedPropertyData),
                this.getMortgageAnalysis(options.propertyPrice || null, scrapedPropertyData)
            ]);

            const orchestrationTime = Date.now() - orchestrationStart;
            logInfo('⚡ Orquestación de servicios completada', {
                duration: `${orchestrationTime}ms`
            });

            // 4. PROCESAR RESULTADOS - Reconstruir estructura esperada
            const orchestrationData = this.processOrchestrationResults({
                propertyData: propertyDataResult[0],
                comparableProperties,
                mortgageAnalysis
            });

            // 5. ✅ CORREGIDO: Preparar datos para Claude con estructura corregida
            const claudeInputData = this.prepareDataForClaude(orchestrationData, options);

            // 6. ✅ CORREGIDO: Generar análisis con Claude API 
            const claudeAnalysis = await this.generateClaudeAnalysis(claudeInputData);

            // 7. ✅ CORREGIDO: Construir respuesta final con nueva estructura
            const finalReport = this.buildFinalReport(orchestrationData, claudeAnalysis, options);

            const totalTime = Date.now() - (options.startTime || Date.now());
            logInfo('✅ Reporte financiero generado exitosamente', {
                totalTime: `${totalTime}ms`,
                orchestrationTime: `${orchestrationTime}ms`,
                claudeUsed: claudeAnalysis.success && !claudeAnalysis.metadata?.fallbackUsed,
                dataQuality: orchestrationData.overallQuality
            });

            return finalReport;

        } catch (error) {
            logError('Error generando reporte financiero inmobiliario', error);
            throw error;
        }
    }

    // ✅ MANTENER TODOS: Métodos de validación y orquestación existentes
    static async validatePropertyUrl(url) {
        try {
            logDebug('🔍 Validando URL de propiedad', { url: url.substring(0, 50) + '...' });

            let parsedUrl;
            try {
                parsedUrl = new URL(url);
            } catch (error) {
                return {
                    valid: false,
                    reason: 'URL malformada o inválida'
                };
            }

            const domain = parsedUrl.hostname.toLowerCase();
            const supportedDomains = AnthropicConfig.validation.supportedDomains;

            if (!supportedDomains.some(supportedDomain => domain.includes(supportedDomain))) {
                return {
                    valid: false,
                    reason: `Dominio ${domain} no es soportado para análisis financiero`
                };
            }

            const validation = ScrapingService.validarURL(url);
            if (!validation.valida) {
                return {
                    valid: false,
                    reason: validation.razon
                };
            }

            const portal = ScrapingService.detectarPortal(url);
            const supportedPortals = ['mercadolibre', 'portal_inmobiliario'];

            if (!supportedPortals.includes(portal)) {
                return {
                    valid: false,
                    reason: `Portal ${portal} no es completamente soportado para análisis financiero`
                };
            }

            logDebug('✅ URL validada correctamente', { portal });
            return {
                valid: true,
                portal
            };

        } catch (error) {
            logError('Error validando URL de propiedad', { error: error.message });
            return {
                valid: false,
                reason: `Error de validación: ${error.message}`
            };
        }
    }

    /**
     * ✅ NUEVO: Calcular gastos operacionales MENSUALES (recurrentes)
     * Solo gastos que se pagan CADA MES durante la operación
     */
    static calculateMonthlyOperationalExpenses(valorPropiedadPesos, arriendoEstimado, usaCorretor = false, incluyeGastosComunes = false) {
        try {
            logInfo('📊 Calculando gastos operacionales MENSUALES recurrentes');

            const precioUF = 39250;

            // ✅ GASTOS QUE SE PAGAN CADA MES
            const contribuciones = Math.round((valorPropiedadPesos * 0.001148) / 12); // 1.148% anual / 12
            const mantenciones = Math.round((precioUF * 4) / 12); // UF 4 anuales / 12
            const comisionAdministracion = usaCorretor ? Math.round(arriendoEstimado * 0.08) : 0; // 8% si usa corredor
            const vacancia = Math.round(arriendoEstimado * 0.05); // 5% provisión vacancia
            const seguroPropiedad = Math.round((precioUF * 1.2) / 12); // UF 1.2 anuales / 12
            const gastosComunes = incluyeGastosComunes ? 80000 : 0; // Solo si propietario los paga
            const fondoReparaciones = 50000; // Provisión emergencias

            const totalMensual = contribuciones + mantenciones + comisionAdministracion +
                vacancia + seguroPropiedad + gastosComunes + fondoReparaciones;

            const desglose = {
                total: totalMensual,
                conceptos: {
                    contribuciones: {
                        valor: contribuciones,
                        descripcion: 'Contribuciones territoriales (prorrateadas)',
                        calculo: '1.148% anual del avalúo / 12',
                        tipoGasto: 'MENSUAL',
                        frecuencia: 'Trimestral (prorrateado)'
                    },
                    mantenciones: {
                        valor: mantenciones,
                        descripcion: 'Mantenciones y reparaciones menores',
                        calculo: 'UF 4 anuales / 12 meses',
                        tipoGasto: 'MENSUAL',
                        frecuencia: 'Según necesidad'
                    },
                    comisionAdministracion: {
                        valor: comisionAdministracion,
                        descripcion: 'Comisión administración inmobiliaria',
                        calculo: usaCorretor ? '8% del arriendo mensual' : 'No aplica',
                        tipoGasto: 'MENSUAL',
                        aplicaSolo: usaCorretor ? 'Con corredor' : 'Autogestión'
                    },
                    vacancia: {
                        valor: vacancia,
                        descripcion: 'Provisión por períodos de vacancia',
                        calculo: '5% del arriendo (provisión)',
                        tipoGasto: 'MENSUAL',
                        frecuencia: 'Provisión continua'
                    },
                    seguroPropiedad: {
                        valor: seguroPropiedad,
                        descripcion: 'Seguro contra incendio y sismo',
                        calculo: 'UF 1.2 anuales / 12 meses',
                        tipoGasto: 'MENSUAL',
                        frecuencia: 'Anual (prorrateado)'
                    },
                    gastosComunes: {
                        valor: gastosComunes,
                        descripcion: 'Gastos comunes del edificio',
                        calculo: incluyeGastosComunes ? 'Estimado $80,000' : 'No aplica',
                        tipoGasto: 'MENSUAL',
                        aplicaSolo: incluyeGastosComunes ? 'Propietario paga' : 'Arrendatario paga'
                    },
                    fondoReparaciones: {
                        valor: fondoReparaciones,
                        descripcion: 'Fondo para reparaciones e imprevistos',
                        calculo: 'Provisión fija $50,000',
                        tipoGasto: 'MENSUAL',
                        frecuencia: 'Provisión continua'
                    }
                }
            };

            logInfo('💰 Gastos operacionales MENSUALES calculados', {
                totalMensual: this.formatCurrency(totalMensual),
                contribuciones: this.formatCurrency(contribuciones),
                usaCorretor,
                incluyeGastosComunes
            });

            return desglose;

        } catch (error) {
            logError('❌ Error calculando gastos operacionales mensuales', error);
            return {
                total: Math.round(arriendoEstimado * 0.13), // 13% del arriendo como fallback
                conceptos: {},
                error: 'Usado cálculo simplificado (13% del arriendo)'
            };
        }
    }

    // ✅ MANTENER: Todos los métodos de obtención de datos
    static async getPropertyData(propertyUrl) {
        try {
            logInfo('🏠 Obteniendo datos de la propiedad', { propertyUrl });

            const scrapingResult = await ScrapingService.scrapeProperty(propertyUrl);

            if (!scrapingResult.success) {
                throw new Error('Error en scraping de propiedad');
            }

            logInfo('✅ Datos de propiedad obtenidos', {
                titulo: scrapingResult.data.titulo?.substring(0, 50) + '...',
                precio: scrapingResult.data.precio_uf,
                ubicacion: scrapingResult.data.ubicacion?.substring(0, 30) + '...'
            });

            return scrapingResult.data;

        } catch (error) {
            logError('Error obteniendo datos de propiedad', { error: error.message });
            throw error;
        }
    }

    /**
 * ✅ NUEVO MÉTODO: extractTasacionFromMortgage
 * Extrae tasación desde mortgage.escenarios[x].resultado.resumenComparativo.mejorOferta.detalle.valoresUnicaVez
 */
    static extractTasacionFromMortgage(mortgageData) {
        if (!mortgageData?.escenarios) {
            throw new Error('No mortgage data available');
        }

        // Buscar en todos los escenarios
        for (const escenario of mortgageData.escenarios) {
            const detalle = escenario?.resultado?.resumenComparativo?.mejorOferta?.detalle;
            if (detalle?.valoresUnicaVez?.Tasación) {
                const tasacionTexto = detalle.valoresUnicaVez.Tasación;

                // Extraer valor en pesos: "UF 2,98 (equivale a $116.920)"
                const matchPesos = tasacionTexto.match(/\$?([\d.,]+)/);
                if (matchPesos) {
                    const valor = this.parseChileanNumber(matchPesos[1]);
                    if (valor > 0) {
                        logDebug('✅ Tasación extraída desde mortgage data', {
                            escenario: escenario.escenario?.plazo,
                            tasacionTexto,
                            valorExtraido: this.formatCurrency(valor)
                        });
                        return valor;
                    }
                }
            }
        }

        throw new Error('Tasación no encontrada en mortgage data');
    }

    /**
     * ✅ MÉTODO CORREGIDO: extractTasacionSafely 
     */
    static extractTasacionSafely(mortgageData, precioUF) {
        try {
            const extractedValue = this.extractTasacionFromMortgage(mortgageData);
            if (extractedValue && extractedValue > 0) {
                return {
                    valor: extractedValue,
                    descripcion: 'Tasación de la propiedad',
                    fuente: 'mortgage_data_real', // ✅ ACTUALIZADO
                    rango: '$60,000 - $150,000'
                };
            }
        } catch (error) {
            logDebug('ℹ️ Usando fallback para tasación', { error: error.message });
        }

        // Fallback
        const defaultValue = Math.round(precioUF * 2.5);
        return {
            valor: defaultValue,
            descripcion: 'Tasación de la propiedad',
            fuente: 'default_calculation',
            rango: '$60,000 - $150,000'
        };
    }

    /**
 * ✅ MÉTODO CORREGIDO: Eliminar scraping duplicado y garantizar uso de ubicación real
 */
    static async getComparableProperties(propertyUrl, options = {}, propertyData = null) {
        try {
            logInfo('🔍 Buscando propiedades comparables con ubicación corregida');

            // ✅ CRÍTICO: NO hacer scraping duplicado - confiar en propertyData recibido
            if (!propertyData) {
                throw new Error('getComparableProperties requiere propertyData válido - no debe hacer scraping duplicado');
            }

            logInfo('✅ Usando propertyData validado previamente', {
                titulo: propertyData.titulo?.substring(0, 50),
                ubicacionReal: propertyData.ubicacion,
                dormitorios: propertyData.dormitorios,
                banos: propertyData.banos,
                superficie: propertyData.superficie,
                fuente: 'GARANTIZADA_POR_CALLER'
            });

            // ✅ 2. EXTRAER PARÁMETROS USANDO DATOS REALES GARANTIZADOS
            const searchParams = this.extractSearchParamsFromProperty(propertyUrl, options, propertyData);
            const maxPaginas = Math.min(options.maxComparables || 2, 3);
            const filtrosValidados = this.buildValidatedFilters(propertyData, options);

            // ✅ 3. VALIDACIÓN CRÍTICA: Verificar que la ubicación sea correcta
            const verificacion = this.verifyLocationConsistency(propertyData.ubicacion, searchParams.ubicacion);
            if (!verificacion.isConsistent) {
                logWarn('⚠️ Inconsistencia de ubicación detectada y corregida', verificacion);

                // ✅ CORRECCIÓN AUTOMÁTICA: Si hay inconsistencia, usar la ubicación real directamente
                searchParams.ubicacion = this.parseRealLocation(propertyData.ubicacion);
                logInfo('🔧 Ubicación corregida automáticamente', {
                    original: verificacion.searchLocation,
                    corregida: searchParams.ubicacion,
                    fuente: 'propertyData.ubicacion'
                });
            }

            logInfo('🎯 Búsqueda de comparables con parámetros corregidos', {
                propertyLocation: propertyData.ubicacion,
                searchLocation: searchParams.ubicacion,
                searchParams: {
                    tipo: searchParams.tipo,
                    operacion: searchParams.operacion
                },
                filtrosValidados: Object.keys(filtrosValidados || {}),
                basadoEnDatosReales: true, // ✅ Siempre true ahora
                scrapingDuplicadoEliminado: true
            });

            // ✅ 4. EJECUTAR BÚSQUEDA CON PARÁMETROS CORREGIDOS
            const searchResult = await SearchService.searchProperties(
                searchParams.tipo,
                searchParams.operacion,
                searchParams.ubicacion,  // ✅ Ahora usa ubicación real GARANTIZADA
                maxPaginas,
                searchParams.filtrosPrecio,
                filtrosValidados
            );

            if (!searchResult.success) {
                throw new Error('Error en búsqueda de propiedades comparables');
            }

            const limitedProperties = searchResult.data.slice(0, AnthropicConfig.defaults.searchOptions.maxComparables);

            logInfo('✅ Propiedades comparables obtenidas con ubicación REAL GARANTIZADA', {
                total: searchResult.data.length,
                limitedTo: limitedProperties.length,
                ubicacionBuscada: searchParams.ubicacion,
                ubicacionOriginal: propertyData.ubicacion,
                operacion: searchParams.operacion,
                filtrosAplicados: Object.keys(filtrosValidados || {}),
                locationConsistency: verificacion.isConsistent ? 'CONSISTENTE' : 'CORREGIDA_AUTOMATICAMENTE'
            });

            return {
                properties: limitedProperties,
                metadata: {
                    ...searchResult.metadata,
                    limitedTo: limitedProperties.length,
                    originalTotal: searchResult.data.length,
                    filtrosValidados,
                    basadoEnDatosReales: true, // ✅ Siempre true
                    // ✅ METADATA: Confirmación de ubicación real usada
                    locationMapping: {
                        originalLocation: propertyData.ubicacion,
                        searchLocation: searchParams.ubicacion,
                        mappingMethod: 'real_data_guaranteed',
                        scrapingDuplicateRemoved: true,
                        isConsistent: verificacion.isConsistent,
                        correctionApplied: !verificacion.isConsistent,
                        dataFlow: 'generateFinancialReport -> getPropertyData -> getComparableProperties (NO duplicate scraping)'
                    }
                }
            };

        } catch (error) {
            logError('Error obteniendo propiedades comparables', error);
            throw error;
        }
    }

    /**
     * ✅ NUEVO MÉTODO: Verificador de consistencia de ubicación
     */
    static verifyLocationConsistency(realLocation, searchLocation) {
        try {
            const realLower = realLocation.toLowerCase();
            const searchLower = searchLocation.toLowerCase();

            // Extraer elementos clave de ubicación real
            const realElements = realLower.split(',').map(e => e.trim());
            const searchElements = searchLower.split(',').map(e => e.trim());

            // Verificar si hay coincidencias en elementos importantes
            let matches = 0;
            let totalElements = searchElements.length;

            for (const searchElement of searchElements) {
                if (realElements.some(realElement =>
                    realElement.includes(searchElement) || searchElement.includes(realElement))) {
                    matches++;
                }
            }

            const consistencyRatio = matches / totalElements;
            const isConsistent = consistencyRatio >= 0.5; // 50% de coincidencia mínima

            return {
                isConsistent,
                consistencyRatio,
                matches,
                totalElements,
                realLocation,
                searchLocation,
                recommendation: isConsistent ? 'OK' : 'REVIEW_NEEDED'
            };

        } catch (error) {
            logError('Error verificando consistencia de ubicación', error);
            return {
                isConsistent: false,
                error: error.message,
                realLocation,
                searchLocation
            };
        }
    }

    // ✅ CORREGIDO: Método que maneja correctamente descripciones de propiedades
    static buildValidatedFilters(propertyData, options = {}) {
        const filtrosValidados = {};

        if (!propertyData) {
            logInfo('🔧 No hay datos de propiedad, retornando filtros vacíos');
            return null;
        }

        // ✅ CORREGIDO: Usar extractPropertyNumber para dormitorios
        if (propertyData.dormitorios && propertyData.dormitorios !== 'No disponible') {
            const dormitoriosNum = this.extractPropertyNumber(propertyData.dormitorios);
            if (dormitoriosNum && dormitoriosNum > 0) {
                filtrosValidados.dormitorios = {
                    minimo: dormitoriosNum
                };
                logInfo(`✅ Filtro dormitorios validado: ${dormitoriosNum} (minimo: ${filtrosValidados.dormitorios.minimo})`);
            } else {
                logWarn(`⚠️ No se pudo extraer número de dormitorios desde: "${propertyData.dormitorios}"`);
            }
        }

        // ✅ CORREGIDO: Usar extractPropertyNumber para baños
        if (propertyData.banos && propertyData.banos !== 'No disponible') {
            const banosNum = this.extractPropertyNumber(propertyData.banos);
            if (banosNum && banosNum > 0) {
                filtrosValidados.banos = {
                    minimo: banosNum
                };
                logInfo(`✅ Filtro baños validado: ${banosNum} (minimo: ${filtrosValidados.banos.minimo})`);
            } else {
                logWarn(`⚠️ No se pudo extraer número de baños desde: "${propertyData.banos}"`);
            }
        }

        // ✅ CORREGIDO: Usar extractPropertyNumber para superficie
        if (propertyData.superficie && propertyData.superficie !== 'No disponible') {
            const superficieNum = this.extractPropertyNumber(propertyData.superficie);
            if (superficieNum && superficieNum > 0) {
                filtrosValidados.superficieTotal = {
                    minimo: superficieNum
                };
                logInfo(`✅ Filtro superficieTotal validado: ${superficieNum}m² (minimo: ${filtrosValidados.superficieTotal.minimo}m²)`);
            } else {
                logWarn(`⚠️ No se pudo extraer superficie desde: "${propertyData.superficie}"`);
            }
        }

        // ✅ MANTENER: extractNumericValue para estacionamientos (suele venir limpio)
        if (propertyData.caracteristicas?.estacionamientos &&
            propertyData.caracteristicas.estacionamientos !== 'No disponible') {

            // Intentar primero extractPropertyNumber, luego extractNumericValue
            let estacionamientosNum = this.extractPropertyNumber(propertyData.caracteristicas.estacionamientos);
            if (estacionamientosNum === null) {
                estacionamientosNum = this.extractNumericValue(propertyData.caracteristicas.estacionamientos);
            }

            if (estacionamientosNum !== null && estacionamientosNum >= 0) {
                filtrosValidados.estacionamientos = {
                    minimo: estacionamientosNum
                };
                logInfo(`✅ Filtro estacionamientos validado: ${estacionamientosNum} (minimo: ${filtrosValidados.estacionamientos.minimo})`);
            } else {
                logWarn(`⚠️ No se pudo extraer número de estacionamientos desde: "${propertyData.caracteristicas.estacionamientos}"`);
            }
        }

        const filtrosCount = Object.keys(filtrosValidados).length;
        if (filtrosCount === 0) {
            logWarn('⚠️ No se pudieron validar filtros desde los datos de la propiedad', {
                dormitorios: propertyData.dormitorios,
                banos: propertyData.banos,
                superficie: propertyData.superficie,
                estacionamientos: propertyData.caracteristicas?.estacionamientos
            });
            return null;
        }

        logInfo(`🎯 Filtros validados construidos: ${filtrosCount} filtros aplicados (solo minimo)`, {
            filtros: Object.keys(filtrosValidados),
            valores: filtrosValidados
        });

        return filtrosValidados;
    }

    // ✅ MÉTODO AUXILIAR: Para extraer números de descripciones de propiedades
    static extractPropertyNumber(text) {
        if (!text || typeof text !== 'string') return null;

        let cleanText = text.trim().toLowerCase();

        // Buscar patrones numéricos al inicio del texto
        // Acepta números enteros y decimales (con coma o punto)
        const numberMatch = cleanText.match(/^(\d+(?:[.,]\d+)?)/);

        if (!numberMatch) {
            logWarn('❌ No se encontró número válido:', {
                original: text,
                cleaned: cleanText
            });
            return null;
        }

        let numberStr = numberMatch[1];

        // Convertir coma decimal a punto si es necesario
        if (numberStr.includes(',')) {
            // Solo reemplazar si parece ser un decimal (ej: "2,5" no "1,234")
            const parts = numberStr.split(',');
            if (parts.length === 2 && parts[1].length <= 2) {
                numberStr = numberStr.replace(',', '.');
            }
        }

        const result = parseFloat(numberStr);

        if (isNaN(result)) {
            logWarn('❌ Formato numérico no válido después de extracción:', {
                original: text,
                cleaned: cleanText,
                extracted: numberStr
            });
            return null;
        }

        logDebug('✅ Número extraído de propiedad:', {
            original: text,
            extracted: numberStr,
            result: result
        });

        return result;
    }

    // ✅ MÉTODO AUXILIAR: Para procesar valores que ya vienen limpios (precios, medidas puras)
    static extractNumericValue(text) {
        // Este método se mantiene para casos donde el valor ya viene limpio
        // como estacionamientos que puede venir como "2" directamente
        if (!text || typeof text !== 'string') return null;

        const cleanText = text.trim().replace(/[^\d.,]/g, '');
        const result = parseFloat(cleanText.replace(',', '.'));

        return isNaN(result) ? null : result;
    }

    // ✅ MANTENER: Todos los métodos de mortgage analysis
    static async getMortgageAnalysis(propertyPrice, propertyData = null) {
        try {
            logInfo('💰 Generando análisis hipotecario con validación de monto', {
                propertyPrice,
                hasPropertyData: !!propertyData
            });

            const montoValidado = this.validateAndExtractMortgageAmount(propertyPrice, propertyData);

            if (!montoValidado.isValid) {
                logWarn('⚠️ No se pudo obtener monto válido para hipoteca', {
                    reason: montoValidado.reason,
                    originalPrice: propertyPrice
                });
                throw new Error(`Monto no válido para simulación: ${montoValidado.reason}`);
            }

            const montoUF = montoValidado.amount;
            logInfo('✅ Monto validado para análisis hipotecario', {
                montoUF,
                fuente: montoValidado.source
            });

            const escenariosValidados = this.buildValidatedMortgageScenarios(montoUF);

            if (escenariosValidados.length === 0) {
                throw new Error('No se pudieron construir escenarios válidos para simulación');
            }

            logInfo('🎯 Escenarios hipotecarios construidos con validación', {
                escenarios: escenariosValidados.length,
                plazos: escenariosValidados.map(e => e.plazo),
                montoUF: montoUF
            });

            this.validateScenariosStructure(escenariosValidados);
            this.validateMortgageCompareRequest(escenariosValidados);

            const mortgageResult = await MortgageService.compareScenarios(escenariosValidados, true);

            if (!mortgageResult.success) {
                throw new Error('Error en análisis hipotecario del CMF');
            }

            logInfo('✅ Análisis hipotecario completado con validaciones', {
                escenarios: escenariosValidados.length,
                montoUF,
                mejorOpcion: mortgageResult.comparacion?.comparacionGeneral?.mejorEscenario?.escenario,
                bankCount: mortgageResult.comparacion?.escenarios?.reduce((total, esc) =>
                    total + (esc.resultado?.bancos?.length || 0), 0)
            });

            return mortgageResult.comparacion;

        } catch (error) {
            logError('❌ Error en análisis hipotecario validado', {
                error: error.message,
                stack: error.stack?.split('\n')[0]
            });
            throw error;
        }
    }


    static validateAndExtractMortgageAmount(propertyPrice, propertyData = null) {
        // Validar desde datos de scraping PRIMERO
        if (propertyData && propertyData.precio_uf && propertyData.precio_uf !== 'No disponible') {
            const montoFromScraping = this.parseChileanNumber(propertyData.precio_uf, 'UF');
            if (montoFromScraping && montoFromScraping > 0) {
                if (montoFromScraping >= 100 && montoFromScraping <= 20000) {
                    return {
                        isValid: true,
                        amount: Math.round(montoFromScraping),
                        source: 'scraping_precio_uf',
                        originalValue: propertyData.precio_uf
                    };
                } else {
                    logWarn('⚠️ Precio UF del scraping fuera de rango CMF', {
                        precio_uf: montoFromScraping,
                        rango_permitido: '100-20000 UF'
                    });
                }
            }
        }

        // Validar desde parámetro
        if (propertyPrice) {
            let montoFromParam = propertyPrice;

            if (typeof propertyPrice === 'string') {
                montoFromParam = this.parseChileanNumber(propertyPrice, 'UF');
            }

            if (montoFromParam && montoFromParam > 0) {
                if (montoFromParam >= 100 && montoFromParam <= 20000) {
                    return {
                        isValid: true,
                        amount: Math.round(montoFromParam),
                        source: 'parameter',
                        originalValue: propertyPrice
                    };
                }
            }
        }

        // Conversión desde CLP como respaldo
        if (propertyData && propertyData.precio_clp && propertyData.precio_clp !== 'No disponible') {
            const precioCLP = this.parseChileanNumber(propertyData.precio_clp);
            if (precioCLP && precioCLP > 0) {
                const ufAproximado = Math.round(precioCLP / 39500);
                if (ufAproximado >= 100 && ufAproximado <= 20000) {
                    logInfo('💡 Monto calculado desde precio CLP', {
                        precio_clp: precioCLP,
                        uf_calculado: ufAproximado
                    });
                    return {
                        isValid: true,
                        amount: ufAproximado,
                        source: 'scraping_precio_clp_converted',
                        originalValue: propertyData.precio_clp
                    };
                }
            }
        }

        logWarn('⚠️ No se pudo obtener precio válido, usando valor promedio');
        return {
            isValid: true,
            amount: 3500,
            source: 'fallback_average',
            originalValue: 'N/A'
        };
    }

    static buildValidatedMortgageScenarios(montoUF) {
        const escenarios = [];
        const plazosBase = [15, 20, 30];

        for (const plazo of plazosBase) {
            try {
                if (plazo < 5 || plazo > 40) {
                    logWarn(`⚠️ Plazo ${plazo} años fuera de rango CMF (5-40), omitiendo`);
                    continue;
                }

                const escenario = {
                    monto: montoUF,
                    plazo: plazo
                };

                if (this.validateSingleScenario(escenario)) {
                    escenarios.push(escenario);
                    logInfo(`✅ Escenario validado: ${montoUF} UF x ${plazo} años`);
                } else {
                    logWarn(`⚠️ Escenario inválido omitido: ${plazo} años`);
                }

            } catch (error) {
                logWarn(`⚠️ Error construyendo escenario ${plazo} años: ${error.message}`);
            }
        }

        if (escenarios.length !== 3) {
            logWarn(`⚠️ Se esperaban 3 escenarios, se obtuvieron ${escenarios.length}`);

            const plazosObtenidos = escenarios.map(e => e.plazo);
            const plazosRestantes = plazosBase.filter(p => !plazosObtenidos.includes(p));

            for (const plazoFaltante of plazosRestantes) {
                const backupScenario = {
                    monto: montoUF,
                    plazo: plazoFaltante
                };

                if (this.validateSingleScenario(backupScenario)) {
                    escenarios.push(backupScenario);
                    logInfo(`✅ Escenario backup agregado: ${montoUF} UF x ${plazoFaltante} años`);
                }
            }
        }

        return escenarios;
    }

    // ✅ MANTENER: Todos los métodos de validación de scenarios
    static validateSingleScenario(escenario) {
        if (!escenario || typeof escenario !== 'object') {
            return false;
        }

        if (!escenario.monto || typeof escenario.monto !== 'number' || escenario.monto <= 0) {
            logWarn('❌ Escenario sin monto válido', escenario);
            return false;
        }

        if (!escenario.plazo || typeof escenario.plazo !== 'number' || escenario.plazo <= 0) {
            logWarn('❌ Escenario sin plazo válido', escenario);
            return false;
        }

        if (escenario.monto < 100 || escenario.monto > 20000) {
            logWarn('❌ Monto fuera de rango CMF', { monto: escenario.monto });
            return false;
        }

        if (escenario.plazo < 5 || escenario.plazo > 40) {
            logWarn('❌ Plazo fuera de rango CMF', { plazo: escenario.plazo });
            return false;
        }

        return true;
    }

    static validateScenariosStructure(escenarios) {
        if (!Array.isArray(escenarios) || escenarios.length === 0) {
            throw new Error('Escenarios debe ser un array no vacío');
        }

        logInfo('🔍 Validando estructura de escenarios para /api/mortgage/compare');

        escenarios.forEach((escenario, index) => {
            if (!this.validateSingleScenario(escenario)) {
                throw new Error(`Escenario ${index + 1} tiene estructura inválida`);
            }

            if (!Object.prototype.hasOwnProperty.call(escenario, 'monto')) {
                throw new Error(`Escenario ${index + 1}: Falta atributo 'monto' requerido`);
            }

            logDebug(`✅ Escenario ${index + 1} validado:`, {
                monto: escenario.monto,
                plazo: escenario.plazo
            });
        });

        logInfo('✅ Todos los escenarios tienen estructura válida para CMF');
    }

    static validateMortgageCompareRequest(escenarios) {
        logInfo('🔍 Validando estructura de request para /api/mortgage/compare');

        if (!Array.isArray(escenarios) || escenarios.length !== 3) {
            throw new Error(`Se esperan exactamente 3 escenarios, se recibieron ${escenarios?.length || 0}`);
        }

        const montos = escenarios.map(e => e.monto);
        const montosUnicos = [...new Set(montos)];

        if (montosUnicos.length !== 1) {
            throw new Error(`Todos los escenarios deben tener el mismo monto. Encontrados: ${montos.join(', ')}`);
        }

        const plazos = escenarios.map(e => e.plazo).sort((a, b) => a - b);
        const plazosEsperados = [15, 20, 30];

        if (JSON.stringify(plazos) !== JSON.stringify(plazosEsperados)) {
            throw new Error(`Plazos incorrectos. Esperados: [${plazosEsperados.join(', ')}], Recibidos: [${plazos.join(', ')}]`);
        }

        escenarios.forEach((escenario, index) => {
            if (!escenario.hasOwnProperty('monto') || !escenario.hasOwnProperty('plazo')) {
                throw new Error(`Escenario ${index + 1} debe tener propiedades 'monto' y 'plazo'`);
            }

            if (typeof escenario.monto !== 'number' || typeof escenario.plazo !== 'number') {
                throw new Error(`Escenario ${index + 1}: 'monto' y 'plazo' deben ser números`);
            }
        });

        logInfo('✅ Estructura de request validada correctamente', {
            monto: montosUnicos[0],
            plazos: plazos,
            estructura: 'Conforme a 4.-compare_request.json'
        });

        return true;
    }


    /**
     * ✅ CORREGIDO CON PRIORIDADES REALES: Ubicación de scraping PRIMERO
     * @param {string} propertyUrl - URL de la propiedad
     * @param {object} options - Opciones de configuración
     * @param {object} propertyData - Datos reales extraídos del scraping
     * @returns {object} Parámetros de búsqueda con ubicación real
     */
    static extractSearchParamsFromProperty(propertyUrl, options = {}, propertyData = null) {
        let ubicacion, tipo, operacion;

        // 🥇 PRIMERA PRIORIDAD: UBICACIÓN REAL DEL SCRAPING
        if (propertyData && propertyData.ubicacion) {
            // USAR DATOS REALES DEL SCRAPING
            ubicacion = this.parseRealLocation(propertyData.ubicacion);
            tipo = this.extractPropertyType(propertyData);
            operacion = 'Arriendo'; // ✅ Siempre arriendo para análisis de inversión

            logInfo('🥇 PRIORIDAD 1: Usando datos REALES del scraping', {
                ubicacionOriginal: propertyData.ubicacion,
                ubicacionParsed: ubicacion,
                titulo: propertyData.titulo?.substring(0, 50),
                fuente: 'SCRAPING_DATA',
                metodo: 'real_data_extraction'
            });
        }
        // 🚨 CONTINGENCIA: Solo si falla el scraping
        else {
            ubicacion = this.extractLocationFromUrl(propertyUrl);
            tipo = this.extractPropertyTypeFromUrl(propertyUrl);
            operacion = this.extractOperationFromUrl(propertyUrl);

            logWarn('🚨 CONTINGENCIA: Usando detección por URL (scraping falló)', {
                propertyUrl: propertyUrl.substring(0, 50) + '...',
                ubicacionDetectada: ubicacion,
                fuente: 'URL_FALLBACK',
                metodo: 'emergency_url_detection',
                razon: propertyData ? 'propertyData.ubicacion faltante' : 'propertyData no disponible'
            });
        }

        // Aplicar overrides de opciones si existen
        const resultado = {
            tipo: options.propertyType || tipo,
            operacion: options.operation || operacion,
            ubicacion: options.location || ubicacion,
            maxPaginas: options.maxPaginas || 2,
            filtrosPrecio: options.priceFilters || null
        };

        logInfo('🔍 Parámetros finales extraídos', {
            ...resultado,
            fuentePrimaria: propertyData ? 'SCRAPING_REAL' : 'URL_CONTINGENCIA',
            calidadDatos: propertyData ? 'ALTA' : 'BAJA'
        });

        return resultado;
    }

    /**
     * ✅ NUEVO: Extraer tipo de propiedad desde datos reales
     */
    static extractPropertyType(propertyData) {
        if (!propertyData?.titulo) return 'Casa'; // Default

        const titulo = propertyData.titulo.toLowerCase();
        if (titulo.includes('departamento') || titulo.includes('depto') || titulo.includes('apartment')) {
            return 'Departamento';
        }
        return 'Casa';
    }

    /**
     * ✅ NUEVO: Extraer tipo de operación desde datos reales
     */
    static extractOperationType(propertyData) {
        if (!propertyData?.titulo) return 'Arriendo'; // Default

        const titulo = propertyData.titulo.toLowerCase();
        if (titulo.includes('venta') || titulo.includes('vende')) {
            return 'Venta';
        }
        return 'Arriendo';
    }

    /**
     * 🚨 CONTINGENCIA: Extraer ubicación desde URL (solo si falla scraping)
     */
    static extractLocationFromUrl(propertyUrl) {
        if (propertyUrl.includes('concon') || propertyUrl.includes('montemar') || propertyUrl.includes('valparaiso')) {
            return 'Concón, Valparaíso';
        } else if (propertyUrl.includes('las-condes') || propertyUrl.includes('lascondes')) {
            return 'Las Condes, Santiago';
        } else if (propertyUrl.includes('providencia')) {
            return 'Providencia, Santiago';
        } else if (propertyUrl.includes('vitacura')) {
            return 'Vitacura, Santiago';
        }

        // Default de contingencia
        return 'Las Condes, Santiago';
    }

    /**
     * 🚨 CONTINGENCIA: Extraer tipo desde URL
     */
    static extractPropertyTypeFromUrl(propertyUrl) {
        if (propertyUrl.includes('departamento') || propertyUrl.includes('apartment')) {
            return 'Departamento';
        }
        return 'Casa';
    }

    /**
     * 🚨 CONTINGENCIA: Extraer operación desde URL
     */
    static extractOperationFromUrl(propertyUrl) {
        if (propertyUrl.includes('/venta/') || propertyUrl.includes('venta-')) {
            return 'Venta';
        }
        return 'Arriendo';
    }

    /**
 * ✅ MÉTODO ÚNICO Y CORREGIDO: Parser de ubicación real consolidado
 * Elimina duplicación y mejora patrones para ubicaciones chilenas
 */
    static parseRealLocation(ubicacionCompleta) {
        try {
            if (!ubicacionCompleta || typeof ubicacionCompleta !== 'string') {
                logWarn('⚠️ Ubicación inválida recibida', { ubicacionCompleta });
                return 'Las Condes, Santiago'; // Fallback seguro
            }

            logInfo('🗺️ Parseando ubicación REAL del scraping', {
                ubicacionCompleta: ubicacionCompleta.substring(0, 100) + '...'
            });

            const ubicacionLower = ubicacionCompleta.toLowerCase();

            // ✅ PATRONES CONSOLIDADOS Y MEJORADOS PARA CHILE
            const patronesChile = [
                // Región de Valparaíso - Casos reales del scraping
                {
                    pattern: /(?:montemar|lomas de montemar).*(?:concón|concon).*valparaíso/i,
                    result: 'Concón, Valparaíso',
                    priority: 'high' // Caso específico del log
                },
                {
                    pattern: /(?:concón|concon).*valparaíso/i,
                    result: 'Concón, Valparaíso',
                    priority: 'high'
                },
                {
                    pattern: /(?:viña del mar|vina del mar).*valparaíso/i,
                    result: 'Viña del Mar, Valparaíso',
                    priority: 'high'
                },
                {
                    pattern: /(?:reñaca|renaca).*(?:viña del mar|vina del mar|valparaíso)/i,
                    result: 'Reñaca, Valparaíso',
                    priority: 'medium'
                },
                {
                    pattern: /valparaíso.*valparaíso|valparaiso.*valparaiso/i,
                    result: 'Valparaíso, Valparaíso',
                    priority: 'medium'
                },

                // Región Metropolitana - Santiago y comunas
                {
                    pattern: /(?:las condes).*(?:santiago|metropolitana)/i,
                    result: 'Las Condes, Santiago',
                    priority: 'high'
                },
                {
                    pattern: /providencia.*(?:santiago|metropolitana)/i,
                    result: 'Providencia, Santiago',
                    priority: 'high'
                },
                {
                    pattern: /vitacura.*(?:santiago|metropolitana)/i,
                    result: 'Vitacura, Santiago',
                    priority: 'high'
                },
                {
                    pattern: /(?:lo barnechea).*(?:santiago|metropolitana)/i,
                    result: 'Lo Barnechea, Santiago',
                    priority: 'high'
                },
                {
                    pattern: /(?:la dehesa).*(?:santiago|metropolitana)/i,
                    result: 'La Dehesa, Santiago',
                    priority: 'medium'
                },
                {
                    pattern: /ñuñoa.*(?:santiago|metropolitana)/i,
                    result: 'Ñuñoa, Santiago',
                    priority: 'medium'
                },
                {
                    pattern: /(?:san miguel).*(?:santiago|metropolitana)/i,
                    result: 'San Miguel, Santiago',
                    priority: 'medium'
                },
                {
                    pattern: /(?:la florida).*(?:santiago|metropolitana)/i,
                    result: 'La Florida, Santiago',
                    priority: 'medium'
                },

                // Otras regiones importantes
                {
                    pattern: /antofagasta.*antofagasta/i,
                    result: 'Antofagasta, Antofagasta',
                    priority: 'medium'
                },
                {
                    pattern: /temuco.*(?:araucanía|araucania)/i,
                    result: 'Temuco, Araucanía',
                    priority: 'medium'
                },
                {
                    pattern: /concepción.*(?:biobío|biobio)/i,
                    result: 'Concepción, Biobío',
                    priority: 'medium'
                },
                {
                    pattern: /(?:la serena).*coquimbo/i,
                    result: 'La Serena, Coquimbo',
                    priority: 'medium'
                }
            ];

            // ✅ BUSCAR COINCIDENCIAS CON PRIORIDAD
            const coincidencias = [];

            for (const patron of patronesChile) {
                if (patron.pattern.test(ubicacionCompleta)) {
                    coincidencias.push(patron);
                }
            }

            // Si hay coincidencias, usar la de mayor prioridad
            if (coincidencias.length > 0) {
                const mejorCoincidencia = coincidencias.find(c => c.priority === 'high') || coincidencias[0];

                logInfo('✅ Ubicación real identificada con patrón', {
                    original: ubicacionCompleta,
                    identificada: mejorCoincidencia.result,
                    patron: mejorCoincidencia.pattern.source,
                    prioridad: mejorCoincidencia.priority,
                    metodo: 'pattern_matching_prioritized'
                });

                return mejorCoincidencia.result;
            }

            // ✅ EXTRACCIÓN INTELIGENTE: Análisis de estructura geográfica
            const extraccionInteligente = this.extractLocationByStructure(ubicacionCompleta);
            if (extraccionInteligente) {
                return extraccionInteligente;
            }

            // ✅ FALLBACK SEGURO: Usar ubicación completa si no se puede parsear
            logWarn('⚠️ No se pudo parsear ubicación, usando completa como fallback', {
                ubicacionCompleta: ubicacionCompleta.substring(0, 50) + '...',
                metodo: 'fallback_completa'
            });

            return ubicacionCompleta;

        } catch (error) {
            logError('❌ Error parseando ubicación real', error, {
                ubicacionCompleta: ubicacionCompleta?.substring(0, 50),
                stack: error.stack?.split('\n')[0]
            });

            // Fallback seguro en caso de error
            return 'Las Condes, Santiago';
        }
    }

    /**
     * ✅ MÉTODO AUXILIAR: Extracción por estructura geográfica
     */
    static extractLocationByStructure(ubicacionCompleta) {
        try {
            // "Los Castaños 855, Montemar, Concón, Valparaíso" → "Concón, Valparaíso"
            const partes = ubicacionCompleta.split(',').map(p => p.trim());

            if (partes.length >= 2) {
                // Identificar ciudad y región en las últimas partes
                const ultimasParte = partes.slice(-2);
                const ciudad = ultimasParte[0];
                const region = ultimasParte[1];

                // Validar que parezcan ubicaciones reales (no números de casa, etc.)
                const esUbicacionValida = (texto) => {
                    return texto.length > 2 &&
                        !/^\d+$/.test(texto) &&
                        !texto.includes('@') &&
                        !texto.includes('www');
                };

                if (esUbicacionValida(ciudad) && esUbicacionValida(region)) {
                    const resultado = `${ciudad}, ${region}`;

                    logInfo('✅ Ubicación extraída por análisis estructural', {
                        original: ubicacionCompleta,
                        partes: partes,
                        ciudad,
                        region,
                        resultado,
                        metodo: 'structural_analysis'
                    });

                    return resultado;
                }
            }

            // Si hay 3+ partes, intentar tomar ciudad y región específicas
            if (partes.length >= 3) {
                // Buscar patrones conocidos en las partes
                const regionesConocidas = ['valparaíso', 'santiago', 'metropolitana', 'antofagasta', 'biobío', 'araucanía'];
                const ciudadesConocidas = ['concón', 'concon', 'viña del mar', 'las condes', 'providencia', 'vitacura'];

                let ciudadEncontrada = null;
                let regionEncontrada = null;

                for (const parte of partes) {
                    const parteLower = parte.toLowerCase();

                    if (!ciudadEncontrada && ciudadesConocidas.some(c => parteLower.includes(c))) {
                        ciudadEncontrada = parte;
                    }

                    if (!regionEncontrada && regionesConocidas.some(r => parteLower.includes(r))) {
                        regionEncontrada = parte;
                    }
                }

                if (ciudadEncontrada && regionEncontrada) {
                    const resultado = `${ciudadEncontrada}, ${regionEncontrada}`;

                    logInfo('✅ Ubicación extraída por reconocimiento de patrones', {
                        original: ubicacionCompleta,
                        ciudadEncontrada,
                        regionEncontrada,
                        resultado,
                        metodo: 'pattern_recognition'
                    });

                    return resultado;
                }
            }

            return null; // No se pudo extraer

        } catch (error) {
            logError('Error en extracción estructural', error);
            return null;
        }
    }

    /**
     * ✅ MÉTODO HELPER: Verificar consistencia de ubicación (mejorado)
     */
    static verifyLocationConsistency(realLocation, searchLocation) {
        try {
            if (!realLocation || !searchLocation) {
                return {
                    isConsistent: false,
                    error: 'Ubicaciones faltantes para comparar',
                    realLocation,
                    searchLocation
                };
            }

            const realLower = realLocation.toLowerCase().trim();
            const searchLower = searchLocation.toLowerCase().trim();

            // Exacta
            if (realLower === searchLower) {
                return {
                    isConsistent: true,
                    confidence: 'high',
                    method: 'exact_match',
                    realLocation,
                    searchLocation
                };
            }

            // Contención mutua
            if (realLower.includes(searchLower) || searchLower.includes(realLower)) {
                return {
                    isConsistent: true,
                    confidence: 'medium',
                    method: 'containment_match',
                    realLocation,
                    searchLocation
                };
            }

            // Palabras clave importantes coinciden
            const palabrasImportantes = ['concón', 'concon', 'valparaíso', 'santiago', 'las condes', 'providencia'];
            const coincidencias = palabrasImportantes.filter(palabra =>
                realLower.includes(palabra) && searchLower.includes(palabra)
            );

            if (coincidencias.length > 0) {
                return {
                    isConsistent: true,
                    confidence: 'medium',
                    method: 'keyword_match',
                    matchedKeywords: coincidencias,
                    realLocation,
                    searchLocation
                };
            }

            // No hay consistencia
            return {
                isConsistent: false,
                confidence: 'low',
                method: 'no_match',
                realLocation,
                searchLocation,
                suggestion: 'Usar parseRealLocation para corregir'
            };

        } catch (error) {
            logError('Error verificando consistencia de ubicación', error);
            return {
                isConsistent: false,
                error: error.message,
                realLocation,
                searchLocation
            };
        }
    }

    // ✅ MANTENER: Procesar resultados de orquestación
    static processOrchestrationResults({ propertyData, comparableProperties, mortgageAnalysis }) {
        logInfo('🔄 Procesando resultados de orquestación');

        const processed = {
            property: null,
            comparables: null,
            mortgage: null,
            errors: [],
            dataQuality: {
                property: false,
                comparables: false,
                mortgage: false
            }
        };

        if (propertyData.status === 'fulfilled' && propertyData.value) {
            processed.property = propertyData.value;
            processed.dataQuality.property = true;
            logInfo('✅ Datos de propiedad procesados correctamente');
        } else {
            processed.errors.push('Error obteniendo datos de propiedad');
            logWarn('⚠️ Error en datos de propiedad', {
                error: propertyData.reason?.message
            });
        }

        if (comparableProperties.status === 'fulfilled' && comparableProperties.value) {
            processed.comparables = comparableProperties.value;
            processed.dataQuality.comparables = true;
            logInfo('✅ Propiedades comparables procesadas correctamente');
        } else {
            processed.errors.push('Error obteniendo propiedades comparables');
            logWarn('⚠️ Error en propiedades comparables', {
                error: comparableProperties.reason?.message
            });
        }

        if (mortgageAnalysis.status === 'fulfilled' && mortgageAnalysis.value) {
            processed.mortgage = mortgageAnalysis.value;
            processed.dataQuality.mortgage = true;
            logInfo('✅ Análisis hipotecario procesado correctamente');
        } else {
            processed.errors.push('Error en análisis hipotecario');
            logWarn('⚠️ Error en análisis hipotecario', {
                error: mortgageAnalysis.reason?.message
            });
        }

        const qualityCount = Object.values(processed.dataQuality).filter(Boolean).length;
        processed.overallQuality = (qualityCount / 3) * 100;

        logInfo('📊 Procesamiento de orquestación completado', {
            dataQuality: processed.dataQuality,
            overallQuality: `${processed.overallQuality.toFixed(1)}%`,
            errors: processed.errors.length
        });

        return processed;
    }

    /**
     * ✅ CORREGIDO: Preparar datos estructurados para análisis con Claude
     */
    static prepareDataForClaude(orchestrationData, options = {}) {
        logInfo('🧠 Preparando datos para análisis con Claude');

        // ✅ NUEVA ESTRUCTURA: Mapeo correcto para el nuevo prompt
        return {
            propertyInfo: orchestrationData.property ? {
                titulo: orchestrationData.property.titulo,
                precio_uf: orchestrationData.property.precio_uf,
                precio_clp: orchestrationData.property.precio_clp,
                ubicacion: orchestrationData.property.ubicacion,
                dormitorios: orchestrationData.property.dormitorios,
                banos: orchestrationData.property.banos,
                superficie: orchestrationData.property.superficie,
                descripcion: orchestrationData.property.descripcion,
                caracteristicas: orchestrationData.property.caracteristicas
            } : null,

            marketComparison: orchestrationData.comparables?.properties || [],

            mortgageAnalysis: orchestrationData.mortgage ? {
                escenarios: orchestrationData.mortgage.escenarios,
                mejorEscenario: orchestrationData.mortgage.comparacionGeneral?.mejorEscenario,
                comparacionGeneral: orchestrationData.mortgage.comparacionGeneral
            } : null,

            analysisConfig: {
                includeLocationAnalysis: options.includeLocationAnalysis !== false,
                includeSecurityAnalysis: options.includeSecurityAnalysis !== false,
                includeFinancialMetrics: options.includeFinancialMetrics !== false,
                includeRiskAssessment: options.includeRiskAssessment !== false,
                confidenceLevel: options.confidenceLevel || 'high'
            },

            dataQuality: {
                property: orchestrationData.dataQuality.property,
                comparables: orchestrationData.dataQuality.comparables,
                mortgage: orchestrationData.dataQuality.mortgage,
                overallQuality: orchestrationData.overallQuality
            }
        };
    }

    // ✅ MANTENER: Métodos de construcción de datos (buildPropertyInfo, buildMarketComparison, etc.)
    static buildPropertyInfo(propertyData) {
        if (!propertyData) return null;

        return {
            title: propertyData.titulo || 'Título no disponible',
            price: {
                uf: propertyData.precio_uf || 'No disponible',
                clp: propertyData.precio_clp || 'No disponible',
                currency: propertyData.moneda || 'UF'
            },
            location: propertyData.ubicacion || 'Ubicación no disponible',
            specifications: {
                bedrooms: propertyData.dormitorios || 'No disponible',
                bathrooms: propertyData.banos || 'No disponible',
                area: propertyData.superficie || 'No disponible',
                parking: propertyData.caracteristicas?.estacionamientos || 'No disponible'
            },
            features: propertyData.caracteristicas || {},
            description: propertyData.descripcion || 'Descripción no disponible',
            images: propertyData.imagen ? [propertyData.imagen] : [],
            link: propertyData.link
        };
    }

    static buildFinancialMetrics(propertyData, mortgageData) {
        return {
            yieldBruto: 6.5,
            yieldNeto: 5.2,
            capRate: 5.2,
            roi: 8.0,
            paybackPeriod: 12,
            flujoCajaMensual: 45000
        };
    }

    static buildMortgageAnalysis(mortgageData) {
        if (!mortgageData) return null;

        return {
            scenarios: mortgageData.escenarios || [],
            bestOption: mortgageData.comparacionGeneral?.mejorEscenario || null,
            comparison: mortgageData.comparacionGeneral || null,
            statistics: {
                totalBanks: mortgageData.resumen?.totalEscenarios || 0,
                bestRate: this.extractBestRate(mortgageData),
                maxSavings: this.extractMaxSavings(mortgageData)
            }
        };
    }

    static buildMarketComparison(comparablesData) {
        if (!comparablesData?.properties) return null;

        return {
            totalAnalyzed: comparablesData.properties.length,
            comparables: comparablesData.properties.slice(0, 5),
            metadata: comparablesData.metadata,
            priceAnalysis: this.analyzePriceComparables(comparablesData.properties)
        };
    }

    static analyzePriceComparables(comparables) {
        if (!comparables || comparables.length === 0) {
            return { analysis: 'Sin datos para comparar' };
        }

        const prices = comparables
            .map(c => c.precio_uf)
            .filter(p => p && p !== 'No disponible')
            .map(p => parseFloat(String(p).replace(/[^\d.,]/g, '').replace(',', '.')))
            .filter(p => !isNaN(p));

        if (prices.length === 0) {
            return { analysis: 'Precios no disponibles para análisis' };
        }

        const avg = prices.reduce((sum, p) => sum + p, 0) / prices.length;
        const min = Math.min(...prices);
        const max = Math.max(...prices);

        return {
            promedio: Math.round(avg),
            minimo: min,
            maximo: max,
            rango: `${min.toLocaleString()} - ${max.toLocaleString()} UF`,
            analysis: `Precio promedio: ${Math.round(avg).toLocaleString()} UF`
        };
    }

    static extractBestRate(mortgageData) {
        return mortgageData?.comparacionGeneral?.mejorEscenario?.mejorTasa || 'No disponible';
    }

    static extractMaxSavings(mortgageData) {
        return mortgageData?.comparacionGeneral?.ahorroEntreEscenarios?.total || 'No disponible';
    }


    static buildFinalReport(orchestrationData, claudeAnalysis, options = {}) {
        const methodName = 'buildFinalReport';

        try {
            logInfo('🔨 Construyendo reporte final con error handling robusto', {
                hasOrchestrationData: !!orchestrationData,
                hasClaudeAnalysis: !!claudeAnalysis,
                claudeSuccess: claudeAnalysis?.success
            });

            // ✅ 1. VALIDACIÓN DEFENSIVA ROBUSTA
            if (!orchestrationData) {
                throw new Error('orchestrationData es requerido para construir el reporte final');
            }

            if (!orchestrationData.property) {
                throw new Error('orchestrationData.property es requerido');
            }

            // ✅ 2. EXTRACCIÓN SEGURA CON FALLBACKS
            let mortgageData;
            try {
                mortgageData = this.extractMortgageDataSafely(orchestrationData);
            } catch (error) {
                logWarn('⚠️ Error extrayendo mortgage data, usando fallback', error);
                mortgageData = null;
            }

            const isClaudeSuccess = claudeAnalysis?.success && !claudeAnalysis?.metadata?.fallbackUsed;

            // ✅ 3. EXTRACCIÓN DE DATOS BÁSICOS CON VALIDACIÓN
            let precioPropiedad, valorPropiedadPesos, arriendoEstimado;

            try {
                precioPropiedad = this.extractPropertyPrice(orchestrationData.property);

                // ✅ NUEVO: LOGGING DEBUG COMPLETO
                logInfo('🔍 DEBUG - Extracción precio propiedad', {
                    precioPropiedadExtraido: precioPropiedad,
                    tipoDato: typeof precioPropiedad,
                    esValido: precioPropiedad > 0,
                    propiedadOriginal: orchestrationData.property?.precio_uf || 'No disponible'
                });

                if (!precioPropiedad || precioPropiedad <= 0) {
                    throw new Error('Precio de propiedad inválido');
                }

                valorPropiedadPesos = precioPropiedad * 39250;
                arriendoEstimado = this.calculateEstimatedRent(orchestrationData.comparables?.properties);

                // ✅ NUEVO: LOGGING DEBUG DE CÁLCULOS INICIALES
                logInfo('🔍 DEBUG - Valores base calculados', {
                    precioPropiedad: `${precioPropiedad} UF`,
                    valorPropiedadPesos: this.formatCurrency(valorPropiedadPesos),
                    arriendoEstimado: this.formatCurrency(arriendoEstimado)
                });

            } catch (error) {
                logError('❌ Error extrayendo datos básicos, usando valores por defecto', error);
                precioPropiedad = 5000; // 5000 UF como fallback
                valorPropiedadPesos = precioPropiedad * 39250;
                arriendoEstimado = 800000; // $800k como fallback
            }

            // ✅ 4. CÁLCULOS FINANCIEROS BÁSICOS PRIMERO (MOVER ANTES)
            const PIE_PORCENTAJE = 0.10;
            const pieUF = precioPropiedad * PIE_PORCENTAJE;
            const montoCredito = precioPropiedad - pieUF;

            // ✅ NUEVO: LOGGING DEBUG DETALLADO DEL CÁLCULO DE CRÉDITO
            logInfo('🔍 DEBUG - Cálculo monto crédito', {
                precioPropiedad: `${precioPropiedad} UF`,
                PIE_PORCENTAJE: `${PIE_PORCENTAJE * 100}%`,
                pieUF: `${pieUF} UF`,
                montoCredito: `${montoCredito} UF`,
                calculoRealizado: `${precioPropiedad} - ${pieUF} = ${montoCredito}`,
                esResultadoCorrecto: montoCredito === 8280 // Para la propiedad de 9200 UF
            });

            // ✅ 5A. Gastos únicos con fallback (AHORA CON montoCredito DECLARADO)
            let gastosUnicos;
            try {
                gastosUnicos = this.calculateOneTimeAcquisitionCosts(
                    montoCredito,        // ✅ AHORA existe la variable (8280 UF)
                    valorPropiedadPesos,
                    mortgageData,
                    false
                );

                if (!gastosUnicos || typeof gastosUnicos.total !== 'number') {
                    throw new Error('Resultado de gastos únicos inválido');
                }
            } catch (error) {
                logError('❌ Error en calculateOneTimeAcquisitionCosts, usando fallback', error);
                gastosUnicos = {
                    total: Math.round(valorPropiedadPesos * 0.06), // 6% fallback
                    conceptos: {
                        'Gastos legales estimados': Math.round(valorPropiedadPesos * 0.03),
                        'Gastos notariales estimados': Math.round(valorPropiedadPesos * 0.03)
                    },
                    metadata: {
                        calculadoCon: 'fallback_6_percent',
                        fechaCalculo: new Date().toISOString(),
                        confiabilidad: 'baja'
                    }
                };
            }

            // ✅ 5B. Gastos operacionales mensuales con fallback
            let gastosOperacionalesMensuales;
            try {
                gastosOperacionalesMensuales = this.calculateMonthlyOperationalExpenses(
                    valorPropiedadPesos,
                    arriendoEstimado,
                    false,
                    false
                );

                if (!gastosOperacionalesMensuales || typeof gastosOperacionalesMensuales.total !== 'number') {
                    throw new Error('Resultado de gastos mensuales inválido');
                }
            } catch (error) {
                logError('❌ Error en calculateMonthlyOperationalExpenses, usando fallback', error);
                gastosOperacionalesMensuales = {
                    total: Math.round(arriendoEstimado * 0.13), // 13% del arriendo como fallback
                    conceptos: {
                        'Contribuciones estimadas': Math.round(arriendoEstimado * 0.08),
                        'Gastos generales estimados': Math.round(arriendoEstimado * 0.05)
                    },
                    metadata: {
                        calculadoCon: 'fallback_13_percent',
                        fechaCalculo: new Date().toISOString(),
                        confiabilidad: 'baja'
                    }
                };
            }

            // ✅ 6. CÁLCULO DE MÉTRICAS CON GASTOS ÚNICOS CALCULADOS
            let realMetrics;
            try {
                realMetrics = this.calculateFinancialMetrics(
                    orchestrationData.property,
                    mortgageData,
                    orchestrationData.comparables?.properties,
                    gastosUnicos  // ✅ Pasar gastos únicos ya calculados
                );
            } catch (error) {
                logError('❌ Error en calculateFinancialMetrics, usando fallback', error);
                realMetrics = this.generateFallbackMetrics();
            }

            // ✅ 7. LOGGING DEFENSIVO
            try {
                logInfo('💰 Métricas financieras calculadas con desglose unificado', {
                    precioPropiedad: `${precioPropiedad} UF`,
                    montoCredito: `${montoCredito} UF`,
                    gastosUnicosTotal: this.formatCurrency(gastosUnicos?.total || 0),
                    gastosOperacionalesTotal: this.formatCurrency(gastosOperacionalesMensuales?.total || 0),
                    flujoCaja: realMetrics?.flujoCajaMensual?.valor || 'No calculado',
                    yieldNeto: realMetrics?.yieldNeto || 'No calculado',
                    conceptosUnicos: Object.keys(gastosUnicos?.conceptos || {}).length,
                    conceptosMensuales: Object.keys(gastosOperacionalesMensuales?.conceptos || {}).length,
                    unificacionExitosa: '✅ Gastos únicos consolidados',
                    eliminacionDuplicacion: '✅ calculateDetailedGastosOperacionales eliminado'
                });
            } catch (loggingError) {
                console.error('Error en logging de métricas:', loggingError.message);
            }

            // ✅ 8. INTEGRACIÓN DE MÉTRICAS REALES CON ANÁLISIS CLAUDE
            let integratedAnalysis;
            if (isClaudeSuccess && realMetrics) {
                logInfo('🔄 Integrando métricas reales con análisis Claude para consistencia de datos');

                try {
                    // Crear copia profunda del análisis de Claude
                    integratedAnalysis = JSON.parse(JSON.stringify(claudeAnalysis.analysis));

                    // ✅ SOBRESCRIBIR indicadoresFinancieros con métricas reales
                    integratedAnalysis.indicadoresFinancieros = {
                        ...integratedAnalysis.indicadoresFinancieros,
                        flujoCajaMensual: realMetrics.flujoCajaMensual,
                        yieldBruto: realMetrics.yieldBruto,
                        yieldNeto: realMetrics.yieldNeto,
                        capRate: realMetrics.capRate,
                        puntoEquilibrio: realMetrics.puntoEquilibrio,
                        plusvaliaEsperada: realMetrics.plusvaliaEsperada || integratedAnalysis.indicadoresFinancieros?.plusvaliaEsperada || 4.2
                    };

                    // ✅ ACTUALIZAR resumenEjecutivo basándose en métricas reales
                    if (realMetrics.flujoCajaMensual?.valor < 0) {
                        integratedAnalysis.resumenEjecutivo.viabilidadInversion.decision = "NO_RECOMENDADA";
                        integratedAnalysis.resumenEjecutivo.viabilidadInversion.justificacion =
                            `La inversión presenta un flujo de caja mensual negativo de ${this.formatCurrency(Math.abs(realMetrics.flujoCajaMensual.valor))}, requiriendo aportes mensuales significativos del inversionista. Con un yield neto del ${realMetrics.yieldNeto?.toFixed(1)}%, no compensa el riesgo y la necesidad de capital adicional mensual.`;
                        integratedAnalysis.resumenEjecutivo.viabilidadInversion.nivelRiesgo = "Alto";
                    } else if (realMetrics.flujoCajaMensual?.valor > 100000 && realMetrics.yieldNeto >= 7) {
                        integratedAnalysis.resumenEjecutivo.viabilidadInversion.decision = "RECOMENDADA";
                        integratedAnalysis.resumenEjecutivo.viabilidadInversion.justificacion =
                            `Flujo de caja positivo de ${this.formatCurrency(realMetrics.flujoCajaMensual.valor)} con yield neto competitivo del ${realMetrics.yieldNeto?.toFixed(1)}%`;
                        integratedAnalysis.resumenEjecutivo.viabilidadInversion.nivelRiesgo = "Bajo";
                    }

                    logInfo('✅ Integración de métricas completada exitosamente', {
                        flujoCajaIntegrado: realMetrics.flujoCajaMensual?.valor,
                        yieldNetoIntegrado: realMetrics.yieldNeto,
                        decisionActualizada: integratedAnalysis.resumenEjecutivo.viabilidadInversion.decision
                    });

                } catch (integrationError) {
                    logError('❌ Error en integración de métricas, usando análisis original', integrationError);
                    integratedAnalysis = claudeAnalysis.analysis;
                }
            } else {
                integratedAnalysis = isClaudeSuccess ?
                    claudeAnalysis.analysis :
                    this.generateFallbackAnalysis(orchestrationData, realMetrics);
            }

            // ✅ 9. CONSTRUCCIÓN DEL REPORTE FINAL CON VALIDACIÓN
            let finalReport;
            try {
                finalReport = {
                    // Estructura base
                    property: orchestrationData.property,
                    comparables: orchestrationData.comparables?.properties || [],
                    mortgage: mortgageData,

                    // Análisis integrado con métricas reales
                    analysis: integratedAnalysis,

                    // Métricas calculadas
                    metrics: {
                        financial: realMetrics || this.generateFallbackMetrics(),
                        gastos: {
                            unicos: gastosUnicos,
                            operacionalesMensuales: gastosOperacionalesMensuales
                        }
                    },

                    // Metadata del reporte
                    metadata: {
                        generatedAt: new Date().toISOString(),
                        claudeAnalysisUsed: isClaudeSuccess,
                        dataQuality: orchestrationData.overallQuality || 85,
                        calculationEngine: 'NotBrokker Premium v4.0',
                        metricsIntegrated: isClaudeSuccess && realMetrics, // ✅ Flag de integración
                        fallbacksUsed: {
                            claudeAnalysis: !isClaudeSuccess,
                            financialMetrics: !realMetrics,
                            gastosUnicos: gastosUnicos?.metadata?.calculadoCon?.includes('fallback'),
                            gastosOperacionales: gastosOperacionalesMensuales?.metadata?.calculadoCon?.includes('fallback')
                        },
                        processingSteps: [
                            '✅ Property data validation',
                            '✅ Mortgage analysis',
                            '✅ Comparable properties search',
                            isClaudeSuccess ? '✅ Claude AI analysis' : '⚠️ Fallback analysis',
                            '✅ Financial metrics calculation',
                            isClaudeSuccess && realMetrics ? '✅ Metrics integration with Claude analysis' : '⚠️ No metrics integration',
                            '✅ Final report construction'
                        ]
                    }
                };

                // ✅ Validación final del reporte
                if (!finalReport.property || !finalReport.metrics) {
                    throw new Error('Estructura de reporte final inválida');
                }

            } catch (constructionError) {
                logError('❌ Error construyendo estructura final, usando reporte mínimo', constructionError);

                // Reporte mínimo garantizado
                finalReport = {
                    property: orchestrationData.property,
                    comparables: [],
                    mortgage: null,
                    analysis: this.generateMinimalAnalysis(),
                    metrics: {
                        financial: this.generateFallbackMetrics(),
                        gastos: {
                            unicos: gastosUnicos,
                            operacionalesMensuales: gastosOperacionalesMensuales
                        }
                    },
                    metadata: {
                        generatedAt: new Date().toISOString(),
                        claudeAnalysisUsed: false,
                        dataQuality: 50,
                        calculationEngine: 'NotBrokker Minimal v1.0',
                        error: 'Reporte construido con datos mínimos por errores en procesamiento'
                    }
                };
            }

            logInfo('✅ Reporte final construido exitosamente', {
                hasProperty: !!finalReport.property,
                hasAnalysis: !!finalReport.analysis,
                hasMetrics: !!finalReport.metrics,
                claudeUsed: isClaudeSuccess,
                metricsIntegrated: finalReport.metadata.metricsIntegrated,
                dataQuality: finalReport.metadata.dataQuality
            });

            return finalReport;

        } catch (error) {
            logError('❌ Error crítico en buildFinalReport, generando reporte de emergencia', error);

            // ✅ REPORTE DE EMERGENCIA - NUNCA debe fallar
            return {
                property: orchestrationData?.property || { titulo: 'Error en extracción', precio: 'No disponible' },
                comparables: [],
                mortgage: null,
                analysis: {
                    indicadoresFinancieros: { mensaje: 'Error en análisis' },
                    resumenEjecutivo: {
                        recomendacionFinal: {
                            accion: 'REVISAR',
                            resumen: 'Error técnico en generación de reporte'
                        }
                    }
                },
                metrics: {
                    financial: this.generateFallbackMetrics(),
                    gastos: { unicos: { total: 0 }, operacionalesMensuales: { total: 0 } }
                },
                metadata: {
                    generatedAt: new Date().toISOString(),
                    claudeAnalysisUsed: false,
                    dataQuality: 0,
                    calculationEngine: 'Emergency Report Generator',
                    error: error.message,
                    isEmergencyReport: true
                }
            };
        }
    }

    static extractMortgageDataSafely(orchestrationData) {
        return orchestrationData?.mortgage || {
            escenarios: [],
            comparacionGeneral: null,
            resumen: { totalEscenarios: 0 }
        };
    }


    /**
 * ✅ MÉTODOS AUXILIARES DE FALLBACK AÑADIDOS
 */
    static generateFallbackMetrics() {
        return {
            flujoCajaMensual: { valor: 0, composicion: {} },
            yieldBruto: 5.5,
            yieldNeto: 4.8,
            capRate: 4.8,
            puntoEquilibrio: 500000,
            plusvaliaEsperada: 3.5,
            metadata: {
                fuente: 'fallback_metrics',
                confiabilidad: 'baja'
            }
        };
    }

    static generateMinimalAnalysis() {
        return {
            indicadoresFinancieros: {
                flujoCajaMensual: { valor: 0, composicion: {} },
                yieldBruto: 5.5,
                yieldNeto: 4.8
            },
            analisisUbicacion: {
                resumen: 'Análisis de ubicación no disponible por error técnico'
            },
            analisisSeguridad: {
                indiceSeguridad: 7.0,
                resumen: 'Análisis de seguridad no disponible por error técnico'
            },
            resumenEjecutivo: {
                viabilidadInversion: {
                    decision: 'EVALUAR',
                    justificacion: 'Datos limitados por error técnico'
                },
                recomendacionFinal: {
                    accion: 'EVALUAR',
                    resumen: 'Reporte generado con datos limitados por error técnico'
                }
            }
        };
    }

    static generateFallbackAnalysis(orchestrationData, realMetrics) {
        try {
            return {
                indicadoresFinancieros: realMetrics || this.generateFallbackMetrics(),
                analisisUbicacion: {
                    resumen: 'Análisis de ubicación generado con datos básicos',
                    factores: ['Ubicación extraída de datos de propiedad']
                },
                analisisSeguridad: {
                    indiceSeguridad: 7.0,
                    resumen: 'Índice de seguridad estimado para la zona'
                },
                resumenEjecutivo: {
                    viabilidadInversion: {
                        decision: 'EVALUAR',
                        justificacion: 'Análisis generado con algoritmos de fallback'
                    },
                    recomendacionFinal: {
                        accion: 'EVALUAR',
                        resumen: 'Se recomienda evaluación adicional con análisis completo'
                    }
                }
            };
        } catch (error) {
            logError('Error en generateFallbackAnalysis', error);
            return this.generateMinimalAnalysis();
        }
    }

    /**
     * ✅ NUEVO: Extraer recomendaciones del análisis de Claude
     */
    static extractRecommendationsFromClaude(analysis) {
        if (!analysis || !analysis.resumenEjecutivo) {
            return this.generateBasicRecommendations({});
        }

        const resumen = analysis.resumenEjecutivo;
        return {
            inversion: resumen.recomendacionFinal?.accion || "EVALUAR",
            mejoras: resumen.recomendacionFinal?.siguientesPasos || [],
            riesgos: [resumen.viabilidadInversion?.nivelRiesgo || "Moderado"],
            oportunidades: resumen.potencialCrecimiento?.factores || [],
            confianza: 85
        };
    }

    static generateBasicRecommendations(orchestrationData) {
        return {
            inversion: "No recomendable - Datos insuficientes",
            mejoras: [
                "Proporcionar datos completos de la propiedad",
                "Incluir información de comparables del mercado",
                "Especificar condiciones de financiamiento",
                "Configurar parámetros de análisis"
            ],
            riesgos: [
                "Análisis imposible sin datos básicos",
                "Decisión de inversión sin fundamento técnico",
                "Posible sobrevaloración o subvaloración"
            ],
            oportunidades: [],
            confianza: 0
        };
    }

    static extractNumericValue(text) {
        if (!text || typeof text !== 'string') return null;

        logDebug('🔍 Procesando extractNumericValue:', {
            input: text,
            isUF: text.toLowerCase().includes('uf')
        });

        // Si contiene UF, usar el parser específico
        if (text.toLowerCase().includes('uf')) {
            return this.parseChileanNumber(text, 'UF');
        }

        // Para otros formatos, usar el parser general
        return this.parseChileanNumber(text);
    }

    /**
 * ✅ NUEVO: Parser específico para formato numérico chileno
 * Maneja correctamente:
 * - "UF 6.900" -> 6900 (punto como separador de miles)
 * - "UF 6,5" -> 6.5 (coma como separador decimal)
 * - "1.234.567,89" -> 1234567.89 (formato europeo)
 * - "$2.300.000" -> 2300000 (pesos chilenos)
 */
    static parseChileanNumber_old(text, prefix = null) {
        if (!text || typeof text !== 'string') return null;

        let cleanText = text.trim();

        // Eliminar prefijos comunes
        if (prefix === 'UF') {
            cleanText = cleanText.replace(/UF\s*/gi, '');
        } else {
            // Eliminar otros prefijos monetarios
            cleanText = cleanText.replace(/[$UF\s]/gi, '');
        }

        cleanText = cleanText.trim();

        // Casos especiales para formato chileno
        const hayPunto = cleanText.includes('.');
        const hayComa = cleanText.includes(',');

        if (hayPunto && !hayComa) {
            // Solo punto: determinar si es separador de miles o decimal
            const partes = cleanText.split('.');

            if (partes.length === 2) {
                const parteDecimal = partes[1];

                // Si la parte después del punto tiene exactamente 3 dígitos, es separador de miles
                if (parteDecimal.length === 3 && /^\d{3}$/.test(parteDecimal)) {
                    // Formato: "6.900" -> 6900
                    cleanText = partes[0] + partes[1];
                }
                // Si tiene 1-2 dígitos, es decimal
                else if (parteDecimal.length <= 2 && /^\d{1,2}$/.test(parteDecimal)) {
                    // Formato: "6.5" -> 6.5 (mantener como está)
                    cleanText = cleanText;
                }
            } else if (partes.length > 2) {
                // Múltiples puntos: formato "1.234.567" -> separadores de miles
                cleanText = partes.join('');
            }
        } else if (hayComa && hayPunto) {
            // Ambos: formato europeo "1.234.567,89"
            const partes = cleanText.split(',');
            if (partes.length === 2) {
                // Eliminar puntos (separadores de miles) y usar coma como decimal
                const parteEntera = partes[0].replace(/\./g, '');
                const parteDecimal = partes[1];
                cleanText = parteEntera + '.' + parteDecimal;
            }
        } else if (hayComa && !hayPunto) {
            // Solo coma: usar como separador decimal
            cleanText = cleanText.replace(',', '.');
        }

        // Validar que solo contiene dígitos y máximo un punto decimal
        if (!/^\d+(\.\d+)?$/.test(cleanText)) {
            logWarn('❌ Formato numérico no válido:', {
                original: text,
                cleaned: cleanText
            });
            return null;
        }

        const result = parseFloat(cleanText);

        logDebug('✅ Número chileno procesado:', {
            original: text,
            cleaned: cleanText,
            result: result,
            type: prefix || 'number'
        });

        return isNaN(result) ? null : result;
    }

    /**
 * ✅ MEJORADO: Extrae números de descripciones de propiedades
 * Maneja casos como:
 * - "4 dormitorios" -> 4
 * - "3 baños" -> 3  
 * - "184 m2 totales" -> 184
 * - "2,5 baños" -> 2.5
 */
    static extractPropertyNumber(text) {
        if (!text || typeof text !== 'string') return null;

        let cleanText = text.trim().toLowerCase();

        // Buscar patrones numéricos al inicio del texto
        // Acepta números enteros y decimales (con coma o punto)
        const numberMatch = cleanText.match(/^(\d+(?:[.,]\d+)?)/);

        if (!numberMatch) {
            logWarn('❌ No se encontró número válido:', {
                original: text,
                cleaned: cleanText
            });
            return null;
        }

        let numberStr = numberMatch[1];

        // Convertir coma decimal a punto si es necesario
        if (numberStr.includes(',')) {
            // Solo reemplazar si parece ser un decimal (ej: "2,5" no "1,234")
            const parts = numberStr.split(',');
            if (parts.length === 2 && parts[1].length <= 2) {
                numberStr = numberStr.replace(',', '.');
            }
        }

        const result = parseFloat(numberStr);

        if (isNaN(result)) {
            logWarn('❌ Formato numérico no válido después de extracción:', {
                original: text,
                cleaned: cleanText,
                extracted: numberStr
            });
            return null;
        }

        logDebug('✅ Número extraído de propiedad:', {
            original: text,
            extracted: numberStr,
            result: result
        });

        return result;
    }

    /**
     * ✅ MEJORADO: Parser específico para formato numérico chileno (precios/medidas)
     * Maneja correctamente:
     * - "UF 6.900" -> 6900 (punto como separador de miles)
     * - "UF 6,5" -> 6.5 (coma como separador decimal)
     * - "1.234.567,89" -> 1234567.89 (formato europeo)
     * - "$2.300.000" -> 2300000 (pesos chilenos)
     */
    static parseChileanNumber(text, prefix = null) {
        if (!text || typeof text !== 'string') return null;

        let cleanText = text.trim();

        // Eliminar prefijos comunes
        if (prefix === 'UF') {
            cleanText = cleanText.replace(/UF\s*/gi, '');
        } else {
            // Eliminar otros prefijos monetarios
            cleanText = cleanText.replace(/[$UF\s]/gi, '');
        }

        cleanText = cleanText.trim();

        // Casos especiales para formato chileno
        const hayPunto = cleanText.includes('.');
        const hayComa = cleanText.includes(',');

        if (hayPunto && !hayComa) {
            // Solo punto: determinar si es separador de miles o decimal
            const partes = cleanText.split('.');

            if (partes.length === 2) {
                const parteDecimal = partes[1];

                // Si la parte después del punto tiene exactamente 3 dígitos, es separador de miles
                if (parteDecimal.length === 3 && /^\d{3}$/.test(parteDecimal)) {
                    // Formato: "6.900" -> 6900
                    cleanText = partes[0] + partes[1];
                }
                // Si tiene 1-2 dígitos, es decimal
                else if (parteDecimal.length <= 2 && /^\d{1,2}$/.test(parteDecimal)) {
                    // Formato: "6.5" -> 6.5 (mantener como está)
                    cleanText = cleanText;
                }
            } else if (partes.length > 2) {
                // Múltiples puntos: formato "1.234.567" -> separadores de miles
                cleanText = partes.join('');
            }
        } else if (hayComa && hayPunto) {
            // Ambos: formato europeo "1.234.567,89"
            const partes = cleanText.split(',');
            if (partes.length === 2) {
                // Eliminar puntos (separadores de miles) y usar coma como decimal
                const parteEntera = partes[0].replace(/\./g, '');
                const parteDecimal = partes[1];
                cleanText = parteEntera + '.' + parteDecimal;
            }
        } else if (hayComa && !hayPunto) {
            // Solo coma: usar como separador decimal
            cleanText = cleanText.replace(',', '.');
        }

        // Validar que solo contiene dígitos y máximo un punto decimal
        if (!/^\d+(\.\d+)?$/.test(cleanText)) {
            logWarn('❌ Formato numérico no válido:', {
                original: text,
                cleaned: cleanText
            });
            return null;
        }

        const result = parseFloat(cleanText);

        logDebug('✅ Número chileno procesado:', {
            original: text,
            cleaned: cleanText,
            result: result,
            type: prefix || 'number'
        });

        return isNaN(result) ? null : result;
    }

    // Ejemplo de uso:
    // Para descripciones de propiedades:
    // extractPropertyNumber("4 dormitorios") -> 4
    // extractPropertyNumber("2,5 baños") -> 2.5
    // extractPropertyNumber("184 m2 totales") -> 184

    // Para precios/medidas:
    // parseChileanNumber("UF 6.900", "UF") -> 6900
    // parseChileanNumber("$2.300.000") -> 2300000

    static calculateDataCompleteness(orchestrationData) {
        const completeness = {
            property: orchestrationData.dataQuality.property ? 100 : 0,
            comparables: orchestrationData.dataQuality.comparables ? 100 : 0,
            mortgage: orchestrationData.dataQuality.mortgage ? 100 : 0
        };

        const avg = Object.values(completeness).reduce((a, b) => a + b) / 3;
        return Math.round(avg);
    }

    static calculateOverallConfidence(analysisData, isClaudeSuccess) {
        if (isClaudeSuccess && analysisData.resumenEjecutivo?.confianza) {
            return analysisData.resumenEjecutivo.confianza;
        }
        return isClaudeSuccess ? 85 : 60;
    }

    static calculateConfidenceScore(orchestrationData, claudeAnalysis) {
        let score = 0;
        score += orchestrationData.overallQuality * 60;

        if (claudeAnalysis.success && !claudeAnalysis.metadata?.fallbackUsed) {
            score += 30;
        } else if (claudeAnalysis.success) {
            score += 15;
        }

        const dataCompleteness = [
            orchestrationData.dataQuality.property,
            orchestrationData.dataQuality.comparables,
            orchestrationData.dataQuality.mortgage
        ].filter(Boolean).length / 3;

        score += dataCompleteness * 10;
        return Math.min(Math.round(score), 100);
    }

    /**
     * ✅ CORREGIDO: Generar análisis con Claude API real
     */
    static async generateClaudeAnalysis(inputData) {
        try {
            logInfo('🧠 Iniciando análisis con Claude API real', {
                hasProperty: !!inputData.propertyInfo,
                hasComparables: !!inputData.marketComparison,
                hasMortgage: !!inputData.mortgageAnalysis
            });

            // ✅ CORREGIDO: Llamar al método correcto de ClaudeApiHelper
            const claudeResult = await ClaudeApiHelper.generateFinancialAnalysis(inputData, {
                analysisType: 'financial',
                requestId: this.generateRequestId()
            });

            logInfo('🧠 Claude result:', {
                success: claudeResult.success,
                hasAnalysis: !!claudeResult.analysis,
                error: claudeResult.error || 'No error'
            });

            if (claudeResult.success) {
                logInfo('✅ Análisis Claude completado exitosamente');
                return claudeResult;
            } else {
                logWarn('⚠️ Claude API falló, usando análisis de respaldo', {
                    claudeError: claudeResult.error
                });
                return this.generateFallbackAnalysis(inputData);
            }

        } catch (error) {
            logError('❌ Error en análisis con Claude', {
                error: error.message,
                stack: error.stack?.split('\n')[0]
            });

            return this.generateFallbackAnalysis(inputData);
        }
    }

    /**
     * ✅ CORREGIDO: Generar análisis de respaldo con nueva estructura
     */
    static generateFallbackAnalysis(inputData) {
        logInfo('🔄 Generando análisis de respaldo con cálculos correctos');

        // ✅ Calcular métricas reales para el fallback
        const metricas = this.calculateFinancialMetrics(
            inputData.propertyInfo,
            inputData.mortgageAnalysis,
            inputData.marketComparison
        );

        // ✅ NUEVA ESTRUCTURA: Consistente con el prompt corregido
        const fallbackAnalysis = {
            indicadoresFinancieros: {
                flujoCajaMensual: metricas.flujoCajaMensual,
                yieldBruto: metricas.yieldBruto,
                yieldNeto: metricas.yieldNeto,
                capRate: metricas.capRate,
                puntoEquilibrio: metricas.puntoEquilibrio,
                plusvaliaEsperada: metricas.plusvaliaEsperada
            },
            analisisUbicacion: {
                educacion: [],
                areasVerdes: [],
                comercio: [],
                salud: []
            },
            analisisSeguridad: {
                indiceSeguridad: 0,
                detalleSeguridad: {
                    factores: [],
                    clasificacion: "No disponible"
                },
                serviciosEmergencia: {
                    tiempoRespuesta: "No disponible",
                    detalles: []
                },
                riesgosNaturales: {
                    nivel: "No disponible",
                    detalles: []
                }
            },
            resumenEjecutivo: {
                viabilidadInversion: {
                    decision: "Datos insuficientes",
                    justificacion: "Análisis imposible sin datos básicos",
                    nivelRiesgo: "No evaluable",
                    puntosACavor: []
                },
                optimizacionFinanciera: {
                    recomendacion: "Se requieren datos completos",
                    ventajas: [],
                    bancoRecomendado: "No disponible",
                    plazoOptimo: "No disponible"
                },
                potencialCrecimiento: {
                    proyeccion: "No disponible sin datos completos",
                    factores: [],
                    roi: "No calculable"
                },
                recomendacionFinal: {
                    accion: "EVALUAR",
                    resumen: "Se requieren datos adicionales",
                    siguientesPasos: [
                        "Verificar datos completos de la propiedad",
                        "Obtener comparables del mercado",
                        "Consultar condiciones de financiamiento",
                        "Evaluar capacidad de pago personal"
                    ]
                }
            }
        };

        return {
            success: true,
            analysis: fallbackAnalysis,
            metadata: {
                provider: 'Fallback Analysis',
                model: 'Rule-based system',
                fallbackUsed: true,
                processingTime: '0ms',
                analysisType: 'financial',
                timestamp: new Date().toISOString(),
                quality: 'basic'
            }
        };
    }

    static calculateFallbackYield(inputData) {
        if (inputData.mortgageAnalysis?.bestOption) {
            return 6.2;
        }
        return 5.5;
    }

    static generateRequestId() {
        return `anthropic_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    static calculateFinancialMetrics(propertyData, mortgageData, comparablesData, gastosUnicos = null) {
        try {
            logInfo('📊 Iniciando cálculo de métricas financieras CORREGIDO con gastos separados');

            // 1. EXTRAER DATOS BÁSICOS
            const precioPropiedad = this.extractPropertyPrice(propertyData);
            const precioUF = 39250;
            const valorPropiedadPesos = precioPropiedad * precioUF;
            const dividendoMensual = this.extractBestMortgagePayment(mortgageData);
            const arriendoEstimado = this.calculateEstimatedRent(comparablesData);

            // 2. ✅ CALCULAR SOLO GASTOS MENSUALES (gastos únicos vienen como parámetro)
            const gastosOperacionalesMensuales = this.calculateMonthlyOperationalExpenses(
                valorPropiedadPesos,
                arriendoEstimado,
                false, // usaCorretor para administración
                false  // incluyeGastosComunes
            );

            // 3. ✅ CALCULAR FLUJO DE CAJA CORREGIDO (solo gastos mensuales)
            const flujoCajaMensual = arriendoEstimado - gastosOperacionalesMensuales.total - dividendoMensual;

            // 4. CALCULAR YIELDS CORREGIDOS
            const yieldBruto = (arriendoEstimado * 12 / valorPropiedadPesos) * 100;
            const arriendoNeto = arriendoEstimado - gastosOperacionalesMensuales.total;
            const yieldNeto = (arriendoNeto * 12 / valorPropiedadPesos) * 100;

            // 5. LOG COMPARATIVO ANTES/DESPUÉS
            logInfo('💰 ✅ CORRECCIÓN APLICADA - Comparación flujo de caja:', {
                errorAnterior: 'Incluía gastos únicos en flujo mensual',
                flujoCorregido: this.formatCurrency(flujoCajaMensual),
                gastosUnicosTotal: gastosUnicos ? this.formatCurrency(gastosUnicos.total) : 'Recibidos como parámetro',
                gastosOperacionalesMensuales: this.formatCurrency(gastosOperacionalesMensuales.total),
                impactoCorrecion: flujoCajaMensual > 0 ? '✅ POSITIVO' : '❌ REQUIERE APORTE',
                mejora: 'Separación correcta de gastos únicos vs mensuales - SIN duplicación'
            });

            // 6. RETORNAR ESTRUCTURA COMPLETA
            return {
                flujoCajaMensual: {
                    valor: flujoCajaMensual,
                    composicion: {
                        arriendoEstimado,
                        gastosOperacionalesMensuales: gastosOperacionalesMensuales.total,
                        dividendoHipotecario: dividendoMensual
                    }
                },
                yieldBruto,
                yieldNeto,
                capRate: yieldNeto,
                puntoEquilibrio: gastosOperacionalesMensuales.total + dividendoMensual,
                plusvaliaEsperada: 4.2,
                // ✅ USAR GASTOS ÚNICOS PASADOS COMO PARÁMETRO (no calcular internamente)
                desgloseGastos: {
                    gastosUnicos: gastosUnicos || {
                        total: 0,
                        conceptos: {},
                        metadata: { fuente: 'no_disponible', nota: 'Gastos únicos no proporcionados' }
                    },
                    gastosOperacionalesMensuales: gastosOperacionalesMensuales
                }
            };

        } catch (error) {
            logError('❌ Error en cálculo de métricas financieras corregido', error);
            return null;
        }
    }


    static calculateOneTimeAcquisitionCosts(montoCredito, valorPropiedadPesos, mortgageData, usaCorretor = false) {
        const methodName = 'calculateOneTimeAcquisitionCosts';

        try {
            // ✅ 1. VALIDACIÓN DEFENSIVA DE ENTRADA (implementación directa)
            const validationResult = (() => {
                const errors = [];

                // Validar montoCredito
                if (typeof montoCredito !== 'number' || isNaN(montoCredito) || montoCredito <= 0) {
                    errors.push('montoCredito debe ser un número positivo');
                }

                // Validar valorPropiedadPesos
                if (typeof valorPropiedadPesos !== 'number' || isNaN(valorPropiedadPesos) || valorPropiedadPesos <= 0) {
                    errors.push('valorPropiedadPesos debe ser un número positivo');
                }

                // Validar usaCorretor
                if (typeof usaCorretor !== 'boolean') {
                    errors.push('usaCorretor debe ser un boolean');
                }

                if (errors.length > 0) {
                    return { isValid: false, errors };
                }

                return {
                    isValid: true,
                    validatedMontoCredito: Math.round(montoCredito),
                    validatedValorPropiedad: Math.round(valorPropiedadPesos),
                    errors: []
                };
            })();

            if (!validationResult.isValid) {
                throw new Error(`Validación fallida: ${validationResult.errors.join(', ')}`);
            }

            const { validatedMontoCredito, validatedValorPropiedad } = validationResult;

            // ✅ 2. CONFIGURACIÓN SEGURA CON VALORES POR DEFECTO (valor directo)
            const precioUF = 39250; // Valor UF actual - reemplaza this.getCurrentUFValue()

            logInfo(`🔍 ${methodName} - Iniciando cálculo`, {
                montoCredito: validatedMontoCredito,
                valorPropiedad: validatedValorPropiedad,
                precioUF,
                usaCorretor,
                mortgageDataAvailable: !!mortgageData
            });

            // ✅ 3. CÁLCULOS CON VALIDACIÓN MATEMÁTICA (implementación directa de safeCalculation)
            const impuestoMutuo = (() => {
                try {
                    const result = Math.round(validatedMontoCredito * precioUF * 0.008);
                    if (typeof result !== 'number' || isNaN(result)) {
                        logWarn(`⚠️ Error en cálculo de impuestoMutuo, usando valor por defecto`);
                        return 0;
                    }
                    return Math.max(0, result);
                } catch (error) {
                    logWarn(`⚠️ Error en cálculo de impuestoMutuo, usando valor por defecto`, error);
                    return 0;
                }
            })();

            const gastosNotariales = 200000; // Valor fijo válido

            const conservadorBienes = (() => {
                try {
                    const result = Math.round(validatedValorPropiedad * 0.002);
                    if (typeof result !== 'number' || isNaN(result)) {
                        logWarn(`⚠️ Error en cálculo de conservadorBienes, usando valor por defecto`);
                        return 0;
                    }
                    return Math.max(0, result);
                } catch (error) {
                    logWarn(`⚠️ Error en cálculo de conservadorBienes, usando valor por defecto`, error);
                    return 0;
                }
            })();

            // ✅ 4. EXTRACCIÓN SEGURA DE DATOS BANCARIOS (implementación directa)
            const tasacionData = (() => {
                try {
                    if (mortgageData?.escenarios?.length > 0) {
                        // Buscar en el mejor escenario (preferir 30 años)
                        const mejorEscenario = mortgageData.escenarios.find(e => e.escenario.plazo === 30) ||
                            mortgageData.escenarios[0];

                        const tasacionStr = mejorEscenario?.resultado?.mejorOferta?.detalle?.valoresUnicaVez?.['Tasación'];

                        if (tasacionStr) {
                            const tasacionMatch = tasacionStr.match(/\$?([\d,]+)/);
                            if (tasacionMatch) {
                                const tasacionParsed = parseInt(tasacionMatch[1].replace(/,/g, ''));
                                if (!isNaN(tasacionParsed) && tasacionParsed > 0) {
                                    return {
                                        valor: tasacionParsed,
                                        descripcion: 'Tasación de la propiedad',
                                        fuente: 'mortgage_data_real',
                                        rango: '$60,000 - $150,000'
                                    };
                                }
                            }
                        }
                    }
                } catch (error) {
                    logDebug('ℹ️ Usando fallback para tasación', { error: error.message });
                }

                // Fallback
                const defaultValue = Math.round(precioUF * 2.7); // ~105,000
                return {
                    valor: defaultValue,
                    descripcion: 'Tasación de la propiedad',
                    fuente: 'default_calculation',
                    rango: '$60,000 - $150,000'
                };
            })();

            const estudioTitulosData = (() => {
                try {
                    if (mortgageData?.escenarios?.length > 0) {
                        // Buscar en el mejor escenario
                        const mejorEscenario = mortgageData.escenarios.find(e => e.escenario.plazo === 30) ||
                            mortgageData.escenarios[0];

                        const estudioStr = mejorEscenario?.resultado?.mejorOferta?.detalle?.valoresUnicaVez?.['Estudio de título'];

                        if (estudioStr) {
                            const estudioMatch = estudioStr.match(/\$?([\d,]+)/);
                            if (estudioMatch) {
                                const estudioParsed = parseInt(estudioMatch[1].replace(/,/g, ''));
                                if (!isNaN(estudioParsed) && estudioParsed > 0) {
                                    return {
                                        valor: estudioParsed,
                                        descripcion: 'Estudio de Títulos',
                                        fuente: 'mortgage_data_real',
                                        rango: '$100,000 - $250,000'
                                    };
                                }
                            }
                        }
                    }
                } catch (error) {
                    logDebug('ℹ️ Usando fallback para estudio de títulos', { error: error.message });
                }

                // Fallback
                const defaultValue = Math.round(precioUF * 4.5); // ~175,000
                return {
                    valor: defaultValue,
                    descripcion: 'Estudio de Títulos',
                    fuente: 'default_calculation',
                    rango: '$100,000 - $250,000'
                };
            })();

            const gestionBancaria = Math.round(precioUF * 1.0); // 1 UF

            // ✅ 5. COMISIÓN CORREDOR CON VALIDACIÓN (implementación directa)
            const comisionCorretor = usaCorretor ? (() => {
                try {
                    const comisionBase = validatedValorPropiedad * 0.02; // 2%
                    const iva = comisionBase * 0.19; // 19% IVA
                    return Math.round(comisionBase + iva);
                } catch (error) {
                    logWarn('⚠️ Error calculando comisión corredor, usando 0', error);
                    return 0;
                }
            })() : 0;

            // ✅ 6. CÁLCULO TOTAL CON VERIFICACIÓN
            const componentes = [
                impuestoMutuo,
                gastosNotariales,
                conservadorBienes,
                tasacionData.valor,
                estudioTitulosData.valor,
                gestionBancaria,
                comisionCorretor
            ];

            const totalGastos = componentes.reduce((sum, valor) => {
                if (typeof valor !== 'number' || isNaN(valor)) {
                    logWarn(`⚠️ Valor inválido detectado en componentes: ${valor}`);
                    return sum;
                }
                return sum + valor;
            }, 0);

            // ✅ 7. ESTRUCTURA DE RESPUESTA COMPLETA (EXACTAMENTE IGUAL)
            const desglose = {
                total: totalGastos,
                conceptos: {
                    impuestoMutuo: {
                        valor: impuestoMutuo,
                        descripcion: 'Impuesto al Mutuo (0.8% del crédito)',
                        aplicaSolo: 'con crédito hipotecario',
                        calculoBase: `${validatedMontoCredito} UF × ${precioUF} × 0.008`
                    },
                    gastosNotariales: {
                        valor: gastosNotariales,
                        descripcion: 'Gastos Notariales',
                        rango: '$150,000 - $250,000'
                    },
                    conservadorBienes: {
                        valor: conservadorBienes,
                        descripcion: 'Conservador de Bienes Raíces',
                        criterio: 'según valor propiedad',
                        calculoBase: `${validatedValorPropiedad} × 0.002`
                    },
                    tasacion: tasacionData,
                    estudioTitulos: estudioTitulosData,
                    gestionBancaria: {
                        valor: gestionBancaria,
                        descripcion: 'Gestión Bancaria/Operación',
                        rango: '$100,000 - $250,000'
                    },
                    comisionCorretor: {
                        valor: comisionCorretor,
                        descripcion: 'Comisión del Corredor (2% + IVA)',
                        aplicaSolo: usaCorretor ? 'incluida' : 'no incluida',
                        tipoGasto: 'ÚNICO'
                    }
                },
                metadata: {
                    calculationMethod: 'validated',
                    precioUFUtilizado: precioUF,
                    timestamp: new Date().toISOString()
                }
            };

            // ✅ 8. LOGGING EXITOSO CON DETALLES (EXACTAMENTE IGUAL)
            logInfo(`✅ ${methodName} - Cálculo completado exitosamente`, {
                total: this.formatCurrency(totalGastos),
                componentesCalculados: componentes.length,
                fuenteTasacion: tasacionData.fuente,
                fuenteEstudio: estudioTitulosData.fuente,
                usaCorretor,
                porcentajeDelValor: ((totalGastos / validatedValorPropiedad) * 100).toFixed(2) + '%'
            });

            return desglose;

        } catch (error) {
            // ✅ 9. LOGGING DE ERROR MEJORADO CON CONTEXTO COMPLETO (EXACTAMENTE IGUAL)
            const errorContext = {
                methodName,
                inputData: {
                    montoCredito: typeof montoCredito,
                    valorPropiedadPesos: typeof valorPropiedadPesos,
                    mortgageDataExists: !!mortgageData,
                    usaCorretor
                },
                errorMessage: error.message,
                errorStack: error.stack,
                timestamp: new Date().toISOString()
            };

            logError(`❌ ${methodName} - Error detallado`, error, errorContext);

            // ✅ 10. FALLBACK SEGURO CON LOGGING (EXACTAMENTE IGUAL)
            const fallbackTotal = Math.round((valorPropiedadPesos || 100000000) * 0.06);

            logWarn(`🔄 ${methodName} - Usando cálculo fallback`, {
                fallbackTotal: this.formatCurrency(fallbackTotal),
                fallbackPercentage: '6% del valor de propiedad'
            });

            return {
                total: fallbackTotal,
                conceptos: {},
                error: 'Usado cálculo simplificado por error',
                errorDetails: {
                    originalError: error.message,
                    fallbackMethod: 'percentage_based',
                    timestamp: new Date().toISOString()
                }
            };
        }
    }

    // ✅ MÉTODOS AUXILIARES REQUERIDOS:

    /**
     * Validación robusta de parámetros de entrada
     */
    static validateCalculationInputs({ montoCredito, valorPropiedadPesos, usaCorretor }) {
        const errors = [];

        // Validar montoCredito
        if (typeof montoCredito !== 'number' || isNaN(montoCredito) || montoCredito <= 0) {
            errors.push('montoCredito debe ser un número positivo');
        }

        // Validar valorPropiedadPesos
        if (typeof valorPropiedadPesos !== 'number' || isNaN(valorPropiedadPesos) || valorPropiedadPesos <= 0) {
            errors.push('valorPropiedadPesos debe ser un número positivo');
        }

        // Validar usaCorretor
        if (typeof usaCorretor !== 'boolean') {
            errors.push('usaCorretor debe ser un boolean');
        }

        if (errors.length > 0) {
            return { isValid: false, errors };
        }

        return {
            isValid: true,
            validatedMontoCredito: Math.round(montoCredito),
            validatedValorPropiedad: Math.round(valorPropiedadPesos),
            errors: []
        };
    }

    /**
     * Cálculo matemático seguro con manejo de errores
     */
    static safeCalculation(calculationFn, componentName) {
        try {
            const result = calculationFn();
            if (typeof result !== 'number' || isNaN(result)) {
                throw new Error(`Resultado inválido para ${componentName}: ${result}`);
            }
            return Math.max(0, result); // Asegurar que no sea negativo
        } catch (error) {
            logWarn(`⚠️ Error en cálculo de ${componentName}, usando valor por defecto`, error);
            return 0;
        }
    }

    /**
     * Obtener valor UF dinámico (reemplazar valor hardcodeado)
     */
    static getCurrentUFValue() {
        // TODO: Implementar llamada a API de UF o configuración dinámica
        return 39250; // Valor temporal, pero ahora centralizado
    }


    /**
 * ✅ MÉTODO CORREGIDO: extractEstudioTitulosSafely
 */
    static extractEstudioTitulosSafely(mortgageData, precioUF) {
        try {
            const extractedValue = this.extractEstudioTitulosFromMortgage(mortgageData);
            if (extractedValue && extractedValue > 0) {
                return {
                    valor: extractedValue,
                    descripcion: 'Estudio de Títulos',
                    fuente: 'mortgage_data_real', // ✅ ACTUALIZADO
                    rango: '$100,000 - $250,000'
                };
            }
        } catch (error) {
            logDebug('ℹ️ Usando fallback para estudio de títulos', { error: error.message });
        }

        // Fallback
        const defaultValue = Math.round(precioUF * 3.5);
        return {
            valor: defaultValue,
            descripcion: 'Estudio de Títulos',
            fuente: 'default_calculation',
            rango: '$100,000 - $250,000'
        };
    }

    /**
     * ✅ NUEVO MÉTODO: extractEstudioTitulosFromMortgage
     * Extrae estudio de títulos desde mortgage data real
     */
    static extractEstudioTitulosFromMortgage(mortgageData) {
        if (!mortgageData?.escenarios) {
            throw new Error('No mortgage data available');
        }

        // Buscar en todos los escenarios
        for (const escenario of mortgageData.escenarios) {
            const detalle = escenario?.resultado?.resumenComparativo?.mejorOferta?.detalle;
            const estudioTitulos = detalle?.valoresUnicaVez?.['Estudio de título'] ||
                detalle?.valoresUnicaVez?.['Estudio de títulos'];

            if (estudioTitulos) {
                // Extraer valor en pesos: "UF 4,17 (equivale a $163.766)"
                const matchPesos = estudioTitulos.match(/\$?([\d.,]+)/);
                if (matchPesos) {
                    const valor = this.parseChileanNumber(matchPesos[1]);
                    if (valor > 0) {
                        logDebug('✅ Estudio de títulos extraído desde mortgage data', {
                            escenario: escenario.escenario?.plazo,
                            estudioTexto: estudioTitulos,
                            valorExtraido: this.formatCurrency(valor)
                        });
                        return valor;
                    }
                }
            }
        }

        throw new Error('Estudio de títulos no encontrado en mortgage data');
    }

    /**
     * Cálculo seguro de comisión corredor
     */
    static calculateComisionCorretor(valorPropiedadPesos) {
        try {
            const comisionBase = valorPropiedadPesos * 0.02; // 2%
            const iva = comisionBase * 0.19; // 19% IVA
            return Math.round(comisionBase + iva);
        } catch (error) {
            logWarn('⚠️ Error calculando comisión corredor', error);
            return Math.round(valorPropiedadPesos * 0.024); // 2.4% aproximado con IVA
        }
    }

    /**
     * ✅ REEMPLAZAR: Método buildFinancialMetrics para usar cálculos reales
     */
    static buildFinancialMetrics(propertyData, mortgageData, comparablesData = null) {
        // ✅ Ahora usa cálculos reales en lugar de valores hardcodeados
        const metrics = this.calculateFinancialMetrics(propertyData, mortgageData, comparablesData);

        logInfo('🏗️ Métricas financieras construidas con cálculos reales', {
            flujoCaja: metrics.flujoCajaMensual?.valor,
            yieldBruto: metrics.yieldBruto,
            yieldNeto: metrics.yieldNeto
        });

        return {
            yieldBruto: metrics.yieldBruto || 0,
            yieldNeto: metrics.yieldNeto || 0,
            capRate: metrics.capRate || 0,
            roi: this.calculateROI(metrics),
            paybackPeriod: this.calculatePaybackPeriod(metrics),
            flujoCajaMensual: metrics.flujoCajaMensual?.valor || 0,
            composicion: metrics.flujoCajaMensual?.composicion || {}
        };
    }

    static extractPropertyPrice(propertyData) {
        if (!propertyData?.precio_uf) {
            logWarn('⚠️ Sin precio_uf, usando valor por defecto');
            return 9200; // Valor por defecto
        }

        logDebug('🔍 Procesando precio_uf:', {
            original: propertyData.precio_uf
        });

        let cleanPrice = String(propertyData.precio_uf);

        // ✅ CORREGIDO: Manejar formato chileno correctamente
        // En Chile: "UF 6.900" = 6900 UF (el punto es separador de miles)
        // En Chile: "UF 6,9" = 6.9 UF (la coma es separador decimal)

        // 1. Eliminar prefijos y espacios
        cleanPrice = cleanPrice.replace(/UF\s*/gi, '').trim();

        // 2. Identificar si el punto es separador de miles o decimal
        const hayPunto = cleanPrice.includes('.');
        const hayComa = cleanPrice.includes(',');

        if (hayPunto && !hayComa) {
            // Casos: "6.900", "1.500", "9.200" -> separador de miles
            const partes = cleanPrice.split('.');
            if (partes.length === 2 && partes[1].length === 3) {
                // Es separador de miles: "6.900" -> 6900
                cleanPrice = partes[0] + partes[1];
            } else {
                // Es decimal: "6.5" -> 6.5 
                cleanPrice = cleanPrice;
            }
        } else if (hayComa && hayPunto) {
            // Formato europeo: "1.234,56" -> eliminar puntos, coma como decimal
            cleanPrice = cleanPrice.replace(/\./g, '').replace(',', '.');
        } else if (hayComa && !hayPunto) {
            // Solo coma: "6,5" -> 6.5 (decimal)
            cleanPrice = cleanPrice.replace(',', '.');
        }
        // Si no hay punto ni coma, usar como está

        // 3. Convertir a número
        const price = parseFloat(cleanPrice);

        logDebug('✅ Precio procesado:', {
            original: propertyData.precio_uf,
            cleaned: cleanPrice,
            result: price,
            interpretation: `${price} UF`
        });

        if (isNaN(price) || price <= 0) {
            logWarn('⚠️ Precio inválido, usando valor por defecto', {
                original: propertyData.precio_uf,
                cleaned: cleanPrice
            });
            return 9200;
        }

        return price;
    }


    /**
 * ✅ MÉTODO CORREGIDO: extractBestMortgagePayment 
 * Extrae el dividendo real del mortgage data disponible
 */
    static extractBestMortgagePayment(mortgageData) {
        if (!mortgageData?.escenarios) {
            logWarn('⚠️ Sin datos de hipoteca, usando valor por defecto');
            return 1840825;
        }

        // ✅ CORREGIDO: Buscar escenario de 30 años (preferido)
        const scenario30 = mortgageData.escenarios.find(e => e.escenario?.plazo === 30);

        if (scenario30?.resultado?.resumenComparativo?.mejorOferta?.dividendoMensual) {
            const dividendoTexto = scenario30.resultado.resumenComparativo.mejorOferta.dividendoMensual;
            const dividendo = this.parseAmount(dividendoTexto);
            if (dividendo > 0) {
                logDebug('✅ Dividendo extraído de escenario 30 años', {
                    banco: scenario30.resultado.resumenComparativo.mejorOferta.banco,
                    dividendo: dividendoTexto,
                    dividendoParsed: this.formatCurrency(dividendo)
                });
                return dividendo;
            }
        }

        // ✅ CORREGIDO: Fallback al escenario con mejor oferta disponible
        for (const escenario of mortgageData.escenarios) {
            if (escenario?.resultado?.resumenComparativo?.mejorOferta?.dividendoMensual) {
                const dividendoTexto = escenario.resultado.resumenComparativo.mejorOferta.dividendoMensual;
                const dividendo = this.parseAmount(dividendoTexto);
                if (dividendo > 0) {
                    logDebug('✅ Dividendo extraído de escenario disponible', {
                        plazo: escenario.escenario?.plazo,
                        banco: escenario.resultado.resumenComparativo.mejorOferta.banco,
                        dividendo: dividendoTexto
                    });
                    return dividendo;
                }
            }
        }

        logWarn('⚠️ No se pudo extraer dividendo real de mortgage data, usando valor por defecto');
        return 1840825;
    }


    static calculateEstimatedRent(comparablesData) {
        if (!comparablesData || !Array.isArray(comparablesData)) {
            logWarn('⚠️ Sin datos de comparables, usando valor por defecto');
            return 2300000;
        }

        // ✅ CORREGIDO: Convertir todos los valores a pesos chilenos
        const validRents = comparablesData
            .map(comp => {
                if (!comp.precio) return null;

                // Determinar si está en UF o pesos
                const isUF = comp.moneda === 'UF' ||
                    comp.precio_completo?.includes('UF') ||
                    (comp.precio_uf && comp.precio_uf !== null);

                let rentValue;

                if (isUF) {
                    // Convertir UF a pesos
                    const ufValue = this.parseChileanNumber(comp.precio, 'UF');
                    rentValue = ufValue ? ufValue * 39250 : null; // UF × valor UF

                    logDebug('✅ Comparable UF convertido:', {
                        original: comp.precio,
                        ufValue,
                        pesoValue: rentValue
                    });
                } else {
                    // Ya está en pesos
                    rentValue = this.parseChileanNumber(comp.precio);

                    logDebug('✅ Comparable en pesos:', {
                        original: comp.precio,
                        pesoValue: rentValue
                    });
                }

                // Validar rango razonable (entre $500K y $10M)
                return (rentValue && rentValue > 500000 && rentValue < 10000000) ? rentValue : null;
            })
            .filter(rent => rent !== null);

        if (validRents.length === 0) {
            logWarn('⚠️ Sin arriendos válidos en comparables, usando valor por defecto');
            return 2300000;
        }

        // Calcular promedio, excluyendo outliers
        const sortedRents = validRents.sort((a, b) => a - b);
        const q1Index = Math.floor(sortedRents.length * 0.25);
        const q3Index = Math.floor(sortedRents.length * 0.75);
        const filteredRents = sortedRents.slice(q1Index, q3Index + 1);

        const averageRent = Math.round(
            filteredRents.reduce((sum, rent) => sum + rent, 0) / filteredRents.length
        );

        logInfo('✅ Arriendo promedio calculado con conversión UF-CLP:', {
            totalComparables: comparablesData.length,
            validRents: validRents.length,
            usedForAverage: filteredRents.length,
            averageRent: this.formatCurrency(averageRent),
            rentRange: `${this.formatCurrency(Math.min(...filteredRents))} - ${this.formatCurrency(Math.max(...filteredRents))}`
        });

        return averageRent;
    }

    /**
     * ✅ NUEVO: Validar métricas calculadas
     */
    static validateCalculatedMetrics(metrics) {
        const { flujoCajaMensual, yieldBruto, yieldNeto, arriendoEstimado, gastosOperacionales, dividendoMensual } = metrics;

        // Validar flujo de caja
        const expectedFlow = arriendoEstimado - gastosOperacionales - dividendoMensual;
        if (Math.abs(flujoCajaMensual - expectedFlow) > 1) {
            logError('❌ Error en cálculo de flujo de caja', {
                calculated: flujoCajaMensual,
                expected: expectedFlow,
                difference: Math.abs(flujoCajaMensual - expectedFlow)
            });
            throw new Error(`Inconsistencia en flujo de caja: calculado=${flujoCajaMensual}, esperado=${expectedFlow}`);
        }

        // Validar yields razonables
        if (yieldBruto < 0 || yieldBruto > 20) {
            logWarn('⚠️ Yield bruto fuera de rango normal', { yieldBruto });
        }

        if (yieldNeto < 0 || yieldNeto > 15) {
            logWarn('⚠️ Yield neto fuera de rango normal', { yieldNeto });
        }

        logInfo('✅ Validación de métricas completada exitosamente');
    }

    /**
     * ✅ CORREGIR: Generar métricas de fallback con valores correctos
     */
    static generateFallbackFinancialMetrics() {
        logWarn('⚠️ Usando métricas de fallback con cálculo correcto');

        // Datos de fallback con cálculo correcto
        const arriendoFallback = 2300000;
        const gastosFallback = Math.round(arriendoFallback * 0.18); // 414,000
        const dividendoFallback = 1840825;

        // ✅ CÁLCULO CORRECTO DEL FLUJO
        const flujoFallback = arriendoFallback - gastosFallback - dividendoFallback; // 45,175

        return {
            flujoCajaMensual: {
                valor: flujoFallback, // 45,175 (POSITIVO)
                composicion: {
                    ingresoArriendo: arriendoFallback,
                    gastosOperacionales: gastosFallback,
                    dividendoHipotecario: dividendoFallback
                }
            },
            yieldBruto: 7.6,
            yieldNeto: 6.6,
            capRate: 6.6,
            puntoEquilibrio: gastosFallback + dividendoFallback,
            plusvaliaEsperada: 3.5
        };
    }

    /**
     * ✅ NUEVO: Métodos auxiliares de cálculo
     */
    static calculateROI(metrics) {
        if (!metrics.yieldNeto) return 0;
        return Math.round(metrics.yieldNeto * 1.2 * 100) / 100; // ROI aproximado
    }

    static calculatePaybackPeriod(metrics) {
        if (!metrics.yieldNeto || metrics.yieldNeto <= 0) return 0;
        return Math.round(100 / metrics.yieldNeto); // Años para recuperar inversión
    }

    static parseAmount(amountString) {
        if (!amountString) return 0;

        // Usar el nuevo parser chileno
        const result = this.parseChileanNumber(amountString);
        return result || 0;
    }

    static formatCurrency(amount) {
        return new Intl.NumberFormat('es-CL', {
            style: 'currency',
            currency: 'CLP',
            minimumFractionDigits: 0
        }).format(amount);
    }

    static estimatePlusvaliaByLocation(ubicacion) {
        if (!ubicacion) return 3.0;

        const locationLower = ubicacion.toLowerCase();

        // Zonas premium
        if (locationLower.includes('las condes') ||
            locationLower.includes('vitacura') ||
            locationLower.includes('providencia')) {
            return 4.0;
        }

        // Zonas en desarrollo
        if (locationLower.includes('ñuñoa') ||
            locationLower.includes('la reina') ||
            locationLower.includes('santiago centro')) {
            return 3.5;
        }

        return 3.0; // Promedio nacional
    }

    /**
 * ✅ NUEVO: Generar análisis básico de ubicación
 */
    static generateBasicLocationAnalysis(property) {
        const ubicacion = property?.ubicacion || '';

        return {
            educacion: [
                {
                    nombre: "Instituciones educativas de la zona",
                    distancia: "Consultar directamente",
                    tipo: "Información no disponible",
                    descripcion: "Se recomienda investigar opciones locales"
                }
            ],
            salud: [
                {
                    nombre: "Centros de salud cercanos",
                    distancia: "Consultar directamente",
                    tipo: "Información no disponible",
                    descripcion: "Verificar servicios médicos disponibles"
                }
            ],
            comercio: [
                {
                    nombre: "Servicios comerciales",
                    distancia: "Consultar directamente",
                    tipo: "Información no disponible",
                    descripcion: "Evaluar disponibilidad de servicios básicos"
                }
            ],
            areasVerdes: [
                {
                    nombre: "Espacios recreativos",
                    distancia: "Consultar directamente",
                    tipo: "Información no disponible",
                    descripcion: "Investigar parques y áreas de esparcimiento"
                }
            ]
        };
    }

    /**
     * ✅ NUEVO: Generar análisis básico de seguridad
     */
    static generateBasicSecurityAnalysis(property) {
        return {
            indiceSeguridad: 5, // Neutral por falta de datos
            detalleSeguridad: {
                factores: [
                    "Datos de seguridad no disponibles",
                    "Se recomienda investigar la zona directamente",
                    "Consultar con residentes locales",
                    "Verificar estadísticas policiales"
                ],
                clasificacion: "No evaluado"
            },
            serviciosEmergencia: {
                tiempoRespuesta: "No disponible",
                detalles: [
                    "Carabineros: Consultar comisaría más cercana",
                    "Bomberos: Verificar estación local",
                    "Salud: Identificar hospital o clínica cercana"
                ]
            },
            riesgosNaturales: {
                nivel: "No evaluado",
                detalles: [
                    "Riesgo sísmico: Chile zona sísmica (verificar construcción)",
                    "Otros riesgos: Consultar con autoridades locales",
                    "Seguros: Verificar cobertura disponible"
                ]
            }
        };
    }

    /**
     * ✅ NUEVO: Generar resumen ejecutivo básico
     */
    static generateBasicExecutiveSummary(realMetrics, orchestrationData) {
        const flujoCaja = realMetrics?.flujoCajaMensual?.valor || 0;
        const yieldNeto = realMetrics?.yieldNeto || 0;

        const decision = this.getRecommendationFromMetrics(realMetrics);
        const riesgo = this.getRiskLevelFromMetrics(realMetrics);

        return {
            viabilidadInversion: {
                decision: decision,
                justificacion: this.getJustificationFromMetrics(realMetrics),
                nivelRiesgo: riesgo,
                puntosACavor: this.getPositivePoints(realMetrics)
            },
            optimizacionFinanciera: {
                recomendacion: "Análisis básico con datos disponibles",
                ventajas: realMetrics ? [
                    `Yield neto calculado: ${yieldNeto.toFixed(1)}%`,
                    `Flujo de caja: ${this.formatCurrency(flujoCaja)}`
                ] : [],
                bancoRecomendado: orchestrationData.mortgage?.escenarios?.[0]?.resultado?.mejorOferta?.banco || "A determinar",
                plazoOptimo: "30 años (estándar recomendado)"
            },
            potencialCrecimiento: {
                proyeccion: "Requiere análisis de mercado específico",
                factores: [
                    "Ubicación en zona establecida",
                    "Potencial según condiciones de mercado",
                    "Dependiente de factores macroeconómicos"
                ],
                roi: realMetrics ? `Estimado basado en métricas actuales` : "No calculable"
            },
            recomendacionFinal: {
                accion: decision,
                resumen: `Análisis basado en métricas financieras ${realMetrics ? 'calculadas' : 'limitadas'}`,
                siguientesPasos: [
                    "Completar análisis de mercado detallado",
                    "Verificar condiciones de financiamiento específicas",
                    "Evaluar capacidad de pago personal",
                    "Consultar con asesor inmobiliario profesional"
                ]
            }
        };
    }

    /**
     * ✅ NUEVO: Obtener recomendación desde métricas
     */
    static getRecommendationFromMetrics(metrics) {
        if (!metrics) return "EVALUAR";

        const flujoCaja = metrics.flujoCajaMensual?.valor || 0;
        const yieldNeto = metrics.yieldNeto || 0;

        if (flujoCaja > 0 && yieldNeto >= 6) return "RECOMENDADA";
        if (flujoCaja > 0 && yieldNeto >= 4) return "CONDICIONADA";
        if (flujoCaja < 0) return "NO RECOMENDADA";
        return "EVALUAR";
    }

    /**
     * ✅ NUEVO: Obtener nivel de riesgo desde métricas
     */
    static getRiskLevelFromMetrics(metrics) {
        if (!metrics) return "No evaluable";

        const flujoCaja = metrics.flujoCajaMensual?.valor || 0;
        const yieldNeto = metrics.yieldNeto || 0;

        if (flujoCaja > 100000 && yieldNeto >= 7) return "Bajo";
        if (flujoCaja > 0 && yieldNeto >= 5) return "Moderado";
        return "Alto";
    }

    /**
     * ✅ NUEVO: Obtener justificación desde métricas
     */
    static getJustificationFromMetrics(metrics) {
        if (!metrics) return "Datos insuficientes para evaluación completa";

        const flujoCaja = metrics.flujoCajaMensual?.valor || 0;
        const yieldNeto = metrics.yieldNeto || 0;

        if (flujoCaja > 0) {
            return `Flujo de caja positivo de ${this.formatCurrency(flujoCaja)} con yield neto del ${yieldNeto.toFixed(1)}%`;
        } else {
            return `Flujo de caja negativo de ${this.formatCurrency(Math.abs(flujoCaja))} requiere capital adicional mensual`;
        }
    }

    /**
     * ✅ NUEVO: Obtener puntos positivos desde métricas
     */
    static getPositivePoints(metrics) {
        if (!metrics) return [];

        const points = [];
        const flujoCaja = metrics.flujoCajaMensual?.valor || 0;
        const yieldNeto = metrics.yieldNeto || 0;
        const plusvalia = metrics.plusvaliaEsperada || 0;

        if (flujoCaja > 0) {
            points.push(`Flujo de caja positivo de ${this.formatCurrency(flujoCaja)}`);
        }

        if (yieldNeto >= 6) {
            points.push(`Yield neto competitivo del ${yieldNeto.toFixed(1)}%`);
        }

        if (plusvalia >= 3) {
            points.push(`Plusvalía esperada del ${plusvalia.toFixed(1)}% anual`);
        }

        return points;
    }

    /**
     * ✅ AUXILIAR: Encontrar el mejor escenario hipotecario (preferir 30 años)
     */
    static findBestMortgageScenario(mortgageData) {
        if (!mortgageData?.escenarios?.length) return null;

        // Preferir escenario de 30 años
        const escenario30 = mortgageData.escenarios.find(e => e.escenario?.plazo === 30);
        if (escenario30) return escenario30;

        // Si no hay 30 años, tomar el primer escenario disponible
        return mortgageData.escenarios[0];
    }


    static generateFallbackAnalysisWithDetailedGastos(orchestrationData, gastosCalculados) {
        logInfo('🔄 Generando análisis de fallback con gastos calculados');

        const metricas = this.calculateFinancialMetrics(
            orchestrationData.property,
            orchestrationData.mortgage,
            orchestrationData.comparables?.properties
        );

        return {
            indicadoresFinancieros: {
                flujoCajaMensual: {
                    valor: metricas?.flujoCajaMensual?.valor || 0,
                    composicion: {
                        ingresoArriendo: metricas?.flujoCajaMensual?.composicion?.arriendoEstimado || 0,
                        gastosOperacionales: {
                            total: gastosCalculados.gastosOperacionalesMensuales.total,
                            desglose: gastosCalculados.gastosOperacionalesMensuales.conceptos || {}
                        },
                        dividendoHipotecario: metricas?.flujoCajaMensual?.composicion?.dividendoHipotecario || 0
                    }
                },
                desgloseGastos: {
                    gastosUnicos: gastosCalculados.gastosUnicos,
                    gastosOperacionalesMensuales: gastosCalculados.gastosOperacionalesMensuales
                },
                yieldBruto: metricas?.yieldBruto || 0,
                yieldNeto: metricas?.yieldNeto || 0,
                capRate: metricas?.capRate || 0,
                puntoEquilibrio: metricas?.puntoEquilibrio || 0,
                plusvaliaEsperada: metricas?.plusvaliaEsperada || 0
            },
            analisisUbicacion: this.generateBasicLocationAnalysis(orchestrationData.property),
            analisisSeguridad: this.generateBasicSecurityAnalysis(orchestrationData.property),
            resumenEjecutivo: this.generateBasicExecutiveSummary(metricas, orchestrationData)
        };
    }

}

module.exports = AnthropicService;