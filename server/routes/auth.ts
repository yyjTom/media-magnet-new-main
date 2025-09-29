import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../config/database.js';
import { sendVerificationEmail, generateVerificationCode, testEmailConfiguration } from '../services/emailService.js';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { authenticateToken, type AuthRequest } from '../middleware/auth.js';

const router = express.Router();

// JWT secret
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

interface User extends RowDataPacket {
  id: number;
  email: string;
  password: string;
  email_verified: boolean;
  verification_code: string | null;
  verification_expires: Date | null;
}

// Register
router.post('/register', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Validate password strength
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Check existing user
    const [existingUsers] = await pool.execute<User[]>(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );

    if (existingUsers.length > 0) {
      return res.status(400).json({ error: 'Email is already registered' });
    }

    // 加密密码
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Generate verification code
    const verificationCode = generateVerificationCode();
    const verificationExpires = new Date(Date.now() + 10 * 60 * 1000); // expires in 10 minutes

    // Insert user
    const [result] = await pool.execute<ResultSetHeader>(
      'INSERT INTO users (email, password, verification_code, verification_expires) VALUES (?, ?, ?, ?)',
      [email, hashedPassword, verificationCode, verificationExpires]
    );

    // Send email verification code
    await sendVerificationEmail(email, verificationCode);

    res.status(201).json({
      message: 'Registered successfully. Verification code has been sent to your email',
      userId: result.insertId
    });

  } catch (error) {
    console.error('Registration failed:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Verify email
router.post('/verify-email', async (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({ error: 'Email and verification code are required' });
    }

    // Find user
    const [users] = await pool.execute<User[]>(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = users[0];

    // Check verification code
    if (user.verification_code !== code) {
      return res.status(400).json({ error: 'Invalid verification code' });
    }

    // Check code expiry
    if (!user.verification_expires || new Date() > user.verification_expires) {
      return res.status(400).json({ error: 'Verification code has expired' });
    }

    // Update user state
    await pool.execute(
      'UPDATE users SET email_verified = TRUE, verification_code = NULL, verification_expires = NULL WHERE id = ?',
      [user.id]
    );

    // Generate JWT token
    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, {
      expiresIn: '7d'
    });

    res.json({
      message: 'Email verified successfully',
      token,
      user: {
        id: user.id,
        email: user.email,
        emailVerified: true
      }
    });

  } catch (error) {
    console.error('Email verification failed:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // 查找用户
    const [users] = await pool.execute<User[]>(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );

    if (users.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = users[0];

    // Check email verified
    if (!user.email_verified) {
      return res.status(401).json({ error: 'Please verify your email first' });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate JWT token
    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, {
      expiresIn: '7d'
    });

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        emailVerified: user.email_verified
      }
    });

  } catch (error) {
    console.error('Login failed:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Resend verification code
router.post('/resend-verification', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // 查找用户
    const [users] = await pool.execute<User[]>(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = users[0];

    if (user.email_verified) {
      return res.status(400).json({ error: 'Email already verified' });
    }

    // Generate a new code
    const verificationCode = generateVerificationCode();
    const verificationExpires = new Date(Date.now() + 10 * 60 * 1000);

    // Update the code
    await pool.execute(
      'UPDATE users SET verification_code = ?, verification_expires = ? WHERE id = ?',
      [verificationCode, verificationExpires, user.id]
    );

    // Send the code
    await sendVerificationEmail(email, verificationCode);

    res.json({ message: 'Verification code resent' });

  } catch (error) {
    console.error('Resend verification failed:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Test email configuration (for development only)
router.get('/test-email-config', async (req, res) => {
  try {
    console.log('Start testing email configuration...');
    console.log('EMAIL_HOST:', process.env.EMAIL_HOST);
    console.log('EMAIL_PORT:', process.env.EMAIL_PORT);
    console.log('EMAIL_USER:', process.env.EMAIL_USER );
    console.log('EMAIL_PASS:', process.env.EMAIL_PASS );
    
    const isConfigValid = await testEmailConfiguration();
    
    if (isConfigValid) {
      res.json({ 
        success: true, 
        message: 'Email service is properly configured',
        config: {
          host: process.env.EMAIL_HOST || 'smtpdm.aliyun.com',
          port: process.env.EMAIL_PORT || '465',
          user: process.env.EMAIL_USER ? 'configured' : 'not configured',
          secure: process.env.EMAIL_SECURE || 'true'
        }
      });
    } else {
      res.status(500).json({ 
        success: false, 
        message: 'Email service misconfigured. Please check environment variables',
        debug: {
          host: process.env.EMAIL_HOST || 'not set',
          port: process.env.EMAIL_PORT || 'not set',
          user: process.env.EMAIL_USER ? 'configured' : 'not configured',
          pass: process.env.EMAIL_PASS ? 'configured' : 'not configured'
        }
      });
    }
  } catch (error) {
    console.error('Test email configuration failed:', error);
    res.status(500).json({ 
      success: false, 
      message: 'An error occurred while testing email configuration',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Save a submitted website to history
router.post('/history/website', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { url } = req.body as { url?: string };
    if (!url || typeof url !== 'string' || url.length < 4) {
      return res.status(400).json({ error: 'Invalid url' });
    }

    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const trimmed = url.trim();

    // De-duplicate: keep only once in 1 minute for same user+URL
    const [existing] = await pool.execute<RowDataPacket[]>(
      'SELECT id FROM user_website_history WHERE user_id = ? AND url = ? AND created_at > (NOW() - INTERVAL 1 MINUTE) ORDER BY id DESC LIMIT 1',
      [req.user.userId, trimmed]
    );

    if (Array.isArray(existing) && existing.length > 0) {
      return res.json({ message: 'Skipped duplicate' });
    }

    await pool.execute(
      'INSERT INTO user_website_history (user_id, url) VALUES (?, ?)',
      [req.user.userId, trimmed]
    );

    res.json({ message: 'Recorded' });
  } catch (error) {
    console.error('Save website history failed:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get user's website history (paginated)
router.get('/history/website', authenticateToken, async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const limitRaw = (req.query.limit as string) ?? '20';
    const offsetRaw = (req.query.offset as string) ?? '0';
    const limit = Math.max(1, Math.min(parseInt(limitRaw, 10) || 20, 100));
    const offset = Math.max(0, parseInt(offsetRaw, 10) || 0);

    const [countRows] = await pool.execute<RowDataPacket[]>(
      'SELECT COUNT(*) as total FROM user_website_history WHERE user_id = ?',
      [req.user.userId]
    );
    const total = (countRows[0]?.total as number) ?? 0;

    const websiteSql = `SELECT id, url, created_at as createdAt FROM user_website_history WHERE user_id = ? ORDER BY id DESC LIMIT ${limit} OFFSET ${offset}`;
    const [rows] = await pool.execute<RowDataPacket[]>(websiteSql, [req.user.userId]);

    res.json({ items: rows, total });
  } catch (error) {
    console.error('Fetch website history failed:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Record a generation (input URL + generated journalists JSON)
router.post('/history/generation', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { url, payload } = req.body as { url?: string; payload?: unknown };
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'Invalid url' });
    }
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const jsonText = JSON.stringify(payload ?? {});

    // 去重：若同一用户、同一 URL、在5分钟内已有记录，则更新该记录而不是新增
    const [existing] = await pool.execute<RowDataPacket[]>(
      'SELECT id FROM user_generation_history WHERE user_id = ? AND url = ? AND created_at > (NOW() - INTERVAL 5 MINUTE) ORDER BY id DESC LIMIT 1',
      [req.user.userId, url.trim()]
    );

    if (Array.isArray(existing) && existing.length > 0) {
      const id = existing[0].id as number;
      await pool.execute(
        'UPDATE user_generation_history SET payload = ? WHERE id = ?',
        [jsonText, id]
      );
      return res.json({ message: 'Updated' });
    }

    await pool.execute(
      'INSERT INTO user_generation_history (user_id, url, payload) VALUES (?, ?, ?)',
      [req.user.userId, url.trim(), jsonText]
    );
    res.json({ message: 'Recorded' });
  } catch (error) {
    console.error('Save generation history failed:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get paginated generation history
router.get('/history/generation', authenticateToken, async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const limitRaw = (req.query.limit as string) ?? '20';
    const offsetRaw = (req.query.offset as string) ?? '0';
    const limit = Math.max(1, Math.min(parseInt(limitRaw, 10) || 20, 100));
    const offset = Math.max(0, parseInt(offsetRaw, 10) || 0);

    const [countRows] = await pool.execute<RowDataPacket[]>(
      'SELECT COUNT(*) as total FROM user_generation_history WHERE user_id = ?',
      [req.user.userId]
    );
    const total = (countRows[0]?.total as number) ?? 0;

    const genSql = `SELECT id, url, payload, created_at as createdAt FROM user_generation_history WHERE user_id = ? ORDER BY id DESC LIMIT ${limit} OFFSET ${offset}`;
    const [rows] = await pool.execute<RowDataPacket[]>(genSql, [req.user.userId]);

    const items = rows.map((row) => {
      let parsed: unknown = {};
      try {
        if (typeof row.payload === 'string') {
          parsed = JSON.parse(row.payload as string);
        } else {
          parsed = row.payload;
        }
      } catch {
        parsed = {};
      }
      return {
        id: row.id,
        url: row.url,
        payload: parsed,
        createdAt: row.createdAt,
      };
    });

    res.json({ items, total });
  } catch (error) {
    console.error('Fetch generation history failed:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Batch validate URLs (fallback GET if HEAD not allowed) to filter invalid links
router.post('/validate-urls', async (req, res) => {
  try {
    const { urls } = req.body as { urls?: string[] };
    if (!Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({ error: 'urls must be a non-empty array' });
    }

    const unique = Array.from(new Set(urls.filter((u) => typeof u === 'string' && u.trim().length > 0)));

    const controllerWithTimeout = (ms: number) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), ms);
      return { controller, timer };
    };

    const checkOne = async (url: string) => {
      const tryFetch = async (method: 'HEAD' | 'GET') => {
        const { controller, timer } = controllerWithTimeout(8000);
        try {
          const resp = await fetch(url, {
            method,
            redirect: 'follow',
            signal: controller.signal,
            headers: {
              // 提高通过率，避免部分站点对非浏览器 UA 做出 403/404/405 等异常响应
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.9',
            },
          });
          clearTimeout(timer);
          return resp;
        } catch (e) {
          clearTimeout(timer);
          throw e;
        }
      };

      try {
        let resp = await tryFetch('HEAD');
        if (resp.status === 405 || resp.status === 403 || (resp.status >= 400 && resp.status < 600)) {
          // Some sites don't allow HEAD – fallback to GET
          resp = await tryFetch('GET');
        }

        // Only treat 404/410 as invalid; other statuses (401/403/429/999) are soft-pass
        const status = resp.status;
        const explicitInvalid = status === 404 || status === 410;
        const ok = (resp.ok && status < 400) || (!explicitInvalid);
        return { url, ok, status };
      } catch (err) {
        // Network failures are considered invalid; frontend will mark as unavailable
        return { url, ok: false, status: 0 };
      }
    };

    // 控制并发
    const concurrency = 5;
    const results: Array<{ url: string; ok: boolean; status: number }> = [];
    for (let i = 0; i < unique.length; i += concurrency) {
      const batch = unique.slice(i, i + concurrency);
      const settled = await Promise.all(batch.map((u) => checkOne(u)));
      results.push(...settled);
    }

    res.json({ results });
  } catch (error) {
    console.error('Validate URLs failed:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
