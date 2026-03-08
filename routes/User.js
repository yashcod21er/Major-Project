const express = require("express");
const { saveRedirectUrl, isLoggedIn } = require("../middleware");
const WrapAsync = require("../public/utils/wrapAsync.js");
const ExpressError = require("../public/utils/ExpressError.js");
const { savedSearchSchema } = require("../schema.js");
const Controller = require("../controller/users.js");

const router = express.Router();

const validateSavedSearch = (req, res, next) => {
    const { error } = savedSearchSchema.validate(req.body);
    if (error) {
        const msg = error.details.map((entry) => entry.message).join(", ");
        throw new ExpressError(400, msg);
    }

    next();
};

router
    .route("/signup")
    .get(Controller.renderSignupForm)
    .post(WrapAsync(Controller.signup));

router
    .route("/login")
    .get(Controller.renderLoginForm)
    .post(saveRedirectUrl, WrapAsync(Controller.login));

router.get("/profile", isLoggedIn, WrapAsync(Controller.profile));
router.get("/wishlist", isLoggedIn, WrapAsync(Controller.wishlist));
router.post("/saved-searches", isLoggedIn, validateSavedSearch, WrapAsync(Controller.saveSearch));
router.delete("/saved-searches/:searchId", isLoggedIn, WrapAsync(Controller.deleteSavedSearch));
router.get("/logout", WrapAsync(Controller.logout));

module.exports = router;
