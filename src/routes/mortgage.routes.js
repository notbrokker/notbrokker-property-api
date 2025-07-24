// src/routes/mortgage.routes.js
const express = require('express');
const MortgageController = require('../controllers/MortgageController');
const { asyncErrorHandler } = require('../middleware/errorHandler');
const { cacheForMortgage } = require('../middleware/cacheMiddleware');

const router = express.Router();

// Rutas principales de simulación con cache
router.post('/simulate', cacheForMortgage(), asyncErrorHandler(MortgageController.simulateMortgage));
router.get('/simulate', cacheForMortgage(), asyncErrorHandler(MortgageController.simulateMortgageGet));

// Rutas auxiliares con cache
router.post('/compare', cacheForMortgage(), asyncErrorHandler(MortgageController.compareScenarios));
router.get('/info', asyncErrorHandler(MortgageController.getInfo));

module.exports = router;