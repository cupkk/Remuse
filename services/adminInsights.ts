import type { AdminUserActivity } from '../types.ts';
import db from './database.ts';
import { getAdminUsageOverview } from './usageQuota.ts';

type AdminFlagRow = {
  user_id: string;
  status: 'watch' | 'restricted' | 'cleared';
  note: string;
  updated_at: string;
};

type UserActivityRow = {
  user_id: string;
  email: string | null;
  nickname: string;
  is_guest: number;
  total_events: number;
  ai_calls: number;
  gemini_calls: number;
  memory_ai_calls: number;
  login_count: number;
  refresh_count: number;
  scan_count: number;
  sticker_count: number;
  memory_query_count: number;
  last_seen: string | null;
};

type EventRow = {
  id: string;
  source: 'ai' | 'product';
  name: string;
  created_at: string;
  success: number | null;
  duration_ms: number | null;
  model: string | null;
  details_json: string | null;
};

type CountRow = {
  user_id: string;
  count: number;
};

db.exec(`
  CREATE TABLE IF NOT EXISTS admin_user_flags (
    user_id TEXT PRIMARY KEY,
    status TEXT NOT NULL CHECK (status IN ('watch', 'restricted', 'cleared')),
    note TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

const stmts = {
  listFlags: db.prepare(`
    SELECT user_id, status, note, updated_at
    FROM admin_user_flags
  `),
  getFlag: db.prepare<{ user_id: string }>(`
    SELECT user_id, status, note, updated_at
    FROM admin_user_flags
    WHERE user_id = @user_id
  `),
  upsertFlag: db.prepare<{
    user_id: string;
    status: 'watch' | 'restricted' | 'cleared';
    note: string;
  }>(`
    INSERT INTO admin_user_flags (user_id, status, note, updated_at)
    VALUES (@user_id, @status, @note, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET
      status = excluded.status,
      note = excluded.note,
      updated_at = datetime('now')
  `),
  userExists: db.prepare<{ user_id: string }>(`
    SELECT id
    FROM users
    WHERE id = @user_id
    LIMIT 1
  `),
  searchUsers: db.prepare<{ day_key: string; query: string; limit: number }>(`
    WITH combined_events AS (
      SELECT user_id, scope AS event_name, 'ai' AS source, created_at
      FROM ai_usage_events
      WHERE day_key >= @day_key

      UNION ALL

      SELECT user_id, event_type AS event_name, 'product' AS source, created_at
      FROM product_usage_events
      WHERE day_key >= @day_key
    )
    SELECT
      users.id AS user_id,
      users.email,
      users.nickname,
      users.is_guest,
      COALESCE(COUNT(combined_events.user_id), 0) AS total_events,
      COALESCE(SUM(CASE WHEN source = 'ai' THEN 1 ELSE 0 END), 0) AS ai_calls,
      COALESCE(SUM(CASE WHEN event_name = 'gemini-proxy' THEN 1 ELSE 0 END), 0) AS gemini_calls,
      COALESCE(SUM(CASE WHEN event_name = 'memory-query' THEN 1 ELSE 0 END), 0) AS memory_ai_calls,
      COALESCE(SUM(CASE WHEN event_name = 'login_success' THEN 1 ELSE 0 END), 0) AS login_count,
      COALESCE(SUM(CASE WHEN event_name = 'session_refresh' THEN 1 ELSE 0 END), 0) AS refresh_count,
      COALESCE(SUM(CASE WHEN event_name = 'scan_archive' THEN 1 ELSE 0 END), 0) AS scan_count,
      COALESCE(SUM(CASE WHEN event_name = 'sticker_generate' THEN 1 ELSE 0 END), 0) AS sticker_count,
      COALESCE(SUM(CASE WHEN event_name = 'memory_query' THEN 1 ELSE 0 END), 0) AS memory_query_count,
      MAX(combined_events.created_at) AS last_seen
    FROM users
    LEFT JOIN combined_events ON combined_events.user_id = users.id
    WHERE (
      lower(COALESCE(users.email, '')) LIKE @query
      OR lower(users.nickname) LIKE @query
      OR lower(users.id) LIKE @query
    )
    GROUP BY users.id
    ORDER BY total_events DESC, last_seen DESC
    LIMIT @limit
  `),
  userActivityById: db.prepare<{ day_key: string; user_id: string }>(`
    WITH combined_events AS (
      SELECT user_id, scope AS event_name, 'ai' AS source, created_at
      FROM ai_usage_events
      WHERE day_key >= @day_key
        AND user_id = @user_id

      UNION ALL

      SELECT user_id, event_type AS event_name, 'product' AS source, created_at
      FROM product_usage_events
      WHERE day_key >= @day_key
        AND user_id = @user_id
    )
    SELECT
      users.id AS user_id,
      users.email,
      users.nickname,
      users.is_guest,
      COALESCE(COUNT(combined_events.user_id), 0) AS total_events,
      COALESCE(SUM(CASE WHEN source = 'ai' THEN 1 ELSE 0 END), 0) AS ai_calls,
      COALESCE(SUM(CASE WHEN event_name = 'gemini-proxy' THEN 1 ELSE 0 END), 0) AS gemini_calls,
      COALESCE(SUM(CASE WHEN event_name = 'memory-query' THEN 1 ELSE 0 END), 0) AS memory_ai_calls,
      COALESCE(SUM(CASE WHEN event_name = 'login_success' THEN 1 ELSE 0 END), 0) AS login_count,
      COALESCE(SUM(CASE WHEN event_name = 'session_refresh' THEN 1 ELSE 0 END), 0) AS refresh_count,
      COALESCE(SUM(CASE WHEN event_name = 'scan_archive' THEN 1 ELSE 0 END), 0) AS scan_count,
      COALESCE(SUM(CASE WHEN event_name = 'sticker_generate' THEN 1 ELSE 0 END), 0) AS sticker_count,
      COALESCE(SUM(CASE WHEN event_name = 'memory_query' THEN 1 ELSE 0 END), 0) AS memory_query_count,
      MAX(combined_events.created_at) AS last_seen
    FROM users
    LEFT JOIN combined_events ON combined_events.user_id = users.id
    WHERE users.id = @user_id
    GROUP BY users.id
    LIMIT 1
  `),
  userRecentEvents: db.prepare<{ user_id: string; limit: number }>(`
    SELECT
      id,
      'product' AS source,
      event_type AS name,
      created_at,
      NULL AS success,
      NULL AS duration_ms,
      NULL AS model,
      details_json
    FROM product_usage_events
    WHERE user_id = @user_id

    UNION ALL

    SELECT
      id,
      'ai' AS source,
      scope AS name,
      created_at,
      success,
      duration_ms,
      model,
      details_json
    FROM ai_usage_events
    WHERE user_id = @user_id

    ORDER BY created_at DESC
    LIMIT @limit
  `),
  userAiTrend: db.prepare<{ user_id: string; day_key: string }>(`
    SELECT day_key, COUNT(*) AS count
    FROM ai_usage_events
    WHERE user_id = @user_id
      AND day_key >= @day_key
    GROUP BY day_key
    ORDER BY day_key ASC
  `),
  userProductTrend: db.prepare<{ user_id: string; day_key: string }>(`
    SELECT day_key, COUNT(*) AS count
    FROM product_usage_events
    WHERE user_id = @user_id
      AND day_key >= @day_key
    GROUP BY day_key
    ORDER BY day_key ASC
  `),
  distinctUsersSinceByEvent: db.prepare<{ day_key: string; event_type: string }>(`
    SELECT COUNT(DISTINCT user_id) AS count
    FROM product_usage_events
    WHERE day_key >= @day_key
      AND event_type = @event_type
  `),
  registrationsSince: db.prepare<{ day_key: string }>(`
    SELECT user_id, MIN(day_key) AS registered_day
    FROM product_usage_events
    WHERE event_type = 'register_success'
      AND day_key >= @day_key
    GROUP BY user_id
  `),
  userActivityDaysSince: db.prepare<{ day_key: string }>(`
    SELECT DISTINCT user_id, day_key
    FROM (
      SELECT user_id, day_key FROM product_usage_events WHERE day_key >= @day_key
      UNION
      SELECT user_id, day_key FROM ai_usage_events WHERE day_key >= @day_key
    )
  `),
  manualFlaggedUsers: db.prepare<{ day_key: string; limit: number }>(`
    WITH combined_events AS (
      SELECT user_id, scope AS event_name, 'ai' AS source, created_at
      FROM ai_usage_events
      WHERE day_key >= @day_key

      UNION ALL

      SELECT user_id, event_type AS event_name, 'product' AS source, created_at
      FROM product_usage_events
      WHERE day_key >= @day_key
    )
    SELECT
      users.id AS user_id,
      users.email,
      users.nickname,
      users.is_guest,
      COALESCE(COUNT(combined_events.user_id), 0) AS total_events,
      COALESCE(SUM(CASE WHEN source = 'ai' THEN 1 ELSE 0 END), 0) AS ai_calls,
      COALESCE(SUM(CASE WHEN event_name = 'gemini-proxy' THEN 1 ELSE 0 END), 0) AS gemini_calls,
      COALESCE(SUM(CASE WHEN event_name = 'memory-query' THEN 1 ELSE 0 END), 0) AS memory_ai_calls,
      COALESCE(SUM(CASE WHEN event_name = 'login_success' THEN 1 ELSE 0 END), 0) AS login_count,
      COALESCE(SUM(CASE WHEN event_name = 'session_refresh' THEN 1 ELSE 0 END), 0) AS refresh_count,
      COALESCE(SUM(CASE WHEN event_name = 'scan_archive' THEN 1 ELSE 0 END), 0) AS scan_count,
      COALESCE(SUM(CASE WHEN event_name = 'sticker_generate' THEN 1 ELSE 0 END), 0) AS sticker_count,
      COALESCE(SUM(CASE WHEN event_name = 'memory_query' THEN 1 ELSE 0 END), 0) AS memory_query_count,
      MAX(combined_events.created_at) AS last_seen
    FROM admin_user_flags
    JOIN users ON users.id = admin_user_flags.user_id
    LEFT JOIN combined_events ON combined_events.user_id = users.id
    WHERE admin_user_flags.status IN ('watch', 'restricted')
    GROUP BY users.id
    ORDER BY admin_user_flags.updated_at DESC
    LIMIT @limit
  `),
};

export function getAdminOverviewWithInsights() {
  const base = getAdminUsageOverview();
  const flagMap = buildFlagMap();

  const topUsers = attachFlags(base.topUsers, flagMap);
  const recentUsers = attachFlags(base.recentUsers, flagMap);
  const autoFlaggedUsers = attachFlags(base.flaggedUsers, flagMap);
  const manualFlaggedUsers = attachFlags(
    mapUserActivityRows(stmts.manualFlaggedUsers.all({ day_key: getDayKeyDaysAgo(29), limit: 12 }) as UserActivityRow[]),
    flagMap,
  );

  return {
    ...base,
    conversion7d: buildConversionSummary(7),
    conversion30d: buildConversionSummary(30),
    topUsers,
    recentUsers,
    flaggedUsers: dedupeUsers([...manualFlaggedUsers, ...autoFlaggedUsers]),
  };
}

export function searchAdminUsers(query: string, limit = 20) {
  const normalizedQuery = `%${query.trim().toLowerCase()}%`;
  const rows = stmts.searchUsers.all({
    day_key: getDayKeyDaysAgo(29),
    query: normalizedQuery,
    limit,
  }) as UserActivityRow[];

  return attachFlags(mapUserActivityRows(rows), buildFlagMap());
}

export function getAdminUserDetail(userId: string) {
  const row = stmts.userActivityById.get({
    day_key: getDayKeyDaysAgo(29),
    user_id: userId,
  }) as UserActivityRow | undefined;

  if (!row) {
    return null;
  }

  const user = attachFlags(mapUserActivityRows([row]), buildFlagMap())[0];
  const trends14d = buildUserTrendWindow(userId, 14);
  const recentEvents = (stmts.userRecentEvents.all({ user_id: userId, limit: 40 }) as EventRow[]).map((event) => ({
    id: event.id,
    source: event.source,
    name: event.name,
    createdAt: event.created_at,
    success: event.success === null ? null : !!event.success,
    durationMs: event.duration_ms === null ? null : event.duration_ms,
    model: event.model,
    details: parseJson(event.details_json),
  }));

  return {
    user,
    trends14d,
    recentEvents,
  };
}

export function updateAdminUserFlag(userId: string, status: 'watch' | 'restricted' | 'cleared', note = '') {
  const exists = stmts.userExists.get({ user_id: userId }) as { id: string } | undefined;
  if (!exists) {
    throw new Error('未找到该用户。');
  }

  stmts.upsertFlag.run({
    user_id: userId,
    status,
    note: note.trim(),
  });
}

export function getAdminUserFlag(userId: string) {
  return stmts.getFlag.get({ user_id: userId }) as AdminFlagRow | undefined;
}

export function isAdminUserRestricted(userId: string) {
  const flag = getAdminUserFlag(userId);
  return flag?.status === 'restricted';
}

function buildConversionSummary(windowDays: number) {
  const dayKey = getDayKeyDaysAgo(windowDays - 1);
  const registrations = stmts.registrationsSince.all({ day_key: dayKey }) as Array<{
    user_id: string;
    registered_day: string;
  }>;
  const activityRows = stmts.userActivityDaysSince.all({ day_key: dayKey }) as Array<{ user_id: string; day_key: string }>;
  const activityMap = new Map<string, Set<string>>();

  for (const row of activityRows) {
    if (!activityMap.has(row.user_id)) {
      activityMap.set(row.user_id, new Set());
    }
    activityMap.get(row.user_id)!.add(row.day_key);
  }

  let d1Eligible = 0;
  let d1Retained = 0;
  let d7Eligible = 0;
  let d7Retained = 0;
  const todayKey = getCurrentDayKey();

  for (const registration of registrations) {
    const userDays = activityMap.get(registration.user_id) || new Set<string>();
    const d1Key = offsetDayKey(registration.registered_day, 1);
    const d7Key = offsetDayKey(registration.registered_day, 7);

    if (todayKey >= d1Key) {
      d1Eligible += 1;
      if (userDays.has(d1Key)) {
        d1Retained += 1;
      }
    }

    if (todayKey >= d7Key) {
      d7Eligible += 1;
      if (userDays.has(d7Key)) {
        d7Retained += 1;
      }
    }
  }

  return {
    windowDays,
    registrations: registrations.length,
    verifiedUsers: countDistinctUsersSince(dayKey, 'email_verify_success'),
    loginUsers: countDistinctUsersSince(dayKey, 'login_success'),
    scanUsers: countDistinctUsersSince(dayKey, 'scan_archive'),
    stickerUsers: countDistinctUsersSince(dayKey, 'sticker_generate'),
    memoryUsers: countDistinctUsersSince(dayKey, 'memory_query'),
    d1Retention: d1Eligible > 0 ? Number(((d1Retained / d1Eligible) * 100).toFixed(1)) : 0,
    d7Retention: d7Eligible > 0 ? Number(((d7Retained / d7Eligible) * 100).toFixed(1)) : 0,
  };
}

function countDistinctUsersSince(dayKey: string, eventType: string) {
  const row = stmts.distinctUsersSinceByEvent.get({
    day_key: dayKey,
    event_type: eventType,
  }) as CountRow | undefined;

  return row?.count || 0;
}

function buildFlagMap() {
  const rows = stmts.listFlags.all() as AdminFlagRow[];
  return new Map(rows.map((row) => [row.user_id, row]));
}

function attachFlags(users: AdminUserActivity[], flagMap: Map<string, AdminFlagRow>) {
  return users.map((user) => {
    const flag = flagMap.get(user.userId);
    return {
      ...user,
      flagStatus: flag?.status || null,
      flagNote: flag?.note || null,
      flagUpdatedAt: flag?.updated_at || null,
    };
  });
}

function dedupeUsers(users: AdminUserActivity[]) {
  const seen = new Set<string>();
  return users.filter((user) => {
    if (seen.has(user.userId)) {
      return false;
    }
    seen.add(user.userId);
    return true;
  });
}

function buildUserTrendWindow(userId: string, windowDays: number) {
  const dayKey = getDayKeyDaysAgo(windowDays - 1);
  const aiRows = stmts.userAiTrend.all({ user_id: userId, day_key: dayKey }) as Array<{ day_key: string; count: number }>;
  const productRows = stmts.userProductTrend.all({ user_id: userId, day_key: dayKey }) as Array<{ day_key: string; count: number }>;
  const aiMap = new Map(aiRows.map((row) => [row.day_key, row.count || 0]));
  const productMap = new Map(productRows.map((row) => [row.day_key, row.count || 0]));

  return buildDaySeries(windowDays).map((currentDay) => ({
    dayKey: currentDay,
    totalEvents: (aiMap.get(currentDay) || 0) + (productMap.get(currentDay) || 0),
    aiCalls: aiMap.get(currentDay) || 0,
    productEvents: productMap.get(currentDay) || 0,
    activeUsers: 1,
    avgDurationMs: null,
  }));
}

function mapUserActivityRows(rows: UserActivityRow[]): AdminUserActivity[] {
  return rows.map((row) => ({
    userId: row.user_id,
    email: row.email || null,
    nickname: row.nickname,
    isGuest: !!row.is_guest,
    totalEvents: row.total_events || 0,
    aiCalls: row.ai_calls || 0,
    geminiCalls: row.gemini_calls || 0,
    memoryAiCalls: row.memory_ai_calls || 0,
    loginCount: row.login_count || 0,
    refreshCount: row.refresh_count || 0,
    scanCount: row.scan_count || 0,
    stickerCount: row.sticker_count || 0,
    memoryQueryCount: row.memory_query_count || 0,
    lastSeen: row.last_seen || null,
    flagStatus: null,
    flagNote: null,
    flagUpdatedAt: null,
  }));
}

function parseJson(value: string | null) {
  if (!value) {
    return {};
  }

  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function buildDaySeries(windowDays: number) {
  return Array.from({ length: windowDays }, (_, index) => getDayKeyDaysAgo(windowDays - index - 1));
}

function getCurrentDayKey() {
  return new Date().toISOString().slice(0, 10);
}

function getDayKeyDaysAgo(daysAgo: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

function offsetDayKey(dayKey: string, offset: number) {
  const date = new Date(`${dayKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}
