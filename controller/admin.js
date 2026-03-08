const Listing = require("../models/listing");
const Review = require("../models/review");
const User = require("../models/user");
const Report = require("../models/report");
const Coupon = require("../models/coupon");
const AuditLog = require("../models/auditLog");
const { createNotification } = require("../utils/notifications");

const logAdminAction = async (actor, action, entityType, entityId, details = "") =>
    AuditLog.create({
        actor,
        action,
        entityType,
        entityId: String(entityId || ""),
        details,
    });

module.exports.dashboard = async (req, res) => {
    const [reports, users, listings, coupons, totalListings, totalUsers, auditLogs, allRefundListings] = await Promise.all([
        Report.find({})
            .populate("reporter")
            .populate("listing")
            .populate({
                path: "review",
                populate: {
                    path: "author",
                },
            })
            .sort({ createdAt: -1 }),
        User.find({}).sort({ createdAt: -1 }),
        Listing.find({}).populate("owner").sort({ createdAt: -1 }).limit(20),
        Coupon.find({}).sort({ createdAt: -1 }),
        Listing.countDocuments({}),
        User.countDocuments({}),
        AuditLog.find({}).populate("actor").sort({ createdAt: -1 }).limit(20),
        Listing.find({ "bookings.payment.refundStatus": { $in: ["pending", "processing"] } }).populate("bookings.guest"),
    ]);

    const refunds = allRefundListings.flatMap((listing) =>
        (listing.bookings || [])
            .filter((booking) => ["pending", "processing"].includes(booking.payment?.refundStatus))
            .map((booking) => ({
                listingId: listing._id,
                bookingId: booking._id,
                listingTitle: listing.title,
                guestName: booking.guest?.username || "Guest",
                totalPrice: booking.totalPrice || 0,
                refundStatus: booking.payment?.refundStatus || "pending",
                refundAdminNote: booking.payment?.refundAdminNote || "",
            }))
    );

    res.render("./admin/dashboard.ejs", {
        reports,
        users,
        listings,
        coupons,
        refunds,
        auditLogs,
        stats: {
            openReports: reports.filter((report) => report.status === "open").length,
            totalUsers,
            totalListings,
            activeCoupons: coupons.filter((coupon) => coupon.active).length,
        },
    });
};

module.exports.createCoupon = async (req, res) => {
    const payload = req.body.coupon || {};
    await Coupon.create({
        code: payload.code,
        description: payload.description || "",
        discountType: payload.discountType,
        discountValue: payload.discountValue,
        minBookingAmount: payload.minBookingAmount || 0,
        maxDiscountAmount: payload.maxDiscountAmount || 0,
        expiresAt: payload.expiresAt || null,
        active: payload.active !== "false",
        createdBy: req.user._id,
    });

    req.flash("success", "Coupon created.");
    await logAdminAction(req.user._id, "create_coupon", "coupon", payload.code, payload.description || "");
    res.redirect("/admin#coupons");
};

module.exports.updateReportStatus = async (req, res) => {
    await Report.findByIdAndUpdate(req.params.reportId, {
        status: req.body.status || "reviewed",
    });

    req.flash("success", "Report updated.");
    await logAdminAction(req.user._id, "update_report_status", "report", req.params.reportId, req.body.status || "reviewed");
    res.redirect("/admin#reports");
};

module.exports.removeListing = async (req, res) => {
    await Listing.findByIdAndDelete(req.params.listingId);
    req.flash("success", "Listing removed.");
    await logAdminAction(req.user._id, "remove_listing", "listing", req.params.listingId, "Listing deleted from admin panel");
    res.redirect("/admin#listings");
};

