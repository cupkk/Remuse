import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import 'dotenv/config';

const execFileAsync = promisify(execFile);
const appRoot = process.env.APP_ROOT ? path.resolve(process.env.APP_ROOT) : process.cwd();
const backupRoot = path.resolve(process.env.BACKUP_DIR || path.join(appRoot, 'backups'));
const retentionDays = parsePositiveInt(process.env.BACKUP_RETENTION_DAYS, 14);
const snapshotName = new Date().toISOString().replace(/[:.]/g, '-');
const snapshotDir = path.join(backupRoot, snapshotName);

try {
  await fs.mkdir(backupRoot, { recursive: true });
  await execFileAsync(process.execPath, [path.join(appRoot, 'scripts', 'backup-data.mjs'), snapshotName], {
    cwd: appRoot,
    env: process.env,
    maxBuffer: 10 * 1024 * 1024,
  });

  await assertSnapshotHealthy(snapshotDir);
  const deletedSnapshots = await pruneExpiredSnapshots(backupRoot, retentionDays);

  console.log(JSON.stringify({
    ok: true,
    snapshotDir,
    deletedSnapshots,
    retentionDays,
    createdAt: new Date().toISOString(),
  }));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[backup-job] ${message}`);
  await notifyBackupFailure({
    message,
    snapshotDir,
    retentionDays,
  });
  process.exitCode = 1;
}

async function assertSnapshotHealthy(targetDir) {
  const manifestPath = path.join(targetDir, 'manifest.json');
  const manifestRaw = await fs.readFile(manifestPath, 'utf8');
  const manifest = JSON.parse(manifestRaw);

  const dbExists = await fileExists(path.join(targetDir, 'data', 'remuse.db'));
  if (!dbExists) {
    throw new Error(`Backup manifest exists but database file is missing in ${targetDir}`);
  }

  if (!manifest.createdAt || !manifest.dbPath) {
    throw new Error(`Backup manifest is incomplete in ${manifestPath}`);
  }
}

async function pruneExpiredSnapshots(rootDir, keepDays) {
  const cutoff = Date.now() - keepDays * 24 * 60 * 60 * 1000;
  const deleted = [];
  const entries = await fs.readdir(rootDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const fullPath = path.join(rootDir, entry.name);
    const stats = await fs.stat(fullPath);
    if (stats.mtimeMs < cutoff) {
      await fs.rm(fullPath, { recursive: true, force: true });
      deleted.push(entry.name);
    }
  }

  return deleted;
}

async function notifyBackupFailure(context) {
  const webhookUrl = (process.env.ALERT_WEBHOOK_URL || '').trim();
  const alertEmails = resolveAlertEmails();
  const tasks = [];

  if (webhookUrl) {
    tasks.push(sendWebhookAlert(webhookUrl, context));
  }

  if (alertEmails.length > 0) {
    tasks.push(sendEmailAlert(alertEmails, context));
  }

  if (tasks.length === 0) {
    console.warn('[backup-job] No alert target configured. Set BACKUP_ALERT_EMAILS or ALERT_WEBHOOK_URL.');
    return;
  }

  await Promise.allSettled(tasks);
}

function resolveAlertEmails() {
  const explicit = parseCommaSeparatedList(process.env.BACKUP_ALERT_EMAILS);
  if (explicit.length > 0) {
    return explicit;
  }

  return parseCommaSeparatedList(process.env.ADMIN_EMAIL_ALLOWLIST);
}

async function sendWebhookAlert(webhookUrl, context) {
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event: 'backup_failed',
      app: 're-museum',
      at: new Date().toISOString(),
      ...context,
    }),
  });

  if (!response.ok) {
    throw new Error(`Alert webhook failed with status ${response.status}`);
  }
}

async function sendEmailAlert(recipients, context) {
  const resendApiKey = (process.env.RESEND_API_KEY || '').trim();
  const fromEmail = (process.env.MAIL_FROM_EMAIL || '').trim();
  const fromName = (process.env.MAIL_FROM_NAME || 'Re-Museum Ops').trim();

  if (!resendApiKey || !fromEmail) {
    console.warn('[backup-job] Email alert skipped because RESEND_API_KEY or MAIL_FROM_EMAIL is missing.');
    return;
  }

  const subject = '[Re-Museum] Backup job failed';
  const text = [
    'Re-Museum backup job failed.',
    `Time: ${new Date().toISOString()}`,
    `Snapshot dir: ${context.snapshotDir}`,
    `Retention days: ${context.retentionDays}`,
    `Error: ${context.message}`,
  ].join('\n');

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${resendApiKey}`,
    },
    body: JSON.stringify({
      from: `${fromName} <${fromEmail}>`,
      to: recipients,
      subject,
      text,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.7; color: #171717;">
          <p><strong>Re-Museum backup job failed.</strong></p>
          <p>Time: ${escapeHtml(new Date().toISOString())}</p>
          <p>Snapshot dir: ${escapeHtml(context.snapshotDir)}</p>
          <p>Retention days: ${escapeHtml(String(context.retentionDays))}</p>
          <p>Error: ${escapeHtml(context.message)}</p>
        </div>
      `,
    }),
  });

  if (!response.ok) {
    const responseText = await response.text().catch(() => '');
    throw new Error(`Backup alert email failed with status ${response.status}: ${responseText}`);
  }
}

async function fileExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseCommaSeparatedList(value) {
  return (value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function escapeHtml(value) {
  return `${value}`
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
