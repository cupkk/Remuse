import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock3,
  Loader2,
  MessageCircleWarning,
  RefreshCw,
  Search,
  Shield,
  UserRound,
  X,
} from 'lucide-react';
import {
  AdminOverview,
  AdminTrendPoint,
  AdminUserActivity,
  AdminUserDetail,
  AdminUserFlagStatus,
  FeedbackSubmission,
} from '../types';
import {
  fetchAdminOverview,
  fetchAdminUserDetail,
  searchAdminUsers,
  updateAdminUserFlag,
  updateFeedbackStatus,
} from '../services/adminService';

interface AdminConsoleProps {
  onClose: () => void;
}

const AdminConsole: React.FC<AdminConsoleProps> = ({ onClose }) => {
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [workingFeedbackId, setWorkingFeedbackId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [searchResults, setSearchResults] = useState<AdminUserActivity[]>([]);
  const [selectedUserDetail, setSelectedUserDetail] = useState<AdminUserDetail | null>(null);
  const [loadingUserDetail, setLoadingUserDetail] = useState(false);
  const [savingUserFlag, setSavingUserFlag] = useState(false);
  const [flagNoteDraft, setFlagNoteDraft] = useState('');

  async function loadOverview(showLoader = false) {
    if (showLoader) {
      setLoading(true);
    }

    try {
      const nextOverview = await fetchAdminOverview();
      setOverview(nextOverview);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '无法加载管理员概览。');
    } finally {
      if (showLoader) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const nextOverview = await fetchAdminOverview();
        if (!cancelled) {
          setOverview(nextOverview);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : '无法加载管理员概览。');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const maxTrendValue = useMemo(() => Math.max(
    1,
    ...(overview?.trends7d || []).map((point) => point.totalEvents),
    ...(overview?.trends30d || []).map((point) => point.totalEvents),
    ...(selectedUserDetail?.trends14d || []).map((point) => point.totalEvents),
  ), [overview?.trends30d, overview?.trends7d, selectedUserDetail?.trends14d]);

  async function handleFeedbackStatusChange(feedbackId: string, status: FeedbackSubmission['status']) {
    if (!overview) {
      return;
    }

    setWorkingFeedbackId(feedbackId);
    setError(null);
    setNotice(null);
    try {
      await updateFeedbackStatus(feedbackId, status);
      const nextFeedback = overview.feedback.map((item) => (
        item.id === feedbackId ? { ...item, status, updatedAt: new Date().toISOString() } : item
      ));
      setOverview({
        ...overview,
        feedback: nextFeedback,
        feedbackSummary: summarizeFeedback(nextFeedback),
      });
      setNotice('反馈状态已更新。');
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : '更新反馈状态失败。');
    } finally {
      setWorkingFeedbackId(null);
    }
  }

  async function handleUserSearch() {
    const keyword = searchQuery.trim();
    setError(null);
    setNotice(null);

    if (!keyword) {
      setSearchResults([]);
      return;
    }

    setSearchingUsers(true);
    try {
      const users = await searchAdminUsers(keyword);
      setSearchResults(users);
      if (users.length === 0) {
        setNotice('没有搜索到匹配的用户。');
      }
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : '用户搜索失败。');
    } finally {
      setSearchingUsers(false);
    }
  }

  async function handleSelectUser(userId: string) {
    setLoadingUserDetail(true);
    setError(null);
    setNotice(null);

    try {
      const detail = await fetchAdminUserDetail(userId);
      setSelectedUserDetail(detail);
      setFlagNoteDraft(detail.user.flagNote || '');
    } catch (detailError) {
      setError(detailError instanceof Error ? detailError.message : '无法加载用户明细。');
    } finally {
      setLoadingUserDetail(false);
    }
  }

  async function handleUserFlagChange(status: AdminUserFlagStatus) {
    if (!selectedUserDetail) {
      return;
    }

    setSavingUserFlag(true);
    setError(null);
    setNotice(null);
    try {
      await updateAdminUserFlag(selectedUserDetail.user.userId, status, flagNoteDraft);
      const refreshedDetail = await fetchAdminUserDetail(selectedUserDetail.user.userId);
      setSelectedUserDetail(refreshedDetail);
      setFlagNoteDraft(refreshedDetail.user.flagNote || '');
      await loadOverview(false);
      setNotice(status === 'cleared' ? '用户限制标记已清除。' : '用户标记状态已更新。');
    } catch (flagError) {
      setError(flagError instanceof Error ? flagError.message : '更新用户标记失败。');
    } finally {
      setSavingUserFlag(false);
    }
  }

  return (
    <div className="relative max-h-[92vh] overflow-hidden rounded-[32px] border border-white/10 bg-[#101214]/95 shadow-[0_30px_100px_rgba(0,0,0,0.55)]">
      <div className="flex items-start justify-between gap-4 border-b border-remuse-border px-6 py-5">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-remuse-accent/25 bg-remuse-accent/10 px-3 py-1 text-[11px] font-mono uppercase tracking-[0.26em] text-remuse-accent">
            <Shield size={14} />
            Admin Monitor
          </div>
          <h3 className="mt-3 text-2xl font-display font-bold text-white">使用监控与反馈后台</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-400">
            保留上线后真正需要的监控后台：看用户活跃情况、功能使用频率、AI 调用质量和反馈处理，不再承担灵感广场或精选内容运营。
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/20 text-neutral-300 transition-colors hover:border-white/20 hover:text-white"
          aria-label="关闭管理员后台"
        >
          <X size={18} />
        </button>
      </div>

      {loading ? (
        <div className="flex min-h-[420px] items-center justify-center">
          <div className="inline-flex items-center gap-3 rounded-full border border-remuse-border bg-black/20 px-4 py-3 text-sm text-neutral-300">
            <Loader2 size={16} className="animate-spin text-remuse-accent" />
            正在加载后台概览...
          </div>
        </div>
      ) : (
        <div className="max-h-[calc(92vh-92px)] overflow-y-auto px-6 py-5">
          {(error || notice) && (
            <div className={`mb-5 rounded-2xl border px-4 py-3 text-sm ${
              error
                ? 'border-red-500/30 bg-red-500/10 text-red-200'
                : 'border-remuse-accent/25 bg-remuse-accent/10 text-remuse-accent'
            }`}
            >
              {error || notice}
            </div>
          )}
          {overview && (
            <div className="space-y-6">
              <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard label="7日总事件" value={overview.summary7d.totalEvents.toLocaleString()} helpText={`AI ${overview.summary7d.totalAiCalls} · 产品事件 ${overview.summary7d.totalProductEvents}`} icon={<Activity size={16} />} />
                <MetricCard label="7日活跃用户" value={overview.summary7d.activeUsers.toLocaleString()} helpText={`30日活跃 ${overview.summary30d.activeUsers}`} icon={<UserRound size={16} />} />
                <MetricCard label="AI 成功率" value={`${overview.summary7d.successRate}%`} helpText={overview.summary7d.avgDurationMs ? `平均 ${overview.summary7d.avgDurationMs}ms` : '暂无耗时数据'} icon={<CheckCircle2 size={16} />} />
                <MetricCard label="待处理反馈" value={overview.feedbackSummary.open.toLocaleString()} helpText={`处理中 ${overview.feedbackSummary.inReview} · 已关闭 ${overview.feedbackSummary.closed}`} icon={<MessageCircleWarning size={16} />} />
              </section>
              <section className="grid gap-4 xl:grid-cols-2">
                <ConversionCard title="近 7 日转化" summary={overview.conversion7d} />
                <ConversionCard title="近 30 日转化" summary={overview.conversion30d} />
              </section>
              <section className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
                <div className="space-y-6">
                  <section className="rounded-[28px] border border-remuse-border bg-remuse-panel p-5">
                    <SectionKicker icon={<Search size={14} />} label="User Search" />
                    <h4 className="mt-3 text-xl font-display font-bold text-white">用户搜索与风险处理</h4>
                    <p className="mt-2 text-sm leading-6 text-neutral-400">支持按邮箱、昵称或用户 ID 检索，并查看单用户明细、近期行为和人工标记状态。</p>
                    <form className="mt-5 flex flex-col gap-3 md:flex-row" onSubmit={(event) => { event.preventDefault(); void handleUserSearch(); }}>
                      <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="搜索邮箱 / 昵称 / 用户 ID" className={`${inputClassName} flex-1`} />
                      <button type="submit" disabled={searchingUsers} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-remuse-accent/30 bg-remuse-accent/10 px-5 py-3 text-sm font-semibold text-remuse-accent transition hover:border-remuse-accent/50 hover:bg-remuse-accent/15 disabled:cursor-not-allowed disabled:opacity-60">
                        {searchingUsers ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                        搜索用户
                      </button>
                    </form>
                    <div className="mt-5 grid gap-6 xl:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.2fr)]">
                      <div className="space-y-3">
                        <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-neutral-500">Search Result</p>
                        {searchQuery.trim() && searchResults.length === 0 && !searchingUsers ? <EmptyPanel text="暂无匹配用户，试试更完整的邮箱或昵称。" /> : searchResults.length === 0 ? <EmptyPanel text="输入关键词后可查看匹配用户。" /> : searchResults.map((user) => (
                          <UserActivityChip key={user.userId} user={user} onClick={() => void handleSelectUser(user.userId)} selected={selectedUserDetail?.user.userId === user.userId} />
                        ))}
                      </div>
                      <UserDetailPanel detail={selectedUserDetail} loading={loadingUserDetail} maxTrendValue={maxTrendValue} flagNoteDraft={flagNoteDraft} onFlagNoteChange={setFlagNoteDraft} onFlagChange={(status) => void handleUserFlagChange(status)} savingUserFlag={savingUserFlag} />
                    </div>
                  </section>
                  <section className="rounded-[28px] border border-remuse-border bg-remuse-panel p-5">
                    <SectionKicker icon={<BarChart3 size={14} />} label="Usage Trend" />
                    <h4 className="mt-3 text-xl font-display font-bold text-white">最近 7 / 30 天使用趋势</h4>
                    <div className="mt-5 grid gap-6 xl:grid-cols-2">
                      <TrendPanel title="最近 7 天" points={overview.trends7d} maxValue={maxTrendValue} />
                      <TrendPanel title="最近 30 天" points={overview.trends30d.slice(-10)} maxValue={maxTrendValue} />
                    </div>
                    <div className="mt-6 grid gap-4 md:grid-cols-2">
                      <UsageBreakdownPanel title="AI 功能分布" emptyText="最近 7 天暂无 AI 调用。" items={overview.aiScopes7d.map((item) => ({ id: item.scope, label: humanizeScope(item.scope), value: item.calls, meta: `成功 ${item.successCount} · ${item.avgDurationMs ? `${item.avgDurationMs}ms` : 'n/a'}` }))} />
                      <UsageBreakdownPanel title="产品行为分布" emptyText="最近 7 天暂无行为事件。" items={overview.productEvents7d.map((item) => ({ id: item.eventType, label: humanizeEventType(item.eventType), value: item.count, meta: '已记录到用户行为监控' }))} />
                    </div>
                  </section>
                </div>

                <div className="space-y-6">
                  <section className="rounded-[28px] border border-remuse-border bg-remuse-panel p-5">
                    <SectionKicker icon={<AlertTriangle size={14} />} label="Alerts" />
                    <h4 className="mt-3 text-xl font-display font-bold text-white">高频账号提醒</h4>
                    <p className="mt-2 text-sm leading-6 text-neutral-400">
                      默认标记最近 7 天总事件超过 20 次，或 AI 调用超过 10 次的账号，便于排查异常高频使用。
                    </p>
                    <div className="mt-4 space-y-3">
                      {overview.flaggedUsers.length === 0 ? <EmptyPanel text="最近 7 天没有触发高频阈值的账号。" /> : overview.flaggedUsers.map((user) => (
                        <UserActivityChip
                          key={user.userId}
                          user={user}
                          highlight
                          onClick={() => void handleSelectUser(user.userId)}
                          selected={selectedUserDetail?.user.userId === user.userId}
                        />
                      ))}
                    </div>
                  </section>
                  <section className="rounded-[28px] border border-remuse-border bg-remuse-panel p-5">
                    <SectionKicker icon={<Clock3 size={14} />} label="Recent" />
                    <h4 className="mt-3 text-xl font-display font-bold text-white">最近活跃用户</h4>
                    <div className="mt-4 space-y-3">
                      {overview.recentUsers.length === 0 ? <EmptyPanel text="暂时没有可展示的活跃用户。" /> : overview.recentUsers.map((user) => (
                        <UserActivityChip
                          key={user.userId}
                          user={user}
                          onClick={() => void handleSelectUser(user.userId)}
                          selected={selectedUserDetail?.user.userId === user.userId}
                        />
                      ))}
                    </div>
                  </section>
                </div>
              </section>

              <section className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                <div className="rounded-[28px] border border-remuse-border bg-remuse-panel p-5">
                  <SectionKicker icon={<RefreshCw size={14} />} label="Top Users" />
                  <h4 className="mt-3 text-xl font-display font-bold text-white">最近 7 天用户使用频率排行</h4>
                  <div className="mt-5 overflow-hidden rounded-2xl border border-white/8">
                    <div className="grid grid-cols-[minmax(0,1.6fr)_120px_90px_90px_90px_120px] gap-3 bg-black/30 px-4 py-3 text-[11px] font-mono uppercase tracking-[0.18em] text-neutral-500">
                      <span>用户</span>
                      <span>总事件</span>
                      <span>扫描</span>
                      <span>贴纸</span>
                      <span>记忆</span>
                      <span>最近活跃</span>
                    </div>
                    <div className="divide-y divide-white/6">
                      {overview.topUsers.length === 0 ? <EmptyRow text="最近 7 天暂无用户行为数据。" /> : overview.topUsers.map((user) => (
                        <button
                          key={user.userId}
                          type="button"
                          onClick={() => void handleSelectUser(user.userId)}
                          className={`grid w-full grid-cols-[minmax(0,1.6fr)_120px_90px_90px_90px_120px] gap-3 px-4 py-4 text-left text-sm text-neutral-200 transition ${
                            selectedUserDetail?.user.userId === user.userId ? 'bg-white/[0.05]' : 'hover:bg-white/[0.03]'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="truncate font-semibold text-white">{user.nickname || user.email || '匿名用户'}</p>
                              <FlagBadge status={user.flagStatus} />
                            </div>
                            <p className="truncate text-xs text-neutral-500">{user.email || (user.isGuest ? '游客会话' : user.userId)}</p>
                          </div>
                          <span>{user.totalEvents}</span>
                          <span>{user.scanCount}</span>
                          <span>{user.stickerCount}</span>
                          <span>{user.memoryQueryCount}</span>
                          <span className="text-xs text-neutral-500">{formatShortTime(user.lastSeen)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="rounded-[28px] border border-remuse-border bg-remuse-panel p-5">
                  <SectionKicker icon={<MessageCircleWarning size={14} />} label="Feedback" />
                  <h4 className="mt-3 text-xl font-display font-bold text-white">用户反馈队列</h4>
                  <div className="mt-5 space-y-3">
                    {overview.feedback.length === 0 ? <EmptyPanel text="暂时还没有新的用户反馈。" /> : overview.feedback.map((item) => (
                      <div key={item.id} className="rounded-2xl border border-white/8 bg-black/20 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-white">{item.nickname || item.email || '匿名用户'}</p>
                            <p className="mt-1 text-[11px] font-mono uppercase tracking-[0.18em] text-neutral-500">{item.type}</p>
                          </div>
                          <select
                            value={item.status}
                            onChange={(event) => void handleFeedbackStatusChange(item.id, event.target.value as FeedbackSubmission['status'])}
                            disabled={workingFeedbackId === item.id}
                            className={inputClassName}
                          >
                            <option value="open">open</option>
                            <option value="in_review">in_review</option>
                            <option value="closed">closed</option>
                          </select>
                        </div>
                        <p className="mt-3 text-sm leading-7 text-neutral-300">{item.message}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const inputClassName =
  'rounded-2xl border border-neutral-700 bg-black/20 px-4 py-3 text-sm text-white outline-none transition-colors focus:border-remuse-accent/50';

const MetricCard: React.FC<{
  label: string;
  value: string;
  helpText: string;
  icon: React.ReactNode;
}> = ({ label, value, helpText, icon }) => (
  <div className="rounded-[24px] border border-remuse-border bg-black/20 p-4">
    <div className="flex items-center justify-between">
      <p className="text-[11px] font-mono uppercase tracking-[0.28em] text-neutral-500">{label}</p>
      <div className="text-remuse-accent">{icon}</div>
    </div>
    <p className="mt-4 text-3xl font-display font-bold text-white">{value}</p>
    <p className="mt-2 text-xs leading-6 text-neutral-400">{helpText}</p>
  </div>
);

const ConversionCard: React.FC<{
  title: string;
  summary: AdminOverview['conversion7d'];
}> = ({ title, summary }) => (
  <div className="rounded-[28px] border border-remuse-border bg-remuse-panel p-5">
    <SectionKicker icon={<CheckCircle2 size={14} />} label="Conversion" />
    <div className="mt-3 flex items-start justify-between gap-4">
      <div>
        <h4 className="text-xl font-display font-bold text-white">{title}</h4>
        <p className="mt-2 text-sm leading-6 text-neutral-400">从注册、验证、登录到扫描 / 贴纸 / 记忆使用的基础转化概览。</p>
      </div>
      <div className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3 text-right">
        <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-neutral-500">Retention</p>
        <p className="mt-2 text-lg font-display font-bold text-white">D1 {summary.d1Retention}%</p>
        <p className="text-sm text-neutral-400">D7 {summary.d7Retention}%</p>
      </div>
    </div>
    <div className="mt-5 grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
      <MiniMetric label="注册" value={summary.registrations} />
      <MiniMetric label="验证邮箱" value={summary.verifiedUsers} />
      <MiniMetric label="登录" value={summary.loginUsers} />
      <MiniMetric label="扫描" value={summary.scanUsers} />
      <MiniMetric label="贴纸" value={summary.stickerUsers} />
      <MiniMetric label="记忆" value={summary.memoryUsers} />
    </div>
  </div>
);

const SectionKicker: React.FC<{ label: string; icon: React.ReactNode }> = ({ label, icon }) => (
  <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[11px] font-mono uppercase tracking-[0.24em] text-neutral-400">
    {icon}
    {label}
  </div>
);

const TrendPanel: React.FC<{
  title: string;
  points: AdminTrendPoint[];
  maxValue: number;
}> = ({ title, points, maxValue }) => (
  <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
    <p className="text-sm font-semibold text-white">{title}</p>
    <div className="mt-4 space-y-3">
      {points.length === 0 ? <EmptyPanel text="暂无趋势数据。" /> : points.map((point) => (
        <div key={point.dayKey}>
          <div className="mb-1 flex items-center justify-between text-xs text-neutral-500">
            <span>{formatDayKey(point.dayKey)}</span>
            <span>{point.totalEvents} 次事件 · {point.activeUsers} 活跃用户</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/6">
            <div
              className="h-full rounded-full bg-gradient-to-r from-remuse-accent via-cyan-300 to-white"
              style={{ width: `${Math.max(4, (point.totalEvents / maxValue) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  </div>
);

const UsageBreakdownPanel: React.FC<{
  title: string;
  items: Array<{ id: string; label: string; value: number; meta: string }>;
  emptyText: string;
}> = ({ title, items, emptyText }) => (
  <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
    <p className="text-sm font-semibold text-white">{title}</p>
    <div className="mt-4 space-y-3">
      {items.length === 0 ? <EmptyPanel text={emptyText} /> : items.map((item) => (
        <div key={item.id} className="rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-white">{item.label}</span>
            <span className="text-sm font-display font-bold text-remuse-accent">{item.value}</span>
          </div>
          <p className="mt-1 text-xs leading-6 text-neutral-500">{item.meta}</p>
        </div>
      ))}
    </div>
  </div>
);

const UserActivityChip: React.FC<{
  user: AdminUserActivity;
  highlight?: boolean;
  selected?: boolean;
  onClick?: () => void;
}> = ({ user, highlight = false, selected = false, onClick }) => {
  const wrapperClass = `w-full rounded-2xl border px-4 py-3 text-left transition ${
    selected
      ? 'border-remuse-accent/35 bg-remuse-accent/10'
      : highlight
        ? 'border-amber-300/20 bg-amber-300/10 hover:border-amber-300/35'
        : 'border-white/8 bg-black/20 hover:border-white/15'
  }`;

  const content = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold text-white">{user.nickname || user.email || '匿名用户'}</p>
          <FlagBadge status={user.flagStatus} />
        </div>
        <p className="truncate text-xs text-neutral-500">{user.email || (user.isGuest ? '游客会话' : user.userId)}</p>
      </div>
      <div className="text-right text-xs text-neutral-400">
        <p>{user.totalEvents} 次事件</p>
        <p>AI {user.aiCalls} · 扫描 {user.scanCount}</p>
      </div>
    </div>
  );

  if (!onClick) {
    return <div className={wrapperClass}>{content}</div>;
  }

  return (
    <button type="button" className={wrapperClass} onClick={onClick}>
      {content}
    </button>
  );
};

const UserDetailPanel: React.FC<{
  detail: AdminUserDetail | null;
  loading: boolean;
  maxTrendValue: number;
  flagNoteDraft: string;
  onFlagNoteChange: (value: string) => void;
  onFlagChange: (status: AdminUserFlagStatus) => void;
  savingUserFlag: boolean;
}> = ({
  detail,
  loading,
  maxTrendValue,
  flagNoteDraft,
  onFlagNoteChange,
  onFlagChange,
  savingUserFlag,
}) => (
  <div className="rounded-3xl border border-white/8 bg-black/20 p-5">
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-neutral-500">User Detail</p>
        <h5 className="mt-2 text-xl font-display font-bold text-white">单用户明细</h5>
      </div>
      {detail?.user.flagStatus && <FlagBadge status={detail.user.flagStatus} />}
    </div>

    {loading ? (
      <div className="mt-6 flex min-h-[220px] items-center justify-center">
        <Loader2 size={20} className="animate-spin text-remuse-accent" />
      </div>
    ) : !detail ? (
      <div className="mt-6">
        <EmptyPanel text="从左侧搜索结果、活跃用户或高频账号中选择一个用户以查看明细。" />
      </div>
    ) : (
      <div className="mt-5 space-y-5">
        <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold text-white">{detail.user.nickname || detail.user.email || '匿名用户'}</p>
              <p className="mt-1 truncate text-sm text-neutral-400">{detail.user.email || detail.user.userId}</p>
            </div>
            <div className="text-right text-xs text-neutral-400">
              <p>{detail.user.isGuest ? '游客账号' : '正式账号'}</p>
              <p>最近活跃 {formatShortTime(detail.user.lastSeen)}</p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MiniMetric label="总事件" value={detail.user.totalEvents} />
            <MiniMetric label="扫描" value={detail.user.scanCount} />
            <MiniMetric label="贴纸" value={detail.user.stickerCount} />
            <MiniMetric label="记忆" value={detail.user.memoryQueryCount} />
          </div>
        </div>

        <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">风险标记</p>
              <p className="mt-1 text-xs leading-6 text-neutral-500">
                `watch` 用于人工关注，`restricted` 会立即限制该用户使用 AI 与记忆接口。
              </p>
            </div>
            <div className="inline-flex flex-wrap gap-2">
              <FlagActionButton label="标记观察" active={detail.user.flagStatus === 'watch'} onClick={() => onFlagChange('watch')} disabled={savingUserFlag} />
              <FlagActionButton label="限制使用" active={detail.user.flagStatus === 'restricted'} onClick={() => onFlagChange('restricted')} disabled={savingUserFlag} />
              <FlagActionButton label="清除标记" active={!detail.user.flagStatus || detail.user.flagStatus === 'cleared'} onClick={() => onFlagChange('cleared')} disabled={savingUserFlag} />
            </div>
          </div>

          <textarea
            value={flagNoteDraft}
            onChange={(event) => onFlagNoteChange(event.target.value)}
            placeholder="补充标记原因、观察结论或跟进动作。"
            className={`${inputClassName} mt-4 min-h-[110px] w-full resize-y`}
          />
        </div>

        <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
          <p className="text-sm font-semibold text-white">近 14 日事件趋势</p>
          <div className="mt-4">
            <TrendPanel title="单用户趋势" points={detail.trends14d} maxValue={maxTrendValue} />
          </div>
        </div>

        <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
          <p className="text-sm font-semibold text-white">近期事件明细</p>
          <div className="mt-4 space-y-3">
            {detail.recentEvents.length === 0 ? <EmptyPanel text="最近没有可展示的事件记录。" /> : detail.recentEvents.slice(0, 12).map((event) => (
              <div key={event.id} className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-white">{humanizeEventType(event.name)}</p>
                    <p className="mt-1 text-xs text-neutral-500">{formatEventMeta(event)}</p>
                  </div>
                  <div className="text-right text-xs text-neutral-400">
                    <p>{event.source.toUpperCase()}</p>
                    <p>{formatShortTime(event.createdAt)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )}
  </div>
);

const FlagActionButton: React.FC<{
  label: string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
}> = ({ label, active, onClick, disabled = false }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={`rounded-2xl border px-4 py-2 text-sm font-semibold transition ${
      active
        ? 'border-remuse-accent/45 bg-remuse-accent/12 text-remuse-accent'
        : 'border-white/10 bg-black/20 text-neutral-300 hover:border-white/20 hover:text-white'
    } disabled:cursor-not-allowed disabled:opacity-60`}
  >
    {label}
  </button>
);

const FlagBadge: React.FC<{ status: AdminUserFlagStatus | null }> = ({ status }) => {
  if (!status || status === 'cleared') {
    return null;
  }

  const styles = status === 'restricted'
    ? 'border-red-500/25 bg-red-500/10 text-red-200'
    : 'border-amber-300/25 bg-amber-300/10 text-amber-100';

  const label = status === 'restricted' ? 'restricted' : 'watch';

  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-1 text-[10px] font-mono uppercase tracking-[0.16em] ${styles}`}>
      {label}
    </span>
  );
};

const MiniMetric: React.FC<{ label: string; value: number | string }> = ({ label, value }) => (
  <div className="rounded-2xl border border-white/8 bg-black/20 px-3 py-3">
    <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-neutral-500">{label}</p>
    <p className="mt-2 text-xl font-display font-bold text-white">{value}</p>
  </div>
);

const EmptyPanel: React.FC<{ text: string }> = ({ text }) => (
  <div className="rounded-2xl border border-dashed border-white/8 bg-black/20 px-4 py-8 text-center text-sm text-neutral-500">
    {text}
  </div>
);

const EmptyRow: React.FC<{ text: string }> = ({ text }) => (
  <div className="px-4 py-8 text-center text-sm text-neutral-500">{text}</div>
);

function humanizeScope(scope: string) {
  if (scope === 'gemini-proxy') return '扫描 / 贴纸 AI';
  if (scope === 'memory-query') return '记忆检索 AI';
  return scope;
}

function humanizeEventType(eventType: string) {
  switch (eventType) {
    case 'guest_bootstrap':
      return '游客进入';
    case 'register_success':
      return '注册成功';
    case 'login_success':
      return '登录成功';
    case 'session_refresh':
      return '会话续期';
    case 'email_verify_success':
      return '邮箱验证成功';
    case 'scan_archive':
      return '扫描建档';
    case 'sticker_generate':
      return '贴纸生成';
    case 'emoji_pack_generate':
      return '表情包生成';
    case 'memory_thread_create':
      return '创建记忆线程';
    case 'memory_query':
      return '记忆检索';
    case 'gemini-proxy':
      return 'AI 生成调用';
    case 'memory-query':
      return '记忆 AI 调用';
    default:
      return eventType;
  }
}

function formatDayKey(dayKey: string) {
  const date = new Date(`${dayKey}T00:00:00Z`);
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
}

function formatShortTime(value: string | null) {
  if (!value) {
    return '暂无';
  }
  const date = new Date(value);
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function formatEventMeta(event: AdminUserDetail['recentEvents'][number]) {
  const meta: string[] = [];

  if (event.success !== null) {
    meta.push(event.success ? '成功' : '失败');
  }
  if (event.durationMs) {
    meta.push(`${event.durationMs}ms`);
  }
  if (event.model) {
    meta.push(event.model);
  }

  return meta.join(' · ') || '已记录到审计日志';
}

function summarizeFeedback(feedback: FeedbackSubmission[]) {
  return feedback.reduce(
    (summary, item) => {
      if (item.status === 'in_review') {
        summary.inReview += 1;
      } else if (item.status === 'closed') {
        summary.closed += 1;
      } else {
        summary.open += 1;
      }
      return summary;
    },
    { open: 0, inReview: 0, closed: 0 },
  );
}

export default AdminConsole;
