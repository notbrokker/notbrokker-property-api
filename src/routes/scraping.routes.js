// src/routes/scraping.routes.js
const express = require('express');
const ScrapingController = require('../controllers/ScrapingController');

const router = express.Router();

// Rutas principales de scraping
router.post('/property', ScrapingController.scrapeProperty);
router.get('/property', ScrapingController.scrapePropertyGet);

// Rutas auxiliares
router.get('/info', ScrapingController.getInfo);
router.post('/validate', ScrapingController.validateUrl);
router.get('/validate', ScrapingController.validateUrl);

// Mantener compatibilidad con endpoint original
router.post('/', ScrapingController.scrapeProperty);

module.exports = router;