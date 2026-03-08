const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const reportSchema = new Schema(
    {
        reporter: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        listing: {
            type: Schema.Types.ObjectId,
            ref: "Listing",
            default: null,
        },
        review: {
            type: Schema.Types.ObjectId,
            ref: "Review",
            default: null,
        },
        reason: {
            type: String,
            required: true,
            trim: true,
        },
        details: {
            type: String,
            default: "",
            trim: true,
        },
        status: {
            type: String,
            enum: ["open", "reviewed", "resolved", "dismissed"],
            default: "open",
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("Report", reportSchema);
