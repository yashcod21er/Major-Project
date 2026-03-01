const Review = require("../models/review");
const Listing = require("../models/listing");

module.exports.createReview =async(req,res)=>{
    const {id} = req.params;
    const listing = await Listing.findById(id);
    let newReview = new Review(req.body.review);
    newReview.author = req.user._id;
    listing.reviews.push(newReview);
    await newReview.save();
    await listing.save();
    console.log(newReview);
    req.flash("success", "New Review Created!");
    res.redirect(`/listings/${id}`);
}

module.exports.destroyReview = async(req,res)=>{
    const {id, reviewId} = req.params;
    await Listing.findByIdAndUpdate(id, {$pull: {reviews: reviewId}});
    await Review.findByIdAndDelete(reviewId);
    req.flash("success", "Review Deleted Successfully!");
    res.redirect(`/listings/${id}`);
}