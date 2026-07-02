import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { executeQuery } from '../../config/dbConfig.js';
import { sendSMS } from '../../helpers/sms.helper.js';
import logger from '../../utils/logger.js';
import { DUMMY_USER } from '../../config/constant/constant.js';

// Secure In-Memory Cache to store OTP metadata (hash, attempts, expiry) without modifying DB schema
const secureOtpCache = new Map();

/**
 * Helper to hash OTP using SHA-256
 */
const hashOTP = (otp) => {
    return crypto.createHash('sha256').update(otp).digest('hex');
};

/**
 * Normalize phone number
 */
export const normalizePhone = (phone) => {
    let cleaned = phone.replace(/[^\d+]/g, '');
    if (!cleaned.startsWith('+')) {
        if (cleaned.length === 10) cleaned = '+91' + cleaned;
        else cleaned = '+' + cleaned;
    }
    return cleaned;
};

/**
 * Request OTP Service
 */
export const requestOTPService = async (data) => {
    const { phone } = data;
    const normalizedPhone = normalizePhone(phone);
    const isDummy = normalizedPhone === DUMMY_USER.PHONE;

    try {
        // Cooldown check in-memory (60 seconds)
        const cachedOtp = secureOtpCache.get(normalizedPhone);
        if (cachedOtp) {
            const elapsed = (Date.now() - cachedOtp.createdAt) / 1000;
            if (elapsed < 60) {
                return {
                    success: false,
                    statusCode: 400,
                    message: `Please wait ${Math.ceil(60 - elapsed)} seconds before requesting another OTP.`
                };
            }
        }

        // Generate 6 digit OTP
        const otp = isDummy ? DUMMY_USER.OTP : Math.floor(100000 + Math.random() * 900000).toString();
        const otpHashed = hashOTP(otp);
        const expiresAt = Date.now() + 5 * 60 * 1000; // 5 mins expiry

        // Store OTP details securely in-memory
        secureOtpCache.set(normalizedPhone, {
            otpHash: otpHashed,
            expiresAt,
            attempts: 0,
            createdAt: Date.now()
        });

        // Check if user exists, create or update plain text OTP for backward compatibility (6 chars limit)
        const users = await executeQuery('SELECT id FROM user_master WHERE phone = ?', [normalizedPhone]);
        if (users.length === 0) {
            await executeQuery(
                'INSERT INTO user_master (phone, role, is_active, otp) VALUES (?, 3, 1, ?)',
                [normalizedPhone, otp]
            );
        } else {
            await executeQuery(
                'UPDATE user_master SET otp = ? WHERE phone = ?',
                [otp, normalizedPhone]
            );
        }

        if (isDummy) {
            return {
                success: true,
                statusCode: 200,
                message: 'OTP sent successfully (Dummy Bypass Mode)',
                data: { phone: normalizedPhone }
            };
        }

        // Dispatch OTP via SMS Helper
        const smsResult = await sendSMS(
            normalizedPhone,
            `This is from Shop2Save to verify your account. Your OTP is: ${otp}. Valid for 5 minutes. Do not share this code.`
        );

        return {
            success: true,
            statusCode: 200,
            message: smsResult.isDummy 
                ? 'OTP sent successfully (Dummy Log Mode)' 
                : 'OTP sent successfully via SMS',
            data: { phone: normalizedPhone }
        };

    } catch (error) {
        logger.error('RequestOTP Service Error', { error: error.message });
        return {
            success: false,
            statusCode: 500,
            message: 'Error during OTP generation'
        };
    }
};

/**
 * Verify OTP Service (Login/Register)
 */
