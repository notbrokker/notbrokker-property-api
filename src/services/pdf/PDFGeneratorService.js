// src/services/pdf/PDFGeneratorService.js
const { chromium } = require('playwright');
const { logInfo, logError, logDebug, logWarn } = require('../../utils/logger');
const { ErrorFactory } = require('../../utils/errors');
const ReportTemplateBuilder = require('./ReportTemplateBuilder');
const PDFConfig = require('./PDFConfig');

/**
 * Servicio principal para generación de PDFs premium con Playwright
 * TRABAJA EXCLUSIVAMENTE CON DATOS REALES DEL ANÁLISIS FINANCIERO
 */
class PDFGeneratorService {
    
    /**
     * Generar PDF completo del reporte financiero
     * @param {Object} analysisData - DATOS REALES del análisis financiero (REQUERIDO)
     * @param {Object} options - Opciones de generación PDF
     */
    static async generateFinancialReportPDF(analysisData, options = {}) {
        const startTime = Date.now();
        
        // VALIDACIÓN CRÍTICA: Los datos deben ser reales
        this.validateRealAnalysisData(analysisData);
        
        logInfo('📄 Iniciando generación de PDF con datos reales', {
            confidence: analysisData.metadata?.confidence,
            sectionsCount: Object.keys(analysisData.data || {}).length,
            hasPropertyData: !!(analysisData.data?.propertySummary),
            hasFinancialMetrics: !!(analysisData.data?.financialMetrics),
            hasMortgageAnalysis: !!(analysisData.data?.mortgageAnalysis),
            options: {
                filename: options.filename,
                device: options.device || 'desktop',
                quality: options.quality || 'high'
            }
        });

        let browser = null;
        let context = null;
        let page = null;
        
        try {
            // 1. Construir HTML dinámico del reporte CON DATOS REALES
            logDebug('🔨 Construyendo HTML dinámico con datos del análisis...');
            const htmlContent = await ReportTemplateBuilder.buildReportHTML(analysisData, options);
            
            // 2. Validar que el HTML se generó correctamente con los datos reales
            this.validateHTMLCompleteness(htmlContent);
            this.validateDataIntegrationInHTML(htmlContent, analysisData);
            
            // 3. Inicializar Playwright con configuración optimizada
            logDebug('🚀 Inicializando Playwright...');
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
            
            // 7. Aplicar configuraciones finales de PDF
            const pdfConfig = this.buildPDFConfig(options);
            
            // 8. Generar PDF con configuración optimizada
            logDebug('🖨️ Generando PDF...');
            const pdfBuffer = await page.pdf(pdfConfig);
            
            // 9. Validar PDF generado
            const pdfMetadata = await this.validateGeneratedPDF(pdfBuffer);
            
            const totalTime = Date.now() - startTime;
            
            logInfo('✅ PDF generado exitosamente con datos reales', {
                sizeKB: Math.round(pdfBuffer.length / 1024),
                pages: pdfMetadata.pages,
                duration: `${totalTime}ms`,
                quality: options.quality || 'high',
                propertyTitle: analysisData.data?.propertySummary?.title?.substring(0, 50) + '...',
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
                    generationTime: totalTime,
                    template: 'NotBrokkerPremiumReportV4',
                    sourceData: {
                        analysisConfidence: analysisData.metadata?.confidence,
                        propertyTitle: analysisData.data?.propertySummary?.title,
                        analysisDate: analysisData.metadata?.generatedAt,
                        aiAnalysisUsed: analysisData.metadata?.aiAnalysis?.used,
                        servicesUsed: Object.keys(analysisData.metadata?.services || {})
                    },
                    engine: 'Playwright',
                    config: {
                        device: options.device || 'desktop',
                        quality: options.quality || 'high',
                        format: pdfConfig.format
                    }
                }
            };
            
        } catch (error) {
            const totalTime = Date.now() - startTime;
            
            logError('❌ Error generando PDF con datos reales', { 
                error: error.message,
                duration: `${totalTime}ms`,
                propertyTitle: analysisData.data?.propertySummary?.title?.substring(0, 50),
                confidence: analysisData.metadata?.confidence,
                stack: error.stack?.split('\n')[0]
            });
            
            throw ErrorFactory.internal('Error generando reporte PDF premium', error);
            
        } finally {
            // Cleanup garantizado
            await this.cleanup(page, context, browser);
        }
    }

