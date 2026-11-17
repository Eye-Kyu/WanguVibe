const express = require('express');
const router = express.Router();
const { publicLookupLimiter } = require('../middleware/rateLimiters');
const publicLookupController = require('../controllers/publicLookupController');

// Deliberately no `protect` anywhere in this router — a self-service
// customer balance checker has no logged-in user to protect() with. Every
// handler here must only ever return the minimal safe fields (see the
// controller for what's deliberately excluded).
router.post('/store-credit/request-code', publicLookupLimiter, publicLookupController.requestStoreCreditCode);
router.post('/store-credit/verify', publicLookupLimiter, publicLookupController.verifyStoreCreditCode);
router.get('/gift-card', publicLookupLimiter, publicLookupController.getGiftCardBalance);

module.exports = router;
