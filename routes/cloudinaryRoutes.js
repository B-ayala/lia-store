const express = require('express');
const router = express.Router();
const { generateSignature, deleteImage, getImages, getConfig, getFolders, createFolder, deleteFolder } = require('../controllers/cloudinaryController');

router.get('/config', getConfig);
router.get('/images', getImages);
router.get('/folders', getFolders);
router.post('/folders', createFolder);
router.delete('/folders', deleteFolder);
router.post('/sign', generateSignature);
router.post('/delete', deleteImage);

module.exports = router;
