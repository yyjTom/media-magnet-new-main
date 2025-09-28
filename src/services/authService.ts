 const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  (import.meta.env.PROD ? '/api' : 'http://localhost:3001/api');

export interface User {
  id: number;
  email: string;
  emailVerified: boolean;
}

export interface AuthResponse {
  message: string;
  token?: string;
  user?: User;
  userId?: number;
}

class AuthService {
  private token: string | null = null;
  private user: User | null = null;

  constructor() {
    // Restore token and user info from localStorage
    this.token = localStorage.getItem('auth_token');
    const savedUser = localStorage.getItem('auth_user');
    if (savedUser) {
      try {
        this.user = JSON.parse(savedUser);
      } catch (error) {
        console.error('Failed to parse user info:', error);
        this.clearAuth();
      }
    }
  }

  // Register
  async register(email: string, password: string): Promise<AuthResponse> {
    const response = await fetch(`${API_BASE_URL}/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Registration failed');
    }

    return data;
  }

  // Verify email
  async verifyEmail(email: string, code: string): Promise<AuthResponse> {
    const response = await fetch(`${API_BASE_URL}/auth/verify-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, code }),
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Verification failed');
    }

    // 保存认证信息
    if (data.token && data.user) {
      this.setAuth(data.token, data.user);
    }

    return data;
  }

  // Login
  async login(email: string, password: string): Promise<AuthResponse> {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Login failed');
    }

    // 保存认证信息
    if (data.token && data.user) {
      this.setAuth(data.token, data.user);
    }

    return data;
  }

  // Resend verification code
  async resendVerification(email: string): Promise<AuthResponse> {
    const response = await fetch(`${API_BASE_URL}/auth/resend-verification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email }),
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to resend verification code');
    }

    return data;
  }

  // Save website history
  async saveWebsiteHistory(url: string): Promise<void> {
    const token = this.getToken();
    if (!token) return;

    await fetch(`${API_BASE_URL}/auth/history/website`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ url }),
    });
  }

  async getWebsiteHistory(): Promise<Array<{ id: number; url: string; createdAt: string }>> {
    const token = this.getToken();
    if (!token) return [];

    const res = await fetch(`${API_BASE_URL}/auth/history/website`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.items ?? [];
  }

  async saveGenerationHistory(params: { url: string; payload: unknown }): Promise<void> {
    const token = this.getToken();
    if (!token) return;
    await fetch(`${API_BASE_URL}/auth/history/generation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(params),
    });
  }

  async getGenerationHistory(): Promise<Array<{ id: number; url: string; payload: unknown; createdAt: string }>> {
    const token = this.getToken();
    if (!token) return [];
    const res = await fetch(`${API_BASE_URL}/auth/history/generation`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.items ?? [];
  }

  // Logout
  logout(): void {
    this.clearAuth();
  }

  // Check if authenticated
  isAuthenticated(): boolean {
    return !!(this.token && this.user);
  }

  // Get current user
  getCurrentUser(): User | null {
    return this.user;
  }

  // Get token
  getToken(): string | null {
    return this.token;
  }

  // Set auth data
  private setAuth(token: string, user: User): void {
    this.token = token;
    this.user = user;
    localStorage.setItem('auth_token', token);
    localStorage.setItem('auth_user', JSON.stringify(user));
  }

  // Clear auth data
  private clearAuth(): void {
    this.token = null;
    this.user = null;
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
  }
}

export const authService = new AuthService();
