// src/services/pdf/PDFGeneratorService.js
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs').promises;
const { logInfo, logError, logDebug, logWarn } = require('../../utils/logger');
const { ErrorFactory } = require('../../utils/errors');
const ReportTemplateBuilder = require('./ReportTemplateBuilder');
const PDFConfig = require('./PDFConfig');

/**
 * Servicio de generación de PDFs premium con Playwright - CORREGIDO
 */
class PDFGeneratorService {

    /**
     * Generar PDF a partir de datos de análisis financiero - MÉTODO PRINCIPAL CORREGIDO
     */
    static async generateReportPDF(analysisData, options = {}) {
        const startTime = Date.now();

        logInfo('🚀 Iniciando generación de PDF con datos de análisis', {
            hasData: !!analysisData?.data,
            confidence: analysisData?.metadata?.confidence,
            options: {
                quality: options.quality || 'high',
                device: options.device || 'desktop',
                filename: options.filename
            }
        });

        let browser = null;
        let context = null;
        let page = null;

        try {
            // 1. Validar datos de entrada
            this.validateAnalysisData(analysisData);

            // 2. Generar HTML del reporte usando template builder
            logDebug('📄 Generando HTML del reporte...');
            //const htmlContent = await ReportTemplateBuilder.buildReportHTML(analysisData, options);
            const htmlContent = await ReportTemplateBuilder.buildReportHTML(analysisData, options);
            // 3. Lanzar browser con configuración optimizada
            logDebug('🌐 Lanzando browser para generación PDF...');
            browser = await this.launchBrowser(options);
            context = await this.createContext(browser, options);
            page = await context.newPage();

            // 4. Configurar página para generación de PDF
            await this.configurePage(page, options);

            // 5. Cargar contenido HTML en la página
            logDebug('📄 Cargando contenido HTML...');
            await this.loadHTMLContent(page, htmlContent);

            // 6. Esperar a que todo el contenido se renderice
            await this.waitForContentRendering(page);

            // 7. CORREGIDO: Aplicar configuraciones finales de PDF
            const pdfConfig = this.buildPDFConfigCorrected(options);

            // 8. Generar PDF con configuración optimizada
            logDebug('🖨️ Generando PDF...');
            const pdfBuffer = await page.pdf(pdfConfig);

            // 9. Validar PDF generado
            const pdfMetadata = await this.validateGeneratedPDF(pdfBuffer);

            const totalTime = Date.now() - startTime;

            logInfo('✅ PDF generado exitosamente', {
                sizeKB: Math.round(pdfBuffer.length / 1024),
                pages: pdfMetadata.pages,
                duration: `${totalTime}ms`,
                quality: options.quality || 'high',
                confidence: analysisData.metadata?.confidence
            });

            return {
                success: true,
                pdf: pdfBuffer,
                metadata: {
                    sizeBytes: pdfBuffer.length,
                    sizeKB: Math.round(pdfBuffer.length / 1024),
                    pages: pdfMetadata.pages,
                    generatedAt: new Date().toISOString(),
                    generationTime: `${totalTime}ms`,
                    template: 'NotBrokkerPremiumReportV4',
                    engine: 'Playwright',
                    config: {
                        device: options.device || 'desktop',
                        quality: options.quality || 'high',
                        format: pdfConfig.format
                    }
                }
            };

        } catch (error) {
            logError('❌ Error generando PDF', {
                error: error.message,
                duration: `${Date.now() - startTime}ms`,
                stack: error.stack?.split('\n')[0]
            });

            throw ErrorFactory.internal('Error generando reporte PDF premium', error);

        } finally {
            await this.cleanup(page, context, browser);
        }
    }

    /**
     * CORREGIDO: Construir configuración PDF sin conflictos de formato
     */
    static buildPDFConfigCorrected(options = {}) {
        // Configuración base del PDF (solo formatos de papel válidos)
        const baseConfig = {
            format: 'A4', // CORREGIDO: Solo formato de papel, nunca 'png'
            printBackground: true,
            margin: {
                top: '0.5in',
                right: '0.5in',
                bottom: '0.6in',
                left: '0.5in'
            },
            displayHeaderFooter: true,
            headerTemplate: PDFConfig.getHeaderTemplate(),
            footerTemplate: PDFConfig.getFooterTemplate(),
            preferCSSPageSize: true,
            timeout: 60000,
            omitBackground: false
        };

        // CORREGIDO: Configuración de escala basada en dispositivo (no en calidad de imagen)
        const deviceConfig = PDFConfig.getDeviceConfig(options.device);
        const qualityConfig = this.getQualityConfigCorrected(options.quality);

        const finalConfig = {
            ...baseConfig,
            scale: deviceConfig.scale,
            ...qualityConfig,
            ...options.pdfOptions
        };

        logDebug('✅ Configuración PDF corregida construida', {
            format: finalConfig.format,
            scale: finalConfig.scale,
            device: options.device || 'desktop',
            quality: options.quality || 'high'
        });

        return finalConfig;
    }

