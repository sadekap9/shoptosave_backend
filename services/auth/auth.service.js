import jwt from 'jsonwebtoken';
import { executeQuery } from '../../utils/db.js';
import { sendSMS } from '../../utils/sms.helper.js';
import logger from '../../utils/logger.js';
import { DUMMY_USER } from '../../constant/constant.js';

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
    
    // Generate 6 digit OTP
    const otp = isDummy ? DUMMY_USER.OTP : Math.floor(100000 + Math.random() * 900000).toString();
    
    // Check if user exists
    const users = await executeQuery('SELECT id FROM user_master WHERE phone = ?', [normalizedPhone]);
    
    if (users.length === 0) {
        // Create user if not exists
        await executeQuery(
            'INSERT INTO user_master (phone, otp, name, email) VALUES (?, ?, NULL, NULL)',
            [normalizedPhone, otp]
        );
    } else {
        // Update OTP for existing user
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
};

/**
 * Verify OTP Service (Login/Register)
 */
export const verifyOTPService = async (data, meta) => {
    const { phone, otp } = data;
    const { ip_address, device_token, platform } = meta;
    const normalizedPhone = normalizePhone(phone);

    const isDummy = normalizedPhone === DUMMY_USER.PHONE && otp === DUMMY_USER.OTP;

    // Check user and OTP
    let users = await executeQuery('SELECT * FROM user_master WHERE phone = ?', [normalizedPhone]);
    
    if (users.length === 0) {
        if (isDummy) {
            // Auto-create dummy user if not exists
            await executeQuery(
                'INSERT INTO user_master (phone, name, email, is_active) VALUES (?, ?, ?, 1)',
                [normalizedPhone, 'Dummy User', 'dummy@shop2save.com']
            );
            users = await executeQuery('SELECT * FROM user_master WHERE phone = ?', [normalizedPhone]);
        } else {
            return {
                success: false,
                statusCode: 404,
                message: 'User not found. Please request OTP first.'
            };
        }
    }

    const user = users[0];

    // Verify OTP (Check if matches and maybe add expiry check if you have a column for it)
    if (!isDummy && (!user.otp || user.otp !== otp)) {
        return {
            success: false,
            statusCode: 400,
            message: 'Invalid or expired OTP'
        };
    }

    // Check if user is active
    if (user.is_active === 0) {
        return {
            success: false,
            statusCode: 403,
            message: 'Your account is inactive. Please contact support.'
        };
    }

    // Clear OTP after successful verification
    await executeQuery('UPDATE user_master SET otp = NULL WHERE id = ?', [user.id]);

    // Generate JWT Tokens
    const accessToken = jwt.sign(
        { id: user.id, phone: user.phone },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '1d' }
    );

    const refreshToken = jwt.sign(
        { id: user.id, phone: user.phone },
        process.env.JWT_REFRESH_SECRET || 'refresh_secret',
        { expiresIn: '7d' }
    );

    // Store session in session_master
    try {
        const sessionQuery = `INSERT INTO session_master (user_id, access_token, refresh_token, ip_address, device_token, platform) VALUES (?, ?, ?, ?, ?, ?)`;
        await executeQuery(sessionQuery, [user.id, accessToken, refreshToken, ip_address, device_token, platform || 'w']);
    } catch (e) {
        logger.error('Session storage failed', { error: e.message });
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
export const logoutService = async (token) => {
    try {
        await executeQuery('DELETE FROM session_master WHERE access_token = ?', [token]);
        return {
            success: true,
            statusCode: 200,
            message: 'Logout successful'
        };
    } catch (error) {
        return {
            success: false,
            statusCode: 500,
            message: 'Error during logout'
        };
    }
};

/**
 * Refresh Token Service
 */
export const refreshTokenService = async (refreshToken) => {
    try {
        const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
        
        // Check if session exists
        const sessions = await executeQuery('SELECT * FROM session_master WHERE refresh_token = ? AND user_id = ?', [refreshToken, decoded.id]);
        
        if (sessions.length === 0) {
            return { success: false, statusCode: 401, message: 'Invalid refresh token' };
        }

        const accessToken = jwt.sign(
            { id: decoded.id, phone: decoded.phone },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '1d' }
        );

        // Update session with new access token
        await executeQuery('UPDATE session_master SET access_token = ? WHERE refresh_token = ?', [accessToken, refreshToken]);

        return {
            success: true,
            statusCode: 200,
            message: 'New access token generated',
            data: { access_token: accessToken }
        };
    } catch (error) {
        return { success: false, statusCode: 401, message: 'Invalid or expired refresh token' };
    }
};

