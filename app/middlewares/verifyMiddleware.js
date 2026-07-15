import jwt from 'jsonwebtoken';
import { executeQuery } from '../config/dbConfig.js';
import logger from '../utils/logger.js';

/**
 * Authentication Middleware to verify JWT
 */
export const verifyToken = async (req, res, next) => {
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

            // Verify if session exists in DB and is not expired
            const sessionQuery = `
                SELECT s.*, u.is_active, u.role, u.menu_access 
                FROM session_master s
                JOIN user_master u ON s.user_id = u.id
                WHERE s.access_token = ? AND s.user_id = ? AND s.expires_at > NOW()
            `;
            const sessions = await executeQuery(sessionQuery, [token, decoded.id]);

            if (sessions.length === 0) {
                return res.status(401).json({
                    success: false,
                    errors: [{ message: 'Session expired or invalid' }],
                    result: {}
                });
            }

            const sessionUser = sessions[0];
            if (sessionUser.is_active === 0) {
                return res.status(403).json({
                    success: false,
                    errors: [{ message: 'Your account is inactive. Please contact support.' }],
                    result: {}
                });
            }

            // Parse menu access safely
            let menuAccess = [];
            try {
                if (sessionUser.menu_access) {
                    menuAccess = typeof sessionUser.menu_access === 'string' 
                        ? JSON.parse(sessionUser.menu_access) 
                        : sessionUser.menu_access;
                }
            } catch (e) {
                logger.error('Error parsing menu_access JSON', { error: e.message });
                menuAccess = [];
            }

            // Attach user data to request
            req.user = {
                id: decoded.id,
                phone: decoded.phone,
                role: sessionUser.role,
                email: decoded.email || sessionUser.email || '',
                menuAccess: Array.isArray(menuAccess) ? menuAccess : [],
                sessionId: sessionUser.id
            };

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

/**
 * Middleware to restrict endpoints based on user roles
 */
export const authorizeRole = (allowedRoles = []) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                errors: [{ message: 'Unauthorized' }],
                result: {}
            });
        }

        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                errors: [{ message: 'Access denied: Insufficient role permissions' }],
                result: {}
            });
        }

        next();
    };
};

/**
 * Middleware to restrict endpoints based on sub-admin menu access configuration
 */
export const authorizeMenu = (menuKey) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                errors: [{ message: 'Unauthorized' }],
                result: {}
            });
        }

        // Role 1 (Admin) bypasses all permission checks
        if (req.user.role === 1) {
            return next();
        }

        // Role 2 (Sub Admin) checks the user's menuAccess list
        if (req.user.role === 2) {
            if (req.user.menuAccess && req.user.menuAccess.includes(menuKey)) {
                return next();
            }
            return res.status(403).json({
                success: false,
                errors: [{ message: `Access denied: Missing menu permissions for '${menuKey}'` }],
                result: {}
            });
        }

        // Users (Role 3) do not have menu permissions
        return res.status(403).json({
            success: false,
            errors: [{ message: 'Access denied: Customer cannot access administrative functions' }],
            result: {}
        });
    };
};

// Maintain default export for backward compatibility
const authMiddleware = verifyToken;
export default authMiddleware;
