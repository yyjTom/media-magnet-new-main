import nodemailer from 'nodemailer';

// Lazy-create the transporter to avoid reading empty credentials before .env is injected
let cachedTransporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (cachedTransporter) return cachedTransporter;

  const host = process.env.EMAIL_HOST || 'smtpdm.aliyun.com';
  const secureEnv = process.env.EMAIL_SECURE;
  const secure = secureEnv ? String(secureEnv).toLowerCase() === 'true' : true; // default to SSL 465
  const port = Number(process.env.EMAIL_PORT || (secure ? 465 : 25));
  const user = process.env.EMAIL_USER || '';
  const pass = process.env.EMAIL_PASS || '';

  cachedTransporter = nodemailer.createTransport({
    host,
    port,
    secure, // true -> 465 (SSL), false -> 25/587 (plain/TLS)
    auth: {
      user,
      pass,
    },
    // In some environments you might need to skip self-signed cert validation
    tls: { rejectUnauthorized: false },
  });

  return cachedTransporter;
}

// Generate a 6-digit verification code
export function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Send verification email
export async function sendVerificationEmail(email: string, code: string): Promise<void> {
  const fromName = process.env.EMAIL_FROM_NAME || 'Media Magnet';
  const fromEmail = process.env.EMAIL_USER;
  
  const mailOptions = {
    from: `"${fromName}" <${fromEmail}>`,
    to: email,
    subject: 'Media Magnet - Email Verification Code',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #0066FF;">Media Magnet Email Verification</h2>
        <p>Hello,</p>
        <p>Thanks for signing up for Media Magnet. Please use the code below to verify your email:</p>
        <div style="background-color: #f5f5f5; padding: 20px; text-align: center; margin: 20px 0;">
          <span style="font-size: 32px; font-weight: bold; color: #0066FF; letter-spacing: 5px;">${code}</span>
        </div>
        <p>This code will expire in 10 minutes.</p>
        <p>If you did not request this, you can safely ignore this email.</p>
        <hr style="margin: 30px 0;">
        <p style="color: #666; font-size: 12px;">This is an automated message from Media Magnet. Please do not reply.</p>
      </div>
    `,
    // Some providers require envelope.from to be the same as From
    envelope: {
      from: fromEmail,
      to: email,
    },
  };

  try {
    const transporter = getTransporter();
    await transporter.sendMail(mailOptions);
    console.log(`Verification email sent to: ${email}`);
  } catch (error) {
    console.error('Failed to send email:', error);
    console.error('SMTP config:', {
      host: process.env.EMAIL_HOST || 'smtpdm.aliyun.com',
      port: process.env.EMAIL_PORT || (String(process.env.EMAIL_SECURE).toLowerCase() === 'true' ? '465' : '25'),
      user: process.env.EMAIL_USER,
      secure: String(process.env.EMAIL_SECURE)
    });
    throw new Error(`Failed to send verification email: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Test email configuration
export async function testEmailConfiguration(): Promise<boolean> {
  try {
    // Check required env variables
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.error('Email service verification failed: missing username or password');
      return false;
    }
    
    const host = process.env.EMAIL_HOST || 'smtpdm.aliyun.com';
    const secure = String(process.env.EMAIL_SECURE).toLowerCase() === 'true';
    const port = Number(process.env.EMAIL_PORT || (secure ? 465 : 25));

    console.log('Verifying SMTP connection...');
    console.log('SMTP config:', {
      host,
      port,
      user: process.env.EMAIL_USER,
      passLength: process.env.EMAIL_PASS?.length
    });

    const transporter = getTransporter();
    await transporter.verify();
    console.log('Email configuration verified successfully');
    return true;
  } catch (error) {
    console.error('Email configuration verification failed:', error);
    return false;
  }
}
