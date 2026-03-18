import { APP_CONFIG } from './appConfig.ts';
import { normalizeEmailAddress } from './auth.ts';

type RoleLike = {
  email?: string | null;
  is_guest?: number | boolean;
  role?: string | null;
};

export function resolveUserRole(user: RoleLike | null | undefined): 'admin' | 'user' {
  if (!user || user.is_guest) {
    return 'user';
  }

  if ((user.role || '').toLowerCase() === 'admin') {
    return 'admin';
  }

  const email = user.email ? normalizeEmailAddress(user.email) : null;
  if (email && APP_CONFIG.adminEmailAllowlist.has(email)) {
    return 'admin';
  }

  return 'user';
}

export function isAdminUser(user: RoleLike | null | undefined): boolean {
  return resolveUserRole(user) === 'admin';
}
