const express= require('express');
const router = express.Router({mergeParams: true});
const WrapAsync = require('../public/utils/wrapAsync.js');
const ExpressError = require('../public/utils/ExpressError.js');
const { reviewSchema } = require('../schema.js');
const { isLoggedIn, isReviewAuthor } = require("../middleware.js");
const Controller = require('../controller/reviews.js');

const validateReview = (req, res, next) => {
    const { error } = reviewSchema.validate(req.body);
    if (error) {
        const msg = error.details.map(el => el.message).join(',');
        throw new ExpressError(400, msg);
    } else {
        next();
    }
};

// Review creation route
router.post("/", isLoggedIn, validateReview, WrapAsync(Controller.createReview));

// Review deletion route
router.delete("/:reviewId", isLoggedIn, isReviewAuthor, WrapAsync(Controller.destroyReview));

module.exports = router;
