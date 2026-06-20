const express = require('express');
const router = express.Router();
const { generateSignature, deleteImage, getImages, getUsage, getConfig, getFolders, createFolder, deleteFolder } = require('../controllers/cloudinaryController');
const { authMiddleware, adminMiddleware } = require('../middleware/authMiddleware');

// Pública: solo expone datos no sensibles (cloudName + apiKey) que el widget de
// upload necesita en el cliente. El api_secret nunca se expone.
router.get('/config', getConfig);

// Protegidas (admin): lectura de cuenta y mutaciones sobre imágenes/carpetas.
router.get('/images', authMiddleware, adminMiddleware, getImages);
router.get('/usage', authMiddleware, adminMiddleware, getUsage);
router.get('/folders', authMiddleware, adminMiddleware, getFolders);
router.post('/folders', authMiddleware, adminMiddleware, createFolder);
router.delete('/folders', authMiddleware, adminMiddleware, deleteFolder);
router.post('/sign', authMiddleware, adminMiddleware, generateSignature);
router.post('/delete', authMiddleware, adminMiddleware, deleteImage);

module.exports = router;
