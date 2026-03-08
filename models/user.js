const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const passportLocalMongoose = require("passport-local-mongoose").default;

const savedSearchSchema = new Schema(
    {
        label: {
            type: String,
            default: "Saved search",
        },
        q: {
            type: String,
            default: "",
        },
        sort: {
            type: String,
            default: "newest",
        },
        category: {
            type: String,
            default: "all",
        },
        country: {
            type: String,
            default: "",
        },
        location: {
            type: String,
            default: "",
        },
        minPrice: {
            type: Number,
            default: 0,
        },
        maxPrice: {
            type: Number,
            default: 0,
        },
        alertsEnabled: {
            type: Boolean,
            default: true,
        },
    },
    { _id: true, timestamps: true }
);

const hostProfileSchema = new Schema(
    {
        isVerified: {
            type: Boolean,
            default: false,
        },
        responseRate: {
            type: Number,
            default: 94,
        },
        responseTime: {
            type: String,
            default: "within an hour",
        },
    },
    { _id: false }
);

const guestProfileSchema = new Schema(
    {
        phone: {
            type: String,
            default: "",
        },
        isGovernmentIdVerified: {
            type: Boolean,
            default: false,
        },
        isPhoneVerified: {
            type: Boolean,
            default: false,
        },
    },
    { _id: false }
);

const userSchema = new Schema(
    {
        email: {
            type: String,
            required: true,
            unique: true,
        },
        isAdmin: {
            type: Boolean,
            default: false,
        },
        isSuspended: {
            type: Boolean,
            default: false,
        },
        savedSearches: {
            type: [savedSearchSchema],
            default: [],
        },
        hostProfile: {
            type: hostProfileSchema,
            default: () => ({}),
        },
        guestProfile: {
            type: guestProfileSchema,
            default: () => ({}),
        },
    },
    { timestamps: true }
);

userSchema.plugin(passportLocalMongoose, {
    usernameQueryFields: ["email"],
});

module.exports = mongoose.model("User", userSchema);
