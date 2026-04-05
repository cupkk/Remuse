import fs from 'node:fs/promises';
import path from 'node:path';
import Database from 'better-sqlite3';
import 'dotenv/config';

const args = process.argv.slice(2);
const snapshotArg = args[0];

if (!snapshotArg) {
  console.error('Usage: node scripts/restore-missing-users.mjs <snapshotDir> [--dry-run] [--formal-only] [--skip-uploads]');
  process.exit(1);
}

const appRoot = process.env.APP_ROOT ? path.resolve(process.env.APP_ROOT) : process.cwd();
const dbPath = path.resolve(process.env.DB_PATH || path.join(appRoot, 'data', 'remuse.db'));
const snapshotDir = path.resolve(snapshotArg);
const snapshotDbPath = path.join(snapshotDir, 'data', 'remuse.db');
const dryRun = args.includes('--dry-run');
const formalOnly = args.includes('--formal-only');
const skipUploads = args.includes('--skip-uploads');
const startedAt = new Date().toISOString();

await assertFile(snapshotDbPath, 'Backup database not found');

const sourceDb = new Database(snapshotDbPath, { readonly: true });
const targetDb = new Database(dbPath);
sourceDb.pragma('foreign_keys = ON');
targetDb.pragma('foreign_keys = ON');

const report = {
  startedAt,
  dryRun,
  formalOnly,
  skipUploads,
  snapshotDir,
  dbPath,
  users: {
    selected: 0,
    inserted: 0,
    formalSelected: 0,
    guestSelected: 0,
    conflicts: [],
  },
  tables: {},
  uploads: {
    referenced: 0,
    copied: 0,
    existing: 0,
    missingInSnapshot: 0,
    skipped: skipUploads,
  },
};

const currentUsers = targetDb.prepare('SELECT * FROM users').all();
const sourceUsers = sourceDb.prepare('SELECT * FROM users').all();
const currentUsersById = new Map(currentUsers.map((user) => [user.id, user]));
const currentUsersByEmail = new Map(
  currentUsers
    .filter((user) => typeof user.email === 'string' && user.email.trim())
    .map((user) => [normalizeEmail(user.email), user]),
);

const usersToRestore = [];
for (const user of sourceUsers) {
  const emailKey = normalizeEmail(user.email);
  const existingById = currentUsersById.get(user.id);
  const existingByEmail = emailKey ? currentUsersByEmail.get(emailKey) : null;

  if (existingByEmail && existingByEmail.id !== user.id) {
    report.users.conflicts.push({
      email: user.email,
      sourceUserId: user.id,
      targetUserId: existingByEmail.id,
    });
    continue;
  }

  if (existingById || existingByEmail) {
    continue;
  }

  if (formalOnly && (Number(user.is_guest) === 1 || !emailKey)) {
    continue;
  }

  usersToRestore.push(user);
}

report.users.selected = usersToRestore.length;
report.users.formalSelected = usersToRestore.filter((user) => Number(user.is_guest) === 0).length;
report.users.guestSelected = usersToRestore.filter((user) => Number(user.is_guest) === 1).length;

const restoredUserIds = usersToRestore.map((user) => user.id);
const currentUserIds = new Set(currentUsers.map((user) => user.id));
const knownUserIdsAfterRestore = new Set([...currentUserIds, ...restoredUserIds]);
const currentItemIds = new Set(selectIds(targetDb, 'collected_items'));
const currentMuseumIds = new Set(selectIds(targetDb, 'shared_museums'));

const collectedItems = selectByColumn(sourceDb, 'collected_items', 'user_id', restoredUserIds);
const restoredItemIds = collectedItems.map((row) => row.id);
const knownItemIdsAfterRestore = new Set([...currentItemIds, ...restoredItemIds]);

const memoryThreads = selectByColumn(sourceDb, 'memory_threads', 'user_id', restoredUserIds);
const restoredThreadIds = memoryThreads.map((row) => row.id);

const sharedMuseumsOwned = selectByColumn(sourceDb, 'shared_museums', 'owner_user_id', restoredUserIds);
const sharedMuseumMembershipsByUser = selectByColumn(sourceDb, 'shared_museum_members', 'user_id', restoredUserIds);
const sharedMuseumItemsBySourceUser = selectByColumn(sourceDb, 'shared_museum_items', 'source_user_id', restoredUserIds);
const sharedMuseumItemsBySharedUser = selectByColumn(sourceDb, 'shared_museum_items', 'shared_by_user_id', restoredUserIds);

const candidateMuseumIds = new Set([
  ...sharedMuseumsOwned.map((row) => row.id),
  ...sharedMuseumMembershipsByUser.map((row) => row.museum_id),
  ...sharedMuseumItemsBySourceUser.map((row) => row.museum_id),
  ...sharedMuseumItemsBySharedUser.map((row) => row.museum_id),
]);

const sharedMuseums = dedupeRows([
  ...sharedMuseumsOwned,
  ...selectByColumn(sourceDb, 'shared_museums', 'id', [...candidateMuseumIds]),
], targetDb, 'shared_museums').filter((row) => knownUserIdsAfterRestore.has(row.owner_user_id));

