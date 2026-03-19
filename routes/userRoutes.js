const express = require('express');
const router = express.Router();
const {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  loginUser,
  getUserByAuthId,
  signupStatus,
  signupRateLimit
} = require('../controllers/userController');

// Signup rate limit tracker
router.get('/signup-status/:email', signupStatus);
router.post('/signup-ratelimit', signupRateLimit);

// Ruta de login
router.post('/login', loginUser);

// Ruta para obtener usuario por Supabase Auth ID
router.get('/auth/:userId', getUserByAuthId);

// Rutas CRUD principales
router.route('/')
  .get(getUsers)
  .post(createUser);

router.route('/:id')
  .get(getUserById)
  .put(updateUser)
  .delete(deleteUser);

module.exports = router;
