const Notification = require("../models/notification");

module.exports.createNotification = async ({ user, title, body = "", type = "general", link = "" }) => {
    if (!user || !title) {
        return null;
    }

    return Notification.create({
        user,
        title,
        body,
        type,
        link,
    });
};
