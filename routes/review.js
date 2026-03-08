const express = require("express");
const WrapAsync = require("../public/utils/wrapAsync.js");
const ExpressError = require("../public/utils/ExpressError.js");
const { reviewSchema, reportSchema } = require("../schema.js");
const { isLoggedIn, isReviewAuthor } = require("../middleware.js");
const Controller = require("../controller/reviews.js");
const multer = require("multer");
const { storage } = require("../cloudConfig.js");

const router = express.Router({ mergeParams: true });
const upload = multer({ storage });

const validateReview = (req, res, next) => {
    const { error } = reviewSchema.validate(req.body);
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

router.post("/", isLoggedIn, upload.array("reviewImages", 3), validateReview, WrapAsync(Controller.createReview));
router.put("/:reviewId", isLoggedIn, isReviewAuthor, upload.array("reviewImages", 3), validateReview, WrapAsync(Controller.updateReview));
router.post("/:reviewId/report", isLoggedIn, validateReport, WrapAsync(Controller.reportReview));
router.delete("/:reviewId", isLoggedIn, isReviewAuthor, WrapAsync(Controller.destroyReview));

module.exports = router;
