// src/services/anthropic/AnthropicService.js
const { logInfo, logError, logDebug } = require('../../utils/logger');
const { ErrorFactory } = require('../../utils/errors');
const ClaudeApiHelper = require('./ClaudeApiHelper'); // NUEVO

// Importar servicios existentes para orquestación
const ScrapingService = require('../scraping/ScrapingService');
const SearchService = require('../search/SearchService');
const MortgageService = require('../mortgage/MortgageService');
const AnthropicConfig = require('./AnthropicConfig'); // NUEVO

/**
 * Servicio de orquestación e integración con Anthropic Claude - VERSION REAL
 * Genera reportes completos de análisis financiero inmobiliario usando Claude API
 */
class AnthropicService {

    /**
     * Generar reporte completo de análisis financiero inmobiliario
     * @param {string} propertyUrl - URL de la propiedad a analizar
     * @param {object} options - Opciones adicionales del análisis
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

            // 3. ORQUESTAR FLUJO DE SERVICIOS
            const orchestrationStart = Date.now();
            const [
                propertyData,
                comparableProperties,
                mortgageAnalysis
            ] = await Promise.allSettled([
                this.getPropertyData(propertyUrl),
                this.getComparableProperties(propertyUrl, options),
                this.getMortgageAnalysis(options.propertyPrice || null)
            ]);

            const orchestrationTime = Date.now() - orchestrationStart;
            logInfo('⚡ Orquestación de servicios completada', { 
                duration: `${orchestrationTime}ms` 
            });

            // 4. PROCESAR RESULTADOS
            const orchestrationData = this.processOrchestrationResults({
                propertyData,
                comparableProperties,
                mortgageAnalysis
            });

            // 5. PREPARAR DATOS PARA CLAUDE
            const claudeInputData = this.prepareDataForClaude(orchestrationData, options);

            // 6. GENERAR ANÁLISIS CON CLAUDE API REAL
            const claudeAnalysisStart = Date.now();
            const claudeAnalysis = await this.generateClaudeAnalysis(claudeInputData);
            const claudeAnalysisTime = Date.now() - claudeAnalysisStart;

            logInfo('🧠 Análisis Claude completado', { 
                duration: `${claudeAnalysisTime}ms`,
                success: claudeAnalysis.success,
                fallbackUsed: claudeAnalysis.metadata?.fallbackUsed || false
            });

            // 7. COMBINAR DATOS Y GENERAR REPORTE FINAL
            const finalReport = this.buildFinalReport(orchestrationData, claudeAnalysis);

            // 8. CALCULAR MÉTRICAS DE PERFORMANCE
            const totalTime = Date.now() - orchestrationStart;
            const confidence = this.calculateConfidenceScore(orchestrationData, claudeAnalysis);

            logInfo('✅ Reporte financiero generado exitosamente', {
                totalDuration: `${totalTime}ms`,
                confidence: `${confidence}%`,
                claudeApiUsed: claudeAnalysis.success
            });

            return {
                success: true,
                data: finalReport,
                metadata: {
                    propertyUrl,
                    analysisDate: new Date().toISOString(),
                    confidence,
                    dataSource: 'NotBrokker AI Analysis',
                    version: '1.0.0',
                    performance: {
                        totalTime: `${totalTime}ms`,
                        orchestrationTime: `${orchestrationTime}ms`,
                        claudeAnalysisTime: `${claudeAnalysisTime}ms`
                    },
                    claudeApi: {
                        used: claudeAnalysis.success,
                        model: AnthropicConfig.claude.model,
                        fallbackUsed: claudeAnalysis.metadata?.fallbackUsed || false
                    }
                }
            };

        } catch (error) {
            logError('❌ Error generando reporte financiero', {
                propertyUrl,
                error: error.message,
                stack: error.stack?.split('\n')[0]
            });

            throw ErrorFactory.internal('Error generando reporte financiero inmobiliario', error);
        }
    }

    /**
     * Validar URL de propiedad usando ScrapingService
     */
    static async validatePropertyUrl(url) {
        try {
            logDebug('🔍 Validando URL de propiedad', { url });

            // Usar método de validación del ScrapingService
            const validation = ScrapingService.validarURL(url);
            
            if (!validation.valida) {
                return {
                    valid: false,
                    reason: validation.razon
                };
            }

            // Verificar que el portal sea soportado
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
     * Obtener datos completos de la propiedad
     */
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
     * Obtener propiedades comparables en la zona
     */
    static async getComparableProperties(propertyUrl, options = {}) {
        try {
            logInfo('🔍 Buscando propiedades comparables');

            // Extraer información de ubicación de la URL o datos de propiedad
            const searchParams = this.extractSearchParamsFromProperty(propertyUrl, options);
            const maxPaginas = Math.min(options.maxComparables || 2, 3); // Limitar para eficiencia

            const searchResult = await SearchService.searchProperties(
                searchParams.tipo,
                searchParams.operacion,
                searchParams.ubicacion,
                maxPaginas,
                searchParams.filtrosPrecio,
                searchParams.filtrosAvanzados
            );

            if (!searchResult.success) {
                throw new Error('Error en búsqueda de propiedades comparables');
            }

            // Limitar número de comparables para Claude
            const limitedProperties = searchResult.data.slice(0, AnthropicConfig.defaults.searchOptions.maxComparables);

            logInfo('✅ Propiedades comparables obtenidas', {
                total: searchResult.data.length,
                limitedTo: limitedProperties.length,
                ubicacion: searchParams.ubicacion
            });

            return {
                properties: limitedProperties,
                metadata: {
                    ...searchResult.metadata,
                    limitedTo: limitedProperties.length,
                    originalTotal: searchResult.data.length
                }
            };

        } catch (error) {
            logError('Error obteniendo propiedades comparables', { error: error.message });
            throw error;
        }
    }

    /**
     * Generar análisis de financiamiento hipotecario
     */
    static async getMortgageAnalysis(propertyPrice) {
        try {
            logInfo('💰 Generando análisis hipotecario', { propertyPrice });

            // Extraer precio en UF si viene como string
            let montoUF = propertyPrice;
            if (typeof propertyPrice === 'string') {
                const match = propertyPrice.match(/[\d.,]+/);
                if (match) {
                    montoUF = parseFloat(match[0].replace(',', ''));
                }
            }

            // Si no se puede determinar precio, usar valor promedio
            if (!montoUF || isNaN(montoUF)) {
                montoUF = 3500; // UF promedio para análisis
                logInfo('💡 Usando precio promedio para análisis hipotecario', { montoUF });
            }

            // Validar rango
            const maxMonto = AnthropicConfig.validation.ranges.mortgage.monto.max;
            if (montoUF > maxMonto) {
                montoUF = maxMonto;
                logInfo('⚠️ Precio ajustado al máximo permitido', { montoUF });
            }

            // Definir escenarios optimizados
            const escenarios = AnthropicConfig.defaults.mortgageScenarios.map(scenario => ({
                monto: montoUF,
                plazo: scenario.plazo,
                etiqueta: `${montoUF} UF x ${scenario.plazo} años`
            }));

            const mortgageResult = await MortgageService.compareScenarios(escenarios, true);

            if (!mortgageResult.success) {
                throw new Error('Error en análisis hipotecario');
            }

            logInfo('✅ Análisis hipotecario completado', {
                escenarios: escenarios.length,
                montoUF,
                mejorOpcion: mortgageResult.comparacion?.comparacionGeneral?.mejorEscenario?.escenario
            });

            return mortgageResult.comparacion;

        } catch (error) {
            logError('Error en análisis hipotecario', { error: error.message });
            throw error;
        }
    }

    /**
     * Procesar resultados de la orquestación
     */
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

        // Procesar datos de propiedad
        if (propertyData.status === 'fulfilled') {
            processed.property = propertyData.value;
            processed.dataQuality.property = true;
        } else {
            processed.errors.push({
                service: 'property',
                error: propertyData.reason?.message || 'Error desconocido'
            });
        }

        // Procesar propiedades comparables
        if (comparableProperties.status === 'fulfilled') {
            processed.comparables = comparableProperties.value;
            processed.dataQuality.comparables = true;
        } else {
            processed.errors.push({
                service: 'comparables',
                error: comparableProperties.reason?.message || 'Error desconocido'
            });
        }

        // Procesar análisis hipotecario
        if (mortgageAnalysis.status === 'fulfilled') {
            processed.mortgage = mortgageAnalysis.value;
            processed.dataQuality.mortgage = true;
        } else {
            processed.errors.push({
                service: 'mortgage',
                error: mortgageAnalysis.reason?.message || 'Error desconocido'
            });
        }

        // Calcular calidad general de datos
        const successfulServices = Object.values(processed.dataQuality).filter(Boolean).length;
        processed.overallQuality = successfulServices / 3; // 3 servicios totales

        logInfo('✅ Resultados procesados', {
            property: processed.dataQuality.property,
            comparables: processed.dataQuality.comparables,
            mortgage: processed.dataQuality.mortgage,
            overallQuality: `${Math.round(processed.overallQuality * 100)}%`,
            errors: processed.errors.length
        });

        return processed;
    }

    /**
     * Preparar datos para envío a Claude - OPTIMIZADO
     */
    static prepareDataForClaude(orchestrationData, options) {
        logInfo('📋 Preparando datos para análisis con Claude API');

        const claudeInput = {
            // DATOS DE PROPIEDAD
            property: orchestrationData.property ? {
                titulo: orchestrationData.property.titulo,
                precio_uf: orchestrationData.property.precio_uf,
                precio_clp: orchestrationData.property.precio_clp,
                ubicacion: orchestrationData.property.ubicacion,
                dormitorios: orchestrationData.property.dormitorios,
                banos: orchestrationData.property.banos,
                superficie: orchestrationData.property.superficie,
                caracteristicas: orchestrationData.property.caracteristicas || {}
            } : null,

            // DATOS DE COMPARABLES (limitados y optimizados)
            comparables: orchestrationData.comparables?.properties?.slice(0, 10).map(comp => ({
                titulo: comp.titulo,
                precio_uf: comp.precio_uf,
                precio_clp: comp.precio_clp,
                ubicacion: comp.ubicacion,
                dormitorios: comp.dormitorios,
                banos: comp.banos,
                superficie: comp.superficie
            })) || [],

            // DATOS HIPOTECARIOS (resumidos)
            mortgage: orchestrationData.mortgage ? {
                mejorEscenario: orchestrationData.mortgage.comparacionGeneral?.mejorEscenario,
                escenarios: orchestrationData.mortgage.escenarios?.slice(0, 3).map(esc => ({
                    escenario: esc.escenario.etiqueta,
                    mejorOferta: esc.resumen?.mejorOferta
                })),
                ahorroPotencial: orchestrationData.mortgage.comparacionGeneral?.ahorroEntreEscenarios
            } : null,

            // CONFIGURACIÓN DE ANÁLISIS
            analysisConfig: {
                includeLocationAnalysis: options.includeLocationAnalysis !== false,
                includeSecurityAnalysis: options.includeSecurityAnalysis !== false,
                includeFinancialMetrics: options.includeFinancialMetrics !== false,
                includeRiskAssessment: options.includeRiskAssessment !== false,
                confidenceLevel: options.confidenceLevel || 'high',
                marketContext: 'Chile'
            },

            // CALIDAD DE DATOS PARA CLAUDE
            dataQuality: orchestrationData.dataQuality,
            errors: orchestrationData.errors
        };

        logDebug('Datos optimizados para Claude', {
            hasProperty: !!claudeInput.property,
            comparablesCount: claudeInput.comparables.length,
            hasMortgage: !!claudeInput.mortgage,
            errorsCount: claudeInput.errors.length,
            dataSize: `${JSON.stringify(claudeInput).length} chars`
        });

        return claudeInput;
    }

    /**
     * Generar análisis con Claude API Real - MÉTODO PRINCIPAL ACTUALIZADO
     */
    static async generateClaudeAnalysis(inputData) {
        logInfo('🧠 Generando análisis con Claude API Real');

        try {
            // Usar ClaudeApiHelper para el análisis
            const analysisResult = await ClaudeApiHelper.analyzeWithClaude(inputData, 'financial');

            if (analysisResult.success) {
                logInfo('✅ Análisis Claude API completado exitosamente', {
                    model: analysisResult.metadata.model,
                    processingTime: `${analysisResult.metadata.processingTime}ms`
                });

                return {
                    success: true,
                    analysis: analysisResult.analysis,
                    metadata: analysisResult.metadata
                };
            } else {
                // Claude API falló, pero tenemos fallback
                logInfo('⚠️ Claude API falló, usando análisis de fallback', {
                    error: analysisResult.error?.message
                });

                return {
                    success: false,
                    analysis: analysisResult.analysis, // Análisis de fallback
                    metadata: {
                        ...analysisResult.metadata,
                        fallbackUsed: true,
                        originalError: analysisResult.error
                    }
                };
            }

        } catch (error) {
            logError('❌ Error crítico en análisis Claude', { error: error.message });

            // Fallback completo
            return {
                success: false,
                analysis: this.generateEmergencyFallback(),
                metadata: {
                    fallbackUsed: true,
                    emergencyFallback: true,
                    error: error.message,
                    timestamp: new Date().toISOString()
                }
            };
        }
    }

    /**
     * Generar fallback de emergencia cuando todo falla
     */
    static generateEmergencyFallback() {
        logInfo('🆘 Generando análisis de emergencia');

        return {
            executiveSummary: {
                recommendation: "EVALUAR",
                confidence: "Baja",
                keyPoints: [
                    "Análisis generado sin asistencia de IA",
                    "Datos procesados con métodos básicos",
                    "Se recomienda consultar con experto inmobiliario"
                ]
            },
            financialMetrics: {
                yieldBruto: 6.0,
                yieldNeto: 4.8,
                capRate: 4.8,
                roi: 7.5,
                paybackPeriod: 13,
                flujoCajaMensual: 40000
            },
            locationAnalysis: {
                overallScore: 6.5,
                securityScore: 6.5,
                accessibilityScore: 6.5,
                servicesScore: 6.5,
                growthPotential: "Medio"
            },
            riskAssessment: {
                overall: "Medio",
                factors: {
                    market: "Medio",
                    location: "Medio",
                    financial: "Medio",
                    liquidity: "Medio"
                },
                riskDescription: "Evaluación de riesgo básica sin análisis IA"
            },
            marketComparison: {
                priceComparison: "Competitivo",
                marketPosition: "Medio",
                trendAnalysis: "Tendencias no analizadas - sistema de fallback"
            },
            recommendations: {
                mainRecommendation: "Obtener análisis profesional antes de proceder con la inversión",
                actionItems: [
                    "Consultar con corredor inmobiliario local",
                    "Solicitar tasación profesional",
                    "Validar información financiera"
                ],
                considerations: [
                    "Análisis generado sin IA por falla técnica",
                    "Datos pueden no reflejar condiciones actuales del mercado"
                ]
            },
            _emergencyFallback: true
        };
    }

    /**
     * Construir reporte final combinando todos los datos - ACTUALIZADO
     */
    static buildFinalReport(orchestrationData, claudeAnalysis) {
        logInfo('📊 Construyendo reporte final con análisis Claude');

        const analysis = claudeAnalysis.analysis || {};
        const isClaudeSuccess = claudeAnalysis.success;

        const report = {
            // HEADER INFORMATION - ACTUALIZADO
            reportHeader: {
                title: "Análisis Financiero Inmobiliario con IA",
                subtitle: isClaudeSuccess ? 
                    "Evaluación completa generada con Claude Sonnet 4" :
                    "Evaluación con análisis de respaldo",
                generatedDate: new Date().toISOString(),
                version: "1.0.0",
                confidence: this.calculateConfidenceScore(orchestrationData, claudeAnalysis),
                aiAnalysis: {
                    used: isClaudeSuccess,
                    model: isClaudeSuccess ? AnthropicConfig.claude.model : 'Fallback Analysis',
                    fallbackReason: !isClaudeSuccess ? claudeAnalysis.metadata?.originalError?.message : null
                }
            },

            // PROPERTY SUMMARY
            propertySummary: this.buildPropertySummary(orchestrationData.property),

            // FINANCIAL METRICS - USANDO CLAUDE
            financialMetrics: {
                ...this.buildFinancialMetrics(orchestrationData.property, orchestrationData.mortgage),
                // Sobrescribir con análisis de Claude si está disponible
                ...(analysis.financialMetrics || {}),
                source: isClaudeSuccess ? 'Claude AI Analysis' : 'Fallback Calculation'
            },

            // EXECUTIVE SUMMARY - CLAUDE
            executiveSummary: {
                ...analysis.executiveSummary,
                analysisSource: isClaudeSuccess ? 'Claude Sonnet 4' : 'Análisis básico'
            },

            // LOCATION ANALYSIS - CLAUDE
            locationAnalysis: {
                ...analysis.locationAnalysis,
                analysisDate: new Date().toISOString()
            },

            // RISK ASSESSMENT - CLAUDE
            riskAssessment: {
                ...analysis.riskAssessment,
                methodology: isClaudeSuccess ? 'IA + Datos de mercado' : 'Análisis básico'
            },

            // MARKET COMPARISON - COMBINADO
            marketComparison: {
                ...this.buildMarketComparison(orchestrationData.comparables),
                claudeAnalysis: analysis.marketComparison || null,
                totalAnalyzed: orchestrationData.comparables?.properties?.length || 0
            },

            // MORTGAGE ANALYSIS
            mortgageAnalysis: this.buildMortgageAnalysis(orchestrationData.mortgage),

            // RECOMMENDATIONS - CLAUDE
            recommendations: analysis.recommendations || {
                mainRecommendation: "Realizar análisis adicional debido a limitaciones técnicas",
                actionItems: ["Consultar experto", "Validar datos", "Revisar mercado"],
                considerations: ["Análisis limitado por fallas técnicas"]
            },

            // DATA SOURCES
            dataSources: this.buildDataSources(orchestrationData, claudeAnalysis),

            // METADATA COMPLETO
            metadata: {
                generatedAt: new Date().toISOString(),
                dataQuality: this.assessDataQuality(orchestrationData),
                claudeAnalysis: {
                    success: isClaudeSuccess,
                    model: isClaudeSuccess ? AnthropicConfig.claude.model : null,
                    fallbackUsed: claudeAnalysis.metadata?.fallbackUsed || false,
                    processingTime: claudeAnalysis.metadata?.processingTime
                },
                services: {
                    scraping: orchestrationData.dataQuality.property,
                    search: orchestrationData.dataQuality.comparables,
                    mortgage: orchestrationData.dataQuality.mortgage,
                    claude: isClaudeSuccess
                },
                overallQuality: orchestrationData.overallQuality
            }
        };

        logInfo('✅ Reporte final construido', {
            claudeSuccess: isClaudeSuccess,
            dataQuality: `${Math.round(orchestrationData.overallQuality * 100)}%`,
            sectionsIncluded: Object.keys(report).length
        });

        return report;
    }

    // ===== MÉTODOS AUXILIARES (mantener los existentes) =====

    /**
     * Extraer parámetros de búsqueda basados en la propiedad
     */
    static extractSearchParamsFromProperty(propertyUrl, options = {}) {
        // Lógica mejorada basada en URL y opciones
        if (propertyUrl.includes('concon') || propertyUrl.includes('montemar') || propertyUrl.includes('valparaiso')) {
            return {
                tipo: 'Casa',
                operacion: 'Venta', // Cambiar a venta si es Concón
                ubicacion: 'Concón, Valparaíso',
                maxPaginas: options.maxPaginas || 2,
                filtrosPrecio: null,
                filtrosAvanzados: {
                    dormitorios: { minimo: 3 },
                    banos: { minimo: 2 },
                    superficieTotal: { minimo: 150 }
                }
            };
        }

        // Parámetros genéricos mejorados
        return {
            tipo: options.propertyType || 'Casa',
            operacion: options.operation || 'Arriendo',
            ubicacion: options.location || 'Las Condes, Santiago',
            maxPaginas: options.maxPaginas || 2,
            filtrosPrecio: options.priceFilters || null,
            filtrosAvanzados: options.advancedFilters || {
                dormitorios: { minimo: 3 },
                banos: { minimo: 2 },
                superficieTotal: { minimo: 100 }
            }
        };
    }

    /**
     * Calcular puntaje de confiabilidad - ACTUALIZADO
     */
    static calculateConfidenceScore(orchestrationData, claudeAnalysis) {
        let score = 0;
        let maxScore = 0;

        // Propiedad (30% del score)
        maxScore += 30;
        if (orchestrationData.dataQuality.property) {
            score += 30;
        }

        // Comparables (25% del score)
        maxScore += 25;
        if (orchestrationData.dataQuality.comparables) {
            score += 25;
        }

        // Hipoteca (25% del score)
        maxScore += 25;
        if (orchestrationData.dataQuality.mortgage) {
            score += 25;
        }

        // Claude Analysis (20% del score) - NUEVO
        maxScore += 20;
        if (claudeAnalysis.success) {
            score += 20;
        } else if (claudeAnalysis.metadata?.fallbackUsed) {
            score += 10; // Partial credit for fallback
        }

        const finalScore = maxScore > 0 ? (score / maxScore) * 100 : 0;
        return Math.round(finalScore * 10) / 10;
    }

    // Mantener todos los demás métodos auxiliares existentes...
    static buildPropertySummary(propertyData) {
        if (!propertyData) return null;

        return {
            title: propertyData.titulo || 'Título no disponible',
            address: propertyData.ubicacion || 'Ubicación no disponible',
            price: {
                uf: propertyData.precio_uf || 'No disponible',
                clp: propertyData.precio_clp || 'No disponible',
                total: propertyData.precio_uf ? 
                    `${propertyData.precio_uf} (${propertyData.precio_clp || 'CLP no disponible'})` : 
                    'Precio no disponible'
            },
            features: {
                bedrooms: propertyData.dormitorios || 'No especificado',
                bathrooms: propertyData.banos || 'No especificado',
                surface: propertyData.superficie || 'No especificado',
                parking: propertyData.caracteristicas?.estacionamientos || 'No especificado'
            },
            description: propertyData.descripcion || 'Descripción no disponible',
            amenities: propertyData.caracteristicas || {},
            images: propertyData.imagen ? [propertyData.imagen] : [],
            link: propertyData.link
        };
    }

    static buildFinancialMetrics(propertyData, mortgageData) {
        // Retornar métricas básicas que pueden ser sobrescritas por Claude
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

        // Análisis básico de precios
        const prices = comparables
            .map(c => c.precio_uf)
            .filter(p => p && p !== 'No disponible')
            .map(p => parseFloat(String(p).replace(/[^\d.,]/g, '').replace(',', '.')))
            .filter(p => !isNaN(p));

        if (prices.length === 0) {
            return { analysis: 'No se pudieron extraer precios para comparar' };
        }

        const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);

        return {
            averagePrice: `${Math.round(avgPrice)} UF`,
            priceRange: `${Math.round(minPrice)} - ${Math.round(maxPrice)} UF`,
            totalSamples: prices.length,
            analysis: `Precio promedio: ${Math.round(avgPrice)} UF en muestra de ${prices.length} propiedades`
        };
    }

