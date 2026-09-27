# 🏡 UrbanStay

> **A full-stack, responsive travel accommodation platform built with Node.js, Express, MongoDB, and EJS.**

UrbanStay connects travelers with curated stays and unique experiences worldwide. Featuring seamless booking flows, multi-image listing galleries, interactive map exploration, host-guest messaging, Razorpay payment processing, and progressive web app (PWA) offline capabilities.

---

## 🌟 Key Features

### 🏨 Listings & Exploration
- **Browse & Filter**: Explore stays with category filters, dynamic pricing calculators (including tax breakdown), and full-text location search.
- **Interactive Map View**: Visual discovery powered by Mapbox coordinates (`/listings/explore`).
- **Rich Media Galleries**: Multi-image uploads and responsive galleries backed by Cloudinary.
- **Reviews & Ratings**: Transparent user feedback with 5-star rating breakdowns.
- **Wishlist & Likes**: Save favorite properties directly to your personal profile.

### 👤 User Authentication & Roles
- **Secure Authentication**: Built using Passport.js with salted password hashing.
- **Password Recovery**: Secure token-based reset flow (`/forgot-password`, `/reset-password`).
- **Role-Based Access Control**:
  - **Guest**: Browse stays, save favorites, book reservations, and chat with hosts.
  - **Host / Owner**: Create, manage, update, and toggle active status on listings.
  - **Admin**: Dedicated administrative dashboard (`/admin`) for content moderation, reports, coupons, and system audit logs.

### 💳 Bookings & Payments
- **Seamless Checkout**: Direct booking flow integrated with **Razorpay**.
- **Promotional Coupons**: Apply discount codes dynamically during checkout.
- **Booking History**: Hosts and guests can track reservation dates and statuses.

### 💬 In-App Messaging & Notifications
- **Chat System**: Direct thread-based messaging between guests and property owners (`/chat`).
- **Notification Hub**: Real-time unread badges and notification center (`/notifications`) for messages and booking confirmations.

### 📱 Progressive Web App (PWA)
- **Offline Experience**: Service worker caching for fast reloads and offline browsing.
- **Mobile First**: Fully responsive layout optimized for mobile, tablet, and desktop devices.
- **Installable**: Supports Web App Manifest for native-like home screen installation.

### 🛡️ Enterprise-Grade Resilience
- **Dual Database Fallback**: Automatically connects to MongoDB Atlas with seamless fallback to local MongoDB (`127.0.0.1:27017`) during development network outages.

---

## 🛠️ Technology Stack

| Layer | Technologies |
| :--- | :--- |
| **Backend** | Node.js, Express.js (v5), Express Router |
| **Database & ODM** | MongoDB, Mongoose, MongoStore |
| **Authentication** | Passport.js, Passport-Local, Passport-Local-Mongoose, Express Session |
| **Frontend & Templating** | EJS, EJS-Mate, Vanilla CSS, FontAwesome, JavaScript (ES6+) |
| **Cloud Storage** | Cloudinary, Multer, Multer-Storage-Cloudinary |
| **Payments** | Razorpay SDK |
| **Maps** | Mapbox GL JS |
| **Validation & Security** | Joi, Method-Override, Connect-Flash, Cookie-Parser |

---

## 📂 Project Architecture

```plaintext
Major-PROJECT/
├── app.js                   # Application entry point, middleware & database startup
├── cloudConfig.js           # Cloudinary storage configuration
├── middleware.js            # Authentication, authorization, and validation middlewares
├── schema.js                # Joi validation schemas
├── controller/              # Business logic controllers
│   ├── listing.js           # Listing CRUD and filtering logic
│   ├── reviews.js           # Review creation and deletion logic
│   └── users.js             # User auth, profile, and password reset logic
├── models/                  # Mongoose data models
│   ├── auditLog.js          # Admin activity logs
│   ├── chatThread.js        # Host-guest messaging schema
│   ├── coupon.js            # Promotional coupon schema
│   ├── listing.js           # Primary stay/property schema
│   ├── notification.js      # User notification schema
│   ├── report.js            # Content reporting schema
│   ├── review.js            # Review and ratings schema
│   └── user.js              # User account & credential schema
├── routes/                  # Express route definitions
│   ├── User.js              # Auth & profile routes (/signup, /login, /logout)
│   ├── admin.js             # Admin management routes (/admin)
│   ├── chat.js              # In-app messaging routes (/chat)
│   ├── listing.js           # Listing routes (/listings)
│   ├── notifications.js     # Notification routes (/notifications)
│   └── review.js            # Nested review routes (/listings/:id/reviews)
├── init/                    # Database seeding scripts
│   ├── data.js              # Sample listing dataset
│   └── index.js             # Seed execution script
├── public/                  # Static assets
│   ├── css/                 # Stylesheets (modular CSS)
│   ├── js/                  # Client-side scripts (PWA, maps, UI interactions)
│   └── service-worker.js    # PWA service worker
└── views/                   # EJS templates
    ├── includes/            # Navbar, footer, and flash partials
    ├── layouts/             # Base boilerplate layout
    ├── listings/            # Stays index, show, edit, new, and map views
    └── users/               # Login, signup, profile, and password reset views
```

---

## 🚀 Getting Started

### 1. Prerequisites
Ensure you have the following installed on your machine:
- **Node.js** (v18.x, v20.x, or v22.x recommended)
- **npm** (v9.x or higher)
- **MongoDB** (Local MongoDB instance or MongoDB Atlas account)

### 2. Clone the Repository
```bash
git clone https://github.com/yashcod21er/Major-Project.git
cd Major-Project
```

### 3. Install Dependencies
```bash
npm install
```

### 4. Configure Environment Variables
Create a `.env` file in the root directory:

```env
PORT=3000
SECRET_KEY=your_super_secret_session_key

# MongoDB Connection (Atlas or local fallback)
ATLAS_URI=mongodb+srv://<username>:<password>@cluster0.mongodb.net/?appName=Cluster0
LOCAL_MONGODB_URI=mongodb://127.0.0.1:27017/Urbanstay

# Cloudinary (Image Uploads)
CLOUD_NAME=your_cloudinary_cloud_name
CLOUD_API_KEY=your_cloudinary_api_key
CLOUD_API_SECRET=your_cloudinary_api_secret

# Razorpay (Payment Gateway)
RAZORPAY_KEY_ID=your_razorpay_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret

# Mapbox (Optional for maps)
MAP_TOKEN=your_mapbox_public_token
```

### 5. Seed Sample Data
Initialize the database with sample stays and a demo owner account:
```bash
npm run seed
```

> **Demo Credentials created by seeder:**
> - **Email**: `demo-owner@urbanstay.dev`
> - **Password**: `UrbanStay123!`

### 6. Start the Server
```bash
# Start server
npm start
```

Visit the application in your browser:  
👉 **[http://localhost:3000/listings](http://localhost:3000/listings)**

---

## 🗺️ Key Routes Summary

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/listings` | Browse all active stays |
| `GET` | `/listings/explore` | Interactive map view of stays |
| `GET` | `/listings/new` | Form to list a new property (Host required) |
| `GET` | `/listings/:id` | View property details, photos, and reviews |
| `POST` | `/listings` | Create a new listing with image upload |
| `GET` | `/chat` | User conversation inbox |
| `GET` | `/notifications` | Unread user alerts and notices |
| `GET` | `/admin` | Administrative dashboard |
| `GET` | `/user/signup` | Register a new user |
| `GET` | `/user/login` | Authenticate an existing user |

---

## 📄 License
This project is open-source and available under the [ISC License](LICENSE).
