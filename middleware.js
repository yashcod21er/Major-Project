const Listing = require("./models/listing");
const Review = require("./models/review");
const ExpressError = require("./public/utils/ExpressError");

module.exports.isLoggedIn = (req, res, next) => {
    if(!req.isAuthenticated()) {
        req.session.redirectTo = req.originalUrl;
        req.flash("error", "You must be signed in to do that!");
        return res.redirect('/login');
    }   
    next();
}

module.exports.saveRedirectUrl = (req, res, next) => {
    if(req.session.redirectTo) {
        res.locals.redirectUrl = req.session.redirectTo;
    }       
    next();
}

module.exports.isOwner = async (req, res, next) => {
    let {id} = req.params;
    let listing = await Listing.findById(id);

    if (!listing) {
        req.flash("error", "Listing not found!");
        return res.redirect("/listings");
    }

    if(!listing.owner || !listing.owner.equals(req.user._id)) {
        req.flash("error", "You don't have permission to do that!");
        return res.redirect(`/listings/${id}`);
    }
    next();
}

module.exports.isReviewAuthor = async (req, res, next) => {
    const { id, reviewId } = req.params;
    const review = await Review.findById(reviewId);

    if (!review) {
        req.flash("error", "Review not found!");
        return res.redirect(`/listings/${id}`);
    }

    if (!review.author || !review.author.equals(req.user._id)) {
        req.flash("error", "You don't have permission to delete this review!");
        return res.redirect(`/listings/${id}`);
    }

    next();
};
