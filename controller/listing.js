const crypto = require("crypto");
const Listing = require("../models/listing");
const Coupon = require("../models/coupon");
const Report = require("../models/report");
const ExpressError = require("../public/utils/ExpressError.js");
const geocodeLocation = require("../utils/geocode");
const fetchNearbyPlaces = require("../utils/nearbyPlaces");
const { sendEmail } = require("../utils/email");
const { buildSimpleEmail } = require("../utils/emailTemplates");
const buildInvoicePdf = require("../utils/invoicePdf");
const { createNotification } = require("../utils/notifications");
const { razorpay, razorpayEnabled, razorpayKeyId, razorpayKeySecret } = require("../utils/razorpay");

const PAGE_SIZE = 8;
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const BOOKING_CURRENCY = "INR";
const AMENITY_OPTIONS = ["Wi-Fi", "Pool", "Parking", "AC", "Kitchen", "Workspace", "Pets allowed"];

const SORT_OPTIONS = {
    newest: { label: "Newest first", sort: { createdAt: -1, _id: -1 } },
    rating: { label: "Top rated", sort: { ratingAverage: -1, reviewCount: -1, createdAt: -1 } },
    priceAsc: { label: "Price: low to high", sort: { price: 1, createdAt: -1 } },
    priceDesc: { label: "Price: high to low", sort: { price: -1, createdAt: -1 } },
    mostLiked: { label: "Most wishlisted", sort: { likesCount: -1, createdAt: -1 } },
};

