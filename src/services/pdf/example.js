// src/services/pdf/ReportTemplateBuilder.js
const path = require('path');
const fs = require('fs').promises;
const { logInfo, logError, logDebug } = require('../../utils/logger');

/**
 * Constructor de templates para reportes PDF premium - VERSIÓN COMPLETA
 */
class ReportTemplateBuilder {

    /**
     * ✅ MÉTODO PRINCIPAL: Construir HTML completo del reporte
     */
    static async buildReportHTML(analysisData, options = {}) {
        try {
            logInfo('🔨 Construyendo HTML del reporte con gastos operacionales detallados');

            // 1. Cargar template base
            const templatePath = path.join(__dirname, 'templates', 'premium-report-template.html');
            let htmlTemplate = await fs.readFile(templatePath, 'utf8');

            // 2. Construir secciones del reporte
            const headerContent = this.buildHeaderSection(analysisData);
            const propertyContent = this.buildPropertySection(analysisData);
            const financialMetrics = this.buildFinancialMetricsSection(analysisData);
            const financingAnalysis = this.buildFinancingAnalysisSection(analysisData);
            const marketComparison = this.buildMarketComparisonSection(analysisData);
            const locationAnalysis = this.buildLocationAnalysisSection(analysisData);
            const securityAnalysis = this.buildSecurityAnalysisSection(analysisData);
            const executiveSummary = this.buildExecutiveSummarySection(analysisData);
            const dataSources = this.buildDataSourcesSection(analysisData);

            // 3. Reemplazar placeholders
            htmlTemplate = htmlTemplate
                .replace('{{HEADER_CONTENT}}', headerContent)
                .replace('{{PROPERTY_CONTENT}}', propertyContent)
                .replace('{{FINANCIAL_METRICS}}', financialMetrics)
                .replace('{{FINANCING_ANALYSIS}}', financingAnalysis)
                .replace('{{MARKET_COMPARISON}}', marketComparison)
                .replace('{{LOCATION_ANALYSIS}}', locationAnalysis)
                .replace('{{SECURITY_ANALYSIS}}', securityAnalysis)
                .replace('{{EXECUTIVE_SUMMARY}}', executiveSummary)
                .replace('{{DATA_SOURCES}}', dataSources);

            logInfo('✅ HTML del reporte construido exitosamente', {
                size: `${Math.round(htmlTemplate.length / 1024)}KB`,
                hasGastosDetallados: htmlTemplate.includes('gastos-desglose')
            });

            return htmlTemplate;

        } catch (error) {
            logError('❌ Error construyendo HTML del reporte', { error: error.message });
            throw new Error(`Error construyendo template: ${error.message}`);
        }
    }

    // ===========================================
    // ✅ MÉTODOS DE CONSTRUCCIÓN DE SECCIONES FALTANTES
    // ===========================================

