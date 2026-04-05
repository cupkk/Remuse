import { promises as fs } from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();

const scanRoots = [
  'App.tsx',
  'index.tsx',
  'server.ts',
  'types.ts',
  'components',
  'routes',
  'services',
  'shared',
  'scripts',
  'tests',
  'src',
];

const allowedExtensions = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.css',
  '.md',
]);

const skipSegments = new Set([
  'node_modules',
  '.git',
  '.tmp',
  '.playwright-cli',
  'dist',
  'dist-gift',
  'build',
  'output',
  'logs',
  '.logs',
  'uploads',
  'data',
  'backups',
]);

const suspiciousPatterns = [
  { label: 'replacement-character', regex: /�/u },
  { label: 'common-cjk-mojibake', regex: /锟|烫|闂|鈥|閿|锛|锝|锚/u },
  { label: 'utf8-as-gbk-cjk', regex: /鍏|杩|洖|鏌|绛|钘|忛/u },
  { label: 'latin-mojibake', regex: /[ÃÂÐÑØæçéåö]/u },
];

const findings = [];

async function exists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function scanFile(filePath) {
  const relativePath = path.relative(repoRoot, filePath);
  if (relativePath === path.join('scripts', 'check-mojibake.mjs')) {
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  if (!allowedExtensions.has(ext)) {
    return;
  }

  const baseName = path.basename(filePath);
  if (baseName.includes('.bak-')) {
    return;
  }

  const raw = await fs.readFile(filePath, 'utf8');
  const lines = raw.split(/\r?\n/u);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    for (const pattern of suspiciousPatterns) {
      if (pattern.regex.test(line)) {
        findings.push({
          filePath: relativePath,
          line: index + 1,
          label: pattern.label,
          snippet: line.trim().slice(0, 180),
        });
        break;
      }
    }
  }
}

async function scanPath(targetPath) {
  const stat = await fs.stat(targetPath);
  if (stat.isDirectory()) {
    const entries = await fs.readdir(targetPath, { withFileTypes: true });
    for (const entry of entries) {
      if (skipSegments.has(entry.name)) {
        continue;
      }
      await scanPath(path.join(targetPath, entry.name));
    }
    return;
  }

  await scanFile(targetPath);
}

for (const root of scanRoots) {
  const targetPath = path.join(repoRoot, root);
  if (await exists(targetPath)) {
    await scanPath(targetPath);
  }
}

if (findings.length > 0) {
  console.error('\u68c0\u6d4b\u5230\u53ef\u7591\u7684\u4e71\u7801\u6216\u66ff\u4ee3\u5b57\u7b26\uff1a');
  for (const finding of findings) {
    console.error(
      `- ${finding.filePath}:${finding.line} [${finding.label}] ${finding.snippet}`,
    );
  }
  process.exit(1);
}

console.log('\u7f16\u7801\u626b\u63cf\u901a\u8fc7\uff1a\u672a\u53d1\u73b0\u53ef\u7591\u4e71\u7801\u6a21\u5f0f\u3002');
