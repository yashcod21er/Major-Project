if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config();
}
console.log(process.env.SECRET_KEY);
const express = require('express');
const app = express();
const mongoose = require('mongoose');
const methodOverride = require('method-override');
const path = require('path');
const ejs = require('ejs');
const port = 3000;
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
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });


app.use(express.urlencoded({ extended: true }));
app.engine('ejs', ejsMate);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, '/public')));
app.use(methodOverride('_method'));

const dbUrl = process.env.ATLAS_URI;

main()
    .then((res) => {
    console.log('Connected to MongoDB')
    })
    .catch((err) => {console.log(err)});


    async function main() {
        await mongoose.connect(dbUrl);
    }

const store = MongoStore.create({
    mongoUrl: dbUrl,
    crypto:{
        secret: process.env.SECRET_KEY,
    },
    
    touchAfter: 24 * 60 * 60 // time period in seconds
});

store.on("error", (e)=>{
    console.log("Session Store Error", e)
});

const sessionOptions = {
    store,
    secret: process.env.SECRET_KEY,
    resave: false,
    saveUninitialized: true,
    cookie: {
        expires: Date.now() + 1000 * 60 * 60 * 24 * 7, // 1 week
        maxAge: 1000 * 60 * 60 * 24 * 7,
        httpOnly: true
    }
};

app.use(session(sessionOptions));
app.use(flash());

app.use(passport.initialize());
app.use(passport.session());
passport.use(new LocalStrategy({ usernameField: "email" }, User.authenticate()));
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());   

app.use((req, res, next)=>{
    res.locals.success = req.flash('success');
    res.locals.error = req.flash('error');
    res.locals.currentUser = req.user;
    next();
})




app.use("/listings", listingRoutes);
app.use("/listings/:id/reviews", reviewRoutes )
// Support both /signup and /user/signup style auth URLs
app.use("/", userRoutes);
app.use("/user", userRoutes);


app.use((req, res,next) => {
    next(new ExpressError(404, 'Page Not Found'));
});


app.use((err, req, res, next) => {  
    let { statusCode=500, message="Something went wrong!"} = err;
    res.status(statusCode).render('listings/error.ejs', {message, statusCode});
    
    
});


app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
}); 