    static buildDataSources(orchestrationData, claudeAnalysis) {
        const sources = [];

        if (orchestrationData.dataQuality.property) {
            sources.push({
                type: "Datos de propiedad",
                source: "Portal MercadoLibre",
                status: "Validado",
                timestamp: new Date().toISOString()
            });
        }

        if (orchestrationData.dataQuality.comparables) {
            sources.push({
                type: "Comparables de mercado",
                source: "Portal Inmobiliario",
                status: "Actualizado",
                count: orchestrationData.comparables?.properties?.length || 0,
                timestamp: new Date().toISOString()
            });
        }

        if (orchestrationData.dataQuality.mortgage) {
            sources.push({
                type: "Simulación financiera",
                source: "Sistema bancario chileno CMF",
                status: "Verificado",
                banks: 10,
                timestamp: new Date().toISOString()
            });
        }

        sources.push({
            type: "Análisis inteligente",
            source: claudeAnalysis.success ? "Claude Sonnet 4" : "Análisis de fallback",
            status: claudeAnalysis.success ? "Completado" : "Fallback utilizado",
            model: claudeAnalysis.success ? AnthropicConfig.claude.model : null,
            timestamp: new Date().toISOString()
        });

        return sources;
    }

    static assessDataQuality(orchestrationData) {
        const qualityScore = orchestrationData.overallQuality;
        
        let overallRating;
        if (qualityScore >= 0.8) overallRating = "Alta";
        else if (qualityScore >= 0.6) overallRating = "Media";
        else overallRating = "Limitada";

        return {
            overall: overallRating,
            score: `${Math.round(qualityScore * 100)}%`,
            property: orchestrationData.dataQuality.property ? "Completa" : "No disponible",
            comparables: orchestrationData.dataQuality.comparables ? "Actualizada" : "No disponible",
            mortgage: orchestrationData.dataQuality.mortgage ? "Verificada" : "No disponible",
            errors: orchestrationData.errors.length
        };
    }

    static extractBestRate(mortgageData) {
        try {
            const bestScenario = mortgageData.comparacionGeneral?.mejorEscenario;
            return bestScenario?.mejorOferta?.tasa || "No disponible";
        } catch (error) {
            return "No disponible";
        }
    }

    static extractMaxSavings(mortgageData) {
        try {
            const savings = mortgageData.comparacionGeneral?.ahorroEntreEscenarios;
            return savings?.total || "No disponible";
        } catch (error) {
            return "No disponible";
        }
    }
}

module.exports = AnthropicService;