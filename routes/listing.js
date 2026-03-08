const express = require("express");
const multer = require("multer");
const WrapAsync = require("../public/utils/wrapAsync.js");
const ExpressError = require("../public/utils/ExpressError.js");
const { listingSchema, bookingSchema, blockedRangeSchema, seasonalPriceSchema, reportSchema } = require("../schema.js");
const { isLoggedIn, isOwner } = require("../middleware.js");
const Controller = require("../controller/listing.js");
const { storage } = require("../cloudConfig.js");

const router = express.Router();
const upload = multer({ storage });

const validateListing = (req, res, next) => {
    const { error } = listingSchema.validate(req.body);
    if (error) {
        const msg = error.details.map((entry) => entry.message).join(", ");
        throw new ExpressError(400, msg);
    }

    next();
};

const validateBooking = (req, res, next) => {
    const { error } = bookingSchema.validate(req.body);
    if (error) {
        const msg = error.details.map((entry) => entry.message).join(", ");
        throw new ExpressError(400, msg);
    }

    next();
};

const validateBlockedRange = (req, res, next) => {
    const { error } = blockedRangeSchema.validate(req.body);
    if (error) {
        const msg = error.details.map((entry) => entry.message).join(", ");
        throw new ExpressError(400, msg);
    }

    next();
};

const validateSeasonalPrice = (req, res, next) => {
    const { error } = seasonalPriceSchema.validate(req.body);
    if (error) {
        const msg = error.details.map((entry) => entry.message).join(", ");
        throw new ExpressError(400, msg);
    }

    next();
};

const validateReport = (req, res, next) => {
    const { error } = reportSchema.validate(req.body);
    if (error) {
        const msg = error.details.map((entry) => entry.message).join(", ");
        throw new ExpressError(400, msg);
    }

    next();
};

router
    .route("/")
    .get(WrapAsync(Controller.index))
    .post(
        isLoggedIn,
        upload.array("images", 6),
        validateListing,
        WrapAsync(Controller.createListing)
    );

router.get("/new", isLoggedIn, Controller.renderNewForm);
router.get("/explore", WrapAsync(Controller.explore));

router.post("/:id/like", isLoggedIn, WrapAsync(Controller.toggleLike));
router.post("/:id/report", isLoggedIn, validateReport, WrapAsync(Controller.reportListing));
router.post("/:id/bookings/order", isLoggedIn, validateBooking, WrapAsync(Controller.createBookingOrder));
router.post("/:id/bookings/verify", isLoggedIn, WrapAsync(Controller.verifyBookingPayment));
router.post("/:id/bookings", isLoggedIn, validateBooking, WrapAsync(Controller.createBooking));
router.post("/:id/bookings/:bookingId/cancel", isLoggedIn, WrapAsync(Controller.cancelBooking));
router.get("/:id/bookings/:bookingId/invoice.pdf", isLoggedIn, WrapAsync(Controller.downloadInvoice));
router.post("/:id/blocked-ranges", isLoggedIn, isOwner, validateBlockedRange, WrapAsync(Controller.addBlockedRange));
router.post("/:id/seasonal-pricing", isLoggedIn, isOwner, validateSeasonalPrice, WrapAsync(Controller.addSeasonalPrice));

router
    .route("/:id")
    .get(WrapAsync(Controller.showListing))
    .put(
        isLoggedIn,
        isOwner,
        upload.array("images", 6),
        validateListing,
        WrapAsync(Controller.editListing)
    )
    .delete(isLoggedIn, isOwner, WrapAsync(Controller.destroyListing));

router.get("/:id/edit", isLoggedIn, isOwner, WrapAsync(Controller.renderEditForm));

module.exports = router;
