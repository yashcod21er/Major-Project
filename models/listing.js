const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const Review = require("./review.js");

const fallbackImageUrl = "https://www.orchidhotel.com/static/website/img/hotels/panchgani/homepage_slider/homepage_slider.webp";

const imageSchema = new Schema(
    {
        filename: {
            type: String,
            default: "",
        },
        url: {
            type: String,
            default: fallbackImageUrl,
        },
    },
    { _id: false }
);

const blockedRangeSchema = new Schema(
    {
        startDate: {
            type: Date,
            required: true,
        },
        endDate: {
            type: Date,
            required: true,
        },
        reason: {
            type: String,
            default: "Host blocked dates",
        },
    },
    { _id: true }
);

const seasonalPriceSchema = new Schema(
    {
        label: {
            type: String,
            default: "Seasonal pricing",
        },
        startDate: {
            type: Date,
            required: true,
        },
        endDate: {
            type: Date,
            required: true,
        },
        nightlyPrice: {
            type: Number,
            min: 0,
            required: true,
        },
    },
    { _id: true }
);

const bookingSchema = new Schema(
    {
        startDate: {
            type: Date,
            required: true,
        },
        endDate: {
            type: Date,
            required: true,
        },
        guest: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        nights: {
            type: Number,
            min: 1,
            required: true,
        },
        totalPrice: {
            type: Number,
            min: 0,
            required: true,
        },
        status: {
            type: String,
            enum: ["confirmed", "cancelled"],
            default: "confirmed",
        },
        cancelledAt: Date,
        cancelledBy: {
            type: String,
            enum: ["guest", "host", "admin", ""],
            default: "",
        },
        cancellation: {
            policy: {
                type: String,
                default: "flexible",
            },
            refundPercent: {
                type: Number,
                default: 0,
            },
            refundAmount: {
                type: Number,
                default: 0,
            },
            note: {
                type: String,
                default: "",
            },
        },
        payment: {
            orderId: {
                type: String,
                default: "",
            },
            paymentId: {
                type: String,
                default: "",
            },
            signature: {
                type: String,
                default: "",
            },
            amount: {
                type: Number,
                min: 0,
                default: 0,
            },
            currency: {
                type: String,
                default: "INR",
            },
            status: {
                type: String,
                default: "paid",
            },
            refundStatus: {
                type: String,
                enum: ["none", "pending", "processing", "completed", "rejected"],
                default: "none",
            },
            refundAdminNote: {
                type: String,
                default: "",
            },
            refundProcessedAt: {
                type: Date,
                default: null,
            },
            paidAt: {
                type: Date,
                default: Date.now,
            },
        },
        coupon: {
            code: {
                type: String,
                default: "",
            },
            discountType: {
                type: String,
                default: "",
            },
            discountValue: {
                type: Number,
                default: 0,
            },
            discountAmount: {
                type: Number,
                default: 0,
            },
        },
        createdAt: {
            type: Date,
            default: Date.now,
        },
    },
    { _id: true }
);

const geoSchema = new Schema(
    {
        lat: Number,
        lng: Number,
        placeLabel: String,
        lastGeocodedAt: Date,
    },
    { _id: false }
);

const listingSchema = new Schema(
    {
        title: {
            type: String,
            required: true,
        },
        description: {
            type: String,
            required: true,
        },
        image: {
            type: imageSchema,
            default: () => ({ url: fallbackImageUrl }),
        },
        gallery: {
            type: [imageSchema],
            default: [],
        },
        price: {
            type: Number,
            min: 0,
            default: 0,
        },
        location: {
            type: String,
            required: true,
        },
        country: {
            type: String,
            required: true,
        },
        geo: {
            type: geoSchema,
            default: () => ({}),
        },
        nearbyPlaces: {
            type: [String],
            default: [],
        },
        amenities: {
            type: [String],
            default: [],
        },
        cancellationPolicy: {
            type: String,
            enum: ["flexible", "moderate", "strict"],
            default: "flexible",
        },
        hostBadgeText: {
            type: String,
            default: "Super responsive host",
        },
        reviews: [
            {
                type: Schema.Types.ObjectId,
                ref: "Review",
            }
        ],
        reviewCount: {
            type: Number,
            default: 0,
        },
        ratingAverage: {
            type: Number,
            default: 0,
        },
        unavailableRanges: {
            type: [blockedRangeSchema],
            default: [],
        },
        seasonalPricing: {
            type: [seasonalPriceSchema],
            default: [],
        },
        bookings: {
            type: [bookingSchema],
            default: [],
        },
        owner: {
            type: Schema.Types.ObjectId,
            ref: "User",
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        suspendedReason: {
            type: String,
            default: "",
        },
        likes: {
            type: [
                {
                    type: Schema.Types.ObjectId,
                    ref: "User",
                }
            ],
            default: [],
        },
    },
    { timestamps: true }
);

listingSchema.pre("save", function syncPrimaryImage() {
    if (!Array.isArray(this.gallery)) {
        this.gallery = [];
    }

    if (!this.gallery.length && this.image?.url) {
        this.gallery = [this.image];
    }

    if (this.gallery.length) {
        this.image = this.gallery[0];
    }

    if (!Array.isArray(this.nearbyPlaces) || !this.nearbyPlaces.length) {
        this.nearbyPlaces = [
            "Cafe and breakfast spots nearby",
            "Transit access within 10 to 15 minutes",
            "Popular local attractions around the area",
        ];
    }

    if (!Array.isArray(this.amenities)) {
        this.amenities = [];
    }
});

listingSchema.post("findOneAndDelete", async (listing) => {
    if (!listing || !Array.isArray(listing.reviews) || !listing.reviews.length) {
        return;
    }

    await Review.deleteMany({
        _id: {
            $in: listing.reviews,
        },
    });
});

const Listing = mongoose.model("Listing", listingSchema);

module.exports = Listing;