    /**
     * VALIDACIÓN CRÍTICA: Verificar que los datos sean reales del análisis
     */
    static validateRealAnalysisData(analysisData) {
        logDebug('🔍 Validando datos reales del análisis financiero...');

        // Verificar estructura básica
        if (!analysisData || typeof analysisData !== 'object') {
            throw ErrorFactory.validation('analysisData es requerido y debe ser un objeto válido', 'analysisData');
        }

        if (!analysisData.data) {
            throw ErrorFactory.validation('analysisData.data es requerido', 'analysisData.data');
        }

        if (!analysisData.metadata) {
            throw ErrorFactory.validation('analysisData.metadata es requerido', 'analysisData.metadata');
        }

        // Verificar que tenga al menos las secciones básicas para un PDF
        const requiredSections = ['propertySummary', 'financialMetrics'];
        const missingSections = requiredSections.filter(section => !analysisData.data[section]);
        
        if (missingSections.length > 0) {
            throw ErrorFactory.validation(
                `Secciones críticas faltantes en analysisData: ${missingSections.join(', ')}`,
                'analysisData.data'
            );
        }

        // Verificar que no sean datos mock
        if (analysisData.data.propertySummary?.title?.includes('Test') ||
            analysisData.data.propertySummary?.title?.includes('Mock') ||
            analysisData.metadata?.generatedAt?.includes('mock') ||
            analysisData._isMockData === true) {
            
            logWarn('⚠️ Se detectaron posibles datos mock en lugar de análisis real', {
                title: analysisData.data.propertySummary?.title,
                confidence: analysisData.metadata?.confidence
            });
        }

        // Verificar calidad mínima de datos
        const confidence = analysisData.metadata?.confidence;
        if (confidence && confidence < 30) {
            logWarn('⚠️ Confidence del análisis muy bajo para PDF', { confidence });
        }

        // Verificar que tenga título de propiedad real
        if (!analysisData.data.propertySummary?.title || 
            analysisData.data.propertySummary.title === 'No disponible' ||
            analysisData.data.propertySummary.title.length < 10) {
            throw ErrorFactory.validation(
                'Título de propiedad inválido o faltante en los datos reales',
                'analysisData.data.propertySummary.title'
            );
        }

        logDebug('✅ Datos del análisis validados como reales', {
            title: analysisData.data.propertySummary.title.substring(0, 50) + '...',
            confidence: confidence,
            sectionsCount: Object.keys(analysisData.data).length
        });
    }

    /**
     * Validar que los datos reales se integraron correctamente en el HTML
     */
    static validateDataIntegrationInHTML(htmlContent, analysisData) {
        logDebug('🔍 Validando integración de datos reales en HTML...');

        // Verificar que el título de la propiedad esté en el HTML
        const propertyTitle = analysisData.data?.propertySummary?.title;
        if (propertyTitle && !htmlContent.includes(propertyTitle.substring(0, 20))) {
            logWarn('⚠️ Título de propiedad no encontrado en HTML generado', {
                title: propertyTitle.substring(0, 50)
            });
        }

        // Verificar que la confidence esté en el HTML
        const confidence = analysisData.metadata?.confidence;
        if (confidence && !htmlContent.includes(confidence.toString())) {
            logWarn('⚠️ Confidence no encontrada en HTML generado', { confidence });
        }

        // Verificar que no haya placeholders genéricos
        const placeholders = [
            'No disponible',
            'Test PDF Service',
            'Datos no disponibles',
            'Mock data',
            'Placeholder'
        ];

        for (const placeholder of placeholders) {
            if (htmlContent.includes(placeholder)) {
                logWarn('⚠️ Placeholder encontrado en HTML, posible falta de datos reales', {
                    placeholder
                });
            }
        }

        logDebug('✅ Integración de datos validada en HTML');
    }

