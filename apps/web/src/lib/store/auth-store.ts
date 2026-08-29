'use client';

import { create } from 'zustand';
import type {
  ChangePasswordInput,
  LoginInput,
  RegisterInput,
  UpdateProfileInput,
} from '@bazaar/shared';

import { apiFetch, refreshAccessToken, setAccessToken } from '@/lib/api';

export interface SessionUser {
  id: string;
  email: string;
  phone: string | null;
  fullName: string;
  avatarUrl: string | null;
  role: 'CUSTOMER' | 'ADMIN' | 'SUPER_ADMIN';
  emailVerified: boolean;
  phoneVerified: boolean;
  status: string;
  createdAt: string;
}

interface AuthResponse {
  accessToken: string;
  expiresIn: number;
  user: SessionUser;
}

interface AuthState {
  user: SessionUser | null;
  /** False until the initial silent refresh settles - guards UI flicker. */
  ready: boolean;

  register: (input: RegisterInput) => Promise<SessionUser>;
  login: (input: LoginInput) => Promise<SessionUser>;
  requestOtp: (phone: string) => Promise<{ expiresInSeconds: number }>;
  verifyOtp: (phone: string, otp: string) => Promise<SessionUser>;
  logout: () => Promise<void>;
  /** Restores the session from the HttpOnly refresh cookie on first load. */
  hydrate: () => Promise<void>;
  updateProfile: (input: UpdateProfileInput) => Promise<SessionUser>;
  changePassword: (input: ChangePasswordInput) => Promise<{ message: string }>;
  setSession: (user: SessionUser, accessToken: string) => void;
}

/**
 * Auth state is deliberately NOT persisted. The access token stays in memory
 * (see lib/api.ts) and the session is re-derived from the HttpOnly refresh
 * cookie on load, so nothing sensitive is written to disk.
 */
export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  ready: false,

  setSession: (user, accessToken) => {
    setAccessToken(accessToken);
    set({ user, ready: true });
  },

  register: async (input) => {
    const data = await apiFetch<AuthResponse>('/auth/register', {
      method: 'POST',
      body: input,
      retryOnUnauthorized: false,
    });
    setAccessToken(data.accessToken);
    set({ user: data.user, ready: true });
    return data.user;
  },

  login: async (input) => {
    const data = await apiFetch<AuthResponse>('/auth/login', {
      method: 'POST',
      body: input,
      retryOnUnauthorized: false,
    });
    setAccessToken(data.accessToken);
    set({ user: data.user, ready: true });
    return data.user;
  },

  requestOtp: async (phone) =>
    apiFetch<{ message: string; expiresInSeconds: number }>('/auth/login/phone', {
      method: 'POST',
      body: { phone },
      retryOnUnauthorized: false,
    }),

  verifyOtp: async (phone, otp) => {
    const data = await apiFetch<AuthResponse>('/auth/verify-otp', {
      method: 'POST',
      body: { phone, otp },
      retryOnUnauthorized: false,
    });
    setAccessToken(data.accessToken);
    set({ user: data.user, ready: true });
    return data.user;
  },

  logout: async () => {
    await apiFetch('/auth/logout', { method: 'POST', retryOnUnauthorized: false }).catch(
      () => undefined,
    );
    setAccessToken(null);
    set({ user: null, ready: true });
  },

  hydrate: async () => {
    const token = await refreshAccessToken();

    if (!token) {
      set({ user: null, ready: true });
      return;
    }

    try {
      const user = await apiFetch<SessionUser>('/auth/me');
      set({ user, ready: true });
    } catch {
      setAccessToken(null);
      set({ user: null, ready: true });
    }
  },

  updateProfile: async (input) => {
    const user = await apiFetch<SessionUser>('/users/profile', {
      method: 'PATCH',
      body: input,
    });
    set({ user });
    return user;
  },

  changePassword: async (input) =>
    apiFetch<{ message: string }>('/users/password', { method: 'PATCH', body: input }),
}));
