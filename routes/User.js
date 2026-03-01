const express= require('express');
const router = express.Router();
const { saveRedirectUrl } = require('../middleware');
const WrapAsync = require("../public/utils/wrapAsync.js");
const Controller = require('../controller/users.js');

router.route("/signup")
.get( Controller.renderSignupForm)
.post( WrapAsync(Controller.signup));

router.route("/login")
    .get(Controller.renderLoginForm)
    .post(saveRedirectUrl, WrapAsync(Controller.login));

router.get("/logout", WrapAsync(Controller.logout));

module.exports = router;
