const express = require('express');
const router = express.Router();
const { createOrder, getOrders, updateOrderStatus, createMpPreference, mpWebhook } = require('../controllers/ordersController');
const { authMiddleware, adminMiddleware } = require('../middleware/authMiddleware');

// Público: crear preferencia de MP e insertar venta
router.post('/mp-preference', createMpPreference);

// Público: webhook de notificaciones de MP (debe responder rápido)
router.post('/mp-webhook', mpWebhook);

// Público: crear orden (flow de transferencia, mantiene compatibilidad)
router.post('/', createOrder);

// Solo admin
router.get('/', authMiddleware, adminMiddleware, getOrders);
router.patch('/:id/status', authMiddleware, adminMiddleware, updateOrderStatus);

module.exports = router;
