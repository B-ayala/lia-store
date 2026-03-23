const express = require('express');
const router = express.Router();
const { validateAddress } = require('../controllers/shippingController');

// GET /api/shipping/validate?street=CORRIENTES&number=1234
router.get('/validate', validateAddress);

module.exports = router;
