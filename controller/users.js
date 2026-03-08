const User = require("../models/user");
const Listing = require("../models/listing");
const { sendEmail } = require("../utils/email");
const { buildSimpleEmail } = require("../utils/emailTemplates");

const getCoverImage = (listing) => {
    if (Array.isArray(listing.gallery) && listing.gallery.length) {
        return listing.gallery[0];
    }

    return listing.image;
};

const shouldGrantAdmin = (email) => {
    const adminEmail = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
    return Boolean(adminEmail) && String(email || "").trim().toLowerCase() === adminEmail;
};

const normalizeListingCard = (listing) => ({
    ...listing.toObject(),
    coverImage: getCoverImage(listing),
});

const formatDateLabel = (date) => new Date(date).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
});

module.exports.renderSignupForm = (req, res) => {
    res.render("./users/signup.ejs");
};

module.exports.signup = async (req, res) => {
    try {
        const { username, email, password } = req.body;
        const user = new User({
            username,
            email,
            isAdmin: shouldGrantAdmin(email),
            hostProfile: {
                isVerified: false,
                responseRate: 94,
                responseTime: "within an hour",
            },
        });
        const registeredUser = await User.register(user, password);

        await new Promise((resolve, reject) => {
            req.login(registeredUser, (err) => {
                if (err) return reject(err);
                resolve();
            });
        });

        const welcomeEmail = buildSimpleEmail({
            title: "Welcome to UrbanStay",
            intro: `Hi ${registeredUser.username}, your UrbanStay account is ready.`,
            lines: ["Explore stays", "Save favorites", "Book securely with UrbanStay"],
        });

        await Promise.resolve(sendEmail({
            to: registeredUser.email,
            subject: "Welcome to UrbanStay",
            html: welcomeEmail.html,
            text: welcomeEmail.text,
        })).catch(() => {});

        req.flash("success", "Welcome to UrbanStay.");
        const redirectUrl = req.session.redirectTo || "/listings";
        delete req.session.redirectTo;
        return res.redirect(redirectUrl);
    } catch (error) {
        req.flash("error", error.message);
        return res.redirect("/user/signup");
    }
};

module.exports.renderLoginForm = (req, res) => {
    res.render("./users/login.ejs");
};

module.exports.login = async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        req.flash("error", "Email and password are required.");
        return res.redirect("/login");
    }

    const user = await User.findOne({ email }).select("+hash +salt");
    if (!user) {
        req.flash("error", "Invalid email or password.");
        return res.redirect("/login");
    }

    const { user: authenticatedUser } = await user.authenticate(password);
    if (!authenticatedUser) {
        req.flash("error", "Invalid email or password.");
        return res.redirect("/login");
    }

    if (authenticatedUser.isSuspended) {
        req.flash("error", "Your account is suspended. Contact support for help.");
        return res.redirect("/login");
    }

    await new Promise((resolve, reject) => {
        req.login(authenticatedUser, (err) => {
            if (err) return reject(err);
            resolve();
        });
    });

    if (shouldGrantAdmin(authenticatedUser.email) && !authenticatedUser.isAdmin) {
        authenticatedUser.isAdmin = true;
        await authenticatedUser.save();
    }

    req.flash("success", "Welcome back.");
    const redirectUrl = res.locals.redirectUrl || "/listings";
    if (req.session.redirectTo) {
        delete req.session.redirectTo;
    }
    return res.redirect(redirectUrl);
};

