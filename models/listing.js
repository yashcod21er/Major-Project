const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const Review = require('./review.js');

const listingSchema = new Schema({
    title: {
        type:String,
        required: true,
    },
    description: String,
    image:{
        filename:{
            type:String,
        },
        url:{
            type:String,
            filename:String,
            default: "https://www.orchidhotel.com/static/website/img/hotels/panchgani/homepage_slider/homepage_slider.webp"
        }
    },
    price: Number,
    location: String,
    country:String,
    reviews:[
        {
            type: Schema.Types.ObjectId,
            ref: "Review",
        }
    ],
    owner:{
        type: Schema.Types.ObjectId,
        ref: "User",
    }
});

listingSchema.post("findOneAndDelete", async (listing)=>{
    await Review.deleteMany({
        reviews:{
        _id: {
            $in: listing.reviews,
        }
    }
    })
})

const Listing = mongoose.model("Listing", listingSchema);
module.exports=Listing;