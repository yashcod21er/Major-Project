const crypto = require("crypto");
const User = require("../models/user");
const Listing = require("../models/listing");
const { sendEmail } = require("../utils/email");
const { buildSimpleEmail, buildActionEmail } = require("../utils/emailTemplates");

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

const PASSWORD_RESET_WINDOW_MS = 60 * 60 * 1000;

const createPasswordResetToken = () => crypto.randomBytes(32).toString("hex");

const hashPasswordResetToken = (token) =>
    crypto.createHash("sha256").update(String(token || "")).digest("hex");

const getPasswordResetUrl = (req, token) => `${req.protocol}://${req.get("host")}/reset-password/${token}`;

module.exports.renderSignupForm = (req, res) => {
    res.render("./users/signup.ejs");
};

module.exports.signup = async (req, res) => {
    try {
        const username = String(req.body.username || "").trim();
        const email = String(req.body.email || "").trim().toLowerCase();
        const password = String(req.body.password || "");

        if (!username || !email || !password) {
            req.flash("error", "Username, email, and password are required.");
            return res.redirect("/user/signup");
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            req.flash("error", "That email is already registered. Log in or reset your password.");
            return res.redirect("/user/signup");
        }

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
        if (error?.code === 11000 && error?.keyPattern?.email) {
            req.flash("error", "That email is already registered. Log in or reset your password.");
            return res.redirect("/user/signup");
        }

        req.flash("error", error.message);
        return res.redirect("/user/signup");
    }
};

module.exports.renderLoginForm = (req, res) => {
    res.render("./users/login.ejs");
};

module.exports.renderForgotPasswordForm = (req, res) => {
    res.render("./users/forgotPassword.ejs");
};

module.exports.requestPasswordReset = async (req, res) => {
    const email = String(req.body.email || "").trim().toLowerCase();

    if (!email) {
        req.flash("error", "Enter your account email to continue.");
        return res.redirect("/forgot-password");
    }

    const user = await User.findOne({ email });
    if (user) {
        const token = createPasswordResetToken();
        user.passwordResetTokenHash = hashPasswordResetToken(token);
        user.passwordResetExpiresAt = new Date(Date.now() + PASSWORD_RESET_WINDOW_MS);
        await user.save();

        const resetUrl = getPasswordResetUrl(req, token);
        const passwordResetEmail = buildActionEmail({
            title: "Reset your UrbanStay password",
            intro: `Hi ${user.username || "there"}, use the secure link below to choose a new password for your UrbanStay account.`,
            actionLabel: "Reset password",
            actionUrl: resetUrl,
            outro: "This link expires in 60 minutes. If you did not request this, you can ignore this email.",
        });

        await Promise.resolve(sendEmail({
            to: user.email,
            subject: "Reset your UrbanStay password",
            html: passwordResetEmail.html,
            text: passwordResetEmail.text,
        })).catch(() => {});
    }

    req.flash("success", "If that email is registered, a password reset link has been sent.");
        return res.redirect("/login");
};

module.exports.renderResetPasswordForm = async (req, res) => {
    const tokenHash = hashPasswordResetToken(req.params.token);
    const user = await User.findOne({
        passwordResetTokenHash: tokenHash,
        passwordResetExpiresAt: { $gt: new Date() },
    });

    if (!user) {
        req.flash("error", "That password reset link is invalid or has expired.");
        return res.redirect("/forgot-password");
    }

    return res.render("./users/resetPassword.ejs", { resetToken: req.params.token });
};

module.exports.resetPassword = async (req, res) => {
    const { token } = req.params;
    const password = String(req.body.password || "");
    const confirmPassword = String(req.body.confirmPassword || "");

    if (!password || password.length < 6) {
        req.flash("error", "Password must be at least 6 characters long.");
        return res.redirect(`/reset-password/${token}`);
    }

    if (password !== confirmPassword) {
        req.flash("error", "Password confirmation does not match.");
        return res.redirect(`/reset-password/${token}`);
    }

    const tokenHash = hashPasswordResetToken(token);
    const user = await User.findOne({
        passwordResetTokenHash: tokenHash,
        passwordResetExpiresAt: { $gt: new Date() },
    });

    if (!user) {
        req.flash("error", "That password reset link is invalid or has expired.");
        return res.redirect("/forgot-password");
    }

    await user.setPassword(password);
    user.passwordResetTokenHash = "";
    user.passwordResetExpiresAt = null;
    await user.save();

    req.flash("success", "Password updated. Log in with your new password.");
    return res.redirect("/login");
};

module.exports.login = async (req, res) => {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

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

    const [currentUser, ownedListings, wishlistListings, bookedListings] = await Promise.all([
        User.findById(userId),
        Listing.find({ owner: userId }).sort({ createdAt: -1, _id: -1 }).populate("owner").populate("bookings.guest"),
        Listing.find({ likes: userId }).sort({ createdAt: -1, _id: -1 }).populate("owner"),
        Listing.find({ "bookings.guest": userId }).sort({ createdAt: -1, _id: -1 }).populate("owner"),
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

    const bookingHistory = bookedListings.flatMap((listing) => {
        const matchingBookings = (listing.bookings || []).filter((booking) => String(booking.guest) === String(userId));

        return matchingBookings.map((booking) => ({
            bookingId: booking._id,
            bookedAt: booking.createdAt,
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
            refundStatus: booking.payment?.refundStatus || "none",
            refundNote: booking.cancellation?.note || "",
            hostName: listing.owner?.username || "Host",
        }));
    }).sort((left, right) => new Date(right.bookedAt || right.startDate) - new Date(left.bookedAt || left.startDate));

    res.render("./users/profile.ejs", {
        currentUserProfile: currentUser,
        ownedListings: normalizedOwnedListings,
        wishlistListings: normalizedWishlist,
        bookingHistory,
        hostReservations,
        paymentHistory,
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
