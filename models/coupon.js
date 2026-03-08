const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const couponSchema = new Schema(
    {
        code: {
            type: String,
            required: true,
            unique: true,
            uppercase: true,
            trim: true,
        },
        description: {
            type: String,
            default: "",
        },
        discountType: {
            type: String,
            enum: ["percent", "fixed"],
            default: "percent",
        },
        discountValue: {
            type: Number,
            min: 0,
            required: true,
        },
        minBookingAmount: {
            type: Number,
            min: 0,
            default: 0,
        },
        maxDiscountAmount: {
            type: Number,
            min: 0,
            default: 0,
        },
        expiresAt: {
            type: Date,
            default: null,
        },
        active: {
            type: Boolean,
            default: true,
        },
        createdBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("Coupon", couponSchema);
