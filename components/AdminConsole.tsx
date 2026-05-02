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
  onClose?: () => void;
  standalone?: boolean;
}

const inputClassName =
  'rounded-2xl border border-neutral-700 bg-black/20 px-4 py-3 text-sm text-white outline-none transition-colors focus:border-remuse-accent/50';

const AdminConsole: React.FC<AdminConsoleProps> = ({ onClose, standalone = false }) => {
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
    setError(null);

    try {
      setOverview(await fetchAdminOverview());
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

  const aiTotals7d = useMemo(() => buildAiTotals(overview?.aiScopes7d || []), [overview?.aiScopes7d]);
  const aiTotals30d = useMemo(() => buildAiTotals(overview?.aiScopes30d || []), [overview?.aiScopes30d]);

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
    <div className={`relative overflow-hidden border border-white/10 bg-[#101214]/95 shadow-[0_30px_100px_rgba(0,0,0,0.55)] ${
      standalone ? 'min-h-[calc(100dvh-220px)] rounded-[28px]' : 'max-h-[92vh] rounded-[32px]'
    }`}
    >
      <div className="flex items-start justify-between gap-4 border-b border-remuse-border px-6 py-5">
        <div>
          <SectionKicker icon={<Shield size={14} />} label="Admin Monitor" />
          <h3 className="mt-3 text-2xl font-display font-bold text-white">使用监控与反馈后台</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-400">
            查看用户规模、活跃频率、AI 调用、模型消耗、异常账号和反馈处理。管理员后台独立于普通用户工作区。
          </p>
        </div>
        {!standalone && onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/20 text-neutral-300 transition-colors hover:border-white/20 hover:text-white"
            aria-label="关闭管理员后台"
          >
            <X size={18} />
          </button>
        ) : null}
      </div>

      {loading ? (
        <LoadingState />
      ) : (
        <div className={`${standalone ? 'max-h-[calc(100dvh-312px)]' : 'max-h-[calc(92vh-92px)]'} overflow-y-auto px-6 py-5`}>
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

          {overview ? (
            <div className="space-y-6">
              <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard label="总用户数" value={overview.userVolume.totalUsers.toLocaleString()} helpText={`正式 ${overview.userVolume.registeredUsers} / 游客 ${overview.userVolume.guestUsers}`} icon={<UserRound size={16} />} />
                <MetricCard label="已验证用户" value={overview.userVolume.verifiedUsers.toLocaleString()} helpText={`管理员 ${overview.userVolume.adminUsers} 个`} icon={<Shield size={16} />} />
                <MetricCard label="7 日 AI 调用" value={overview.summary7d.totalAiCalls.toLocaleString()} helpText={`成功率 ${overview.summary7d.successRate}% / 平均 ${overview.summary7d.avgDurationMs || 0}ms`} icon={<CheckCircle2 size={16} />} />
                <MetricCard label="7 日 Token 消耗" value={formatTokenCount(aiTotals7d.displayTokens)} helpText={aiTotals7d.hasExact ? '上游返回 token 统计' : '按模型类型估算，后续会自动优先使用真实 token'} icon={<BarChart3 size={16} />} />
              </section>

              <section className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                <UserVolumeCard overview={overview} />
                <ModelUsageCard overview={overview} totals7d={aiTotals7d} totals30d={aiTotals30d} />
              </section>

              <section className="grid gap-4 xl:grid-cols-2">
                <ConversionCard title="近 7 日转化" summary={overview.conversion7d} />
                <ConversionCard title="近 30 日转化" summary={overview.conversion30d} />
              </section>

              <section className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
                <div className="space-y-6">
                  <UserSearchPanel
                    searchQuery={searchQuery}
                    onSearchQueryChange={setSearchQuery}
                    searchingUsers={searchingUsers}
                    searchResults={searchResults}
                    selectedUserId={selectedUserDetail?.user.userId || null}
                    onSearch={() => void handleUserSearch()}
                    onSelectUser={(userId) => void handleSelectUser(userId)}
                  />
                  <section className="rounded-[28px] border border-remuse-border bg-remuse-panel p-5">
                    <SectionKicker icon={<BarChart3 size={14} />} label="Usage Trend" />
                    <h4 className="mt-3 text-xl font-display font-bold text-white">最近使用趋势</h4>
                    <div className="mt-5 grid gap-6 xl:grid-cols-2">
                      <TrendPanel title="近 7 天" points={overview.trends7d} maxValue={maxTrendValue} />
                      <TrendPanel title="近 30 天" points={overview.trends30d.slice(-10)} maxValue={maxTrendValue} />
                    </div>
                    <div className="mt-6 grid gap-4 md:grid-cols-2">
                      <UsageBreakdownPanel title="AI 调用分布" emptyText="近 7 天暂无 AI 调用。" items={overview.aiScopes7d.map((item) => ({
                        id: item.scope,
                        label: humanizeScope(item.scope),
                        value: item.calls,
                        meta: `成功 ${item.successCount} / ${item.avgDurationMs ? `${item.avgDurationMs}ms` : '暂无耗时'} / ${formatTokenCount(item.totalTokens || item.estimatedTokens)} token`,
                      }))}
                      />
                      <UsageBreakdownPanel title="产品行为分布" emptyText="近 7 天暂无行为事件。" items={overview.productEvents7d.map((item) => ({
                        id: item.eventType,
                        label: humanizeEventType(item.eventType),
                        value: item.count,
                        meta: '已记录到用户行为监控',
                      }))}
                      />
                    </div>
                  </section>
                </div>

                <div className="space-y-6">
                  <UserDetailPanel
                    detail={selectedUserDetail}
                    loading={loadingUserDetail}
                    maxTrendValue={maxTrendValue}
                    flagNoteDraft={flagNoteDraft}
                    onFlagNoteChange={setFlagNoteDraft}
                    onFlagChange={(status) => void handleUserFlagChange(status)}
                    savingUserFlag={savingUserFlag}
                  />
                  <UserListPanel
                    title="高频账号提醒"
                    icon={<AlertTriangle size={14} />}
                    emptyText="近 7 天没有触发高频阈值的账号。"
                    users={overview.flaggedUsers}
                    selectedUserId={selectedUserDetail?.user.userId || null}
                    onSelectUser={(userId) => void handleSelectUser(userId)}
                  />
                  <UserListPanel
                    title="最近活跃用户"
                    icon={<Clock3 size={14} />}
                    emptyText="暂时没有可展示的活跃用户。"
                    users={overview.recentUsers}
                    selectedUserId={selectedUserDetail?.user.userId || null}
                    onSelectUser={(userId) => void handleSelectUser(userId)}
                  />
                </div>
              </section>

              <section className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                <TopUsersTable overview={overview} selectedUserId={selectedUserDetail?.user.userId || null} onSelectUser={(userId) => void handleSelectUser(userId)} />
                <FeedbackPanel overview={overview} workingFeedbackId={workingFeedbackId} onStatusChange={(id, status) => void handleFeedbackStatusChange(id, status)} />
              </section>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};

function buildAiTotals(items: AdminOverview['aiScopes7d']) {
  const exactTokens = items.reduce((sum, item) => sum + (item.totalTokens || 0), 0);
  const estimatedTokens = items.reduce((sum, item) => sum + (item.estimatedTokens || 0), 0);
  return {
    calls: items.reduce((sum, item) => sum + item.calls, 0),
    exactTokens,
    estimatedTokens,
    displayTokens: exactTokens || estimatedTokens,
    hasExact: exactTokens > 0,
  };
}

const LoadingState = () => (
  <div className="flex min-h-[420px] items-center justify-center">
    <div className="inline-flex items-center gap-3 rounded-full border border-remuse-border bg-black/20 px-4 py-3 text-sm text-neutral-300">
      <Loader2 size={16} className="animate-spin text-remuse-accent" />
      正在加载后台概览...
    </div>
  </div>
);

const MetricCard: React.FC<{
  label: string;
  value: string;
  helpText: string;
  icon: React.ReactNode;
}> = ({ label, value, helpText, icon }) => (
  <div className="rounded-[24px] border border-remuse-border bg-black/20 p-4">
    <div className="flex items-center justify-between">
      <p className="text-[11px] font-mono uppercase tracking-[0.22em] text-neutral-500">{label}</p>
      <div className="text-remuse-accent">{icon}</div>
    </div>
    <p className="mt-4 text-3xl font-display font-bold text-white">{value}</p>
    <p className="mt-2 text-xs leading-6 text-neutral-400">{helpText}</p>
  </div>
);

const UserVolumeCard: React.FC<{ overview: AdminOverview }> = ({ overview }) => (
  <section className="rounded-[28px] border border-remuse-border bg-remuse-panel p-5">
    <SectionKicker icon={<UserRound size={14} />} label="User Volume" />
    <h4 className="mt-3 text-xl font-display font-bold text-white">用户规模</h4>
    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <MiniMetric label="总用户" value={overview.userVolume.totalUsers} />
      <MiniMetric label="正式账号" value={overview.userVolume.registeredUsers} />
      <MiniMetric label="游客账号" value={overview.userVolume.guestUsers} />
      <MiniMetric label="邮箱已验证" value={overview.userVolume.verifiedUsers} />
      <MiniMetric label="管理员" value={overview.userVolume.adminUsers} />
    </div>
    <p className="mt-4 text-xs leading-6 text-neutral-500">该模块直接来自线上数据库 users 表，适合现场展示用户量截图。</p>
  </section>
);

const ModelUsageCard: React.FC<{
  overview: AdminOverview;
  totals7d: ReturnType<typeof buildAiTotals>;
  totals30d: ReturnType<typeof buildAiTotals>;
}> = ({ overview, totals7d, totals30d }) => (
  <section className="rounded-[28px] border border-remuse-border bg-remuse-panel p-5">
    <SectionKicker icon={<BarChart3 size={14} />} label="Model Cost" />
    <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h4 className="text-xl font-display font-bold text-white">模型调用与 Token 消耗</h4>
        <p className="mt-2 text-sm leading-6 text-neutral-400">按 StepFun 文本、StepFun 视觉、Gemini 生图拆分展示。</p>
      </div>
      <div className="rounded-2xl border border-remuse-accent/25 bg-remuse-accent/10 px-4 py-3 text-right">
        <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-remuse-accent">30 天估算</p>
        <p className="mt-2 text-2xl font-display font-bold text-white">{formatTokenCount(totals30d.displayTokens)}</p>
      </div>
    </div>
    <div className="mt-5 grid gap-3 md:grid-cols-3">
      {overview.aiScopes7d.length === 0 ? (
        <EmptyPanel text="近 7 天暂无模型调用。" />
      ) : overview.aiScopes7d.map((item) => (
        <div key={item.scope} className="rounded-2xl border border-white/8 bg-black/20 p-4">
          <p className="text-sm font-semibold text-white">{humanizeScope(item.scope)}</p>
          <p className="mt-3 text-2xl font-display font-bold text-remuse-accent">{item.calls}</p>
          <p className="mt-1 text-xs text-neutral-500">调用次数</p>
          <div className="mt-3 border-t border-white/8 pt-3 text-xs leading-6 text-neutral-400">
            <p>成功 {item.successCount}</p>
            <p>Token {formatTokenCount(item.totalTokens || item.estimatedTokens)}</p>
            <p>{item.totalTokens ? '真实统计' : '估算统计'}</p>
          </div>
        </div>
      ))}
    </div>
    <div className="mt-4 grid gap-3 sm:grid-cols-3">
      <MiniMetric label="7 日调用" value={totals7d.calls} />
      <MiniMetric label="7 日 Token" value={formatTokenCount(totals7d.displayTokens)} />
      <MiniMetric label="30 日 Token" value={formatTokenCount(totals30d.displayTokens)} />
    </div>
  </section>
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
        <p className="mt-2 text-sm leading-6 text-neutral-400">注册、验证、登录到扫描 / 贴纸 / 记忆使用的基础转化概览。</p>
      </div>
      <div className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3 text-right">
        <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-neutral-500">Retention</p>
        <p className="mt-2 text-lg font-display font-bold text-white">D1 {summary.d1Retention}%</p>
        <p className="text-sm text-neutral-400">D7 {summary.d7Retention}%</p>
      </div>
    </div>
    <div className="mt-5 grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
      <MiniMetric label="注册" value={summary.registrations} />
      <MiniMetric label="邮箱验证" value={summary.verifiedUsers} />
      <MiniMetric label="登录" value={summary.loginUsers} />
      <MiniMetric label="扫描" value={summary.scanUsers} />
      <MiniMetric label="贴纸" value={summary.stickerUsers} />
      <MiniMetric label="记忆" value={summary.memoryUsers} />
    </div>
  </div>
);

const UserSearchPanel: React.FC<{
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  searchingUsers: boolean;
  searchResults: AdminUserActivity[];
  selectedUserId: string | null;
  onSearch: () => void;
  onSelectUser: (userId: string) => void;
}> = ({ searchQuery, onSearchQueryChange, searchingUsers, searchResults, selectedUserId, onSearch, onSelectUser }) => (
  <section className="rounded-[28px] border border-remuse-border bg-remuse-panel p-5">
    <SectionKicker icon={<Search size={14} />} label="User Search" />
    <h4 className="mt-3 text-xl font-display font-bold text-white">用户搜索与风险处理</h4>
    <form className="mt-5 flex flex-col gap-3 md:flex-row" onSubmit={(event) => { event.preventDefault(); onSearch(); }}>
      <input value={searchQuery} onChange={(event) => onSearchQueryChange(event.target.value)} placeholder="搜索邮箱 / 昵称 / 用户 ID" className={`${inputClassName} flex-1`} />
      <button type="submit" disabled={searchingUsers} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-remuse-accent/30 bg-remuse-accent/10 px-5 py-3 text-sm font-semibold text-remuse-accent transition hover:border-remuse-accent/50 hover:bg-remuse-accent/15 disabled:cursor-not-allowed disabled:opacity-60">
        {searchingUsers ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
        搜索用户
      </button>
    </form>
    <div className="mt-5 space-y-3">
      {searchQuery.trim() && searchResults.length === 0 && !searchingUsers ? (
        <EmptyPanel text="暂无匹配用户。" />
      ) : searchResults.length === 0 ? (
        <EmptyPanel text="输入关键词后可查看匹配用户。" />
      ) : searchResults.map((user) => (
        <UserActivityChip key={user.userId} user={user} onClick={() => onSelectUser(user.userId)} selected={selectedUserId === user.userId} />
      ))}
    </div>
  </section>
);

const TopUsersTable: React.FC<{
  overview: AdminOverview;
  selectedUserId: string | null;
  onSelectUser: (userId: string) => void;
}> = ({ overview, selectedUserId, onSelectUser }) => (
  <section className="rounded-[28px] border border-remuse-border bg-remuse-panel p-5">
    <SectionKicker icon={<RefreshCw size={14} />} label="Top Users" />
    <h4 className="mt-3 text-xl font-display font-bold text-white">近 7 天用户使用频率排行</h4>
    <div className="mt-5 overflow-hidden rounded-2xl border border-white/8">
      <div className="grid grid-cols-[minmax(0,1.6fr)_90px_80px_80px_80px_110px] gap-3 bg-black/30 px-4 py-3 text-[11px] font-mono uppercase tracking-[0.14em] text-neutral-500">
        <span>用户</span>
        <span>总事件</span>
        <span>扫描</span>
        <span>贴纸</span>
        <span>记忆</span>
        <span>最近活跃</span>
      </div>
      <div className="divide-y divide-white/6">
        {overview.topUsers.length === 0 ? <EmptyRow text="近 7 天暂无用户行为数据。" /> : overview.topUsers.map((user) => (
          <button
            key={user.userId}
            type="button"
            onClick={() => onSelectUser(user.userId)}
            className={`grid w-full grid-cols-[minmax(0,1.6fr)_90px_80px_80px_80px_110px] gap-3 px-4 py-4 text-left text-sm text-neutral-200 transition ${
              selectedUserId === user.userId ? 'bg-white/[0.05]' : 'hover:bg-white/[0.03]'
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
  </section>
);

const FeedbackPanel: React.FC<{
  overview: AdminOverview;
  workingFeedbackId: string | null;
  onStatusChange: (id: string, status: FeedbackSubmission['status']) => void;
}> = ({ overview, workingFeedbackId, onStatusChange }) => (
  <section className="rounded-[28px] border border-remuse-border bg-remuse-panel p-5">
    <SectionKicker icon={<MessageCircleWarning size={14} />} label="Feedback" />
    <h4 className="mt-3 text-xl font-display font-bold text-white">用户反馈队列</h4>
    <div className="mt-5 space-y-3">
      {overview.feedback.length === 0 ? <EmptyPanel text="暂时还没有新的用户反馈。" /> : overview.feedback.map((item) => (
        <div key={item.id} className="rounded-2xl border border-white/8 bg-black/20 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white">{item.nickname || item.email || '匿名用户'}</p>
              <p className="mt-1 text-[11px] font-mono uppercase tracking-[0.18em] text-neutral-500">{humanizeFeedbackType(item.type)}</p>
            </div>
            <select
              value={item.status}
              onChange={(event) => onStatusChange(item.id, event.target.value as FeedbackSubmission['status'])}
              disabled={workingFeedbackId === item.id}
              className={inputClassName}
            >
              <option value="open">待处理</option>
              <option value="in_review">处理中</option>
              <option value="closed">已关闭</option>
            </select>
          </div>
          <p className="mt-3 text-sm leading-7 text-neutral-300">{item.message}</p>
        </div>
      ))}
    </div>
  </section>
);

const UserListPanel: React.FC<{
  title: string;
  icon: React.ReactNode;
  emptyText: string;
  users: AdminUserActivity[];
  selectedUserId: string | null;
  onSelectUser: (userId: string) => void;
}> = ({ title, icon, emptyText, users, selectedUserId, onSelectUser }) => (
  <section className="rounded-[28px] border border-remuse-border bg-remuse-panel p-5">
    <SectionKicker icon={icon} label="Users" />
    <h4 className="mt-3 text-xl font-display font-bold text-white">{title}</h4>
    <div className="mt-4 space-y-3">
      {users.length === 0 ? <EmptyPanel text={emptyText} /> : users.map((user) => (
        <UserActivityChip key={user.userId} user={user} highlight={title.includes('高频')} onClick={() => onSelectUser(user.userId)} selected={selectedUserId === user.userId} />
      ))}
    </div>
  </section>
);

const UserDetailPanel: React.FC<{
  detail: AdminUserDetail | null;
  loading: boolean;
  maxTrendValue: number;
  flagNoteDraft: string;
  onFlagNoteChange: (value: string) => void;
  onFlagChange: (status: AdminUserFlagStatus) => void;
  savingUserFlag: boolean;
}> = ({ detail, loading, maxTrendValue, flagNoteDraft, onFlagNoteChange, onFlagChange, savingUserFlag }) => (
  <div className="rounded-[28px] border border-remuse-border bg-remuse-panel p-5">
    <div className="flex items-start justify-between gap-4">
      <div>
        <SectionKicker icon={<UserRound size={14} />} label="User Detail" />
        <h5 className="mt-3 text-xl font-display font-bold text-white">单用户明细</h5>
      </div>
      {detail?.user.flagStatus ? <FlagBadge status={detail.user.flagStatus} /> : null}
    </div>

    {loading ? (
      <div className="mt-6 flex min-h-[220px] items-center justify-center">
        <Loader2 size={20} className="animate-spin text-remuse-accent" />
      </div>
    ) : !detail ? (
      <div className="mt-6">
        <EmptyPanel text="从搜索结果、活跃用户或高频账号中选择一个用户查看明细。" />
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
            <MiniMetric label="StepFun 文本" value={detail.user.stepfunTextCalls} />
            <MiniMetric label="StepFun 视觉" value={detail.user.stepfunVisionCalls} />
            <MiniMetric label="Gemini 生图" value={detail.user.geminiImageCalls} />
          </div>
        </div>

        <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
          <p className="text-sm font-semibold text-white">风险标记</p>
          <textarea
            value={flagNoteDraft}
            onChange={(event) => onFlagNoteChange(event.target.value)}
            placeholder="补充标记原因、观察结论或跟进动作。"
            className={`${inputClassName} mt-4 min-h-[96px] w-full resize-y`}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <FlagActionButton label="标记观察" active={detail.user.flagStatus === 'watch'} onClick={() => onFlagChange('watch')} disabled={savingUserFlag} />
            <FlagActionButton label="限制使用" active={detail.user.flagStatus === 'restricted'} onClick={() => onFlagChange('restricted')} disabled={savingUserFlag} />
            <FlagActionButton label="清除标记" active={!detail.user.flagStatus || detail.user.flagStatus === 'cleared'} onClick={() => onFlagChange('cleared')} disabled={savingUserFlag} />
          </div>
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
                    <p>{event.source === 'ai' ? 'AI' : '产品'}</p>
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

const SectionKicker: React.FC<{ label: string; icon: React.ReactNode }> = ({ label, icon }) => (
  <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[11px] font-mono uppercase tracking-[0.22em] text-neutral-400">
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
            <span>{point.totalEvents} 次事件 / {point.activeUsers} 活跃用户</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/6">
            <div className="h-full rounded-full bg-gradient-to-r from-remuse-accent via-cyan-300 to-white" style={{ width: `${Math.max(4, (point.totalEvents / maxValue) * 100)}%` }} />
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
        <p>AI {user.aiCalls} / 扫描 {user.scanCount}</p>
      </div>
    </div>
  );

  return onClick ? <button type="button" className={wrapperClass} onClick={onClick}>{content}</button> : <div className={wrapperClass}>{content}</div>;
};

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
        ? 'border-remuse-accent/45 bg-remuse-accent/10 text-remuse-accent'
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
  const label = status === 'restricted' ? '限制中' : '观察中';

  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-1 text-[10px] font-mono uppercase tracking-[0.12em] ${styles}`}>
      {label}
    </span>
  );
};

const MiniMetric: React.FC<{ label: string; value: number | string }> = ({ label, value }) => (
  <div className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
    <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-neutral-500">{label}</p>
    <p className="mt-2 text-xl font-display font-bold text-white">{typeof value === 'number' ? value.toLocaleString() : value}</p>
  </div>
);

const EmptyPanel: React.FC<{ text: string }> = ({ text }) => (
  <div className="rounded-2xl border border-dashed border-white/10 bg-black/10 px-4 py-5 text-sm text-neutral-500">{text}</div>
);

const EmptyRow: React.FC<{ text: string }> = ({ text }) => (
  <div className="px-4 py-5 text-sm text-neutral-500">{text}</div>
);

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

function humanizeScope(scope: string) {
  switch (scope) {
    case 'stepfun-text':
      return 'StepFun 文本';
    case 'stepfun-vision':
      return 'StepFun 视觉';
    case 'gemini-image':
      return 'Gemini 生图';
    default:
      return scope;
  }
}

function humanizeEventType(eventType: string) {
  const map: Record<string, string> = {
    guest_bootstrap: '游客启动',
    register_success: '注册成功',
    email_verify_success: '邮箱验证',
    login_success: '登录成功',
    session_refresh: '会话刷新',
    scan_archive: '扫描归档',
    collection_cover_generate: '生成展馆封面',
    sticker_generate: '贴纸生成',
    emoji_pack_generate: '表情包生成',
    perler_pattern_generate: '拼豆图纸生成',
    guide_generate: '改造指南生成',
    memory_thread_create: '记忆会话创建',
    memory_query: '记忆对话',
    'stepfun-text': 'StepFun 文本',
    'stepfun-vision': 'StepFun 视觉',
    'gemini-image': 'Gemini 生图',
  };
  return map[eventType] || eventType;
}

function humanizeFeedbackType(type: FeedbackSubmission['type']) {
  const map: Record<FeedbackSubmission['type'], string> = {
    bug: '问题反馈',
    feature: '功能建议',
    support: '支持咨询',
    other: '其他',
  };
  return map[type];
}

function formatShortTime(value: string | null) {
  if (!value) {
    return '暂无';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDayKey(dayKey: string) {
  return dayKey.slice(5);
}

function formatTokenCount(value: number) {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 10_000) {
    return `${(value / 1000).toFixed(1)}K`;
  }
  return value.toLocaleString();
}

function formatEventMeta(event: AdminUserDetail['recentEvents'][number]) {
  const parts = [
    event.model ? `模型 ${event.model}` : null,
    event.durationMs ? `${event.durationMs}ms` : null,
    event.success === null ? null : event.success ? '成功' : '失败',
  ].filter(Boolean);
  return parts.length ? parts.join(' / ') : '产品行为事件';
}

export default AdminConsole;
