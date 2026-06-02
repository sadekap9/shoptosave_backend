import jwt from 'jsonwebtoken';
import { executeQuery } from '../utils/db.js';
import logger from '../utils/logger.js';

/**
 * Authentication Middleware to verify JWT
 */
const authMiddleware = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                errors: [{ message: 'No token provided' }],
                result: {}
            });
        }

        const token = authHeader.split(' ')[1];

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            // Verify if session exists in DB
            const sessions = await executeQuery('SELECT * FROM session_master WHERE access_token = ? AND user_id = ?', [token, decoded.id]);

            if (sessions.length === 0) {
                return res.status(401).json({
                    success: false,
                    errors: [{ message: 'Session expired or invalid' }],
                    result: {}
                });
            }

            // Attach user to request
            req.user = decoded;
            next();
        } catch (err) {
            return res.status(401).json({
                success: false,
                errors: [{ message: 'Invalid or expired token' }],
                result: {}
            });
        }
    } catch (error) {
        logger.error('Auth Middleware Error', { error: error.message });
        return res.status(500).json({
            success: false,
            errors: [{ message: 'Internal server error' }],
            result: {}
        });
    }
};

export default authMiddleware;
