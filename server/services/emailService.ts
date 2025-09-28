import nodemailer from 'nodemailer';

// 懒加载创建 transporter，避免在 .env 尚未注入时读取到空的凭据
let cachedTransporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (cachedTransporter) return cachedTransporter;

  const host = process.env.EMAIL_HOST || 'smtpdm.aliyun.com';
  const secureEnv = process.env.EMAIL_SECURE;
  const secure = secureEnv ? String(secureEnv).toLowerCase() === 'true' : true; // 默认走 SSL 465
  const port = Number(process.env.EMAIL_PORT || (secure ? 465 : 25));
  const user = process.env.EMAIL_USER || '';
  const pass = process.env.EMAIL_PASS || '';

  cachedTransporter = nodemailer.createTransport({
    host,
    port,
    secure, // true -> 465(SSL), false -> 80/25(明文)
    auth: {
      user,
      pass,
    },
    // 某些环境下需要跳过自签名校验
    tls: { rejectUnauthorized: false },
  });

  return cachedTransporter;
}

// 生成6位数验证码
export function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// 发送验证码邮件
export async function sendVerificationEmail(email: string, code: string): Promise<void> {
  const fromName = process.env.EMAIL_FROM_NAME || 'Media Magnet';
  const fromEmail = process.env.EMAIL_USER;
  
  const mailOptions = {
    from: `"${fromName}" <${fromEmail}>`,
    to: email,
    subject: 'Media Magnet - 邮箱验证码',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #0066FF;">Media Magnet 邮箱验证</h2>
        <p>您好！</p>
        <p>感谢您注册 Media Magnet。请使用以下验证码完成邮箱验证：</p>
        <div style="background-color: #f5f5f5; padding: 20px; text-align: center; margin: 20px 0;">
          <span style="font-size: 32px; font-weight: bold; color: #0066FF; letter-spacing: 5px;">${code}</span>
        </div>
        <p>此验证码将在10分钟后过期。</p>
        <p>如果您没有注册 Media Magnet 账户，请忽略此邮件。</p>
        <hr style="margin: 30px 0;">
        <p style="color: #666; font-size: 12px;">
          此邮件由 Media Magnet 系统自动发送，请勿回复。
        </p>
      </div>
    `,
    // 对应 Java 的 mail.smtp.from，部分收件系统要求 envelope.from 与 From 一致
    envelope: {
      from: fromEmail,
      to: email,
    },
  };

  try {
    const transporter = getTransporter();
    await transporter.sendMail(mailOptions);
    console.log(`验证码邮件已发送至: ${email}`);
  } catch (error) {
    console.error('发送邮件失败:', error);
    console.error('邮件配置详情:', {
      host: process.env.EMAIL_HOST || 'smtp.dm.aliyun.com',
      port: process.env.EMAIL_PORT || (String(process.env.EMAIL_SECURE).toLowerCase() === 'true' ? '465' : '80'),
      user: process.env.EMAIL_USER,
      secure: String(process.env.EMAIL_SECURE)
    });
    throw new Error(`发送验证码失败: ${error instanceof Error ? error.message : '未知错误'}`);
  }
}

// 测试邮件配置
export async function testEmailConfiguration(): Promise<boolean> {
  try {
    // 检查必要的环境变量
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.error('邮件服务配置验证失败: 缺少邮箱用户名或密码');
      return false;
    }
    
    const host = process.env.EMAIL_HOST || 'smtpdm.aliyun.com';
    const secure = String(process.env.EMAIL_SECURE).toLowerCase() === 'true';
    const port = Number(process.env.EMAIL_PORT || (secure ? 465 : 80));

    console.log('正在验证SMTP连接...');
    console.log('SMTP配置:', {
      host,
      port,
      user: process.env.EMAIL_USER,
      passLength: process.env.EMAIL_PASS?.length
    });

    const transporter = getTransporter();
    await transporter.verify();
    console.log('邮件服务配置验证成功');
    return true;
  } catch (error) {
    console.error('邮件服务配置验证失败:', error);
    return false;
  }
}
