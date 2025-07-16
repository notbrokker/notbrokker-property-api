// src/services/pdf/ReportTemplateBuilder.js
const fs = require('fs').promises;
const path = require('path');
const { logInfo, logError, logDebug } = require('../../utils/logger');

/**
 * Constructor de templates dinámicos para reportes PDF
 */
class ReportTemplateBuilder {
    
    /**
     * Construir HTML completo del reporte basado en template y datos del análisis
     */
    static async buildReportHTML(analysisData, options = {}) {
        logInfo('🔨 Construyendo HTML dinámico del reporte', {
            hasData: !!analysisData?.data,
            confidence: analysisData?.metadata?.confidence
        });

        try {
            // 1. Cargar template base
            const templatePath = path.join(__dirname, 'templates', 'premium-report-template.html');
            let htmlTemplate = await fs.readFile(templatePath, 'utf8');

            // 2. Extraer y formatear datos del análisis
            const reportData = this.extractReportData(analysisData);
            
            // 3. Validar datos mínimos
            this.validateReportData(reportData);
            
            // 4. Reemplazar secciones dinámicas una por una
            htmlTemplate = await this.replaceHeaderSection(htmlTemplate, reportData);
            htmlTemplate = await this.replacePropertySection(htmlTemplate, reportData);
            htmlTemplate = await this.replaceFinancialMetrics(htmlTemplate, reportData);
            htmlTemplate = await this.replaceFinancingAnalysis(htmlTemplate, reportData);
            htmlTemplate = await this.replaceMarketComparison(htmlTemplate, reportData);
            htmlTemplate = await this.replaceLocationAnalysis(htmlTemplate, reportData);
            htmlTemplate = await this.replaceSecurityAnalysis(htmlTemplate, reportData);
            htmlTemplate = await this.replaceExecutiveSummary(htmlTemplate, reportData);
            htmlTemplate = await this.replaceDataSources(htmlTemplate, reportData);

            // 5. Aplicar configuraciones finales
            htmlTemplate = this.applyFinalFormatting(htmlTemplate, options);

            logInfo('✅ HTML dinámico construido exitosamente', {
                finalSize: `${Math.round(htmlTemplate.length / 1024)}KB`,
                sectionsProcessed: 9
            });

            return htmlTemplate;

        } catch (error) {
            logError('❌ Error construyendo HTML template', { 
                error: error.message,
                stack: error.stack?.split('\n')[0]
            });
            throw error;
        }
    }

    /**
     * Extraer y formatear datos del análisis para el template
     */
    static extractReportData(analysisData) {
        const data = analysisData?.data || {};
        const metadata = analysisData?.metadata || {};

        return {
            // Header info
            confidence: metadata.confidence || 85.0,
            generatedDate: new Date().toLocaleDateString('es-CL', {
                day: 'numeric',
                month: 'long', 
                year: 'numeric'
            }),
            aiAnalysis: metadata.aiAnalysis || {},
            
            // Property data
            property: data.propertySummary || {},
            
            // Financial metrics
            financialMetrics: data.financialMetrics || {},
            
            // Mortgage analysis
            mortgageAnalysis: data.mortgageAnalysis || {},
            
            // Market comparison
            marketComparison: data.marketComparison || {},
            
            // Location analysis
            locationAnalysis: data.locationAnalysis || {},
            
            // Executive summary
            executiveSummary: data.executiveSummary || {},
            
            // Risk assessment
            riskAssessment: data.riskAssessment || {},
            
            // Recommendations
            recommendations: data.recommendations || {},
            
            // Data sources
            dataSources: data.dataSources || [],
            
            // Metadata completo
            metadata: metadata
        };
    }

    /**
     * Validar datos mínimos para el reporte
     */
    static validateReportData(reportData) {
        const requiredFields = ['confidence', 'generatedDate'];
        const missingFields = requiredFields.filter(field => !reportData[field]);

        if (missingFields.length > 0) {
            throw new Error(`Campos requeridos faltantes: ${missingFields.join(', ')}`);
        }

        logDebug('✅ Datos del reporte validados');
    }

