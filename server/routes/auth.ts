import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../config/database';
import { sendVerificationEmail, generateVerificationCode, testEmailConfiguration } from '../services/emailService';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { authenticateToken, type AuthRequest } from '../middleware/auth';

const router = express.Router();

// JWT密钥
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

interface User extends RowDataPacket {
  id: number;
  email: string;
  password: string;
  email_verified: boolean;
  verification_code: string | null;
  verification_expires: Date | null;
}

// 注册接口
router.post('/register', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: '邮箱和密码不能为空' });
    }

    // 检查邮箱格式
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: '邮箱格式不正确' });
    }

    // 检查密码强度
    if (password.length < 6) {
      return res.status(400).json({ error: '密码长度至少6位' });
    }

    // 检查用户是否已存在
    const [existingUsers] = await pool.execute<User[]>(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );

    if (existingUsers.length > 0) {
      return res.status(400).json({ error: '该邮箱已被注册' });
    }

    // 加密密码
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // 生成验证码
    const verificationCode = generateVerificationCode();
    const verificationExpires = new Date(Date.now() + 10 * 60 * 1000); // 10分钟后过期

    // 插入用户数据
    const [result] = await pool.execute<ResultSetHeader>(
      'INSERT INTO users (email, password, verification_code, verification_expires) VALUES (?, ?, ?, ?)',
      [email, hashedPassword, verificationCode, verificationExpires]
    );

    // 发送验证码邮件
    await sendVerificationEmail(email, verificationCode);

    res.status(201).json({
      message: '注册成功，验证码已发送到您的邮箱',
      userId: result.insertId
    });

  } catch (error) {
    console.error('注册失败:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// 验证邮箱接口
router.post('/verify-email', async (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({ error: '邮箱和验证码不能为空' });
    }

    // 查找用户
    const [users] = await pool.execute<User[]>(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: '用户不存在' });
    }

    const user = users[0];

    // 检查验证码
    if (user.verification_code !== code) {
      return res.status(400).json({ error: '验证码错误' });
    }

    // 检查验证码是否过期
    if (!user.verification_expires || new Date() > user.verification_expires) {
      return res.status(400).json({ error: '验证码已过期' });
    }

    // 更新用户状态
    await pool.execute(
      'UPDATE users SET email_verified = TRUE, verification_code = NULL, verification_expires = NULL WHERE id = ?',
      [user.id]
    );

    // 生成JWT token
    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, {
      expiresIn: '7d'
    });

    res.json({
      message: '邮箱验证成功',
      token,
      user: {
        id: user.id,
        email: user.email,
        emailVerified: true
      }
    });

  } catch (error) {
    console.error('邮箱验证失败:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// 登录接口
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: '邮箱和密码不能为空' });
    }

    // 查找用户
    const [users] = await pool.execute<User[]>(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );

    if (users.length === 0) {
      return res.status(401).json({ error: '邮箱或密码错误' });
    }

    const user = users[0];

    // 检查邮箱是否已验证
    if (!user.email_verified) {
      return res.status(401).json({ error: '请先验证您的邮箱' });
    }

    // 验证密码
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: '邮箱或密码错误' });
    }

    // 生成JWT token
    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, {
      expiresIn: '7d'
    });

    res.json({
      message: '登录成功',
      token,
      user: {
        id: user.id,
        email: user.email,
        emailVerified: user.email_verified
      }
    });

  } catch (error) {
    console.error('登录失败:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// 重新发送验证码接口
router.post('/resend-verification', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: '邮箱不能为空' });
    }

    // 查找用户
    const [users] = await pool.execute<User[]>(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: '用户不存在' });
    }

    const user = users[0];

    if (user.email_verified) {
      return res.status(400).json({ error: '邮箱已经验证过了' });
    }

    // 生成新的验证码
    const verificationCode = generateVerificationCode();
    const verificationExpires = new Date(Date.now() + 10 * 60 * 1000);

    // 更新验证码
    await pool.execute(
      'UPDATE users SET verification_code = ?, verification_expires = ? WHERE id = ?',
      [verificationCode, verificationExpires, user.id]
    );

    // 发送验证码邮件
    await sendVerificationEmail(email, verificationCode);

    res.json({ message: '验证码已重新发送' });

  } catch (error) {
    console.error('重发验证码失败:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// 测试邮件配置接口（仅用于开发调试）
router.get('/test-email-config', async (req, res) => {
  try {
    console.log('开始测试邮件配置...');
    console.log('EMAIL_HOST:', process.env.EMAIL_HOST);
    console.log('EMAIL_PORT:', process.env.EMAIL_PORT);
    console.log('EMAIL_USER:', process.env.EMAIL_USER );
    console.log('EMAIL_PASS:', process.env.EMAIL_PASS );
    
    const isConfigValid = await testEmailConfiguration();
    
    if (isConfigValid) {
      res.json({ 
        success: true, 
        message: '邮件服务配置正常',
        config: {
          host: process.env.EMAIL_HOST || 'smtpdm.aliyun.com',
          port: process.env.EMAIL_PORT || '465',
          user: process.env.EMAIL_USER ? '已配置' : '未配置',
          secure: process.env.EMAIL_SECURE || 'true'
        }
      });
    } else {
      res.status(500).json({ 
        success: false, 
        message: '邮件服务配置异常，请检查环境变量',
        debug: {
          host: process.env.EMAIL_HOST || '未配置',
          port: process.env.EMAIL_PORT || '未配置',
          user: process.env.EMAIL_USER ? '已配置' : '未配置',
          pass: process.env.EMAIL_PASS ? '已配置' : '未配置'
        }
      });
    }
  } catch (error) {
    console.error('测试邮件配置失败:', error);
    res.status(500).json({ 
      success: false, 
      message: '测试邮件配置时发生错误',
      error: error instanceof Error ? error.message : '未知错误'
    });
  }
});

// 保存用户提交的网站历史
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

    // 去重：同一用户+同一URL在1分钟内只保留一次
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

// 获取当前用户的网站历史（最近20条）
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

    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT id, url, created_at as createdAt FROM user_website_history WHERE user_id = ? ORDER BY id DESC LIMIT ? OFFSET ?',
      [req.user.userId, limit, offset]
    );

    res.json({ items: rows, total });
  } catch (error) {
    console.error('Fetch website history failed:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// 记录一次完整的生成（查询URL + 生成的记者JSON）
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

// 获取最近生成历史
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

    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT id, url, payload, created_at as createdAt FROM user_generation_history WHERE user_id = ? ORDER BY id DESC LIMIT ? OFFSET ?',
      [req.user.userId, limit, offset]
    );

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

// 批量校验URL可达性（HEAD失败会回退GET），用于过滤404等无效链接
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
          // 某些站点不支持HEAD，回退GET
          resp = await tryFetch('GET');
        }

        // 仅将 404/410 判定为明确无效；其余如 401/403/429/999 等视为“可能有效”（软通过）
        const status = resp.status;
        const explicitInvalid = status === 404 || status === 410;
        const ok = (resp.ok && status < 400) || (!explicitInvalid);
        return { url, ok, status };
      } catch (err) {
        // 网络失败：判定为无效，前端会标注 unavailable
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
