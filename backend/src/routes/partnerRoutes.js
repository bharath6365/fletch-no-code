
const express = require('express');
const partnerController = require('../controllers/partnerController');
const router = express.Router();

router.get('/:name', partnerController.getPartnerByName);
router.put("/:name/config", partnerController.updatePartnerConfig);
router.put("/category/:categoryName", partnerController.updateCategoryStatus);
router.put('/:partnerId/config/:configVersion/category/:categoryName/screens', partnerController.saveScreens);
router.get('/:name/versions', partnerController.getPartnerConfigurations);
router.post("/pincode/valid", partnerController.validatePincode); 


module.exports = router;