require('dotenv').config();

const dns = require('dns');
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
const adminRoutes = require('./routes/admin.js');
const chatRoutes = require('./routes/chat.js');
const notificationRoutes = require('./routes/notifications.js');
const session = require('express-session');
const MongoStore = require('connect-mongo').default;
const flash = require('connect-flash');
const passport = require('passport');
const LocalStrategy = require('passport-local');
const User = require('./models/user.js');
const ChatThread = require('./models/chatThread.js');
const Notification = require('./models/notification.js');

const port = process.env.PORT || 3000;
const atlasDbUrl = (process.env.ATLAS_URI || '').trim();
const localDbUrl = (process.env.LOCAL_MONGODB_URI || 'mongodb://127.0.0.1:27017/Urbanstay').trim();
const sessionSecret = (process.env.SECRET_KEY || 'dev-secret').trim();
const isProduction = process.env.NODE_ENV === 'production';
const configuredDbName = (process.env.MONGODB_DB_NAME || '').trim();
const mongoDnsServers = String(process.env.MONGODB_DNS_SERVERS || '8.8.8.8,1.1.1.1')
    .split(',')
    .map((server) => server.trim())
    .filter(Boolean);

const getDatabaseNameFromUri = (uri) => {
    try {
        const parsed = new URL(uri);
        return (parsed.pathname || '/').replace(/^\/+/, '').trim();
    } catch (error) {
        return '';
    }
};

const resolvedDbName = configuredDbName || getDatabaseNameFromUri(atlasDbUrl) || getDatabaseNameFromUri(localDbUrl) || 'Urbanstay';

const configureMongoDns = (dbUrl) => {
    if (!dbUrl.startsWith('mongodb+srv://') || !mongoDnsServers.length) {
        return;
    }

    dns.setServers(mongoDnsServers);
};

const formatMongoConnectionError = (error) => {
    const message = String(error?.message || '').trim();

    if (/query(?:Srv|Txt)\s+(?:ESERVFAIL|ENOTFOUND)/i.test(message)) {
        return `MongoDB DNS lookup failed for the Atlas cluster. Verify that your cluster is active (not paused/deleted in MongoDB Atlas), check the hostname in ATLAS_URI, or set MONGODB_DNS_SERVERS in .env. Original error: ${message}`;
    }

    if (/whitelist/i.test(message) || /IP that isn't whitelisted/i.test(message)) {
        return `MongoDB Atlas rejected this connection because the current IP address is not allowed. Add your current IP in Atlas Network Access and try again. Original error: ${message}`;
    }

    return `MongoDB connection failed: ${message || 'Unknown error.'}`;
};

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.engine('ejs', ejsMate);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(methodOverride('_method'));
app.use((req, res, next) => {
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

    if (isProduction && req.secure) {
        res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
    }

    res.locals.currentPath = req.path;
    res.locals.currentYear = new Date().getFullYear();
    res.locals.pageTitle = '';
    res.locals.pageDescription = '';
    res.locals.siteMeta = {
        title: 'UrbanStay',
        description: 'UrbanStay helps guests discover trusted stays with clear content, secure booking, and responsive browsing across devices.',
    };
    next();
});
app.use(express.static(path.join(__dirname, '/public'), {
    etag: true,
    maxAge: isProduction ? '7d' : 0,
    setHeaders: (res, filePath) => {
        if (/\.(css|js|png|jpg|jpeg|svg|webp|ico|woff2?)$/i.test(filePath)) {
            res.setHeader(
                'Cache-Control',
                isProduction ? 'public, max-age=604800, immutable' : 'public, max-age=0, must-revalidate'
            );
        }
    }
}));

const connectWithUrl = async (dbUrl, connectionLabel) => {
    configureMongoDns(dbUrl);
    await mongoose.connect(dbUrl, {
        dbName: configuredDbName || undefined,
        serverSelectionTimeoutMS: 10000,
        connectTimeoutMS: 10000,
        socketTimeoutMS: 20000,
    });
    console.log(`Connected to MongoDB via ${connectionLabel} (${mongoose.connection.db.databaseName})`);
};

