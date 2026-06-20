const express = require('express');
const router = express.Router();
const { getShippingQuote } = require('../controllers/shippingController');

// Pública: la usa la página de producto para cotizar envío por código postal
router.get('/', getShippingQuote);

module.exports = router;
