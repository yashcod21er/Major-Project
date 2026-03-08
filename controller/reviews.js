const Review = require("../models/review");
const Listing = require("../models/listing");
const Report = require("../models/report");

const formatUploadedImages = (files = []) => files.map((file) => ({
    filename: file.public_id || file.filename || "",
    url: file.secure_url || file.url || file.path,
}));

const syncListingRatings = async (listingId) => {
    const listing = await Listing.findById(listingId).select("reviews ratingAverage reviewCount");
    if (!listing) {
        return;
    }

    if (!Array.isArray(listing.reviews) || !listing.reviews.length) {
        listing.reviewCount = 0;
        listing.ratingAverage = 0;
        await listing.save();
        return;
    }

    const [stats] = await Review.aggregate([
        {
            $match: {
                _id: {
                    $in: listing.reviews,
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

    listing.reviewCount = stats?.reviewCount || 0;
    listing.ratingAverage = stats?.ratingAverage ? Number(stats.ratingAverage.toFixed(1)) : 0;
    await listing.save();
};

module.exports.createReview = async (req, res) => {
    const { id } = req.params;
    const listing = await Listing.findById(id).populate("owner");

    if (!listing) {
        req.flash("error", "Listing not found.");
        return res.redirect("/listings");
    }

    if (listing.owner && String(listing.owner._id) === String(req.user._id)) {
        req.flash("error", "You cannot review your own listing.");
        return res.redirect(`/listings/${id}`);
    }

    const existingReview = await Review.findOne({
        _id: { $in: listing.reviews },
        author: req.user._id,
    });

    if (existingReview) {
        req.flash("error", "You have already reviewed this listing.");
        return res.redirect(`/listings/${id}`);
    }

    const newReview = new Review(req.body.review);
    newReview.author = req.user._id;
    newReview.images = formatUploadedImages(req.files).slice(0, 3);

    listing.reviews.push(newReview._id);
    await newReview.save();
    await listing.save();
    await syncListingRatings(id);

    req.flash("success", "New review created.");
    res.redirect(`/listings/${id}`);
};

module.exports.updateReview = async (req, res) => {
    const { id, reviewId } = req.params;
    const review = await Review.findById(reviewId);

    if (!review) {
        req.flash("error", "Review not found.");
        return res.redirect(`/listings/${id}`);
    }

    review.rating = req.body.review.rating;
    review.comment = req.body.review.comment;

    const uploadedImages = formatUploadedImages(req.files);
    if (uploadedImages.length) {
        review.images = uploadedImages.slice(0, 3);
    }

    await review.save();
    await syncListingRatings(id);

    req.flash("success", "Review updated.");
    res.redirect(`/listings/${id}#review-${reviewId}`);
};

module.exports.destroyReview = async (req, res) => {
    const { id, reviewId } = req.params;

    await Listing.findByIdAndUpdate(id, { $pull: { reviews: reviewId } });
    await Review.findByIdAndDelete(reviewId);
    await syncListingRatings(id);

    req.flash("success", "Review deleted.");
    res.redirect(`/listings/${id}`);
};

module.exports.reportReview = async (req, res) => {
    const { id, reviewId } = req.params;
    const review = await Review.findById(reviewId);

    if (!review) {
        req.flash("error", "Review not found.");
        return res.redirect(`/listings/${id}`);
    }

    await Report.create({
        reporter: req.user._id,
        listing: id,
        review: review._id,
        reason: req.body.report.reason,
        details: req.body.report.details || "",
    });

    req.flash("success", "Review report submitted for moderation.");
    res.redirect(`/listings/${id}#review-${reviewId}`);
};