    /**
     * NUEVO: Configuración de calidad específica para PDF (no para imágenes)
     */
    static getQualityConfigCorrected(quality = 'high') {
        const configs = {
            low: {
                scale: 0.7,
                printBackground: true
            },
            medium: {
                scale: 0.8,
                printBackground: true
            },
            high: {
                scale: 0.9,
                printBackground: true
            }
        };

        return configs[quality] || configs.high;
    }

    /**
     * Validar datos de análisis de entrada
     */
    static validateAnalysisData(analysisData) {
        if (!analysisData) {
            throw new Error('Datos de análisis requeridos para generar PDF');
        }

        if (!analysisData.data) {
            throw new Error('Sección "data" faltante en análisis');
        }

        // Validar secciones mínimas requeridas
        const requiredSections = ['resumenEjecutivo', 'propiedad'];
        const missingSections = requiredSections.filter(section =>
            !analysisData.data[section]
        );

        if (missingSections.length > 0) {
            logWarn('⚠️ Secciones faltantes en datos de análisis', {
                missing: missingSections
            });
        }

        logDebug('✅ Datos de análisis validados correctamente');
    }

    /**
     * Lanzar browser con configuración optimizada
     */
    static async launchBrowser(options = {}) {
        try {
            const browserOptions = {
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--single-process',
                    '--disable-gpu'
                ],
                ...options.browserOptions
            };

            const browser = await chromium.launch(browserOptions);

            logDebug('✅ Browser lanzado correctamente', {
                headless: browserOptions.headless,
                args: browserOptions.args.length
            });

            return browser;

        } catch (error) {
            logError('❌ Error lanzando browser', { error: error.message });
            throw new Error(`Error iniciando browser: ${error.message}`);
        }
    }

    /**
     * Crear contexto de browser
     */
    static async createContext(browser, options = {}) {
        try {
            const deviceConfig = PDFConfig.getDeviceConfig(options.device);

            const context = await browser.newContext({
                viewport: deviceConfig.viewport,
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            });

            logDebug('✅ Contexto de browser creado', {
                viewport: deviceConfig.viewport,
                device: options.device || 'desktop'
            });

            return context;

        } catch (error) {
            logError('❌ Error creando contexto', { error: error.message });
            throw new Error(`Error creando contexto: ${error.message}`);
        }
    }

    /**
     * Configurar página para PDF
     */
    static async configurePage(page, options = {}) {
        try {
            // Configurar timeouts
            page.setDefaultTimeout(30000);
            page.setDefaultNavigationTimeout(30000);

            // Inyectar CSS adicional para PDF
            await page.addStyleTag({
                content: PDFConfig.getAdditionalCSS()
            });

            logDebug('✅ Página configurada para PDF');

        } catch (error) {
            logError('❌ Error configurando página', { error: error.message });
            throw new Error(`Error configurando página: ${error.message}`);
        }
    }

    /**
     * Cargar contenido HTML en la página
     */
    static async loadHTMLContent(page, htmlContent) {
        try {
            await page.setContent(htmlContent, {
                waitUntil: 'domcontentloaded',
                timeout: 30000
            });

            logDebug('✅ Contenido HTML cargado', {
                htmlSize: `${Math.round(htmlContent.length / 1024)}KB`
            });

        } catch (error) {
            logError('❌ Error cargando HTML', { error: error.message });
            throw new Error(`Error cargando contenido HTML: ${error.message}`);
        }
    }

    /**
     * Esperar a que todo el contenido se renderice
     */
    static async waitForContentRendering(page) {
        try {
            // Esperar elementos críticos
            await page.waitForSelector('.report-header', { timeout: 10000 });
            await page.waitForSelector('.property-summary', { timeout: 5000 });

            // Esperar un poco más para imágenes y estilos
            await page.waitForTimeout(2000);

            // Verificar que no haya elementos cargando
            await page.waitForFunction(() => {
                const loadingElements = document.querySelectorAll('.loading, .spinner');
                return loadingElements.length === 0;
            }, { timeout: 5000 }).catch(() => {
                logWarn('⚠️ Timeout esperando elementos loading, continuando...');
            });

            logDebug('✅ Contenido renderizado completamente');

        } catch (error) {
            logWarn('⚠️ Error esperando renderizado, continuando', {
                error: error.message
            });
        }
    }

    /**
     * Validar PDF generado
     */
    static async validateGeneratedPDF(pdfBuffer) {
        logDebug('🔍 Validando PDF generado...');

        try {
            if (pdfBuffer.length < 50000) {
                throw new Error('PDF generado muy pequeño - posible error');
            }

            const pdfSignature = pdfBuffer.toString('ascii', 0, 4);
            if (pdfSignature !== '%PDF') {
                throw new Error('Archivo generado no es un PDF válido');
            }

            let pages = 'Unknown';
            try {
                // Intentar obtener número de páginas (opcional)
                const pdfText = pdfBuffer.toString('ascii');
                const pageMatches = pdfText.match(/\/Count\s+(\d+)/);
                if (pageMatches) {
                    pages = parseInt(pageMatches[1]);
                }
            } catch (parseError) {
                logWarn('⚠️ No se pudo determinar número de páginas', {
                    error: parseError.message
                });
            }

            logDebug('✅ PDF validado correctamente', {
                sizeKB: Math.round(pdfBuffer.length / 1024),
                pages
            });

            return {
                valid: true,
                pages,
                sizeBytes: pdfBuffer.length,
                sizeKB: Math.round(pdfBuffer.length / 1024)
            };

        } catch (error) {
            logError('❌ Error validando PDF', { error: error.message });
            throw new Error(`PDF inválido: ${error.message}`);
        }
    }

    /**
     * Limpiar recursos
     */
    static async cleanup(page, context, browser) {
        logDebug('🧹 Iniciando cleanup de recursos...');

        try {
            if (page && !page.isClosed()) {
                await page.close();
                logDebug('✓ Página cerrada');
            }
        } catch (error) {
            logWarn('⚠️ Error cerrando página', { error: error.message });
        }

        try {
            if (context) {
                await context.close();
                logDebug('✓ Contexto cerrado');
            }
        } catch (error) {
            logWarn('⚠️ Error cerrando contexto', { error: error.message });
        }

        try {
            if (browser) {
                await browser.close();
                logDebug('✓ Browser cerrado');
            }
        } catch (error) {
            logWarn('⚠️ Error cerrando browser', { error: error.message });
        }

        logDebug('✅ Cleanup completado');
    }

    /**
     * Test de funcionamiento del servicio
     */
    static async testService() {
        logInfo('🧪 Iniciando test del servicio PDF...');

        try {
            const browser = await this.launchBrowser({ browserOptions: { headless: true } });
            const context = await browser.newContext();
            const page = await context.newPage();

            await page.setContent(`
                <html>
                    <body>
                        <h1>Test PDF Service</h1>
                        <div class="container">
                            <div class="report-header">Test Header</div>
                            <div class="property-summary">Test Property</div>
                            <div class="financial-section">Test Metrics</div>
                        </div>
                    </body>
                </html>
            `);

            const testPDF = await page.pdf({ format: 'A4' });
            await browser.close();

            if (testPDF && testPDF.length > 1000) {
                logInfo('✅ Test del servicio PDF exitoso');
                return {
                    success: true,
                    message: 'Servicio PDF funcionando correctamente',
                    testPDFSize: testPDF.length,
                    engine: 'Playwright'
                };
            } else {
                throw new Error('PDF de test inválido');
            }

        } catch (error) {
            logError('❌ Test del servicio PDF falló', { error: error.message });
            return {
                success: false,
                error: error.message,
                engine: 'Playwright'
            };
        }
    }

    /**
     * Obtener información del servicio
     */
    static getServiceInfo() {
        return {
            service: 'PDFGeneratorService',
            version: '1.0.0',
            engine: 'Playwright',
            status: 'operational',
            capabilities: {
                formats: ['PDF'],
                quality: ['low', 'medium', 'high'],
                devices: ['desktop', 'tablet', 'mobile'],
                maxSize: '50MB',
                timeout: '60 seconds'
            },
            dependencies: {
                playwright: 'latest',
                nodejs: process.version
            }
        };
    }

    /**
 * MÉTODO ALIAS: Para compatibilidad con PDFController
 * Este método debe agregarse al final de la clase PDFGeneratorService
 */
    static async generateFinancialReportPDF(analysisData, options = {}) {
        logInfo('📄 Generando PDF de reporte financiero (método alias)', {
            hasData: !!analysisData?.data,
            confidence: analysisData?.metadata?.confidence,
            options: {
                quality: options.quality || 'high',
                device: options.device || 'desktop'
            }
        });

        try {
            // Delegar al método principal que ya existe
            return await this.generateReportPDF(analysisData, options);
        } catch (error) {
            logError('❌ Error en método alias generateFinancialReportPDF', {
                error: error.message,
                hasAnalysisData: !!analysisData,
                stack: error.stack?.split('\n')[0]
            });
            throw error;
        }
    }

}



module.exports = PDFGeneratorService;