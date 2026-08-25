import rateLimit from 'express-rate-limit';

const getClientIp = (req) => {
  let ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
  if (ip.includes(',')) {
    ip = ip.split(',')[0].trim();
  }
  if (ip.includes(':')) {
    const parts = ip.split(':');
    if (parts.length > 2) {
      if (ip.startsWith('[') && ip.includes(']:')) {
        ip = ip.substring(1, ip.indexOf(']:'));
      }
    } else {
      ip = parts[0];
    }
  }
  return ip || '127.0.0.1';
};

// 1. General API limiter for all routes
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getClientIp,
  message: { success: false, error: 'Too many requests, please try again later.' }
});

// 2. Specific limiters mapping (replacing DB limiters, keeping exports for backward compatibility)
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getClientIp,
  message: { success: false, error: 'Too many login attempts. Please try again later.' }
});

export const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getClientIp,
  message: { success: false, error: 'Too many register attempts. Please try again later.' }
});

export const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getClientIp,
  message: { success: false, error: 'Too many OTP request attempts. Please try again later.' }
});

export const verifyOtpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getClientIp,
  message: { success: false, error: 'Too many OTP verification attempts. Please try again later.' }
});

// Block checkers are now dummy middlewares because express-rate-limit handles blocking natively
export const loginBlocker = (req, res, next) => next();
export const registerBlocker = (req, res, next) => next();
export const otpBlocker = (req, res, next) => next();
export const verifyOtpBlocker = (req, res, next) => next();

// Keep reset helper as a dummy function for backward compatibility
export const resetRateLimiter = async () => {};