const restoredMuseumIds = sharedMuseums.map((row) => row.id);
const knownMuseumIdsAfterRestore = new Set([...currentMuseumIds, ...restoredMuseumIds]);

const sharedMuseumMemberships = dedupeRows([
  ...sharedMuseumMembershipsByUser,
  ...selectByColumn(sourceDb, 'shared_museum_members', 'museum_id', restoredMuseumIds),
], targetDb, 'shared_museum_members').filter((row) => (
  knownMuseumIdsAfterRestore.has(row.museum_id) && knownUserIdsAfterRestore.has(row.user_id)
));

const sharedMuseumItems = dedupeRows([
  ...sharedMuseumItemsBySourceUser,
  ...sharedMuseumItemsBySharedUser,
  ...selectByColumn(sourceDb, 'shared_museum_items', 'museum_id', restoredMuseumIds),
], targetDb, 'shared_museum_items').filter((row) => (
  knownMuseumIdsAfterRestore.has(row.museum_id)
  && knownItemIdsAfterRestore.has(row.source_item_id)
  && knownUserIdsAfterRestore.has(row.source_user_id)
  && knownUserIdsAfterRestore.has(row.shared_by_user_id)
));

const rowsByTable = {
  users: usersToRestore,
  admin_user_flags: selectByColumn(sourceDb, 'admin_user_flags', 'user_id', restoredUserIds),
  ai_usage_events: selectByColumn(sourceDb, 'ai_usage_events', 'user_id', restoredUserIds),
  feedback_submissions: selectByColumn(sourceDb, 'feedback_submissions', 'user_id', restoredUserIds),
  exhibition_halls: selectByColumn(sourceDb, 'exhibition_halls', 'user_id', restoredUserIds),
  collected_items: collectedItems,
  item_memory_embeddings: selectByColumn(sourceDb, 'item_memory_embeddings', 'user_id', restoredUserIds),
  stickers: selectByColumn(sourceDb, 'stickers', 'user_id', restoredUserIds).map((row) => ({
    ...row,
    original_item_id: row.original_item_id && !knownItemIdsAfterRestore.has(row.original_item_id)
      ? null
      : row.original_item_id,
  })),
  transformation_guides: selectByColumn(sourceDb, 'transformation_guides', 'user_id', restoredUserIds),
  saved_journals: selectByColumn(sourceDb, 'saved_journals', 'user_id', restoredUserIds),
  memory_threads: memoryThreads,
  memory_messages: selectByColumn(sourceDb, 'memory_messages', 'thread_id', restoredThreadIds),
  product_usage_events: selectByColumn(sourceDb, 'product_usage_events', 'user_id', restoredUserIds),
  shared_museums: sharedMuseums,
  shared_museum_members: sharedMuseumMemberships,
  shared_museum_items: sharedMuseumItems,
  shared_museum_reports: selectByColumn(sourceDb, 'shared_museum_reports', 'museum_id', restoredMuseumIds),
};

const tableInsertOrder = [
  'users',
  'admin_user_flags',
  'ai_usage_events',
  'feedback_submissions',
  'exhibition_halls',
  'collected_items',
  'item_memory_embeddings',
  'stickers',
  'transformation_guides',
  'saved_journals',
  'memory_threads',
  'memory_messages',
  'product_usage_events',
  'shared_museums',
  'shared_museum_members',
  'shared_museum_items',
  'shared_museum_reports',
];

const recoveredRowsForAssets = [];
const executeRestore = targetDb.transaction(() => {
  for (const tableName of tableInsertOrder) {
    const rows = rowsByTable[tableName] || [];
    const result = insertRows(targetDb, sourceDb, tableName, rows, dryRun);
    report.tables[tableName] = result;
    if (tableName === 'users') {
      report.users.inserted = result.inserted;
    }
    if (rows.length > 0) {
      recoveredRowsForAssets.push(...rows);
    }
  }
});

executeRestore();

if (!skipUploads) {
  const assetPaths = collectAssetPaths(recoveredRowsForAssets);
  report.uploads.referenced = assetPaths.size;
  if (!dryRun) {
    const assetSummary = await restoreAssetFiles(assetPaths, snapshotDir, appRoot);
    report.uploads.copied = assetSummary.copied;
    report.uploads.existing = assetSummary.existing;
    report.uploads.missingInSnapshot = assetSummary.missingInSnapshot;
  }
}

await fs.mkdir(path.join(appRoot, 'logs'), { recursive: true });
const reportPath = path.join(
  appRoot,
  'logs',
  `restore-missing-users-${startedAt.replace(/[:.]/g, '-')}.json`,
);
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
  ok: true,
  dryRun,
  formalOnly,
  skipUploads,
  snapshotDir,
  dbPath,
  reportPath,
  users: report.users,
  tables: report.tables,
  uploads: report.uploads,
}, null, 2));

sourceDb.close();
targetDb.close();

async function assertFile(targetPath, message) {
  try {
    await fs.access(targetPath);
  } catch {
    console.error(`${message}: ${targetPath}`);
    process.exit(1);
  }
}