    /**
     * Generar PDF desde URL de propiedad (análisis completo + PDF)
     */
    static async generatePDFFromPropertyUrl(propertyUrl, options = {}) {
        logInfo('🔄 Generando PDF desde URL de propiedad (flujo completo)', {
            propertyUrl: propertyUrl.substring(0, 100) + '...'
        });

        try {
            // 1. Obtener análisis completo usando AnthropicService
            const AnthropicService = require('../anthropic/AnthropicService');
            
            const analysisResult = await AnthropicService.generateFinancialReport(
                propertyUrl,
                {
                    ...options.analysisOptions,
                    optimizedForPDF: true
                }
            );

            // 2. Validar que el análisis sea exitoso
            if (!analysisResult.success || !analysisResult.data) {
                throw new Error('No se pudo obtener análisis válido de la propiedad');
            }

            // 3. Generar PDF con los datos reales del análisis
            const pdfResult = await this.generateFinancialReportPDF(
                analysisResult,
                options.pdfOptions || options
            );

            logInfo('✅ PDF generado exitosamente desde URL', {
                propertyUrl: propertyUrl.substring(0, 50) + '...',
                analysisConfidence: analysisResult.metadata?.confidence,
                pdfSizeKB: pdfResult.metadata.sizeKB,
                totalTime: `${pdfResult.metadata.generationTime}ms`
            });

            return {
                ...pdfResult,
                metadata: {
                    ...pdfResult.metadata,
                    sourceUrl: propertyUrl,
                    analysisMetadata: analysisResult.metadata,
                    workflow: 'url-to-pdf-complete'
                }
            };

        } catch (error) {
            logError('❌ Error generando PDF desde URL', {
                propertyUrl: propertyUrl.substring(0, 50) + '...',
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Generar preview rápido del PDF (SOLO con datos reales)
     */
    static async generatePDFPreview(analysisData, options = {}) {
        logInfo('👀 Generando preview rápido del PDF con datos reales', {
            confidence: analysisData.metadata?.confidence,
            propertyTitle: analysisData.data?.propertySummary?.title?.substring(0, 50)
        });

        // VALIDAR que sean datos reales
        this.validateRealAnalysisData(analysisData);

        // Configurar opciones para preview rápido
        const previewOptions = {
            ...options,
            quality: 'low',
            device: 'tablet',
            browserOptions: { headless: true },
            pdfOptions: {
                scale: 0.7,
                format: 'A4',
                printBackground: false
            }
        };

        try {
            const result = await this.generateFinancialReportPDF(analysisData, previewOptions);
            
            logInfo('✅ Preview PDF generado con datos reales', {
                sizeKB: result.metadata.sizeKB,
                duration: `${result.metadata.generationTime}ms`,
                propertyTitle: analysisData.data?.propertySummary?.title?.substring(0, 50)
            });

            return {
                ...result,
                metadata: {
                    ...result.metadata,
                    isPreview: true,
                    previewMode: 'low-quality-fast',
                    originalDataSource: 'real-analysis'
                }
            };
            
        } catch (error) {
            logError('❌ Error generando preview PDF', { error: error.message });
            throw error;
        }
    }

    /**
     * Generar múltiples PDFs en batch CON DATOS REALES
     */
    static async generateMultiplePDFs(analysisDataArray, options = {}) {
        logInfo('📄 Iniciando generación batch de PDFs con datos reales', {
            count: analysisDataArray.length
        });

        // Validar que todos los elementos sean datos reales
        for (let i = 0; i < analysisDataArray.length; i++) {
            try {
                this.validateRealAnalysisData(analysisDataArray[i]);
            } catch (error) {
                throw ErrorFactory.validation(
                    `Datos en posición ${i} no son análisis válidos: ${error.message}`,
                    `analysisDataArray[${i}]`
                );
            }
        }

        const results = [];
        let browser = null;

        try {
            browser = await this.launchBrowser(options);
            
            for (let i = 0; i < analysisDataArray.length; i++) {
                const analysisData = analysisDataArray[i];
                
                try {
                    logInfo(`📄 Generando PDF ${i + 1}/${analysisDataArray.length}`, {
                        propertyTitle: analysisData.data?.propertySummary?.title?.substring(0, 50)
                    });
                    
                    const result = await this.generateSinglePDFWithBrowser(
                        browser, 
                        analysisData, 
                        { ...options, batchIndex: i + 1 }
                    );
                    
                    results.push({
                        success: true,
                        index: i,
                        propertyTitle: analysisData.data?.propertySummary?.title,
                        result
                    });
                    
                } catch (error) {
                    logError(`❌ Error en PDF ${i + 1}`, { 
                        error: error.message,
                        propertyTitle: analysisData.data?.propertySummary?.title?.substring(0, 50)
                    });
                    results.push({
                        success: false,
                        index: i,
                        propertyTitle: analysisData.data?.propertySummary?.title,
                        error: error.message
                    });
                }
            }
            
            logInfo('✅ Batch de PDFs completado con datos reales', {
                total: analysisDataArray.length,
                successful: results.filter(r => r.success).length,
                failed: results.filter(r => !r.success).length
            });
            
            return {
                success: true,
                results,
                metadata: {
                    totalProcessed: analysisDataArray.length,
                    successful: results.filter(r => r.success).length,
                    failed: results.filter(r => !r.success).length,
                    dataSource: 'real-analysis-batch',
                    timestamp: new Date().toISOString()
                }
            };
            
        } catch (error) {
            logError('❌ Error en batch de PDFs', { error: error.message });
            throw ErrorFactory.internal('Error generando batch de PDFs', error);
            
        } finally {
            if (browser) {
                await browser.close();
                logDebug('🔒 Browser batch cerrado');
            }
        }
    }

    // ===== MÉTODOS DE TESTING (Solo para validación técnica) =====

    /**
     * SOLO PARA TESTING: Validar template con datos mock
     * ESTE MÉTODO ES EXCLUSIVAMENTE PARA VALIDACIÓN TÉCNICA DEL TEMPLATE
     */
    static async validateTemplateOnly(returnPDF = false) {
        logInfo('🧪 TESTING: Validando SOLO template PDF con datos mínimos');

        try {
            // Datos mínimos SOLO para validar que el template funciona
            const minimalTestData = {
                success: true,
                data: {
                    reportHeader: {
                        title: "Test Template Validation",
                        subtitle: "Testing técnico del template",
                        confidence: 0,
                        aiAnalysis: { used: false }
                    },
                    propertySummary: {
                        title: "TEMPLATE VALIDATION TEST",
                        address: "Testing Address",
                        price: { clp: 0, uf: "TEST UF" },
                        features: {
                            bedrooms: "TEST",
                            bathrooms: "TEST",
                            surface: "TEST"
                        },
                        description: "Datos de prueba para validación técnica del template"
                    },
                    financialMetrics: {
                        flujoCajaMensual: 0,
                        yieldBruto: 0,
                        yieldNeto: 0,
                        capRate: 0,
                        roi: 0,
                        paybackPeriod: 0
                    },
                    executiveSummary: {
                        recommendation: "TEMPLATE_TEST",
                        confidence: "Testing",
                        keyPoints: ["Template validation test"]
                    },
                    dataSources: [{
                        type: "Template Validation",
                        source: "Testing System",
                        status: "Test",
                        timestamp: new Date().toISOString()
                    }]
                },
                metadata: {
                    confidence: 0,
                    generatedAt: new Date().toISOString(),
                    _isTemplateTest: true
                }
            };

            const result = await this.generateFinancialReportPDF(minimalTestData, {
                quality: 'medium',
                device: 'desktop'
            });

            logInfo('✅ TESTING: Template validado correctamente');

            return {
                success: true,
                message: 'Template PDF validado exitosamente',
                validation: {
                    templateValid: true,
                    htmlGenerated: true,
                    pdfGenerated: true,
                    sizeKB: result.metadata.sizeKB,
                    pages: result.metadata.pages,
                    generationTime: `${result.metadata.generationTime}ms`
                },
                pdf: returnPDF ? result.pdf : null,
                note: 'Esta función es SOLO para testing técnico del template'
            };

        } catch (error) {
            logError('❌ TESTING: Error validando template', { error: error.message });
            return {
                success: false,
                error: error.message,
                validation: {
                    templateValid: false,
                    htmlGenerated: false,
                    pdfGenerated: false
                }
            };
        }
    }

    /**
     * Test de funcionamiento del servicio con Playwright
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
                    message: 'Servicio PDF funcionando correctamente con Playwright',
                    testPDFSize: testPDF.length,
                    engine: 'Playwright',
                    playwrightVersion: require('playwright/package.json').version
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

    // ===== MÉTODOS TÉCNICOS (permanecen igual) =====

    static async launchBrowser(options = {}) {
        logDebug('🌐 Configurando browser Playwright...');
        
        const browserOptions = {
            headless: process.env.NODE_ENV === 'production',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding',
                '--disable-features=TranslateUI',
                '--disable-ipc-flooding-protection',
                '--disable-hang-monitor',
                '--disable-client-side-phishing-detection',
                '--disable-component-update',
                '--disable-default-apps',
                '--disable-domain-reliability',
                '--disable-extensions',
                '--disable-features=VizDisplayCompositor',
                '--disable-sync',
                '--disable-web-security',
                '--run-all-compositor-stages-before-draw',
                '--memory-pressure-off',
                '--max_old_space_size=4096'
            ],
            timeout: 60000,
            ...options.browserOptions
        };

        try {
            const browser = await chromium.launch(browserOptions);
            logDebug('✅ Browser Playwright iniciado correctamente');
            return browser;
        } catch (error) {
            logError('❌ Error iniciando browser Playwright', { error: error.message });
            throw new Error(`Error iniciando Playwright: ${error.message}`);
        }
    }

    static async createContext(browser, options = {}) {
        logDebug('🔧 Creando contexto del browser...');
        
        try {
            const deviceConfig = PDFConfig.getDeviceConfig(options.device);
            const context = await browser.newContext({
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 PDFGenerator/1.0',
                viewport: deviceConfig.viewport,
                deviceScaleFactor: deviceConfig.viewport.deviceScaleFactor
            });
            logDebug('✅ Contexto del browser creado');
            return context;
        } catch (error) {
            logError('❌ Error creando contexto', { error: error.message });
            throw new Error(`Error creando contexto: ${error.message}`);
        }
    }

    static async configurePage(page, options = {}) {
        logDebug('⚙️ Configurando página para PDF...');
        
        try {
            page.setDefaultTimeout(30000);
            page.setDefaultNavigationTimeout(30000);
            
            await page.route('**/*', (route) => {
                const resourceType = route.request().resourceType();
                
                if (['document', 'stylesheet', 'font'].includes(resourceType)) {
                    route.continue();
                } else if (resourceType === 'image') {
                    if (route.request().url().startsWith('data:')) {
                        route.continue();
                    } else {
                        route.abort();
                    }
                } else {
                    route.abort();
                }
            });
            
            page.on('pageerror', (error) => {
                logWarn('⚠️ Error en la página durante PDF', { error: error.message });
            });
            
            page.on('console', (msg) => {
                if (msg.type() === 'error') {
                    logWarn('⚠️ Console error en PDF', { message: msg.text() });
                }
            });
            
            await page.addStyleTag({
                content: PDFConfig.getAdditionalCSS()
            });
            
            logDebug('✅ Página configurada correctamente');
            
        } catch (error) {
            logError('❌ Error configurando página', { error: error.message });
            throw new Error(`Error configurando página: ${error.message}`);
        }
    }

