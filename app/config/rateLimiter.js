import pool from './dbConfig.js';
import logger from '../utils/logger.js';

/**
 * Get client IP address accurately
 */
const getClientIp = (req) => {
  return req.ip || req.socket.remoteAddress || '127.0.0.1';
};

/**
 * Middleware to check if an IP is currently blocked
 * @param {string} type - The type of action (login, register, otp)
 */
export const blockChecker = (type) => async (req, res, next) => {
  try {
    const ip = getClientIp(req);
    const key = `${type}_${ip}`;

    // 1. Auto-evict expired block entries in the check query
    await pool.query(
      'UPDATE rate_limit_logs SET blocked_until = NULL WHERE rate_key = ? AND blocked_until < NOW()',
      [key]
    );

    // 2. Check if currently blocked
    const [[record]] = await pool.query(
      'SELECT blocked_until FROM rate_limit_logs WHERE rate_key = ?',
      [key]
    );

    if (record && record.blocked_until) {
      const blockedUntil = new Date(record.blocked_until);
      const remainingTime = Math.ceil((blockedUntil.getTime() - Date.now()) / 1000 / 60);
      if (remainingTime > 0) {
        return res.status(429).json({
          success: false,
          errors: [{ message: `Too many ${type} attempts. Your IP is temporarily blocked. Try again after ${remainingTime} minutes.` }],
          result: {}
        });
      }
    }
  } catch (error) {
    logger.error(`Error in blockChecker for ${type}`, { error: error.message });
  }

  next();
};

/**
 * Helper to create a rate limiter with auto-blocking
 */
const createLimiter = (type, maxAttempts, windowMs = 15 * 60 * 1000, blockDurationMs = 6 * 60 * 60 * 1000) => {
  return async (req, res, next) => {
    try {
      const ip = getClientIp(req);
      const key = `${type}_${ip}`;
      const now = new Date();

      // 1. Clean up expired blocks first
      await pool.query(
        'UPDATE rate_limit_logs SET blocked_until = NULL WHERE rate_key = ? AND blocked_until < NOW()',
        [key]
      );

      // 2. Fetch current record
      const [[record]] = await pool.query(
        'SELECT * FROM rate_limit_logs WHERE rate_key = ?',
        [key]
      );

      if (record) {
        const windowStart = new Date(record.window_start);
        const isWindowExpired = windowStart.getTime() + windowMs < Date.now();

        // If currently blocked, return 429
        if (record.blocked_until) {
          const blockedUntil = new Date(record.blocked_until);
          const remainingTimeMs = blockedUntil.getTime() - Date.now();
          if (remainingTimeMs > 0) {
            return res.status(429).json({
              success: false,
              errors: [{ message: `Too many ${type} attempts. Your IP is temporarily blocked.` }],
              result: { retryAfter: Math.ceil(remainingTimeMs / 1000) }
            });
          }
        }

        if (isWindowExpired) {
          // Reset window
          await pool.query(
            'UPDATE rate_limit_logs SET hit_count = 1, window_start = NOW(), blocked_until = NULL WHERE rate_key = ?',
            [key]
          );
        } else {
          // Increment hits
          const newHits = record.hit_count + 1;
          if (newHits > maxAttempts) {
            const blockUntil = new Date(Date.now() + blockDurationMs);
            await pool.query(
              'UPDATE rate_limit_logs SET hit_count = ?, blocked_until = ? WHERE rate_key = ?',
              [newHits, blockUntil, key]
            );
            return res.status(429).json({
              success: false,
              errors: [{ message: `Too many ${type} attempts. Your IP is blocked for ${Math.ceil(blockDurationMs / (60 * 60 * 1000))} hours.` }],
              result: {
                retryAfter: Math.ceil(blockDurationMs / 1000)
              }
            });
          } else {
            await pool.query(
              'UPDATE rate_limit_logs SET hit_count = ? WHERE rate_key = ?',
              [newHits, key]
            );
          }
        }
      } else {
        // Create new record
        await pool.query(
          `INSERT INTO rate_limit_logs (rate_key, hit_count, window_start, blocked_until)
           VALUES (?, 1, NOW(), NULL)
           ON DUPLICATE KEY UPDATE hit_count = 1, window_start = NOW(), blocked_until = NULL`,
          [key]
        );
      }
    } catch (error) {
      logger.error(`Error in rate limiter for ${type}`, { error: error.message });
      // Fallback: proceed
    }
    next();
  };
};

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
export const resetRateLimiter = async () => {
  try {
    await pool.query('DELETE FROM rate_limit_logs');
  } catch (error) {
    logger.error('Error clearing rate limit logs', { error: error.message });
  }
};

// General API limiter for all routes
export const apiLimiter = async (req, res, next) => {
  try {
    const ip = getClientIp(req);
    const key = `api_${ip}`;
    const windowMs = 15 * 60 * 1000;
    const maxAttempts = 100;

    const [[record]] = await pool.query(
      'SELECT * FROM rate_limit_logs WHERE rate_key = ?',
      [key]
    );

    if (record) {
      const windowStart = new Date(record.window_start);
      const isWindowExpired = windowStart.getTime() + windowMs < Date.now();

      if (isWindowExpired) {
        await pool.query(
          'UPDATE rate_limit_logs SET hit_count = 1, window_start = NOW() WHERE rate_key = ?',
          [key]
        );
      } else {
        const newHits = record.hit_count + 1;
        if (newHits > maxAttempts) {
          return res.status(429).json({
            success: false,
            errors: [{ message: "Too many requests from this IP, please try again after 15 minutes" }],
            result: {}
          });
        } else {
          await pool.query(
            'UPDATE rate_limit_logs SET hit_count = ? WHERE rate_key = ?',
            [newHits, key]
          );
        }
      }
    } else {
      await pool.query(
        `INSERT INTO rate_limit_logs (rate_key, hit_count, window_start, blocked_until)
         VALUES (?, 1, NOW(), NULL)
         ON DUPLICATE KEY UPDATE hit_count = 1, window_start = NOW()`,
        [key]
      );
    }
  } catch (error) {
    logger.error('Error in api rate limiter', { error: error.message });
  }
  next();
};
