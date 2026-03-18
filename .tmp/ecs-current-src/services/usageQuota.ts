import { v4 as uuidv4 } from 'uuid';
import type { AdminUserActivity } from '../types.ts';
import db from './database.ts';
import { APP_CONFIG } from './appConfig.ts';

export type AiUsageScope = 'gemini-proxy' | 'memory-query';
export type ProductUsageEventType =
  | 'guest_bootstrap'
  | 'register_success'
  | 'email_verify_success'
  | 'login_success'
  | 'session_refresh'
  | 'scan_archive'
  | 'collection_cover_generate'
  | 'sticker_generate'
  | 'emoji_pack_generate'
  | 'memory_thread_create'
  | 'memory_query';

export interface UsageSnapshot {
  scope: AiUsageScope;
  used: number;
  limit: number;
  remaining: number;
}

type TrendRow = {
  day_key: string;
  count: number;
  active_users?: number;
  avg_duration_ms?: number | null;
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

db.exec(`
  CREATE TABLE IF NOT EXISTS ai_usage_events (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    scope TEXT NOT NULL,
    model TEXT,
    success INTEGER NOT NULL DEFAULT 0,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    day_key TEXT NOT NULL,
    details_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_ai_usage_events_user_scope_day
  ON ai_usage_events(user_id, scope, day_key);

  CREATE TABLE IF NOT EXISTS product_usage_events (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    day_key TEXT NOT NULL,
    details_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_product_usage_events_user_type_day
  ON product_usage_events(user_id, event_type, day_key);

  CREATE INDEX IF NOT EXISTS idx_product_usage_events_day
  ON product_usage_events(day_key, created_at DESC);
`);

const stmts = {
  countUsageForScope: db.prepare<{
    user_id: string;
    scope: AiUsageScope;
    day_key: string;
  }>(`
    SELECT COUNT(*) AS count
    FROM ai_usage_events
    WHERE user_id = @user_id
      AND scope = @scope
      AND day_key = @day_key
  `),
  insertUsageEvent: db.prepare<{
    id: string;
    user_id: string;
    scope: AiUsageScope;
    model: string | null;
    success: number;
    duration_ms: number;
    day_key: string;
    details_json: string;
  }>(`
    INSERT INTO ai_usage_events (
      id,
      user_id,
      scope,
      model,
      success,
      duration_ms,
      day_key,
      details_json
    ) VALUES (
      @id,
      @user_id,
      @scope,
      @model,
      @success,
      @duration_ms,
      @day_key,
      @details_json
    )
  `),
  insertProductEvent: db.prepare<{
    id: string;
    user_id: string;
    event_type: ProductUsageEventType;
    day_key: string;
    details_json: string;
  }>(`
    INSERT INTO product_usage_events (
      id,
      user_id,
      event_type,
      day_key,
      details_json
    ) VALUES (
      @id,
      @user_id,
      @event_type,
      @day_key,
      @details_json
    )
  `),
  aiSummarySince: db.prepare<{ day_key: string }>(`
    SELECT
      COUNT(*) AS total_ai_calls,
      SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS success_count,
      AVG(duration_ms) AS avg_duration_ms
    FROM ai_usage_events
    WHERE day_key >= @day_key
  `),
  productSummarySince: db.prepare<{ day_key: string }>(`
    SELECT COUNT(*) AS total_product_events
    FROM product_usage_events
    WHERE day_key >= @day_key
  `),
  activeUsersSince: db.prepare<{ day_key: string }>(`
    SELECT COUNT(DISTINCT user_id) AS active_users
    FROM (
      SELECT user_id FROM ai_usage_events WHERE day_key >= @day_key
      UNION
      SELECT user_id FROM product_usage_events WHERE day_key >= @day_key
    )
  `),
  aiByScopeSince: db.prepare<{ day_key: string }>(`
    SELECT
      scope,
      COUNT(*) AS calls,
      SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS success_count,
      AVG(duration_ms) AS avg_duration_ms
    FROM ai_usage_events
    WHERE day_key >= @day_key
    GROUP BY scope
    ORDER BY calls DESC, scope ASC
  `),
  productByTypeSince: db.prepare<{ day_key: string }>(`
    SELECT
      event_type,
      COUNT(*) AS count
    FROM product_usage_events
    WHERE day_key >= @day_key
    GROUP BY event_type
    ORDER BY count DESC, event_type ASC
  `),
  aiTrendSince: db.prepare<{ day_key: string }>(`
    SELECT
      day_key,
      COUNT(*) AS count,
      AVG(duration_ms) AS avg_duration_ms
    FROM ai_usage_events
    WHERE day_key >= @day_key
    GROUP BY day_key
    ORDER BY day_key ASC
  `),
  productTrendSince: db.prepare<{ day_key: string }>(`
    SELECT
      day_key,
      COUNT(*) AS count,
      COUNT(DISTINCT user_id) AS active_users
    FROM product_usage_events
    WHERE day_key >= @day_key
    GROUP BY day_key
    ORDER BY day_key ASC
  `),
  topUsersSince: db.prepare<{ day_key: string; limit: number }>(`
    WITH combined_events AS (
      SELECT user_id, scope AS event_name, 'ai' AS source, created_at
      FROM ai_usage_events
      WHERE day_key >= @day_key

      UNION ALL

      SELECT user_id, event_type AS event_name, 'product' AS source, created_at
      FROM product_usage_events
      WHERE day_key >= @day_key
    ),
    aggregated AS (
      SELECT
        user_id,
        COUNT(*) AS total_events,
        SUM(CASE WHEN source = 'ai' THEN 1 ELSE 0 END) AS ai_calls,
        SUM(CASE WHEN event_name = 'gemini-proxy' THEN 1 ELSE 0 END) AS gemini_calls,
        SUM(CASE WHEN event_name = 'memory-query' THEN 1 ELSE 0 END) AS memory_ai_calls,
        SUM(CASE WHEN event_name = 'login_success' THEN 1 ELSE 0 END) AS login_count,
        SUM(CASE WHEN event_name = 'session_refresh' THEN 1 ELSE 0 END) AS refresh_count,
        SUM(CASE WHEN event_name = 'scan_archive' THEN 1 ELSE 0 END) AS scan_count,
        SUM(CASE WHEN event_name = 'sticker_generate' THEN 1 ELSE 0 END) AS sticker_count,
        SUM(CASE WHEN event_name = 'memory_query' THEN 1 ELSE 0 END) AS memory_query_count,
        MAX(created_at) AS last_seen
      FROM combined_events
      GROUP BY user_id
    )
    SELECT
      aggregated.*,
      users.email,
      users.nickname,
      users.is_guest
    FROM aggregated
    JOIN users ON users.id = aggregated.user_id
    ORDER BY aggregated.total_events DESC, aggregated.last_seen DESC
    LIMIT @limit
  `),
  recentUsersSince: db.prepare<{ day_key: string; limit: number }>(`
    WITH combined_events AS (
      SELECT user_id, scope AS event_name, 'ai' AS source, created_at
      FROM ai_usage_events
      WHERE day_key >= @day_key

      UNION ALL

      SELECT user_id, event_type AS event_name, 'product' AS source, created_at
      FROM product_usage_events
      WHERE day_key >= @day_key
    ),
    aggregated AS (
      SELECT
        user_id,
        COUNT(*) AS total_events,
        SUM(CASE WHEN source = 'ai' THEN 1 ELSE 0 END) AS ai_calls,
        SUM(CASE WHEN event_name = 'gemini-proxy' THEN 1 ELSE 0 END) AS gemini_calls,
        SUM(CASE WHEN event_name = 'memory-query' THEN 1 ELSE 0 END) AS memory_ai_calls,
        SUM(CASE WHEN event_name = 'login_success' THEN 1 ELSE 0 END) AS login_count,
        SUM(CASE WHEN event_name = 'session_refresh' THEN 1 ELSE 0 END) AS refresh_count,
        SUM(CASE WHEN event_name = 'scan_archive' THEN 1 ELSE 0 END) AS scan_count,
        SUM(CASE WHEN event_name = 'sticker_generate' THEN 1 ELSE 0 END) AS sticker_count,
        SUM(CASE WHEN event_name = 'memory_query' THEN 1 ELSE 0 END) AS memory_query_count,
        MAX(created_at) AS last_seen
      FROM combined_events
      GROUP BY user_id
    )
    SELECT
      aggregated.*,
      users.email,
      users.nickname,
      users.is_guest
    FROM aggregated
    JOIN users ON users.id = aggregated.user_id
    ORDER BY aggregated.last_seen DESC
    LIMIT @limit
  `),
};

export function getUsageLimit(scope: AiUsageScope) {
  switch (scope) {
    case 'memory-query':
      return APP_CONFIG.dailyMemoryQueries;
    case 'gemini-proxy':
    default:
      return APP_CONFIG.dailyGeminiCalls;
  }
}

export function getUsageSnapshotForUser(userId: string): UsageSnapshot[] {
  const dayKey = getCurrentDayKey();
  return (['gemini-proxy', 'memory-query'] as AiUsageScope[]).map((scope) => {
    const used = getUsageCountForDay(userId, scope, dayKey);
    const limit = getUsageLimit(scope);
    return {
      scope,
      used,
      limit,
      remaining: Math.max(limit - used, 0),
    };
  });
}

export function getUsageCountForDay(userId: string, scope: AiUsageScope, dayKey = getCurrentDayKey()) {
  const row = stmts.countUsageForScope.get({ user_id: userId, scope, day_key: dayKey }) as { count: number } | undefined;
  return row?.count || 0;
}

export function assertWithinUsageQuota(userId: string, scope: AiUsageScope) {
  const used = getUsageCountForDay(userId, scope);
  const limit = getUsageLimit(scope);
  return {
    allowed: used < limit,
    used,
    limit,
    remaining: Math.max(limit - used, 0),
  };
}

export function recordAiUsageEvent(input: {
  userId: string;
  scope: AiUsageScope;
  model?: string | null;
  success: boolean;
  durationMs?: number;
  details?: Record<string, unknown>;
}) {
  stmts.insertUsageEvent.run({
    id: uuidv4(),
    user_id: input.userId,
    scope: input.scope,
    model: input.model || null,
    success: input.success ? 1 : 0,
    duration_ms: Math.max(0, Math.round(input.durationMs || 0)),
    day_key: getCurrentDayKey(),
    details_json: JSON.stringify(input.details || {}),
  });
}

export function recordProductUsageEvent(input: {
  userId: string;
  eventType: ProductUsageEventType;
  details?: Record<string, unknown>;
}) {
  stmts.insertProductEvent.run({
    id: uuidv4(),
    user_id: input.userId,
    event_type: input.eventType,
    day_key: getCurrentDayKey(),
    details_json: JSON.stringify(input.details || {}),
  });
}

export function getAdminUsageOverview() {
  const summary7d = buildUsageSummary(7);
  const summary30d = buildUsageSummary(30);
  const aiScopes7d = (stmts.aiByScopeSince.all({ day_key: getDayKeyDaysAgo(6) }) as Array<{
    scope: string;
    calls: number;
    success_count: number | null;
    avg_duration_ms: number | null;
  }>).map((row) => ({
    scope: row.scope,
    calls: row.calls || 0,
    successCount: row.success_count || 0,
    avgDurationMs: row.avg_duration_ms === null ? null : Math.round(row.avg_duration_ms),
  }));
  const productEvents7d = (stmts.productByTypeSince.all({ day_key: getDayKeyDaysAgo(6) }) as Array<{
    event_type: string;
    count: number;
  }>).map((row) => ({
    eventType: row.event_type,
    count: row.count || 0,
  }));
  const topUsers = mapUserActivityRows(stmts.topUsersSince.all({ day_key: getDayKeyDaysAgo(6), limit: 12 }) as UserActivityRow[]);
  const recentUsers = mapUserActivityRows(stmts.recentUsersSince.all({ day_key: getDayKeyDaysAgo(29), limit: 8 }) as UserActivityRow[]);
  const flaggedUsers = topUsers.filter((user) => user.totalEvents >= 20 || user.aiCalls >= 10);

  return {
    summary7d,
    summary30d,
    aiScopes7d,
    productEvents7d,
    trends7d: buildTrendWindow(7),
    trends30d: buildTrendWindow(30),
    topUsers,
    recentUsers,
    flaggedUsers,
  };
}

function buildUsageSummary(windowDays: number) {
  const dayKey = getDayKeyDaysAgo(windowDays - 1);
  const aiSummary = stmts.aiSummarySince.get({ day_key: dayKey }) as {
    total_ai_calls: number | null;
    success_count: number | null;
    avg_duration_ms: number | null;
  } | undefined;
  const productSummary = stmts.productSummarySince.get({ day_key: dayKey }) as {
    total_product_events: number | null;
  } | undefined;
  const activeUsers = stmts.activeUsersSince.get({ day_key: dayKey }) as { active_users: number | null } | undefined;

  const totalAiCalls = aiSummary?.total_ai_calls || 0;
  const successCount = aiSummary?.success_count || 0;
  const totalProductEvents = productSummary?.total_product_events || 0;

  return {
    windowDays,
    totalEvents: totalAiCalls + totalProductEvents,
    totalAiCalls,
    totalProductEvents,
    successRate: totalAiCalls > 0 ? Number(((successCount / totalAiCalls) * 100).toFixed(1)) : 0,
    avgDurationMs: aiSummary?.avg_duration_ms === null || aiSummary?.avg_duration_ms === undefined
      ? null
      : Math.round(aiSummary.avg_duration_ms),
    activeUsers: activeUsers?.active_users || 0,
  };
}

function buildTrendWindow(windowDays: number) {
  const dayKey = getDayKeyDaysAgo(windowDays - 1);
  const aiRows = stmts.aiTrendSince.all({ day_key: dayKey }) as TrendRow[];
  const productRows = stmts.productTrendSince.all({ day_key: dayKey }) as TrendRow[];
  const aiMap = new Map(aiRows.map((row) => [row.day_key, row]));
  const productMap = new Map(productRows.map((row) => [row.day_key, row]));

  return buildDaySeries(windowDays).map((currentDay) => {
    const ai = aiMap.get(currentDay);
    const product = productMap.get(currentDay);

    return {
      dayKey: currentDay,
      totalEvents: (ai?.count || 0) + (product?.count || 0),
      aiCalls: ai?.count || 0,
      productEvents: product?.count || 0,
      activeUsers: product?.active_users || 0,
      avgDurationMs: ai?.avg_duration_ms === null || ai?.avg_duration_ms === undefined
        ? null
        : Math.round(ai.avg_duration_ms),
    };
  });
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
