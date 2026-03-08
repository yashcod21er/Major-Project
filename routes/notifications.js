const express = require("express");
const WrapAsync = require("../public/utils/wrapAsync");
const { isLoggedIn } = require("../middleware");
const Controller = require("../controller/notifications");

const router = express.Router();

router.get("/", isLoggedIn, WrapAsync(Controller.index));
router.post("/read-all", isLoggedIn, WrapAsync(Controller.markAllRead));
router.post("/:notificationId/read", isLoggedIn, WrapAsync(Controller.markRead));

module.exports = router;
