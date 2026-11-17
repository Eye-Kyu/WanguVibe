const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const checkRole = require('../middleware/roleMiddleware');
const styleController = require('../controllers/styleController');
const variantController = require('../controllers/variantController');
const parser = require('../middleware/cloudinaryParser');

// Styles (each returned with its variants embedded — see styleController)
router.get('/', protect, styleController.getAllStyles);
router.post('/', protect, checkRole('admin'), parser.single('image'), styleController.createStyle);
router.get('/:id', protect, styleController.getStyleById);
router.put('/:id', protect, checkRole('admin'), parser.single('image'), styleController.updateStyle);
router.delete('/:id', protect, checkRole('admin'), styleController.deleteStyle);

// Variants nested under a style
router.get('/:styleId/variants', protect, variantController.getVariantsForStyle);
router.post('/:styleId/variants', protect, checkRole('admin'), variantController.createVariant);

module.exports = router;