const SORT_COMPARATORS = {
    newest: (left, right) => new Date(right.createdAt) - new Date(left.createdAt),
    rating: (left, right) =>
        Number(right.ratingAverage || 0) - Number(left.ratingAverage || 0) ||
        Number(right.reviewCount || 0) - Number(left.reviewCount || 0) ||
        new Date(right.createdAt) - new Date(left.createdAt),
    priceAsc: (left, right) => Number(left.price || 0) - Number(right.price || 0),
    priceDesc: (left, right) => Number(right.price || 0) - Number(left.price || 0),
    mostLiked: (left, right) => (right.likes?.length || 0) - (left.likes?.length || 0),
};

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const parsePositiveInt = (rawValue, fallback) => {
    const parsed = Number.parseInt(rawValue, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const getStringArray = (value) => {
    if (Array.isArray(value)) {
        return value.map((entry) => String(entry).trim()).filter(Boolean);
    }

    if (typeof value === "string" && value.trim()) {
        return [value.trim()];
    }

    return [];
};

const getSafeRedirectPath = (rawPath, fallbackPath) => {
    if (typeof rawPath !== "string") return fallbackPath;
    if (!rawPath.startsWith("/") || rawPath.startsWith("//")) return fallbackPath;
    return rawPath;
};

const formatUploadedImages = (files = []) => files.map((file) => ({
    filename: file.public_id || file.filename || "",
    url: file.secure_url || file.url || file.path,
}));

const getGalleryImages = (listing) => {
    if (Array.isArray(listing.gallery) && listing.gallery.length) {
        return listing.gallery;
    }

    if (listing.image?.url) {
        return [listing.image];
    }

    return [];
};

const normalizeGallery = async (listing) => {
    const gallery = getGalleryImages(listing);
    let changed = false;

    if (!Array.isArray(listing.gallery) || listing.gallery.length !== gallery.length) {
        listing.gallery = gallery;
        changed = true;
    }

    if (gallery.length && (!listing.image?.url || listing.image.url !== gallery[0].url)) {
        listing.image = gallery[0];
        changed = true;
    }

    if (changed) {
        await listing.save();
    }
};

const shouldRefreshGeo = (listing, location, country) => {
    if (typeof listing.geo?.lat !== "number" || typeof listing.geo?.lng !== "number") {
        return true;
    }

    return listing.location !== location || listing.country !== country;
};

const syncGeo = async (listing, location, country) => {
    if (!shouldRefreshGeo(listing, location, country)) {
        return;
    }

    const geo = await geocodeLocation(location, country);
    if (geo) {
        listing.geo = geo;
    }
};

const parseDateInput = (value) => {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getDateOnlyValue = (date) => {
    const dateValue = new Date(date);
    return new Date(dateValue.getFullYear(), dateValue.getMonth(), dateValue.getDate());
};

const hasDateOverlap = (existingStart, existingEnd, nextStart, nextEnd) =>
    nextStart <= existingEnd && nextEnd >= existingStart;

const getMonthLabel = (date) => date.toLocaleDateString("en-IN", { month: "long", year: "numeric" });

const getNightDates = (startDate, endDate) => {
    const dates = [];
    let cursor = getDateOnlyValue(startDate);
    const finalDate = getDateOnlyValue(endDate);

    while (cursor < finalDate) {
        dates.push(new Date(cursor));
        cursor = new Date(cursor.getTime() + DAY_IN_MS);
    }

    return dates;
};

const getNightCount = (startDate, endDate) => getNightDates(startDate, endDate).length;

const getSeasonalPriceForNight = (listing, date) => {
    const currentDate = getDateOnlyValue(date);
    const seasonalEntry = (listing.seasonalPricing || []).find((entry) => {
        const startDate = getDateOnlyValue(entry.startDate);
        const endDate = getDateOnlyValue(entry.endDate);
        return currentDate >= startDate && currentDate < endDate;
    });

    return seasonalEntry ? Number(seasonalEntry.nightlyPrice) : Number(listing.price || 0);
};

const getBookingQuote = (listing, bookingPayload = {}) => {
    const startDate = parseDateInput(bookingPayload.startDate);
    const endDate = parseDateInput(bookingPayload.endDate);

    if (!startDate || !endDate || startDate >= endDate) {
        return { error: "Choose a valid booking range." };
    }

    const nightlyDates = getNightDates(startDate, endDate);
    const nights = nightlyDates.length;
    if (!Number.isInteger(nights) || nights <= 0) {
        return { error: "Choose a valid booking range." };
    }

    const totalPrice = nightlyDates.reduce((sum, date) => sum + getSeasonalPriceForNight(listing, date), 0);
    const amountInPaise = Math.round(totalPrice * 100);

    return {
        startDate,
        endDate,
        nights,
        totalPrice,
        amountInPaise,
        currency: BOOKING_CURRENCY,
    };
};

const resolveCoupon = async (couponCode, totalPrice) => {
    const normalizedCode = String(couponCode || "").trim().toUpperCase();
    if (!normalizedCode) {
        return {
            code: "",
            discountType: "",
            discountValue: 0,
            discountAmount: 0,
        };
    }

    const coupon = await Coupon.findOne({ code: normalizedCode, active: true });
    if (!coupon) {
        return { error: "Coupon code is invalid or inactive." };
    }

    if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
        return { error: "Coupon code has expired." };
    }

    if (Number(totalPrice) < Number(coupon.minBookingAmount || 0)) {
        return { error: `Coupon requires a minimum booking amount of Rs. ${Number(coupon.minBookingAmount || 0).toLocaleString("en-IN")}.` };
    }

    let discountAmount = coupon.discountType === "percent"
        ? Math.round((Number(totalPrice) * Number(coupon.discountValue || 0)) / 100)
        : Math.round(Number(coupon.discountValue || 0));

    if (coupon.maxDiscountAmount > 0) {
        discountAmount = Math.min(discountAmount, Number(coupon.maxDiscountAmount));
    }

    discountAmount = Math.min(discountAmount, Number(totalPrice || 0));

    return {
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: Number(coupon.discountValue || 0),
        discountAmount,
    };
};

const attachCouponToQuote = async (quote, couponCode) => {
    const coupon = await resolveCoupon(couponCode, quote.totalPrice);
    if (coupon.error) {
        return { error: coupon.error };
    }

    const payableTotal = Math.max(0, Number(quote.totalPrice || 0) - Number(coupon.discountAmount || 0));

    return {
        ...quote,
        coupon,
        payableTotal,
        amountInPaise: Math.round(payableTotal * 100),
    };
};

const isBookingActive = (booking) => booking.status !== "cancelled";

const getBookingConflict = (listing, startDate, endDate) => {
    const activeBooking = (listing.bookings || []).find((booking) =>
        isBookingActive(booking) &&
        hasDateOverlap(new Date(booking.startDate), new Date(booking.endDate), startDate, endDate)
    );

    if (activeBooking) {
        return activeBooking;
    }

    return (listing.unavailableRanges || []).find((range) =>
        hasDateOverlap(new Date(range.startDate), new Date(range.endDate), startDate, endDate)
    );
};

const saveSession = (req) => new Promise((resolve, reject) => {
    req.session.save((error) => {
        if (error) {
            return reject(error);
        }

        resolve();
    });
});

const ensurePendingOrders = (req) => {
    if (!req.session.pendingBookingOrders || typeof req.session.pendingBookingOrders !== "object") {
        req.session.pendingBookingOrders = {};
    }

    return req.session.pendingBookingOrders;
};

const deletePendingOrder = async (req, orderId) => {
    const pendingOrders = ensurePendingOrders(req);
    delete pendingOrders[orderId];
    await saveSession(req);
};

const getRazorpayAvailability = () => Boolean(razorpayEnabled && razorpay && razorpayKeyId && razorpayKeySecret);

const ensureBookingAllowed = (listing, userId) => {
    if (!listing) {
        return "Listing not found.";
    }

    if (listing.isActive === false) {
        return "This listing is not currently available.";
    }

    if (listing.owner && String(listing.owner._id) === String(userId)) {
        return "You cannot book your own listing.";
    }

    return "";
};

const rememberRecentlyViewed = async (req, listingId) => {
    const previous = Array.isArray(req.session.recentlyViewedListings) ? req.session.recentlyViewedListings : [];
    req.session.recentlyViewedListings = [String(listingId), ...previous.filter((id) => id !== String(listingId))].slice(0, 6);
    await saveSession(req);
};

const getRefundPolicySummary = (policy) => {
    switch (policy) {
        case "strict":
            return "Full refund within 48 hours of booking. Afterwards, partial refund only.";
        case "moderate":
            return "Free cancellation up to 5 days before check-in.";
        default:
            return "Free cancellation up to 24 hours before check-in.";
    }
};

const getRefundDetails = (booking, cancelledBy) => {
    const policy = booking.cancellation?.policy || "flexible";
    const totalPrice = Number(booking.totalPrice || 0);
    let refundPercent = 0;

    if (cancelledBy === "host") {
        refundPercent = 100;
    } else if (policy === "flexible") {
        refundPercent = 100;
    } else if (policy === "moderate") {
        refundPercent = 50;
    } else {
        refundPercent = 25;
    }

    return {
        policy,
        refundPercent,
        refundAmount: Math.round((totalPrice * refundPercent) / 100),
        note: cancelledBy === "host"
            ? "Host cancelled. Full refund applies."
            : `${refundPercent}% refund applies under the ${policy} policy.`,
    };
};

const canManageBooking = (booking, currentUserId, listingOwnerId) => {
    const guestId = booking?.guest?._id || booking?.guest;
    return String(currentUserId) === String(listingOwnerId) || String(currentUserId) === String(guestId);
};

const canAccessBookingInvoice = (booking, currentUserId, listingOwnerId, isAdmin) =>
    Boolean(isAdmin) || canManageBooking(booking, currentUserId, listingOwnerId);

const isListingAvailableForRange = (listing, checkIn, checkOut) => {
    if (!checkIn || !checkOut) {
        return true;
    }

    return !getBookingConflict(listing, checkIn, checkOut);
};

const hasRequiredAmenities = (listing, requiredAmenities = []) => {
    if (!requiredAmenities.length) {
        return true;
    }

    const listingAmenities = new Set((listing.amenities || []).map((amenity) => String(amenity).toLowerCase()));
    return requiredAmenities.every((amenity) => listingAmenities.has(String(amenity).toLowerCase()));
};

const buildCalendarMonth = (blockedRanges = [], monthOffset = 0) => {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
    const monthIndex = firstDay.getMonth();
    const year = firstDay.getFullYear();
    const lastDay = new Date(year, monthIndex + 1, 0);
    const cells = [];

    for (let i = 0; i < firstDay.getDay(); i += 1) {
        cells.push({ isPadding: true });
    }

    for (let day = 1; day <= lastDay.getDate(); day += 1) {
        const cellDate = new Date(year, monthIndex, day);
        const status = blockedRanges.find((range) =>
            cellDate >= getDateOnlyValue(range.startDate) && cellDate <= getDateOnlyValue(range.endDate)
        );

        cells.push({
            isPadding: false,
            day,
            status: status?.source || "available",
            label: status?.label || "Available",
        });
    }

    return {
        label: getMonthLabel(firstDay),
        cells,
    };
};

const sortListings = (listings, selectedSort) => {
    const comparator = SORT_COMPARATORS[selectedSort] || SORT_COMPARATORS.newest;
    return listings.slice().sort(comparator);
};

module.exports.index = async (req, res) => {
    const searchQuery = (req.query.q || "").trim();
    const selectedSort = SORT_OPTIONS[req.query.sort] ? req.query.sort : "newest";
    const requestedPage = parsePositiveInt(req.query.page, 1);
    const selectedCountry = (req.query.country || "").trim();
    const selectedLocation = (req.query.location || "").trim();
    const minPrice = parsePositiveInt(req.query.minPrice, 0);
    const maxPrice = parsePositiveInt(req.query.maxPrice, 0);
    const selectedAmenities = getStringArray(req.query.amenities || req.query.amenity);
    const checkIn = parseDateInput(req.query.checkIn);
    const checkOut = parseDateInput(req.query.checkOut);
    const query = {};

    query.isActive = { $ne: false };

    if (searchQuery) {
        const regex = new RegExp(escapeRegex(searchQuery), "i");
        query.$or = [
            { title: regex },
            { description: regex },
            { location: regex },
            { country: regex },
        ];
    }

    if (selectedCountry) {
        query.country = new RegExp(`^${escapeRegex(selectedCountry)}$`, "i");
    }

    if (selectedLocation) {
        query.location = new RegExp(`^${escapeRegex(selectedLocation)}$`, "i");
    }

    if (minPrice > 0 || maxPrice > 0) {
        query.price = {};

        if (minPrice > 0) {
            query.price.$gte = minPrice;
        }

        if (maxPrice > 0) {
            query.price.$lte = maxPrice;
        }
    }

    const allListings = await Listing.find(query);
    const filteredListings = allListings.filter((listing) =>
        hasRequiredAmenities(listing, selectedAmenities) &&
        isListingAvailableForRange(listing, checkIn, checkOut)
    );
    const sortedListings = sortListings(filteredListings, selectedSort);
    const totalListings = sortedListings.length;
    const totalPages = Math.max(1, Math.ceil(totalListings / PAGE_SIZE));
    const currentPage = Math.min(requestedPage, totalPages);
    const skip = (currentPage - 1) * PAGE_SIZE;
    const listings = sortedListings.slice(skip, skip + PAGE_SIZE);

    const initialFilters = {
        q: searchQuery,
        sort: selectedSort,
        category: req.query.category || "all",
        country: selectedCountry,
        location: selectedLocation,
        minPrice: req.query.minPrice || "",
        maxPrice: req.query.maxPrice || "",
        amenities: selectedAmenities,
        checkIn: req.query.checkIn || "",
        checkOut: req.query.checkOut || "",
    };

    res.render("./listings/index.ejs", {
        listings,
        searchQuery,
        returnTo: req.originalUrl,
        selectedSort,
        sortOptions: SORT_OPTIONS,
        initialFilters,
        amenityOptions: AMENITY_OPTIONS,
        pagination: {
            currentPage,
            totalPages,
            totalListings,
        },
    });
};

module.exports.explore = async (req, res) => {
    const selectedAmenities = getStringArray(req.query.amenities || req.query.amenity);
    const checkIn = parseDateInput(req.query.checkIn);
    const checkOut = parseDateInput(req.query.checkOut);
    const listings = await Listing.find({
        isActive: { $ne: false },
        "geo.lat": { $type: "number" },
        "geo.lng": { $type: "number" },
    }).sort({ createdAt: -1, _id: -1 }).limit(80);

    const filteredListings = listings.filter((listing) =>
        hasRequiredAmenities(listing, selectedAmenities) &&
        isListingAvailableForRange(listing, checkIn, checkOut)
    );

    res.render("./listings/explore.ejs", {
        listings: filteredListings.map((listing) => ({
            ...listing.toObject(),
            coverImage: getGalleryImages(listing)[0] || listing.image,
        })),
        amenityOptions: AMENITY_OPTIONS,
        initialFilters: {
            amenities: selectedAmenities,
            checkIn: req.query.checkIn || "",
            checkOut: req.query.checkOut || "",
        },
    });
};

module.exports.renderNewForm = (req, res) => {
    res.render("./listings/new.ejs", { amenityOptions: AMENITY_OPTIONS });
};

module.exports.createListing = async (req, res) => {
    if (!req.body.listing) {
        throw new ExpressError(400, "Invalid listing data.");
    }

    const listing = new Listing(req.body.listing);
    listing.owner = req.user._id;
    listing.cancellationPolicy = req.body.listing.cancellationPolicy || "flexible";
    listing.hostBadgeText = req.body.listing.hostBadgeText || "Super responsive host";
    listing.amenities = getStringArray(req.body.listing.amenities);

    const uploadedImages = formatUploadedImages(req.files);
    if (uploadedImages.length) {
        listing.gallery = uploadedImages;
        listing.image = uploadedImages[0];
    }

    await syncGeo(listing, listing.location, listing.country);
    await listing.save();

    req.flash("success", "New listing created.");
    res.redirect(`/listings/${listing._id}`);
};

module.exports.renderEditForm = async (req, res) => {
    const { id } = req.params;
    const listing = await Listing.findById(id);

    if (!listing) {
        req.flash("error", "Listing not found.");
        return res.redirect("/listings");
    }

    const isOwnerOrAdmin = req.user && (String(listing.owner?._id || listing.owner) === String(req.user._id) || req.user.isAdmin);
    if (listing.isActive === false && !isOwnerOrAdmin) {
        req.flash("error", "Listing not found.");
        return res.redirect("/listings");
    }

    await normalizeGallery(listing);
    res.render("./listings/edit.ejs", {
        listing,
        galleryImages: getGalleryImages(listing),
        amenityOptions: AMENITY_OPTIONS,
    });
};

module.exports.editListing = async (req, res) => {
    const { id } = req.params;
    const listing = await Listing.findById(id);

    if (!listing) {
        req.flash("error", "Listing not found.");
        return res.redirect("/listings");
    }

    const {
        title,
        description,
        price,
        location,
        country,
        cancellationPolicy,
        hostBadgeText,
    } = req.body.listing;
    const locationChanged = listing.location !== location || listing.country !== country;

    listing.title = title;
    listing.description = description;
    listing.price = price;
    listing.location = location;
    listing.country = country;
    listing.cancellationPolicy = cancellationPolicy || "flexible";
    listing.hostBadgeText = hostBadgeText || "Super responsive host";
    listing.amenities = getStringArray(req.body.listing.amenities);

    const uploadedImages = formatUploadedImages(req.files);
    if (uploadedImages.length) {
        listing.gallery = [...getGalleryImages(listing), ...uploadedImages];
        listing.image = listing.gallery[0];
    }

    if (locationChanged || typeof listing.geo?.lat !== "number" || typeof listing.geo?.lng !== "number") {
        await syncGeo(listing, location, country);
    }

    await listing.save();
    req.flash("success", "Listing updated successfully.");
    res.redirect(`/listings/${id}`);
};

module.exports.showListing = async (req, res) => {
    const { id } = req.params;
    const listing = await Listing.findById(id)
        .populate({
            path: "reviews",
            populate: {
                path: "author",
            },
        })
        .populate("owner")
        .populate("bookings.guest");

    if (!listing) {
        req.flash("error", "Listing not found.");
        return res.redirect("/listings");
    }

    await normalizeGallery(listing);

    if (typeof listing.geo?.lat !== "number" || typeof listing.geo?.lng !== "number") {
        await syncGeo(listing, listing.location, listing.country);
        await listing.save();
    }

    await rememberRecentlyViewed(req, listing._id);

    const galleryImages = getGalleryImages(listing);
    const editingReviewId = typeof req.query.editReview === "string" ? req.query.editReview : "";
    const upcomingBookings = (listing.bookings || [])
        .filter(isBookingActive)
        .slice()
        .sort((left, right) => new Date(left.startDate) - new Date(right.startDate));
    const blockedRanges = [
        ...upcomingBookings.map((booking) => ({
            startDate: booking.startDate,
            endDate: booking.endDate,
            source: "booking",
            label: booking.guest?.username ? `Booked by ${booking.guest.username}` : "Confirmed booking",
        })),
        ...(listing.unavailableRanges || []).map((range) => ({
            startDate: range.startDate,
            endDate: range.endDate,
            source: "host",
            label: range.reason || "Host blocked dates",
        })),
    ].sort((left, right) => new Date(left.startDate) - new Date(right.startDate));

    const hostSince = listing.owner?.createdAt
        ? new Date(listing.owner.createdAt).toLocaleDateString("en-IN", { month: "short", year: "numeric" })
        : "";
    const nearbyPlacesLive = await fetchNearbyPlaces(listing.geo);
    const calendarMonths = [buildCalendarMonth(blockedRanges, 0), buildCalendarMonth(blockedRanges, 1)];

    res.render("./listings/show.ejs", {
        listing,
        galleryImages,
        returnTo: req.originalUrl,
        editingReviewId,
        upcomingBookings,
        blockedRanges,
        today: new Date().toISOString().split("T")[0],
        razorpayEnabled: getRazorpayAvailability(),
        razorpayKeyId,
        hostFacts: {
            isVerified: Boolean(listing.owner?.hostProfile?.isVerified),
            responseRate: Number(listing.owner?.hostProfile?.responseRate || 94),
            responseTime: listing.owner?.hostProfile?.responseTime || "within an hour",
            hostSince,
            badge: listing.hostBadgeText || "Super responsive host",
        },
        nearbyPlacesLive,
        amenityOptions: AMENITY_OPTIONS,
        calendarMonths,
        policySummary: getRefundPolicySummary(listing.cancellationPolicy),
    });
};

module.exports.toggleLike = async (req, res) => {
    const { id } = req.params;
    const listing = await Listing.findById(id);

    if (!listing) {
        req.flash("error", "Listing not found.");
        return res.redirect("/listings");
    }

    const userId = req.user._id;
    const hasLiked = (listing.likes || []).some((likedUserId) => String(likedUserId) === String(userId));

    if (hasLiked) {
        listing.likes.pull(userId);
    } else {
        listing.likes.addToSet(userId);
    }

    await listing.save();

    const safeRedirect = getSafeRedirectPath(req.body.redirect, `/listings/${id}`);
    res.redirect(safeRedirect);
};

module.exports.addBlockedRange = async (req, res) => {
    const { id } = req.params;
    const listing = await Listing.findById(id);

    if (!listing) {
        req.flash("error", "Listing not found.");
        return res.redirect("/listings");
    }

    listing.unavailableRanges.push({
        startDate: req.body.block.startDate,
        endDate: req.body.block.endDate,
        reason: req.body.block.reason || "Host blocked dates",
    });

    await listing.save();
    req.flash("success", "Dates blocked successfully.");
    res.redirect(`/listings/${id}#host-tools`);
};

module.exports.addSeasonalPrice = async (req, res) => {
    const { id } = req.params;
    const listing = await Listing.findById(id);

    if (!listing) {
        req.flash("error", "Listing not found.");
        return res.redirect("/listings");
    }

    listing.seasonalPricing.push({
        label: req.body.pricing.label || "Seasonal pricing",
        startDate: req.body.pricing.startDate,
        endDate: req.body.pricing.endDate,
        nightlyPrice: req.body.pricing.nightlyPrice,
    });

    await listing.save();
    req.flash("success", "Seasonal pricing saved.");
    res.redirect(`/listings/${id}#host-tools`);
};

module.exports.reportListing = async (req, res) => {
    const listing = await Listing.findById(req.params.id);

    if (!listing) {
        req.flash("error", "Listing not found.");
        return res.redirect("/listings");
    }

    await Report.create({
        reporter: req.user._id,
        listing: listing._id,
        reason: req.body.report.reason,
        details: req.body.report.details || "",
    });

    req.flash("success", "Listing report submitted for moderation.");
    res.redirect(`/listings/${listing._id}`);
};

module.exports.createBookingOrder = async (req, res) => {
    if (!getRazorpayAvailability()) {
        return res.status(503).json({ message: "Razorpay is not configured on the server yet." });
    }

    const { id } = req.params;
    const listing = await Listing.findById(id).populate("owner");
    const bookingRestrictionMessage = ensureBookingAllowed(listing, req.user._id);

    if (bookingRestrictionMessage) {
        return res.status(400).json({ message: bookingRestrictionMessage });
    }

    const baseQuote = getBookingQuote(listing, req.body.booking);
    if (baseQuote.error) {
        return res.status(400).json({ message: baseQuote.error });
    }

    const quote = await attachCouponToQuote(baseQuote, req.body.booking?.couponCode);
    if (quote.error) {
        return res.status(400).json({ message: quote.error });
    }

    if (quote.amountInPaise <= 0) {
        return res.status(400).json({ message: "Coupon discount is too high for online checkout." });
    }

    if (getBookingConflict(listing, quote.startDate, quote.endDate)) {
        return res.status(409).json({ message: "Those dates are already blocked for this listing." });
    }

    const receipt = `ls${String(id).slice(-6)}${Date.now().toString().slice(-8)}`;
    const order = await razorpay.orders.create({
        amount: quote.amountInPaise,
        currency: quote.currency,
        receipt,
        notes: {
            listingId: String(id),
            userId: String(req.user._id),
        },
    });

    const pendingOrders = ensurePendingOrders(req);
    pendingOrders[order.id] = {
        listingId: String(id),
        userId: String(req.user._id),
        startDate: quote.startDate.toISOString(),
        endDate: quote.endDate.toISOString(),
        nights: quote.nights,
        totalPrice: quote.totalPrice,
        payableTotal: quote.payableTotal,
        amountInPaise: quote.amountInPaise,
        currency: quote.currency,
        cancellationPolicy: listing.cancellationPolicy,
        coupon: quote.coupon,
    };
    await saveSession(req);

    res.json({
        keyId: razorpayKeyId,
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        nights: quote.nights,
        totalPrice: quote.totalPrice,
        payableTotal: quote.payableTotal,
        discountAmount: quote.coupon.discountAmount,
        couponCode: quote.coupon.code,
        listingTitle: listing.title,
        user: {
            name: req.user.username || "",
            email: req.user.email || "",
        },
    });
};

module.exports.verifyBookingPayment = async (req, res) => {
    if (!getRazorpayAvailability()) {
        return res.status(503).json({ message: "Razorpay is not configured on the server yet." });
    }

    const { id } = req.params;
    const {
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: signature,
    } = req.body;

    if (!orderId || !paymentId || !signature) {
        return res.status(400).json({ message: "Payment verification payload is incomplete." });
    }

    const pendingOrders = ensurePendingOrders(req);
    const pendingBooking = pendingOrders[orderId];

    if (!pendingBooking) {
        return res.status(400).json({ message: "This payment session has expired. Please try booking again." });
    }

    if (pendingBooking.listingId !== String(id) || pendingBooking.userId !== String(req.user._id)) {
        await deletePendingOrder(req, orderId);
        return res.status(403).json({ message: "This payment does not belong to the current booking request." });
    }

    const expectedSignature = crypto
        .createHmac("sha256", razorpayKeySecret)
        .update(`${orderId}|${paymentId}`)
        .digest("hex");

    if (expectedSignature !== signature) {
        await deletePendingOrder(req, orderId);
        return res.status(400).json({ message: "Payment signature verification failed." });
    }

    const listing = await Listing.findById(id).populate("owner");
    const bookingRestrictionMessage = ensureBookingAllowed(listing, req.user._id);

    if (bookingRestrictionMessage) {
        await deletePendingOrder(req, orderId);
        return res.status(400).json({ message: bookingRestrictionMessage });
    }

    const startDate = new Date(pendingBooking.startDate);
    const endDate = new Date(pendingBooking.endDate);

    if (getBookingConflict(listing, startDate, endDate)) {
        await deletePendingOrder(req, orderId);
        return res.status(409).json({ message: "Those dates were booked while payment was in progress." });
    }

    listing.bookings.push({
        startDate,
        endDate,
        guest: req.user._id,
        nights: pendingBooking.nights,
        totalPrice: pendingBooking.payableTotal || pendingBooking.totalPrice,
        cancellation: {
            policy: pendingBooking.cancellationPolicy || listing.cancellationPolicy,
            refundPercent: 0,
            refundAmount: 0,
            note: "",
        },
        payment: {
            orderId,
            paymentId,
            signature,
            amount: pendingBooking.amountInPaise,
            currency: pendingBooking.currency,
            status: "paid",
            paidAt: new Date(),
        },
        coupon: pendingBooking.coupon || {},
    });

    await listing.save();
    await deletePendingOrder(req, orderId);

    const guestEmail = req.user?.email || "";
    const hostEmail = listing.owner?.email || "";
    const stayLabel = `${listing.title} from ${startDate.toLocaleDateString("en-IN")} to ${endDate.toLocaleDateString("en-IN")}`;
    await Promise.allSettled([
        (() => {
            const email = buildSimpleEmail({
                title: "Booking confirmed",
                intro: `Your booking for ${listing.title} is confirmed.`,
                lines: [
                    `Check-in: ${startDate.toLocaleDateString("en-IN")}`,
                    `Check-out: ${endDate.toLocaleDateString("en-IN")}`,
                    `Amount: Rs. ${Number(pendingBooking.payableTotal || pendingBooking.totalPrice || 0).toLocaleString("en-IN")}`,
                ],
            });
            return sendEmail({
            to: guestEmail,
            subject: "UrbanStay booking confirmed",
            html: email.html,
            text: email.text,
        });
        })(),
        (() => {
            const email = buildSimpleEmail({
                title: "New reservation",
                intro: `A new reservation for ${listing.title} has been confirmed.`,
                lines: [
                    `Guest: ${req.user?.username || "Guest"}`,
                    `Dates: ${startDate.toLocaleDateString("en-IN")} to ${endDate.toLocaleDateString("en-IN")}`,
                ],
            });
            return sendEmail({
            to: hostEmail,
            subject: "New UrbanStay reservation",
            html: email.html,
            text: email.text,
        });
        })(),
    ]);
    await Promise.allSettled([
        createNotification({
            user: req.user._id,
            title: "Booking confirmed",
            body: `${listing.title} has been confirmed.`,
            type: "booking",
            link: "/profile",
        }),
        createNotification({
            user: listing.owner?._id,
            title: "New reservation",
            body: `${req.user?.username || "A guest"} booked ${listing.title}.`,
            type: "booking",
            link: "/profile",
        }),
    ]);

    req.flash("success", "Payment verified and booking confirmed.");
    res.json({
        redirectUrl: `/listings/${id}#booking-card`,
    });
};

module.exports.cancelBooking = async (req, res) => {
    const { id, bookingId } = req.params;
    const listing = await Listing.findById(id).populate("owner").populate("bookings.guest");

    if (!listing) {
        req.flash("error", "Listing not found.");
        return res.redirect("/profile");
    }

    const booking = listing.bookings.id(bookingId);
    if (!booking || !isBookingActive(booking)) {
        req.flash("error", "Booking not found or already cancelled.");
        return res.redirect("/profile");
    }

    if (!canManageBooking(booking, req.user._id, listing.owner?._id)) {
        req.flash("error", "You do not have permission to cancel this booking.");
        return res.redirect("/profile");
    }

    const cancelledBy = String(req.user._id) === String(listing.owner?._id) ? "host" : "guest";
    const refundDetails = getRefundDetails(booking, cancelledBy);

    booking.status = "cancelled";
    booking.cancelledAt = new Date();
    booking.cancelledBy = cancelledBy;
    booking.cancellation = refundDetails;
    booking.payment.status = refundDetails.refundPercent > 0 ? "refund_pending" : booking.payment.status;

    await listing.save();
    await Promise.allSettled([
        (() => {
            const email = buildSimpleEmail({
                title: "Booking cancelled",
                intro: `Your booking for ${listing.title} has been cancelled.`,
                lines: [refundDetails.note],
            });
            return sendEmail({
            to: booking.guest?.email || "",
            subject: "UrbanStay booking cancelled",
            html: email.html,
            text: email.text,
        });
        })(),
        (() => {
            const email = buildSimpleEmail({
                title: "Cancellation update",
                intro: `A booking for ${listing.title} has been cancelled.`,
                lines: [refundDetails.note],
            });
            return sendEmail({
            to: listing.owner?.email || "",
            subject: "UrbanStay cancellation update",
            html: email.html,
            text: email.text,
        });
        })(),
    ]);
    await Promise.allSettled([
        createNotification({
            user: booking.guest?._id,
            title: "Booking cancelled",
            body: `${listing.title}: ${refundDetails.note}`,
            type: "booking",
            link: "/profile",
        }),
        createNotification({
            user: listing.owner?._id,
            title: "Cancellation update",
            body: `${listing.title}: ${refundDetails.note}`,
            type: "booking",
            link: "/profile",
        }),
    ]);
    req.flash("success", `Booking cancelled. ${refundDetails.note}`);
    res.redirect("/profile");
};

module.exports.downloadInvoice = async (req, res) => {
    const { id, bookingId } = req.params;
    const listing = await Listing.findById(id).populate("owner").populate("bookings.guest");

    if (!listing) {
        req.flash("error", "Listing not found.");
        return res.redirect("/profile");
    }

    const booking = listing.bookings.id(bookingId);
    if (!booking) {
        req.flash("error", "Booking not found.");
        return res.redirect("/profile");
    }

    if (!canAccessBookingInvoice(booking, req.user._id, listing.owner?._id, req.user?.isAdmin)) {
        req.flash("error", "You do not have access to this invoice.");
        return res.redirect("/profile");
    }

    const lines = [
        "UrbanStay Invoice",
        `Listing: ${listing.title}`,
        `Guest: ${booking.guest?.username || "Guest"}`,
        `Dates: ${new Date(booking.startDate).toLocaleDateString("en-IN")} to ${new Date(booking.endDate).toLocaleDateString("en-IN")}`,
        `Nights: ${booking.nights}`,
        `Total: Rs. ${Number(booking.totalPrice || 0).toLocaleString("en-IN")}`,
        `Payment status: ${booking.payment?.status || "paid"}`,
        `Order ID: ${booking.payment?.orderId || "-"}`,
        `Payment ID: ${booking.payment?.paymentId || "-"}`,
        `Coupon: ${booking.coupon?.code || "None"}`,
    ];

    const buffer = buildInvoicePdf(lines);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="urbanstay-invoice-${bookingId}.pdf"`);
    res.send(buffer);
};

module.exports.createBooking = async (req, res) => {
    if (getRazorpayAvailability()) {
        req.flash("error", "Please use the Razorpay checkout button to complete payment first.");
        return res.redirect(`/listings/${req.params.id}#booking-card`);
    }

    const { id } = req.params;
    const listing = await Listing.findById(id).populate("owner");
    const bookingRestrictionMessage = ensureBookingAllowed(listing, req.user._id);

    if (bookingRestrictionMessage) {
        req.flash("error", bookingRestrictionMessage);
        return res.redirect(`/listings/${id}`);
    }

    const baseQuote = getBookingQuote(listing, req.body.booking);
    if (baseQuote.error) {
        req.flash("error", baseQuote.error);
        return res.redirect(`/listings/${id}`);
    }

    const quote = await attachCouponToQuote(baseQuote, req.body.booking?.couponCode);
    if (quote.error) {
        req.flash("error", quote.error);
        return res.redirect(`/listings/${id}`);
    }

    if (getBookingConflict(listing, quote.startDate, quote.endDate)) {
        req.flash("error", "Those dates are already blocked for this listing.");
        return res.redirect(`/listings/${id}`);
    }

    listing.bookings.push({
        startDate: quote.startDate,
        endDate: quote.endDate,
        guest: req.user._id,
        nights: quote.nights,
        totalPrice: quote.payableTotal,
        cancellation: {
            policy: listing.cancellationPolicy,
            refundPercent: 0,
            refundAmount: 0,
            note: "",
        },
        payment: {
            amount: quote.amountInPaise,
            currency: quote.currency,
            status: "manual",
            paidAt: new Date(),
        },
        coupon: quote.coupon || {},
    });

    await listing.save();
    await Promise.allSettled([
        (() => {
            const email = buildSimpleEmail({
                title: "Booking saved",
                intro: `Your booking request for ${listing.title} has been saved.`,
                lines: [`Amount: Rs. ${Number(quote.payableTotal || 0).toLocaleString("en-IN")}`],
            });
            return sendEmail({
            to: req.user?.email || "",
            subject: "UrbanStay booking saved",
            html: email.html,
            text: email.text,
        });
        })(),
        (() => {
            const email = buildSimpleEmail({
                title: "Manual booking created",
                intro: `A manual booking for ${listing.title} has been created.`,
                lines: [`Guest: ${req.user?.username || "Guest"}`],
            });
            return sendEmail({
            to: listing.owner?.email || "",
            subject: "UrbanStay manual booking created",
            html: email.html,
            text: email.text,
        });
        })(),
    ]);
    await Promise.allSettled([
        createNotification({
            user: req.user._id,
            title: "Booking saved",
            body: `${listing.title} has been saved to your trips.`,
            type: "booking",
            link: "/profile",
        }),
        createNotification({
            user: listing.owner?._id,
            title: "Manual booking created",
            body: `${req.user?.username || "A guest"} booked ${listing.title}.`,
            type: "booking",
            link: "/profile",
        }),
    ]);

    req.flash("success", "Booking saved.");
    res.redirect(`/listings/${id}#booking-card`);
};

module.exports.destroyListing = async (req, res) => {
    const { id } = req.params;
    await Listing.findByIdAndDelete(id);
    req.flash("success", "Listing deleted successfully.");
    res.redirect("/listings");
};
