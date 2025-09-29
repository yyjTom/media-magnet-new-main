import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Rocket, ArrowRight, User, LogIn, Lock } from 'lucide-react';
import emailScreenshot from '@/assets/newemail-2.png';
import wsjArticle from '@/assets/newwsj-2.png';
import { analytics } from '@/lib/analytics';
import { authService, type User as UserType } from '@/services/authService';
import { LoginModal } from '@/components/auth/LoginModal';
import { RegisterModal } from '@/components/auth/RegisterModal';
import { UserMenu } from '@/components/auth/UserMenu';
import { useToast } from '@/hooks/use-toast';
interface HeroSectionProps {
  onSubmit: (website: string) => void;
}
export const HeroSection = ({
  onSubmit
}: HeroSectionProps) => {
  const [website, setWebsite] = useState('');
  const [rawInput, setRawInput] = useState('');
  const [currentUser, setCurrentUser] = useState<UserType | null>(authService.getCurrentUser());
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(authService.isAuthenticated());
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);

  // Update authentication state when user logs in/out
  useEffect(() => {
    setIsAuthenticated(authService.isAuthenticated());
  }, [currentUser]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Check if user is logged in
    if (!isAuthenticated) {
      toast({
        title: "Login Required",
        description: "Please sign in to find journalists and save your search history.",
        variant: "destructive",
      });
      setShowLoginModal(true);
      return;
    }

    const input = rawInput.trim();
    if (input) {
      // Heuristic: treat as URL if it contains a dot and no spaces; prepend https if missing
      const looksLikeUrl = /\s/.test(input) === false && /\./.test(input);
      const normalized = looksLikeUrl ? (input.startsWith('http') ? input : `https://${input}`) : '';
      const valueForHistory = normalized || input;
      analytics.websiteSubmitted({ source: 'hero_form', website: valueForHistory });
      // Persist to user history if logged in
      if (submitting) return; // 防止连点
      setSubmitting(true);
      authService.saveWebsiteHistory(valueForHistory).catch(() => {}).finally(() => {
        // 即便保存失败也允许发起查询，但按钮在 onResults 后解除禁用
      });
      onSubmit(valueForHistory);
    }
  };

  const handleLoginSuccess = () => {
    setCurrentUser(authService.getCurrentUser());
  };

  const handleLogout = () => {
    setCurrentUser(null);
  };
  return <section className="bg-background py-20 lg:py-32">
      <div className="container mx-auto px-4 max-w-5xl">
        {/* Auth area */}
        <div className="absolute top-4 right-4">
          {currentUser ? (
            <UserMenu user={currentUser} onLogout={handleLogout} />
          ) : (
            <div className="flex gap-2">
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setShowLoginModal(true)}
              >
                <LogIn className="mr-2 h-4 w-4" />
                Sign in
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setShowRegisterModal(true)}
              >
                <User className="mr-2 h-4 w-4" />
                Sign up
              </Button>
            </div>
          )}
        </div>

        <div className="flex flex-col items-center space-y-12">
          {/* Header Text - Centered */}
          <div className="text-center space-y-6">
            <h1 className="text-4xl lg:text-6xl font-black text-foreground leading-tight">
              I landed{' '}
              <span className="text-primary">Forbes</span> and{' '}
              <span className="text-primary">Wall Street Journal</span> without spending a dime.
            </h1>
            
            <p className="text-xl lg:text-2xl text-muted-foreground leading-relaxed">We help founders secure real media coverage. No PR firm required.</p>
          </div>

          {/* Images - Side by side, centered with arrow */}
          <div className="flex items-center justify-center gap-8 w-full max-w-6xl">
            <div className="card-shadow rounded-2xl overflow-hidden hover-scale smooth-transition flex-1 max-w-lg">
              <img src={emailScreenshot} alt="Email to WSJ reporter" className="w-full h-auto" style={{filter: 'brightness(0.95) contrast(1.1)'}} />
            </div>
            <ArrowRight className="text-primary h-8 w-8 flex-shrink-0 animate-pulse" />
            <div className="card-shadow rounded-2xl overflow-hidden hover-scale smooth-transition flex-1 max-w-lg">
              <img src={wsjArticle} alt="WSJ article coverage" className="w-full h-auto" style={{filter: 'brightness(0.95) contrast(1.1)'}} />
            </div>
          </div>

          {/* CTA Form - Centered */}
          <form onSubmit={handleSubmit} className="flex flex-col items-center space-y-6 w-full max-w-md">
            <div className="relative w-full">
              <Input 
                type="text" 
                placeholder="Enter a website or company description..." 
                value={rawInput} 
                onChange={e => setRawInput(e.target.value)} 
                className="w-full h-14 text-lg input-glow smooth-transition border-2 focus:border-primary pr-32 !bg-white !text-black placeholder:!text-gray-500" 
                required 
              />
              <Button 
                type="submit" 
                variant="hero" 
                size="default" 
                className="absolute right-2 top-2 h-10 font-normal"
                disabled={!isAuthenticated || submitting}
              >
                {isAuthenticated ? (
                  <>
                    {submitting ? 'Generating…' : 'Find journalists'} <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                ) : (
                  <>
                    <Lock className="mr-2 h-4 w-4" />
                    Login required
                  </>
                )}
              </Button>
            </div>
          </form>
        </div>

        {/* Auth modals */}
        <LoginModal
          isOpen={showLoginModal}
          onClose={() => setShowLoginModal(false)}
          onSwitchToRegister={(opts) => {
            setShowLoginModal(false);
            setShowRegisterModal(true);
            if (opts?.email) {
              // Prefill email and jump to verify step when triggered from login
              // We pass via local state through quick close/open cycle
              setTimeout(() => {
                const event = new CustomEvent('prefill-register', { detail: { email: opts.email, step: opts.step } });
                window.dispatchEvent(event);
              }, 0);
            }
          }}
          onLoginSuccess={handleLoginSuccess}
        />

        <RegisterModal
          isOpen={showRegisterModal}
          onClose={() => setShowRegisterModal(false)}
          onSwitchToLogin={() => {
            setShowRegisterModal(false);
            setShowLoginModal(true);
          }}
          onRegisterSuccess={handleLoginSuccess}
          // Listen one-shot for prefill request dispatched from LoginModal
          prefillEmail={(undefined as any)}
          initialStep={(undefined as any)}
        />
      </div>
    </section>;
};
