// src/services/scraping/ScrapingService.js
const { chromium } = require('playwright');
const { logInfo, logError, logDebug } = require('../../utils/logger');
const { ErrorFactory } = require('../../utils/errors');

/**
 * Servicio principal de scraping de propiedades
 */
class ScrapingService {
    
    /**
     * Realizar scraping de una propiedad
     */
    static async scrapeProperty(url) {
        logInfo('🚀 Iniciando scraping de propiedad', { url });
        
        const portalType = this.detectPortal(url);
        logDebug('Portal detectado', { portal: portalType, url });
        
        const browser = await this.launchBrowser();
        let context, page;
        
        try {
            context = await this.createContext(browser);
            page = await context.newPage();
            
            // Navegar a la URL
            logDebug('Navegando a URL', { url });
            await page.goto(url, { 
                timeout: 30000,
                waitUntil: 'domcontentloaded'
            });
            
            // Esperar carga robusta
            await this.esperarCargaRobusta(page);
            
            // Extraer datos según el portal
            const extractor = this.getExtractor(portalType);
            const resultado = await extractor.extract(page, url);
            
            logInfo('✅ Scraping completado exitosamente', { 
                url, 
                portal: portalType,
                titulo: resultado.titulo?.substring(0, 50) 
            });
            
            return {
                success: true,
                data: resultado,
                portal: portalType,
                timestamp: new Date().toISOString()
            };
            
        } catch (error) {
            logError('❌ Error durante scraping', { 
                url, 
                portal: portalType,
                error: error.message 
            });
            
            throw ErrorFactory.scrapingFailed(url, error);
            
        } finally {
            try {
                if (context) await context.close();
                await browser.close();
                logDebug('🔒 Browser cerrado correctamente');
            } catch (closeError) {
                logError('Error cerrando browser', { error: closeError.message });
            }
        }
    }
    
    /**
     * Detectar tipo de portal
     */
    static detectPortal(url) {
        logDebug('Detectando tipo de portal', { url });
        
        if (url.includes('portalinmobiliario.com')) {
            return 'portal_inmobiliario';
        } else if (url.includes('mercadolibre.cl') || url.includes('casa.mercadolibre.cl')) {
            return 'mercadolibre';
        } else if (url.includes('yapo.cl')) {
            return 'yapo';
        } else if (url.includes('toctoc.com')) {
            return 'toctoc';
        }
        
        logDebug('Portal no reconocido, usando extractor genérico');
        return 'desconocido';
    }
    
    /**
     * Lanzar browser con configuración optimizada
     */
    static async launchBrowser() {
        logDebug('Lanzando browser Playwright');
        
        return await chromium.launch({ 
            headless: true,
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
    
    /**
     * Espera robusta para carga de página
     */
    static async esperarCargaRobusta(page, timeout = 30000) {
        try {
            logDebug('Iniciando espera robusta de carga');
            
            // 1. Esperar que el DOM se cargue
            await page.waitForLoadState('domcontentloaded', { timeout: 10000 });
            logDebug('✓ DOM cargado');
            
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
                    await page.waitForSelector(selector, { timeout: 5000 });
                    logDebug(`✓ Elemento crítico encontrado: ${selector}`);
                    elementoEncontrado = true;
                    break;
                } catch (error) {
                    logDebug(`Elemento no encontrado: ${selector}`);
                }
            }
            
            if (!elementoEncontrado) {
                logDebug('No se encontraron elementos críticos, continuando...');
            }
            
            // 3. Espera adicional para contenido dinámico
            await page.waitForTimeout(3000);
            
            logDebug('✅ Carga robusta completada');
            return true;
            
        } catch (error) {
            logError('Error en espera robusta', { error: error.message });
            return false;
        }
    }
    
    /**
     * Obtener extractor apropiado según el portal
     */
    static getExtractor(portalType) {
        // TODO: Importar extractores reales cuando estén listos
        // const MercadoLibreExtractor = require('./extractors/MercadoLibreExtractor');
        // const PortalInmobiliarioExtractor = require('./extractors/PortalInmobiliarioExtractor');
        // const GenericExtractor = require('./extractors/GenericExtractor');
        
        const extractors = {
            'mercadolibre': this.getMockExtractor('MercadoLibre'),
            'portal_inmobiliario': this.getMockExtractor('Portal Inmobiliario'),
            'yapo': this.getMockExtractor('Yapo'),
            'toctoc': this.getMockExtractor('TocToc'),
            'default': this.getMockExtractor('Genérico')
        };
        
        return extractors[portalType] || extractors.default;
    }
    
    /**
     * Extractor mock temporal (hasta implementar los reales)
     */
    static getMockExtractor(portalName) {
        return {
            extract: async (page, url) => {
                logDebug(`Ejecutando extractor mock para ${portalName}`);
                
                // Extraer título real si existe
                let titulo = 'No disponible';
                try {
                    const tituloElement = await page.locator('h1').first();
                    if (await tituloElement.count() > 0) {
                        titulo = await tituloElement.textContent() || 'No disponible';
                        titulo = titulo.trim();
                    }
                } catch (error) {
                    logDebug('No se pudo extraer título real');
                }
                
                // Datos mock con alguna información real
                return {
                    titulo: titulo !== 'No disponible' ? titulo : `Propiedad extraída de ${portalName}`,
                    precio: '$150.000.000',
                    moneda: '$',
                    ubicacion: 'Ubicación detectada automáticamente',
                    dormitorios: '3',
                    banos: '2', 
                    superficie: '120 m²',
                    link: url,
                    imagen: 'No disponible',
                    portal: portalName,
                    extraccion: 'Mock - Pendiente implementar extractores reales',
                    titulo_real_extraido: titulo !== 'No disponible'
                };
            }
        };
    }
}

module.exports = ScrapingService;