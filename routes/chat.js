const express = require("express");
const WrapAsync = require("../public/utils/wrapAsync");
const { isLoggedIn } = require("../middleware");
const Controller = require("../controller/chat");

const router = express.Router();

router.get("/", isLoggedIn, WrapAsync(Controller.index));
router.post("/listings/:listingId", isLoggedIn, WrapAsync(Controller.startThread));
router.get("/threads/:threadId", isLoggedIn, WrapAsync(Controller.showThread));
router.get("/threads/:threadId/stream", isLoggedIn, WrapAsync(Controller.streamThread));
router.post("/threads/:threadId/read", isLoggedIn, WrapAsync(Controller.markRead));
router.post("/threads/:threadId/messages", isLoggedIn, WrapAsync(Controller.sendMessage));

module.exports = router;