export const verifyOTPService = async (data, meta) => {
    const { phone, otp } = data;
    const { ip_address, device_token, platform, device_name } = meta;
    const normalizedPhone = normalizePhone(phone);
    const isDummy = normalizedPhone === DUMMY_USER.PHONE && otp === DUMMY_USER.OTP;

    try {
        // Resolve user, auto-create if not found (in case database was modified out-of-band)
        let users = await executeQuery('SELECT * FROM user_master WHERE phone = ?', [normalizedPhone]);
        if (users.length === 0) {
            const insertResult = await executeQuery(
                'INSERT INTO user_master (phone, role, is_active, name, email) VALUES (?, 3, 1, NULL, NULL)',
                [normalizedPhone]
            );
            users = await executeQuery('SELECT * FROM user_master WHERE id = ?', [insertResult.insertId]);
        }

        const user = users[0];

        if (user.is_active === 0) {
            return {
                success: false,
                statusCode: 403,
                message: 'Your account is inactive. Please contact support.'
            };
        }

        // Fetch secure OTP configuration from in-memory cache
        const cachedOtp = secureOtpCache.get(normalizedPhone);

        if (!isDummy) {
            // 1. Expiry Check
            if (!cachedOtp || Date.now() > cachedOtp.expiresAt) {
                secureOtpCache.delete(normalizedPhone);
                return {
                    success: false,
                    statusCode: 400,
                    message: 'OTP has expired. Please request a new one.'
                };
            }

            // 2. Max attempts check
            if (cachedOtp.attempts >= 3) {
                secureOtpCache.delete(normalizedPhone);
                return {
                    success: false,
                    statusCode: 400,
                    message: 'Too many failed attempts. This OTP has been invalidated. Please request a new one.'
                };
            }

            // 3. Match Verification Hash
            const inputHash = hashOTP(otp);
            if (cachedOtp.otpHash !== inputHash) {
                cachedOtp.attempts += 1;
                secureOtpCache.set(normalizedPhone, cachedOtp);

                const remaining = 3 - cachedOtp.attempts;
                if (remaining <= 0) {
                    secureOtpCache.delete(normalizedPhone);
                    return {
                        success: false,
                        statusCode: 400,
                        message: 'Invalid OTP. This code has now been locked.'
                    };
                }
                return {
                    success: false,
                    statusCode: 400,
                    message: `Invalid OTP. You have ${remaining} attempts remaining.`
                };
            }
        }

        // Clean up OTP from cache and DB upon successful verification
        secureOtpCache.delete(normalizedPhone);
        await executeQuery('UPDATE user_master SET otp = NULL WHERE id = ?', [user.id]);

        // Generate JWT Tokens
        const accessToken = jwt.sign(
            { id: user.id, phone: user.phone, role: user.role, email: user.email || '' },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        const refreshToken = jwt.sign(
            { id: user.id, phone: user.phone, role: user.role, email: user.email || '' },
            process.env.JWT_REFRESH_SECRET || 'refresh_secret',
            { expiresIn: '7d' } // 7 days long-lived token
        );

        const tokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days from now

        // Store Session in session_master
        const sessionQuery = `
            INSERT INTO session_master 
            (user_id, access_token, refresh_token, device_token, device_name, platform, ip_address, is_revoked, expires_at) 
            VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
        `;
        await executeQuery(sessionQuery, [
            user.id,
            accessToken,
            refreshToken,
            device_token || null,
            device_name || null,
            platform || 'w',
            ip_address,
            tokenExpiry
        ]);

        return {
            success: true,
            statusCode: 200,
            message: 'Login successful',
            data: {
                access_token: accessToken,
                refresh_token: refreshToken,
                user: {
                    id: user.id,
                    phone: user.phone,
                    name: user.name || '',
                    email: user.email || '',
                    role: user.role
                }
            }
        };

    } catch (error) {
        logger.error('VerifyOTP Service Error', { error: error.message });
        return {
            success: false,
            statusCode: 500,
            message: 'Error verifying OTP code'
        };
    }
};

/**
 * Resend OTP Service
 */
export const resendOTPService = async (data) => {
    return requestOTPService(data);
};

/**
 * Logout Service
 */
export const logoutService = async (token, global = false, userId = null) => {
    try {
        if (global && userId) {
            const result = await executeQuery('UPDATE session_master SET is_revoked = 1 WHERE user_id = ?', [userId]);
            return {
                success: true,
                statusCode: 200,
                message: `Successfully logged out from all devices (${result.affectedRows} sessions revoked).`
            };
        } else {
            const result = await executeQuery('UPDATE session_master SET is_revoked = 1 WHERE access_token = ?', [token]);
            if (result.affectedRows === 0) {
                return {
                    success: false,
                    statusCode: 400,
                    message: 'Invalid session token or already logged out.'
                };
            }
            return {
                success: true,
                statusCode: 200,
                message: 'Logout successful'
            };
        }
    } catch (error) {
        logger.error('Logout Service Error', { error: error.message });
        return {
            success: false,
            statusCode: 500,
            message: 'Error during logout session invalidation'
        };
    }
};

/**
 * Refresh Token Service
 */
export const refreshTokenService = async (refreshToken) => {
    try {
        const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

        // Check if session is active and refresh token matches
        const sessionQuery = `
            SELECT s.*, u.is_active, u.role, u.email 
            FROM session_master s
            JOIN user_master u ON s.user_id = u.id
            WHERE s.refresh_token = ? AND s.user_id = ? AND s.is_revoked = 0 AND s.expires_at > NOW()
        `;
        const sessions = await executeQuery(sessionQuery, [refreshToken, decoded.id]);

        if (sessions.length === 0) {
            return {
                success: false,
                statusCode: 401,
                message: 'Invalid or expired refresh token session.'
            };
        }

        const session = sessions[0];
        if (session.is_active === 0) {
            return {
                success: false,
                statusCode: 403,
                message: 'User account is inactive.'
            };
        }

        // Generate new short-lived access token
        const newAccessToken = jwt.sign(
            { id: decoded.id, phone: decoded.phone, role: session.role, email: session.email || '' },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        // Update session table with new access token
        await executeQuery(
            'UPDATE session_master SET access_token = ? WHERE id = ?',
            [newAccessToken, session.id]
        );

        return {
            success: true,
            statusCode: 200,
            message: 'New access token generated',
            data: {
                access_token: newAccessToken
            }
        };

    } catch (error) {
        logger.error('RefreshToken Service Error', { error: error.message });
        return {
            success: false,
            statusCode: 401,
            message: 'Invalid or expired refresh token'
        };
    }
};

/**
 * Admin / Sub-Admin Registration Service
 */
export const adminRegisterService = async (data, meta) => {
    const { name, email, password, phone, role } = data;
    const { ip_address, device_token, platform, device_name } = meta;

    if (!email || !password) {
        return {
            success: false,
            statusCode: 400,
            message: 'Email and password are required'
        };
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Only allow registering Admin (Role = 1) via the public registration route.
    // Sub-admins (Role = 2) must be created via the protected sub-admin route.
    if (role === 2) {
        return {
            success: false,
            statusCode: 403,
            message: 'Sub-admins must be created via the protected sub-admin route by an administrator.'
        };
    }
    const targetRole = 1;

    try {
        // Email check
        const emailCheck = await executeQuery('SELECT id FROM user_master WHERE email = ?', [normalizedEmail]);
        if (emailCheck.length > 0) {
            return {
                success: false,
                statusCode: 400,
                message: 'Email address already in use'
            };
        }

        // Phone check
        let normalizedPhone = null;
        if (phone) {
            normalizedPhone = normalizePhone(phone);
            const phoneCheck = await executeQuery('SELECT id FROM user_master WHERE phone = ?', [normalizedPhone]);
            if (phoneCheck.length > 0) {
                return {
                    success: false,
                    statusCode: 400,
                    message: 'Phone number already in use'
                };
            }
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insert admin/sub-admin
        const result = await executeQuery(
            'INSERT INTO user_master (name, email, phone, password, role, is_active, menu_access) VALUES (?, ?, ?, ?, ?, 1, NULL)',
            [name || null, normalizedEmail, normalizedPhone, hashedPassword, targetRole]
        );
        const userId = result.insertId;
        return {
            success: true,
            statusCode: 200,
            message: 'Registration successful',
            data: {
                user: {
                    id: userId,
                    name: name || '',
                    email: normalizedEmail,
                    phone: normalizedPhone || '',
                    role: targetRole
                }
            }
        };

    } catch (error) {
        logger.error('AdminRegister Service Error', { error: error.message });
        return {
            success: false,
            statusCode: 500,
            message: 'Error during admin account registration'
        };
    }
};

/**
 * Admin / Sub-Admin Login Service
 */
export const adminLoginService = async (data, meta) => {
    const { email, password } = data;
    const { ip_address, device_token, platform, device_name } = meta;

    if (!email || !password) {
        return {
            success: false,
            statusCode: 400,
            message: 'Email and password are required'
        };
    }

    const normalizedEmail = email.toLowerCase().trim();

    try {
        // Query user
        const users = await executeQuery('SELECT * FROM user_master WHERE email = ?', [normalizedEmail]);
        if (users.length === 0) {
            return {
                success: false,
                statusCode: 400,
                message: 'Invalid email or password'
            };
        }

        const user = users[0];

        // Role restriction (1=Admin, 2=Sub-Admin)
        if (user.role !== 1 && user.role !== 2) {
            return {
                success: false,
                statusCode: 403,
                message: 'Access denied. Please login via Phone and OTP.'
            };
        }

        // Active check
        if (user.is_active === 0) {
            return {
                success: false,
                statusCode: 403,
                message: 'Your account is inactive. Please contact support.'
            };
        }

        // Verify password
        if (!user.password) {
            return {
                success: false,
                statusCode: 400,
                message: 'Password not set for this account.'
            };
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return {
                success: false,
                statusCode: 400,
                message: 'Invalid email or password'
            };
        }

        // Generate JWT Tokens
        const accessToken = jwt.sign(
            { id: user.id, phone: user.phone, role: user.role, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        const refreshToken = jwt.sign(
            { id: user.id, phone: user.phone, role: user.role, email: user.email },
            process.env.JWT_REFRESH_SECRET || 'refresh_secret',
            { expiresIn: '7d' }
        );

        const tokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        // Create Session
        await executeQuery(
            `INSERT INTO session_master (user_id, access_token, refresh_token, device_token, device_name, platform, ip_address, is_revoked, expires_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
            [user.id, accessToken, refreshToken, device_token || null, device_name || null, platform || 'w', ip_address, tokenExpiry]
        );



        return {
            success: true,
            statusCode: 200,
            message: 'Login successful',
            data: {
                access_token: accessToken,
                refresh_token: refreshToken,
                user: {
                    id: user.id,
                    name: user.name || '',
                    email: user.email,
                    phone: user.phone || '',
                    role: user.role,
                    menu_access: user.menu_access
                }
            }
        };

    } catch (error) {
        logger.error('AdminLogin Service Error', { error: error.message });
        return {
            success: false,
            statusCode: 500,
            message: 'Error during admin login authentication'
        };
    }
};
