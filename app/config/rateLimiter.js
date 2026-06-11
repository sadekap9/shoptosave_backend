import rateLimit from 'express-rate-limit';

// Map to store blocked IPs and their block expiry time
const blockedIPs = new Map();

/**
 * Get client IP address accurately
 */
const getClientIp = (req) => {
  return req.ip || req.socket.remoteAddress || '127.0.0.1';
};

/**
 * Key generator for rate limiter
 */
const customKeyGenerator = (req) => {
  return getClientIp(req);
};

/**
 * Middleware to check if an IP is currently blocked
 * @param {string} type - The type of action (login, register, otp)
 */
export const blockChecker = (type) => (req, res, next) => {
  const ip = getClientIp(req);
  const key = `${type}_${ip}`;
  const blockedUntil = blockedIPs.get(key);

  if (blockedUntil && blockedUntil > Date.now()) {
    const remainingTime = Math.ceil((blockedUntil - Date.now()) / 1000 / 60);
    return res.status(429).json({
      success: false,
      errors: [{ message: `Too many ${type} attempts. Your IP is temporarily blocked. Try again after ${remainingTime} minutes.` }],
      result: {}
    });
  }

  next();
};

/**
 * Helper to create a rate limiter with auto-blocking
 */
const createLimiter = (type, maxAttempts, windowMs = 15 * 60 * 1000, blockDurationMs = 6 * 60 * 60 * 1000) =>
  rateLimit({
    windowMs: windowMs,
    max: maxAttempts,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: customKeyGenerator,
    
    handler: (req, res) => {
      const ip = getClientIp(req);
      const key = `${type}_${ip}`;
      const blockUntil = Date.now() + blockDurationMs;
      
      blockedIPs.set(key, blockUntil);

      return res.status(429).json({
        success: false,
        errors: [{ message: `Too many ${type} attempts. Your IP is blocked for 6 hours.` }],
        result: {
            retryAfter: Math.ceil(blockDurationMs / 1000)
        }
      });
    }
  });

// Export specific limiters and blockers
export const loginBlocker = blockChecker('login');
export const loginLimiter = createLimiter('login', 5, 15 * 60 * 1000, 6 * 60 * 60 * 1000);

export const registerBlocker = blockChecker('register');
export const registerLimiter = createLimiter('register', 3, 15 * 60 * 1000, 6 * 60 * 60 * 1000);

export const otpBlocker = blockChecker('otp');
export const otpLimiter = createLimiter('otp', 5, 15 * 60 * 1000, 6 * 60 * 60 * 1000);

export const verifyOtpBlocker = blockChecker('verify-otp');
export const verifyOtpLimiter = createLimiter('verify-otp', 5, 15 * 60 * 1000, 6 * 60 * 60 * 1000);

/**
 * Utility to reset all rate limiters (e.g., for testing or admin cleanup)
 */
export const resetRateLimiter = () => {
  blockedIPs.clear();
};

// General API limiter for all routes
export const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        errors: [{ message: "Too many requests from this IP, please try again after 15 minutes" }],
        result: {}
    }
});
