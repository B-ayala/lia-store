const express = require('express');
const router = express.Router();
const {
  createMpPreference,
  createTransferOrder,
  getUserOrders,
  confirmMpPayment,
  mpWebhook,
  cancelOrder,
  confirmTransfer,
  cancelTransfer,
  recordNudge,
} = require('../controllers/orderController');
const { authMiddleware, adminMiddleware } = require('../middleware/authMiddleware');

// ─── Pública (server a server, la llama Mercado Pago) ───
router.post('/mp-webhook', mpWebhook);

// ─── Usuario autenticado ───
router.post('/transfer', authMiddleware, createTransferOrder);
router.post('/mp-preference', authMiddleware, createMpPreference);
router.post('/mp-confirm', authMiddleware, confirmMpPayment);
router.get('/user', authMiddleware, getUserOrders);
router.post('/nudge', authMiddleware, recordNudge);
router.post('/:id/cancel', authMiddleware, cancelOrder);

// ─── Solo admin ───
router.patch('/:id/confirm-transfer', authMiddleware, adminMiddleware, confirmTransfer);
router.patch('/:id/cancel-transfer', authMiddleware, adminMiddleware, cancelTransfer);

module.exports = router;
