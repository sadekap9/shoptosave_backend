import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { executeQuery } from '../../config/dbConfig.js';
import { sendSMS } from '../../helpers/sms.helper.js';
import { sendEmailOTP } from '../../helpers/email.helper.js';
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
    const phoneVal = data.phone || data.mobile;
    const normalizedPhone = normalizePhone(phoneVal);
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

        // Generate 4 digit OTP
        const otp = isDummy ? DUMMY_USER.OTP : Math.floor(1000 + Math.random() * 9000).toString();
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
            `Your ShopToSave OTP is ${otp}. It is valid for 10 minutes. Do not share this code with anyone. - NEWTRONE`
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

const otpVerificationSuccessCache = new Map();
const pinAttemptsCache = new Map();

/**
 * Start Authentication Service
 */
export const startAuthService = async (data) => {
    const { mobile } = data;
    const normalizedPhone = normalizePhone(mobile);
    const isDummy = normalizedPhone === DUMMY_USER.PHONE;

    try {
        // Check if user exists and has a PIN
        const users = await executeQuery('SELECT id, is_active, pin FROM user_master WHERE phone = ?', [normalizedPhone]);
        
        if (users.length > 0 && users[0].pin !== null && users[0].pin !== '') {
            // Existing user
            const user = users[0];
            if (user.is_active === 0) {
                return {
                    success: false,
                    statusCode: 403,
                    message: 'Your account is inactive. Please contact support.'
                };
            }
            return {
                success: true,
                statusCode: 200,
                message: 'User found',
                data: {
                    exists: true
                }
            };
        }

        // New user (or user without a PIN): Cooldown check
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

        // Generate 4 digit OTP
        const otp = isDummy ? DUMMY_USER.OTP : Math.floor(1000 + Math.random() * 9000).toString();
        const otpHashed = hashOTP(otp);
        const expiresAt = Date.now() + 5 * 60 * 1000; // 5 mins expiry

        // Store OTP details securely in-memory
        secureOtpCache.set(normalizedPhone, {
            otpHash: otpHashed,
            expiresAt,
            attempts: 0,
            createdAt: Date.now()
        });

        // Insert or update user
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
                data: { exists: false }
            };
        }

        // Dispatch OTP via SMS Helper
        const smsResult = await sendSMS(
            normalizedPhone,
            `Your ShopToSave OTP is ${otp}. It is valid for 10 minutes. Do not share this code with anyone. - NEWTRONE`
        );

        return {
            success: true,
            statusCode: 200,
            message: smsResult.isDummy 
                ? 'OTP sent successfully (Dummy Log Mode)' 
                : 'OTP sent successfully via SMS',
            data: { exists: false }
        };

    } catch (error) {
        logger.error('startAuthService Error', { error: error.message });
        return {
            success: false,
            statusCode: 500,
            message: 'Error starting authentication'
        };
    }
};

/**
 * Verify OTP Service (Login/Register)
 */
