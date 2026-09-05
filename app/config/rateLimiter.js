import rateLimit from 'express-rate-limit';
import net from 'net';

/**
 * Safely extract and validate client IP address for both IPv4 and IPv6.
 * Guarantees a valid IP string format to prevent ERR_ERL_INVALID_IP_ADDRESS.
 */
const getClientIp = (req) => {
  let rawIp = req.headers?.['x-forwarded-for'] || req.ip || req.socket?.remoteAddress || '';
  
  if (typeof rawIp === 'string' && rawIp.includes(',')) {
    rawIp = rawIp.split(',')[0].trim();
  }

  if (typeof rawIp !== 'string') {
    return '127.0.0.1';
  }

  let ip = rawIp.trim();

  // 1. Handle bracketed IPv6 with port e.g. [::1]:8080 or [2001:db8::1]:3000
  if (ip.startsWith('[') && ip.includes(']:')) {
    ip = ip.substring(1, ip.indexOf(']:'));
  } 
  // 2. Handle IPv4 with port e.g. 127.0.0.1:8080
  else if (ip.includes(':') && !ip.includes('::')) {
    const parts = ip.split(':');
    if (parts.length === 2 && net.isIP(parts[0]) === 4) {
      ip = parts[0];
    }
  }

  // Validate using Node.js net module (4 = IPv4, 6 = IPv6)
  if (net.isIP(ip)) {
    return ip;
  }

  return '127.0.0.1';
};

// Common rate limiter default settings
const commonLimiterOptions = {
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => getClientIp(req),
  validate: { ip: false, trustProxy: false }
};

// 1. General API limiter for all routes
export const apiLimiter = rateLimit({
  ...commonLimiterOptions,
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  message: { success: false, error: 'Too many requests, please try again later.' }
});

// 2. Specific limiters mapping
export const loginLimiter = rateLimit({
  ...commonLimiterOptions,
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { success: false, error: 'Too many login attempts. Please try again later.' }
});

export const registerLimiter = rateLimit({
  ...commonLimiterOptions,
  windowMs: 15 * 60 * 1000,
  max: 3,
  message: { success: false, error: 'Too many register attempts. Please try again later.' }
});

export const otpLimiter = rateLimit({
  ...commonLimiterOptions,
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { success: false, error: 'Too many OTP request attempts. Please try again later.' }
});

export const verifyOtpLimiter = rateLimit({
  ...commonLimiterOptions,
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { success: false, error: 'Too many OTP verification attempts. Please try again later.' }
});

// Block checkers are now dummy middlewares because express-rate-limit handles blocking natively
export const loginBlocker = (req, res, next) => next();
export const registerBlocker = (req, res, next) => next();
export const otpBlocker = (req, res, next) => next();
export const verifyOtpBlocker = (req, res, next) => next();

// Keep reset helper as a dummy function for backward compatibility
export const resetRateLimiter = async () => {};