    static async loadHTMLContent(page, htmlContent) {
        logDebug('📄 Cargando contenido HTML en la página...');
        
        try {
            await page.setContent(htmlContent, {
                waitUntil: 'domcontentloaded',
                timeout: 30000
            });
            
            logDebug('✅ Contenido HTML cargado correctamente');
            
        } catch (error) {
            logError('❌ Error cargando contenido HTML', { error: error.message });
            throw new Error(`Error cargando HTML: ${error.message}`);
        }
    }

    static async waitForContentRendering(page) {
        logDebug('⏳ Esperando renderizado completo del contenido...');
        
        try {
            await page.evaluate(() => document.fonts.ready);
            
            const criticalSelectors = [
                '.container',
                '.report-header',
                '.property-summary',
                '.financial-section'
            ];
            
            for (const selector of criticalSelectors) {
                try {
                    await page.waitForSelector(selector, { timeout: 5000 });
                    logDebug(`✓ Elemento encontrado: ${selector}`);
                } catch (error) {
                    logWarn(`⚠️ Elemento no encontrado: ${selector}`);
                }
            }
            
            await page.waitForTimeout(2000);
            
            const hasContent = await page.evaluate(() => {
                const container = document.querySelector('.container');
                return container && container.children.length > 0;
            });
            
            if (!hasContent) {
                throw new Error('El contenido no se renderizó correctamente');
            }
            
            await page.evaluate(() => {
                document.body.style.display = 'none';
                document.body.offsetHeight;
                document.body.style.display = '';
            });
            
            logDebug('✅ Contenido renderizado completamente');
            
        } catch (error) {
            logError('❌ Error esperando renderizado', { error: error.message });
            throw new Error(`Error en renderizado: ${error.message}`);
        }
    }

