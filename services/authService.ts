import { Tool } from '../types';
import { apiFetch, clearAuthSession, getAccessToken, setAccessToken } from './apiClient';

export interface AuthUser {
  id: string;
  email: string | null;
  nickname: string;
  avatarUrl: string | null;
  isGuest: boolean;
  createdAt: string;
  onboardingSeen: boolean;
  sampleSeeded: boolean;
  toolbox: Tool[];
}

interface AuthResponse {
  accessToken: string;
  user: AuthUser;
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
): Promise<AuthResponse> {
  const data = await apiFetch<AuthResponse>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, nickname }),
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
    sampleSeeded: boolean;
    toolbox: Tool[];
  }>,
): Promise<AuthUser> {
  const data = await apiFetch<{ user: AuthUser }>('/api/auth/preferences', {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
  return data.user;
}

export function hasAccessToken(): boolean {
  return !!getAccessToken();
}
