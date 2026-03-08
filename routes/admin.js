const express = require("express");
const WrapAsync = require("../public/utils/wrapAsync");
const ExpressError = require("../public/utils/ExpressError");
const { couponSchema } = require("../schema");
const { isLoggedIn, isAdmin } = require("../middleware");
const Controller = require("../controller/admin");

const router = express.Router();

const validateCoupon = (req, res, next) => {
    const { error } = couponSchema.validate(req.body);
    if (error) {
        const msg = error.details.map((entry) => entry.message).join(", ");
        throw new ExpressError(400, msg);
    }

    next();
};

router.get("/", isLoggedIn, isAdmin, WrapAsync(Controller.dashboard));
router.post("/coupons", isLoggedIn, isAdmin, validateCoupon, WrapAsync(Controller.createCoupon));
router.post("/reports/:reportId/status", isLoggedIn, isAdmin, WrapAsync(Controller.updateReportStatus));
router.post("/listings/:listingId/delete", isLoggedIn, isAdmin, WrapAsync(Controller.removeListing));
router.post("/listings/:listingId/visibility", isLoggedIn, isAdmin, WrapAsync(Controller.toggleListingVisibility));
router.post("/reviews/:reviewId/delete", isLoggedIn, isAdmin, WrapAsync(Controller.removeReview));
router.post("/users/:userId/toggle-verify", isLoggedIn, isAdmin, WrapAsync(Controller.toggleHostVerification));
router.post("/users/:userId/toggle-suspension", isLoggedIn, isAdmin, WrapAsync(Controller.toggleUserSuspension));
router.post("/refunds/:listingId/:bookingId", isLoggedIn, isAdmin, WrapAsync(Controller.updateRefundStatus));

module.exports = router;
