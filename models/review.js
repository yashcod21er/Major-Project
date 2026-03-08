const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const reviewImageSchema = new Schema(
    {
        filename: {
            type: String,
            default: "",
        },
        url: {
            type: String,
            default: "",
        },
    },
    { _id: false }
);

const reviewSchema = new Schema({
    rating: {
        type: Number,
        min: 1,
        max: 5,
    },
    comment: String,
    images: {
        type: [reviewImageSchema],
        default: [],
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
    author: {
        type: Schema.Types.ObjectId,
        ref: "User",
    }
});

const Review = mongoose.model("Review", reviewSchema);
module.exports = Review;
