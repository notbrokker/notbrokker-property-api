// src/services/pdf/PDFConfig.js
/**
 * Configuración completa para generación de PDFs premium
 */
class PDFConfig {
    
    /**
     * Configuración optimizada para generación de PDF de alta calidad
     */
    static getOptimizedConfig(options = {}) {
        return {
            format: 'A4',
            printBackground: true,
            margin: {
                top: '0.5in',
                right: '0.5in', 
                bottom: '0.6in',
                left: '0.5in'
            },
            displayHeaderFooter: true,
            headerTemplate: this.getHeaderTemplate(),
            footerTemplate: this.getFooterTemplate(),
            preferCSSPageSize: true,
            scale: 0.85,
            timeout: 60000, // 60 segundos timeout
            omitBackground: false,
            ...options.pdfOptions
        };
    }

    /**
     * CSS adicional optimizado para PDF
     */
    static getAdditionalCSS() {
        return `
            @page {
                size: A4;
                margin: 0.5in;
            }
            
            @media print {
                * {
                    -webkit-print-color-adjust: exact !important;
                    color-adjust: exact !important;
                    print-color-adjust: exact !important;
                }
                
                body {
                    font-size: 12px !important;
                    line-height: 1.4 !important;
                    background: white !important;
                }
                
                .container {
                    max-width: none !important;
                    margin: 0 !important;
                    padding: 0 !important;
                }
                
                /* Evitar saltos de página en elementos críticos */
                .report-header,
                .property-summary,
                .metric-card,
                .financing-card,
                .summary-item {
                    page-break-inside: avoid;
                    break-inside: avoid;
                }
                
                .executive-summary {
                    page-break-before: auto;
                }
                
                .data-sources {
                    page-break-before: auto;
                }
                
                /* Ajustar grids para PDF */
                .metrics-grid {
                    grid-template-columns: repeat(2, 1fr) !important;
                    gap: 12px !important;
                }
                
                .financing-options {
                    grid-template-columns: repeat(2, 1fr) !important;
                    gap: 15px !important;
                }
                
                .summary-grid {
                    grid-template-columns: repeat(2, 1fr) !important;
                    gap: 15px !important;
                }
                
                /* Ajustar tamaños de fuente */
                .report-title {
                    font-size: 1.6rem !important;
                }
                
                .metric-value {
                    font-size: 1.6rem !important;
                }
                
                .confidence-score {
                    font-size: 2rem !important;
                }
                
                .price-main {
                    font-size: 1.6rem !important;
                }
                
                .financing-payment {
                    font-size: 1.2rem !important;
                }
                
                /* Optimizar espaciado */
                .financial-section,
                .financing-analysis,
                .market-comparison {
                    margin: 20px 0 !important;
                }
                
                .section-title {
                    font-size: 1.4rem !important;
                    margin-bottom: 15px !important;
                }
                
                /* Responsive adjustments */
                @media (max-width: 800px) {
                    .metrics-grid,
                    .financing-options,
                    .summary-grid {
                        grid-template-columns: 1fr !important;
                    }
                    
                    .header-content,
                    .property-grid {
                        grid-template-columns: 1fr !important;
                        text-align: center !important;
                    }
                }
            }
            
            /* Estilos específicos para elementos dinámicos */
            .dynamic-content {
                color: #2d3748 !important;
            }
            
            .pdf-page-break {
                page-break-before: always;
            }
            
            .pdf-no-break {
                page-break-inside: avoid;
            }
        `;
    }

    /**
     * Template para header del PDF
     */
    static getHeaderTemplate() {
        return `
            <div style="font-size: 9px; margin: 0 20px; width: 100%; padding: 5px 0; border-bottom: 1px solid #e2e8f0;">
                <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                        <td style="text-align: left; color: #667eea; font-weight: 600;">
                            NotBrokker - Análisis Financiero Inmobiliario
                        </td>
                        <td style="text-align: right; color: #718096;">
                            Página <span class="pageNumber"></span> de <span class="totalPages"></span>
                        </td>
                    </tr>
                </table>
            </div>
        `;
    }

    /**
     * Template para footer del PDF
     */
    static getFooterTemplate() {
        const currentDate = new Date().toLocaleDateString('es-CL', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });

        return `
            <div style="font-size: 9px; margin: 0 20px; width: 100%; padding: 5px 0; border-top: 1px solid #e2e8f0; text-align: center; color: #718096;">
                <div style="margin-bottom: 3px;">
                    Reporte generado el ${currentDate} - Información confidencial
                </div>
                <div style="font-size: 8px; color: #a0aec0;">
                    Este reporte es generado automáticamente y debe ser validado por un profesional
                </div>
            </div>
        `;
    }

    /**
     * Configuraciones específicas para diferentes tipos de reporte
     */
    static getReportTypeConfig(reportType = 'financial') {
        const configs = {
            financial: {
                orientation: 'portrait',
                quality: 'high',
                pageSize: 'A4'
            },
            summary: {
                orientation: 'portrait', 
                quality: 'medium',
                pageSize: 'A4'
            },
            detailed: {
                orientation: 'portrait',
                quality: 'high',
                pageSize: 'A4'
            }
        };

        return configs[reportType] || configs.financial;
    }

    /**
     * Configuración para diferentes dispositivos/formatos
     */
    static getDeviceConfig(device = 'desktop') {
        const configs = {
            desktop: {
                viewport: { width: 1200, height: 1600, deviceScaleFactor: 2 },
                scale: 0.85
            },
            tablet: {
                viewport: { width: 768, height: 1024, deviceScaleFactor: 2 },
                scale: 0.9
            },
            mobile: {
                viewport: { width: 375, height: 667, deviceScaleFactor: 3 },
                scale: 1.0
            }
        };

        return configs[device] || configs.desktop;
    }

    /**
     * Configuración de calidad de imagen
     */
    static getImageQualityConfig(quality = 'high') {
        const configs = {
            low: { quality: 60, format: 'jpeg' },
            medium: { quality: 80, format: 'jpeg' },
            high: { quality: 95, format: 'png' },
            vector: { format: 'svg' }
        };

        return configs[quality] || configs.high;
    }
}

module.exports = PDFConfig;