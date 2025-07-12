// src/routes/mortgage.routes.js
const express = require('express');
const MortgageController = require('../controllers/MortgageController');
const { asyncErrorHandler } = require('../middleware/errorHandler');

const router = express.Router();

// Rutas principales de simulación
router.post('/simulate', asyncErrorHandler(MortgageController.simulateMortgage));
router.get('/simulate', asyncErrorHandler(MortgageController.simulateMortgageGet));

// Rutas auxiliares
router.post('/compare', asyncErrorHandler(MortgageController.compareScenarios));
router.get('/info', asyncErrorHandler(MortgageController.getInfo));

module.exports = router;