export const verifyOTPService = async (data, meta) => {
    const phoneVal = data.phone || data.mobile;
    const { otp } = data;
    const normalizedPhone = normalizePhone(phoneVal);
    const isDummy = normalizedPhone === DUMMY_USER.PHONE && otp === DUMMY_USER.OTP;

    try {
        let users = await executeQuery('SELECT * FROM user_master WHERE phone = ?', [normalizedPhone]);
        if (users.length === 0) {
            return {
                success: false,
                statusCode: 404,
                message: 'User not found'
            };
        }

        const user = users[0];

        if (user.is_active === 0) {
            return {
                success: false,
                statusCode: 403,
                message: 'Your account is inactive. Please contact support.'
            };
        }

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

        // Set OTP verification success state in cache (valid for 15 minutes)
        otpVerificationSuccessCache.set(normalizedPhone, Date.now() + 15 * 60 * 1000);

        return {
            success: true,
            statusCode: 200,
            message: 'OTP verified successfully',
            data: {
                verified: true
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
 * Create PIN Service (handles User PIN Creation after successful OTP verification)
 */
export const createPinService = async (data, meta) => {
    const { mobile, pin, confirmPin } = data;
    const { ip_address, device_token, platform, device_name } = meta;
    const normalizedPhone = normalizePhone(mobile);

    try {
        // 1. Confirm OTP was successfully verified
        const verifyExpiry = otpVerificationSuccessCache.get(normalizedPhone);
        if (!verifyExpiry || Date.now() > verifyExpiry) {
            return {
                success: false,
                statusCode: 400,
                message: 'OTP verification session expired or not found. Please restart authentication.'
            };
        }

        // 2. Validate matching PIN and confirm PIN
        if (pin !== confirmPin) {
            return {
                success: false,
                statusCode: 400,
                message: 'PIN and confirm PIN do not match'
            };
        }

        // 3. Retrieve user
        const users = await executeQuery('SELECT * FROM user_master WHERE phone = ?', [normalizedPhone]);
        if (users.length === 0) {
            return {
                success: false,
                statusCode: 404,
                message: 'User not found'
            };
        }

        const user = users[0];

        if (user.is_active === 0) {
            return {
                success: false,
                statusCode: 403,
                message: 'Your account is inactive. Please contact support.'
            };
        }

        // 4. Update the user record with the chosen PIN
        await executeQuery('UPDATE user_master SET pin = ? WHERE id = ?', [pin, user.id]);

        // Clean up OTP verification session Cache
        otpVerificationSuccessCache.delete(normalizedPhone);

        // 5. Generate JWT Tokens
        const accessToken = jwt.sign(
            { id: user.id, phone: user.phone, role: user.role, email: user.email || '' },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        const refreshToken = jwt.sign(
            { id: user.id, phone: user.phone, role: user.role, email: user.email || '' },
            process.env.JWT_REFRESH_SECRET || 'refresh_secret',
            { expiresIn: '7d' }
        );

        const tokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        // Store Session in session_master
        const sessionQuery = `
            INSERT INTO session_master 
            (user_id, access_token, refresh_token, device_token, device_name, platform, ip_address, expires_at) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
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
            message: 'Registration successful',
            data: {
                token: accessToken,
                refreshToken: refreshToken,
                user: {
                    id: user.id,
                    mobile: user.phone
                }
            }
        };

    } catch (error) {
        logger.error('createPinService Error', { error: error.message });
        return {
            success: false,
            statusCode: 500,
            message: 'Error during PIN creation'
        };
    }
};

/**
 * Login PIN Service
 */
export const loginPinService = async (data, meta) => {
    const { mobile, pin } = data;
    const { ip_address, device_token, platform, device_name } = meta;
    const normalizedPhone = normalizePhone(mobile);

    try {
        const lockoutInfo = pinAttemptsCache.get(normalizedPhone);
        if (lockoutInfo && lockoutInfo.lockoutUntil && Date.now() < lockoutInfo.lockoutUntil) {
            return {
                success: false,
                statusCode: 400,
                message: `Too many failed attempts. Try again in ${Math.ceil((lockoutInfo.lockoutUntil - Date.now()) / 1000)} seconds.`
            };
        }

        const users = await executeQuery('SELECT * FROM user_master WHERE phone = ?', [normalizedPhone]);
        if (users.length === 0) {
            return {
                success: false,
                statusCode: 400,
                message: 'Invalid PIN'
            };
        }

        const user = users[0];

        if (user.is_active === 0) {
            return {
                success: false,
                statusCode: 403,
                message: 'Your account is inactive. Please contact support.'
            };
        }

        if (!user.pin || user.pin !== pin) {
            let current = lockoutInfo || { attempts: 0, lockoutUntil: 0 };
            current.attempts += 1;
            if (current.attempts >= 5) {
                current.lockoutUntil = Date.now() + 15 * 60 * 1000;
                pinAttemptsCache.set(normalizedPhone, current);
                return {
                    success: false,
                    statusCode: 400,
                    message: 'Too many invalid PIN attempts. Account locked for 15 minutes.'
                };
            } else {
                pinAttemptsCache.set(normalizedPhone, current);
                return {
                    success: false,
                    statusCode: 400,
                    message: 'Invalid PIN'
                };
            }
        }

        pinAttemptsCache.delete(normalizedPhone);

        const accessToken = jwt.sign(
            { id: user.id, phone: user.phone, role: user.role, email: user.email || '' },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        const refreshToken = jwt.sign(
            { id: user.id, phone: user.phone, role: user.role, email: user.email || '' },
            process.env.JWT_REFRESH_SECRET || 'refresh_secret',
            { expiresIn: '7d' }
        );

        const tokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        const sessionQuery = `
            INSERT INTO session_master 
            (user_id, access_token, refresh_token, device_token, device_name, platform, ip_address, expires_at) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
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
                token: accessToken,
                refreshToken: refreshToken,
                user: {
                    id: user.id,
                    mobile: user.phone
                }
            }
        };

    } catch (error) {
        logger.error('loginPinService Error', { error: error.message });
        return {
            success: false,
            statusCode: 500,
            message: 'Error during PIN login'
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
            const result = await executeQuery('DELETE FROM session_master WHERE user_id = ?', [userId]);
            return {
                success: true,
                statusCode: 200,
                message: `Successfully logged out from all devices (${result.affectedRows} sessions revoked).`
            };
        } else {
            const result = await executeQuery('DELETE FROM session_master WHERE access_token = ?', [token]);
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
        let decoded;
        try {
            decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET || 'refresh_secret');
        } catch (verifyError) {
            // Delete session from DB on token validation failure (expired/invalid)
            await executeQuery('DELETE FROM session_master WHERE refresh_token = ?', [refreshToken]);
            return {
                success: false,
                statusCode: 401,
                message: 'Invalid or expired refresh token'
            };
        }

        // Check if session exists and matches
        const sessionQuery = `
            SELECT s.*, u.is_active, u.role, u.email 
            FROM session_master s
            JOIN user_master u ON s.user_id = u.id
            WHERE s.refresh_token = ? AND s.user_id = ? AND s.expires_at > NOW()
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
            // Delete session from DB if user account is inactive
            await executeQuery('DELETE FROM session_master WHERE id = ?', [session.id]);
            return {
                success: false,
                statusCode: 403,
                message: 'User account is inactive.'
            };
        }

        // Generate new short-lived access token (1 hour)
        const newAccessToken = jwt.sign(
            { id: decoded.id, phone: decoded.phone, role: session.role, email: session.email || '' },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
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
            { id: user.id, phone: user.role === 1 || user.role === 2 ? '' : user.phone, role: user.role, email: user.email }, // Wait, let's keep original payload
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        const refreshToken = jwt.sign(
            { id: user.id, phone: user.phone, role: user.role, email: user.email },
            process.env.JWT_REFRESH_SECRET || 'refresh_secret',
            { expiresIn: '7d' }
        );

        const tokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        // Create Session
        await executeQuery(
            `INSERT INTO session_master (user_id, access_token, refresh_token, device_token, device_name, platform, ip_address, expires_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
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

const forgotPinSuccessCache = new Map();

/**
 * Forgot PIN Service
 */
export const forgotPinService = async (data) => {
    const { identifier } = data;
    if (!identifier) {
        return {
            success: false,
            statusCode: 400,
            message: 'Identifier is required'
        };
    }

    const isEmail = identifier.includes('@');
    let channel = 'mobile';
    let targetUser = null;
    let queryValue = identifier;

    try {
        if (isEmail) {
            channel = 'email';
            const normalizedEmail = identifier.toLowerCase().trim();
            queryValue = normalizedEmail;
            const users = await executeQuery('SELECT * FROM user_master WHERE email = ?', [normalizedEmail]);
            if (users.length > 0) {
                targetUser = users[0];
            }
        } else {
            channel = 'mobile';
            const normalizedPhone = normalizePhone(identifier);
            queryValue = normalizedPhone;
            const users = await executeQuery('SELECT * FROM user_master WHERE phone = ?', [normalizedPhone]);
            if (users.length > 0) {
                targetUser = users[0];
            }
        }

        // Send email/SMS even if user doesn't exist in DB (user requested)

        // Check if there is an active OTP request cooldown (60 seconds)
        const cacheKey = `forgot-${queryValue}`;
        const cachedOtp = secureOtpCache.get(cacheKey);
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
        const isDummy = (channel === 'mobile' && queryValue === DUMMY_USER.PHONE) || (channel === 'email' && queryValue === 'dummy@shoptosave.in');
        const otp = isDummy ? '123456' : Math.floor(100000 + Math.random() * 900000).toString();
        const otpHashed = hashOTP(otp);
        const expiresAt = Date.now() + 5 * 60 * 1000; // 5 mins expiry

        secureOtpCache.set(cacheKey, {
            otpHash: otpHashed,
            expiresAt,
            attempts: 0,
            createdAt: Date.now()
        });

        // Dispatch via the selected channel
        if (channel === 'mobile') {
            await sendSMS(
                queryValue,
                `Your ShopToSave OTP is ${otp}. It is valid for 10 minutes. Do not share this code with anyone. - NEWTRONE`
            );
        } else {
            await sendEmailOTP(queryValue, otp);
        }

        return {
            success: true,
            statusCode: 200,
            message: 'OTP sent successfully',
            data: {
                otpSent: true,
                channel: channel
            }
        };

    } catch (error) {
        logger.error('forgotPinService Error', { error: error.message });
        return {
            success: false,
            statusCode: 500,
            message: 'Error during forgot PIN initialization'
        };
    }
};

/**
 * Verify Forgot PIN OTP Service
 */
export const verifyForgotPinOTPService = async (data) => {
    const { identifier, otp } = data;
    if (!identifier || !otp) {
        return {
            success: false,
            statusCode: 400,
            message: 'Identifier and OTP are required'
        };
    }

    const isEmail = identifier.includes('@');
    let queryValue = identifier;

    try {
        if (isEmail) {
            queryValue = identifier.toLowerCase().trim();
        } else {
            queryValue = normalizePhone(identifier);
        }

        // Bypass user existence check on verification to allow any email/mobile to verify OTP successfully
        const cacheKey = `forgot-${queryValue}`;
        const cachedOtp = secureOtpCache.get(cacheKey);
        const isDummy = (isEmail && queryValue === 'dummy@shoptosave.in' && otp === '123456') || (!isEmail && queryValue === DUMMY_USER.PHONE && otp === '123456');

        if (!isDummy) {
            if (!cachedOtp || Date.now() > cachedOtp.expiresAt) {
                secureOtpCache.delete(cacheKey);
                return {
                    success: false,
                    statusCode: 400,
                    message: 'OTP has expired. Please request a new one.'
                };
            }

            if (cachedOtp.attempts >= 3) {
                secureOtpCache.delete(cacheKey);
                return {
                    success: false,
                    statusCode: 400,
                    message: 'Too many failed attempts. Please request a new OTP.'
                };
            }

            const inputHash = hashOTP(otp);
            if (cachedOtp.otpHash !== inputHash) {
                cachedOtp.attempts += 1;
                secureOtpCache.set(cacheKey, cachedOtp);
                const remaining = 3 - cachedOtp.attempts;
                if (remaining <= 0) {
                    secureOtpCache.delete(cacheKey);
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

        // Clean up OTP from cache
        secureOtpCache.delete(cacheKey);

        // Store verification state (expires in 15 minutes)
        forgotPinSuccessCache.set(`reset-${queryValue}`, Date.now() + 15 * 60 * 1000);

        return {
            success: true,
            statusCode: 200,
            message: 'OTP verified successfully',
            data: {
                verified: true
            }
        };

    } catch (error) {
        logger.error('verifyForgotPinOTPService Error', { error: error.message });
        return {
            success: false,
            statusCode: 500,
            message: 'Error verifying OTP'
        };
    }
};

/**
 * Reset PIN Service
 */
export const resetPinService = async (data, meta) => {
    const { identifier, pin, confirmPin } = data;
    const { ip_address, device_token, platform, device_name } = meta;
    if (!identifier || !pin || !confirmPin) {
        return {
            success: false,
            statusCode: 400,
            message: 'All fields are required'
        };
    }

    if (pin !== confirmPin) {
        return {
            success: false,
            statusCode: 400,
            message: 'PIN and confirm PIN do not match'
        };
    }

    const isEmail = identifier.includes('@');
    let queryValue = identifier;

    try {
        if (isEmail) {
            queryValue = identifier.toLowerCase().trim();
        } else {
            queryValue = normalizePhone(identifier);
        }

        // Check if reset session is valid
        const resetExpiry = forgotPinSuccessCache.get(`reset-${queryValue}`);
        if (!resetExpiry || Date.now() > resetExpiry) {
            return {
                success: false,
                statusCode: 400,
                message: 'Reset session expired or not found. Please restart the Forgot PIN flow.'
            };
        }

        const users = await executeQuery('SELECT * FROM user_master WHERE phone = ? OR email = ?', [queryValue, queryValue]);
        if (users.length === 0) {
            return {
                success: false,
                statusCode: 404,
                message: 'User not found'
            };
        }

        const user = users[0];
        if (user.is_active === 0) {
            return {
                success: false,
                statusCode: 403,
                message: 'Your account is inactive. Please contact support.'
            };
        }

        // Update database with the new PIN
        await executeQuery('UPDATE user_master SET pin = ? WHERE id = ?', [pin, user.id]);

        // Invalidate forgot session cache
        forgotPinSuccessCache.delete(`reset-${queryValue}`);

        // Invalidate existing sessions in session_master for security
        await executeQuery('DELETE FROM session_master WHERE user_id = ?', [user.id]);

        // Generate new JWT tokens
        const accessToken = jwt.sign(
            { id: user.id, phone: user.phone, role: user.role, email: user.email || '' },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        const refreshToken = jwt.sign(
            { id: user.id, phone: user.phone, role: user.role, email: user.email || '' },
            process.env.JWT_REFRESH_SECRET || 'refresh_secret',
            { expiresIn: '7d' }
        );

        const tokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        // Store new session
        const sessionQuery = `
            INSERT INTO session_master 
            (user_id, access_token, refresh_token, device_token, device_name, platform, ip_address, expires_at) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
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
            message: 'PIN reset successfully',
            data: {
                token: accessToken,
                refreshToken: refreshToken,
                user: {
                    id: user.id,
                    mobile: user.phone
                }
            }
        };

    } catch (error) {
        logger.error('resetPinService Error', { error: error.message });
        return {
            success: false,
            statusCode: 500,
            message: 'Error resetting PIN'
        };
    }
};