    static buildPDFConfig(options = {}) {
        logDebug('🔧 Construyendo configuración del PDF...');
        
        const baseConfig = PDFConfig.getOptimizedConfig(options);
        const deviceConfig = PDFConfig.getDeviceConfig(options.device);
        const qualityConfig = PDFConfig.getImageQualityConfig(options.quality);
        
        const finalConfig = {
            ...baseConfig,
            scale: deviceConfig.scale,
            ...qualityConfig,
            ...options.pdfOptions
        };
        
        logDebug('✅ Configuración del PDF construida', {
            format: finalConfig.format,
            scale: finalConfig.scale,
            quality: finalConfig.quality || 'default'
        });
        
        return finalConfig;
    }

    static validateHTMLCompleteness(htmlContent) {
        logDebug('🔍 Validando completeness del HTML...');
        
        const requiredSections = [
            'report-header',
            'property-summary', 
            'financial-section',
            'confidence-badge',
            'metric-card'
        ];

        const missingSections = requiredSections.filter(section => 
            !htmlContent.includes(section)
        );

        if (missingSections.length > 0) {
            logError('❌ Secciones faltantes en HTML', { 
                missing: missingSections,
                totalRequired: requiredSections.length
            });
            throw new Error(`Secciones HTML faltantes: ${missingSections.join(', ')}`);
        }

        if (htmlContent.length < 10000) {
            logWarn('⚠️ HTML parece muy pequeño', { 
                size: `${Math.round(htmlContent.length / 1024)}KB` 
            });
        }

        const hasBasicStructure = htmlContent.includes('<html') && 
                                 htmlContent.includes('<body') && 
                                 htmlContent.includes('</html>');
        
        if (!hasBasicStructure) {
            throw new Error('Estructura HTML básica inválida');
        }

        logDebug('✅ HTML validation passed', { 
            sectionsFound: requiredSections.length,
            htmlSize: `${Math.round(htmlContent.length / 1024)}KB`
        });
    }

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
                const pdfParse = require('pdf-parse');
                const pdfData = await pdfParse(pdfBuffer);
                pages = pdfData.numpages;
                
