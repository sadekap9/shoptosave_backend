import * as authService from '../../services/auth/auth.service.js';
import logger from '../../utils/logger.js';

/**
 * Logout
 */
export const logOut = async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader && authHeader.split(" ")[1];
        
        if (!token) {
            return res.status(401).json({ 
                success: false, 
                errors: [{ message: "Authentication required" }], 
                result: {} 
            });
        }

        const response = await authService.logoutService(token);

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
            result: { message: response.message } 
        });

    } catch (error) {
        logger.error("LogOut Error", { error: error.message, stack: error.stack });
        return res.status(500).json({ 
            success: false, 
            errors: [{ message: "Internal server error" }], 
            result: {} 
        });
    }
};

/**
 * Refresh Access Token
 */
export const refreshToken = async (req, res) => {
    try {
        const refreshToken = req.headers['refreshtoken'];

        if (!refreshToken) {
            return res.status(400).json({ 
                success: false, 
                errors: [{ message: "Refresh token is required" }], 
                result: {} 
            });
        }

        const response = await authService.refreshTokenService(refreshToken);

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
            result: { message: response.message, data: response.data } 
        });

    } catch (error) {
        logger.error("RefreshToken Error", { error: error.message, stack: error.stack });
        return res.status(500).json({ 
            success: false, 
            errors: [{ message: "Internal server error" }], 
            result: {} 
        });
    }
};

