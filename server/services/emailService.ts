import { Resend } from 'resend';

// Lazy-create the Resend client to avoid reading empty credentials before .env is injected
let cachedClient: Resend | null = null;

function getClient(): Resend {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.RESEND_API_KEY || '';
  cachedClient = new Resend(apiKey);
  return cachedClient;
}

// Generate a 6-digit verification code
export function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Send verification email
export async function sendVerificationEmail(email: string, code: string): Promise<void> {
  const fromName = process.env.EMAIL_FROM_NAME || 'Press Club';
  // Resend requires a verified domain sender
  const fromEmail = process.env.EMAIL_FROM || 'onboarding@resend.dev';
  
  try {
    const client = getClient();
    const result = await client.emails.send({
      from: `"${fromName}" <${fromEmail}>`,
      to: email,
      subject: 'Press Club - Email Verification Code',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #0066FF;">Press Club Email Verification</h2>
          <p>Hello,</p>
          <p>Thanks for signing up for Press Club. Please use the code below to verify your email:</p>
          <div style="background-color: #f5f5f5; padding: 20px; text-align: center; margin: 20px 0;">
            <span style="font-size: 32px; font-weight: bold; color: #0066FF; letter-spacing: 5px;">${code}</span>
          </div>
          <p>This code will expire in 10 minutes.</p>
          <p>If you did not request this, you can safely ignore this email.</p>
          <hr style="margin: 30px 0;">
          <p style="color: #666; font-size: 12px;">This is an automated message from Press Club. Please do not reply.</p>
        </div>
      `,
    });
    if ((result as any)?.error) {
      throw new Error((result as any).error.message || 'Unknown Resend error');
    }
    console.log(`Verification email sent to: ${email}`);
  } catch (error) {
    console.error('Failed to send email:', error);
    console.error('Resend config:', {
      from: process.env.EMAIL_FROM || 'onboarding@resend.dev',
      fromName,
      apiKeyPresent: Boolean(process.env.RESEND_API_KEY)
    });
    throw new Error(`Failed to send verification email: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Test email configuration
export async function testEmailConfiguration(): Promise<boolean> {
  try {
    if (!process.env.RESEND_API_KEY) {
      console.error('Email service verification failed: missing RESEND_API_KEY');
      return false;
    }
    // For Resend, presence of API key is sufficient to proceed; domain verification affects delivery but not API auth
    console.log('Resend API key detected. You should verify your sending domain for production.');
    return true;
  } catch (error) {
    console.error('Email configuration verification failed:', error);
    return false;
  }
}
