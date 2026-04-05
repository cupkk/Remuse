import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = process.cwd();
const distGiftDir = path.join(repoRoot, 'dist-gift');
const viteCliPath = path.join(repoRoot, 'node_modules', 'vite', 'bin', 'vite.js');

const result = spawnSync(process.execPath, [viteCliPath, 'build', '--config', 'vite.gift.config.ts'], {
  cwd: repoRoot,
  stdio: 'inherit',
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

for (const relativeDir of ['public/nfc', 'public/collection-cover-backgrounds']) {
  const sourceDir = path.join(repoRoot, relativeDir);
  const targetDir = path.join(distGiftDir, path.basename(relativeDir));

  if (!fs.existsSync(sourceDir)) {
    continue;
  }

  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.cpSync(sourceDir, targetDir, { recursive: true });
}
