import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Mail, Lock, CheckCircle } from 'lucide-react';
import { authService } from '@/services/authService';

// Declare Google types
declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: any) => void;
          renderButton: (element: HTMLElement, config: any) => void;
          prompt: () => void;
        };
      };
    };
  }
}

interface RegisterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSwitchToLogin: () => void;
  onRegisterSuccess: () => void;
  prefillEmail?: string;
  initialStep?: 'register' | 'verify';
}

export const RegisterModal = ({ isOpen, onClose, onSwitchToLogin, onRegisterSuccess, prefillEmail, initialStep }: RegisterModalProps) => {
  const [step, setStep] = useState<'register' | 'verify'>(initialStep ?? 'register');
  const [email, setEmail] = useState(prefillEmail ?? '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Listen prefill events (from LoginModal) to open verify step with prefilled email
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { email?: string; step?: 'register' | 'verify' };
      if (detail?.email) setEmail(detail.email);
      if (detail?.step) setStep(detail.step);
    };
    window.addEventListener('prefill-register', handler as EventListener);
    return () => window.removeEventListener('prefill-register', handler as EventListener);
  }, []);

  // Initialize Google Sign-In for registration
  useEffect(() => {
    if (step !== 'register') return;

    // Load Google Sign-In script
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.id = 'google-signin-script-register';
    
    const existingScript = document.getElementById('google-signin-script-register');
    if (existingScript) return;
    
    document.body.appendChild(script);

    script.onload = () => {
      if (window.google && import.meta.env.VITE_GOOGLE_CLIENT_ID) {
        window.google.accounts.id.initialize({
          client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
          callback: handleGoogleResponse,
        });

        // Render button if modal is open
        if (isOpen && step === 'register') {
          const buttonDiv = document.getElementById('google-register-button');
          if (buttonDiv && window.google) {
            window.google.accounts.id.renderButton(buttonDiv, {
              theme: 'outline',
              size: 'large',
              width: '100%',
              text: 'signup_with',
            });
          }
        }
      }
    };

    return () => {
      const scriptEl = document.getElementById('google-signin-script-register');
      if (scriptEl) document.body.removeChild(scriptEl);
    };
  }, [isOpen, step]);

  const handleGoogleResponse = async (response: any) => {
    setIsLoading(true);
    setError('');

    try {
      await authService.googleLogin(response.credential);
      onRegisterSuccess();
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Google sign up failed';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    // Validate password
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      setIsLoading(false);
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      setIsLoading(false);
      return;
    }

    try {
      await authService.register(email, password);
      setSuccess('Registered! Verification code sent to your email');
      setStep('verify');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      await authService.verifyEmail(email, verificationCode);
      onRegisterSuccess();
      onClose();
      // Reset form
      setStep('register');
      setEmail('');
      setPassword('');
      setConfirmPassword('');
      setVerificationCode('');
      setSuccess('');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Verification failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendCode = async () => {
    setIsLoading(true);
    setError('');

    try {
      await authService.resendVerification(email);
      setSuccess('Verification code resent');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to resend verification code');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-center">
            {step === 'register' ? 'Create Account' : 'Verify Email'}
          </DialogTitle>
        </DialogHeader>

        {step === 'register' ? (
          <form onSubmit={handleRegister} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="register-email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="register-email"
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="register-password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="register-password"
                  type="password"
                  placeholder="Enter password (min 6 chars)"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="confirm-password"
                  type="password"
                  placeholder="Re-enter password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="pl-10"
                  required
                />
              </div>
            </div>

            <Button 
              type="submit" 
              className="w-full" 
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing up...
                </>
              ) : (
                'Sign Up'
              )}
            </Button>

            {/* Divider */}
            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">Or continue with</span>
              </div>
            </div>

            {/* Google Sign-Up Button */}
            <div id="google-register-button" className="flex justify-center"></div>

            <div className="text-center">
              <p className="text-sm text-muted-foreground">
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={onSwitchToLogin}
                  className="text-primary hover:underline"
                >
                  Sign in
                </button>
              </p>
            </div>
          </form>
        ) : (
          <form onSubmit={handleVerify} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {success && (
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>{success}</AlertDescription>
              </Alert>
            )}

            <div className="text-center space-y-2">
              <p className="text-sm text-muted-foreground">
                Verification code sent to:<br />
                <span className="font-medium">{email}</span>
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="verification-code">Verification Code</Label>
              <Input
                id="verification-code"
                type="text"
                placeholder="Enter the 6-digit code"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value)}
                maxLength={6}
                className="text-center text-lg tracking-wider"
                required
              />
            </div>

            <Button 
              type="submit" 
              className="w-full" 
              disabled={isLoading || verificationCode.length !== 6}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verifying...
                </>
              ) : (
                'Verify Email'
              )}
            </Button>

            <div className="text-center space-y-2">
              <p className="text-sm text-muted-foreground">
                Didn’t receive the code?{' '}
                <button
                  type="button"
                  onClick={handleResendCode}
                  className="text-primary hover:underline"
                  disabled={isLoading}
                >
                  Resend
                </button>
              </p>
              <button
                type="button"
                onClick={() => setStep('register')}
                className="text-sm text-muted-foreground hover:underline"
              >
                Back to sign up
              </button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};
