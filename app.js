import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import multer from 'multer';
import authRoutes from './app/routes/auth.routes.js';
import userRoutes from './app/routes/user.routes.js';
import categoriesRoutes from './app/routes/categories.routes.js';
import productsRoutes from './app/routes/products.routes.js';
import woohooRoutes from './app/routes/woohoo.routes.js';
import storeCategoriesRoutes from './app/routes/storeCategories.routes.js';
import subAdminRoutes from './app/routes/subAdmin.routes.js';
import storesRoutes from './app/routes/stores.routes.js';
import giftCardsRoutes from './app/routes/giftCards.routes.js';
import bannersRoutes from './app/routes/banners.routes.js';
import { getProductBySku } from './app/controller/products/products.controller.js';
import { apiLimiter } from './app/config/rateLimiter.js';
import logger from './app/utils/logger.js';

const app = express();

// Trust first proxy
app.set('trust proxy', 1);

// Middleware
app.use(helmet({
    crossOriginResourcePolicy: false // Allow loading static uploaded images across origins
}));
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static('uploads'));

// Routes
const v1Router = express.Router();
v1Router.use('/auth', authRoutes);
v1Router.use('/user', userRoutes);
v1Router.use('/categories', categoriesRoutes);
v1Router.use('/catalog/categories', categoriesRoutes);
v1Router.use('/products', productsRoutes);
v1Router.use('/store-categories', storeCategoriesRoutes);
v1Router.use('/sub-admin', subAdminRoutes);
v1Router.use('/stores', storesRoutes);
v1Router.use('/gift-cards', giftCardsRoutes);
v1Router.use('/banners', bannersRoutes);
v1Router.get('/catalog/products/:sku', getProductBySku);
v1Router.use('/woohoo', woohooRoutes);      // Woohoo v3 Client API Proxy

app.use('/api/v1', apiLimiter, v1Router);

// Default Route
app.get('/', (req, res) => {
    res.send('<h1>Wallet Cashback API</h1>');
});

// Global Error Handler
app.use((err, req, res, next) => {
    // Handle Multer specific errors
    if (err instanceof multer.MulterError) {
        let errorMessage = err.message;
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
            errorMessage = `Unexpected file field. Please upload the file using the correct field name (e.g., 'logo' or 'profile_image').`;
        }
        return res.status(400).json({
            success: false,
            errors: [{ message: errorMessage }],
            result: {}
        });
    }

    // Handle custom file filter errors from Multer
    if (err.message && (err.message.includes('Only image') || err.message.includes('allowed'))) {
        return res.status(400).json({
            success: false,
            errors: [{ message: err.message }],
            result: {}
        });
    }

    logger.error('Internal Server Error', { stack: err.stack });
    res.status(500).json({
        success: false,
        errors: [{ message: 'Internal Server Error' }],
        result: {}
    });
});

export default app;
