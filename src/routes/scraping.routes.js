// src/routes/scraping.routes.js
const express = require('express');
const ScrapingController = require('../controllers/ScrapingController');
const { cacheForScraping } = require('../middleware/cacheMiddleware');

const router = express.Router();

// Rutas principales de scraping con cache
router.post('/property', cacheForScraping(), ScrapingController.scrapeProperty);
router.get('/property', cacheForScraping(), ScrapingController.scrapePropertyGet);

// Rutas auxiliares
router.get('/info', ScrapingController.getInfo);
router.post('/validate', ScrapingController.validateUrl);
router.get('/validate', ScrapingController.validateUrl);

// Mantener compatibilidad con endpoint original con cache
router.post('/', cacheForScraping(), ScrapingController.scrapeProperty);

module.exports = router;