async function connectDatabase() {
    try {
        if (!atlasDbUrl && !localDbUrl) {
            throw new Error('No MongoDB connection string is configured.');
        }

        if (atlasDbUrl) {
            try {
                await connectWithUrl(atlasDbUrl, 'Atlas');
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

        await connectWithUrl(localDbUrl, 'local MongoDB');
    } catch (error) {
        const message = String(error?.message || '').trim();
        throw new Error(/^MongoDB /i.test(message) ? message : formatMongoConnectionError(error));
    }
}

function createSessionStore() {
    try {
        const store = MongoStore.create({
            client: mongoose.connection.getClient(),
            dbName: mongoose.connection.db?.databaseName || resolvedDbName,
            crypto: {
                secret: sessionSecret,
            },
            touchAfter: 24 * 60 * 60
        });

        store.on('error', (error) => {
            console.error('Session Store Error:', error.message);
        });

        return store;
    } catch (error) {
        throw new Error(`Session store initialization failed: ${error.message}`);
    }
}

async function startServer() {
    try {
        await connectDatabase();
        const store = createSessionStore();

        app.use(session({
            store,
            secret: sessionSecret,
            resave: false,
            saveUninitialized: false,
            cookie: {
                expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
                maxAge: 1000 * 60 * 60 * 24 * 7,
                httpOnly: true,
                sameSite: 'lax',
                secure: isProduction
            }
        }));

        app.use(flash());
        app.use(passport.initialize());
        app.use(passport.session());
        passport.use(new LocalStrategy({ usernameField: 'email' }, User.authenticate()));
        passport.serializeUser(User.serializeUser());
        passport.deserializeUser(User.deserializeUser());

        app.use((req, res, next) => {
            const attachLocals = async () => {
                res.locals.success = req.flash('success');
                res.locals.error = req.flash('error');
                res.locals.currentUser = req.user;
                res.locals.unreadChatCount = 0;
                res.locals.unreadNotificationCount = 0;

                if (req.user?._id) {
                    const [threads, unreadNotifications] = await Promise.all([
                        ChatThread.find({ participants: req.user._id }).select("messages.sender messages.createdAt readStates"),
                        Notification.countDocuments({ user: req.user._id, readAt: null }),
                    ]);

                    res.locals.unreadChatCount = threads.reduce((sum, thread) => {
                        const readState = (thread.readStates || []).find((entry) => String(entry.user) === String(req.user._id));
                        const lastReadAt = readState?.lastReadAt ? new Date(readState.lastReadAt) : new Date(0);

                        const unread = (thread.messages || []).filter((message) =>
                            String(message.sender) !== String(req.user._id) && new Date(message.createdAt) > lastReadAt
                        ).length;

                        return sum + unread;
                    }, 0);

                    res.locals.unreadNotificationCount = unreadNotifications;
                }
            };

            attachLocals().then(() => next()).catch(next);
        });

        app.get('/', (req, res) => {
            res.redirect('/listings');
        });

        app.use('/listings', listingRoutes);
        app.use('/listings/:id/reviews', reviewRoutes);
        app.use('/admin', adminRoutes);
        app.use('/chat', chatRoutes);
        app.use('/notifications', notificationRoutes);
        // Support both /signup and /user/signup style auth URLs
        app.use('/', userRoutes);
        app.use('/user', userRoutes);

        app.use((req, res, next) => {
            next(new ExpressError(404, 'Page Not Found'));
        });

        app.use((err, req, res, next) => {
            let { statusCode = 500, message = 'Something went wrong!' } = err;
            res.status(statusCode).render('listings/error.ejs', {
                message,
                statusCode,
                pageTitle: `${statusCode} | UrbanStay`,
                pageDescription: message,
            });
        });

        app.listen(port, () => {
            console.log(`Server is running on http://localhost:${port}`);
        });
    } catch (err) {
        console.error('Server startup failed.');
        console.error(err.message);
        process.exit(1);
    }
}

startServer();
