const Razorpay = require("razorpay");

const razorpayKeyId = (process.env.RAZORPAY_KEY_ID || "").trim();
const razorpayKeySecret = (process.env.RAZORPAY_KEY_SECRET || "").trim();
const razorpayEnabled = Boolean(razorpayKeyId && razorpayKeySecret);

const razorpay = razorpayEnabled
    ? new Razorpay({
        key_id: razorpayKeyId,
        key_secret: razorpayKeySecret,
    })
    : null;

module.exports = {
    razorpay,
    razorpayEnabled,
    razorpayKeyId,
    razorpayKeySecret,
};
