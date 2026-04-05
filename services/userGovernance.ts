import db from './database.ts';
import { LEGAL_VERSION_SNAPSHOT } from './legalDocuments.ts';

ensureColumn('users', 'terms_accepted_version', `TEXT`);
ensureColumn('users', 'privacy_accepted_version', `TEXT`);
ensureColumn('users', 'ai_notice_accepted_version', `TEXT`);
ensureColumn('users', 'consent_accepted_at', `TEXT`);

const stmts = {
  recordUserConsents: db.prepare<{
    id: string;
    terms_accepted_version: string;
    privacy_accepted_version: string;
    ai_notice_accepted_version: string;
  }>(`
    UPDATE users
    SET terms_accepted_version = @terms_accepted_version,
        privacy_accepted_version = @privacy_accepted_version,
        ai_notice_accepted_version = @ai_notice_accepted_version,
        consent_accepted_at = datetime('now')
    WHERE id = @id
  `),
  deleteUserAccount: db.prepare<[string]>(`DELETE FROM users WHERE id = ?`),
};

export function recordUserConsents(
  userId: string,
  versions: Partial<{
    terms: string;
    privacy: string;
    ai: string;
  }> = {},
) {
  stmts.recordUserConsents.run({
    id: userId,
    terms_accepted_version: versions.terms || LEGAL_VERSION_SNAPSHOT.terms,
    privacy_accepted_version: versions.privacy || LEGAL_VERSION_SNAPSHOT.privacy,
    ai_notice_accepted_version: versions.ai || LEGAL_VERSION_SNAPSHOT.ai,
  });
}

export function deleteUserAccount(userId: string) {
  return stmts.deleteUserAccount.run(userId);
}

function ensureColumn(table: string, column: string, definition: string) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (rows.some((row) => row.name === column)) {
    return;
  }

  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
