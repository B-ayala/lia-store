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

// Toda la analítica del asistente es solo-admin: requiere token verificado por
// Supabase (authMiddleware) y rol admin leído de profiles (adminMiddleware).
router.use(authMiddleware, adminMiddleware);

router.get('/low-stock', getLowStock);
router.get('/sales-today', getSalesToday);
router.get('/pending-payment', getPendingPayment);
router.get('/pending-pickups', getPendingPickups);
router.get('/top-products', getTopProducts);
router.get('/sales-growth', getSalesGrowth);
router.get('/pickups-to-confirm', getPickupsToConfirm);

module.exports = router;
