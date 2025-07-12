// src/routes/search.routes.js
const express = require('express');
const SearchController = require('../controllers/SearchController');

const router = express.Router();

// Rutas principales de búsqueda
router.post('/properties', SearchController.searchProperties);
router.get('/properties', SearchController.searchPropertiesGet);

// Rutas auxiliares
router.get('/info', SearchController.getInfo);

module.exports = router;