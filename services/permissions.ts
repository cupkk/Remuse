type RoleLike = {
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

  return 'user';
}

export function isAdminUser(user: RoleLike | null | undefined): boolean {
  return resolveUserRole(user) === 'admin';
}