module.exports.profile = async (req, res) => {
    const userId = req.user._id;
    const recentlyViewedIds = Array.isArray(req.session.recentlyViewedListings) ? req.session.recentlyViewedListings : [];

    const [currentUser, ownedListings, wishlistListings, bookedListings, recentlyViewedListings] = await Promise.all([
        User.findById(userId),
        Listing.find({ owner: userId }).sort({ createdAt: -1, _id: -1 }).populate("owner").populate("bookings.guest"),
        Listing.find({ likes: userId }).sort({ createdAt: -1, _id: -1 }).populate("owner"),
        Listing.find({ "bookings.guest": userId }).sort({ createdAt: -1, _id: -1 }).populate("owner"),
        Listing.find({ _id: { $in: recentlyViewedIds } }).populate("owner"),
    ]);

    const stats = ownedListings.reduce(
        (accumulator, listing) => {
            accumulator.totalListings += 1;
            accumulator.totalLikes += Array.isArray(listing.likes) ? listing.likes.length : 0;
            accumulator.totalReviews += listing.reviewCount || 0;
            accumulator.totalRating += (listing.ratingAverage || 0) * (listing.reviewCount || 0);
            return accumulator;
        },
        {
            totalListings: 0,
            totalLikes: 0,
            totalReviews: 0,
            totalRating: 0,
        }
    );

    const hostReservations = ownedListings.flatMap((listing) =>
        (listing.bookings || []).map((booking) => ({
            bookingId: booking._id,
            listingId: listing._id,
            listingTitle: listing.title,
            guestName: booking.guest?.username || "Guest",
            startDate: booking.startDate,
            endDate: booking.endDate,
            totalPrice: booking.totalPrice || 0,
            paymentStatus: booking.payment?.status || "manual",
            paymentId: booking.payment?.paymentId || "",
            orderId: booking.payment?.orderId || "",
            status: booking.status || "confirmed",
            refundNote: booking.cancellation?.note || "",
        }))
    ).sort((left, right) => new Date(left.startDate) - new Date(right.startDate));

    const paymentHistory = hostReservations
        .filter((reservation) => reservation.orderId || reservation.paymentId || reservation.totalPrice)
        .sort((left, right) => new Date(right.startDate) - new Date(left.startDate));

    const earnings = hostReservations
        .filter((reservation) => reservation.status === "confirmed")
        .reduce((sum, reservation) => sum + Number(reservation.totalPrice || 0), 0);

    const averageRating = stats.totalReviews ? Number((stats.totalRating / stats.totalReviews).toFixed(1)) : 0;

    const normalizedOwnedListings = ownedListings.map(normalizeListingCard);
    const normalizedWishlist = wishlistListings.map(normalizeListingCard);
    const normalizedRecentlyViewed = recentlyViewedListings
        .sort((left, right) => recentlyViewedIds.indexOf(String(left._id)) - recentlyViewedIds.indexOf(String(right._id)))
        .map(normalizeListingCard);

    const recentTrips = bookedListings.flatMap((listing) => {
        const matchingBookings = (listing.bookings || []).filter((booking) => String(booking.guest) === String(userId));

        return matchingBookings.map((booking) => ({
            bookingId: booking._id,
            startDate: booking.startDate,
            endDate: booking.endDate,
            listingId: listing._id,
            title: listing.title,
            location: listing.location,
            country: listing.country,
            coverImage: getCoverImage(listing),
            totalPrice: booking.totalPrice || 0,
            status: booking.status || "confirmed",
            paymentStatus: booking.payment?.status || "manual",
            paymentId: booking.payment?.paymentId || "",
        }));
    }).sort((left, right) => new Date(left.startDate) - new Date(right.startDate));

    res.render("./users/profile.ejs", {
        currentUserProfile: currentUser,
        ownedListings: normalizedOwnedListings,
        wishlistListings: normalizedWishlist,
        recentTrips,
        hostReservations,
        paymentHistory,
        recentlyViewedListings: normalizedRecentlyViewed,
        savedSearches: currentUser?.savedSearches || [],
        stats: {
            totalListings: stats.totalListings,
            totalLikes: stats.totalLikes,
            totalReviews: stats.totalReviews,
            averageRating,
            totalEarnings: earnings,
            totalReservations: hostReservations.length,
        },
        formatDateLabel,
    });
};

module.exports.wishlist = async (req, res) => {
    const wishlistListings = await Listing.find({ likes: req.user._id })
        .sort({ createdAt: -1, _id: -1 })
        .populate("owner");

    res.render("./users/wishlist.ejs", {
        wishlistListings: wishlistListings.map(normalizeListingCard),
    });
};

module.exports.saveSearch = async (req, res) => {
    const user = await User.findById(req.user._id);
    if (!user) {
        req.flash("error", "User not found.");
        return res.redirect("/listings");
    }

    const payload = req.body.search || {};
    const generatedLabelParts = [payload.category, payload.location || payload.country || payload.q].filter(Boolean);
    const label = payload.label?.trim() || generatedLabelParts.join(" in ") || "Saved search";

    user.savedSearches.unshift({
        label,
        q: payload.q || "",
        sort: payload.sort || "newest",
        category: payload.category || "all",
        country: payload.country || "",
        location: payload.location || "",
        minPrice: Number(payload.minPrice || 0),
        maxPrice: Number(payload.maxPrice || 0),
        alertsEnabled: payload.alertsEnabled !== "false",
    });

    user.savedSearches = user.savedSearches.slice(0, 10);
    await user.save();

    req.flash("success", "Search saved to your profile.");
    res.redirect("/profile#saved-searches");
};

module.exports.deleteSavedSearch = async (req, res) => {
    const user = await User.findById(req.user._id);
    if (!user) {
        req.flash("error", "User not found.");
        return res.redirect("/profile");
    }

    user.savedSearches = user.savedSearches.filter((search) => String(search._id) !== String(req.params.searchId));
    await user.save();

    req.flash("success", "Saved search removed.");
    res.redirect("/profile#saved-searches");
};

module.exports.logout = async (req, res) => {
    await new Promise((resolve, reject) => {
        req.logout((err) => {
            if (err) return reject(err);
            resolve();
        });
    });

    req.flash("success", "You have logged out successfully.");
    return res.redirect("/listings");
};