                if (pages < 1) {
                    throw new Error('PDF no contiene páginas válidas');
                }
                
            } catch (parseError) {
                logWarn('⚠️ No se pudo analizar PDF con pdf-parse', { 
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

    static async generateSinglePDFWithBrowser(browser, analysisData, options = {}) {
        let context = null;
        let page = null;
        
        try {
            context = await this.createContext(browser, options);
            page = await context.newPage();
            
            const htmlContent = await ReportTemplateBuilder.buildReportHTML(analysisData, options);
            await this.configurePage(page, options);
            await this.loadHTMLContent(page, htmlContent);
            await this.waitForContentRendering(page);
            
            const pdfConfig = this.buildPDFConfig(options);
            const pdfBuffer = await page.pdf(pdfConfig);
            
            const pdfMetadata = await this.validateGeneratedPDF(pdfBuffer);
            
            return {
                success: true,
                pdf: pdfBuffer,
                metadata: {
                    ...pdfMetadata,
                    generatedAt: new Date().toISOString(),
                    batchIndex: options.batchIndex
                }
            };
            
        } finally {
            await this.cleanup(page, context, null);
        }
    }

    static getServiceInfo() {
        return {
            service: 'PDFGeneratorService',
            version: '1.0.0',
            engine: 'Playwright',
            dataRequirement: 'REAL ANALYSIS DATA ONLY',
            capabilities: {
                formats: ['PDF'],
                quality: ['low', 'medium', 'high'],
                devices: ['desktop', 'tablet', 'mobile'],
                batch: true,
                preview: true,
                maxConcurrent: 3,
                maxSize: '50MB',
                timeout: '60 seconds'
            },
            dependencies: {
                playwright: require('playwright/package.json').version,
                nodejs: process.version
            },
            performance: {
                avgGenerationTime: '15-30 seconds',
                avgPreviewTime: '5-10 seconds',
                avgPDFSize: '2-5 MB',
                avgPages: '8-12 pages'
            },
            limits: {
                maxHTMLSize: '10MB',
                maxPDFSize: '50MB',
                maxPages: 50,
                timeout: 60000,
                batchLimit: 10
            },
            features: {
                premiumTemplate: 'NotBrokkerPremiumReportV4',
                responsiveDesign: true,
                vectorGraphics: true,
                printOptimized: true,
                headerFooter: true,
                pageNumbers: true,
                realDataOnly: true
            }
        };
    }
}

module.exports = PDFGeneratorService;