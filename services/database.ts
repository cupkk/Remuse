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

export type UserRole = 'admin' | 'user';

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
    role        TEXT NOT NULL DEFAULT 'user',
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
    description    TEXT NOT NULL DEFAULT '',
    image_path     TEXT NOT NULL DEFAULT '',
    cover_image_path TEXT NOT NULL DEFAULT '',
    audio_path     TEXT NOT NULL DEFAULT '',
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
    metadata_json    TEXT NOT NULL DEFAULT '{}',
    category         TEXT NOT NULL DEFAULT '其他',
    date_created     TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id)          REFERENCES users(id)              ON DELETE CASCADE,
    FOREIGN KEY (original_item_id) REFERENCES collected_items(id)    ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_items_user   ON collected_items(user_id);
  CREATE INDEX IF NOT EXISTS idx_stickers_user ON stickers(user_id);

  CREATE TABLE IF NOT EXISTS transformation_guides (
    id               TEXT PRIMARY KEY,
    user_id          TEXT NOT NULL,
    title            TEXT NOT NULL DEFAULT '',
    summary          TEXT NOT NULL DEFAULT '',
    concept          TEXT NOT NULL DEFAULT '',
    materials_json   TEXT NOT NULL DEFAULT '[]',
    steps_json       TEXT NOT NULL DEFAULT '[]',
    tips_json        TEXT NOT NULL DEFAULT '[]',
    item_ids_json    TEXT NOT NULL DEFAULT '[]',
    source_items_json TEXT NOT NULL DEFAULT '[]',
    image_path       TEXT NOT NULL DEFAULT '',
    date_created     TEXT NOT NULL DEFAULT (datetime('now')),
    created_at       TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_transformation_guides_user
  ON transformation_guides(user_id, date_created DESC);

  CREATE TABLE IF NOT EXISTS saved_journals (
    id                    TEXT PRIMARY KEY,
    user_id               TEXT NOT NULL,
    title                 TEXT NOT NULL DEFAULT '',
    preview_image_path    TEXT NOT NULL DEFAULT '',
    background_image_path TEXT NOT NULL DEFAULT '',
    template_id           TEXT NOT NULL DEFAULT 'calendar-journal',
    year                  INTEGER NOT NULL DEFAULT 2026,
    month                 INTEGER NOT NULL DEFAULT 1,
    header_note           TEXT NOT NULL DEFAULT '',
    background_color      TEXT NOT NULL DEFAULT '#fffdf7',
    background_overlay    REAL NOT NULL DEFAULT 0.74,
    selected_sticker_ids_json TEXT NOT NULL DEFAULT '[]',
    layout_items_json     TEXT NOT NULL DEFAULT '[]',
    date_created          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at            TEXT NOT NULL DEFAULT (datetime('now')),
    created_at            TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_saved_journals_user
  ON saved_journals(user_id, updated_at DESC);

  CREATE TABLE IF NOT EXISTS shared_museums (
    id               TEXT PRIMARY KEY,
    owner_user_id    TEXT NOT NULL,
    name             TEXT NOT NULL,
    description      TEXT NOT NULL DEFAULT '',
    invite_code      TEXT NOT NULL UNIQUE,
    invite_enabled   INTEGER NOT NULL DEFAULT 1,
    status           TEXT NOT NULL DEFAULT 'active',
    anniversary_date TEXT NOT NULL DEFAULT '',
    theme            TEXT NOT NULL DEFAULT 'shared-memory',
    quiet_mode       INTEGER NOT NULL DEFAULT 0,
    cover_image_path TEXT NOT NULL DEFAULT '',
    created_at       TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_shared_museums_owner
  ON shared_museums(owner_user_id, updated_at DESC);

  CREATE TABLE IF NOT EXISTS shared_museum_members (
    id                   TEXT PRIMARY KEY,
    museum_id            TEXT NOT NULL,
    user_id              TEXT NOT NULL,
    role                 TEXT NOT NULL DEFAULT 'partner',
    notification_enabled INTEGER NOT NULL DEFAULT 1,
    quiet_mode           INTEGER NOT NULL DEFAULT 0,
    joined_at            TEXT NOT NULL DEFAULT (datetime('now')),
    created_at           TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (museum_id) REFERENCES shared_museums(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_shared_museum_members_unique
  ON shared_museum_members(museum_id, user_id);

  CREATE INDEX IF NOT EXISTS idx_shared_museum_members_user
  ON shared_museum_members(user_id, joined_at DESC);

  CREATE TABLE IF NOT EXISTS shared_museum_items (
    id               TEXT PRIMARY KEY,
    museum_id        TEXT NOT NULL,
    source_item_id   TEXT NOT NULL,
    source_user_id   TEXT NOT NULL,
    shared_by_user_id TEXT NOT NULL,
    name             TEXT NOT NULL,
    hall_id          TEXT NOT NULL DEFAULT '其他',
    category         TEXT NOT NULL DEFAULT '其他',
    material         TEXT NOT NULL DEFAULT '',
    description      TEXT NOT NULL DEFAULT '',
    image_path       TEXT NOT NULL DEFAULT '',
    cover_image_path TEXT NOT NULL DEFAULT '',
    audio_path       TEXT NOT NULL DEFAULT '',
    story            TEXT NOT NULL DEFAULT '',
    tags_json        TEXT NOT NULL DEFAULT '[]',
    shared_note      TEXT NOT NULL DEFAULT '',
    relation_label   TEXT NOT NULL DEFAULT '',
    date_collected   TEXT NOT NULL DEFAULT (datetime('now')),
    date_shared      TEXT NOT NULL DEFAULT (datetime('now')),
    created_at       TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (museum_id) REFERENCES shared_museums(id) ON DELETE CASCADE,
    FOREIGN KEY (source_item_id) REFERENCES collected_items(id) ON DELETE CASCADE,
    FOREIGN KEY (source_user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (shared_by_user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_shared_museum_items_unique
  ON shared_museum_items(museum_id, source_item_id);

  CREATE INDEX IF NOT EXISTS idx_shared_museum_items_museum
  ON shared_museum_items(museum_id, date_shared DESC);

  CREATE TABLE IF NOT EXISTS shared_museum_reports (
    id            TEXT PRIMARY KEY,
    museum_id     TEXT NOT NULL,
    month_key     TEXT NOT NULL,
    month_label   TEXT NOT NULL,
    snapshot_json TEXT NOT NULL DEFAULT '{}',
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (museum_id) REFERENCES shared_museums(id) ON DELETE CASCADE
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_shared_museum_reports_unique
  ON shared_museum_reports(museum_id, month_key);

  CREATE INDEX IF NOT EXISTS idx_shared_museum_reports_museum
  ON shared_museum_reports(museum_id, updated_at DESC);

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
ensureColumn('users', 'role', `TEXT NOT NULL DEFAULT 'user'`);
ensureColumn('collected_items', 'hall_id', `TEXT NOT NULL DEFAULT '其他'`);
ensureColumn('collected_items', 'is_sample', `INTEGER NOT NULL DEFAULT 0`);
ensureColumn('collected_items', 'cover_image_path', `TEXT NOT NULL DEFAULT ''`);
ensureColumn('collected_items', 'description', `TEXT NOT NULL DEFAULT ''`);
ensureColumn('collected_items', 'audio_path', `TEXT NOT NULL DEFAULT ''`);
ensureColumn('stickers', 'metadata_json', `TEXT NOT NULL DEFAULT '{}'`);
ensureColumn('saved_journals', 'preview_image_path', `TEXT NOT NULL DEFAULT ''`);
ensureColumn('saved_journals', 'background_image_path', `TEXT NOT NULL DEFAULT ''`);
ensureColumn('saved_journals', 'template_id', `TEXT NOT NULL DEFAULT 'calendar-journal'`);
ensureColumn('saved_journals', 'year', `INTEGER NOT NULL DEFAULT 2026`);
ensureColumn('saved_journals', 'month', `INTEGER NOT NULL DEFAULT 1`);
ensureColumn('saved_journals', 'header_note', `TEXT NOT NULL DEFAULT ''`);
ensureColumn('saved_journals', 'background_color', `TEXT NOT NULL DEFAULT '#fffdf7'`);
ensureColumn('saved_journals', 'background_overlay', `REAL NOT NULL DEFAULT 0.74`);
ensureColumn('saved_journals', 'selected_sticker_ids_json', `TEXT NOT NULL DEFAULT '[]'`);
ensureColumn('saved_journals', 'layout_items_json', `TEXT NOT NULL DEFAULT '[]'`);
ensureColumn('saved_journals', 'updated_at', `TEXT NOT NULL DEFAULT (datetime('now'))`);
ensureColumn('exhibition_halls', 'system_hall_id', `TEXT`);
ensureColumn('exhibition_halls', 'is_hidden', `INTEGER NOT NULL DEFAULT 0`);
ensureColumn('shared_museums', 'invite_enabled', `INTEGER NOT NULL DEFAULT 1`);
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
db.exec(`
  UPDATE users
  SET role = CASE
    WHEN lower(trim(COALESCE(role, ''))) = 'admin' THEN 'admin'
    ELSE 'user'
  END
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
  role: UserRole;
  email_verified: number;
  email_verified_at: string | null;
  onboarding_seen: number;
  sample_seeded: number;
  toolbox_json: string;
  terms_accepted_version: string | null;
  privacy_accepted_version: string | null;
  ai_notice_accepted_version: string | null;
  consent_accepted_at: string | null;
  created_at: string;
}

interface ItemRow {
  id: string;
  user_id: string;
  name: string;
  hall_id: string;
  category: string;
  material: string;
  description: string;
  image_path: string;
  cover_image_path: string;
  audio_path: string;
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
  metadata_json: string;
  date_created: string;
}

interface TransformationGuideRow {
  id: string;
  user_id: string;
  title: string;
  summary: string;
  concept: string;
  materials_json: string;
  steps_json: string;
  tips_json: string;
  item_ids_json: string;
  source_items_json: string;
  image_path: string;
  date_created: string;
  created_at: string;
}

interface SavedJournalRow {
  id: string;
  user_id: string;
  title: string;
  preview_image_path: string;
  background_image_path: string;
  template_id: string;
  year: number;
  month: number;
  header_note: string;
  background_color: string;
  background_overlay: number;
  selected_sticker_ids_json: string;
  layout_items_json: string;
  date_created: string;
  updated_at: string;
  created_at: string;
}

interface SharedMuseumRow {
  id: string;
  owner_user_id: string;
  name: string;
  description: string;
  invite_code: string;
  invite_enabled: number;
  status: string;
  anniversary_date: string;
  theme: string;
  quiet_mode: number;
  cover_image_path: string;
  created_at: string;
  updated_at: string;
}

interface SharedMuseumMemberRow {
  id: string;
  museum_id: string;
  user_id: string;
  role: string;
  notification_enabled: number;
  quiet_mode: number;
  joined_at: string;
  created_at: string;
  nickname: string;
}

interface SharedMuseumItemRow {
  id: string;
  museum_id: string;
  source_item_id: string;
  source_user_id: string;
  shared_by_user_id: string;
  name: string;
  hall_id: string;
  category: string;
  material: string;
  description: string;
  image_path: string;
  cover_image_path: string;
  audio_path: string;
  story: string;
  tags_json: string;
  shared_note: string;
  relation_label: string;
  date_collected: string;
  date_shared: string;
  created_at: string;
}

interface SharedMuseumReportRow {
  id: string;
  museum_id: string;
  month_key: string;
  month_label: string;
  snapshot_json: string;
  created_at: string;
  updated_at: string;
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
  updateUserRole: db.prepare<{
    id: string;
    role: UserRole;
  }>(`
    UPDATE users
    SET role = @role
    WHERE id = @id
  `),

  // Items
  insertItem: db.prepare<{
    id: string; user_id: string; name: string; hall_id: string; category: string; material: string; description: string;
    image_path: string; cover_image_path: string; audio_path: string; story: string | null; tags_json: string; ideas_json: string;
    status: string; is_sample: number; date_collected: string;
  }>(`
    INSERT INTO collected_items (id, user_id, name, hall_id, category, material, description, image_path, cover_image_path, audio_path, story, tags_json, ideas_json, status, is_sample, date_collected)
    VALUES (@id, @user_id, @name, @hall_id, @category, @material, @description, @image_path, @cover_image_path, @audio_path, @story, @tags_json, @ideas_json, @status, @is_sample, @date_collected)
  `),
  getItemsByUser: db.prepare<[string]>(`SELECT * FROM collected_items WHERE user_id = ? ORDER BY created_at DESC`),
  getItemById: db.prepare<[string, string]>(`SELECT * FROM collected_items WHERE id = ? AND user_id = ?`),
  updateItem: db.prepare<{
    id: string; user_id: string; name: string; hall_id: string; category: string; material: string; description: string;
    image_path: string; cover_image_path: string; audio_path: string; story: string | null; tags_json: string; ideas_json: string; status: string; is_sample: number;
  }>(`
    UPDATE collected_items
    SET name = @name, hall_id = @hall_id, category = @category, material = @material, description = @description, image_path = @image_path, cover_image_path = @cover_image_path, audio_path = @audio_path,
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
    image_path: string; drama_text: string; category: string; metadata_json: string; date_created: string;
  }>(`
    INSERT INTO stickers (id, user_id, original_item_id, image_path, drama_text, category, metadata_json, date_created)
    VALUES (@id, @user_id, @original_item_id, @image_path, @drama_text, @category, @metadata_json, @date_created)
  `),
  getStickersByUser: db.prepare<[string]>(`SELECT * FROM stickers WHERE user_id = ? ORDER BY date_created DESC`),
  getStickerById: db.prepare<[string, string]>(`SELECT * FROM stickers WHERE id = ? AND user_id = ?`),
  deleteSticker: db.prepare<[string, string]>(`DELETE FROM stickers WHERE id = ? AND user_id = ?`),

  // Transformation guides
  insertTransformationGuide: db.prepare<{
    id: string;
    user_id: string;
    title: string;
    summary: string;
    concept: string;
    materials_json: string;
    steps_json: string;
    tips_json: string;
    item_ids_json: string;
    source_items_json: string;
    image_path: string;
    date_created: string;
  }>(`
    INSERT INTO transformation_guides (
      id,
      user_id,
      title,
      summary,
      concept,
      materials_json,
      steps_json,
      tips_json,
      item_ids_json,
      source_items_json,
      image_path,
      date_created
    )
    VALUES (
      @id,
      @user_id,
      @title,
      @summary,
      @concept,
      @materials_json,
      @steps_json,
      @tips_json,
      @item_ids_json,
      @source_items_json,
      @image_path,
      @date_created
    )
  `),
  getTransformationGuidesByUser: db.prepare<[string]>(`
    SELECT *
    FROM transformation_guides
    WHERE user_id = ?
    ORDER BY date_created DESC, created_at DESC
  `),
  getTransformationGuideById: db.prepare<[string, string]>(`
    SELECT *
    FROM transformation_guides
    WHERE id = ? AND user_id = ?
  `),
  deleteTransformationGuide: db.prepare<[string, string]>(`
    DELETE FROM transformation_guides
    WHERE id = ? AND user_id = ?
  `),

  // Saved journals
  insertSavedJournal: db.prepare<{
    id: string;
    user_id: string;
    title: string;
    preview_image_path: string;
    background_image_path: string;
    template_id: string;
    year: number;
    month: number;
    header_note: string;
    background_color: string;
    background_overlay: number;
    selected_sticker_ids_json: string;
    layout_items_json: string;
    date_created: string;
  }>(`
    INSERT INTO saved_journals (
      id,
      user_id,
      title,
      preview_image_path,
      background_image_path,
      template_id,
      year,
      month,
      header_note,
      background_color,
      background_overlay,
      selected_sticker_ids_json,
      layout_items_json,
      date_created,
      updated_at
    )
    VALUES (
      @id,
      @user_id,
      @title,
      @preview_image_path,
      @background_image_path,
      @template_id,
      @year,
      @month,
      @header_note,
      @background_color,
      @background_overlay,
      @selected_sticker_ids_json,
      @layout_items_json,
      @date_created,
      datetime('now')
    )
  `),
  updateSavedJournal: db.prepare<{
    id: string;
    user_id: string;
    title: string;
    preview_image_path: string;
    background_image_path: string;
    template_id: string;
    year: number;
    month: number;
    header_note: string;
    background_color: string;
    background_overlay: number;
    selected_sticker_ids_json: string;
    layout_items_json: string;
  }>(`
    UPDATE saved_journals
    SET title = @title,
        preview_image_path = @preview_image_path,
        background_image_path = @background_image_path,
        template_id = @template_id,
        year = @year,
        month = @month,
        header_note = @header_note,
        background_color = @background_color,
        background_overlay = @background_overlay,
        selected_sticker_ids_json = @selected_sticker_ids_json,
        layout_items_json = @layout_items_json,
        updated_at = datetime('now')
    WHERE id = @id AND user_id = @user_id
  `),
  getSavedJournalsByUser: db.prepare<[string]>(`
    SELECT *
    FROM saved_journals
    WHERE user_id = ?
    ORDER BY updated_at DESC, date_created DESC
  `),
  getSavedJournalById: db.prepare<[string, string]>(`
    SELECT *
    FROM saved_journals
    WHERE id = ? AND user_id = ?
  `),
  deleteSavedJournal: db.prepare<[string, string]>(`
    DELETE FROM saved_journals
    WHERE id = ? AND user_id = ?
  `),

  // Shared museums
  insertSharedMuseum: db.prepare<{
    id: string;
    owner_user_id: string;
    name: string;
    description: string;
    invite_code: string;
    invite_enabled: number;
    status: string;
    anniversary_date: string;
    theme: string;
    quiet_mode: number;
    cover_image_path: string;
  }>(`
    INSERT INTO shared_museums (
      id,
      owner_user_id,
      name,
      description,
      invite_code,
      invite_enabled,
      status,
      anniversary_date,
      theme,
      quiet_mode,
      cover_image_path,
      updated_at
    )
    VALUES (
      @id,
      @owner_user_id,
      @name,
      @description,
      @invite_code,
      @invite_enabled,
      @status,
      @anniversary_date,
      @theme,
      @quiet_mode,
      @cover_image_path,
      datetime('now')
    )
  `),
  getSharedMuseumById: db.prepare<[string]>(`
    SELECT *
    FROM shared_museums
    WHERE id = ?
  `),
  getSharedMuseumByInviteCode: db.prepare<[string]>(`
    SELECT *
    FROM shared_museums
    WHERE upper(invite_code) = upper(?)
  `),
  getSharedMuseumsByUser: db.prepare<[string]>(`
    SELECT DISTINCT sm.*
    FROM shared_museums sm
    INNER JOIN shared_museum_members smm
      ON smm.museum_id = sm.id
    WHERE smm.user_id = ?
    ORDER BY sm.updated_at DESC, sm.created_at DESC
  `),
  updateSharedMuseum: db.prepare<{
    id: string;
    owner_user_id: string;
    name: string;
    description: string;
    invite_code: string;
    invite_enabled: number;
    status: string;
    anniversary_date: string;
    theme: string;
    quiet_mode: number;
    cover_image_path: string;
  }>(`
    UPDATE shared_museums
    SET name = @name,
        description = @description,
        invite_code = @invite_code,
        invite_enabled = @invite_enabled,
        status = @status,
        anniversary_date = @anniversary_date,
        theme = @theme,
        quiet_mode = @quiet_mode,
        cover_image_path = @cover_image_path,
        updated_at = datetime('now')
    WHERE id = @id AND owner_user_id = @owner_user_id
  `),
  touchSharedMuseumActivity: db.prepare<{
    id: string;
    cover_image_path: string;
  }>(`
    UPDATE shared_museums
    SET updated_at = datetime('now'),
        cover_image_path = CASE
          WHEN @cover_image_path != '' AND (cover_image_path = '' OR cover_image_path IS NULL)
            THEN @cover_image_path
          ELSE cover_image_path
        END
    WHERE id = @id
  `),
  insertSharedMuseumMember: db.prepare<{
    id: string;
    museum_id: string;
    user_id: string;
    role: string;
    notification_enabled: number;
    quiet_mode: number;
    joined_at: string;
  }>(`
    INSERT OR IGNORE INTO shared_museum_members (
      id,
      museum_id,
      user_id,
      role,
      notification_enabled,
      quiet_mode,
      joined_at
    )
    VALUES (
      @id,
      @museum_id,
      @user_id,
      @role,
      @notification_enabled,
      @quiet_mode,
      @joined_at
    )
  `),
  getSharedMuseumMembersByMuseumId: db.prepare<[string]>(`
    SELECT
      smm.*,
      u.nickname AS nickname
    FROM shared_museum_members smm
    INNER JOIN users u
      ON u.id = smm.user_id
    WHERE smm.museum_id = ?
    ORDER BY CASE WHEN smm.role = 'creator' THEN 0 ELSE 1 END, smm.joined_at ASC
  `),
  getSharedMuseumMemberCount: db.prepare<[string]>(`
    SELECT COUNT(*) as count
    FROM shared_museum_members
    WHERE museum_id = ?
  `),
  getSharedMuseumMembership: db.prepare<[string, string]>(`
    SELECT smm.*, u.nickname AS nickname
    FROM shared_museum_members smm
    INNER JOIN users u
      ON u.id = smm.user_id
    WHERE smm.museum_id = ? AND smm.user_id = ?
  `),
  deleteSharedMuseumMember: db.prepare<[string, string]>(`
    DELETE FROM shared_museum_members
    WHERE museum_id = ? AND user_id = ?
  `),
  getSharedMuseumReportsByMuseumId: db.prepare<[string]>(`
    SELECT *
    FROM shared_museum_reports
    WHERE museum_id = ?
    ORDER BY updated_at DESC, created_at DESC
  `),
  getSharedMuseumReportByMonth: db.prepare<[string, string]>(`
    SELECT *
    FROM shared_museum_reports
    WHERE museum_id = ? AND month_key = ?
  `),
  insertSharedMuseumReport: db.prepare<{
    id: string;
    museum_id: string;
    month_key: string;
    month_label: string;
    snapshot_json: string;
  }>(`
    INSERT INTO shared_museum_reports (
      id,
      museum_id,
      month_key,
      month_label,
      snapshot_json,
      updated_at
    )
    VALUES (
      @id,
      @museum_id,
      @month_key,
      @month_label,
      @snapshot_json,
      datetime('now')
    )
  `),
  updateSharedMuseumReport: db.prepare<{
    id: string;
    museum_id: string;
    month_label: string;
    snapshot_json: string;
  }>(`
    UPDATE shared_museum_reports
    SET month_label = @month_label,
        snapshot_json = @snapshot_json,
        updated_at = datetime('now')
    WHERE id = @id AND museum_id = @museum_id
  `),
  insertSharedMuseumItem: db.prepare<{
    id: string;
    museum_id: string;
    source_item_id: string;
    source_user_id: string;
    shared_by_user_id: string;
    name: string;
    hall_id: string;
    category: string;
    material: string;
    description: string;
    image_path: string;
    cover_image_path: string;
    audio_path: string;
    story: string;
    tags_json: string;
    shared_note: string;
    relation_label: string;
    date_collected: string;
    date_shared: string;
  }>(`
    INSERT INTO shared_museum_items (
      id,
      museum_id,
      source_item_id,
      source_user_id,
      shared_by_user_id,
      name,
      hall_id,
      category,
      material,
      description,
      image_path,
      cover_image_path,
      audio_path,
      story,
      tags_json,
      shared_note,
      relation_label,
      date_collected,
      date_shared
    )
    VALUES (
      @id,
      @museum_id,
      @source_item_id,
      @source_user_id,
      @shared_by_user_id,
      @name,
      @hall_id,
      @category,
      @material,
      @description,
      @image_path,
      @cover_image_path,
      @audio_path,
      @story,
      @tags_json,
      @shared_note,
      @relation_label,
      @date_collected,
      @date_shared
    )
  `),
  getSharedMuseumItemsByMuseumId: db.prepare<[string]>(`
    SELECT *
    FROM shared_museum_items
    WHERE museum_id = ?
    ORDER BY date_shared DESC, created_at DESC
  `),
  getSharedMuseumItemById: db.prepare<[string, string]>(`
    SELECT *
    FROM shared_museum_items
    WHERE id = ? AND museum_id = ?
  `),
  getSharedMuseumItemBySource: db.prepare<[string, string]>(`
    SELECT *
    FROM shared_museum_items
    WHERE museum_id = ? AND source_item_id = ?
  `),
  updateSharedMuseumItem: db.prepare<{
    id: string;
    museum_id: string;
    shared_note: string;
    relation_label: string;
  }>(`
    UPDATE shared_museum_items
    SET shared_note = @shared_note,
        relation_label = @relation_label
    WHERE id = @id AND museum_id = @museum_id
  `),
  deleteSharedMuseumItem: db.prepare<[string, string]>(`
    DELETE FROM shared_museum_items
    WHERE id = ? AND museum_id = ?
  `),
  getSharedMuseumItemCountByMuseumId: db.prepare<[string]>(`
    SELECT COUNT(*) AS count
    FROM shared_museum_items
    WHERE museum_id = ?
  `),

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

export function updateUserRole(id: string, role: UserRole): UserRow | undefined {
  stmts.updateUserRole.run({ id, role });
  return getUserById(id);
}

export function setUserRoleByEmail(email: string, role: UserRole): UserRow | undefined {
  const user = getUserByEmail(email);
  if (!user) {
    return undefined;
  }

  return updateUserRole(user.id, role);
}

// --- Items ---
export function createItem(item: {
  id: string;
  user_id: string;
  name: string;
  hall_id?: string;
  category?: string;
  material?: string;
  description?: string;
  image_path?: string;
  cover_image_path?: string;
  audio_path?: string;
  story?: string | null;
  tags?: string[];
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
    description: item.description || '',
    image_path: item.image_path || '',
    cover_image_path: item.cover_image_path || '',
    audio_path: item.audio_path || '',
    story: item.story || null,
    tags_json: JSON.stringify(item.tags || []),
    ideas_json: '[]',
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
  description?: string;
  image_path?: string;
  cover_image_path?: string;
  audio_path?: string;
  story?: string | null;
  tags?: string[];
  status?: string;
}) {
  stmts.updateItem.run({
    id: item.id,
    user_id: item.user_id,
    name: item.name,
    hall_id: item.hall_id || item.category || '其他',
    category: item.category || '其他',
    material: item.material || '',
    description: item.description || '',
    image_path: item.image_path || '',
    cover_image_path: item.cover_image_path || '',
    audio_path: item.audio_path || '',
    story: item.story || null,
    tags_json: JSON.stringify(item.tags || []),
    ideas_json: '[]',
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
  metadata_json?: string;
  date_created?: string;
}) {
  stmts.insertSticker.run({
    id: sticker.id,
    user_id: sticker.user_id,
    original_item_id: sticker.original_item_id || null,
    image_path: sticker.image_path || '',
    drama_text: sticker.drama_text || '',
    category: sticker.category || '其他',
    metadata_json: sticker.metadata_json || '{}',
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

// --- Transformation guides ---
export function createTransformationGuide(guide: {
  id: string;
  user_id: string;
  title: string;
  summary: string;
  concept: string;
  materials?: string[];
  steps?: string[];
  tips?: string[];
  itemIds?: string[];
  sourceItems?: unknown[];
  image_path?: string;
  date_created?: string;
}) {
  stmts.insertTransformationGuide.run({
    id: guide.id,
    user_id: guide.user_id,
    title: guide.title,
    summary: guide.summary,
    concept: guide.concept,
    materials_json: JSON.stringify(guide.materials || []),
    steps_json: JSON.stringify(guide.steps || []),
    tips_json: JSON.stringify(guide.tips || []),
    item_ids_json: JSON.stringify(guide.itemIds || []),
    source_items_json: JSON.stringify(guide.sourceItems || []),
    image_path: guide.image_path || '',
    date_created: guide.date_created || new Date().toISOString(),
  });

  const row = stmts.getTransformationGuideById.get(guide.id, guide.user_id) as TransformationGuideRow | undefined;
  return row ? rowToTransformationGuide(row) : null;
}

export function getTransformationGuidesByUser(userId: string) {
  const rows = stmts.getTransformationGuidesByUser.all(userId) as TransformationGuideRow[];
  return rows.map(rowToTransformationGuide);
}

export function getTransformationGuideById(id: string, userId: string) {
  const row = stmts.getTransformationGuideById.get(id, userId) as TransformationGuideRow | undefined;
  return row ? rowToTransformationGuide(row) : null;
}

export function deleteTransformationGuide(id: string, userId: string) {
  return stmts.deleteTransformationGuide.run(id, userId);
}

// --- Saved journals ---
export function createSavedJournal(journal: {
  id: string;
  user_id: string;
  title: string;
  preview_image_path?: string;
  background_image_path?: string;
  template_id?: string;
  year: number;
  month: number;
  header_note?: string;
  background_color?: string;
  background_overlay?: number;
  selectedStickerIds?: string[];
  layoutItems?: unknown[];
  date_created?: string;
}) {
  stmts.insertSavedJournal.run({
    id: journal.id,
    user_id: journal.user_id,
    title: journal.title,
    preview_image_path: journal.preview_image_path || '',
    background_image_path: journal.background_image_path || '',
    template_id: journal.template_id || 'calendar-journal',
    year: journal.year,
    month: journal.month,
    header_note: journal.header_note || '',
    background_color: journal.background_color || '#fffdf7',
    background_overlay: journal.background_overlay ?? 0.74,
    selected_sticker_ids_json: JSON.stringify(journal.selectedStickerIds || []),
    layout_items_json: JSON.stringify(journal.layoutItems || []),
    date_created: journal.date_created || new Date().toISOString(),
  });

  const row = stmts.getSavedJournalById.get(journal.id, journal.user_id) as SavedJournalRow | undefined;
  return row ? rowToSavedJournal(row) : null;
}

export function updateSavedJournal(journal: {
  id: string;
  user_id: string;
  title: string;
  preview_image_path?: string;
  background_image_path?: string;
  template_id?: string;
  year: number;
  month: number;
  header_note?: string;
  background_color?: string;
  background_overlay?: number;
  selectedStickerIds?: string[];
  layoutItems?: unknown[];
}) {
  stmts.updateSavedJournal.run({
    id: journal.id,
    user_id: journal.user_id,
    title: journal.title,
    preview_image_path: journal.preview_image_path || '',
    background_image_path: journal.background_image_path || '',
    template_id: journal.template_id || 'calendar-journal',
    year: journal.year,
    month: journal.month,
    header_note: journal.header_note || '',
    background_color: journal.background_color || '#fffdf7',
    background_overlay: journal.background_overlay ?? 0.74,
    selected_sticker_ids_json: JSON.stringify(journal.selectedStickerIds || []),
    layout_items_json: JSON.stringify(journal.layoutItems || []),
  });

  const row = stmts.getSavedJournalById.get(journal.id, journal.user_id) as SavedJournalRow | undefined;
  return row ? rowToSavedJournal(row) : null;
}

export function getSavedJournalsByUser(userId: string) {
  const rows = stmts.getSavedJournalsByUser.all(userId) as SavedJournalRow[];
  return rows.map(rowToSavedJournal);
}

export function getSavedJournalById(id: string, userId: string) {
  const row = stmts.getSavedJournalById.get(id, userId) as SavedJournalRow | undefined;
  return row ? rowToSavedJournal(row) : null;
}

export function deleteSavedJournal(id: string, userId: string) {
  return stmts.deleteSavedJournal.run(id, userId);
}

// --- Shared museums ---
export function createSharedMuseum(museum: {
  id: string;
  owner_user_id: string;
  name: string;
  description?: string;
  invite_code: string;
  invite_enabled?: boolean;
  status?: string;
  anniversary_date?: string;
  theme?: string;
  quiet_mode?: boolean;
  cover_image_path?: string;
  owner_member_id: string;
}) {
  const create = db.transaction(() => {
    stmts.insertSharedMuseum.run({
      id: museum.id,
      owner_user_id: museum.owner_user_id,
      name: museum.name,
      description: museum.description || '',
      invite_code: museum.invite_code,
      invite_enabled: museum.invite_enabled === false ? 0 : 1,
      status: museum.status || 'active',
      anniversary_date: museum.anniversary_date || '',
      theme: museum.theme || 'shared-memory',
      quiet_mode: museum.quiet_mode ? 1 : 0,
      cover_image_path: museum.cover_image_path || '',
    });

    stmts.insertSharedMuseumMember.run({
      id: museum.owner_member_id,
      museum_id: museum.id,
      user_id: museum.owner_user_id,
      role: 'creator',
      notification_enabled: 1,
      quiet_mode: museum.quiet_mode ? 1 : 0,
      joined_at: new Date().toISOString(),
    });
  });

  create();
  return getSharedMuseumById(museum.id, museum.owner_user_id);
}

export function getSharedMuseumsByUser(userId: string) {
  const rows = stmts.getSharedMuseumsByUser.all(userId) as SharedMuseumRow[];
  return rows.map((row) => buildSharedMuseumSummary(row));
}

export function getSharedMuseumById(id: string, userId: string) {
  const membership = stmts.getSharedMuseumMembership.get(id, userId) as SharedMuseumMemberRow | undefined;
  if (!membership) {
    return null;
  }

  const row = stmts.getSharedMuseumById.get(id) as SharedMuseumRow | undefined;
  return row ? buildSharedMuseumDetail(row) : null;
}

export function getSharedMuseumByInviteCode(inviteCode: string) {
  const row = stmts.getSharedMuseumByInviteCode.get(inviteCode.trim().toUpperCase()) as SharedMuseumRow | undefined;
  return row ? buildSharedMuseumDetail(row) : null;
}

export function joinSharedMuseumByInviteCode({
  museum_id,
  user_id,
  member_id,
}: {
  museum_id: string;
  user_id: string;
  member_id: string;
}) {
  const join = db.transaction(() => {
    const existingMembership = stmts.getSharedMuseumMembership.get(museum_id, user_id) as SharedMuseumMemberRow | undefined;
    if (!existingMembership) {
      const memberCountRow = stmts.getSharedMuseumMemberCount.get(museum_id) as { count: number } | undefined;
      const memberCount = Number(memberCountRow?.count || 0);
      if (memberCount >= 2) {
        throw new Error('SHARED_MUSEUM_FULL');
      }

      stmts.insertSharedMuseumMember.run({
        id: member_id,
        museum_id,
        user_id,
        role: 'partner',
        notification_enabled: 1,
        quiet_mode: 0,
        joined_at: new Date().toISOString(),
      });
    }

    const row = stmts.getSharedMuseumById.get(museum_id) as SharedMuseumRow | undefined;
    return row ? buildSharedMuseumDetail(row) : null;
  });

  return join();
}

export function updateSharedMuseum(museum: {
  id: string;
  owner_user_id: string;
  name: string;
  description?: string;
  invite_code?: string;
  invite_enabled?: boolean;
  status?: string;
  anniversary_date?: string;
  theme?: string;
  quiet_mode?: boolean;
  cover_image_path?: string;
}) {
  stmts.updateSharedMuseum.run({
    id: museum.id,
    owner_user_id: museum.owner_user_id,
    name: museum.name,
    description: museum.description || '',
    invite_code: museum.invite_code || '',
    invite_enabled: museum.invite_enabled === false ? 0 : 1,
    status: museum.status || 'active',
    anniversary_date: museum.anniversary_date || '',
    theme: museum.theme || 'shared-memory',
    quiet_mode: museum.quiet_mode ? 1 : 0,
    cover_image_path: museum.cover_image_path || '',
  });

  return getSharedMuseumById(museum.id, museum.owner_user_id);
}

export function addItemToSharedMuseum(sharedItem: {
  id: string;
  museum_id: string;
  source_item_id: string;
  source_user_id: string;
  shared_by_user_id: string;
  name: string;
  hall_id?: string;
  category?: string;
  material?: string;
  description?: string;
  image_path?: string;
  cover_image_path?: string;
  audio_path?: string;
  story?: string;
  tags?: string[];
  shared_note?: string;
  relation_label?: string;
  date_collected?: string;
  date_shared?: string;
}) {
  const existing = stmts.getSharedMuseumItemBySource.get(sharedItem.museum_id, sharedItem.source_item_id) as SharedMuseumItemRow | undefined;
  if (existing) {
    return rowToSharedMuseumItem(existing);
  }

  stmts.insertSharedMuseumItem.run({
    id: sharedItem.id,
    museum_id: sharedItem.museum_id,
    source_item_id: sharedItem.source_item_id,
    source_user_id: sharedItem.source_user_id,
    shared_by_user_id: sharedItem.shared_by_user_id,
    name: sharedItem.name,
    hall_id: sharedItem.hall_id || sharedItem.category || '其他',
    category: sharedItem.category || '其他',
    material: sharedItem.material || '',
    description: sharedItem.description || '',
    image_path: sharedItem.image_path || '',
    cover_image_path: sharedItem.cover_image_path || '',
    audio_path: sharedItem.audio_path || '',
    story: sharedItem.story || '',
    tags_json: JSON.stringify(sharedItem.tags || []),
    shared_note: sharedItem.shared_note || '',
    relation_label: sharedItem.relation_label || '',
    date_collected: sharedItem.date_collected || new Date().toISOString(),
    date_shared: sharedItem.date_shared || new Date().toISOString(),
  });

  const row = stmts.getSharedMuseumItemBySource.get(sharedItem.museum_id, sharedItem.source_item_id) as SharedMuseumItemRow | undefined;
  return row ? rowToSharedMuseumItem(row) : null;
}

export function getSharedMuseumItemById(itemId: string, museumId: string) {
  const row = stmts.getSharedMuseumItemById.get(itemId, museumId) as SharedMuseumItemRow | undefined;
  return row ? rowToSharedMuseumItem(row) : null;
}

export function updateSharedMuseumItem(sharedItem: {
  id: string;
  museum_id: string;
  shared_note?: string;
  relation_label?: string;
}) {
  stmts.updateSharedMuseumItem.run({
    id: sharedItem.id,
    museum_id: sharedItem.museum_id,
    shared_note: sharedItem.shared_note || '',
    relation_label: sharedItem.relation_label || '',
  });

  const row = stmts.getSharedMuseumItemById.get(sharedItem.id, sharedItem.museum_id) as SharedMuseumItemRow | undefined;
  return row ? rowToSharedMuseumItem(row) : null;
}

export function touchSharedMuseumActivity(museumId: string, coverImagePath = '') {
  stmts.touchSharedMuseumActivity.run({
    id: museumId,
    cover_image_path: coverImagePath,
  });
}

export function removeSharedMuseumItem(itemId: string, museumId: string) {
  return stmts.deleteSharedMuseumItem.run(itemId, museumId);
}

export function removeSharedMuseumMember(museumId: string, userId: string) {
  return stmts.deleteSharedMuseumMember.run(museumId, userId);
}

export function upsertSharedMuseumMonthlyReport(report: {
  id: string;
  museum_id: string;
  month_key: string;
  month_label: string;
  snapshot_json: string;
}) {
  const upsert = db.transaction(() => {
    const existing = stmts.getSharedMuseumReportByMonth.get(report.museum_id, report.month_key) as SharedMuseumReportRow | undefined;
    if (existing) {
      stmts.updateSharedMuseumReport.run({
        id: existing.id,
        museum_id: report.museum_id,
        month_label: report.month_label,
        snapshot_json: report.snapshot_json,
      });
      return existing.id;
    }

    stmts.insertSharedMuseumReport.run({
      id: report.id,
      museum_id: report.museum_id,
      month_key: report.month_key,
      month_label: report.month_label,
      snapshot_json: report.snapshot_json,
    });
    return report.id;
  });

  upsert();
  const row = stmts.getSharedMuseumById.get(report.museum_id) as SharedMuseumRow | undefined;
  return row ? buildSharedMuseumDetail(row) : null;
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
    description: row.description || '',
    imageUrl: row.image_path,
    image_path: row.image_path,
    coverImageUrl: row.cover_image_path || '',
    cover_image_path: row.cover_image_path || '',
    audioUrl: row.audio_path || '',
    audio_path: row.audio_path || '',
    dateCollected: row.date_collected,
    story: row.story || '',
    tags: safeJsonParse(row.tags_json, []),
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
    metadata: safeJsonParse(row.metadata_json || '{}', {}),
    dateCreated: row.date_created,
  };
}

function rowToTransformationGuide(row: TransformationGuideRow) {
  return {
    id: row.id,
    user_id: row.user_id,
    title: row.title,
    summary: row.summary,
    concept: row.concept,
    materials: safeJsonParse(row.materials_json, []),
    steps: safeJsonParse(row.steps_json, []),
    tips: safeJsonParse(row.tips_json, []),
    itemIds: safeJsonParse(row.item_ids_json, []),
    sourceItems: safeJsonParse(row.source_items_json, []),
    imageUrl: row.image_path,
    image_path: row.image_path,
    dateCreated: row.date_created,
  };
}

function rowToSavedJournal(row: SavedJournalRow) {
  return {
    id: row.id,
    user_id: row.user_id,
    title: row.title,
    previewImageUrl: row.preview_image_path,
    preview_image_path: row.preview_image_path,
    backgroundImageUrl: row.background_image_path || '',
    background_image_path: row.background_image_path || '',
    templateId: row.template_id,
    year: row.year,
    month: row.month,
    headerNote: row.header_note || '',
    backgroundColor: row.background_color || '#fffdf7',
    backgroundOverlay: row.background_overlay ?? 0.74,
    selectedStickerIds: safeJsonParse(row.selected_sticker_ids_json, []),
    layoutItems: safeJsonParse(row.layout_items_json, []),
    dateCreated: row.date_created,
    updatedAt: row.updated_at,
  };
}

function rowToSharedMuseumMember(row: SharedMuseumMemberRow) {
  return {
    id: row.id,
    userId: row.user_id,
    nickname: row.nickname,
    role: row.role,
    joinedAt: row.joined_at,
    notificationEnabled: !!row.notification_enabled,
    quietMode: !!row.quiet_mode,
  };
}

function rowToSharedMuseumItem(row: SharedMuseumItemRow) {
  return {
    id: row.id,
    museumId: row.museum_id,
    sourceItemId: row.source_item_id,
    sourceUserId: row.source_user_id,
    sharedByUserId: row.shared_by_user_id,
    name: row.name,
    hallId: row.hall_id || row.category,
    category: row.category,
    material: row.material,
    description: row.description || '',
    imageUrl: row.image_path,
    image_path: row.image_path,
    coverImageUrl: row.cover_image_path || '',
    cover_image_path: row.cover_image_path || '',
    audioUrl: row.audio_path || '',
    audio_path: row.audio_path || '',
    story: row.story || '',
    tags: safeJsonParse(row.tags_json, []),
    sharedNote: row.shared_note || '',
    relationLabel: row.relation_label || '',
    dateCollected: row.date_collected,
    dateShared: row.date_shared,
  };
}

function rowToSharedMuseumReport(row: SharedMuseumReportRow) {
  const snapshot = safeJsonParse<Record<string, unknown>>(row.snapshot_json, {});
  return {
    id: row.id,
    museumId: row.museum_id,
    monthKey: row.month_key,
    monthLabel: row.month_label,
    snapshot: {
      monthKey: typeof snapshot.monthKey === 'string' ? snapshot.monthKey : row.month_key,
      monthLabel: typeof snapshot.monthLabel === 'string' ? snapshot.monthLabel : row.month_label,
      itemCount: Number(snapshot.itemCount || 0),
      categoryCount: Number(snapshot.categoryCount || 0),
      topCategories: Array.isArray(snapshot.topCategories) ? snapshot.topCategories.filter((value: unknown) => typeof value === 'string') : [],
      topTags: Array.isArray(snapshot.topTags) ? snapshot.topTags.filter((value: unknown) => typeof value === 'string') : [],
      relationLabels: Array.isArray(snapshot.relationLabels) ? snapshot.relationLabels.filter((value: unknown) => typeof value === 'string') : [],
      highlights: Array.isArray(snapshot.highlights) ? snapshot.highlights.filter((value: unknown) => typeof value === 'string') : [],
      narrative: typeof snapshot.narrative === 'string' ? snapshot.narrative : '',
      timeline: Array.isArray(snapshot.timeline) ? snapshot.timeline
        .filter((value: unknown) => typeof value === 'object' && value !== null)
        .map((value: any) => ({
          id: typeof value.id === 'string' ? value.id : '',
          name: typeof value.name === 'string' ? value.name : '',
          dateLabel: typeof value.dateLabel === 'string' ? value.dateLabel : '',
          sharedNote: typeof value.sharedNote === 'string' ? value.sharedNote : '',
          relationLabel: typeof value.relationLabel === 'string' ? value.relationLabel : '',
          coverImageUrl: typeof value.coverImageUrl === 'string' ? value.coverImageUrl : '',
          imageUrl: typeof value.imageUrl === 'string' ? value.imageUrl : '',
        }))
        .filter((value: { id: string; name: string }) => value.id && value.name) : [],
      milestoneMessage: typeof snapshot.milestoneMessage === 'string' ? snapshot.milestoneMessage : null,
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function buildSharedMuseumSummary(row: SharedMuseumRow) {
  const members = (stmts.getSharedMuseumMembersByMuseumId.all(row.id) as SharedMuseumMemberRow[]).map(rowToSharedMuseumMember);
  const itemCountRow = stmts.getSharedMuseumItemCountByMuseumId.get(row.id) as { count: number } | undefined;
  const itemCount = Number(itemCountRow?.count || 0);

  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    inviteCode: row.invite_code,
    inviteEnabled: !!row.invite_enabled,
    status: row.status,
    anniversaryDate: row.anniversary_date || '',
    theme: row.theme || 'shared-memory',
    quietMode: !!row.quiet_mode,
    coverImageUrl: row.cover_image_path || '',
    cover_image_path: row.cover_image_path || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    members,
    itemCount,
    milestoneCount: itemCount >= 50 ? 4 : itemCount >= 30 ? 3 : itemCount >= 10 ? 2 : itemCount >= 1 ? 1 : 0,
  };
}

function buildSharedMuseumDetail(row: SharedMuseumRow) {
  const summary = buildSharedMuseumSummary(row);
  const items = (stmts.getSharedMuseumItemsByMuseumId.all(row.id) as SharedMuseumItemRow[]).map(rowToSharedMuseumItem);
  const reports = (stmts.getSharedMuseumReportsByMuseumId.all(row.id) as SharedMuseumReportRow[]).map(rowToSharedMuseumReport);

  return {
    ...summary,
    items,
    reports,
    momentCards: [
      {
        id: `${row.id}-report`,
        type: 'report',
        title: '月度回顾',
        description: '后续这里会根据共享藏品生成月度地图和时间轴回顾。',
        status: 'placeholder',
      },
      {
        id: `${row.id}-story`,
        type: 'story',
        title: '故事弹窗',
        description: '后续这里会在纪念日或特定藏品组合时触发小叙事。',
        status: 'placeholder',
      },
      {
        id: `${row.id}-milestone`,
        type: 'milestone',
        title: '里程碑解锁',
        description: '共享藏品数量达到 10 / 30 / 50 时可解锁新的馆样式与报告。',
        status: 'placeholder',
      },
      {
        id: `${row.id}-anniversary`,
        type: 'anniversary',
        title: '静默与纪念日',
        description: '后续这里会提供纪念日设置、静默模式与关系状态处理。',
        status: 'placeholder',
      },
    ],
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
      '检测到已存在大小写仅不同的重复邮箱，已跳过不区分大小写的邮箱归一化迁移：',
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
