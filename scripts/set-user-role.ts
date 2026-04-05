import 'dotenv/config';
import { getUserById, setUserRoleByEmail, updateUserRole, type UserRole } from '../services/database.ts';
import { normalizeEmailAddress } from '../services/auth.ts';

interface ScriptOptions {
  emails: string[];
  userIds: string[];
  role: UserRole;
}

const options = resolveOptions(process.argv.slice(2));
const updatedUsers: Array<{ id: string; email: string | null; role: UserRole }> = [];

for (const email of options.emails) {
  const updated = setUserRoleByEmail(email, options.role);
  if (!updated) {
    throw new Error(`未找到邮箱为 ${email} 的用户。`);
  }

  updatedUsers.push({
    id: updated.id,
    email: updated.email,
    role: updated.role,
  });
}

for (const userId of options.userIds) {
  const user = getUserById(userId);
  if (!user) {
    throw new Error(`未找到 ID 为 ${userId} 的用户。`);
  }

  const updated = updateUserRole(userId, options.role);
  if (!updated) {
    throw new Error(`无法更新 ID 为 ${userId} 的用户角色。`);
  }

  updatedUsers.push({
    id: updated.id,
    email: updated.email,
    role: updated.role,
  });
}

console.log(JSON.stringify({
  ok: true,
  updatedUsers,
}, null, 2));

function resolveOptions(argv: string[]): ScriptOptions {
  const args = parseArgs(argv);
  const role = parseRole(args.role);
  const emails = dedupe(args.email.flatMap(splitCommaSeparated).map((email) => normalizeEmailAddress(email)));
  const userIds = dedupe(args['user-id'].flatMap(splitCommaSeparated).map((entry) => entry.trim()).filter(Boolean));

  if (emails.length === 0 && userIds.length === 0) {
    throw new Error('至少提供一个 --email 或 --user-id 目标。');
  }

  return {
    emails,
    userIds,
    role,
  };
}

function parseArgs(argv: string[]) {
  const result: Record<string, string[]> = {
    email: [],
    'user-id': [],
    role: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const entry = argv[index];
    if (!entry?.startsWith('--')) {
      continue;
    }

    const key = entry.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      result[key] = [...(result[key] || []), 'true'];
      continue;
    }

    result[key] = [...(result[key] || []), next];
    index += 1;
  }

  return result;
}

function parseRole(value: string[] | undefined): UserRole {
  const candidate = value?.[0]?.trim().toLowerCase();
  if (candidate === 'admin' || candidate === 'user') {
    return candidate;
  }

  throw new Error('请使用 --role admin 或 --role user 指定角色。');
}

function splitCommaSeparated(value: string) {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function dedupe(values: string[]) {
  return Array.from(new Set(values));
}
