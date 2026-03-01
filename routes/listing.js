const express= require('express');
const router = express.Router();
const WrapAsync = require('../public/utils/wrapAsync.js');
const ExpressError = require('../public/utils/ExpressError.js');
const { listingSchema } = require('../schema.js');
const { isLoggedIn,isOwner } = require('../middleware.js');
const Controller = require('../controller/listing.js');
const multer = require('multer');
const { storage } = require('../cloudConfig.js');

const upload = multer({ storage });


const validateListing = (req, res, next) => {
    const { error } = listingSchema.validate(req.body); 
    if (error) {
        const msg = error.details.map(el => el.message).join(',');
        throw new ExpressError(400, msg);
    } else {
        next();
    }
};

const setListingImageFromUpload = (req, res, next) => {
    if (req.file) {
        req.body.listing = req.body.listing || {};
        req.body.listing.image = {
            filename: req.file.public_id || req.file.filename,
            url: req.file.secure_url || req.file.url || req.file.path
        };
    }
    next();
};

router
    .route("/")
    .get(WrapAsync(Controller.index))
    .post(
        isLoggedIn,
        upload.single('image'),
        setListingImageFromUpload,
        validateListing,
        WrapAsync(Controller.createListing)
    );
// NEW ROUTE
router.get('/new', isLoggedIn, Controller.renderNewForm);

router.route("/:id").
    get(WrapAsync(Controller.showListing))
    .put(isLoggedIn, isOwner, upload.single('image'), setListingImageFromUpload, validateListing, WrapAsync(Controller.editListing))
    .delete(isLoggedIn, isOwner, WrapAsync(Controller.destroyListing));



//EDIT ROUTE
router.get('/:id/edit', isLoggedIn,isOwner, WrapAsync(Controller.renderEditForm));


module.exports = router;
