import express from 'express';
import * as authController from '../controller/auth/auth.controller.js';
import * as otpController from '../controller/auth/otp.controller.js';
import { validate } from '../middlewares/validate.middleware.js';
import { requestOTPSchema, verifyOTPSchema, adminRegisterSchema, adminLoginSchema } from '../validations/auth.validation.js';
import { otpLimiter, otpBlocker, verifyOtpLimiter, verifyOtpBlocker } from '../config/rateLimiter.js';
import authMiddleware, { authorizeRole } from '../middlewares/verifyMiddleware.js';

const router = express.Router();

// Request OTP (Users)
router.post('/request-otp', otpBlocker, otpLimiter, validate(requestOTPSchema), otpController.requestOTP);

// Resend OTP (Users)
router.post('/resend-otp', otpBlocker, otpLimiter, validate(requestOTPSchema), otpController.resendOTP);

// Verify OTP (Users) - Secured with rate limits
router.post('/verify-otp', verifyOtpBlocker, verifyOtpLimiter, validate(verifyOTPSchema), otpController.verifyOTP);

// Admin / Sub-Admin Register
router.post('/admin/register', validate(adminRegisterSchema), authController.adminRegister);

// Admin / Sub-Admin Login
router.post('/admin/login', validate(adminLoginSchema), authController.adminLogin);

// Logout (Authenticated)
router.post('/logout', authMiddleware, authController.logOut);

// Refresh Token
router.post('/refresh-token', authController.refreshToken);

export default router;
