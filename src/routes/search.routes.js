// src/routes/search.routes.js
const express = require('express');
const SearchController = require('../controllers/SearchController');
const { cacheForSearch } = require('../middleware/cacheMiddleware');

const router = express.Router();

// Rutas principales de búsqueda con cache
router.post('/properties', cacheForSearch(), SearchController.searchProperties);
router.get('/properties', cacheForSearch(), SearchController.searchPropertiesGet);

// Rutas auxiliares
router.get('/info', SearchController.getInfo);

module.exports = router;