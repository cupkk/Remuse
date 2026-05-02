import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  ArrowLeft,
  CalendarClock,
  ChevronDown,
  Clipboard,
  Edit3,
  Heart,
  Image as ImageIcon,
  Lock,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import {
  CreateSharedMuseumInput,
  SharedMuseumDetail,
  SharedMuseumItem,
  SharedMuseumMonthlyReport,
  SharedMuseumMonthlyReportSnapshot,
  SharedMuseumSummary,
} from '../types';

interface SharedMuseumHubProps {
  currentUserId: string | null;
  museums: SharedMuseumSummary[];
  activeMuseum: SharedMuseumDetail | null;
  onOpenMuseum: (museumId: string) => Promise<void> | void;
  onBackToList: () => void;
  onCreateMuseum: (input: CreateSharedMuseumInput) => Promise<void> | void;
  onJoinMuseum: (inviteCode: string) => Promise<void> | void;
  onUpdateMuseumSettings: (
    museumId: string,
    updates: {
      anniversaryDate?: string;
      quietMode?: boolean;
    },
  ) => Promise<void> | void;
  onResetInvite: (museumId: string) => Promise<void> | void;
  onRevokeInvite: (museumId: string) => Promise<void> | void;
  onLeaveMuseum: (museumId: string, museumName: string) => Promise<void> | void;
  onChangeMuseumStatus: (museumId: string, status: 'archived' | 'ended') => Promise<void> | void;
  onUpdateMuseumItem: (
    museumId: string,
    itemId: string,
    updates: {
      sharedNote?: string;
      relationLabel?: string;
    },
  ) => Promise<void> | void;
  onRemoveMuseumItem: (
    museumId: string,
    itemId: string,
    itemName: string,
  ) => Promise<void> | void;
  onSaveMonthlyReport: (
    museumId: string,
    snapshot: SharedMuseumMonthlyReportSnapshot,
  ) => Promise<void> | void;
}

type MonthlyReviewSnapshot = SharedMuseumMonthlyReportSnapshot;

const countTopValues = (values: string[], limit: number) =>
  Array.from(
    values
      .filter((value) => value.trim())
      .reduce((acc, value) => {
        acc.set(value, (acc.get(value) || 0) + 1);
        return acc;
      }, new Map<string, number>())
      .entries(),
  )
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([value]) => value);

const SHARED_MUSEUM_THEME_OPTIONS = [
  {
    value: 'shared-memory',
    label: '共享记忆',
    description: '适合共同收藏与纪念物。',
    badgeClassName: 'border-cyan-300/30 bg-cyan-300/10 text-cyan-200',
    dotClassName: 'bg-cyan-300',
  },
  {
    value: 'soft-romance',
    label: '柔软恋人',
    description: '适合礼物、约会与书信。',
    badgeClassName: 'border-pink-300/30 bg-pink-300/10 text-pink-200',
    dotClassName: 'bg-pink-300',
  },
  {
    value: 'city-walk',
    label: '城市轨迹',
    description: '适合通勤、旅行与街区探索。',
    badgeClassName: 'border-amber-300/30 bg-amber-300/10 text-amber-100',
    dotClassName: 'bg-amber-300',
  },
  {
    value: 'home-routine',
    label: '家与日常',
    description: '适合日常陪伴与生活物件。',
    badgeClassName: 'border-lime-300/30 bg-lime-300/10 text-lime-100',
    dotClassName: 'bg-lime-300',
  },
] as const;