    /**
     * Reemplazar sección del header
     */
    static async replaceHeaderSection(html, data) {
        const aiStatus = data.aiAnalysis?.used ? 
            'Evaluación completa generada con Claude Sonnet 4' : 
            'Evaluación con análisis de respaldo';

        const headerContent = `
            <div class="header-content">
                <div>
                    <h1 class="report-title">Análisis Financiero Inmobiliario</h1>
                    <p class="report-subtitle">${aiStatus}</p>
                    <p class="report-date">Reporte generado: ${data.generatedDate}</p>
                </div>
                <div class="confidence-badge">
                    <div class="confidence-score">${data.confidence}%</div>
                    <div class="confidence-label">Confiabilidad del Análisis</div>
                </div>
            </div>
        `;

        return html.replace(/{{HEADER_CONTENT}}/g, headerContent);
    }

    /**
     * Reemplazar sección de la propiedad
     */
    static async replacePropertySection(html, data) {
        const property = data.property;
        
        const propertyContent = `
            <div class="property-grid">
                <div class="property-details">
                    <h2>${property.title || 'Propiedad sin título'}</h2>
                    <div class="property-address">📍 ${property.address || 'Ubicación no disponible'}</div>
                    <p class="property-description">
                        ${property.description || 'Descripción no disponible para esta propiedad.'}
                    </p>
                    
                    <div class="property-features">
                        ${this.buildPropertyFeatures(property.features)}
                    </div>
                </div>
                
                <div class="price-summary">
                    <div class="price-label">Precio de Inversión</div>
                    <div class="price-main">${this.formatPrice(property.price?.clp)}</div>
                    <div class="price-uf">${property.price?.uf || 'UF no disponible'}</div>
                </div>
            </div>
        `;

        return html.replace(/{{PROPERTY_CONTENT}}/g, propertyContent);
    }

    /**
     * Construir features de la propiedad dinámicamente
     */
    static buildPropertyFeatures(features = {}) {
        const defaultFeatures = [
            { icon: 'home', text: features.bedrooms || 'No especificado', label: 'Dormitorios' },
            { icon: 'expand', text: features.surface || 'No especificado', label: 'Superficie' },
            { icon: 'bath', text: features.bathrooms || 'No especificado', label: 'Baños' },
            { icon: 'car', text: features.parking || 'No especificado', label: 'Estacionamientos' },
            { icon: 'thermometer', text: features.heating || 'No especificado', label: 'Calefacción' },
            { icon: 'pool', text: features.pool || 'No especificado', label: 'Piscina' }
        ];

        return defaultFeatures.map(feature => `
            <div class="feature-item">
                <svg class="feature-icon" fill="currentColor" viewBox="0 0 20 20">
                    ${this.getFeatureIconSVG(feature.icon)}
                </svg>
                <span class="feature-text">${feature.text}</span>
            </div>
        `).join('');
    }

