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

router.get('/signup-status/:email', signupStatus);
router.post('/signup-ratelimit', signupRateLimit);

router.post('/login', loginUser);

router.get('/auth/:userId', getUserByAuthId);

router.route('/')
  .get(getUsers)
  .post(createUser);

router.route('/:id')
  .get(getUserById)
  .put(updateUser)
  .delete(deleteUser);

module.exports = router;
