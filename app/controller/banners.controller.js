import * as bannersService from '../services/banners/banners.service.js';
import logger from '../utils/logger.js';

/**
 * Get all banners
 */
export const getBanners = async (req, res) => {
    try {
        const userRole = req.user ? req.user.role : null;
        const response = await bannersService.getBannersService(userRole);

        return res.status(response.statusCode).json({
            success: response.success,
            errors: response.success ? [] : [{ message: response.message }],
            result: {
                message: response.message,
                data: response.data
            }
        });
    } catch (error) {
        logger.error('Error in getBanners', { error: error.message });
        return res.status(500).json({
            success: false,
            errors: [{ message: 'Internal server error' }],
            result: {}
        });
    }
};

/**
 * Get a single banner by ID
 */
export const getBannerById = async (req, res) => {
    try {
        const { id } = req.params;
        const userRole = req.user ? req.user.role : null;
        const response = await bannersService.getBannerByIdService(id, userRole);

        if (!response.success) {
            return res.status(response.statusCode).json({
                success: false,
                errors: [{ message: response.message }],
                result: {}
            });
        }

        return res.status(response.statusCode).json({
            success: true,
            errors: [],
            result: {
                message: response.message,
                data: response.data
            }
        });
    } catch (error) {
        logger.error('Error in getBannerById', { error: error.message });
        return res.status(500).json({
            success: false,
            errors: [{ message: 'Internal server error' }],
            result: {}
        });
    }
};

/**
 * Create a new banner
 */
export const createBanner = async (req, res) => {
    try {
        const bannerData = { ...req.validatedData };

        if (req.file) {
            bannerData.banner_image = `/uploads/${req.file.filename}`;
        }

        const response = await bannersService.createBannerService(bannerData);

        if (!response.success) {
            return res.status(response.statusCode).json({
                success: false,
                errors: [{ message: response.message }],
                result: {}
            });
        }

        return res.status(response.statusCode).json({
            success: true,
            errors: [],
            result: {
                message: response.message,
                data: response.data
            }
        });
    } catch (error) {
        logger.error('Error in createBanner', { error: error.message });
        return res.status(500).json({
            success: false,
            errors: [{ message: 'Internal server error' }],
            result: {}
        });
    }
};

/**
 * Update an existing banner
 */
export const updateBanner = async (req, res) => {
    try {
        const { id } = req.params;
        const bannerData = { ...req.validatedData };

        if (req.file) {
            bannerData.banner_image = `/uploads/${req.file.filename}`;
        }

        const response = await bannersService.updateBannerService(id, bannerData);

        if (!response.success) {
            return res.status(response.statusCode).json({
                success: false,
                errors: [{ message: response.message }],
                result: {}
            });
        }

        return res.status(response.statusCode).json({
            success: true,
            errors: [],
            result: {
                message: response.message,
                data: response.data
            }
        });
    } catch (error) {
        logger.error('Error in updateBanner', { error: error.message });
        return res.status(500).json({
            success: false,
            errors: [{ message: 'Internal server error' }],
            result: {}
        });
    }
};

/**
 * Delete a banner
 */
export const deleteBanner = async (req, res) => {
    try {
        const { id } = req.params;
        const response = await bannersService.deleteBannerService(id);

        if (!response.success) {
            return res.status(response.statusCode).json({
                success: false,
                errors: [{ message: response.message }],
                result: {}
            });
        }

        return res.status(response.statusCode).json({
            success: true,
            errors: [],
            result: {
                message: response.message,
                data: response.data
            }
        });
    } catch (error) {
        logger.error('Error in deleteBanner', { error: error.message });
        return res.status(500).json({
            success: false,
            errors: [{ message: 'Internal server error' }],
            result: {}
        });
    }
};

