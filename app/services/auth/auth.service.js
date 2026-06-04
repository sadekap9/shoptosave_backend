import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { executeQuery } from '../../config/dbConfig.js';
import { sendSMS } from '../../helpers/sms.helper.js';
import logger from '../../utils/logger.js';
import { DUMMY_USER } from '../../config/constant/constant.js';

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
        // 1. Check failed login attempts lockout (Max 5 failures in last 15 mins)
        const lockoutCheckQuery = `
            SELECT COUNT(*) AS count 
            FROM failed_login_attempts 
            WHERE identity = ? AND created_at > DATE_SUB(NOW(), INTERVAL 15 MINUTE)
        `;
        const [{ count: failedCount }] = await executeQuery(lockoutCheckQuery, [normalizedPhone]);
        if (failedCount >= 5) {
            return {
                success: false,
                statusCode: 429,
                message: 'This phone number has been temporarily locked due to too many failed attempts. Try again after 15 minutes.'
            };
        }

        // 2. Cooldown check (Cannot request another OTP within 60 seconds)
        const lastOtpQuery = `
            SELECT created_at 
            FROM otp_master 
            WHERE phone = ? 
            ORDER BY id DESC LIMIT 1
        `;
        const lastOtp = await executeQuery(lastOtpQuery, [normalizedPhone]);
        if (lastOtp.length > 0) {
            const timeElapsed = (Date.now() - new Date(lastOtp[0].created_at).getTime()) / 1000;
            if (timeElapsed < 60) {
                return {
                    success: false,
                    statusCode: 400,
                    message: `Please wait ${Math.ceil(60 - timeElapsed)} seconds before requesting another OTP.`
                };
            }
        }

        // 3. Max OTP requests check (Max 3 OTP requests in last 15 mins)
        const countOtpQuery = `
            SELECT COUNT(*) AS count 
            FROM otp_master 
            WHERE phone = ? AND created_at > DATE_SUB(NOW(), INTERVAL 15 MINUTE)
        `;
        const [{ count: otpCount }] = await executeQuery(countOtpQuery, [normalizedPhone]);
        if (otpCount >= 3) {
            return {
                success: false,
                statusCode: 429,
                message: 'Maximum OTP requests exceeded. Please try again after 15 minutes.'
            };
        }

        // 4. Generate 6 digit OTP
        const otp = isDummy ? DUMMY_USER.OTP : Math.floor(100000 + Math.random() * 900000).toString();
        const otpHashed = hashOTP(otp);
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 mins expiry

        // 5. Save to database (Use single quotes for 'login' string literal)
        await executeQuery(
            "INSERT INTO otp_master (phone, otp_hash, purpose, attempts, expires_at, is_verified) VALUES (?, ?, 'login', 0, ?, 0)",
            [normalizedPhone, otpHashed, expiresAt]
        );

        // 6. Also write immediately to user_master for backward compatibility (only otp column, no expires_at)
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
        // 1. Lockout check
        const lockoutCheckQuery = `
            SELECT COUNT(*) AS count 
            FROM failed_login_attempts 
            WHERE identity = ? AND created_at > DATE_SUB(NOW(), INTERVAL 15 MINUTE)
        `;
        const [{ count: failedCount }] = await executeQuery(lockoutCheckQuery, [normalizedPhone]);
        if (failedCount >= 5) {
            return {
                success: false,
                statusCode: 429,
                message: 'This phone number has been temporarily locked due to too many failed attempts. Try again after 15 minutes.'
            };
        }

        // 2. Fetch latest active OTP
        const otpQuery = `
            SELECT * 
            FROM otp_master 
            WHERE phone = ? AND is_verified = 0 AND expires_at > NOW() 
            ORDER BY id DESC LIMIT 1
        `;
        const otps = await executeQuery(otpQuery, [normalizedPhone]);

        if (otps.length === 0 && !isDummy) {
            // Log failed attempt (use single quotes for 'otp' string literal)
            await executeQuery(
                "INSERT INTO failed_login_attempts (identity, ip_address, attempt_type) VALUES (?, ?, 'otp')",
                [normalizedPhone, ip_address]
            );
            return {
                success: false,
                statusCode: 400,
                message: 'Invalid or expired OTP. Please request a new code.'
            };
        }

        const activeOtp = otps[0];

        // Check verification attempts on current OTP
        if (!isDummy && activeOtp.attempts >= 3) {
            return {
                success: false,
                statusCode: 400,
                message: 'This OTP code has been locked due to too many failed verification attempts. Please request a new one.'
            };
        }

        // 3. Verify OTP
        const otpHashed = hashOTP(otp);
        const isValid = isDummy || (activeOtp.otp_hash === otpHashed);

        if (!isValid) {
            // Increment OTP attempts
            await executeQuery('UPDATE otp_master SET attempts = attempts + 1 WHERE id = ?', [activeOtp.id]);
            // Log failed attempt globally (use single quotes for 'otp' string literal)
            await executeQuery(
                "INSERT INTO failed_login_attempts (identity, ip_address, attempt_type) VALUES (?, ?, 'otp')",
                [normalizedPhone, ip_address]
            );

            const remaining = 3 - (activeOtp.attempts + 1);
            const errMsg = remaining <= 0 
                ? 'Invalid OTP. This code has now been locked.' 
                : `Invalid OTP. You have ${remaining} attempts remaining.`;

            return {
                success: false,
                statusCode: 400,
                message: errMsg
            };
        }

        // 4. Mark OTP as verified
        if (!isDummy) {
            await executeQuery('UPDATE otp_master SET is_verified = 1 WHERE id = ?', [activeOtp.id]);
        }

        // 5. Resolve user, auto-create if not found (in case database was modified out-of-band)
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

        // Clear OTP in user_master after successful verification (only otp column, no expires_at)
        await executeQuery('UPDATE user_master SET otp = NULL WHERE id = ?', [user.id]);

        // 6. Generate JWT Tokens
        const accessToken = jwt.sign(
            { id: user.id, phone: user.phone, role: user.role, email: user.email || '' },
            process.env.JWT_SECRET,
            { expiresIn: '15m' } // 15 mins short-lived token
        );

        const refreshToken = jwt.sign(
            { id: user.id, phone: user.phone, role: user.role, email: user.email || '' },
            process.env.JWT_REFRESH_SECRET || 'refresh_secret',
            { expiresIn: '7d' } // 7 days long-lived token
        );

        const tokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days from now

        // 7. Store Session in session_master
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

        // 8. Register Device
        if (device_token) {
            const deviceQuery = `
                INSERT INTO user_devices (user_id, device_token, device_name, platform) 
                VALUES (?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE device_name = VALUES(device_name), platform = VALUES(platform), last_active_at = NOW()
            `;
            await executeQuery(deviceQuery, [user.id, device_token, device_name || null, platform || 'w']);
        }

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
            { expiresIn: '15m' }
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
        // 1. Lockout check
        const lockoutCheckQuery = `
            SELECT COUNT(*) AS count 
            FROM failed_login_attempts 
            WHERE identity = ? AND created_at > DATE_SUB(NOW(), INTERVAL 15 MINUTE)
        `;
        const [{ count: failedCount }] = await executeQuery(lockoutCheckQuery, [normalizedEmail]);
        if (failedCount >= 5) {
            return {
                success: false,
                statusCode: 429,
                message: 'This account has been temporarily locked due to too many failed login attempts. Try again after 15 minutes.'
            };
        }

        // Query user
        const users = await executeQuery('SELECT * FROM user_master WHERE email = ?', [normalizedEmail]);
        if (users.length === 0) {
            // Log failed attempt
            await executeQuery(
                "INSERT INTO failed_login_attempts (identity, ip_address, attempt_type) VALUES (?, ?, 'password')",
                [normalizedEmail, ip_address]
            );
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
            // Log failed attempt
            await executeQuery(
                "INSERT INTO failed_login_attempts (identity, ip_address, attempt_type) VALUES (?, ?, 'password')",
                [normalizedEmail, ip_address]
            );
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
            { expiresIn: '15m' }
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

        // Register Device
        if (device_token) {
            await executeQuery(
                `INSERT INTO user_devices (user_id, device_token, device_name, platform) VALUES (?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE device_name = VALUES(device_name), platform = VALUES(platform), last_active_at = NOW()`,
                [user.id, device_token, device_name || null, platform || 'w']
            );
        }

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