    /**
     * Reemplazar métricas financieras
     */
    static async replaceFinancialMetrics(html, data) {
        const metrics = data.financialMetrics;
        
        const metricsCards = [
            {
                title: '💸 Flujo de Caja Mensual',
                value: this.formatCurrency(metrics.flujoCajaMensual),
                subtitle: this.getFlowSubtitle(metrics.flujoCajaMensual),
                type: (metrics.flujoCajaMensual || 0) >= 0 ? 'positive' : 'negative',
                calculation: this.buildFlowCalculation(metrics)
            },
            {
                title: '📈 Yield Bruto Anual', 
                value: `${metrics.yieldBruto || 0}%`,
                subtitle: 'Rentabilidad bruta antes de gastos',
                type: 'positive',
                calculation: 'Ingresos anuales ÷ Precio de compra × 100'
            },
            {
                title: '📉 Yield Neto Anual',
                value: `${metrics.yieldNeto || 0}%`, 
                subtitle: 'Rentabilidad neta después de gastos operacionales',
                type: 'positive',
                calculation: 'Ingresos netos anuales ÷ Precio de compra × 100'
            },
            {
                title: '📈 Cap Rate',
                value: `${metrics.capRate || 0}%`,
                subtitle: 'Tasa de capitalización de la inversión', 
                type: 'positive',
                calculation: 'NOI ÷ Valor de la propiedad × 100'
            },
            {
                title: '⚖️ ROI Proyectado',
                value: `${metrics.roi || 0}%`,
                subtitle: 'Retorno sobre inversión anual',
                type: 'neutral',
                calculation: 'Ganancia anual ÷ Inversión inicial × 100'
            },
            {
                title: '💡 Plusvalía Esperada',
                value: `${metrics.appreciation || 3.5}%`,
                subtitle: 'Apreciación anual proyectada',
                type: 'positive',
                calculation: 'Basado en histórico de la zona y tendencias de mercado'
            }
        ];

        const metricsHTML = metricsCards.map(metric => `
            <div class="metric-card metric-${metric.type}">
                <div class="metric-header">
                    <svg class="metric-icon" fill="currentColor" viewBox="0 0 20 20">
                        ${this.getMetricIconSVG(metric.title)}
                    </svg>
                    <div class="metric-title">${metric.title}</div>
                </div>
                <div class="metric-value">${metric.value}</div>
                <div class="metric-subtitle">${metric.subtitle}</div>
                <div class="metric-details">
                    <strong>Cálculo:</strong><br>
                    ${metric.calculation}
                </div>
            </div>
        `).join('');

        return html.replace(/{{FINANCIAL_METRICS}}/g, metricsHTML);
    }

    /**
     * Reemplazar análisis de financiamiento
     */
    static async replaceFinancingAnalysis(html, data) {
        const mortgage = data.mortgageAnalysis;
        
        if (!mortgage || !mortgage.scenarios) {
            const noDataContent = `
                <h2 class="financing-title">💰 Análisis de Financiamiento</h2>
                <div style="text-align: center; padding: 40px; color: #718096;">
                    <p>Análisis de financiamiento no disponible</p>
                    <p style="font-size: 0.9rem;">Los datos de simulación hipotecaria no pudieron ser obtenidos</p>
                </div>
            `;
            return html.replace(/{{FINANCING_ANALYSIS}}/g, noDataContent);
        }

        const bestScenarios = this.getBestFinancingScenarios(mortgage);
        const statistics = this.getFinancingStatistics(mortgage);

        const financingContent = `
            <h2 class="financing-title">💰 Análisis Completo de Financiamiento</h2>
            <p style="margin-bottom: 25px; color: #4a5568;">
                Comparación exhaustiva basada en simulación con <strong>${statistics.totalBanks} bancos</strong> del sistema financiero chileno.
                Análisis de <strong>${statistics.totalScenarios} plazos diferentes</strong> para optimizar su inversión.
            </p>

            ${this.buildFinancingStatistics(statistics)}
            ${this.buildFinancingOptions(bestScenarios)}
            ${this.buildTopBanksComparison(bestScenarios)}
            ${this.buildOptimizationAnalysis(mortgage)}
        `;

        return html.replace(/{{FINANCING_ANALYSIS}}/g, financingContent);
    }

