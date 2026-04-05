import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import 'dotenv/config';

const execFileAsync = promisify(execFile);
const sourceDir = process.argv[2];
const targetRootArg = process.argv[3];
const confirmFlag = '--yes-overwrite-current-data';
const confirmed = process.argv.includes(confirmFlag);

if (!sourceDir) {
  console.error(`Usage: node scripts/restore-backup.mjs <snapshotDir> [targetRoot] ${confirmFlag}`);
  process.exit(1);
}

if (!confirmed) {
  console.error(`Refusing to overwrite the current database without ${confirmFlag}.`);
  process.exit(1);
}

const sourceRoot = path.resolve(sourceDir);
const targetRoot = targetRootArg
  ? path.resolve(targetRootArg)
  : (process.env.APP_ROOT ? path.resolve(process.env.APP_ROOT) : process.cwd());
const sourceAppRoot = process.env.APP_ROOT ? path.resolve(process.env.APP_ROOT) : process.cwd();
const dbSetting = process.env.DB_PATH || 'data/remuse.db';
const uploadsSetting = process.env.UPLOADS_DIR || 'uploads';
const dbRelativePath = path.isAbsolute(dbSetting) ? path.relative(sourceAppRoot, dbSetting) : dbSetting;
const uploadsRelativePath = path.isAbsolute(uploadsSetting) ? path.relative(sourceAppRoot, uploadsSetting) : uploadsSetting;
const targetDbPath = path.resolve(targetRoot, dbRelativePath);
const targetDbDir = path.dirname(targetDbPath);
const targetUploadsDir = path.resolve(targetRoot, uploadsRelativePath);
const snapshotName = `pre-restore-${new Date().toISOString().replace(/[:.]/g, '-')}`;
const backupScriptPath = path.join(sourceAppRoot, 'scripts', 'backup-data.mjs');

await fs.mkdir(targetDbDir, { recursive: true });
await fs.mkdir(targetUploadsDir, { recursive: true });

await execFileAsync(process.execPath, [backupScriptPath, snapshotName], {
  cwd: sourceAppRoot,
  env: {
    ...process.env,
    APP_ROOT: targetRoot,
  },
});

for (const filename of ['remuse.db', 'remuse.db-wal', 'remuse.db-shm']) {
  const sourcePath = path.join(sourceRoot, 'data', filename);
  try {
    const destination = filename === 'remuse.db'
      ? targetDbPath
      : `${targetDbPath}${filename.replace('remuse.db', '')}`;
    await fs.copyFile(sourcePath, destination);
  } catch (error) {
    if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) {
      throw error;
    }
  }
}

try {
  await fs.cp(path.join(sourceRoot, 'uploads'), targetUploadsDir, { recursive: true });
} catch (error) {
  if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) {
    throw error;
  }
}

const auditDir = path.join(targetRoot, 'logs');
await fs.mkdir(auditDir, { recursive: true });
await fs.writeFile(
  path.join(auditDir, `restore-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`),
  `${JSON.stringify({
    restoredAt: new Date().toISOString(),
    sourceRoot,
    targetRoot,
    preRestoreSnapshot: snapshotName,
  }, null, 2)}\n`,
  'utf8',
);

console.log(`Backup restored from ${sourceRoot} to ${targetRoot}. Pre-restore snapshot: ${snapshotName}`);
