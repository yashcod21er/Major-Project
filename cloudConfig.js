if (!process.env.CLOUD_NAME || !process.env.CLOUD_API_KEY || !process.env.CLOUD_API_SECRET) {
    require('dotenv').config();
}

const cloudinary = require('cloudinary');
const cloudinaryStorage = require('multer-storage-cloudinary');

if (!process.env.CLOUD_NAME || !process.env.CLOUD_API_KEY || !process.env.CLOUD_API_SECRET) {
    throw new Error('Cloudinary environment variables are missing. Check CLOUD_NAME, CLOUD_API_KEY, CLOUD_API_SECRET in .env');
}

cloudinary.v2.config({
    cloud_name: process.env.CLOUD_NAME,
    api_key: process.env.CLOUD_API_KEY,
    api_secret: process.env.CLOUD_API_SECRET
});

const storage = typeof cloudinaryStorage === 'function'
    ? cloudinaryStorage({
        cloudinary,
        folder: 'UrbanStay_Development',
        allowedFormats: ['png', 'jpg', 'jpeg'],
    })
    : new cloudinaryStorage.CloudinaryStorage({
        cloudinary: cloudinary.v2,
        params: {
            folder: 'UrbanStay_Development',
            allowed_formats: ['png', 'jpg', 'jpeg'],
        },
    });

module.exports = { storage, cloudinary: cloudinary.v2 };