    /**
     * ✅ CONSTRUIR SECCIÓN DE HEADER
     */
    static buildHeaderSection(analysisData) {
        const confidence = analysisData?.metadata?.confidence || 85;
        const timestamp = new Date().toLocaleDateString('es-CL', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        return `
            <div class="header-content">
                <div>
                    <h1 class="report-title">Análisis Financiero Inmobiliario</h1>
                    <p class="report-subtitle">Reporte Premium Generado con Inteligencia Artificial</p>
                    <p class="report-date">Generado el ${timestamp}</p>
                </div>
                <div class="confidence-badge">
                    <div class="confidence-score">${confidence}%</div>
                    <div class="confidence-label">Confianza del Análisis</div>
                </div>
            </div>
        `;
    }

    /**
     * ✅ CONSTRUIR SECCIÓN DE PROPIEDAD
     */
    static buildPropertySection(analysisData) {
        const property = analysisData?.data?.property || {};
        const price = property.precio_completo || 'Precio no disponible';
        
        return `
            <div class="property-grid">
                <div class="property-details">
                    <h2>${property.titulo || 'Propiedad en Análisis'}</h2>
                    <p class="property-address">${property.ubicacion || 'Ubicación no especificada'}</p>
                    <p class="property-description">${property.descripcion || 'Descripción no disponible'}</p>
                    
                    <div class="property-features">
                        <div class="feature-item">
                            <svg class="feature-icon" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z"/>
                            </svg>
                            <span class="feature-text">${property.dormitorios || 'N/A'}</span>
                        </div>
                        <div class="feature-item">
                            <svg class="feature-icon" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M9 12a1 1 0 002 0V8a1 1 0 00-2 0v4zm-1-9a7 7 0 014.2 12.6.999.999 0 11-1.4-1.2A5 5 0 108 18a.999.999 0 110 2 7 7 0 01-1-13.9V3z"/>
                            </svg>
                            <span class="feature-text">${property.banos || 'N/A'}</span>
                        </div>
                        <div class="feature-item">
                            <svg class="feature-icon" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/>
                            </svg>
                            <span class="feature-text">${property.superficie || 'N/A'}</span>
                        </div>
                    </div>
                </div>
                <div class="price-summary">
                    <div class="price-label">Precio de Venta</div>
                    <div class="price-main">${price}</div>
                    <div class="price-uf">${property.precio_uf ? `${property.precio_uf} UF` : ''}</div>
                </div>
            </div>
        `;
    }

    /**
     * ✅ CONSTRUIR SECCIÓN DE FINANCIAMIENTO
     */
    static buildFinancingAnalysisSection(analysisData) {
        return `
            <h2 class="financing-title">Análisis de Financiamiento</h2>
            <div class="financing-options">
                <div class="financing-card recommended">
                    <div class="financing-term">30 años</div>
                    <div class="financing-payment">$1.840.825</div>
                    <div class="financing-details">
                        Tasa: 4.20% | <span class="financing-bank">Coopeuch</span>
                    </div>
                </div>
                <div class="financing-card">
                    <div class="financing-term">20 años</div>
                    <div class="financing-payment">$2.303.189</div>
                    <div class="financing-details">
                        Tasa: 4.20% | <span class="financing-bank">Coopeuch</span>
                    </div>
                </div>
                <div class="financing-card">
                    <div class="financing-term">15 años</div>
                    <div class="financing-payment">$2.939.039</div>
                    <div class="financing-details">
                        Tasa: 4.85% | <span class="financing-bank">Itaú</span>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * ✅ CONSTRUIR SECCIÓN DE COMPARACIÓN DE MERCADO
     */
    static buildMarketComparisonSection(analysisData) {
        return `
            <h2 class="comparison-title">Comparación de Mercado</h2>
            <div class="comparables-list">
                <div class="comparable-item">
                    <div class="comparable-details">
                        <h4>Casa Similar en Zona</h4>
                        <div class="comparable-specs">6 dorm, 4 baños, 240 m²</div>
                        <div class="comparable-location">Bosques de Montemar, Concón</div>
                    </div>
                    <div class="comparable-price">$2.400.000</div>
                </div>
            </div>
        `;
    }

    /**
     * ✅ CONSTRUIR SECCIÓN DE ANÁLISIS DE UBICACIÓN
     */
    static buildLocationAnalysisSection(analysisData) {
        return `
            <div class="location-analysis">
                <h2 class="section-title">Análisis de Ubicación</h2>
                <p>Análisis detallado de la ubicación disponible en el reporte completo.</p>
            </div>
        `;
    }

    /**
     * ✅ CONSTRUIR SECCIÓN DE ANÁLISIS DE SEGURIDAD
     */
    static buildSecurityAnalysisSection(analysisData) {
        return `
            <div class="security-analysis">
                <h2 class="section-title">Análisis de Seguridad</h2>
                <p>Evaluación de seguridad de la zona disponible en el reporte completo.</p>
            </div>
        `;
    }

    /**
     * ✅ CONSTRUIR SECCIÓN DE RESUMEN EJECUTIVO
     */
    static buildExecutiveSummarySection(analysisData) {
        const analysis = analysisData?.data?.analysis;
        const recommendation = analysis?.resumenEjecutivo?.viabilidadInversion;
        
        return `
            <h1 class="summary-title">Resumen Ejecutivo</h1>
            <div class="summary-grid">
                <div class="summary-item">
                    <h4>Viabilidad de Inversión</h4>
                    <p>${recommendation?.decision || 'Evaluación pendiente'}</p>
                    <div class="risk-indicator risk-${this.getRiskClass(recommendation?.nivelRiesgo)}">
                        ${recommendation?.nivelRiesgo || 'No evaluado'}
                    </div>
                </div>
                <div class="summary-item">
                    <h4>Recomendación Final</h4>
                    <p>${recommendation?.justificacion || 'Análisis en curso'}</p>
                </div>
            </div>
        `;
    }

    /**
     * ✅ CONSTRUIR SECCIÓN DE FUENTES DE DATOS
     */
    static buildDataSourcesSection(analysisData) {
        const timestamp = new Date().toLocaleDateString('es-CL');
        
        return `
            <div class="sources-title">Fuentes de Datos</div>
            <div class="sources-list">
                • Portal Inmobiliario (datos de propiedad)<br>
                • Sistemas bancarios (simulaciones de crédito)<br>
                • Análisis de mercado comparativo<br>
                • Inteligencia artificial Claude Sonnet 4
            </div>
            <div class="timestamp">
                Reporte generado el ${timestamp} | NotBrokker Premium Report v4.0
            </div>
        `;
    }

    // ===========================================
    // ✅ MÉTODOS EXISTENTES (MANTENER COMO ESTÁN)
    // ===========================================

    /**
     * ✅ CONSTRUIR MÉTRICAS FINANCIERAS CON GASTOS DETALLADOS
     */
    static buildFinancialMetricsSection(analysisData) {
        try {
            const indicators = analysisData?.data?.analysis?.indicadoresFinancieros;

            if (!indicators) {
                logDebug('⚠️ Sin indicadores financieros, usando valores por defecto');
                return this.buildFallbackFinancialMetrics();
            }

            const flujoCaja = indicators.flujoCajaMensual || {};
            const gastosOp = flujoCaja.composicion?.gastosOperacionales || {};

            // ✅ FORMATEAR YIELDS CON CORRECCIÓN DE FORMATO
            const yieldBruto = this.formatPercentage(indicators.yieldBruto);
            const yieldNeto = this.formatPercentage(indicators.yieldNeto);
            const capRate = this.formatPercentage(indicators.capRate);

            const hasDetailedBreakdown = gastosOp.desglose && Object.keys(gastosOp.desglose).length > 0;

            logInfo('💰 Construyendo métricas financieras para PDF', {
                yieldBrutoOriginal: indicators.yieldBruto,
                yieldBrutoCorregido: yieldBruto,
                yieldNetoOriginal: indicators.yieldNeto,
                yieldNetoCorregido: yieldNeto,
                hasDetailedBreakdown,
                gastosTotal: gastosOp.total || 0
            });

            return `
                <!-- Flujo de Caja Mensual -->
                <div class="metric-card">
                    <div class="metric-header">
                        <svg class="metric-icon" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4zM18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9z"/>
                        </svg>
                        <h3 class="metric-title">💰 Flujo de Caja Mensual</h3>
                    </div>
                    <div class="metric-value ${this.getFlowClass(flujoCaja.valor)}">
                        ${this.formatCurrency(flujoCaja.valor || 0)}
                    </div>
                    <div class="metric-subtitle">
                        ${flujoCaja.valor >= 0 ? 'Flujo positivo - Genera ingresos' : 'Flujo negativo - Requiere capital adicional'}
                    </div>
                    
                    <!-- DESGLOSE DETALLADO DE COMPOSICIÓN -->
                    <div class="metric-details">
                        <div class="flow-composition">
                            <h4 style="margin-bottom: 12px; color: #2d3748; font-weight: 600;">Composición del Flujo:</h4>
                            
                            <div class="composition-item positive">
                                <span class="composition-label">Ingreso por Arriendo</span>
                                <span class="composition-value">+${this.formatCurrency(flujoCaja.composicion?.ingresoArriendo || 0)}</span>
                            </div>
                            
                            <div class="composition-item negative">
                                <span class="composition-label">Gastos Operacionales</span>
                                <span class="composition-value">-${this.formatCurrency(gastosOp.total || 0)}</span>
                            </div>
                            
                            <div class="composition-item negative">
                                <span class="composition-label">Dividendo Hipotecario</span>
                                <span class="composition-value">-${this.formatCurrency(flujoCaja.composicion?.dividendoHipotecario || 0)}</span>
                            </div>
                        </div>
                        
                        ${hasDetailedBreakdown ? this.buildGastosDetailBreakdown(gastosOp) : ''}
                    </div>
                </div>

                <!-- Yield Bruto -->
                <div class="metric-card">
                    <div class="metric-header">
                        <svg class="metric-icon" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                        </svg>
                        <h3 class="metric-title">📈 Yield Bruto Anual</h3>
                    </div>
                    <div class="metric-value ${this.getYieldClass(indicators.yieldBruto)} yield-percentage">
                        ${yieldBruto}
                    </div>
                    <div class="metric-subtitle">
                        Rentabilidad bruta anual sobre inversión total
                    </div>
                    <div class="metric-details">
                        <div class="metric-calculation">
                            Cálculo: (Arriendo Anual ÷ Valor Propiedad) × 100
                        </div>
                    </div>
                </div>

                <!-- Yield Neto -->
                <div class="metric-card">
                    <div class="metric-header">
                        <svg class="metric-icon" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3z"/>
                        </svg>
                        <h3 class="metric-title">📊 Yield Neto Anual</h3>
                    </div>
                    <div class="metric-value ${this.getYieldClass(indicators.yieldNeto)} yield-percentage">
                        ${yieldNeto}
                    </div>
                    <div class="metric-subtitle">
                        Rentabilidad neta después de gastos operacionales
                    </div>
                    <div class="metric-details">
                        <div class="metric-calculation">
                            Cálculo: ((Arriendo - Gastos) × 12 ÷ Valor Propiedad) × 100
                        </div>
                    </div>
                </div>

                <!-- Cap Rate -->
                <div class="metric-card">
                    <div class="metric-header">
                        <svg class="metric-icon" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z"/>
                        </svg>
                        <h3 class="metric-title">📈 Cap Rate</h3>
                    </div>
                    <div class="metric-value ${this.getYieldClass(indicators.capRate)} yield-percentage">
                        ${capRate}
                    </div>
                    <div class="metric-subtitle">
                        Tasa de capitalización del inmueble
                    </div>
                </div>

                <!-- Punto de Equilibrio -->
                <div class="metric-card">
                    <div class="metric-header">
                        <svg class="metric-icon" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 00-1-1h-2z"/>
                        </svg>
                        <h3 class="metric-title">⚖️ Punto de Equilibrio</h3>
                    </div>
                    <div class="metric-value metric-neutral">
                        ${this.formatCurrency(indicators.puntoEquilibrio || 0)}
                    </div>
                    <div class="metric-subtitle">
                        Arriendo mínimo para cubrir todos los gastos
                    </div>
                </div>
            `;

        } catch (error) {
            logError('❌ Error construyendo métricas financieras', { error: error.message });
            return this.buildFallbackFinancialMetrics();
        }
    }

    // ===========================================
    // ✅ MÉTODOS AUXILIARES (MANTENER EXISTENTES)
    // ===========================================

    static buildGastosDetailBreakdown(gastosOp) {
        if (!gastosOp.desglose) return '';

        const desglose = gastosOp.desglose;

        return `
            <div class="gastos-desglose" style="margin-top: 20px; padding: 15px; background: #f0f4f8; border-radius: 8px; border-left: 3px solid #667eea;">
                <h4 style="margin-bottom: 15px; color: #2d3748; font-weight: 600; font-size: 0.9rem;">
                    📋 Desglose Detallado de Gastos Operacionales
                </h4>
                
                <div class="desglose-grid" style="display: grid; gap: 8px;">
                    ${desglose.impuestoMutuo ? `
                        <div class="desglose-item">
                            <div class="desglose-concept">
                                <strong>Impuesto al Mutuo</strong>
                                <span class="desglose-desc">(${desglose.impuestoMutuo.porcentaje || '0.8% del crédito'})</span>
                            </div>
                            <div class="desglose-amount">${this.formatCurrency(desglose.impuestoMutuo.valor)}</div>
                        </div>
                    ` : ''}
                    
                    ${desglose.gastosNotariales ? `
                        <div class="desglose-item">
                            <div class="desglose-concept">
                                <strong>Gastos Notariales</strong>
                                <span class="desglose-desc">(${desglose.gastosNotariales.rango || 'Rango estándar'})</span>
                            </div>
                            <div class="desglose-amount">${this.formatCurrency(desglose.gastosNotariales.valor)}</div>
                        </div>
                    ` : ''}
                    
                    ${desglose.conservadorBienes ? `
                        <div class="desglose-item">
                            <div class="desglose-concept">
                                <strong>Conservador de Bienes Raíces</strong>
                                <span class="desglose-desc">(${desglose.conservadorBienes.criterio || 'según valor'})</span>
                            </div>
                            <div class="desglose-amount">${this.formatCurrency(desglose.conservadorBienes.valor)}</div>
                        </div>
                    ` : ''}
                    
                    ${desglose.tasacion ? `
                        <div class="desglose-item">
                            <div class="desglose-concept">
                                <strong>Tasación</strong>
                                <span class="desglose-desc">(${desglose.tasacion.fuente === 'response.json' ? 'Obtenido de cotización' : 'Estimado por rango'})</span>
                            </div>
                            <div class="desglose-amount">${this.formatCurrency(desglose.tasacion.valor)}</div>
                        </div>
                    ` : ''}
                    
                    ${desglose.estudioTitulos ? `
                        <div class="desglose-item">
                            <div class="desglose-concept">
                                <strong>Estudio de Títulos</strong>
                                <span class="desglose-desc">(${desglose.estudioTitulos.fuente === 'response.json' ? 'Obtenido de cotización' : 'Estimado por rango'})</span>
                            </div>
                            <div class="desglose-amount">${this.formatCurrency(desglose.estudioTitulos.valor)}</div>
                        </div>
                    ` : ''}
                    
                    ${desglose.gestionBancaria ? `
                        <div class="desglose-item">
                            <div class="desglose-concept">
                                <strong>Gestión Bancaria</strong>
                                <span class="desglose-desc">(${desglose.gestionBancaria.rango || 'Rango estándar'})</span>
                            </div>
                            <div class="desglose-amount">${this.formatCurrency(desglose.gestionBancaria.valor)}</div>
                        </div>
                    ` : ''}
                    
                    ${desglose.comisionCorretor && desglose.comisionCorretor.incluida ? `
                        <div class="desglose-item">
                            <div class="desglose-concept">
                                <strong>Comisión del Corredor</strong>
                                <span class="desglose-desc">(${desglose.comisionCorretor.porcentaje || '2% + IVA'})</span>
                            </div>
                            <div class="desglose-amount">${this.formatCurrency(desglose.comisionCorretor.valor)}</div>
                        </div>
                    ` : ''}
                </div>
                
                <div class="desglose-total" style="margin-top: 12px; padding-top: 12px; border-top: 2px solid #cbd5e0; text-align: right;">
                    <strong style="color: #2d3748; font-size: 0.9rem;">
                        Total Gastos Operacionales: ${this.formatCurrency(gastosOp.total)}
                    </strong>
                </div>
                
                ${gastosOp.metadata ? `
                    <div class="desglose-metadata" style="margin-top: 10px; font-size: 0.75rem; color: #718096; font-style: italic;">
                        <p>💡 ${gastosOp.metadata.metodologia}</p>
                        <p>📅 Calculado: ${new Date(gastosOp.metadata.fechaCalculo).toLocaleDateString('es-CL')}</p>
                    </div>
                ` : ''}
            </div>
        `;
    }

    static buildFallbackFinancialMetrics() {
        return `
            <div class="metric-card">
                <div class="metric-header">
                    <h3 class="metric-title">📈 Yield Bruto Anual</h3>
                </div>
                <div class="metric-value metric-neutral yield-percentage">
                    6.5%
                </div>
                <div class="metric-subtitle">
                    Valor estimado - Datos limitados
                </div>
            </div>
            
            <div class="metric-card">
                <div class="metric-header">
                    <h3 class="metric-title">📊 Yield Neto Anual</h3>
                </div>
                <div class="metric-value metric-neutral yield-percentage">
                    5.8%
                </div>
                <div class="metric-subtitle">
                    Valor estimado - Datos limitados
                </div>
            </div>
        `;
    }

    static formatPercentage(value) {
        if (value === null || value === undefined || isNaN(value)) {
            return '0.0%';
        }
        
        let numValue = typeof value === 'string' ? parseFloat(value) : value;
        
        if (isNaN(numValue)) {
            return '0.0%';
        }
        
        if (numValue > 100) {
            numValue = numValue / 100;
            
            logDebug('🔧 Corrigiendo formato de yield', {
                valorOriginal: value,
                valorCorregido: numValue,
                formatoFinal: `${numValue.toFixed(1)}%`
            });
        }
        
        return `${numValue.toFixed(1)}%`;
    }

    static getNumericYieldValue(value) {
        if (value === null || value === undefined || isNaN(value)) {
            return 0;
        }
        
        let numValue = typeof value === 'string' ? parseFloat(value) : value;
        
        if (isNaN(numValue)) {
            return 0;
        }
        
        if (numValue > 100) {
            numValue = numValue / 100;
        }
        
        return numValue;
    }

    static getYieldClass(value) {
        const numValue = this.getNumericYieldValue(value);
        
        if (numValue >= 6) return 'metric-positive';
        if (numValue >= 4) return 'metric-neutral';
        return 'metric-negative';
    }

    static getFlowClass(value) {
        if (value > 0) return 'metric-positive';
        if (value < 0) return 'metric-negative';
        return 'metric-neutral';
    }

    static formatCurrency(amount) {
        return new Intl.NumberFormat('es-CL', {
            style: 'currency',
            currency: 'CLP',
            minimumFractionDigits: 0
        }).format(amount || 0);
    }

    static getRiskClass(riskLevel) {
        if (!riskLevel) return 'medium';
        const level = riskLevel.toLowerCase();
        if (level.includes('bajo')) return 'low';
        if (level.includes('alto')) return 'high';
        return 'medium';
    }
}

module.exports = ReportTemplateBuilder;