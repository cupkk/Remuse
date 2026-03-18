import { Tool, UsageSnapshot, UserAgreementSnapshot } from '../types';
import { apiFetch, clearAuthSession, getAccessToken, setAccessToken } from './apiClient';

export interface AuthUser {
  id: string;
  email: string | null;
  emailVerified: boolean;
  nickname: string;
  avatarUrl: string | null;
  isGuest: boolean;
  createdAt: string;
  onboardingSeen: boolean;
  toolbox: Tool[];
  role: 'admin' | 'user';
  isAdmin: boolean;
  agreements: UserAgreementSnapshot;
  usage: UsageSnapshot[];
}

interface AuthResponse {
  accessToken: string;
  user: AuthUser;
  emailVerificationRequired?: boolean;
  emailDelivery?: MailDispatchResponse;
}

export interface MailDispatchResponse {
  mode: 'resend' | 'log';
  previewUrl?: string;
}

interface BasicSuccessResponse {
  success: boolean;
  message?: string;
  emailDelivery?: MailDispatchResponse;
}

export async function loginAsGuest(): Promise<AuthResponse> {
  const data = await apiFetch<AuthResponse>('/api/auth/guest', {
    method: 'POST',
    skipAuthRefresh: true,
  });
  setAccessToken(data.accessToken);
  return data;
}

export async function register(
  email: string,
  password: string,
  nickname?: string,
  acceptPolicies = true,
): Promise<AuthResponse> {
  const data = await apiFetch<AuthResponse>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, nickname, acceptPolicies }),
    skipAuthRefresh: true,
  });
  setAccessToken(data.accessToken);
  return data;
}

export async function login(
  email: string,
  password: string,
): Promise<AuthResponse> {
  const data = await apiFetch<AuthResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
    skipAuthRefresh: true,
  });
  setAccessToken(data.accessToken);
  return data;
}

export async function getMe(): Promise<AuthUser> {
  const data = await apiFetch<{ user: AuthUser }>('/api/auth/me');
  return data.user;
}

export async function logout(): Promise<void> {
  try {
    await apiFetch('/api/auth/logout', {
      method: 'POST',
      body: JSON.stringify({}),
      skipAuthRefresh: true,
    });
  } catch {
    // Ignore logout errors and clear client session anyway.
  }

  clearAuthSession();
}

export function resetClientSession() {
  clearAuthSession();
}

export async function updatePreferences(
  updates: Partial<{
    onboardingSeen: boolean;
    toolbox: Tool[];
  }>,
): Promise<AuthUser> {
  const data = await apiFetch<{ user: AuthUser }>('/api/auth/preferences', {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
  return data.user;
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<AuthResponse> {
  const data = await apiFetch<AuthResponse>('/api/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  setAccessToken(data.accessToken);
  return data;
}

export async function logoutOtherSessions(): Promise<void> {
  await apiFetch('/api/auth/logout-others', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function deleteAccount(password?: string): Promise<void> {
  await apiFetch('/api/auth/delete-account', {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
  clearAuthSession();
}

export async function sendVerificationEmail(): Promise<BasicSuccessResponse> {
  return apiFetch<BasicSuccessResponse>('/api/auth/send-verification', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function requestPasswordReset(email: string): Promise<BasicSuccessResponse> {
  return apiFetch<BasicSuccessResponse>('/api/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
    skipAuthRefresh: true,
  });
}

export async function verifyEmail(token: string): Promise<{ success: boolean; message?: string; user?: AuthUser }> {
  return apiFetch<{ success: boolean; message?: string; user?: AuthUser }>('/api/auth/verify-email', {
    method: 'POST',
    body: JSON.stringify({ token }),
    skipAuthRefresh: true,
  });
}

export async function resetPassword(token: string, newPassword: string): Promise<AuthResponse> {
  const data = await apiFetch<AuthResponse>('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, newPassword }),
    skipAuthRefresh: true,
  });
  setAccessToken(data.accessToken);
  return data;
}

export function hasAccessToken(): boolean {
  return !!getAccessToken();
}
