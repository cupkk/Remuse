import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import Database from 'better-sqlite3';
import 'dotenv/config';

const execFileAsync = promisify(execFile);
const appRoot = process.env.APP_ROOT ? path.resolve(process.env.APP_ROOT) : process.cwd();
const backupRoot = path.resolve(process.env.BACKUP_DIR || path.join(appRoot, 'backups'));
const retentionDays = parsePositiveInt(process.env.BACKUP_RETENTION_DAYS, 14);
const minRegisteredUserRatio = parsePositiveFloat(process.env.BACKUP_MIN_REGISTERED_USER_RATIO, 0.7);
const minTotalUserRatio = parsePositiveFloat(process.env.BACKUP_MIN_TOTAL_USER_RATIO, 0.6);
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
  const userCountAlert = await detectUserCountDrop(snapshotDir, backupRoot);
  if (userCountAlert) {
    console.warn(`[backup-job] ${userCountAlert.message}`);
    await notifyBackupFailure({
      message: userCountAlert.message,
      snapshotDir,
      retentionDays,
      userCountAlert,
    });
  }
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
    throw new Error(`备份清单存在，但 ${targetDir} 中缺少数据库文件。`);
  }

  if (!manifest.createdAt || !manifest.dbPath) {
    throw new Error(`备份清单不完整：${manifestPath}`);
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

async function detectUserCountDrop(currentSnapshotDir, rootDir) {
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  const previousSnapshots = entries
    .filter((entry) => entry.isDirectory() && path.join(rootDir, entry.name) !== currentSnapshotDir)
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  const previousName = previousSnapshots.at(-1);
  if (!previousName) {
    return null;
  }

  const previousSnapshotDir = path.join(rootDir, previousName);
  const currentStats = readUserStats(path.join(currentSnapshotDir, 'data', 'remuse.db'));
  const previousStats = readUserStats(path.join(previousSnapshotDir, 'data', 'remuse.db'));

  const registeredRatio = previousStats.registeredUsers > 0
    ? currentStats.registeredUsers / previousStats.registeredUsers
    : 1;
  const totalRatio = previousStats.totalUsers > 0
    ? currentStats.totalUsers / previousStats.totalUsers
    : 1;

  if (registeredRatio >= minRegisteredUserRatio && totalRatio >= minTotalUserRatio) {
    return null;
  }

  return {
    message: [
      'User count dropped sharply compared with the previous snapshot.',
      `previous=${previousName}`,
      `registered=${previousStats.registeredUsers}->${currentStats.registeredUsers}`,
      `total=${previousStats.totalUsers}->${currentStats.totalUsers}`,
      `registeredRatio=${registeredRatio.toFixed(3)}`,
      `totalRatio=${totalRatio.toFixed(3)}`,
    ].join(' '),
    previousSnapshotDir,
    currentStats,
    previousStats,
    thresholds: {
      minRegisteredUserRatio,
      minTotalUserRatio,
    },
  };
}

function readUserStats(dbFilePath) {
  const db = new Database(dbFilePath, { readonly: true });
  try {
    const totalUsers = Number(db.prepare('SELECT COUNT(*) AS count FROM users').get().count || 0);
    const registeredUsers = Number(
      db.prepare('SELECT COUNT(*) AS count FROM users WHERE is_guest = 0 AND email IS NOT NULL').get().count || 0,
    );
    return {
      totalUsers,
      registeredUsers,
    };
  } finally {
    db.close();
  }
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
    console.warn('[backup-job] 未配置告警目标，请设置 BACKUP_ALERT_EMAILS 或 ALERT_WEBHOOK_URL。');
    return;
  }

  await Promise.allSettled(tasks);
}

function resolveAlertEmails() {
  return parseCommaSeparatedList(process.env.BACKUP_ALERT_EMAILS);
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
    throw new Error(`备份告警 Webhook 调用失败，状态码 ${response.status}`);
  }
}

async function sendEmailAlert(recipients, context) {
  const resendApiKey = (process.env.RESEND_API_KEY || '').trim();
  const fromEmail = (process.env.MAIL_FROM_EMAIL || '').trim();
  const fromName = (process.env.MAIL_FROM_NAME || 'Re-Museum Ops').trim();

  if (!resendApiKey || !fromEmail) {
    console.warn('[backup-job] 缺少 RESEND_API_KEY 或 MAIL_FROM_EMAIL，已跳过邮件告警。');
    return;
  }

  const subject = '[Re-Museum] 备份任务失败';
  const text = [
    'Re-Museum 备份任务执行失败。',
    `时间：${new Date().toISOString()}`,
    `备份目录：${context.snapshotDir}`,
    `保留天数：${context.retentionDays}`,
    `错误信息：${context.message}`,
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
          <p><strong>Re-Museum 备份任务执行失败。</strong></p>
          <p>时间：${escapeHtml(new Date().toISOString())}</p>
          <p>备份目录：${escapeHtml(context.snapshotDir)}</p>
          <p>保留天数：${escapeHtml(String(context.retentionDays))}</p>
          <p>错误信息：${escapeHtml(context.message)}</p>
        </div>
      `,
    }),
  });

  if (!response.ok) {
    const responseText = await response.text().catch(() => '');
    throw new Error(`备份告警邮件发送失败，状态码 ${response.status}：${responseText}`);
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

function parsePositiveFloat(value, fallback) {
  const parsed = Number.parseFloat(value || '');
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
