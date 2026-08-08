const express = require('express');
const router = express.Router();
const {
  getLowStock,
  getSalesToday,
  getPendingPayment,
  getPendingPickups,
  getTopProducts,
  getSalesGrowth,
  getPickupsToConfirm,
} = require('../controllers/insightsController');
const { authMiddleware, adminMiddleware } = require('../middleware/authMiddleware');
const { createRateLimit } = require('../middleware/rateLimit');
const { noStore } = require('../middleware/httpCache');

// Son agregaciones pesadas sobre `ventas`: el límite evita que un panel abierto
// con auto-refresh (o un click compulsivo) las dispare en bucle. El resultado
// además se sirve de caché en memoria por 60 s (ver insightsController).
const insightsLimit = createRateLimit({ name: 'insights', windowMs: 60 * 1000, max: 60 });

// Toda la analítica del asistente es solo-admin: requiere token verificado por
// Supabase (authMiddleware) y rol admin leído de profiles (adminMiddleware).
router.use(noStore, insightsLimit, authMiddleware, adminMiddleware);

router.get('/low-stock', getLowStock);
router.get('/sales-today', getSalesToday);
router.get('/pending-payment', getPendingPayment);
router.get('/pending-pickups', getPendingPickups);
router.get('/top-products', getTopProducts);
router.get('/sales-growth', getSalesGrowth);
router.get('/pickups-to-confirm', getPickupsToConfirm);

module.exports = router;
