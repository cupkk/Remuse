import { v4 as uuidv4 } from 'uuid';
import db, { getUserById } from './database.ts';
import {
  createOpaqueToken,
  getEmailVerificationExpiresAt,
  getPasswordResetExpiresAt,
  hashOpaqueToken,
  normalizeEmailAddress,
} from './auth.ts';

type UserRecord = NonNullable<ReturnType<typeof getUserById>>;

interface EmailVerificationTokenRow {
  id: string;
  user_id: string;
  email: string;
  token_hash: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

interface PasswordResetTokenRow {
  id: string;
  user_id: string;
  email: string;
  token_hash: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

const emailVerifiedAdded = ensureColumn('users', 'email_verified', `INTEGER NOT NULL DEFAULT 0`);
const emailVerifiedAtAdded = ensureColumn('users', 'email_verified_at', `TEXT`);

db.exec(`
  CREATE TABLE IF NOT EXISTS email_verification_tokens (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    email      TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    used_at    TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_user
  ON email_verification_tokens(user_id);

  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    email      TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    used_at    TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user
  ON password_reset_tokens(user_id);
`);

if (emailVerifiedAdded || emailVerifiedAtAdded) {
  db.exec(`
    UPDATE users
    SET email_verified = 1,
        email_verified_at = COALESCE(email_verified_at, datetime('now'))
    WHERE is_guest = 0
      AND email IS NOT NULL
      AND password_hash IS NOT NULL
      AND email_verified = 0
  `);
}

const stmts = {
  insertEmailVerificationToken: db.prepare<{
    id: string;
    user_id: string;
    email: string;
    token_hash: string;
    expires_at: string;
  }>(`
    INSERT INTO email_verification_tokens (id, user_id, email, token_hash, expires_at)
    VALUES (@id, @user_id, @email, @token_hash, @expires_at)
  `),
  getEmailVerificationTokenByHash: db.prepare<[string]>(`
    SELECT * FROM email_verification_tokens
    WHERE token_hash = ?
    LIMIT 1
  `),
  markEmailVerificationTokenUsed: db.prepare<[string]>(`
    UPDATE email_verification_tokens
    SET used_at = datetime('now')
    WHERE id = ? AND used_at IS NULL
  `),
  deleteActiveEmailVerificationTokensByUser: db.prepare<[string]>(`
    DELETE FROM email_verification_tokens
    WHERE user_id = ? AND used_at IS NULL
  `),
  insertPasswordResetToken: db.prepare<{
    id: string;
    user_id: string;
    email: string;
    token_hash: string;
    expires_at: string;
  }>(`
    INSERT INTO password_reset_tokens (id, user_id, email, token_hash, expires_at)
    VALUES (@id, @user_id, @email, @token_hash, @expires_at)
  `),
  getPasswordResetTokenByHash: db.prepare<[string]>(`
    SELECT * FROM password_reset_tokens
    WHERE token_hash = ?
    LIMIT 1
  `),
  markPasswordResetTokenUsed: db.prepare<[string]>(`
    UPDATE password_reset_tokens
    SET used_at = datetime('now')
    WHERE id = ? AND used_at IS NULL
  `),
  deleteActivePasswordResetTokensByUser: db.prepare<[string]>(`
    DELETE FROM password_reset_tokens
    WHERE user_id = ? AND used_at IS NULL
  `),
  updateUserEmailVerified: db.prepare<[string]>(`
    UPDATE users
    SET email_verified = 1,
        email_verified_at = COALESCE(email_verified_at, datetime('now'))
    WHERE id = ?
  `),
  updateUserPasswordAndVerifyEmail: db.prepare<{
    id: string;
    password_hash: string;
  }>(`
    UPDATE users
    SET password_hash = @password_hash,
        email_verified = 1,
        email_verified_at = COALESCE(email_verified_at, datetime('now'))
    WHERE id = @id
  `),
  deleteExpiredEmailVerificationTokens: db.prepare(`
    DELETE FROM email_verification_tokens
    WHERE expires_at <= datetime('now')
       OR (used_at IS NOT NULL AND used_at <= datetime('now', '-7 days'))
  `),
  deleteExpiredPasswordResetTokens: db.prepare(`
    DELETE FROM password_reset_tokens
    WHERE expires_at <= datetime('now')
       OR (used_at IS NOT NULL AND used_at <= datetime('now', '-7 days'))
  `),
};

purgeExpiredAuthTokens();

export interface IssuedOpaqueToken {
  token: string;
  expiresAt: string;
}

export function issueEmailVerificationToken(userId: string, email: string): IssuedOpaqueToken {
  purgeExpiredAuthTokens();

  const token = createOpaqueToken();
  const expiresAt = getEmailVerificationExpiresAt();
  const normalizedEmail = normalizeEmailAddress(email);

  const transaction = db.transaction(() => {
    stmts.deleteActiveEmailVerificationTokensByUser.run(userId);
    stmts.insertEmailVerificationToken.run({
      id: uuidv4(),
      user_id: userId,
      email: normalizedEmail,
      token_hash: hashOpaqueToken(token),
      expires_at: expiresAt,
    });
  });

  transaction();
  return { token, expiresAt };
}

export function issuePasswordResetToken(userId: string, email: string): IssuedOpaqueToken {
  purgeExpiredAuthTokens();

  const token = createOpaqueToken();
  const expiresAt = getPasswordResetExpiresAt();
  const normalizedEmail = normalizeEmailAddress(email);

  const transaction = db.transaction(() => {
    stmts.deleteActivePasswordResetTokensByUser.run(userId);
    stmts.insertPasswordResetToken.run({
      id: uuidv4(),
      user_id: userId,
      email: normalizedEmail,
      token_hash: hashOpaqueToken(token),
      expires_at: expiresAt,
    });
  });

  transaction();
  return { token, expiresAt };
}

export function verifyEmailWithToken(token: string):
  | { status: 'ok'; user: UserRecord }
  | { status: 'invalid' | 'expired' } {
  const tokenRow = getUsableEmailVerificationToken(token);
  if (tokenRow.status !== 'ok') {
    return tokenRow;
  }

  const transaction = db.transaction(() => {
    stmts.markEmailVerificationTokenUsed.run(tokenRow.row.id);
    stmts.updateUserEmailVerified.run(tokenRow.user.id);
    stmts.deleteActiveEmailVerificationTokensByUser.run(tokenRow.user.id);
  });

  transaction();

  const updatedUser = getUserById(tokenRow.user.id);
  if (!updatedUser) {
    return { status: 'invalid' };
  }

  return { status: 'ok', user: updatedUser as UserRecord };
}

export function resetPasswordWithToken(
  token: string,
  passwordHash: string,
):
  | { status: 'ok'; user: UserRecord }
  | { status: 'invalid' | 'expired' } {
  const tokenRow = getUsablePasswordResetToken(token);
  if (tokenRow.status !== 'ok') {
    return tokenRow;
  }

  const transaction = db.transaction(() => {
    stmts.markPasswordResetTokenUsed.run(tokenRow.row.id);
    stmts.deleteActivePasswordResetTokensByUser.run(tokenRow.user.id);
    stmts.updateUserPasswordAndVerifyEmail.run({
      id: tokenRow.user.id,
      password_hash: passwordHash,
    });
    stmts.deleteActiveEmailVerificationTokensByUser.run(tokenRow.user.id);
  });

  transaction();

  const updatedUser = getUserById(tokenRow.user.id);
  if (!updatedUser) {
    return { status: 'invalid' };
  }

  return { status: 'ok', user: updatedUser as UserRecord };
}

export function isEmailVerified(user: { email_verified?: number | boolean }): boolean {
  return !!user.email_verified;
}

function getUsableEmailVerificationToken(token: string):
  | { status: 'ok'; row: EmailVerificationTokenRow; user: UserRecord }
  | { status: 'invalid' | 'expired' } {
  const row = stmts.getEmailVerificationTokenByHash.get(hashOpaqueToken(token)) as EmailVerificationTokenRow | undefined;
  if (!row || row.used_at) {
    return { status: 'invalid' };
  }

  if (new Date(row.expires_at).getTime() <= Date.now()) {
    return { status: 'expired' };
  }

  const user = getUserById(row.user_id);
  if (!user || !user.email) {
    return { status: 'invalid' };
  }

  if (normalizeEmailAddress(user.email) !== row.email) {
    return { status: 'invalid' };
  }

  return { status: 'ok', row, user: user as UserRecord };
}

function getUsablePasswordResetToken(token: string):
  | { status: 'ok'; row: PasswordResetTokenRow; user: UserRecord }
  | { status: 'invalid' | 'expired' } {
  const row = stmts.getPasswordResetTokenByHash.get(hashOpaqueToken(token)) as PasswordResetTokenRow | undefined;
  if (!row || row.used_at) {
    return { status: 'invalid' };
  }

  if (new Date(row.expires_at).getTime() <= Date.now()) {
    return { status: 'expired' };
  }

  const user = getUserById(row.user_id);
  if (!user || !user.email) {
    return { status: 'invalid' };
  }

  if (normalizeEmailAddress(user.email) !== row.email) {
    return { status: 'invalid' };
  }

  return { status: 'ok', row, user: user as UserRecord };
}

function purgeExpiredAuthTokens() {
  stmts.deleteExpiredEmailVerificationTokens.run();
  stmts.deleteExpiredPasswordResetTokens.run();
}

function ensureColumn(table: string, column: string, definition: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (rows.some((row) => row.name === column)) {
    return false;
  }

  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  return true;
}
