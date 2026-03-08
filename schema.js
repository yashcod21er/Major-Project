const Joi = require("joi");

const listingSchema = Joi.object({
    listing: Joi.object({
        title: Joi.string().trim().required(),
        description: Joi.string().trim().required(),
        price: Joi.number().min(0).required(),
        location: Joi.string().trim().required(),
        country: Joi.string().trim().required(),
        amenities: Joi.array().items(Joi.string().trim()).single().default([]),
        cancellationPolicy: Joi.string().valid("flexible", "moderate", "strict").default("flexible"),
        hostBadgeText: Joi.string().trim().allow("").max(80).default(""),
    }).required(),
});

const reviewSchema = Joi.object({
    review: Joi.object({
        rating: Joi.number().required().min(1).max(5),
        comment: Joi.string().trim().required(),
    }).required(),
});

const bookingSchema = Joi.object({
    booking: Joi.object({
        startDate: Joi.date().required(),
        endDate: Joi.date().greater(Joi.ref("startDate")).required(),
        couponCode: Joi.string().trim().allow("").max(30),
    }).required(),
});

const savedSearchSchema = Joi.object({
    search: Joi.object({
        label: Joi.string().trim().max(50).allow(""),
        q: Joi.string().trim().allow(""),
        sort: Joi.string().trim().default("newest"),
        category: Joi.string().trim().default("all"),
        country: Joi.string().trim().allow(""),
        location: Joi.string().trim().allow(""),
        minPrice: Joi.number().min(0).default(0),
        maxPrice: Joi.number().min(0).default(0),
        alertsEnabled: Joi.boolean().default(true),
    }).required(),
});

const blockedRangeSchema = Joi.object({
    block: Joi.object({
        startDate: Joi.date().required(),
        endDate: Joi.date().greater(Joi.ref("startDate")).required(),
        reason: Joi.string().trim().allow("").max(80),
    }).required(),
});

const seasonalPriceSchema = Joi.object({
    pricing: Joi.object({
        label: Joi.string().trim().allow("").max(60),
        startDate: Joi.date().required(),
        endDate: Joi.date().greater(Joi.ref("startDate")).required(),
        nightlyPrice: Joi.number().min(0).required(),
    }).required(),
});

const reportSchema = Joi.object({
    report: Joi.object({
        reason: Joi.string().trim().required().max(80),
        details: Joi.string().trim().allow("").max(500),
    }).required(),
});

const couponSchema = Joi.object({
    coupon: Joi.object({
        code: Joi.string().trim().required().max(30),
        description: Joi.string().trim().allow("").max(120),
        discountType: Joi.string().valid("percent", "fixed").required(),
        discountValue: Joi.number().min(0).required(),
        minBookingAmount: Joi.number().min(0).default(0),
        maxDiscountAmount: Joi.number().min(0).default(0),
        expiresAt: Joi.date().allow("", null),
        active: Joi.boolean().default(true),
    }).required(),
});

module.exports = {
    listingSchema,
    reviewSchema,
    bookingSchema,
    savedSearchSchema,
    blockedRangeSchema,
    seasonalPriceSchema,
    reportSchema,
    couponSchema,
};