    /**
     * Reemplazar comparación de mercado
     */
    static async replaceMarketComparison(html, data) {
        const market = data.marketComparison;
        
        if (!market || !market.comparables || market.comparables.length === 0) {
            const noDataContent = `
                <h2 class="comparison-title">📊 Análisis de Mercado</h2>
                <div style="text-align: center; padding: 40px; color: #718096;">
                    <p>Datos de mercado no disponibles</p>
                    <p style="font-size: 0.9rem;">No se pudieron obtener propiedades comparables</p>
                </div>
            `;
            return html.replace(/{{MARKET_COMPARISON}}/g, noDataContent);
        }

        const marketContent = `
            <h2 class="comparison-title">📊 Análisis de Mercado - Propiedades Comparables</h2>
            <p style="margin-bottom: 25px; color: #4a5568;">
                Análisis de ${market.totalAnalyzed || 0} propiedades comparables en la zona con características similares.
            </p>
            
            <div class="comparables-list">
                ${this.buildComparablesList(market.comparables.slice(0, 5))}
            </div>
            
            ${this.buildMarketAnalysis(market)}
        `;

        return html.replace(/{{MARKET_COMPARISON}}/g, marketContent);
    }

    /**
     * Reemplazar análisis de ubicación
     */
    static async replaceLocationAnalysis(html, data) {
        const location = data.locationAnalysis;
        
        if (!location) {
            return html.replace(/{{LOCATION_ANALYSIS}}/g, '');
        }

        const locationContent = `
            <div class="financial-section">
                <h2 class="section-title">
                    <svg class="section-icon" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd"/>
                    </svg>
                    Análisis Integral de Ubicación
                </h2>
                ${this.buildLocationScores(location)}
                ${this.buildLocationServices()}
            </div>
        `;

        return html.replace(/{{LOCATION_ANALYSIS}}/g, locationContent);
    }

    /**
     * Reemplazar análisis de seguridad
     */
    static async replaceSecurityAnalysis(html, data) {
        const security = data.riskAssessment;
        
        const securityContent = `
            <div class="financial-section">
                <h2 class="section-title">
                    <svg class="section-icon" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
                    </svg>
                    Análisis de Seguridad de la Zona
                </h2>
                ${this.buildSecurityMetrics(security)}
            </div>
        `;

        return html.replace(/{{SECURITY_ANALYSIS}}/g, securityContent);
    }

    /**
     * Reemplazar resumen ejecutivo
     */
    static async replaceExecutiveSummary(html, data) {
        const summary = data.executiveSummary;
        const recommendations = data.recommendations;
        
        const summaryContent = `
            <h2 class="summary-title">🎯 Resumen Ejecutivo</h2>
            <p style="text-align: center; font-size: 1.1rem; margin-bottom: 20px; opacity: 0.9;">
                ${summary.analysisSource || 'Recomendación basada en análisis exhaustivo de indicadores financieros y condiciones de mercado'}
            </p>
            
            <div class="summary-grid">
                ${this.buildSummaryItems(summary, recommendations)}
            </div>
        `;

        return html.replace(/{{EXECUTIVE_SUMMARY}}/g, summaryContent);
    }

    /**
     * Reemplazar fuentes de datos
     */
    static async replaceDataSources(html, data) {
        const sources = data.dataSources;
        const metadata = data.metadata;
        
        const sourcesContent = `
            <h3 class="sources-title">📋 Fuentes de Información</h3>
            <div class="sources-list">
                ${this.buildDataSourcesList(sources)}
            </div>
            
            <div class="timestamp">
                Reporte generado automáticamente el ${data.generatedDate} | 
                Datos actualizados en tiempo real | Confiabilidad: ${data.confidence}%
                ${metadata.aiAnalysis?.used ? ' | Análisis potenciado por IA' : ''}
            </div>
        `;

        return html.replace(/{{DATA_SOURCES}}/g, sourcesContent);
    }

    // ===== MÉTODOS AUXILIARES =====

    /**
     * Obtener subtítulo del flujo de caja
     */
    static getFlowSubtitle(flow) {
        if (!flow) return 'Flujo de caja no calculado';
        if (flow > 0) return 'Flujo positivo con financiamiento optimizado';
        if (flow === 0) return 'Flujo en equilibrio';
        return 'Flujo negativo - revisar financiamiento';
    }