function normalizeEmail(value) {
  return typeof value === 'string' && value.trim() ? value.trim().toLowerCase() : '';
}

function selectIds(db, tableName) {
  if (!tableExists(db, tableName)) {
    return [];
  }
  return db.prepare(`SELECT id FROM ${quoteIdentifier(tableName)}`).pluck().all();
}

function selectByColumn(db, tableName, columnName, values) {
  if (!tableExists(db, tableName) || values.length === 0) {
    return [];
  }

  const rows = [];
  for (const chunk of chunkArray(values, 800)) {
    const placeholders = chunk.map(() => '?').join(', ');
    const statement = db.prepare(
      `SELECT * FROM ${quoteIdentifier(tableName)} WHERE ${quoteIdentifier(columnName)} IN (${placeholders})`,
    );
    rows.push(...statement.all(...chunk));
  }
  return rows;
}

function insertRows(target, source, tableName, rows, dryRunMode) {
  if (!tableExists(target, tableName) || !tableExists(source, tableName)) {
    return { selected: rows.length, inserted: 0, skipped: rows.length, reason: 'table_missing' };
  }

  const columns = getSharedColumns(source, target, tableName);
  if (rows.length === 0 || columns.length === 0) {
    return { selected: rows.length, inserted: 0, skipped: rows.length };
  }

  if (dryRunMode) {
    return { selected: rows.length, inserted: rows.length, skipped: 0, dryRun: true };
  }

  const placeholders = columns.map((column) => `@${column}`).join(', ');
  const statement = target.prepare(
    `INSERT OR IGNORE INTO ${quoteIdentifier(tableName)} (${columns.map(quoteIdentifier).join(', ')}) VALUES (${placeholders})`,
  );

  let inserted = 0;
  for (const row of rows) {
    const payload = {};
    for (const column of columns) {
      payload[column] = row[column];
    }
    inserted += statement.run(payload).changes;
  }

  return {
    selected: rows.length,
    inserted,
    skipped: rows.length - inserted,
  };
}

function getSharedColumns(source, target, tableName) {
  const sourceColumns = getColumns(source, tableName);
  const targetColumnSet = new Set(getColumns(target, tableName));
  return sourceColumns.filter((column) => targetColumnSet.has(column));
}

function getColumns(db, tableName) {
  return db.prepare(`PRAGMA table_info(${quoteIdentifier(tableName)})`).all().map((row) => row.name);
}

function getPrimaryKeyColumns(db, tableName) {
  return db.prepare(`PRAGMA table_info(${quoteIdentifier(tableName)})`)
    .all()
    .filter((row) => Number(row.pk) > 0)
    .sort((a, b) => Number(a.pk) - Number(b.pk))
    .map((row) => row.name);
}

function tableExists(db, tableName) {
  const row = db.prepare(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`,
  ).get(tableName);
  return !!row;
}

function dedupeRows(rows, db, tableName) {
  const pkColumns = getPrimaryKeyColumns(db, tableName);
  const seen = new Set();
  const deduped = [];

  for (const row of rows) {
    const key = pkColumns.length > 0
      ? pkColumns.map((column) => `${column}:${row[column] ?? ''}`).join('|')
      : JSON.stringify(row);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(row);
  }

  return deduped;
}

function chunkArray(values, size) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function quoteIdentifier(identifier) {
  return `"${String(identifier).replaceAll('"', '""')}"`;
}

function collectAssetPaths(rows) {
  const assetPaths = new Set();
  for (const row of rows) {
    visitValue(row, assetPaths);
  }
  return assetPaths;
}

function visitValue(value, assetPaths) {
  if (Array.isArray(value)) {
    for (const entry of value) {
      visitValue(entry, assetPaths);
    }
    return;
  }

  if (value && typeof value === 'object') {
    for (const entry of Object.values(value)) {
      visitValue(entry, assetPaths);
    }
    return;
  }

  if (typeof value !== 'string') {
    return;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return;
  }

  const matches = trimmed.match(/\/?uploads\/[A-Za-z0-9_./-]+/g);
  if (matches) {
    for (const match of matches) {
      assetPaths.add(match.startsWith('/') ? match : `/${match}`);
    }
  }

  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      visitValue(JSON.parse(trimmed), assetPaths);
    } catch {
      // Ignore invalid JSON snapshots.
    }
  }
}

async function restoreAssetFiles(assetPaths, sourceRoot, targetRoot) {
  let copied = 0;
  let existing = 0;
  let missingInSnapshot = 0;

  for (const assetPath of assetPaths) {
    const relativePath = assetPath.startsWith('/') ? assetPath.slice(1) : assetPath;
    const sourcePath = path.resolve(sourceRoot, relativePath);
    const targetPath = path.resolve(targetRoot, relativePath);

    if (await pathExists(targetPath)) {
      existing += 1;
      continue;
    }

    if (!await pathExists(sourcePath)) {
      missingInSnapshot += 1;
      continue;
    }

    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.copyFile(sourcePath, targetPath);
    copied += 1;
  }

  return { copied, existing, missingInSnapshot };
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}
