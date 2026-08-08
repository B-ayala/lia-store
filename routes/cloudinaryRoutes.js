const express = require('express');
const router = express.Router();
const { generateSignature, deleteImage, getImages, getUsage, getConfig, getFolders, createFolder, deleteFolder } = require('../controllers/cloudinaryController');
const { authMiddleware, adminMiddleware } = require('../middleware/authMiddleware');
const { createRateLimit } = require('../middleware/rateLimit');
const { publicCache, noStore } = require('../middleware/httpCache');

// Cada request de admin acá se traduce en una llamada a la API de Cloudinary,
// que tiene su propia cuota mensual: el límite protege ese recurso externo.
const cloudinaryLimit = createRateLimit({ name: 'cloudinary', windowMs: 60 * 1000, max: 60 });

// Pública: solo expone datos no sensibles (cloudName + apiKey) que el widget de
// upload necesita en el cliente. El api_secret nunca se expone.
// Es configuración estática: cachearla evita un request por apertura del widget.
router.get('/config', publicCache(300), getConfig);

router.use(noStore, cloudinaryLimit);

// Protegidas (admin): lectura de cuenta y mutaciones sobre imágenes/carpetas.
router.get('/images', authMiddleware, adminMiddleware, getImages);
router.get('/usage', authMiddleware, adminMiddleware, getUsage);
router.get('/folders', authMiddleware, adminMiddleware, getFolders);
router.post('/folders', authMiddleware, adminMiddleware, createFolder);
router.delete('/folders', authMiddleware, adminMiddleware, deleteFolder);
router.post('/sign', authMiddleware, adminMiddleware, generateSignature);
router.post('/delete', authMiddleware, adminMiddleware, deleteImage);

module.exports = router;
