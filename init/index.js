if (process.env.NODE_ENV !== "production") {
    require("dotenv").config();
}

const dns = require("dns");
const mongoose = require("mongoose");
const initdata = require("./data.js");
const Listing = require("../models/listing.js");
const User = require("../models/user.js");

const atlasDbUrl = (process.env.ATLAS_URI || "").trim();
const localDbUrl = (process.env.LOCAL_MONGODB_URI || "mongodb://127.0.0.1:27017/Urbanstay").trim();
const isProduction = process.env.NODE_ENV === "production";
const demoOwnerEmail = (process.env.SEED_OWNER_EMAIL || "demo-owner@urbanstay.dev").trim();
const demoOwnerUsername = (process.env.SEED_OWNER_USERNAME || "demoowner").trim();
const demoOwnerPassword = (process.env.SEED_OWNER_PASSWORD || "UrbanStay123!").trim();
const DEFAULT_AMENITIES = ["Wi-Fi", "Pool", "Parking", "AC", "Kitchen", "Workspace", "Pets allowed"];
const mongoDnsServers = String(process.env.MONGODB_DNS_SERVERS || "8.8.8.8,1.1.1.1")
    .split(",")
    .map((server) => server.trim())
    .filter(Boolean);

const configureMongoDns = (dbUrl) => {
    if (!dbUrl.startsWith("mongodb+srv://") || !mongoDnsServers.length) {
        return;
    }

    dns.setServers(mongoDnsServers);
};

const formatMongoConnectionError = (error) => {
    const message = String(error?.message || "").trim();

    if (/whitelist/i.test(message) || /IP that isn't whitelisted/i.test(message)) {
        return `MongoDB Atlas rejected this connection because the current IP address is not allowed. Add your current IP in Atlas Network Access and try again. Original error: ${message}`;
    }

    if (/query(?:Srv|Txt)\s+(?:ESERVFAIL|ENOTFOUND)/i.test(message)) {
        return `MongoDB DNS lookup failed for the Atlas cluster. Verify that your cluster is active (not paused/deleted in MongoDB Atlas), check the hostname in ATLAS_URI, or set MONGODB_DNS_SERVERS in .env. Original error: ${message}`;
    }

    return `MongoDB connection failed: ${message || "Unknown error."}`;
};

async function connectDatabase() {
    if (!atlasDbUrl && !localDbUrl) {
        throw new Error("No MongoDB connection string is configured.");
    }

    if (atlasDbUrl) {
        try {
            configureMongoDns(atlasDbUrl);
            await mongoose.connect(atlasDbUrl, { serverSelectionTimeoutMS: 10000 });
            console.log(`Connected to MongoDB via Atlas (${mongoose.connection.db.databaseName})`);
            return;
        } catch (error) {
            const formattedError = formatMongoConnectionError(error);
            const canFallbackToLocal = !isProduction && Boolean(localDbUrl);

            if (!canFallbackToLocal) {
                throw new Error(formattedError);
            }

            console.warn(`${formattedError}\nFalling back to local MongoDB for development.`);
            await mongoose.disconnect().catch(() => {});
        }
    }

    await mongoose.connect(localDbUrl, { serverSelectionTimeoutMS: 10000 });
    console.log(`Connected to MongoDB via local MongoDB (${mongoose.connection.db.databaseName})`);
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
    await connectDatabase();

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
