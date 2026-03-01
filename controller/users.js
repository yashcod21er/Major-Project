const User = require("../models/user");

module.exports.renderSignupForm = (req, res) => {
    res.render("./users/signup.ejs");
};

module.exports.signup = async (req, res) => {
    try {
        const { username, email, password } = req.body;
        const user = new User({ username, email });
        const registeredUser = await User.register(user, password);

        await new Promise((resolve, reject) => {
            req.login(registeredUser, (err) => {
                if (err) return reject(err);
                resolve();
            });
        });

        req.flash("success", "Welcome to UrbanStay!");
        const redirectUrl = req.session.redirectTo || "/listings";
        delete req.session.redirectTo;
        return res.redirect(redirectUrl);
    } catch (e) {
        req.flash("error", e.message);
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

    await new Promise((resolve, reject) => {
        req.login(authenticatedUser, (err) => {
            if (err) return reject(err);
            resolve();
        });
    });

    req.flash("success", "Welcome back!");
    const redirectUrl = res.locals.redirectUrl || "/listings";
    return res.redirect(redirectUrl);
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
