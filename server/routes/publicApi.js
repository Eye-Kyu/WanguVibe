const express = require('express');
const path = require('path');
const router = express.Router();
const apiKeyAuth = require('../middleware/apiKeyAuth');
const publicApiController = require('../controllers/publicApiController');

// Documentation, not data — no API key needed to read the spec itself.
router.get('/openapi.yaml', (req, res) => {
  res.sendFile(path.join(__dirname, '../docs/openapi.yaml'));
});

// Every other route here is authenticated via X-API-Key (apiKeyAuth), never
// the staff JWT — this is the third-party integration surface, not the
// internal admin/POS API mounted under /api/*.
router.get('/sales', apiKeyAuth, publicApiController.getSales);
router.get('/styles', apiKeyAuth, publicApiController.getStyles);
router.get('/variants', apiKeyAuth, publicApiController.getVariants);

module.exports = router;
