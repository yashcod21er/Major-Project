const Listing = require('../models/listing');
const ExpressError = require('../public/utils/ExpressError.js');

module.exports.index = async(req, res) => {
    const searchQuery = (req.query.q || "").trim();
    const query = {};

    if (searchQuery) {
        const regex = new RegExp(searchQuery, "i");
        query.$or = [
            { title: regex },
            { location: regex },
            { country: regex }
        ];
    }

    let listings =  await Listing.find(query)
    // console.log(chats);
    res.render('./listings/index.ejs', {listings, searchQuery});  
}

module.exports.renderNewForm = (req, res) => {
    res.render('./listings/new.ejs');
}

module.exports.createListing = async (req, res, next) => {
    if(!req.body.listing) {
        throw new ExpressError(400, 'Invalid Listing Data');
    }
    const listing = new Listing(req.body.listing);
    listing.owner = req.user._id;
    await listing.save();
    req.flash("success", "New Listing Created!");
    console.log(listing)
    res.redirect('/listings');
    
}

module.exports.renderEditForm = async (req, res) => {
     const {id} = req.params;
    const listing = await Listing.findById(id)
    if(!listing) {
        req.flash("error", "Listing Not Found!");
        return res.redirect('/listings');
    }
   
    res.render('./listings/edit.ejs', {listing});
}

module.exports.editListing = async (req, res) => {
    const { id } = req.params;

    const listing = await Listing.findById(id);
    if (!listing) {
        req.flash("error", "Listing Not Found!");
        return res.redirect("/listings");
    }

    listing.title = req.body.listing.title;
    listing.description = req.body.listing.description;
    listing.price = req.body.listing.price;
    listing.location = req.body.listing.location;
    listing.country = req.body.listing.country;

    // ✅ SAFE image update
    if (req.body.listing.image?.url?.trim()) {
        listing.image = {
            url: req.body.listing.image.url,
            filename: req.body.listing.image.filename || listing.image.filename
        };
    }

    await listing.save();
    req.flash("success", "Listing Updated Successfully!");
    res.redirect(`/listings/${id}`);
}

module.exports.showListing = async (req, res) => {
    const {id} = req.params;
    let listing = await Listing.findById(id)
    .populate({
        path: 'reviews',
        populate: {
            path: 'author'
        }
    })
    .populate('owner');
    if(!listing) {
        req.flash("error", "Listing Not Found!");
        return res.redirect('/listings');
    }
    res.render('./listings/show.ejs', {listing});
}

module.exports.destroyListing = async (req, res) => {
    const {id} = req.params;
    let deletedlisting = await Listing.findByIdAndDelete(id);
    console.log('Chat deleted successfully', deletedlisting);
    req.flash("success", "Listing Deleted Successfully!");
    res.redirect('/listings');
}