const SharedMuseumHub: React.FC<SharedMuseumHubProps> = ({
  currentUserId,
  museums,
  activeMuseum,
  onOpenMuseum,
  onBackToList,
  onCreateMuseum,
  onJoinMuseum,
  onUpdateMuseumSettings,
  onResetInvite,
  onRevokeInvite,
  onLeaveMuseum,
  onChangeMuseumStatus,
  onUpdateMuseumItem,
  onRemoveMuseumItem,
  onSaveMonthlyReport,
}) => {
  const [createName, setCreateName] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createAnniversaryDate, setCreateAnniversaryDate] = useState('');
  const [createTheme, setCreateTheme] = useState('shared-memory');
  const [isCreateThemeMenuOpen, setIsCreateThemeMenuOpen] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copiedInviteCode, setCopiedInviteCode] = useState<string | null>(null);

  const [activePanel, setActivePanel] = useState<'items' | 'monthly-review'>('items');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editSharedNote, setEditSharedNote] = useState('');
  const [editRelationLabel, setEditRelationLabel] = useState('');
  const [isUpdatingItem, setIsUpdatingItem] = useState(false);
  const [removingItemId, setRemovingItemId] = useState<string | null>(null);
  const [itemActionError, setItemActionError] = useState<string | null>(null);

  const [settingsAnniversaryDate, setSettingsAnniversaryDate] = useState('');
  const [settingsQuietMode, setSettingsQuietMode] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [lifecycleError, setLifecycleError] = useState<string | null>(null);
  const [runningLifecycleAction, setRunningLifecycleAction] = useState<string | null>(null);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [reportActionError, setReportActionError] = useState<string | null>(null);
  const [isSavingReport, setIsSavingReport] = useState(false);

  const activeMembersText = useMemo(() => {
    if (!activeMuseum) {
      return '';
    }
    return activeMuseum.members.map((member) => member.nickname).join(' · ');
  }, [activeMuseum]);

  const selectedCreateThemeOption = useMemo(
    () => SHARED_MUSEUM_THEME_OPTIONS.find((option) => option.value === createTheme) ?? SHARED_MUSEUM_THEME_OPTIONS[0],
    [createTheme],
  );

  const selectedItem = useMemo(() => {
    if (!activeMuseum || !selectedItemId) {
      return null;
    }
    return activeMuseum.items.find((item) => item.id === selectedItemId) || null;
  }, [activeMuseum, selectedItemId]);

  const currentMember = useMemo(() => {
    if (!activeMuseum || !currentUserId) {
      return null;
    }
    return activeMuseum.members.find((member) => member.userId === currentUserId) || null;
  }, [activeMuseum, currentUserId]);

  const isCreator = currentMember?.role === 'creator';
  const isReadOnlyMuseum = activeMuseum?.status === 'archived' || activeMuseum?.status === 'ended';
  const isQuietMuseum = Boolean(activeMuseum?.quietMode);
  const canEditMuseumSettings = Boolean(activeMuseum && isCreator && !isReadOnlyMuseum);
  const canManageInvite = Boolean(activeMuseum && isCreator && !isReadOnlyMuseum);
  const canMutateItems = Boolean(activeMuseum && !isReadOnlyMuseum);
  const statusLabel = activeMuseum?.status === 'ended'
    ? '已结束'
    : activeMuseum?.status === 'archived'
      ? '已归档'
      : activeMuseum?.status === 'quiet'
        ? '静默中'
        : '进行中';
  const monthlyReviewNotice = !activeMuseum
    ? ''
    : activeMuseum.status === 'ended'
      ? '这座共建馆已结束，月度回顾与纪念触发已关闭。'
      : activeMuseum.status === 'archived'
        ? '这座共建馆已归档，月度回顾不会再继续生成。'
        : activeMuseum.quietMode
          ? '静默模式已开启，月度回顾与纪念触发已暂停。'
          : activeMuseum.items.length === 0
            ? '等有共享藏品之后，这里会自动生成第一版月度回顾。'
            : '';

  const monthlyReview = useMemo<MonthlyReviewSnapshot | null>(() => {
    if (!activeMuseum || activeMuseum.items.length === 0 || activeMuseum.quietMode || activeMuseum.status !== 'active') {
      return null;
    }

    const items = [...activeMuseum.items]
      .filter((item) => item.dateShared)
      .sort((left, right) => new Date(left.dateShared).getTime() - new Date(right.dateShared).getTime());

    if (items.length === 0) {
      return null;
    }

    const groups = new Map<string, SharedMuseumItem[]>();
    items.forEach((item) => {
      const date = new Date(item.dateShared);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const bucket = groups.get(monthKey) || [];
      bucket.push(item);
      groups.set(monthKey, bucket);
    });

    const latestMonthKey = Array.from(groups.keys()).sort().at(-1);
    if (!latestMonthKey) {
      return null;
    }

    const monthItems = [...(groups.get(latestMonthKey) || [])].sort(
      (left, right) => new Date(left.dateShared).getTime() - new Date(right.dateShared).getTime(),
    );
    if (monthItems.length === 0) {
      return null;
    }

    const [year, month] = latestMonthKey.split('-');
    const monthLabel = `${year} 年 ${Number(month)} 月`;
    const topCategories = countTopValues(monthItems.map((item) => item.category || '未分类'), 3);
    const topTags = countTopValues(monthItems.flatMap((item) => item.tags || []), 4);
    const relationLabels = countTopValues(monthItems.map((item) => item.relationLabel || ''), 3);
    const categoryCount = new Set(monthItems.map((item) => item.category || '未分类')).size;
    const firstItem = monthItems[0];
    const lastItem = monthItems[monthItems.length - 1];
    const topCategoryText = topCategories.length > 0 ? topCategories.join('、') : '日常碎片';
    const topTagText = topTags.length > 0 ? topTags.join('、') : '共同回忆';

    return {
      monthKey: latestMonthKey,
      monthLabel,
      itemCount: monthItems.length,
      categoryCount,
      topCategories,
      topTags,
      relationLabels,
      highlights: [
        `本月新增 ${monthItems.length} 件共建藏品`,
        `涉及 ${categoryCount} 个收藏主题`,
        relationLabels[0] ? `最强记忆标签是“${relationLabels[0]}”` : '这个月留下了新的共同记忆',
      ],
      narrative: `${monthLabel}，你们一起把 ${monthItems.length} 件物品放进了共建藏馆，主题主要围绕 ${topCategoryText} 展开。这个月的关键词偏向 ${topTagText}，从“${firstItem.name}”开始，到“${lastItem.name}”收尾，像是把一段生活切成了可以回看的小小时间轴。`,
      timeline: monthItems.slice(-5).map((item) => ({
        id: item.id,
        name: item.name,
        dateLabel: new Date(item.dateShared).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }),
        sharedNote: item.sharedNote || item.story || item.description || '这一天收进了一段新的共同记忆。',
        relationLabel: item.relationLabel || '',
        coverImageUrl: item.coverImageUrl || '',
        imageUrl: item.imageUrl || '',
      })),
      milestoneMessage: activeMuseum.itemCount >= 10
        ? `这座共建藏馆已经累计到 ${activeMuseum.itemCount} 件共建藏品，可以开始准备更完整的时间轴回顾了。`
        : `目前共建藏馆里已有 ${activeMuseum.itemCount} 件共建藏品，再继续记录会更容易长成完整的年度回顾。`,
    };
  }, [activeMuseum]);

  const savedReports = useMemo<SharedMuseumMonthlyReport[]>(() => {
    if (!activeMuseum) {
      return [];
    }

    return [...activeMuseum.reports].sort(
      (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
    );
  }, [activeMuseum]);

  const selectedSavedReport = useMemo(() => {
    if (!selectedReportId) {
      return null;
    }
    return savedReports.find((report) => report.id === selectedReportId) || null;
  }, [savedReports, selectedReportId]);

  const fallbackSavedReport = !selectedSavedReport && !monthlyReview ? savedReports[0] || null : null;
  const displayedReport = selectedSavedReport || fallbackSavedReport;
  const displayedMonthlyReview = displayedReport?.snapshot || monthlyReview || null;
  const hasAnyMonthlyReview = Boolean(displayedMonthlyReview);

  useEffect(() => {
    if (!activeMuseum) {
      setActivePanel('items');
      setSelectedItemId(null);
      setEditingItemId(null);
      setSelectedReportId(null);
      setEditSharedNote('');
      setEditRelationLabel('');
      setItemActionError(null);
      setSettingsAnniversaryDate('');
      setSettingsQuietMode(false);
      setSettingsError(null);
      setLifecycleError(null);
      setReportActionError(null);
      return;
    }

    setSettingsAnniversaryDate(activeMuseum.anniversaryDate || '');
    setSettingsQuietMode(Boolean(activeMuseum.quietMode));
    setSettingsError(null);
    setLifecycleError(null);

    if (selectedItemId && !activeMuseum.items.some((item) => item.id === selectedItemId)) {
      setSelectedItemId(null);
    }

    if (editingItemId && !activeMuseum.items.some((item) => item.id === editingItemId)) {
      setEditingItemId(null);
      setEditSharedNote('');
      setEditRelationLabel('');
    }

    if (selectedReportId && !activeMuseum.reports.some((report) => report.id === selectedReportId)) {
      setSelectedReportId(null);
    }
  }, [activeMuseum, editingItemId, selectedItemId, selectedReportId]);

  useEffect(() => {
    if (selectedItemId) {
      setActivePanel('items');
    }
  }, [selectedItemId]);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!createName.trim()) {
      setActionError('请先输入共建藏馆名称。');
      return;
    }

    setActionError(null);
    setIsCreating(true);
    try {
      await onCreateMuseum({
        name: createName.trim(),
        description: createDescription.trim(),
        anniversaryDate: createAnniversaryDate.trim(),
        theme: createTheme,
      });
      setCreateName('');
      setCreateDescription('');
      setCreateAnniversaryDate('');
      setCreateTheme('shared-memory');
      setIsCreateThemeMenuOpen(false);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '创建共建藏馆失败。');
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!joinCode.trim()) {
      setActionError('请先输入邀请码。');
      return;
    }

    setActionError(null);
    setIsJoining(true);
    try {
      await onJoinMuseum(joinCode.trim().toUpperCase());
      setJoinCode('');
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '加入共建藏馆失败。');
    } finally {
      setIsJoining(false);
    }
  };

  const handleCopyInviteCode = async (inviteCode: string) => {
    try {
      await navigator.clipboard.writeText(inviteCode);
      setCopiedInviteCode(inviteCode);
      window.setTimeout(() => {
        setCopiedInviteCode((current) => (current === inviteCode ? null : current));
      }, 1500);
    } catch {
      setCopiedInviteCode(null);
    }
  };

  const beginEditItem = (item: SharedMuseumItem) => {
    setItemActionError(null);
    setEditingItemId(item.id);
    setEditSharedNote(item.sharedNote || '');
    setEditRelationLabel(item.relationLabel || '');
  };

  const cancelEditItem = () => {
    setEditingItemId(null);
    setEditSharedNote('');
    setEditRelationLabel('');
    setItemActionError(null);
  };

  const handleSaveItemNote = async () => {
    if (!activeMuseum || !editingItemId) {
      return;
    }

    setItemActionError(null);
    setIsUpdatingItem(true);
    try {
      await onUpdateMuseumItem(activeMuseum.id, editingItemId, {
        sharedNote: editSharedNote.trim(),
        relationLabel: editRelationLabel.trim(),
      });
      cancelEditItem();
    } catch (error) {
      setItemActionError(error instanceof Error ? error.message : '保存共同备注失败。');
    } finally {
      setIsUpdatingItem(false);
    }
  };

  const handleRemoveItem = async (item: SharedMuseumItem) => {
    if (!activeMuseum) {
      return;
    }

    const confirmed = window.confirm(`确定将“${item.name}”移出这座共建藏馆吗？`);
    if (!confirmed) {
      return;
    }

    setItemActionError(null);
    setRemovingItemId(item.id);
    try {
      await onRemoveMuseumItem(activeMuseum.id, item.id, item.name);
      if (selectedItemId === item.id) {
        setSelectedItemId(null);
      }
      if (editingItemId === item.id) {
        cancelEditItem();
      }
    } catch (error) {
      setItemActionError(error instanceof Error ? error.message : '移出共建藏馆失败。');
    } finally {
      setRemovingItemId(null);
    }
  };

  const handleSaveMonthlyReport = async () => {
    if (!activeMuseum || !monthlyReview) {
      return;
    }

    setReportActionError(null);
    setIsSavingReport(true);
    try {
      await onSaveMonthlyReport(activeMuseum.id, monthlyReview);
      setActivePanel('monthly-review');
      setSelectedReportId(null);
    } catch (error) {
      setReportActionError(error instanceof Error ? error.message : '保存月度回顾失败。');
    } finally {
      setIsSavingReport(false);
    }
  };

  const handleSaveMuseumSettings = async () => {
    if (!activeMuseum) {
      return;
    }

    setSettingsError(null);
    setIsSavingSettings(true);
    try {
      await onUpdateMuseumSettings(activeMuseum.id, {
        anniversaryDate: settingsAnniversaryDate.trim(),
        quietMode: settingsQuietMode,
      });
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : '保存共建馆设置失败。');
    } finally {
      setIsSavingSettings(false);
    }
  };

  const runLifecycleAction = async (
    actionKey: string,
    operation: () => Promise<void> | void,
    fallbackMessage: string,
  ) => {
    setLifecycleError(null);
    setRunningLifecycleAction(actionKey);
    try {
      await operation();
    } catch (error) {
      setLifecycleError(error instanceof Error ? error.message : fallbackMessage);
    } finally {
      setRunningLifecycleAction(null);
    }
  };

  const renderItemEditor = () => (
    <div className="rounded-[24px] border border-remuse-accent/15 bg-remuse-accent/5 p-4">
      <div className="space-y-3">
        <label className="block space-y-2">
          <span className="text-xs text-neutral-400">共同标签</span>
          <input
            value={editRelationLabel}
            onChange={(event) => setEditRelationLabel(event.target.value)}
            placeholder="比如：第一次旅行 / 纪念日 / 一起买的"
            className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none transition focus:border-remuse-accent"
          />
        </label>
        <label className="block space-y-2">
          <span className="text-xs text-neutral-400">共同备注</span>
          <textarea
            value={editSharedNote}
            onChange={(event) => setEditSharedNote(event.target.value)}
            rows={4}
            placeholder="继续补充这件物品背后的共同记忆。"
            className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none transition focus:border-remuse-accent"
          />
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={isUpdatingItem}
            onClick={handleSaveItemNote}
            className="inline-flex min-h-[40px] flex-1 items-center justify-center gap-2 rounded-full bg-remuse-accent px-4 text-sm font-medium text-black transition hover:bg-white disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-400"
          >
            <Save size={14} />
            {isUpdatingItem ? '保存中...' : '保存共同备注'}
          </button>
          <button
            type="button"
            onClick={cancelEditItem}
            className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-full border border-white/10 px-4 text-sm text-neutral-300 transition hover:border-white hover:text-white"
          >
            <X size={14} />
            取消
          </button>
        </div>
      </div>
    </div>
  );

  const renderMuseumList = () => (
    <section className="rounded-[30px] border border-remuse-border bg-[radial-gradient(circle_at_top_left,rgba(204,255,0,0.08),transparent_24%),radial-gradient(circle_at_top_right,rgba(34,211,238,0.1),transparent_28%),linear-gradient(180deg,rgba(16,19,23,0.98),rgba(10,12,16,0.98))] p-5 shadow-[0_20px_56px_rgba(0,0,0,0.24)] md:p-6">
      <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-remuse-accent/20 bg-remuse-accent/10 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.3em] text-remuse-accent">
            <Heart size={14} />
            共建列表
          </div>
          <h2 className="mt-4 font-display text-[2.65rem] font-black tracking-[-0.04em] text-white md:text-[3.1rem]">你的共建藏品馆</h2>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {museums.length > 0 ? museums.map((museum) => (
          <button
            key={museum.id}
            type="button"
            onClick={() => onOpenMuseum(museum.id)}
            className="group overflow-hidden rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(16,19,24,0.98),rgba(9,11,15,0.98))] text-left transition hover:-translate-y-0.5 hover:border-remuse-accent/35"
          >
            <div className="relative aspect-[16/10] overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(204,255,0,0.12),transparent_34%),radial-gradient(circle_at_top_right,rgba(34,211,238,0.16),transparent_36%),linear-gradient(180deg,rgba(15,18,22,1),rgba(8,10,13,1))]">
              {museum.coverImageUrl ? (
                <img
                  src={museum.coverImageUrl}
                  alt={museum.name}
                  className="h-full w-full object-cover opacity-90 transition duration-300 group-hover:scale-[1.03]"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-remuse-accent/70">
                  <Heart size={42} />
                </div>
              )}
              <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4">
                <span className="rounded-full bg-black/45 px-3 py-1 text-xs text-white/90">{museum.members.length} 位成员</span>
                <span className="rounded-full bg-remuse-accent/15 px-3 py-1 text-xs text-remuse-accent">{museum.itemCount} 件藏品</span>
              </div>
            </div>

            <div className="space-y-4 p-4">
              <div className="space-y-1">
                <h3 className="font-display text-[1.6rem] font-bold text-white">{museum.name}</h3>
                <p className="line-clamp-2 text-sm leading-6 text-neutral-400">
                  {museum.description || '这是一座等待你们继续共建的共享记忆空间。'}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {museum.members.slice(0, 2).map((member) => (
                  <span key={member.id} className="rounded-full bg-white/6 px-3 py-1 text-xs text-neutral-300">
                    {member.nickname}
                  </span>
                ))}
                <span className="rounded-full bg-cyan-400/10 px-3 py-1 text-xs text-cyan-200">邀请码 {museum.inviteCode}</span>
              </div>
            </div>
          </button>
        )) : (
          <div className="md:col-span-2 xl:col-span-3 rounded-[24px] border border-dashed border-white/10 bg-black/10 px-6 py-10 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-remuse-accent/20 bg-remuse-accent/8 text-remuse-accent">
              <Heart size={22} />
            </div>
            <p className="mt-4 text-base font-semibold text-white">还没有共建藏馆</p>
            <p className="mx-auto mt-2 max-w-md text-[13px] leading-6 text-neutral-400">先创建一座，或者通过邀请码加入对方的那一座。</p>
          </div>
        )}
      </div>
    </section>
  );

  const renderCreateJoinPanel = () => (
    <div className="grid gap-6 xl:items-start xl:grid-cols-[420px_minmax(0,1fr)]">
      <section className="space-y-6">
        <form
          onSubmit={handleCreate}
          className="rounded-[30px] border border-remuse-border bg-[radial-gradient(circle_at_top_right,rgba(204,255,0,0.08),transparent_28%),linear-gradient(180deg,rgba(29,29,31,0.98),rgba(22,22,24,0.98))] p-5 shadow-[0_20px_56px_rgba(0,0,0,0.22)] md:p-6"
        >
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-remuse-accent/15 p-3 text-remuse-accent">
              <Plus size={22} />
            </div>
            <div>
              <h2 className="font-display text-[1.8rem] font-bold text-white md:text-[1.95rem]">创建共建馆</h2>
            </div>
          </div>

          <div className="mt-5 space-y-4">
            <label className="block space-y-2">
                <span className="text-[13px] text-neutral-300">馆名</span>
              <input
                value={createName}
                onChange={(event) => setCreateName(event.target.value)}
                placeholder="比如：我们的小宇宙"
                className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none transition focus:border-remuse-accent"
              />
            </label>
            <label className="block space-y-2">
                <span className="text-[13px] text-neutral-300">一句描述</span>
              <textarea
                value={createDescription}
                onChange={(event) => setCreateDescription(event.target.value)}
                placeholder="比如：记录一起走过的电影、礼物、票根和那些只属于我们的日常。"
                rows={4}
                className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none transition focus:border-remuse-accent"
              />
            </label>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block space-y-2">
                <span className="text-[13px] text-neutral-300">纪念日</span>
                <input
                  value={createAnniversaryDate}
                  onChange={(event) => setCreateAnniversaryDate(event.target.value)}
                  placeholder="2024-08-18"
                  className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none transition focus:border-remuse-accent"
                />
              </label>
              <div
                className="block space-y-2"
                onBlur={(event) => {
                  const nextFocus = event.relatedTarget as Node | null;
                  if (!event.currentTarget.contains(nextFocus)) {
                    setIsCreateThemeMenuOpen(false);
                  }
                }}
              >
                <span className="text-[13px] text-neutral-300">主题</span>
                <div className="relative">
                  <button
                    type="button"
                    aria-haspopup="listbox"
                    aria-expanded={isCreateThemeMenuOpen}
                    onClick={() => setIsCreateThemeMenuOpen((open) => !open)}
                    className={`flex min-h-[56px] w-full items-center justify-between gap-3 rounded-2xl border px-4 py-2.5 text-left text-white outline-none transition ${
                      isCreateThemeMenuOpen
                        ? 'border-remuse-accent bg-black/30 shadow-[0_0_0_1px_rgba(204,255,0,0.12)]'
                        : 'border-white/10 bg-black/20 hover:border-white/20'
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className={`h-3 w-3 shrink-0 rounded-full ${selectedCreateThemeOption.dotClassName}`} />
                      <div className="min-w-0">
                        <p className="truncate font-display text-base font-bold text-white">{selectedCreateThemeOption.label}</p>
                      </div>
                    </div>
                    <ChevronDown
                      size={18}
                      className={`shrink-0 text-neutral-400 transition-transform ${isCreateThemeMenuOpen ? 'rotate-180 text-remuse-accent' : ''}`}
                    />
                  </button>

                  {isCreateThemeMenuOpen ? (
                    <div
                      role="listbox"
                      aria-label="共建馆主题"
                      className="absolute left-0 right-0 top-[calc(100%+10px)] z-20 max-h-[248px] overflow-y-auto rounded-[20px] border border-white/12 bg-[linear-gradient(180deg,rgba(24,27,32,0.98),rgba(14,16,20,0.98))] p-1.5 shadow-[0_24px_64px_rgba(0,0,0,0.34)] backdrop-blur-xl"
                    >
                      <div className="space-y-1">
                        {SHARED_MUSEUM_THEME_OPTIONS.map((option) => {
                          const isSelected = option.value === createTheme;

                          return (
                            <button
                              key={option.value}
                              type="button"
                              role="option"
                              aria-selected={isSelected}
                              onClick={() => {
                                setCreateTheme(option.value);
                                setIsCreateThemeMenuOpen(false);
                              }}
                              className={`flex w-full items-center justify-between gap-3 rounded-[16px] px-3 py-2 text-left transition ${
                                isSelected
                                  ? 'bg-white/[0.08] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]'
                                  : 'text-neutral-300 hover:bg-white/[0.05] hover:text-white'
                              }`}
                            >
                              <div className="flex min-w-0 items-center gap-3">
                                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${option.dotClassName}`} />
                                <div className="min-w-0">
                                  <p className="font-display text-[15px] font-bold">{option.label}</p>
                                </div>
                              </div>
                              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${
                                isSelected
                                  ? 'border-remuse-accent/30 bg-remuse-accent/12 text-remuse-accent'
                                  : 'border-white/10 bg-black/20 text-transparent'
                              }`}>
                                <Check size={14} />
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={isCreating}
            className="mt-5 inline-flex min-h-[48px] items-center gap-2 rounded-full bg-remuse-accent px-5 font-display text-black transition hover:bg-white disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
          >
            {isCreating ? '创建中...' : '创建共建藏馆'}
          </button>
        </form>

        <form
          onSubmit={handleJoin}
          className="rounded-[30px] border border-remuse-border bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.08),transparent_26%),linear-gradient(180deg,rgba(29,29,31,0.98),rgba(22,22,24,0.98))] p-5 shadow-[0_20px_56px_rgba(0,0,0,0.22)] md:p-6"
        >
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-cyan-400/10 p-3 text-cyan-300">
              <Lock size={22} />
            </div>
            <div>
              <h2 className="font-display text-[1.8rem] font-bold text-white md:text-[1.95rem]">通过邀请码加入</h2>
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-3 md:flex-row">
            <input
              value={joinCode}
              onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
              placeholder="例如 H8K7P2"
              className="min-h-[48px] flex-1 rounded-full border border-white/10 bg-black/20 px-5 text-white outline-none transition focus:border-remuse-accent"
            />
            <button
              type="submit"
              disabled={isJoining}
              className="inline-flex min-h-[48px] items-center justify-center rounded-full border border-remuse-accent/30 px-5 text-remuse-accent transition hover:border-remuse-accent hover:bg-remuse-accent/10 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-neutral-500"
            >
              {isJoining ? '加入中...' : '加入'}
            </button>
          </div>
        </form>

        {actionError ? (
          <div className="rounded-2xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200">
            {actionError}
          </div>
        ) : null}
      </section>

      {renderMuseumList()}
    </div>
  );

  const renderSharedItemCard = (item: SharedMuseumItem) => {
    const isEditing = editingItemId === item.id;
    const isRemoving = removingItemId === item.id;

    return (
      <article
        key={item.id}
        role="button"
        tabIndex={0}
        onClick={() => setSelectedItemId(item.id)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setSelectedItemId(item.id);
          }
        }}
        className="cursor-pointer overflow-hidden rounded-[26px] border border-white/8 bg-[linear-gradient(180deg,rgba(13,17,22,0.98),rgba(8,10,13,0.98))] transition hover:-translate-y-0.5 hover:border-remuse-accent/30"
      >
        <div className="relative aspect-[5/4] overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(204,255,0,0.08),transparent_28%),linear-gradient(180deg,rgba(14,17,20,1),rgba(9,11,14,1))]">
          {item.coverImageUrl || item.imageUrl ? (
            <img
              src={item.coverImageUrl || item.imageUrl}
              alt={item.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-neutral-500">
              <ImageIcon size={28} />
            </div>
          )}
          <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4">
            <span className="rounded-full bg-black/45 px-3 py-1 text-xs text-white/90">{item.category || '共同收藏'}</span>
            {item.relationLabel ? (
              <span className="rounded-full bg-remuse-accent/15 px-3 py-1 text-xs text-remuse-accent">{item.relationLabel}</span>
            ) : null}
          </div>
        </div>

        <div className="space-y-4 p-4">
          <div className="space-y-1">
            <h3 className="font-display text-xl font-bold text-white">{item.name}</h3>
            <p className="text-xs text-neutral-500">加入时间 {new Date(item.dateShared).toLocaleDateString()}</p>
            <p className="text-xs text-remuse-accent/80">点击进入共享藏品详情页</p>
          </div>

          <div className="rounded-[22px] border border-white/6 bg-black/15 p-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-neutral-500">共同备注</p>
            <p className="mt-3 min-h-[4.5rem] text-sm leading-6 text-neutral-300">
              {item.sharedNote || item.story || item.description || '还没有共同备注，可以补一句只有你们看得懂的话。'}
            </p>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              disabled={!canMutateItems}
              onClick={(event) => {
                event.stopPropagation();
                beginEditItem(item);
              }}
              className="inline-flex min-h-[40px] flex-1 items-center justify-center gap-2 rounded-full border border-remuse-accent/25 px-3 text-sm text-remuse-accent transition hover:border-remuse-accent hover:bg-remuse-accent/10 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-neutral-500"
            >
              <Edit3 size={14} />
              编辑备注
            </button>
            <button
              type="button"
              disabled={isRemoving}
              onClick={(event) => {
                event.stopPropagation();
                void handleRemoveItem(item);
              }}
              className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-full border border-red-400/25 px-4 text-sm text-red-200 transition hover:border-red-300 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Trash2 size={14} />
              {isRemoving ? '移出中...' : '移出'}
            </button>
          </div>

          {isEditing ? (
            <div
              onClick={(event) => event.stopPropagation()}
              className="rounded-[22px] border border-remuse-accent/15 bg-remuse-accent/5 p-4"
            >
              {renderItemEditor()}
            </div>
          ) : null}

          {!canMutateItems ? (
            <div className="rounded-[18px] border border-white/8 bg-black/15 px-4 py-3 text-xs leading-6 text-neutral-400">
              当前馆状态为{statusLabel}，共享藏品只读，不再支持编辑或移出。
            </div>
          ) : null}
        </div>
      </article>
    );
  };

  const renderSelectedItemDetail = () => {
    if (!activeMuseum || !selectedItem) {
      return null;
    }

    const isEditing = editingItemId === selectedItem.id;
    const isRemoving = removingItemId === selectedItem.id;

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
          type="button"
          onClick={() => setSelectedItemId(null)}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-neutral-700 px-4 text-sm text-neutral-300 transition-colors hover:border-white hover:text-white"
        >
          <ArrowLeft size={16} />
          返回共享藏品列表
        </button>

        {itemActionError ? (
          <div className="rounded-2xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200">
            {itemActionError}
          </div>
        ) : null}
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(420px,0.9fr)_minmax(0,1.1fr)]">
          <section className="overflow-hidden rounded-[30px] border border-remuse-border bg-remuse-panel shadow-[0_20px_56px_rgba(0,0,0,0.22)]">
            <div className="relative aspect-[4/5] overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(204,255,0,0.08),transparent_30%),linear-gradient(180deg,rgba(13,16,20,1),rgba(8,10,13,1))] p-4">
              {selectedItem.coverImageUrl || selectedItem.imageUrl ? (
                <img
                  src={selectedItem.coverImageUrl || selectedItem.imageUrl}
                  alt={selectedItem.name}
                  className="h-full w-full rounded-[24px] object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center rounded-[24px] border border-dashed border-white/10 text-neutral-500">
                  <ImageIcon size={40} />
                </div>
              )}
            </div>
          </section>

          <section className="space-y-5 rounded-[30px] border border-remuse-border bg-remuse-panel p-5 shadow-[0_20px_56px_rgba(0,0,0,0.22)] md:p-6">
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full bg-white/6 px-3 py-1 text-xs text-neutral-300">{selectedItem.category || '共同收藏'}</span>
                {selectedItem.relationLabel ? (
                  <span className="rounded-full bg-remuse-accent/15 px-3 py-1 text-xs text-remuse-accent">{selectedItem.relationLabel}</span>
                ) : null}
              </div>
              <h2 className="font-display text-3xl font-black tracking-[-0.04em] text-white md:text-4xl">{selectedItem.name}</h2>
              <p className="text-sm text-neutral-400">
                加入共建馆时间 {new Date(selectedItem.dateShared).toLocaleDateString()} · 原始收藏时间 {new Date(selectedItem.dateCollected).toLocaleDateString()}
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-[24px] border border-white/6 bg-black/15 p-4">
                <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-neutral-500">共同备注</p>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-neutral-300">
                  {selectedItem.sharedNote || '这件共享藏品还没有共同备注。'}
                </p>
              </div>
              <div className="rounded-[24px] border border-white/6 bg-black/15 p-4">
                <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-neutral-500">原始故事</p>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-neutral-300">
                  {selectedItem.story || selectedItem.description || '原始藏品还没有补充故事。'}
                </p>
              </div>
            </div>

            <div className="rounded-[24px] border border-white/6 bg-black/15 p-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-neutral-500">标签与材质</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {selectedItem.material ? (
                  <span className="rounded-full bg-cyan-400/10 px-3 py-1 text-xs text-cyan-200">{selectedItem.material}</span>
                ) : null}
                {selectedItem.tags.length > 0 ? selectedItem.tags.map((tag) => (
                  <span key={tag} className="rounded-full bg-white/6 px-3 py-1 text-xs text-neutral-300">
                    {tag}
                  </span>
                )) : (
                  <span className="rounded-full bg-white/6 px-3 py-1 text-xs text-neutral-500">暂无标签</span>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                disabled={!canMutateItems}
                onClick={() => beginEditItem(selectedItem)}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-remuse-accent/25 px-4 text-sm text-remuse-accent transition hover:border-remuse-accent hover:bg-remuse-accent/10 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-neutral-500"
              >
                <Edit3 size={16} />
                编辑共同备注
              </button>
              <button
                type="button"
                disabled={isRemoving}
                onClick={() => void handleRemoveItem(selectedItem)}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-red-400/25 px-4 text-sm text-red-200 transition hover:border-red-300 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Trash2 size={16} />
                {isRemoving ? '移出中...' : '移出共建馆'}
              </button>
            </div>

            {!canMutateItems ? (
              <div className="rounded-[22px] border border-white/8 bg-black/15 p-4 text-sm leading-6 text-neutral-400">
                当前馆状态为{statusLabel}，这件共享藏品现在处于只读状态。
              </div>
            ) : null}

            {isEditing ? renderItemEditor() : null}
          </section>
        </div>
      </div>
    );
  };

  const renderMonthlyReviewDetail = () => {
    if (!displayedMonthlyReview) {
      return (
        <div className="rounded-[30px] border border-remuse-border bg-remuse-panel p-6 text-neutral-400 shadow-[0_20px_56px_rgba(0,0,0,0.22)]">
          {monthlyReviewNotice || '这座共建藏馆暂时还不能生成月度回顾。'}
        </div>
      );
    }

    const reportBadge = displayedReport
      ? `保存于 ${new Date(displayedReport.updatedAt).toLocaleDateString('zh-CN')}`
      : '当前草稿';
    const monthlyReview = displayedMonthlyReview;

    return (
      <div className="space-y-6">
        <button
          type="button"
          onClick={() => setActivePanel('items')}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-neutral-700 px-4 text-sm text-neutral-300 transition-colors hover:border-white hover:text-white"
        >
          <ArrowLeft size={16} />
          返回共享藏品
        </button>

        <div className="rounded-[32px] border border-remuse-border bg-remuse-panel p-6 shadow-[0_20px_56px_rgba(0,0,0,0.22)] md:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-remuse-accent/20 bg-remuse-accent/10 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.3em] text-remuse-accent">
                <Sparkles size={14} />
                月度回顾
              </div>
              <h2 className="mt-4 font-display text-4xl font-black tracking-[-0.05em] text-white">{monthlyReview.monthLabel} 共建回顾</h2>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-neutral-300 md:text-base">{monthlyReview.narrative}</p>
            </div>
            <div className="rounded-[24px] border border-white/8 bg-black/15 px-5 py-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.32em] text-neutral-500">月度快照</p>
              <p className="mt-3 text-3xl font-black text-white">{monthlyReview.itemCount}</p>
              <p className="mt-1 text-sm text-neutral-400">件新加入的共享藏品</p>
              <p className="mt-3 text-xs uppercase tracking-[0.24em] text-neutral-500">{reportBadge}</p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {monthlyReview.highlights.map((highlight) => (
              <div key={highlight} className="rounded-[24px] border border-white/8 bg-black/15 p-4">
                <p className="text-sm leading-7 text-neutral-200">{highlight}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
            <div className="rounded-[26px] border border-white/8 bg-black/15 p-5">
              <p className="font-mono text-[11px] uppercase tracking-[0.32em] text-neutral-500">月度时间线</p>
              <div className="mt-4 space-y-3">
                {monthlyReview.timeline.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActivePanel('items');
                      setSelectedItemId(item.id);
                    }}
                    className="flex w-full items-start gap-4 rounded-[22px] border border-white/8 bg-black/20 p-4 text-left transition hover:border-remuse-accent/30 hover:bg-black/30"
                  >
                    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-[18px] bg-white/5">
                      {item.coverImageUrl || item.imageUrl ? (
                        <img src={item.coverImageUrl || item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-neutral-500">
                          <ImageIcon size={20} />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-white">{item.name}</p>
                        <span className="rounded-full bg-white/6 px-2.5 py-1 text-[11px] text-neutral-400">{item.dateLabel}</span>
                        {item.relationLabel ? (
                          <span className="rounded-full bg-remuse-accent/15 px-2.5 py-1 text-[11px] text-remuse-accent">{item.relationLabel}</span>
                        ) : null}
                      </div>
                      <p className="mt-2 line-clamp-2 text-sm leading-6 text-neutral-400">{item.sharedNote}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-[26px] border border-white/8 bg-black/15 p-5">
                <p className="font-mono text-[11px] uppercase tracking-[0.32em] text-neutral-500">高频主题</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {monthlyReview.topCategories.map((category) => (
                    <span key={category} className="rounded-full bg-cyan-400/10 px-3 py-1.5 text-xs text-cyan-200">
                      {category}
                    </span>
                  ))}
                  {monthlyReview.topTags.map((tag) => (
                    <span key={tag} className="rounded-full bg-white/6 px-3 py-1.5 text-xs text-neutral-300">
                      #{tag}
                    </span>
                  ))}
                  {monthlyReview.relationLabels.map((label) => (
                    <span key={label} className="rounded-full bg-remuse-accent/15 px-3 py-1.5 text-xs text-remuse-accent">
                      {label}
                    </span>
                  ))}
                </div>
              </div>

              <div className="rounded-[26px] border border-white/8 bg-black/15 p-5">
                <p className="font-mono text-[11px] uppercase tracking-[0.32em] text-neutral-500">成长注记</p>
                <p className="mt-4 text-sm leading-7 text-neutral-300">{monthlyReview.milestoneMessage}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderMuseumDetail = () => {
    if (!activeMuseum) {
      return null;
    }

    return (
      <div className="space-y-6">
        <section className="rounded-[32px] border border-remuse-border bg-[radial-gradient(circle_at_top_left,rgba(204,255,0,0.12),transparent_22%),radial-gradient(circle_at_top_right,rgba(34,211,238,0.14),transparent_28%),linear-gradient(180deg,rgba(18,22,26,0.98),rgba(8,10,13,0.98))] p-5 shadow-[0_24px_72px_rgba(0,0,0,0.3)] md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl">
              <button
                type="button"
                onClick={() => {
                  setSelectedItemId(null);
                  cancelEditItem();
                  onBackToList();
                }}
                className="inline-flex min-h-[42px] items-center gap-2 rounded-full border border-white/10 px-4 text-sm text-neutral-300 transition hover:border-white hover:text-white"
              >
                <ArrowLeft size={16} />
                返回共建藏馆列表
              </button>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <div className="inline-flex items-center gap-2 rounded-full border border-remuse-accent/20 bg-remuse-accent/10 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.3em] text-remuse-accent">
                  <Heart size={14} />
                  Shared Space
                </div>
                <div className="rounded-full bg-white/6 px-3 py-1 text-xs text-neutral-300">{activeMuseum.itemCount} 件共享藏品</div>
                <div className="rounded-full bg-cyan-400/10 px-3 py-1 text-xs text-cyan-200">{statusLabel}</div>
                {!activeMuseum.inviteEnabled ? (
                  <div className="rounded-full bg-white/6 px-3 py-1 text-xs text-neutral-300">邀请已关闭</div>
                ) : null}
              </div>

              <h1 className="mt-4 font-display text-4xl font-black tracking-[-0.05em] text-white md:text-5xl">{activeMuseum.name}</h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-neutral-300 md:text-base">
                {activeMuseum.description || '这座共建藏馆用来保存你们共同的物品、故事、纪念日和那些一起走过的轨迹。'}
              </p>

              <div className="mt-5 flex flex-wrap gap-3 text-sm text-neutral-400">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/8 bg-black/15 px-4 py-2">
                  <Users size={16} className="text-remuse-accent" />
                  {activeMembersText || '等待共建成员加入'}
                </div>
                {activeMuseum.anniversaryDate ? (
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/8 bg-black/15 px-4 py-2">
                    <CalendarClock size={16} className="text-cyan-300" />
                    纪念日 {activeMuseum.anniversaryDate}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="w-full max-w-sm rounded-[28px] border border-white/8 bg-black/20 p-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.32em] text-neutral-500">邀请码</p>
              <div className="mt-3 flex items-center justify-between gap-3">
                <div>
                  <p className="font-display text-3xl font-black tracking-[0.22em] text-white">
                    {activeMuseum.inviteEnabled ? activeMuseum.inviteCode : '邀请已关闭'}
                  </p>
                  <p className="mt-2 text-sm text-neutral-400">
                    {activeMuseum.inviteEnabled ? '把邀请码发给对方，对方输入后就能加入这座共建藏馆。' : '这座共建馆当前不接受新成员加入。'}
                  </p>
                </div>


                <button
                  type="button"
                  onClick={() => handleCopyInviteCode(activeMuseum.inviteCode)}
                  disabled={!activeMuseum.inviteEnabled}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-remuse-accent/25 px-4 text-sm text-remuse-accent transition hover:border-remuse-accent hover:bg-remuse-accent/10"
                >
                  <Clipboard size={16} />
                  {copiedInviteCode === activeMuseum.inviteCode ? '已复制' : '复制'}
                </button>
              </div>
              {canManageInvite ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void runLifecycleAction('reset-invite', () => onResetInvite(activeMuseum.id), '重置邀请码失败。')}
                    disabled={runningLifecycleAction === 'reset-invite'}
                    className="inline-flex min-h-[40px] items-center justify-center rounded-full border border-remuse-accent/25 px-4 text-sm text-remuse-accent transition hover:border-remuse-accent hover:bg-remuse-accent/10 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-neutral-500"
                  >
                    {runningLifecycleAction === 'reset-invite' ? '重置中...' : '重置邀请码'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void runLifecycleAction('revoke-invite', () => onRevokeInvite(activeMuseum.id), '关闭邀请失败。')}
                    disabled={runningLifecycleAction === 'revoke-invite' || !activeMuseum.inviteEnabled}
                    className="inline-flex min-h-[40px] items-center justify-center rounded-full border border-white/10 px-4 text-sm text-neutral-300 transition hover:border-white hover:text-white disabled:cursor-not-allowed disabled:border-white/10 disabled:text-neutral-500"
                  >
                    {runningLifecycleAction === 'revoke-invite' ? '关闭中...' : '撤销邀请'}
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="rounded-[24px] border border-white/8 bg-black/15 p-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-neutral-500">共享藏品</p>
              <p className="mt-3 text-3xl font-black text-white">{activeMuseum.itemCount}</p>
              <p className="mt-2 text-sm text-neutral-400">由双方共同加入，组成一座真正会成长的共享记忆空间。</p>
            </div>
            <div className="rounded-[24px] border border-white/8 bg-black/15 p-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-neutral-500">成员状态</p>
              <p className="mt-3 text-3xl font-black text-white">{activeMuseum.members.length}</p>
              <p className="mt-2 text-sm text-neutral-400">当前共建成员：{activeMembersText || '等待加入'}。</p>
            </div>
            <div className="rounded-[24px] border border-white/8 bg-black/15 p-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-neutral-500">成长节点</p>
              <p className="mt-3 text-3xl font-black text-white">{activeMuseum.milestoneCount}</p>
              <p className="mt-2 text-sm text-neutral-400">后续可在这里解锁月报、故事弹窗、纪念日提醒与里程碑卡片。</p>
            </div>
          </div>
        </section>

        {selectedItem ? renderSelectedItemDetail() : activePanel === 'monthly-review' ? renderMonthlyReviewDetail() : (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_360px]">
            <section className="space-y-5 rounded-[30px] border border-remuse-border bg-remuse-panel p-5 shadow-[0_20px_56px_rgba(0,0,0,0.22)] md:p-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-neutral-500">Shared Items</p>
                  <h2 className="mt-3 font-display text-3xl font-black tracking-[-0.04em] text-white">共享藏品</h2>
                  <p className="mt-2 text-sm text-neutral-400">点击卡片即可进入共享藏品详情页，继续查看、编辑共同备注或移出共建馆。</p>
                </div>
              </div>

              {itemActionError ? (
                <div className="rounded-2xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200">
                  {itemActionError}
                </div>
              ) : null}

              {activeMuseum.items.length > 0 ? (
                <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
                  {activeMuseum.items.map((item) => renderSharedItemCard(item))}
                </div>
              ) : (
                <div className="rounded-[26px] border border-dashed border-white/10 bg-black/10 p-10 text-center text-neutral-400">
                  还没有共享藏品。先从个人藏品馆里把你们共同的重要物品加进来。
                </div>
              )}
            </section>

            <aside className="space-y-6">
              <section className="rounded-[30px] border border-remuse-border bg-remuse-panel p-5 shadow-[0_20px_56px_rgba(0,0,0,0.22)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-mono text-[11px] uppercase tracking-[0.32em] text-neutral-500">月度回顾</p>
                    <h3 className="mt-3 font-display text-2xl font-bold text-white">月度回顾</h3>
                  </div>
                    <button
                      type="button"
                      disabled={!hasAnyMonthlyReview}
                      onClick={() => {
                        setSelectedItemId(null);
                        cancelEditItem();
                        setActivePanel('monthly-review');
                      }}
                      className="inline-flex min-h-[40px] items-center justify-center rounded-full border border-remuse-accent/25 px-4 text-sm text-remuse-accent transition hover:border-remuse-accent hover:bg-remuse-accent/10 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-neutral-500"
                    >
                      {hasAnyMonthlyReview ? '查看回顾' : '等待内容'}
                    </button>
                  </div>
                  {displayedMonthlyReview ? (
                    <div className="mt-5 rounded-[22px] border border-remuse-accent/15 bg-remuse-accent/5 p-4">
                      <p className="text-sm font-semibold text-white">{displayedMonthlyReview.monthLabel}</p>
                      <p className="mt-2 text-sm leading-7 text-neutral-300">{displayedMonthlyReview.narrative}</p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <span className="rounded-full bg-black/20 px-3 py-1 text-xs text-neutral-200">{displayedMonthlyReview.itemCount} 件新藏品</span>
                        <span className="rounded-full bg-black/20 px-3 py-1 text-xs text-neutral-200">{displayedMonthlyReview.categoryCount} 个主题</span>
                        {displayedMonthlyReview.topCategories.slice(0, 2).map((category) => (
                          <span key={category} className="rounded-full bg-black/20 px-3 py-1 text-xs text-neutral-200">{category}</span>
                        ))}
                      </div>
                    </div>
                ) : (
                  <div className="mt-5 rounded-[22px] border border-white/8 bg-black/15 p-4 text-sm leading-6 text-neutral-400">
                    {monthlyReviewNotice}
                  </div>
                )}

                {monthlyReview ? (
                  <button
                    type="button"
                    onClick={() => void handleSaveMonthlyReport()}
                    disabled={isSavingReport}
                    className="mt-4 inline-flex min-h-[40px] items-center gap-2 rounded-full border border-remuse-accent/25 px-4 text-sm text-remuse-accent transition hover:border-remuse-accent hover:bg-remuse-accent/10 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-neutral-500"
                  >
                    <Save size={16} />
                    {isSavingReport ? '保存中...' : '保存这个月的回顾'}
                  </button>
                ) : null}

                {reportActionError ? (
                  <div className="mt-4 rounded-[18px] border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200">
                    {reportActionError}
                  </div>
                ) : null}

                {savedReports.length > 0 ? (
                  <div className="mt-5 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-mono text-[11px] uppercase tracking-[0.32em] text-neutral-500">已保存回顾</p>
                      {monthlyReview ? (
                        <button
                          type="button"
                          onClick={() => setSelectedReportId(null)}
                          className="rounded-full border border-white/10 px-3 py-1 text-[11px] text-neutral-300 transition hover:border-white hover:text-white"
                        >
                          Live
                        </button>
                      ) : null}
                    </div>
                    <div className="space-y-2">
                      {savedReports.map((report) => {
                        const isActiveReport = selectedReportId === report.id || (!selectedReportId && !monthlyReview && savedReports[0]?.id === report.id);
                        return (
                          <button
                            key={report.id}
                            type="button"
                            onClick={() => setSelectedReportId(report.id)}
                            className={`flex w-full items-center justify-between rounded-[18px] border px-3 py-3 text-left text-sm transition ${
                              isActiveReport
                                ? 'border-remuse-accent/30 bg-remuse-accent/10 text-white'
                                : 'border-white/8 bg-black/15 text-neutral-300 hover:border-white/15 hover:text-white'
                            }`}
                          >
                            <span>{report.monthLabel}</span>
                            <span className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">
                              {new Date(report.updatedAt).toLocaleDateString('zh-CN')}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </section>

              <section className="rounded-[30px] border border-remuse-border bg-remuse-panel p-5 shadow-[0_20px_56px_rgba(0,0,0,0.22)]">
                <p className="font-mono text-[11px] uppercase tracking-[0.32em] text-neutral-500">共建触发</p>
                <h3 className="mt-3 font-display text-2xl font-bold text-white">共建内容预览</h3>
                <div className="mt-5 space-y-3">
                  {activeMuseum.momentCards.filter((card) => card.type !== 'report').length > 0 ? activeMuseum.momentCards.filter((card) => card.type !== 'report').map((card) => {
                    const displayTitle = card.type === 'story'
                      ? '故事弹窗'
                      : card.type === 'milestone'
                        ? '里程碑解锁'
                        : card.type === 'anniversary'
                          ? '静默模式与纪念日'
                          : card.title;
                    const displayStatus = isQuietMuseum || isReadOnlyMuseum ? 'paused' : card.status;
                    const displayDescription = card.type === 'story'
                      ? (isQuietMuseum || isReadOnlyMuseum ? '当前状态下故事弹窗暂停触发。' : '后续这里会在纪念日或特定藏品组合时触发小叙事。')
                      : card.type === 'milestone'
                        ? (isReadOnlyMuseum ? '这座共建馆已经停止成长，里程碑触发暂停。' : '共享藏品数量达到 10 / 30 / 50 时可解锁新的馆样式与报告。')
                        : card.type === 'anniversary'
                          ? (isQuietMuseum ? '静默模式已开启，纪念日提醒与那年今日暂停中。' : '纪念日、静默模式与关系状态都会作用在这里。')
                          : card.description;

                    return (
                      <div key={card.id} className="rounded-[22px] border border-white/8 bg-black/15 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-white">{displayTitle}</p>
                          <span className="rounded-full bg-white/6 px-2.5 py-1 text-[11px] text-neutral-400">{displayStatus}</span>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-neutral-400">{displayDescription}</p>
                      </div>
                    );
                  }) : (
                    <div className="rounded-[22px] border border-white/8 bg-black/15 p-4 text-sm leading-6 text-neutral-400">
                      故事弹窗、纪念日卡片和更多成长内容会在后续版本接入到这座共建藏馆里。
                    </div>
                  )}
                </div>
              </section>

              <section className="rounded-[30px] border border-remuse-border bg-remuse-panel p-5 shadow-[0_20px_56px_rgba(0,0,0,0.22)]">
                <p className="font-mono text-[11px] uppercase tracking-[0.32em] text-neutral-500">Museum Settings</p>
                <h3 className="mt-3 font-display text-2xl font-bold text-white">静默模式 / 纪念日设置</h3>
                <p className="mt-3 text-sm leading-7 text-neutral-400">
                  这里的设置会作用于整座共建馆。开启静默模式后，月度回顾、纪念日提醒和“那年今日”会暂停触发。
                </p>

                <div className="mt-5 space-y-4">
                  <label className="block space-y-2">
                    <span className="text-sm text-neutral-300">纪念日</span>
                    <input
                      value={settingsAnniversaryDate}
                      onChange={(event) => setSettingsAnniversaryDate(event.target.value)}
                      placeholder="例如 2024-08-18"
                      disabled={!canEditMuseumSettings}
                      className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none transition focus:border-remuse-accent"
                    />
                  </label>

                  <label className="flex items-start gap-3 rounded-[22px] border border-white/8 bg-black/15 p-4">
                    <input
                      type="checkbox"
                      checked={settingsQuietMode}
                      onChange={(event) => setSettingsQuietMode(event.target.checked)}
                      disabled={!canEditMuseumSettings}
                      className="mt-1 h-4 w-4 rounded border-white/20 bg-black text-remuse-accent focus:ring-remuse-accent"
                    />
                    <div>
                      <p className="text-sm font-semibold text-white">开启静默模式</p>
                      <p className="mt-1 text-sm leading-6 text-neutral-400">
                        开启后，这座共建馆暂时不会主动触发纪念日提醒和回忆推送，更适合低打扰模式。
                      </p>
                    </div>
                  </label>

                  <div className="rounded-[22px] border border-white/8 bg-black/15 p-4 text-sm text-neutral-300">
                    当前状态：{settingsQuietMode ? '已开启静默模式' : '默认提醒模式'}
                    {settingsAnniversaryDate ? ` · 纪念日 ${settingsAnniversaryDate}` : ' · 尚未设置纪念日'}
                  </div>

                  {settingsError ? (
                    <div className="rounded-[18px] border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200">
                      {settingsError}
                    </div>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => void handleSaveMuseumSettings()}
                    disabled={isSavingSettings || !canEditMuseumSettings}
                    className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full border border-remuse-accent/25 px-4 text-sm text-remuse-accent transition hover:border-remuse-accent hover:bg-remuse-accent/10 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-neutral-500"
                  >
                    <Save size={15} />
                    {isSavingSettings ? '保存中...' : '保存共建馆设置'}
                  </button>
                </div>
              </section>

              <section className="rounded-[30px] border border-remuse-border bg-remuse-panel p-5 shadow-[0_20px_56px_rgba(0,0,0,0.22)]">
                <p className="font-mono text-[11px] uppercase tracking-[0.32em] text-neutral-500">Lifecycle</p>
                <h3 className="mt-3 font-display text-2xl font-bold text-white">关系状态与邀请管理</h3>
                <p className="mt-3 text-sm leading-7 text-neutral-400">
                  这里是上线前必须具备的最小闭环：关闭邀请、重置邀请码、归档共建馆、结束关系，以及成员主动离开。
                </p>

                <div className="mt-5 space-y-3">
                  <div className="rounded-[22px] border border-white/8 bg-black/15 p-4 text-sm leading-7 text-neutral-300">
                    当前馆状态：{statusLabel}
                    {!activeMuseum.inviteEnabled ? ' · 邀请已关闭' : ' · 邀请仍可使用'}
                  </div>

                  {lifecycleError ? (
                    <div className="rounded-[18px] border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200">
                      {lifecycleError}
                    </div>
                  ) : null}

                  {isCreator ? (
                    <div className="grid gap-3">
                      <button
                        type="button"
                        onClick={() => void runLifecycleAction('archive', () => onChangeMuseumStatus(activeMuseum.id, 'archived'), '归档共建馆失败。')}
                        disabled={runningLifecycleAction === 'archive' || isReadOnlyMuseum}
                        className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-white/10 px-4 text-sm text-neutral-300 transition hover:border-white hover:text-white disabled:cursor-not-allowed disabled:border-white/10 disabled:text-neutral-500"
                      >
                        {runningLifecycleAction === 'archive' ? '归档中...' : '归档共建馆'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void runLifecycleAction('end', () => onChangeMuseumStatus(activeMuseum.id, 'ended'), '结束关系失败。')}
                        disabled={runningLifecycleAction === 'end' || activeMuseum.status === 'ended'}
                        className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-red-400/25 px-4 text-sm text-red-200 transition hover:border-red-300 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-neutral-500"
                      >
                        {runningLifecycleAction === 'end' ? '处理中...' : '结束关系'}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void runLifecycleAction('leave', () => onLeaveMuseum(activeMuseum.id, activeMuseum.name), '离开共建馆失败。')}
                      disabled={runningLifecycleAction === 'leave'}
                      className="inline-flex min-h-[44px] w-full items-center justify-center rounded-full border border-white/10 px-4 text-sm text-neutral-300 transition hover:border-white hover:text-white disabled:cursor-not-allowed disabled:border-white/10 disabled:text-neutral-500"
                    >
                      {runningLifecycleAction === 'leave' ? '离开中...' : '离开共建馆'}
                    </button>
                  )}
                </div>
              </section>
            </aside>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-full overflow-y-auto bg-[#0B0B0C] px-5 pb-10 pt-6 text-white md:px-8 lg:px-10">
      <div className="mx-auto w-full max-w-[1680px] space-y-6">
        {!activeMuseum ? (
          <>
            <section className="rounded-[30px] border border-remuse-border bg-[radial-gradient(circle_at_top_left,rgba(204,255,0,0.1),transparent_20%),radial-gradient(circle_at_top_right,rgba(34,211,238,0.1),transparent_26%),linear-gradient(180deg,rgba(17,20,24,0.98),rgba(10,12,16,0.98))] px-6 py-7 shadow-[0_20px_56px_rgba(0,0,0,0.24)] md:px-8 md:py-8">
              <div className="max-w-3xl">
                  <div className="inline-flex items-center gap-2 rounded-full border border-remuse-accent/20 bg-remuse-accent/10 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.3em] text-remuse-accent">
                    <Heart size={14} />
                    共享记忆空间
                  </div>
                  <h1 className="mt-4 font-display text-[3.15rem] font-black tracking-[-0.05em] text-white md:text-[3.85rem]">共建藏馆</h1>
              </div>
            </section>

            {renderCreateJoinPanel()}
          </>
        ) : (
          renderMuseumDetail()
        )}
      </div>
    </div>
  );
};

export default SharedMuseumHub;
