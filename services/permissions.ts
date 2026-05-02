import { APP_CONFIG } from './appConfig.ts';

type RoleLike = {
  is_guest?: number | boolean;
  role?: string | null;
  email?: string | null;
};

export function resolveUserRole(user: RoleLike | null | undefined): 'admin' | 'user' {
  if (!user || user.is_guest) {
    return 'user';
  }

  const normalizedEmail = (user.email || '').trim().toLowerCase();
  if (normalizedEmail && APP_CONFIG.adminEmailAllowlist.includes(normalizedEmail)) {
    return 'admin';
  }

  if ((user.role || '').toLowerCase() === 'admin') {
    return 'admin';
  }

  return 'user';
}

export function isAdminUser(user: RoleLike | null | undefined): boolean {
  return resolveUserRole(user) === 'admin';
}
