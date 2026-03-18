import fs from 'node:fs/promises';
import path from 'node:path';
import 'dotenv/config';

const appRoot = process.env.APP_ROOT ? path.resolve(process.env.APP_ROOT) : process.cwd();
const dbPath = path.resolve(process.env.DB_PATH || path.join(appRoot, 'data', 'remuse.db'));
const uploadsDir = path.resolve(process.env.UPLOADS_DIR || path.join(appRoot, 'uploads'));
const backupRoot = path.resolve(process.env.BACKUP_DIR || path.join(appRoot, 'backups'));
const snapshotName = process.argv[2] || new Date().toISOString().replace(/[:.]/g, '-');
const snapshotDir = path.join(backupRoot, snapshotName);

await fs.mkdir(snapshotDir, { recursive: true });
await fs.mkdir(path.join(snapshotDir, 'data'), { recursive: true });

const copiedFiles = [];
for (const sourcePath of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
  try {
    await fs.copyFile(sourcePath, path.join(snapshotDir, 'data', path.basename(sourcePath)));
    copiedFiles.push(sourcePath);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      continue;
    }
    throw error;
  }
}

let uploadsCopied = false;
try {
  await fs.cp(uploadsDir, path.join(snapshotDir, 'uploads'), { recursive: true });
  uploadsCopied = true;
} catch (error) {
  if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) {
    throw error;
  }
}

const manifest = {
  createdAt: new Date().toISOString(),
  appRoot,
  dbPath,
  uploadsDir,
  files: copiedFiles.map((filePath) => path.basename(filePath)),
  uploadsCopied,
};

await fs.writeFile(
  path.join(snapshotDir, 'manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
  'utf8',
);

console.log(`Backup created at ${snapshotDir}`);
