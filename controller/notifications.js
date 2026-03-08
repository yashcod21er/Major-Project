const Notification = require("../models/notification");

module.exports.index = async (req, res) => {
    const notifications = await Notification.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(100);
    res.render("./notifications/index.ejs", { notifications });
};

module.exports.markRead = async (req, res) => {
    await Notification.updateOne(
        { _id: req.params.notificationId, user: req.user._id },
        { $set: { readAt: new Date() } }
    );

    res.redirect("/notifications");
};

module.exports.markAllRead = async (req, res) => {
    await Notification.updateMany(
        { user: req.user._id, readAt: null },
        { $set: { readAt: new Date() } }
    );

    res.redirect("/notifications");
};
