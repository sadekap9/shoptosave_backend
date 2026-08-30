import express from 'express';
import * as authController from '../controller/auth/auth.controller.js';
import * as otpController from '../controller/auth/otp.controller.js';
import { validate } from '../middlewares/validate.middleware.js';
import { requestOTPSchema, verifyOTPSchema, resendOTPSchema, startAuthSchema, verifyGeneratedPinSchema, loginPinSchema, adminRegisterSchema, adminLoginSchema } from '../validations/auth.validation.js';
import { otpLimiter, otpBlocker, verifyOtpLimiter, verifyOtpBlocker, loginBlocker, loginLimiter } from '../config/rateLimiter.js';
import authMiddleware, { authorizeRole } from '../middlewares/verifyMiddleware.js';

const router = express.Router();

// Request OTP (Send OTP to user)
router.post('/request-otp', otpBlocker, otpLimiter, validate(requestOTPSchema), otpController.requestOTP);

// Resend OTP
router.post('/resend-otp', otpBlocker, otpLimiter, validate(resendOTPSchema), otpController.resendOTP);

// Start Auth (checks phone, sends OTP if new user)
router.post('/start', otpBlocker, otpLimiter, validate(startAuthSchema), otpController.startAuth);

// Verify OTP (Users)
router.post('/verify-otp', verifyOtpBlocker, verifyOtpLimiter, validate(verifyOTPSchema), otpController.verifyOTP);

// Verify Generated PIN
router.post('/verify-generated-pin', loginBlocker, loginLimiter, validate(verifyGeneratedPinSchema), authController.verifyGeneratedPin);

// Login PIN
router.post('/login-pin', loginBlocker, loginLimiter, validate(loginPinSchema), authController.loginPin);

// Admin / Sub-Admin Register
router.post('/admin/register', validate(adminRegisterSchema), authController.adminRegister);

// Admin / Sub-Admin Login
router.post('/admin/login', loginBlocker, loginLimiter, validate(adminLoginSchema), authController.adminLogin);

// Logout (Authenticated)
router.post('/logout', authMiddleware, authController.logOut);

// Refresh Token
router.post('/refresh-token', authController.refreshToken);

export default router;