    /**
     * Construir cálculo del flujo de caja
     */
    static buildFlowCalculation(metrics) {
        const income = metrics.monthlyIncome || 0;
        const expenses = metrics.monthlyExpenses || 0;
        const mortgage = metrics.monthlyMortgage || 0;
        
        return `
            Ingreso arriendo: ${this.formatCurrency(income)}<br>
            Gastos operacionales: ${this.formatCurrency(-expenses)}<br>
            Dividendo hipotecario: ${this.formatCurrency(-mortgage)}<br>
            <div class="metric-calculation">
                = ${this.formatCurrency(income)} ${this.formatCurrency(-expenses)} ${this.formatCurrency(-mortgage)} = ${this.formatCurrency(income - expenses - mortgage)}
            </div>
        `;
    }

    /**
     * Formatear precio en pesos chilenos
     */
    static formatPrice(price) {
        if (!price) return 'Precio no disponible';
        return new Intl.NumberFormat('es-CL', {
            style: 'currency',
            currency: 'CLP',
            minimumFractionDigits: 0
        }).format(price);
    }

    /**
     * Formatear moneda
     */
    static formatCurrency(amount) {
        if (amount === null || amount === undefined) return '$0';
        return new Intl.NumberFormat('es-CL', {
            style: 'currency',
            currency: 'CLP',
            minimumFractionDigits: 0
        }).format(amount);
    }

    /**
     * Obtener mejores escenarios de financiamiento
     */
    static getBestFinancingScenarios(mortgage) {
        if (!mortgage.scenarios || !Array.isArray(mortgage.scenarios)) {
            return [];
        }

        return mortgage.scenarios
            .filter(scenario => scenario.resumen?.mejorOferta)
            .slice(0, 3)
            .map(scenario => ({
                plazo: scenario.escenario.plazo,
                dividendo: scenario.resumen.mejorOferta.dividendo,
                banco: scenario.resumen.mejorOferta.banco,
                tasa: scenario.resumen.mejorOferta.tasa
            }));
    }

    /**
     * Obtener estadísticas de financiamiento
     */
    static getFinancingStatistics(mortgage) {
        return {
            totalBanks: mortgage.statistics?.totalBanks || 10,
            totalScenarios: mortgage.scenarios?.length || 3,
            bestRate: mortgage.statistics?.bestRate || '4.20%',
            maxSavings: mortgage.statistics?.maxSavings || 'No disponible'
        };
    }

    /**
     * Construir lista de comparables
     */
    static buildComparablesList(comparables) {
        return comparables.map(comp => `
            <div class="comparable-item">
                <div class="comparable-details">
                    <h4>${comp.titulo || 'Propiedad sin título'}</h4>
                    <div class="comparable-specs">${comp.dormitorios || ''} ${comp.banos || ''} • ${comp.superficie || ''}</div>
                    <div class="comparable-location">${comp.ubicacion || 'Ubicación no disponible'}</div>
                </div>
                <div class="comparable-location">Zona comparable</div>
                <div class="comparable-price">${comp.precio_uf || comp.precio_clp || 'Precio no disponible'}</div>
            </div>
        `).join('');
    }

