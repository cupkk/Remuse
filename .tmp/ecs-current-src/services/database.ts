// ============================================================
// Re-Museum 数据库模块 — SQLite (better-sqlite3)
// 负责建表迁移、提供 CRUD 操作
// ============================================================

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { normalizeEmailAddress } from './auth.ts';

const APP_ROOT = process.env.APP_ROOT ? path.resolve(process.env.APP_ROOT) : process.cwd();
const DB_PATH = path.resolve(process.env.DB_PATH || path.join(APP_ROOT, 'data', 'remuse.db'));

// 确保 data/ 目录存在
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(DB_PATH);

// 性能优化
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ============================================================
// Schema 迁移
// ============================================================

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id          TEXT PRIMARY KEY,
    email       TEXT UNIQUE COLLATE NOCASE,
    password_hash TEXT,
    nickname    TEXT NOT NULL DEFAULT '游客',
    avatar_url  TEXT,
    is_guest    INTEGER NOT NULL DEFAULT 1,
    onboarding_seen INTEGER NOT NULL DEFAULT 0,
    sample_seeded   INTEGER NOT NULL DEFAULT 0,
    toolbox_json    TEXT NOT NULL DEFAULT '[]',
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS collected_items (
    id             TEXT PRIMARY KEY,
    user_id        TEXT NOT NULL,
    name           TEXT NOT NULL,
    hall_id        TEXT NOT NULL DEFAULT '其他',
    category       TEXT NOT NULL DEFAULT '其他',
    material       TEXT NOT NULL DEFAULT '',
    image_path     TEXT NOT NULL DEFAULT '',
    cover_image_path TEXT NOT NULL DEFAULT '',
    story          TEXT,
    tags_json      TEXT NOT NULL DEFAULT '[]',
    ideas_json     TEXT NOT NULL DEFAULT '[]',
    status         TEXT NOT NULL DEFAULT 'raw',
    is_sample      INTEGER NOT NULL DEFAULT 0,
    date_collected TEXT NOT NULL DEFAULT (datetime('now')),
    created_at     TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS stickers (
    id               TEXT PRIMARY KEY,
    user_id          TEXT NOT NULL,
    original_item_id TEXT,
    image_path       TEXT NOT NULL DEFAULT '',
    drama_text       TEXT NOT NULL DEFAULT '',
    category         TEXT NOT NULL DEFAULT '其他',
    date_created     TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id)          REFERENCES users(id)              ON DELETE CASCADE,
    FOREIGN KEY (original_item_id) REFERENCES collected_items(id)    ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_items_user   ON collected_items(user_id);
  CREATE INDEX IF NOT EXISTS idx_stickers_user ON stickers(user_id);

  CREATE TABLE IF NOT EXISTS exhibition_halls (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    name        TEXT NOT NULL,
    image_path  TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_halls_user ON exhibition_halls(user_id);

  CREATE TABLE IF NOT EXISTS refresh_tokens (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    expires_at  TEXT NOT NULL,
    revoked_at  TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);

  CREATE TABLE IF NOT EXISTS item_memory_embeddings (
    item_id         TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL,
    memory_text     TEXT NOT NULL DEFAULT '',
    embedding_json  TEXT NOT NULL DEFAULT '[]',
    dimensions      INTEGER NOT NULL DEFAULT 0,
    updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES collected_items(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_item_memory_embeddings_user
  ON item_memory_embeddings(user_id);
`);

ensureColumn('users', 'onboarding_seen', `INTEGER NOT NULL DEFAULT 0`);
ensureColumn('users', 'sample_seeded', `INTEGER NOT NULL DEFAULT 0`);
ensureColumn('users', 'toolbox_json', `TEXT NOT NULL DEFAULT '[]'`);
ensureColumn('collected_items', 'hall_id', `TEXT NOT NULL DEFAULT '其他'`);
ensureColumn('collected_items', 'is_sample', `INTEGER NOT NULL DEFAULT 0`);
ensureColumn('collected_items', 'cover_image_path', `TEXT NOT NULL DEFAULT ''`);
ensureColumn('exhibition_halls', 'system_hall_id', `TEXT`);
ensureColumn('exhibition_halls', 'is_hidden', `INTEGER NOT NULL DEFAULT 0`);
db.exec(`
  UPDATE collected_items
  SET hall_id = category
  WHERE hall_id IS NULL OR hall_id = ''
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_items_hall ON collected_items(user_id, hall_id)`);
db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_halls_user_system
  ON exhibition_halls(user_id, system_hall_id)
  WHERE system_hall_id IS NOT NULL
`);
normalizeStoredUserEmails();

// ============================================================
// Types
// ============================================================

interface UserRow {
  id: string;
  email: string | null;
  password_hash: string | null;
  nickname: string;
  avatar_url: string | null;
  is_guest: number;
  email_verified: number;
  email_verified_at: string | null;
  onboarding_seen: number;
  sample_seeded: number;
  toolbox_json: string;
  created_at: string;
}

interface ItemRow {
  id: string;
  user_id: string;
  name: string;
  hall_id: string;
  category: string;
  material: string;
  image_path: string;
  cover_image_path: string;
  story: string | null;
  tags_json: string;
  ideas_json: string;
  status: string;
  is_sample: number;
  date_collected: string;
  created_at: string;
}

interface StickerRow {
  id: string;
  user_id: string;
  original_item_id: string | null;
  image_path: string;
  drama_text: string;
  category: string;
  date_created: string;
}

interface HallRow {
  id: string;
  user_id: string;
  name: string;
  image_path: string;
  system_hall_id: string | null;
  is_hidden: number;
  created_at: string;
}

interface RefreshTokenRow {
  id: string;
  user_id: string;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
}

interface ItemMemoryEmbeddingRow {
  item_id: string;
  user_id: string;
  memory_text: string;
  embedding_json: string;
  dimensions: number;
  updated_at: string;
}

// ============================================================
// Prepared Statements
// ============================================================

const stmts = {
  // Users
  insertUser: db.prepare<{
    id: string; email: string | null; password_hash: string | null;
    nickname: string; is_guest: number;
  }>(`
    INSERT INTO users (id, email, password_hash, nickname, is_guest)
    VALUES (@id, @email, @password_hash, @nickname, @is_guest)
  `),
  getUserById: db.prepare<[string]>(`SELECT * FROM users WHERE id = ?`),
  getUserByEmail: db.prepare<[string]>(`SELECT * FROM users WHERE email = ? COLLATE NOCASE LIMIT 1`),
  updateUser: db.prepare<{
    id: string; email: string | null; password_hash: string | null;
    nickname: string; is_guest: number;
  }>(`
    UPDATE users SET email = @email, password_hash = @password_hash,
           nickname = @nickname, is_guest = @is_guest
    WHERE id = @id
  `),
  updateUserPassword: db.prepare<{
    id: string;
    password_hash: string;
  }>(`
    UPDATE users
    SET password_hash = @password_hash
    WHERE id = @id
  `),
  updateUserPreferences: db.prepare<{
    id: string;
    onboarding_seen: number;
    sample_seeded: number;
    toolbox_json: string;
  }>(`
    UPDATE users
    SET onboarding_seen = @onboarding_seen,
        sample_seeded = @sample_seeded,
        toolbox_json = @toolbox_json
    WHERE id = @id
  `),

  // Items
  insertItem: db.prepare<{
    id: string; user_id: string; name: string; hall_id: string; category: string; material: string;
    image_path: string; cover_image_path: string; story: string | null; tags_json: string; ideas_json: string;
    status: string; is_sample: number; date_collected: string;
  }>(`
    INSERT INTO collected_items (id, user_id, name, hall_id, category, material, image_path, cover_image_path, story, tags_json, ideas_json, status, is_sample, date_collected)
    VALUES (@id, @user_id, @name, @hall_id, @category, @material, @image_path, @cover_image_path, @story, @tags_json, @ideas_json, @status, @is_sample, @date_collected)
  `),
  getItemsByUser: db.prepare<[string]>(`SELECT * FROM collected_items WHERE user_id = ? ORDER BY created_at DESC`),
  getItemById: db.prepare<[string, string]>(`SELECT * FROM collected_items WHERE id = ? AND user_id = ?`),
  updateItem: db.prepare<{
    id: string; user_id: string; name: string; hall_id: string; category: string; material: string;
    image_path: string; cover_image_path: string; story: string | null; tags_json: string; ideas_json: string; status: string; is_sample: number;
  }>(`
    UPDATE collected_items
    SET name = @name, hall_id = @hall_id, category = @category, material = @material, image_path = @image_path, cover_image_path = @cover_image_path,
        story = @story, tags_json = @tags_json, ideas_json = @ideas_json, status = @status, is_sample = @is_sample
    WHERE id = @id AND user_id = @user_id
  `),
  deleteItem: db.prepare<[string, string]>(`DELETE FROM collected_items WHERE id = ? AND user_id = ?`),
  reassignItemsHall: db.prepare<{
    user_id: string;
    from_hall_id: string;
    to_hall_id: string;
    to_category: string;
  }>(`
    UPDATE collected_items
    SET hall_id = @to_hall_id, category = @to_category
    WHERE user_id = @user_id AND hall_id = @from_hall_id
  `),
  upsertItemMemoryEmbedding: db.prepare<{
    item_id: string;
    user_id: string;
    memory_text: string;
    embedding_json: string;
    dimensions: number;
  }>(`
    INSERT INTO item_memory_embeddings (
      item_id,
      user_id,
      memory_text,
      embedding_json,
      dimensions,
      updated_at
    )
    VALUES (
      @item_id,
      @user_id,
      @memory_text,
      @embedding_json,
      @dimensions,
      datetime('now')
    )
    ON CONFLICT(item_id) DO UPDATE SET
      user_id = excluded.user_id,
      memory_text = excluded.memory_text,
      embedding_json = excluded.embedding_json,
      dimensions = excluded.dimensions,
      updated_at = datetime('now')
  `),
  getItemMemoryEmbeddingsByUser: db.prepare<[string]>(`
    SELECT * FROM item_memory_embeddings
    WHERE user_id = ?
    ORDER BY updated_at DESC
  `),
  deleteItemMemoryEmbedding: db.prepare<[string, string]>(`
    DELETE FROM item_memory_embeddings
    WHERE item_id = ? AND user_id = ?
  `),

  // Stickers
  insertSticker: db.prepare<{
    id: string; user_id: string; original_item_id: string | null;
    image_path: string; drama_text: string; category: string; date_created: string;
  }>(`
    INSERT INTO stickers (id, user_id, original_item_id, image_path, drama_text, category, date_created)
    VALUES (@id, @user_id, @original_item_id, @image_path, @drama_text, @category, @date_created)
  `),
  getStickersByUser: db.prepare<[string]>(`SELECT * FROM stickers WHERE user_id = ? ORDER BY date_created DESC`),
  getStickerById: db.prepare<[string, string]>(`SELECT * FROM stickers WHERE id = ? AND user_id = ?`),
  deleteSticker: db.prepare<[string, string]>(`DELETE FROM stickers WHERE id = ? AND user_id = ?`),

  // Exhibition Halls
  insertHall: db.prepare<{
    id: string; user_id: string; name: string; image_path: string; system_hall_id: string | null; is_hidden: number;
  }>(`
    INSERT INTO exhibition_halls (id, user_id, name, image_path, system_hall_id, is_hidden)
    VALUES (@id, @user_id, @name, @image_path, @system_hall_id, @is_hidden)
  `),
  getHallsByUser: db.prepare<[string]>(`SELECT * FROM exhibition_halls WHERE user_id = ? ORDER BY created_at ASC`),
  getHallById: db.prepare<[string, string]>(`SELECT * FROM exhibition_halls WHERE id = ? AND user_id = ?`),
  getHallBySystemId: db.prepare<[string, string]>(`SELECT * FROM exhibition_halls WHERE system_hall_id = ? AND user_id = ?`),
  updateHall: db.prepare<{
    id: string; user_id: string; name: string; image_path: string; is_hidden: number;
  }>(`
    UPDATE exhibition_halls
    SET name = @name, image_path = @image_path, is_hidden = @is_hidden
    WHERE id = @id AND user_id = @user_id
  `),
  deleteHall: db.prepare<[string, string]>(`DELETE FROM exhibition_halls WHERE id = ? AND user_id = ?`),

  // Refresh tokens
  insertRefreshToken: db.prepare<{
    id: string;
    user_id: string;
    expires_at: string;
  }>(`
    INSERT INTO refresh_tokens (id, user_id, expires_at)
    VALUES (@id, @user_id, @expires_at)
  `),
  getRefreshTokenById: db.prepare<[string]>(`SELECT * FROM refresh_tokens WHERE id = ?`),
  revokeRefreshToken: db.prepare<[string]>(`
    UPDATE refresh_tokens
    SET revoked_at = datetime('now')
    WHERE id = ? AND revoked_at IS NULL
  `),
  revokeRefreshTokensByUser: db.prepare<[string]>(`
    UPDATE refresh_tokens
    SET revoked_at = datetime('now')
    WHERE user_id = ? AND revoked_at IS NULL
  `),
  revokeOtherRefreshTokensByUser: db.prepare<{
    user_id: string;
    current_token_id: string;
  }>(`
    UPDATE refresh_tokens
    SET revoked_at = datetime('now')
    WHERE user_id = @user_id
      AND id != @current_token_id
      AND revoked_at IS NULL
  `),
};

// ============================================================
// 导出 DAO 函数
// ============================================================

// --- Users ---
export function createUser({
  id,
  email = null,
  password_hash = null,
  nickname = '游客',
  is_guest = 1,
}: {
  id: string;
  email?: string | null;
  password_hash?: string | null;
  nickname?: string;
  is_guest?: number;
}): UserRow {
  const normalizedEmail = email ? normalizeEmailAddress(email) : null;
  stmts.insertUser.run({ id, email: normalizedEmail, password_hash, nickname, is_guest });
  return stmts.getUserById.get(id) as UserRow;
}

export function getUserById(id: string): UserRow | undefined {
  return stmts.getUserById.get(id) as UserRow | undefined;
}

export function getUserByEmail(email: string): UserRow | undefined {
  return stmts.getUserByEmail.get(normalizeEmailAddress(email)) as UserRow | undefined;
}

export function upgradeGuestUser(
  id: string,
  { email, password_hash, nickname }: { email: string; password_hash: string; nickname: string },
): UserRow {
  stmts.updateUser.run({
    id,
    email: normalizeEmailAddress(email),
    password_hash,
    nickname,
    is_guest: 0,
  });
  return stmts.getUserById.get(id) as UserRow;
}

export function updateUserPassword(id: string, password_hash: string): UserRow | undefined {
  stmts.updateUserPassword.run({ id, password_hash });
  return getUserById(id);
}

export function updateUserPreferences(
  id: string,
  updates: Partial<{
    onboardingSeen: boolean;
    toolbox: unknown[];
  }>,
): UserRow | undefined {
  const current = getUserById(id);
  if (!current) return undefined;

  const currentToolbox = safeJsonParse(current.toolbox_json, []);
  stmts.updateUserPreferences.run({
    id,
    onboarding_seen: (updates.onboardingSeen ?? !!current.onboarding_seen) ? 1 : 0,
    sample_seeded: !!current.sample_seeded ? 1 : 0,
    toolbox_json: JSON.stringify(updates.toolbox ?? currentToolbox),
  });

  return getUserById(id);
}

// --- Items ---
export function createItem(item: {
  id: string;
  user_id: string;
  name: string;
  hall_id?: string;
  category?: string;
  material?: string;
  image_path?: string;
  cover_image_path?: string;
  story?: string | null;
  tags?: string[];
  ideas?: unknown[];
  status?: string;
  date_collected?: string;
}) {
  stmts.insertItem.run({
    id: item.id,
    user_id: item.user_id,
    name: item.name,
    hall_id: item.hall_id || item.category || '其他',
    category: item.category || '其他',
    material: item.material || '',
    image_path: item.image_path || '',
    cover_image_path: item.cover_image_path || '',
    story: item.story || null,
    tags_json: JSON.stringify(item.tags || []),
    ideas_json: JSON.stringify(item.ideas || []),
    status: item.status || 'raw',
    is_sample: 0,
    date_collected: item.date_collected || new Date().toISOString(),
  });
  const row = stmts.getItemById.get(item.id, item.user_id) as ItemRow | undefined;
  return row ? rowToItem(row) : null;
}

export function getItemsByUser(userId: string) {
  const rows = stmts.getItemsByUser.all(userId) as ItemRow[];
  return rows.map(rowToItem);
}

export function getItemById(id: string, userId: string) {
  const row = stmts.getItemById.get(id, userId) as ItemRow | undefined;
  return row ? rowToItem(row) : null;
}

export function updateItem(item: {
  id: string;
  user_id: string;
  name: string;
  hall_id?: string;
  category?: string;
  material?: string;
  image_path?: string;
  cover_image_path?: string;
  story?: string | null;
  tags?: string[];
  ideas?: unknown[];
  status?: string;
}) {
  stmts.updateItem.run({
    id: item.id,
    user_id: item.user_id,
    name: item.name,
    hall_id: item.hall_id || item.category || '其他',
    category: item.category || '其他',
    material: item.material || '',
    image_path: item.image_path || '',
    cover_image_path: item.cover_image_path || '',
    story: item.story || null,
    tags_json: JSON.stringify(item.tags || []),
    ideas_json: JSON.stringify(item.ideas || []),
    status: item.status || 'raw',
    is_sample: 0,
  });
  const row = stmts.getItemById.get(item.id, item.user_id) as ItemRow | undefined;
  return row ? rowToItem(row) : null;
}

export function deleteItem(id: string, userId: string) {
  return stmts.deleteItem.run(id, userId);
}

export function reassignItemsHall(userId: string, fromHallId: string, toHallId: string, toCategory: string) {
  return stmts.reassignItemsHall.run({
    user_id: userId,
    from_hall_id: fromHallId,
    to_hall_id: toHallId,
    to_category: toCategory,
  });
}

export function upsertItemMemoryEmbedding({
  item_id,
  user_id,
  memory_text,
  embedding,
  dimensions,
}: {
  item_id: string;
  user_id: string;
  memory_text: string;
  embedding: number[];
  dimensions?: number;
}) {
  stmts.upsertItemMemoryEmbedding.run({
    item_id,
    user_id,
    memory_text,
    embedding_json: JSON.stringify(embedding || []),
    dimensions: dimensions ?? embedding.length,
  });
}

export function getItemMemoryEmbeddingsByUser(userId: string) {
  const rows = stmts.getItemMemoryEmbeddingsByUser.all(userId) as ItemMemoryEmbeddingRow[];
  return rows.map((row) => ({
    itemId: row.item_id,
    userId: row.user_id,
    memoryText: row.memory_text,
    embedding: safeJsonParse<number[]>(row.embedding_json, []),
    dimensions: row.dimensions,
    updatedAt: row.updated_at,
  }));
}

export function deleteItemMemoryEmbedding(itemId: string, userId: string) {
  return stmts.deleteItemMemoryEmbedding.run(itemId, userId);
}

// --- Stickers ---
export function createSticker(sticker: {
  id: string;
  user_id: string;
  original_item_id?: string | null;
  image_path?: string;
  drama_text?: string;
  category?: string;
  date_created?: string;
}) {
  stmts.insertSticker.run({
    id: sticker.id,
    user_id: sticker.user_id,
    original_item_id: sticker.original_item_id || null,
    image_path: sticker.image_path || '',
    drama_text: sticker.drama_text || '',
    category: sticker.category || '其他',
    date_created: sticker.date_created || new Date().toISOString(),
  });
}

export function getStickersByUser(userId: string) {
  const rows = stmts.getStickersByUser.all(userId) as StickerRow[];
  return rows.map(rowToSticker);
}

export function getStickerById(id: string, userId: string) {
  const row = stmts.getStickerById.get(id, userId) as StickerRow | undefined;
  return row ? rowToSticker(row) : null;
}

export function deleteSticker(id: string, userId: string) {
  return stmts.deleteSticker.run(id, userId);
}

// --- Exhibition Halls ---
export function createHall({
  id,
  user_id,
  name,
  image_path = '',
}: {
  id: string;
  user_id: string;
  name: string;
  image_path?: string;
}) {
  stmts.insertHall.run({ id, user_id, name, image_path, system_hall_id: null, is_hidden: 0 });
  return {
    id,
    name,
    imageUrl: image_path,
    isCustom: true,
    isHidden: false,
  };
}

export function getHallsByUser(userId: string) {
  const rows = stmts.getHallsByUser.all(userId) as HallRow[];
  return rows.map(rowToHall);
}

export function getHallById(id: string, userId: string) {
  const row =
    (stmts.getHallById.get(id, userId) as HallRow | undefined)
    || (stmts.getHallBySystemId.get(id, userId) as HallRow | undefined);
  return row ? rowToHall(row) : null;
}

export function getHallRecordById(id: string, userId: string) {
  return stmts.getHallById.get(id, userId) as HallRow | undefined;
}

export function getHallRecordBySystemId(systemHallId: string, userId: string) {
  return stmts.getHallBySystemId.get(systemHallId, userId) as HallRow | undefined;
}

export function createSystemHallOverride({
  id,
  user_id,
  system_hall_id,
  name,
  image_path = '',
  is_hidden = false,
}: {
  id: string;
  user_id: string;
  system_hall_id: string;
  name: string;
  image_path?: string;
  is_hidden?: boolean;
}) {
  stmts.insertHall.run({
    id,
    user_id,
    name,
    image_path,
    system_hall_id,
    is_hidden: is_hidden ? 1 : 0,
  });
  return getHallById(system_hall_id, user_id);
}

export function updateHall({
  id,
  user_id,
  name,
  image_path = '',
  is_hidden = false,
}: {
  id: string;
  user_id: string;
  name: string;
  image_path?: string;
  is_hidden?: boolean;
}) {
  stmts.updateHall.run({ id, user_id, name, image_path, is_hidden: is_hidden ? 1 : 0 });
  return getHallById(id, user_id);
}

export function deleteHall(id: string, userId: string) {
  return stmts.deleteHall.run(id, userId);
}

export function createRefreshTokenSession({
  id,
  user_id,
  expires_at,
}: {
  id: string;
  user_id: string;
  expires_at: string;
}) {
  stmts.insertRefreshToken.run({ id, user_id, expires_at });
}

export function getRefreshTokenSession(id: string): RefreshTokenRow | undefined {
  return stmts.getRefreshTokenById.get(id) as RefreshTokenRow | undefined;
}

export function revokeRefreshTokenSession(id: string) {
  return stmts.revokeRefreshToken.run(id);
}

export function revokeRefreshTokenSessionsForUser(userId: string, currentTokenId?: string) {
  if (currentTokenId) {
    return stmts.revokeOtherRefreshTokensByUser.run({ user_id: userId, current_token_id: currentTokenId });
  }

  return stmts.revokeRefreshTokensByUser.run(userId);
}

// ============================================================
// Row → Frontend-friendly object 转换
// ============================================================

function rowToItem(row: ItemRow) {
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    hallId: row.hall_id || row.category,
    category: row.category,
    material: row.material,
    imageUrl: row.image_path,
    image_path: row.image_path,
    coverImageUrl: row.cover_image_path || '',
    cover_image_path: row.cover_image_path || '',
    dateCollected: row.date_collected,
    story: row.story || '',
    tags: safeJsonParse(row.tags_json, []),
    ideas: safeJsonParse(row.ideas_json, []),
    status: row.status,
  };
}

function rowToSticker(row: StickerRow) {
  return {
    id: row.id,
    user_id: row.user_id,
    originalItemId: row.original_item_id,
    stickerImageUrl: row.image_path,
    image_path: row.image_path,
    dramaText: row.drama_text,
    category: row.category,
    dateCreated: row.date_created,
  };
}

function rowToHall(row: HallRow) {
  return {
    id: row.system_hall_id || row.id,
    name: row.name,
    imageUrl: row.image_path || '',
    isCustom: !row.system_hall_id,
    systemHallId: row.system_hall_id || undefined,
    isHidden: !!row.is_hidden,
  };
}

function safeJsonParse<T>(str: string, fallback: T): T {
  try { return JSON.parse(str); } catch { return fallback; }
}

function normalizeStoredUserEmails() {
  const duplicateRows = db.prepare(`
    SELECT lower(trim(email)) AS normalized_email, COUNT(*) AS count
    FROM users
    WHERE email IS NOT NULL
    GROUP BY lower(trim(email))
    HAVING COUNT(*) > 1
  `).all() as Array<{ normalized_email: string; count: number }>;

  if (duplicateRows.length > 0) {
    console.warn(
      'Skipping case-insensitive email migration because duplicate emails already exist:',
      duplicateRows.map((row) => `${row.normalized_email} (${row.count})`).join(', '),
    );
    return;
  }

  db.exec(`
    UPDATE users
    SET email = lower(trim(email))
    WHERE email IS NOT NULL
      AND email != lower(trim(email))
  `);

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_nocase
    ON users(email COLLATE NOCASE)
    WHERE email IS NOT NULL
  `);
}

function ensureColumn(table: string, column: string, definition: string) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (rows.some((row) => row.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

export default db;
