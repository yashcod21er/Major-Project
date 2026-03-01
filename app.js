if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config();
}

const express = require('express');
const app = express();
const mongoose = require('mongoose');
const methodOverride = require('method-override');
const path = require('path');
const ejsMate= require("ejs-mate")
const ExpressError = require('./public/utils/ExpressError.js');
const listingRoutes = require('./routes/listing.js');
const reviewRoutes = require('./routes/review.js');
const userRoutes = require('./routes/User.js');
const session = require('express-session');
const MongoStore = require('connect-mongo').default;
const flash = require('connect-flash');
const passport = require('passport');
const LocalStrategy = require('passport-local');
const User = require('./models/user.js');

const port = process.env.PORT || 3000;
const dbUrl = (process.env.ATLAS_URI || '').trim();
const sessionSecret = (process.env.SECRET_KEY || 'dev-secret').trim();

app.use(express.urlencoded({ extended: true }));
app.engine('ejs', ejsMate);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, '/public')));
app.use(methodOverride('_method'));

if (!dbUrl) {
    console.error('ATLAS_URI is missing in .env');
    process.exit(1);
}

async function startServer() {
    try {
        await mongoose.connect(dbUrl, { serverSelectionTimeoutMS: 10000 });
        console.log('Connected to MongoDB');

        const store = MongoStore.create({
            client: mongoose.connection.getClient(),
            dbName: mongoose.connection.db.databaseName,
            crypto: {
                secret: sessionSecret,
            },
            touchAfter: 24 * 60 * 60
        });

        store.on('error', (e) => {
            console.error('Session Store Error:', e.message);
        });

        app.use(session({
            store,
            secret: sessionSecret,
            resave: false,
            saveUninitialized: false,
            cookie: {
                expires: Date.now() + 1000 * 60 * 60 * 24 * 7,
                maxAge: 1000 * 60 * 60 * 24 * 7,
                httpOnly: true
            }
        }));

        app.use(flash());
        app.use(passport.initialize());
        app.use(passport.session());
        passport.use(new LocalStrategy({ usernameField: 'email' }, User.authenticate()));
        passport.serializeUser(User.serializeUser());
        passport.deserializeUser(User.deserializeUser());

        app.use((req, res, next) => {
            res.locals.success = req.flash('success');
            res.locals.error = req.flash('error');
            res.locals.currentUser = req.user;
            next();
        });

        app.use('/listings', listingRoutes);
        app.use('/listings/:id/reviews', reviewRoutes);
        // Support both /signup and /user/signup style auth URLs
        app.use('/', userRoutes);
        app.use('/user', userRoutes);

        app.use((req, res, next) => {
            next(new ExpressError(404, 'Page Not Found'));
        });

        app.use((err, req, res, next) => {
            let { statusCode = 500, message = 'Something went wrong!' } = err;
            res.status(statusCode).render('listings/error.ejs', { message, statusCode });
        });

        app.listen(port, () => {
            console.log(`Server is running on http://localhost:${port}`);
        });
    } catch (err) {
        console.error('Failed to connect to MongoDB Atlas.');
        console.error(err.message);
        console.error('Check Atlas Network Access (IP whitelist) and ATLAS_URI in .env.');
        process.exit(1);
    }
}

startServer();