module.exports.removeReview = async (req, res) => {
    const review = await Review.findById(req.params.reviewId);
    if (review) {
        const affectedListings = await Listing.find({ reviews: review._id }).select("_id reviews");
        await Listing.updateMany({ reviews: review._id }, { $pull: { reviews: review._id } });
        await Review.findByIdAndDelete(review._id);

        await Promise.all(affectedListings.map(async (listing) => {
            const refreshedListing = await Listing.findById(listing._id).select("reviews reviewCount ratingAverage");
            const [stats] = await Review.aggregate([
                {
                    $match: {
                        _id: {
                            $in: refreshedListing.reviews,
                        },
                    },
                },
                {
                    $group: {
                        _id: null,
                        reviewCount: { $sum: 1 },
                        ratingAverage: { $avg: "$rating" },
                    },
                },
            ]);

            refreshedListing.reviewCount = stats?.reviewCount || 0;
            refreshedListing.ratingAverage = stats?.ratingAverage ? Number(stats.ratingAverage.toFixed(1)) : 0;
            await refreshedListing.save();
        }));
    }

    req.flash("success", "Review removed.");
    await logAdminAction(req.user._id, "remove_review", "review", req.params.reviewId, "Review deleted from admin panel");
    res.redirect("/admin#reports");
};

module.exports.toggleHostVerification = async (req, res) => {
    const user = await User.findById(req.params.userId);
    if (!user) {
        req.flash("error", "User not found.");
        return res.redirect("/admin#users");
    }

    user.hostProfile = user.hostProfile || {};
    user.hostProfile.isVerified = !user.hostProfile.isVerified;
    await user.save();

    req.flash("success", "Host verification updated.");
    await logAdminAction(req.user._id, "toggle_host_verification", "user", user._id, `Verified=${user.hostProfile.isVerified}`);
    res.redirect("/admin#users");
};

module.exports.updateRefundStatus = async (req, res) => {
    const { listingId, bookingId } = req.params;
    const listing = await Listing.findById(listingId).populate("bookings.guest");

    if (!listing) {
        req.flash("error", "Listing not found.");
        return res.redirect("/admin#refunds");
    }

    const booking = listing.bookings.id(bookingId);
    if (!booking) {
        req.flash("error", "Booking not found.");
        return res.redirect("/admin#refunds");
    }

    booking.payment.refundStatus = req.body.refundStatus || "processing";
    booking.payment.refundAdminNote = req.body.refundAdminNote || "";
    booking.payment.refundProcessedAt = ["completed", "rejected"].includes(booking.payment.refundStatus) ? new Date() : null;
    await listing.save();

    await createNotification({
        user: booking.guest?._id,
        title: "Refund status updated",
        body: `${listing.title}: ${booking.payment.refundStatus}`,
        type: "refund",
        link: "/profile",
    });
    await logAdminAction(req.user._id, "update_refund_status", "booking", bookingId, booking.payment.refundStatus);

    req.flash("success", "Refund workflow updated.");
    res.redirect("/admin#refunds");
};

module.exports.toggleListingVisibility = async (req, res) => {
    const listing = await Listing.findById(req.params.listingId);
    if (!listing) {
        req.flash("error", "Listing not found.");
        return res.redirect("/admin#listings");
    }

    listing.isActive = !listing.isActive;
    listing.suspendedReason = req.body.reason || "";
    await listing.save();

    await logAdminAction(req.user._id, "toggle_listing_visibility", "listing", listing._id, `Active=${listing.isActive}`);
    req.flash("success", "Listing visibility updated.");
    res.redirect("/admin#listings");
};

module.exports.toggleUserSuspension = async (req, res) => {
    const user = await User.findById(req.params.userId);
    if (!user) {
        req.flash("error", "User not found.");
        return res.redirect("/admin#users");
    }

    user.isSuspended = !user.isSuspended;
    await user.save();

    await createNotification({
        user: user._id,
        title: user.isSuspended ? "Account suspended" : "Account restored",
        body: user.isSuspended ? "Your UrbanStay account has been suspended." : "Your UrbanStay account has been restored.",
        type: "admin",
        link: "/profile",
    });
    await logAdminAction(req.user._id, "toggle_user_suspension", "user", user._id, `Suspended=${user.isSuspended}`);

    req.flash("success", "User suspension updated.");
    res.redirect("/admin#users");
};
