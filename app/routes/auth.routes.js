import express from 'express';
import * as authController from '../controller/auth/auth.controller.js';
import * as otpController from '../controller/auth/otp.controller.js';
import { validate } from '../middlewares/validate.middleware.js';
import { requestOTPSchema, verifyOTPSchema } from '../validations/auth.validation.js';
import { otpLimiter, otpBlocker } from '../config/rateLimiter.js';

const router = express.Router();

// Request OTP
router.post('/request-otp', otpBlocker, otpLimiter, validate(requestOTPSchema), otpController.requestOTP);

// Resend OTP
router.post('/resend-otp', otpBlocker, otpLimiter, validate(requestOTPSchema), otpController.resendOTP);

// Verify OTP
router.post('/verify-otp', validate(verifyOTPSchema), otpController.verifyOTP);

// Logout
router.post('/logout', authController.logOut);

// Refresh Token
router.post('/refresh-token', authController.refreshToken);

export default router;
