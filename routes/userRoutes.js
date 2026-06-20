const express = require('express');
const router = express.Router();
const {
  loginUser,
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  getUserByAuthId,
  signupStatus,
  signupRateLimit
} = require('../controllers/userController');
const { authMiddleware, adminMiddleware } = require('../middleware/authMiddleware');

// ─── Públicas (flujo de signup/login, pre-auth) ───
router.post('/login', loginUser);
router.get('/signup-status/:email', signupStatus);
router.post('/signup-ratelimit', signupRateLimit);

// ─── Protegidas (admin) ───
router.get('/auth/:userId', authMiddleware, adminMiddleware, getUserByAuthId);

router.route('/')
  .get(authMiddleware, adminMiddleware, getUsers)
  .post(authMiddleware, adminMiddleware, createUser);

router.route('/:id')
  .get(authMiddleware, adminMiddleware, getUserById)
  .put(authMiddleware, adminMiddleware, updateUser)
  .delete(authMiddleware, adminMiddleware, deleteUser);

module.exports = router;
