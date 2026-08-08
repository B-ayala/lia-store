const express = require('express');
const router = express.Router();
const { getShippingQuote } = require('../controllers/shippingController');
const { createRateLimit } = require('../middleware/rateLimit');
const { publicCache } = require('../middleware/httpCache');

// La tarifa es una constante del negocio: se puede cachear varios minutos en el
// cliente. No toca la base, así que sólo necesita una cota antiabuso.
const quoteLimit = createRateLimit({ name: 'shipping', windowMs: 60 * 1000, max: 120 });

// Pública: la usa la página de producto para cotizar envío por código postal
router.get('/', quoteLimit, publicCache(300), getShippingQuote);

module.exports = router;