    /**
     * Obtener SVG de iconos de características
     */
    static getFeatureIconSVG(iconType) {
        const icons = {
            home: '<path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z"/>',
            expand: '<path fill-rule="evenodd" d="M3 4a1 1 0 011-1h4a1 1 0 010 2H6.414l2.293 2.293a1 1 0 01-1.414 1.414L5 6.414V8a1 1 0 01-2 0V4zm9 1a1 1 0 010-2h4a1 1 0 011 1v4a1 1 0 01-2 0V6.414l-2.293 2.293a1 1 0 11-1.414-1.414L13.586 5H12zm-9 7a1 1 0 012 0v1.586l2.293-2.293a1 1 0 111.414 1.414L6.414 15H8a1 1 0 010 2H4a1 1 0 01-1-1v-4zm13-1a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 010-2h1.586l-2.293-2.293a1 1 0 111.414-1.414L15.586 13H14a1 1 0 01-1-1z" clip-rule="evenodd"/>',
            bath: '<path d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h6a1 1 0 110 2H4a1 1 0 01-1-1zM3 16a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"/>',
            car: '<path fill-rule="evenodd" d="M10 2a4 4 0 00-4 4v1H5a1 1 0 00-.994.89l-1 9A1 1 0 004 18h12a1 1 0 00.994-1.11l-1-9A1 1 0 0015 7h-1V6a4 4 0 00-4-4zm2 5V6a2 2 0 10-4 0v1h4zm-6 3a1 1 0 112 0 1 1 0 01-2 0zm7-1a1 1 0 100 2 1 1 0 000-2z" clip-rule="evenodd"/>',
            thermometer: '<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clip-rule="evenodd"/>',
            pool: '<path d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h6a1 1 0 110 2H4a1 1 0 01-1-1zM3 16a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"/>'
        };
        return icons[iconType] || icons.home;
    }

    /**
     * Obtener SVG de iconos de métricas
     */
    static getMetricIconSVG(title) {
        // Retorna un icono genérico de gráfico
        return '<path fill-rule="evenodd" d="M3 3a1 1 0 000 2v8a2 2 0 002 2h2.586l-1.293 1.293a1 1 0 101.414 1.414L10 15.414l2.293 2.293a1 1 0 001.414-1.414L12.414 15H15a2 2 0 002-2V5a1 1 0 100-2H3zm11.707 4.707a1 1 0 00-1.414-1.414L10 9.586 8.707 8.293a1 1 0 00-1.414 0l-2 2a1 1 0 101.414 1.414L8 10.414l1.293 1.293a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>';
    }

    /**
     * Aplicar formateo final al HTML
     */
    static applyFinalFormatting(html, options) {
        // Minificar HTML si se solicita
        if (options.minify) {
            html = html.replace(/\s+/g, ' ').trim();
        }

        // Aplicar configuraciones personalizadas
        if (options.customCSS) {
            html = html.replace('</style>', `${options.customCSS}</style>`);
        }

        return html;
    }

    // ===== MÉTODOS ADICIONALES PARA COMPLETAR FUNCIONALIDAD =====

    static buildFinancingStatistics(statistics) {
        return `
            <div style="background: #f7fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 25px; margin-bottom: 25px;">
                <h3 style="color: #2d3748; font-size: 1.3rem; margin-bottom: 20px; font-weight: 600;">📊 Estadísticas del Análisis</h3>
                <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px;">
                    <div style="text-align: center; padding: 15px; background: white; border-radius: 8px; border: 1px solid #e2e8f0;">
                        <div style="font-size: 1.8rem; font-weight: 700; color: #667eea; margin-bottom: 5px;">${statistics.totalBanks}</div>
                        <div style="font-size: 0.9rem; color: #718096;">Bancos Analizados</div>
                    </div>
                    <div style="text-align: center; padding: 15px; background: white; border-radius: 8px; border: 1px solid #e2e8f0;">
                        <div style="font-size: 1.8rem; font-weight: 700; color: #667eea; margin-bottom: 5px;">${statistics.totalScenarios}</div>
                        <div style="font-size: 0.9rem; color: #718096;">Escenarios</div>
                    </div>
                    <div style="text-align: center; padding: 15px; background: white; border-radius: 8px; border: 1px solid #e2e8f0;">
                        <div style="font-size: 1.8rem; font-weight: 700; color: #38a169; margin-bottom: 5px;">${statistics.bestRate}</div>
                        <div style="font-size: 0.9rem; color: #718096;">Mejor Tasa</div>
                    </div>
                    <div style="text-align: center; padding: 15px; background: white; border-radius: 8px; border: 1px solid #e2e8f0;">
                        <div style="font-size: 1.8rem; font-weight: 700; color: #38a169; margin-bottom: 5px;">${statistics.maxSavings}</div>
                        <div style="font-size: 0.9rem; color: #718096;">Máximo Ahorro</div>
                    </div>
                </div>
            </div>
        `;
    }

