if (process.env.NODE_ENV !== "production") {
    require("dotenv").config();
}

const mongoose = require("mongoose");
const initdata = require("./data.js");
const Listing = require("../models/listing.js");
const User = require("../models/user.js");

const dbUrl = (process.env.ATLAS_URI || "").trim();
const demoOwnerEmail = (process.env.SEED_OWNER_EMAIL || "demo-owner@urbanstay.dev").trim();
const demoOwnerUsername = (process.env.SEED_OWNER_USERNAME || "demoowner").trim();
const demoOwnerPassword = (process.env.SEED_OWNER_PASSWORD || "UrbanStay123!").trim();
const DEFAULT_AMENITIES = ["Wi-Fi", "Pool", "Parking", "AC", "Kitchen", "Workspace", "Pets allowed"];

if (!dbUrl) {
    throw new Error("ATLAS_URI is missing in .env");
}

function buildAmenities(seed, index) {
    const text = `${seed.title || ""} ${seed.location || ""} ${seed.country || ""}`.toLowerCase();
    const amenities = new Set(["Wi-Fi", "Parking", "AC"]);

    if (text.includes("beach") || text.includes("villa") || text.includes("resort") || text.includes("luxury") || index % 3 === 0) {
        amenities.add("Pool");
    }

    if (text.includes("cabin") || text.includes("cottage") || text.includes("home") || text.includes("apartment") || text.includes("loft")) {
        amenities.add("Kitchen");
    }

    if (text.includes("city") || text.includes("loft") || text.includes("workspace") || index % 2 === 0) {
        amenities.add("Workspace");
    }

    if (text.includes("farm") || text.includes("retreat") || text.includes("cabin") || index % 4 === 0) {
        amenities.add("Pets allowed");
    }

    return DEFAULT_AMENITIES.filter((amenity) => amenities.has(amenity));
}

async function ensureOwner() {
    let owner = await User.findOne({ email: demoOwnerEmail });

    if (!owner) {
        owner = new User({
            email: demoOwnerEmail,
            username: demoOwnerUsername,
        });

        owner = await User.register(owner, demoOwnerPassword);
        console.log(`Created demo owner: ${demoOwnerEmail}`);
    } else {
        console.log(`Using existing owner: ${demoOwnerEmail}`);
    }

    return owner;
}

function buildSeedListings(ownerId) {
    return initdata.data.map((listing, index) => ({
        ...listing,
        owner: ownerId,
        isActive: true,
        amenities: Array.isArray(listing.amenities) && listing.amenities.length ? listing.amenities : buildAmenities(listing, index),
        image: Array.isArray(listing.gallery) && listing.gallery.length ? listing.gallery[0] : listing.image,
        gallery: Array.isArray(listing.gallery) ? listing.gallery : (listing.image ? [listing.image] : []),
        reviews: [],
        reviewCount: 0,
        ratingAverage: 0,
        likes: [],
        bookings: [],
    }));
}

async function seedListings(ownerId) {
    const existingListings = await Listing.find({}, { title: 1 }).lean();
    const existingTitles = new Set(existingListings.map((listing) => listing.title));
    const seedListings = buildSeedListings(ownerId);
    const listingsToInsert = seedListings.filter((listing) => !existingTitles.has(listing.title));
    const listingsToUpdate = seedListings.filter((listing) => existingTitles.has(listing.title));

    if (!listingsToInsert.length) {
        console.log("No new sample listings to insert.");
    } else {
        await Listing.insertMany(listingsToInsert);
        console.log(`Inserted ${listingsToInsert.length} sample listings.`);
    }

    let updatedCount = 0;
    for (const listing of listingsToUpdate) {
        const result = await Listing.updateOne(
            { title: listing.title },
            {
                $set: {
                    owner: ownerId,
                    isActive: true,
                    amenities: listing.amenities,
                    image: listing.image,
                    gallery: listing.gallery,
                },
            }
        );

        updatedCount += result.modifiedCount || 0;
    }

    if (updatedCount) {
        console.log(`Updated ${updatedCount} existing listings with room and pool galleries.`);
    }

    return listingsToInsert.length + updatedCount;
}

async function main() {
    await mongoose.connect(dbUrl, { serverSelectionTimeoutMS: 10000 });
    console.log("Connected to MongoDB");

    const owner = await ensureOwner();
    await seedListings(owner._id);

    console.log("Seed completed.");
}

main()
    .catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
    })
    .finally(async () => {
        await mongoose.connection.close();
    });
