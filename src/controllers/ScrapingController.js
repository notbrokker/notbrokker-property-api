// src/controllers/ScrapingController.js
const { logInfo, logError } = require('../utils/logger');
const { ErrorFactory } = require('../utils/errors');
const { asyncErrorHandler } = require('../middleware/errorHandler');
const ScrapingService = require('../services/scraping/ScrapingService'); // NUEVO

/**
 * Controlador para operaciones de scraping de propiedades
 */
class ScrapingController {
    
    /**
     * Scraping de propiedad individual - POST
     */
    static scrapeProperty = asyncErrorHandler(async (req, res) => {
        const { url } = req.body;
        
        logInfo('Nueva solicitud de scraping POST', { 
            url, 
            ip: req.ip,
            userAgent: req.get('User-Agent')?.substring(0, 50) 
        });

        // Validación básica
        if (!url) {
            throw ErrorFactory.validation('URL es requerida', 'url');
        }

        // Validar formato de URL
        try {
            new URL(url);
        } catch (error) {
            throw ErrorFactory.invalidUrl(url);
        }

        // TODO: Aquí irá la llamada al ScrapingService
        const resultado = await ScrapingService.scrapeProperty(url);
        

        logInfo('Scraping completado (mock)', { 
            url, 
            success: true 
        });

        res.json(resultado);
    });

    /**
     * Scraping de propiedad individual - GET (query parameters)
     */
    static scrapePropertyGet = asyncErrorHandler(async (req, res) => {
        const { url } = req.query;
        
        logInfo('Nueva solicitud de scraping GET', { 
            url, 
            ip: req.ip,
            userAgent: req.get('User-Agent')?.substring(0, 50) 
        });

        // Validación básica
        if (!url) {
            throw ErrorFactory.validation('URL es requerida como query parameter', 'url');
        }

        // Validar formato de URL
        try {
            new URL(url);
        } catch (error) {
            throw ErrorFactory.invalidUrl(url);
        }

        // Reutilizar la lógica del POST
        // Simular que viene del body para reutilizar el método
        req.body = { url };
        return ScrapingController.scrapeProperty(req, res);
    });

    /**
     * Obtener información sobre el servicio de scraping
     */
    static getInfo = asyncErrorHandler(async (req, res) => {
        logInfo('Solicitud de información de scraping');

        const info = {
            success: true,
            servicio: 'Scraping de Propiedades',
            version: '2.0.0-modular',
            estado: 'En desarrollo',
            portales_soportados: [
                'MercadoLibre (pendiente)',
                'Portal Inmobiliario (pendiente)',
                'Genérico (pendiente)'
            ],
            endpoints: {
                'POST /api/scraping/property': 'Scraping con URL en body',
                'GET /api/scraping/property': 'Scraping con URL en query',
                'GET /api/scraping/info': 'Información del servicio'
            },
            uso: {
                post: {
                    method: 'POST',
                    url: '/api/scraping/property',
                    body: { url: 'https://ejemplo.com/propiedad/123' },
                    headers: { 'Content-Type': 'application/json' }
                },
                get: {
                    method: 'GET',
                    url: '/api/scraping/property?url=https://ejemplo.com/propiedad/123'
                }
            },
            timestamp: new Date().toISOString()
        };

        res.json(info);
    });

    /**
     * Validar URL de scraping sin ejecutar
     */
    static validateUrl = asyncErrorHandler(async (req, res) => {
        const { url } = req.method === 'GET' ? req.query : req.body;
        
        logInfo('Validación de URL de scraping', { url });

        if (!url) {
            throw ErrorFactory.validation('URL es requerida', 'url');
        }

        let urlValida = false;
        let portal = 'desconocido';
        let motivo = '';

        try {
            const urlObj = new URL(url);
            urlValida = true;

            // Detectar tipo de portal (lógica básica)
            if (url.includes('mercadolibre.cl') || url.includes('casa.mercadolibre.cl')) {
                portal = 'mercadolibre';
            } else if (url.includes('portalinmobiliario.com')) {
                portal = 'portal_inmobiliario';
            } else if (url.includes('yapo.cl')) {
                portal = 'yapo';
            } else if (url.includes('toctoc.com')) {
                portal = 'toctoc';
            } else {
                portal = 'generico';
            }

        } catch (error) {
            urlValida = false;
            motivo = 'Formato de URL inválido';
        }

        const resultado = {
            success: true,
            url,
            url_valida: urlValida,
            portal_detectado: portal,
            portal_soportado: ['mercadolibre', 'portal_inmobiliario'].includes(portal),
            ...(motivo && { motivo }),
            timestamp: new Date().toISOString()
        };

        logInfo('Validación de URL completada', { 
            url, 
            valida: urlValida, 
            portal 
        });

        res.json(resultado);
    });
}

module.exports = ScrapingController;