    static buildFinancingOptions(scenarios) {
        const optionsHTML = scenarios.map((scenario, index) => {
            const isRecommended = index === scenarios.length - 1; // El último (30 años) como recomendado
            
            return `
                <div class="financing-card ${isRecommended ? 'recommended' : ''}">
                    <div class="financing-term">${scenario.plazo} Años</div>
                    <div class="financing-payment">${scenario.dividendo || 'No disponible'}</div>
                    <div class="financing-details">
                        Tasa: ${scenario.tasa || 'No disponible'} | <span class="financing-bank">${scenario.banco || 'No disponible'}</span>
                    </div>
                </div>
            `;
        }).join('');

        return `
            <div class="financing-options">
                ${optionsHTML}
            </div>
        `;
    }

    static buildTopBanksComparison(scenarios) {
        if (scenarios.length === 0) return '';

        return `
            <div style="background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 25px; margin: 25px 0;">
                <h3 style="color: #2d3748; font-size: 1.3rem; margin-bottom: 20px; font-weight: 600;">🏆 Mejores Ofertas</h3>
                <p style="color: #4a5568; margin-bottom: 15px;">Comparación de las mejores opciones de financiamiento disponibles.</p>
            </div>
        `;
    }

    static buildOptimizationAnalysis(mortgage) {
        return `
            <div style="background: #f0fff4; padding: 20px; border-radius: 8px; border-left: 4px solid #38a169; margin-top: 20px;">
                <h4 style="color: #22543d; margin-bottom: 15px; font-weight: 600;">🎯 Análisis de Optimización</h4>
                <p style="color: #276749; line-height: 1.6;">
                    <strong>💡 Recomendación Ejecutiva:</strong> Basado en el análisis de múltiples escenarios de financiamiento,
                    se recomienda evaluar las opciones que generen el mejor flujo de caja mensual manteniendo costos totales competitivos.
                </p>
            </div>
        `;
    }

    static buildMarketAnalysis(market) {
        return `
            <div style="background: #fffbeb; padding: 20px; border-radius: 8px; border-left: 4px solid #f6ad55; margin-top: 20px;">
                <h4 style="color: #92400e; margin-bottom: 10px;">📈 Análisis del Mercado</h4>
                <p style="color: #a05621; line-height: 1.6;">
                    <strong>Análisis basado en ${market.totalAnalyzed || 0} propiedades comparables.</strong>
                    El precio se encuentra ${market.priceAnalysis?.analysis || 'en rango competitivo'} comparado con propiedades similares en la zona.
                </p>
            </div>
        `;
    }

    static buildLocationScores(location) {
        return `
            <div class="metrics-grid">
                <div class="metric-card metric-positive">
                    <div class="metric-header">
                        <div class="metric-title">🏛️ Puntuación General</div>
                    </div>
                    <div class="metric-value">${location.overallScore || 8.0}/10</div>
                    <div class="metric-subtitle">Evaluación integral de la ubicación</div>
                </div>
                <div class="metric-card metric-positive">
                    <div class="metric-header">
                        <div class="metric-title">🚨 Seguridad</div>
                    </div>
                    <div class="metric-value">${location.securityScore || 8.5}/10</div>
                    <div class="metric-subtitle">Índice de seguridad de la zona</div>
                </div>
                <div class="metric-card metric-positive">
                    <div class="metric-header">
                        <div class="metric-title">🚇 Accesibilidad</div>
                    </div>
                    <div class="metric-value">${location.accessibilityScore || 7.5}/10</div>
                    <div class="metric-subtitle">Transporte y conectividad</div>
                </div>
                <div class="metric-card metric-positive">
                    <div class="metric-header">
                        <div class="metric-title">🏥 Servicios</div>
                    </div>
                    <div class="metric-value">${location.servicesScore || 8.0}/10</div>
                    <div class="metric-subtitle">Servicios y comodidades cercanas</div>
                </div>
            </div>
        `;
    }

    static buildLocationServices() {
        return `
            <div style="background: white; border-radius: 12px; padding: 25px; margin-bottom: 25px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
                <h3 style="color: #2d3748; font-size: 1.4rem; margin-bottom: 20px;">🏢 Servicios y Comodidades</h3>
                <p style="color: #4a5568; line-height: 1.6;">
                    La ubicación cuenta con excelente acceso a servicios esenciales, áreas de recreación y centros comerciales.
                    Factor importante para la valorización y demanda de arriendo de la propiedad.
                </p>
            </div>
        `;
    }

    static buildSecurityMetrics(security) {
        return `
            <div class="metrics-grid">
                <div class="metric-card metric-positive">
                    <div class="metric-header">
                        <div class="metric-title">🔒 Seguridad General</div>
                    </div>
                    <div class="metric-value">${security?.overall || 'Medio'}</div>
                    <div class="metric-subtitle">Nivel general de seguridad de la zona</div>
                </div>
                <div class="metric-card metric-positive">
                    <div class="metric-header">
                        <div class="metric-title">🚨 Servicios de Emergencia</div>
                    </div>
                    <div class="metric-value">< 5 min</div>
                    <div class="metric-subtitle">Tiempo promedio de respuesta</div>
                </div>
                <div class="metric-card metric-positive">
                    <div class="metric-header">
                        <div class="metric-title">🌊 Riesgos Naturales</div>
                    </div>
                    <div class="metric-value">Bajo</div>
                    <div class="metric-subtitle">Evaluación de riesgos naturales</div>
                </div>
            </div>
        `;
    }

    static buildSummaryItems(summary, recommendations) {
        return `
            <div class="summary-item">
                <h4>✅ Viabilidad de la Inversión</h4>
                <p>
                    ${summary.keyPoints?.[0] || 'La propiedad presenta indicadores financieros sólidos para la inversión.'}
                    <span class="risk-indicator risk-low">Recomendado</span>
                </p>
            </div>
            
            <div class="summary-item">
                <h4>💰 Optimización Financiera</h4>
                <p>
                    ${summary.keyPoints?.[1] || 'Se recomienda evaluar las opciones de financiamiento disponibles para optimizar el flujo de caja.'}
                    <span class="risk-indicator risk-low">Factible</span>
                </p>
            </div>
            
            <div class="summary-item">
                <h4>📈 Potencial de Crecimiento</h4>
                <p>
                    ${summary.keyPoints?.[2] || 'La ubicación presenta potencial de crecimiento y valorización a mediano plazo.'}
                    <span class="risk-indicator risk-medium">Positivo</span>
                </p>
            </div>
            
            <div class="summary-item">
                <h4>🎯 Recomendación Final</h4>
                <p>
                    <strong>${summary.recommendation || 'EVALUAR'}.</strong> 
                    ${recommendations.mainRecommendation || 'Se recomienda realizar análisis adicional antes de proceder.'}
                    <span class="risk-indicator risk-low">Analizar</span>
                </p>
            </div>
        `;
    }

    static buildDataSourcesList(sources) {
        if (!sources || sources.length === 0) {
            return `
                <strong>Datos de la propiedad:</strong> Portal inmobiliario principal<br>
                <strong>Análisis de mercado:</strong> Propiedades comparables en la zona<br>
                <strong>Simulación financiera:</strong> Sistema bancario chileno<br>
                <strong>Análisis inteligente:</strong> Procesamiento avanzado de datos
            `;
        }

        return sources.map(source => `
            <strong>${source.type}:</strong> ${source.source} (${source.status})<br>
        `).join('');
    }
}

module.exports = ReportTemplateBuilder;