
import React, { Suspense, useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Layout from './components/Layout';
import Scanner from './components/Scanner';
import Gallery from './components/Gallery';
import RegenerationWorkshop, { WorkshopLaunchRequest } from './components/RegenerationWorkshop';
import LaunchScreen from './components/LaunchScreen';
import Onboarding from './components/Onboarding';
import ErrorBoundary from './components/ErrorBoundary';
import SkeletonScreen from './components/SkeletonScreen';
import LoginScreen from './components/LoginScreen';
import MilestoneCelebration, { isMilestone } from './components/MilestoneCelebration';
import FloatingNotice from './components/FloatingNotice';
import {
  CollectedItem,
  ExhibitionHall,
  ItemCategory,
  SavedJournal,
  SavedTransformationGuide,
  SaveJournalInput,
  SharedMuseumDetail,
  SharedMuseumSummary,
  TransformationGuideSourceItem,
  ViewState,
  Sticker,
  Tool,
  User,
} from './types';
import { generateAndSaveSticker, generateAndSaveTransformationGuide } from './services/geminiService';
import * as authService from './services/authService';
import { DEFAULT_HALLS, getHallNameById } from './services/halls';
import {
  createItemOnServer, updateItemOnServer, deleteItemOnServer,
  createStickerOnServer, deleteStickerOnServer,
  createJournalOnServer, updateJournalOnServer, deleteJournalOnServer,
  createHallOnServer, deleteHallOnServer, updateHallOnServer,
  createSharedMuseumOnServer, fetchSharedMuseumDetail, joinSharedMuseumOnServer, addItemToSharedMuseumOnServer, removeSharedMuseumItemOnServer, updateSharedMuseumItemOnServer, updateSharedMuseumOnServer,
  resetSharedMuseumInviteOnServer, revokeSharedMuseumInviteOnServer, leaveSharedMuseumOnServer, updateSharedMuseumStatusOnServer, saveSharedMuseumMonthlyReportOnServer,
  fetchItems,
} from './services/dataService';
import { loadUserWorkspace } from './services/userDataService';
import { lazyWithChunkRetry } from './services/lazyWithChunkRetry';
import { EMOJI_PACK_CATEGORY, PERLER_PATTERN_CATEGORY, isSourceSticker } from './shared/stickerCategories';

const ItemArchiveDetail = lazyWithChunkRetry(() => import('./components/ItemArchiveDetail'), 'ItemArchiveDetail');
const AdminWorkspace = lazyWithChunkRetry(() => import('./components/AdminWorkspace'), 'AdminWorkspace');
const CuratorOffice = lazyWithChunkRetry(() => import('./components/CuratorOffice'), 'CuratorOffice');
const StickerLibrary = lazyWithChunkRetry(() => import('./components/StickerLibrary'), 'StickerLibrary');
const EmojiPackStudio = lazyWithChunkRetry(() => import('./components/EmojiPackStudio'), 'EmojiPackStudio');
const PerlerPatternStudio = lazyWithChunkRetry(() => import('./components/PerlerPatternStudio'), 'PerlerPatternStudio');
const PerlerPatternItemStudio = lazyWithChunkRetry(() => import('./components/PerlerPatternItemStudio'), 'PerlerPatternItemStudio');
const InspirationPlaza = lazyWithChunkRetry(() => import('./components/InspirationPlaza'), 'InspirationPlaza');
const MemoryRagStudio = lazyWithChunkRetry(() => import('./components/MemoryRagStudio'), 'MemoryRagStudio');
const TransformationGuideStudio = lazyWithChunkRetry(() => import('./components/TransformationGuideStudio'), 'TransformationGuideStudio');
const SharedMuseumHub = lazyWithChunkRetry(() => import('./components/SharedMuseumHub'), 'SharedMuseumHub');

type AuthModalMode = 'login' | 'register' | 'forgotPassword' | 'resetPassword' | 'verifyEmail';
type WorkshopCanvasMode = 'PRINT';
type WorkshopViewState =
  | { kind: 'HOME' }
  | { kind: 'LIBRARY' }
  | { kind: 'EMOJI_PACK_STUDIO'; itemIds: string[]; sessionKey: string }
  | { kind: 'PERLER_PATTERN_STUDIO'; itemIds: string[]; sessionKey: string }
  | { kind: 'GUIDE_TASK'; taskId: string }
  | { kind: 'GUIDE_DETAIL'; guideId: string }
  | { kind: 'STICKER_STUDIO'; mode: WorkshopCanvasMode; stickerIds: string[]; sessionKey: string };

interface GuideGenerationTask {
  id: string;
  itemIds: string[];
  sourceItems: TransformationGuideSourceItem[];
  status: 'running' | 'completed' | 'failed';
  guideId?: string;
  error?: string | null;
}

interface BackgroundStudioSession {
  itemIds: string[];
  sessionKey: string;
}

interface PerlerStudioSession extends BackgroundStudioSession {
  restoredPattern?: Sticker | null;
  restoredSourceSticker?: Sticker | null;
}

interface AuthFlowState {
  mode: AuthModalMode;
  token: string | null;
  skipLaunch: boolean;
}

function getInitialAuthFlow(): AuthFlowState {
  if (typeof window === 'undefined') {
    return {
      mode: 'login',
      token: null,
      skipLaunch: false,
    };
  }

  const searchParams = new URLSearchParams(window.location.search);
  const token = searchParams.get('token')?.trim() || null;
  const authAction = searchParams.get('auth_action');

  if (authAction === 'reset-password' && token) {
    return {
      mode: 'resetPassword',
      token,
      skipLaunch: true,
    };
  }

  if (authAction === 'verify-email' && token) {
    return {
      mode: 'verifyEmail',
      token,
      skipLaunch: true,
    };
  }

  return {
    mode: 'login',
    token: null,
    skipLaunch: false,
  };
}

function clearAuthActionFromUrl() {
  if (typeof window === 'undefined') {
    return;
  }

  const url = new URL(window.location.href);
  url.searchParams.delete('auth_action');
  url.searchParams.delete('token');
  window.history.replaceState({}, '', url.toString());
}

const INITIAL_AUTH_FLOW = getInitialAuthFlow();

function getActionErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    const message = error.message.trim();
    if (message) {
      return message;
    }
  }

  return fallback;
}

const RouteLoader: React.FC<{ label: string }> = ({ label }) => (
  <div className="flex h-full items-center justify-center bg-remuse-dark px-4">
    <div className="inline-flex items-center gap-3 rounded-full border border-remuse-border bg-remuse-panel px-4 py-3 text-sm text-neutral-300">
      <div className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-700 border-t-remuse-accent" />
      {label}
    </div>
  </div>
);

function getDefaultSignedInView(nextUser: Pick<User, 'isAdmin'> | null | undefined): ViewState {
  return nextUser?.isAdmin ? 'ADMIN' : 'SCANNER';
}

function mergeServerManagedItemFields(localItem: CollectedItem, serverItem: CollectedItem) {
  return {
    ...localItem,
    imageUrl: serverItem.imageUrl || localItem.imageUrl,
    coverImageUrl: serverItem.coverImageUrl || localItem.coverImageUrl,
    coverPending: serverItem.coverPending,
    audioUrl: serverItem.audioUrl ?? localItem.audioUrl,
  };
}

function upsertSharedMuseumSummary(
  currentMuseums: SharedMuseumSummary[],
  nextMuseum: SharedMuseumSummary | SharedMuseumDetail,
) {
  const nextSummary: SharedMuseumSummary = {
    id: nextMuseum.id,
    name: nextMuseum.name,
    description: nextMuseum.description,
    inviteCode: nextMuseum.inviteCode,
    inviteEnabled: nextMuseum.inviteEnabled,
    status: nextMuseum.status,
    anniversaryDate: nextMuseum.anniversaryDate,
    theme: nextMuseum.theme,
    quietMode: nextMuseum.quietMode,
    coverImageUrl: nextMuseum.coverImageUrl,
    createdAt: nextMuseum.createdAt,
    updatedAt: nextMuseum.updatedAt,
    members: nextMuseum.members,
    itemCount: nextMuseum.itemCount,
    milestoneCount: nextMuseum.milestoneCount,
  };

  const nextList = currentMuseums.some((museum) => museum.id === nextSummary.id)
    ? currentMuseums.map((museum) => museum.id === nextSummary.id ? nextSummary : museum)
    : [nextSummary, ...currentMuseums];

  return nextList.sort((left, right) => String(right.updatedAt || '').localeCompare(String(left.updatedAt || '')));
}

const App: React.FC = () => {
  const [showLaunch, setShowLaunch] = useState(!INITIAL_AUTH_FLOW.skipLaunch);
  const [showOnboarding, setShowOnboarding] = useState(false);

  // ---- Auth State ----
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true); // 初始化期间检测 token
  const [authError, setAuthError] = useState<string | null>(null);
  const [showLogin, setShowLogin] = useState(false);
  const [loginMode, setLoginMode] = useState<AuthModalMode>(INITIAL_AUTH_FLOW.mode);
  const [authActionToken, setAuthActionToken] = useState<string | null>(INITIAL_AUTH_FLOW.token);
  const [isGuestUpgradeFlow, setIsGuestUpgradeFlow] = useState(false);

  // ---- App Data ----
  const [currentView, setCurrentView] = useState<ViewState>('SCANNER');
  const [items, setItems] = useState<CollectedItem[]>([]);
  const [halls, setHalls] = useState<ExhibitionHall[]>(DEFAULT_HALLS);
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [journals, setJournals] = useState<SavedJournal[]>([]);
  const [guides, setGuides] = useState<SavedTransformationGuide[]>([]);
  const [sharedMuseums, setSharedMuseums] = useState<SharedMuseumSummary[]>([]);
  const [selectedSharedMuseum, setSelectedSharedMuseum] = useState<SharedMuseumDetail | null>(null);
  const [selectedItem, setSelectedItem] = useState<CollectedItem | null>(null);
  const [workshopView, setWorkshopView] = useState<WorkshopViewState>({ kind: 'HOME' });
  const [guideTasks, setGuideTasks] = useState<GuideGenerationTask[]>([]);
  const [guideNotice, setGuideNotice] = useState<{
    tone: 'success' | 'error' | 'info';
    title: string;
    message: string;
  } | null>(null);
  const [emojiSession, setEmojiSession] = useState<BackgroundStudioSession | null>(null);
  const [perlerSession, setPerlerSession] = useState<PerlerStudioSession | null>(null);

  // Track sticker generation tasks globally
  const [generatingStickers, setGeneratingStickers] = useState<Record<string, boolean>>({});

  // Skeleton transition state
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [showContent, setShowContent] = useState(true);
  const prevViewRef = useRef<ViewState>(currentView);
  const currentViewRef = useRef<ViewState>(currentView);
  const workshopViewRef = useRef<WorkshopViewState>(workshopView);

  // Scanner remount key
  const [scannerKey, setScannerKey] = useState(0);

  // Milestone celebration state
  const [milestoneInfo, setMilestoneInfo] = useState<{ count: number; name: string } | null>(null);

  // Gallery: 从 Scanner 跳转时指定展馆
  const [pendingHallId, setPendingHallId] = useState<string | null>(null);
  const hasPendingItemCovers = useMemo(() => items.some((item) => item.coverPending), [items]);
  const pushTaskNotice = useCallback((
    tone: 'success' | 'error' | 'info',
    title: string,
    message: string,
  ) => {
    setGuideNotice({ tone, title, message });
  }, []);
  const handleOpenGuestUpgrade = useCallback(() => {
    setAuthError(null);
    setLoginMode('register');
    setAuthActionToken(null);
    setIsGuestUpgradeFlow(true);
    setShowLogin(true);
  }, []);

  const handleCloseAuthModal = useCallback(() => {
    setAuthError(null);
    setShowLogin(false);
    setLoginMode('login');
    setAuthActionToken(null);
    setIsGuestUpgradeFlow(false);
    clearAuthActionFromUrl();
  }, []);

  const handleCreateSharedMuseumLocal = useCallback(async (input: {
    name: string;
    description?: string;
    anniversaryDate?: string;
    theme?: string;
  }) => {
    const museum = await createSharedMuseumOnServer(input);
    setSelectedSharedMuseum(museum);
    setSharedMuseums((prev) => upsertSharedMuseumSummary(prev, museum));
    prevViewRef.current = currentViewRef.current;
    setCurrentView('SHARED_MUSEUMS');
    setShowContent(true);
    setIsTransitioning(false);
    pushTaskNotice('success', '共建藏馆已创建', `“${museum.name}”已经准备好，可以开始加入共同藏品了。`);
  }, [pushTaskNotice]);

  const handleJoinSharedMuseumLocal = useCallback(async (inviteCode: string) => {
    const result = await joinSharedMuseumOnServer(inviteCode);
    const museum = result.museum;
    setSelectedSharedMuseum(museum);
    setSharedMuseums((prev) => upsertSharedMuseumSummary(prev, museum));
    prevViewRef.current = currentViewRef.current;
    setCurrentView('SHARED_MUSEUMS');
    setShowContent(true);
    setIsTransitioning(false);
    pushTaskNotice(
      result.alreadyJoined ? 'info' : 'success',
      result.alreadyJoined ? '你已经在这座共建馆里了' : '已加入共建藏馆',
      result.alreadyJoined ? `“${museum.name}”已经在你的共建馆列表里。` : `你已加入“${museum.name}”，可以开始共建了。`,
    );
  }, [pushTaskNotice]);

  const handleAddItemToSharedMuseumLocal = useCallback(async (
    museumId: string,
    item: CollectedItem,
    extras?: {
      sharedNote?: string;
      relationLabel?: string;
    },
  ) => {
    const result = await addItemToSharedMuseumOnServer(museumId, {
      sourceItemId: item.id,
      sharedNote: extras?.sharedNote,
      relationLabel: extras?.relationLabel,
    });

    setSharedMuseums((prev) => upsertSharedMuseumSummary(prev, result.museum));
    setSelectedSharedMuseum((prev) => prev?.id === result.museum.id ? result.museum : prev);
    pushTaskNotice('success', '已加入共建藏馆', `“${item.name}”已加入共享记忆空间。`);
  }, [pushTaskNotice]);

  const handleUpdateSharedMuseumItem = useCallback(async (
    museumId: string,
    itemId: string,
    updates: {
      sharedNote?: string;
      relationLabel?: string;
    },
  ) => {
    const result = await updateSharedMuseumItemOnServer(museumId, itemId, updates);
    setSharedMuseums((prev) => upsertSharedMuseumSummary(prev, result.museum));
    setSelectedSharedMuseum((prev) => prev?.id === result.museum.id ? result.museum : prev);
    pushTaskNotice('success', '共建备注已更新', '这件共享藏品的共同备注已经保存。');
  }, [pushTaskNotice]);

  const handleRemoveSharedMuseumItem = useCallback(async (
    museumId: string,
    itemId: string,
    itemName: string,
  ) => {
    const result = await removeSharedMuseumItemOnServer(museumId, itemId);
    setSharedMuseums((prev) => upsertSharedMuseumSummary(prev, result.museum));
    setSelectedSharedMuseum((prev) => prev?.id === result.museum.id ? result.museum : prev);
    pushTaskNotice('info', '已移出共建馆', `“${itemName}”已从这座共建藏馆中移出。`);
  }, [pushTaskNotice]);

  const handleSaveSharedMuseumMonthlyReport = useCallback(async (
    museumId: string,
    snapshot: {
      monthKey: string;
      monthLabel: string;
      itemCount: number;
      categoryCount: number;
      topCategories: string[];
      topTags: string[];
      relationLabels: string[];
      highlights: string[];
      narrative: string;
      timeline: Array<{
        id: string;
        name: string;
        dateLabel: string;
        sharedNote: string;
        relationLabel: string;
        coverImageUrl: string;
        imageUrl: string;
      }>;
      milestoneMessage: string | null;
    },
  ) => {
    const museum = await saveSharedMuseumMonthlyReportOnServer(museumId, snapshot);
    setSelectedSharedMuseum(museum);
    setSharedMuseums((prev) => upsertSharedMuseumSummary(prev, museum));
    pushTaskNotice('success', '月度回顾已保存', `${snapshot.monthLabel} 的共建月报已经写入共享藏品馆。`);
  }, [pushTaskNotice]);

  // ============================================================
  // 启动时：验证已存储 token 或自动创建游客
  // ============================================================
  useEffect(() => {
    let isActive = true;

    (async () => {
      try {
        const me = await authService.getMe();
        if (!isActive) return;
        setUser(me);
        setCurrentView(getDefaultSignedInView(me));
        await loadUserData(me);
      } catch {
        // Token 失效，清除
        authService.resetClientSession();
      } finally {
        if (isActive) {
          setAuthLoading(false);
        }
      }
    })();

    return () => {
      isActive = false;
    };
  }, []);

  // 加载用户数据（物品 + 贴纸 + 自定义展馆）
  useEffect(() => {
    if (showLaunch || authLoading) {
      return;
    }

    if (!user) {
      setShowOnboarding(false);
      if (!authActionToken) {
        setLoginMode('login');
      }
      setIsGuestUpgradeFlow(false);
      setShowLogin(true);
      return;
    }

    if (user.isAdmin) {
      setShowOnboarding(false);
      return;
    }

    if (!user.onboardingSeen) {
      setShowOnboarding(true);
      return;
    }

    setShowOnboarding(false);
  }, [authActionToken, authLoading, showLaunch, user]);

  useEffect(() => {
    if (showLaunch || authLoading) {
      return;
    }

    if (authActionToken && (loginMode === 'resetPassword' || loginMode === 'verifyEmail')) {
      setShowLogin(true);
    }
  }, [authActionToken, authLoading, loginMode, showLaunch]);

  useEffect(() => {
    currentViewRef.current = currentView;
  }, [currentView]);

  useEffect(() => {
    workshopViewRef.current = workshopView;
  }, [workshopView]);

  const loadUserData = async (currentUser: User | null = user) => {
    try {
      const workspace = await loadUserWorkspace(currentUser);
      setItems(workspace.items);
      setStickers(workspace.stickers);
      setJournals(workspace.journals);
      setGuides(workspace.guides);
      setHalls(workspace.halls);
      setSharedMuseums(workspace.sharedMuseums);
      setSelectedSharedMuseum((prev) => {
        if (!prev) {
          return prev;
        }

        const latestSummary = workspace.sharedMuseums.find((museum) => museum.id === prev.id);
        return latestSummary ? { ...prev, ...latestSummary } : null;
      });
      if (workspace.user) {
        setUser(workspace.user);
      }
      return;

      /* const [fetchedItems, fetchedStickers, fetchedHalls] = await Promise.all([
        fetchItems(),
        fetchStickers(),
        fetchHalls(),
      ]);
      const safeItems = Array.isArray(fetchedItems) ? fetchedItems : [];
      const safeStickers = Array.isArray(fetchedStickers) ? fetchedStickers : [];
      const safeHalls = Array.isArray(fetchedHalls) ? fetchedHalls : [];

      setItems(safeItems);
      setStickers(safeStickers);
      // 合并：内置展馆 + 用户自定义展馆
      setHalls(mergeHalls(safeHalls));

      // ---- 新用户自动加载示例数据 ----
      // Legacy sample-seeding branch removed.
        try {
          // Sample loading has been retired.
          if (sampleItems.length > 0) {
            setItems(sampleItems);
            // Sample preference writes have been retired.
            setUser(updatedUser);
          }
        } catch (err) {
          console.error('加载示例数据失败:', err);
        }
      }
      */
    } catch (err) {
      console.error('加载用户数据失败:', err);
    }
  };

  // ============================================================
  // 登录 / 注册 / 游客
  // ============================================================
  const handleGuestLogin = async () => {
    setAuthError(null);
    setAuthLoading(true);
    try {
      const { user: u } = await authService.loginAsGuest();
      setUser(u);
      setCurrentView(getDefaultSignedInView(u));
      setShowLogin(false);
      setLoginMode('login');
      setAuthActionToken(null);
      setIsGuestUpgradeFlow(false);
      clearAuthActionFromUrl();
      await loadUserData(u);
    } catch (err: any) {
      setAuthError(err.message || '游客登录失败');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogin = async (email: string, password: string) => {
    setAuthError(null);
    setAuthLoading(true);
    try {
      const { user: u } = await authService.login(email, password);
      setUser(u);
      setCurrentView(getDefaultSignedInView(u));
      setShowLogin(false);
      setLoginMode('login');
      setAuthActionToken(null);
      setIsGuestUpgradeFlow(false);
      clearAuthActionFromUrl();
      await loadUserData(u);
    } catch (err: any) {
      setAuthError(err.message || '登录失败');
      throw err;
    } finally {
      setAuthLoading(false);
    }
  };

  const handleRegister = async (email: string, password: string, nickname: string, acceptPolicies: boolean) => {
    setAuthError(null);
    setAuthLoading(true);
    try {
      const { user: u } = await authService.register(email, password, nickname, acceptPolicies);
      setUser(u);
      setCurrentView(u.isAdmin ? 'ADMIN' : (!u.emailVerified ? 'PROFILE' : 'SCANNER'));
      setShowLogin(false);
      setLoginMode('login');
      setAuthActionToken(null);
      setIsGuestUpgradeFlow(false);
      clearAuthActionFromUrl();
      await loadUserData(u);
    } catch (err: any) {
      setAuthError(err.message || '注册失败');
      throw err;
    } finally {
      setAuthLoading(false);
    }
  };

  useEffect(() => {
    if (!user || !hasPendingItemCovers) {
      return;
    }

    let isCancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let isFetching = false;

    const pollPendingCovers = async () => {
      if (isCancelled || isFetching) {
        return;
      }

      isFetching = true;
      try {
        const latestItems = await fetchItems();
        if (isCancelled) {
          return;
        }

        const latestById = new Map(latestItems.map((item) => [item.id, item]));
        setItems((prev) => prev.map((item) => {
          const latest = latestById.get(item.id);
          return latest ? mergeServerManagedItemFields(item, latest) : item;
        }));
        setSelectedItem((prev) => {
          if (!prev) {
            return prev;
          }

          const latest = latestById.get(prev.id);
          return latest ? mergeServerManagedItemFields(prev, latest) : prev;
        });
      } catch (error) {
        console.error('轮询刷新待生成封面失败：', error);
      } finally {
        isFetching = false;
        if (!isCancelled) {
          timeoutId = setTimeout(pollPendingCovers, 2500);
        }
      }
    };

    void pollPendingCovers();

    return () => {
      isCancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [hasPendingItemCovers, user]);

  const handleForgotPassword = async (email: string) => {
    setAuthError(null);
    setAuthLoading(true);
    try {
      const response = await authService.requestPasswordReset(email);
      return response.message || '如果该邮箱已注册，我们已经发送了重置密码邮件。';
    } catch (err: any) {
      setAuthError(err.message || '发送找回密码邮件失败');
      throw err;
    } finally {
      setAuthLoading(false);
    }
  };

  const handleResetPassword = async (token: string, newPassword: string) => {
    setAuthError(null);
    setAuthLoading(true);
    try {
      const { user: u } = await authService.resetPassword(token, newPassword);
      setUser(u);
      setCurrentView(getDefaultSignedInView(u));
      setShowLogin(false);
      setLoginMode('login');
      setAuthActionToken(null);
      setIsGuestUpgradeFlow(false);
      clearAuthActionFromUrl();
      await loadUserData(u);
    } catch (err: any) {
      setAuthError(err.message || '重置密码失败');
      throw err;
    } finally {
      setAuthLoading(false);
    }
  };

  const handleVerifyEmail = async (token: string) => {
    setAuthError(null);
    setAuthLoading(true);
    try {
      const response = await authService.verifyEmail(token);
      clearAuthActionFromUrl();
      setAuthActionToken(null);

      try {
        const refreshedUser = await authService.getMe();
        setUser(refreshedUser);
      } catch {
        if (response.user && user?.id === response.user.id) {
          setUser(response.user);
        }
      }

      return response.message || '邮箱验证成功。';
    } catch (err: any) {
      setAuthError(err.message || '邮箱验证失败');
      throw err;
    } finally {
      setAuthLoading(false);
    }
  };

  // ============================================================
  // 视图切换
  // ============================================================
  const handleChangeView = useCallback((newView: ViewState) => {
    if (newView === currentView) {
      if (newView === 'SCANNER') setScannerKey(k => k + 1);
      return;
    }
    prevViewRef.current = currentView;

    if (newView === 'SCANNER') {
      setCurrentView(newView);
      setShowContent(true);
      setIsTransitioning(false);
      return;
    }

    setIsTransitioning(true);
    setShowContent(false);
    setTimeout(() => {
      setCurrentView(newView);
      setIsTransitioning(false);
      requestAnimationFrame(() => setShowContent(true));
    }, 280);
  }, [currentView]);

  const handleOpenSharedMuseum = useCallback(async (museumId: string) => {
    const museum = await fetchSharedMuseumDetail(museumId);
    setSelectedSharedMuseum(museum);
    setSharedMuseums((prev) => upsertSharedMuseumSummary(prev, museum));
    handleChangeView('SHARED_MUSEUMS');
  }, [handleChangeView]);

  const handleUpdateSharedMuseumSettings = useCallback(async (
    museumId: string,
    updates: {
      anniversaryDate?: string;
      quietMode?: boolean;
    },
  ) => {
    const museum = await updateSharedMuseumOnServer(museumId, updates);
    setSelectedSharedMuseum(museum);
    setSharedMuseums((prev) => upsertSharedMuseumSummary(prev, museum));
    pushTaskNotice(
      'success',
      '共建馆设置已更新',
      updates.quietMode ? '静默模式和纪念日设置已经保存，回顾与提醒会暂停。' : '纪念日和静默模式设置已经保存。',
    );
  }, [pushTaskNotice]);

  const handleResetSharedMuseumInvite = useCallback(async (museumId: string) => {
    const museum = await resetSharedMuseumInviteOnServer(museumId);
    setSelectedSharedMuseum(museum);
    setSharedMuseums((prev) => upsertSharedMuseumSummary(prev, museum));
    pushTaskNotice('success', '邀请码已重置', '旧邀请码已经失效，请把新的邀请码发给对方。');
  }, [pushTaskNotice]);

  const handleRevokeSharedMuseumInvite = useCallback(async (museumId: string) => {
    const museum = await revokeSharedMuseumInviteOnServer(museumId);
    setSelectedSharedMuseum(museum);
    setSharedMuseums((prev) => upsertSharedMuseumSummary(prev, museum));
    pushTaskNotice('info', '邀请已关闭', '这座共建馆暂时不再接受新成员加入。');
  }, [pushTaskNotice]);

  const handleLeaveSharedMuseum = useCallback(async (museumId: string, museumName: string) => {
    await leaveSharedMuseumOnServer(museumId);
    setSharedMuseums((prev) => prev.filter((museum) => museum.id !== museumId));
    setSelectedSharedMuseum((prev) => (prev?.id === museumId ? null : prev));
    pushTaskNotice('info', '已离开共建馆', `你已离开“${museumName}”。`);
  }, [pushTaskNotice]);

  const handleChangeSharedMuseumStatus = useCallback(async (
    museumId: string,
    status: 'archived' | 'ended',
  ) => {
    const museum = await updateSharedMuseumStatusOnServer(museumId, status);
    setSelectedSharedMuseum(museum);
    setSharedMuseums((prev) => upsertSharedMuseumSummary(prev, museum));
    pushTaskNotice(
      'info',
      status === 'archived' ? '共建馆已归档' : '关系已结束',
      status === 'archived'
        ? '这座共建馆已转为归档状态，后续不会再继续增长。'
        : '这座共建馆已进入结束状态，并自动关闭邀请与回顾触发。',
    );
  }, [pushTaskNotice]);

  const handleCreateSharedMuseum = useCallback(async (input: {
    name: string;
    description?: string;
    anniversaryDate?: string;
    theme?: string;
  }) => {
    const museum = await createSharedMuseumOnServer(input);
    setSelectedSharedMuseum(museum);
    setSharedMuseums((prev) => upsertSharedMuseumSummary(prev, museum));
    handleChangeView('SHARED_MUSEUMS');
    pushTaskNotice('success', '共建藏馆已创建', `“${museum.name}”已经准备好，可以开始加入共同藏品了。`);
  }, [handleChangeView, pushTaskNotice]);

  const handleJoinSharedMuseum = useCallback(async (inviteCode: string) => {
    const result = await joinSharedMuseumOnServer(inviteCode);
    const museum = result.museum;
    setSelectedSharedMuseum(museum);
    setSharedMuseums((prev) => upsertSharedMuseumSummary(prev, museum));
    handleChangeView('SHARED_MUSEUMS');
    pushTaskNotice(
      result.alreadyJoined ? 'info' : 'success',
      result.alreadyJoined ? '你已经在这座共建馆里了' : '已加入共建藏馆',
      result.alreadyJoined ? `“${museum.name}”已经在你的共建馆列表里。` : `你已加入“${museum.name}”，可以开始共建了。`,
    );
  }, [handleChangeView, pushTaskNotice]);

  const handleAddItemToSharedMuseum = useCallback(async (
    museumId: string,
    item: CollectedItem,
    extras?: {
      sharedNote?: string;
      relationLabel?: string;
    },
  ) => {
    const result = await addItemToSharedMuseumOnServer(museumId, {
      sourceItemId: item.id,
      sharedNote: extras?.sharedNote,
      relationLabel: extras?.relationLabel,
    });

    setSharedMuseums((prev) => upsertSharedMuseumSummary(prev, result.museum));
    setSelectedSharedMuseum((prev) => prev?.id === result.museum.id ? result.museum : prev);
    pushTaskNotice('success', '已加入共建藏馆', `“${item.name}”已加入共享记忆空间。`);
  }, [pushTaskNotice]);

  // ============================================================
  // 启动 & 引导
  // ============================================================
  const handleLaunchComplete = () => {
    setShowLaunch(false);
      // 没有已登录账号，展示登录/游客选择
  };

  const handleOnboardingComplete = async () => {
    try {
      const updatedUser = await authService.updatePreferences({ onboardingSeen: true });
      setUser(updatedUser);
    } catch (err) {
      console.error('更新引导状态失败:', err);
    }
    setShowOnboarding(false);
  };

  // ============================================================
  // 数据处理（UI + API 双写）
  // ============================================================
  const ecoPoints = useMemo(() => {
    return items.reduce((total, item) => {
      let points = 5;
      if (item.status === 'remused') points += 10;
      return total + points;
    }, 0);
  }, [items]);

  const activeGuideTask = useMemo(() => {
    if (workshopView.kind !== 'GUIDE_TASK') {
      return null;
    }

    return guideTasks.find((task) => task.id === workshopView.taskId) || null;
  }, [guideTasks, workshopView]);

  const activeGuide = useMemo(() => {
    if (workshopView.kind === 'GUIDE_DETAIL') {
      return guides.find((guide) => guide.id === workshopView.guideId) || null;
    }

    if (workshopView.kind === 'GUIDE_TASK' && activeGuideTask?.guideId) {
      return guides.find((guide) => guide.id === activeGuideTask.guideId) || null;
    }

    return null;
  }, [activeGuideTask, guides, workshopView]);

  const activeGuideSourceItems = useMemo(() => {
    if (activeGuide) {
      return activeGuide.sourceItems;
    }

    return activeGuideTask?.sourceItems || [];
  }, [activeGuide, activeGuideTask]);

  const activeGuideItems = useMemo(() => {
    const itemIds = new Set(activeGuide?.itemIds || activeGuideTask?.itemIds || []);
    return items.filter((item) => itemIds.has(item.id));
  }, [activeGuide, activeGuideTask, items]);

  const workshopResultStats = useMemo(() => ({
    stickers: stickers.filter((sticker) => isSourceSticker(sticker)).length,
    emojiPacks: stickers.filter((sticker) => sticker.category === EMOJI_PACK_CATEGORY).length,
    perlerPatterns: stickers.filter((sticker) => sticker.category === PERLER_PATTERN_CATEGORY).length,
    guides: guides.length,
  }), [guides.length, stickers]);

  useEffect(() => {
    if (workshopView.kind === 'GUIDE_TASK' && !activeGuideTask) {
      setWorkshopView({ kind: 'HOME' });
    }

    if (workshopView.kind === 'GUIDE_DETAIL' && !activeGuide) {
      setWorkshopView({ kind: 'LIBRARY' });
    }
  }, [activeGuide, activeGuideTask, workshopView]);

  const insertItemIntoState = useCallback((item: CollectedItem) => {
    setItems(prev => {
      const updated = [item, ...prev];
      if (isMilestone(updated.length)) {
        setTimeout(() => setMilestoneInfo({ count: updated.length, name: item.name }), 600);
      }
      return updated;
    });
  }, []);

  const enqueueItemCoverGeneration = useCallback(() => {
    // Cover generation now happens on the server during archive create/update.
  }, []);

  const handleAddItem = async (newItem: CollectedItem): Promise<CollectedItem> => {
    if (!user) {
      insertItemIntoState(newItem);
      return newItem;
    }
    // 先乐观更新 UI
    // 持久化到服务器
    if (user) {
      try {
        // imageUrl 如果是 data: URI，转为 imageBase64 上传
        const isDataUrl = newItem.imageUrl?.startsWith('data:');
        const saved = await createItemOnServer({
          name: newItem.name,
          hallId: newItem.hallId,
          category: newItem.category,
          material: newItem.material,
          description: newItem.description,
          imageBase64: isDataUrl ? newItem.imageUrl : undefined,
          audioBase64: newItem.audioUrl?.startsWith('data:') ? newItem.audioUrl : undefined,
          story: newItem.story,
          tags: newItem.tags,
          status: newItem.status,
          dateCollected: newItem.dateCollected,
        });
        const savedItem: CollectedItem = {
          ...newItem,
          ...saved,
          id: saved.id,
          imageUrl: saved.imageUrl || newItem.imageUrl,
          coverImageUrl: saved.coverImageUrl || newItem.coverImageUrl,
          audioUrl: saved.audioUrl || newItem.audioUrl,
        };
        insertItemIntoState(savedItem);
        return savedItem;
        // 用服务端 ID 和图片路径替换，但保留本地可能已被用户修改过的字段（防止竞态覆盖）
        let mergedItem: CollectedItem | null = null;
        setItems(prev => prev.map(it => {
          if (it.id === newItem.id) {
            mergedItem = {
              ...it,           // 保留当前本地状态（用户可能已修改 category 等字段）
              id: saved.id,    // 使用服务端 ID
              imageUrl: saved.imageUrl || it.imageUrl, // 使用服务端图片路径
              coverImageUrl: saved.coverImageUrl || it.coverImageUrl,
            };
            return mergedItem;
          }
          return it;
        }));
        // 同步 selectedItem
        setSelectedItem(prev => {
          if (prev?.id === newItem.id && mergedItem) return mergedItem;
          return prev;
        });
        if (mergedItem && !(mergedItem as CollectedItem).coverImageUrl) {
          enqueueItemCoverGeneration((mergedItem as CollectedItem).id, mergedItem as CollectedItem);
        }
        // 如果在保存期间用户修改了 category，补发更新到服务器
        if (
          mergedItem &&
          ((mergedItem as CollectedItem).hallId !== newItem.hallId ||
            (mergedItem as CollectedItem).category !== newItem.category)
        ) {
          try {
            await updateItemOnServer(saved.id, {
              hallId: (mergedItem as CollectedItem).hallId,
              category: (mergedItem as CollectedItem).category,
            });
          } catch (err) {
            console.error('补发分类修改到服务器失败:', err);
          }
        }
      } catch (err) {
        console.error('保存物品到服务器失败:', err);
      }
    }
    insertItemIntoState(newItem);
    return newItem;
  };

  const handleUpdateItem = async (updatedItem: CollectedItem): Promise<CollectedItem> => {
    // 解析实际 ID：Scanner 的 analysisResult 可能持有客户端旧 ID，
    // 而 items 数组中的 ID 已被服务端 ID 替换，需要兜底匹配。
    let resolvedId = updatedItem.id;
    const existingItem = items.find(item => item.id === updatedItem.id)
      || items.find(item => item.name === updatedItem.name && item.dateCollected === updatedItem.dateCollected)
      || null;
    const shouldRegenerateCover = Boolean(
      existingItem
      && (
        existingItem.hallId !== updatedItem.hallId
        || (!existingItem.coverImageUrl && !!updatedItem.imageUrl)
        || (updatedItem.imageUrl?.startsWith('data:') && updatedItem.imageUrl !== existingItem.imageUrl)
      ),
    );

    setItems(prev => {
      let idx = prev.findIndex(item => item.id === updatedItem.id);
      // Fallback: 按 name + dateCollected 匹配（ID 可能因服务端同步而变化）
      if (idx < 0) {
        idx = prev.findIndex(item =>
          item.name === updatedItem.name && item.dateCollected === updatedItem.dateCollected
        );
      }
      if (idx < 0) return prev;

      const existing = prev[idx];
      resolvedId = existing.id; // 使用 items 数组中的真实 ID
      const merged: CollectedItem = {
        ...updatedItem,
        id: existing.id,
        // 保留服务端图片路径（避免被客户端 data URL 覆盖）
        imageUrl: shouldRegenerateCover
          ? existing.imageUrl
          : (existing.imageUrl?.startsWith('/') ? existing.imageUrl : updatedItem.imageUrl),
        coverImageUrl: shouldRegenerateCover
          ? existing.coverImageUrl
          : (updatedItem.coverImageUrl || existing.coverImageUrl),
        audioUrl: updatedItem.audioUrl ?? existing.audioUrl,
      };
      return prev.map((item, i) => i === idx ? merged : item);
    });

    if (selectedItem?.id === updatedItem.id || selectedItem?.id === resolvedId) {
      setSelectedItem({
        ...updatedItem,
        id: resolvedId,
        coverImageUrl: shouldRegenerateCover
          ? existingItem?.coverImageUrl
          : (updatedItem.coverImageUrl || existingItem?.coverImageUrl),
        audioUrl: updatedItem.audioUrl ?? existingItem?.audioUrl,
      });
    }

    if (user) {
      try {
        const imageUrl = updatedItem.imageUrl;
        const isDataUrl = imageUrl?.startsWith('data:');
        const nextAudioUrl = updatedItem.audioUrl || '';
        const shouldClearAudio = !nextAudioUrl && !!existingItem?.audioUrl;
        const saved = await updateItemOnServer(resolvedId, {
          name: updatedItem.name,
          hallId: updatedItem.hallId,
          category: updatedItem.category,
          material: updatedItem.material,
          description: updatedItem.description,
          imageBase64: isDataUrl ? imageUrl : undefined,
          coverImageBase64: updatedItem.coverImageUrl?.startsWith('data:') ? updatedItem.coverImageUrl : undefined,
          audioBase64: nextAudioUrl.startsWith('data:') ? nextAudioUrl : undefined,
          clearAudio: shouldClearAudio,
          story: updatedItem.story,
          tags: updatedItem.tags,
          status: updatedItem.status,
        });
        setItems(prev => prev.map(item => (
          item.id === resolvedId
            ? {
              ...item,
              ...saved,
              imageUrl: saved.imageUrl || item.imageUrl,
              coverImageUrl: saved.coverImageUrl || item.coverImageUrl,
              audioUrl: saved.audioUrl || (shouldClearAudio ? '' : item.audioUrl),
            }
            : item
        )));
        setSelectedItem(prev => (
          prev?.id === resolvedId
            ? {
              ...prev,
              ...saved,
              imageUrl: saved.imageUrl || prev.imageUrl,
              coverImageUrl: saved.coverImageUrl || prev.coverImageUrl,
              audioUrl: saved.audioUrl || (shouldClearAudio ? '' : prev.audioUrl),
            }
            : prev
        ));
        return saved;
      } catch (err) {
        console.error('更新物品到服务器失败:', err);
      }
    }
    return updatedItem;
  };

  const handleDeleteItem = async (itemId: string) => {
    const targetItem = items.find((item) => item.id === itemId) ?? null;

    if (user) {
      try {
        await deleteItemOnServer(itemId);
      } catch (err) {
        console.error('删除物品从服务器失败:', err);
        pushTaskNotice('error', '删除藏品失败', getActionErrorMessage(err, '服务器暂时没有完成删除，请稍后再试。'));
        return;
      }
    }

    setItems(prev => prev.filter(item => item.id !== itemId));
    if (selectedItem?.id === itemId) {
      setSelectedItem(null);
      handleChangeView('MUSEUM');
    }
    pushTaskNotice(
      'info',
      '藏品已删除',
      targetItem ? `“${targetItem.name}”已从藏品馆移除。` : '这件藏品已从藏品馆移除。',
    );
  };

  const persistGeneratedSticker = async (newSticker: Sticker): Promise<Sticker> => {
    setStickers(prev => [newSticker, ...(Array.isArray(prev) ? prev : [])]);

    if (user) {
      try {
        const isDataUrl = newSticker.stickerImageUrl?.startsWith('data:');
        const saved = await createStickerOnServer({
          originalItemId: newSticker.originalItemId?.trim() || undefined,
          imageBase64: isDataUrl ? newSticker.stickerImageUrl : undefined,
          imageUrl: !isDataUrl ? newSticker.stickerImageUrl : undefined,
          dramaText: newSticker.dramaText,
          category: newSticker.category,
          dateCreated: newSticker.dateCreated,
          metadata: newSticker.metadata,
        });
        setStickers(prev => (Array.isArray(prev) ? prev : []).map(s => s.id === newSticker.id ? { ...saved } : s));
        return saved;
      } catch (err) {
        setStickers(prev => (Array.isArray(prev) ? prev : []).filter(s => s.id !== newSticker.id));
        console.error('保存贴纸到服务器失败:', err);
        throw err;
      }
    }

    return newSticker;
  };

  const handleStickerCreated = async (newSticker: Sticker) => {
    await persistGeneratedSticker(newSticker);
  };

  const handleSaveJournal = async (journalInput: SaveJournalInput): Promise<SavedJournal> => {
    const saved = journalInput.id
      ? await updateJournalOnServer(journalInput.id, journalInput)
      : await createJournalOnServer(journalInput);

    setJournals((prev) => [saved, ...prev.filter((journal) => journal.id !== saved.id)]);
    return saved;
  };

  const handleDeleteJournal = async (id: string) => {
    const targetJournal = journals.find((journal) => journal.id === id) ?? null;

    if (user) {
      try {
        await deleteJournalOnServer(id);
      } catch (err) {
        console.error('删除手账从服务器失败:', err);
        pushTaskNotice('error', '删除手账失败', getActionErrorMessage(err, '服务器暂时没有完成删除，请稍后再试。'));
        return;
      }
    }

    setJournals((prev) => prev.filter((journal) => journal.id !== id));
    pushTaskNotice(
      'info',
      '手账已删除',
      targetJournal ? `《${targetJournal.title}》已从手账库移除。` : '这篇手账已从手账库移除。',
    );
  };

  const handleDeleteSticker = async (id: string) => {
    const targetSticker = (Array.isArray(stickers) ? stickers : []).find((sticker) => sticker.id === id) ?? null;
    const stickerLabel =
      targetSticker?.category === PERLER_PATTERN_CATEGORY
        ? '拼豆图纸'
        : targetSticker?.category === EMOJI_PACK_CATEGORY
          ? '表情包'
          : '再生成果';

    if (user) {
      try {
        await deleteStickerOnServer(id);
      } catch (err) {
        console.error('删除贴纸从服务器失败:', err);
        pushTaskNotice('error', `删除${stickerLabel}失败`, getActionErrorMessage(err, '服务器暂时没有完成删除，请稍后再试。'));
        return;
      }
    }

    setStickers(prev => (Array.isArray(prev) ? prev : []).filter(s => s.id !== id));
    pushTaskNotice(
      'info',
      `${stickerLabel}已删除`,
      targetSticker?.dramaText?.trim()
        ? `“${targetSticker.dramaText.trim()}”已从再生成果库移除。`
        : `这份${stickerLabel}已从再生成果库移除。`,
    );
  };

  const handleGenerateStickerRequest = async (item: CollectedItem) => {
    if (generatingStickers[item.id]) {
      throw new Error('这件藏品正在生成贴纸，请稍候。');
    }

    setGeneratingStickers(prev => ({ ...prev, [item.id]: true }));

    try {
      const sourceImageUrl = item.imageUrl || item.coverImageUrl || '';
      if (!sourceImageUrl) {
        throw new Error('这件藏品缺少可用于生成贴纸的图片。');
      }

      const savedSticker = await generateAndSaveSticker(
        item.id && !sourceImageUrl.startsWith('data:')
          ? {
            itemId: item.id,
            itemName: item.name,
            category: item.category,
            dateCreated: new Date().toISOString(),
          }
          : {
            imageBase64: sourceImageUrl,
            itemName: item.name,
            category: item.category,
            dateCreated: new Date().toISOString(),
          },
      );

      setStickers(prev => [savedSticker, ...(Array.isArray(prev) ? prev : []).filter(s => s.id !== savedSticker.id)]);
      return savedSticker;
    } catch (err) {
      console.error('贴纸生成失败，藏品 ID：', item.id, err);
      throw err;
    } finally {
      setGeneratingStickers(prev => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
    }
  };

  const buildGuideSourceSnapshot = useCallback((item: CollectedItem): TransformationGuideSourceItem => ({
    id: item.id,
    name: item.name,
    category: item.category,
    material: item.material,
    description: item.description || '',
    story: item.story || '',
    tags: item.tags || [],
    imageUrl: item.imageUrl,
    coverImageUrl: item.coverImageUrl || item.imageUrl,
  }), []);

  const runGuideGenerationTask = useCallback(async (taskId: string, sourceItems: TransformationGuideSourceItem[]) => {
    try {
      const inputs = sourceItems.map((item) => ({
        id: item.id,
        name: item.name,
        category: item.category,
        material: item.material,
        description: item.description || '',
        story: item.story || '',
        tags: item.tags || [],
      }));

      const savedGuide = await generateAndSaveTransformationGuide(inputs, new Date().toISOString());

      setGuides((prev) => [savedGuide, ...prev.filter((guide) => guide.id !== savedGuide.id)]);
      setGuideTasks((prev) => prev.map((task) => (
        task.id === taskId
          ? { ...task, status: 'completed', guideId: savedGuide.id, error: null }
          : task
      )));

      const currentWorkshopView = workshopViewRef.current;
      const shouldOpenGuideNow = currentViewRef.current === 'STICKER_LIBRARY'
        && currentWorkshopView.kind === 'GUIDE_TASK'
        && currentWorkshopView.taskId === taskId;

      if (shouldOpenGuideNow) {
        setGuideNotice(null);
        setWorkshopView({ kind: 'GUIDE_DETAIL', guideId: savedGuide.id });
        return;
      }

      setGuideNotice({
        tone: 'success',
        title: '综合改造指南已生成',
        message: '结果已经自动存入再生成果库，可以随时回来查看。',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '综合改造指南生成失败，请稍后重试。';

      setGuideTasks((prev) => prev.map((task) => (
        task.id === taskId
          ? { ...task, status: 'failed', error: message }
          : task
      )));

      const currentWorkshopView = workshopViewRef.current;
      const isViewingTask = currentViewRef.current === 'STICKER_LIBRARY'
        && currentWorkshopView.kind === 'GUIDE_TASK'
        && currentWorkshopView.taskId === taskId;

      if (!isViewingTask) {
        setGuideNotice({
          tone: 'error',
          title: '综合改造指南生成失败',
          message,
        });
      }
    }
  }, []);

  const handleRetryGuideTask = useCallback((task: GuideGenerationTask) => {
    setGuideNotice(null);
    setGuideTasks((prev) => prev.map((entry) => (
      entry.id === task.id
        ? { ...entry, status: 'running', error: null }
        : entry
    )));
    setWorkshopView({ kind: 'GUIDE_TASK', taskId: task.id });
    void runGuideGenerationTask(task.id, task.sourceItems);
  }, [runGuideGenerationTask]);

  const handleOpenWorkshopLibrary = useCallback(() => {
    setWorkshopView({ kind: 'LIBRARY' });
  }, []);

  const handleOpenPerlerPatternFromLibrary = useCallback((pattern: Sticker) => {
    const savedSnapshot = pattern.metadata?.perlerPatternSnapshot;
    if (savedSnapshot) {
      const itemIds = pattern.originalItemId ? [pattern.originalItemId] : [];
      const sessionKey = `PERLER_PATTERN-LIBRARY-${Date.now()}-${pattern.id}`;
      setPerlerSession({
        itemIds,
        sessionKey,
        restoredPattern: pattern,
        restoredSourceSticker: savedSnapshot.sourceSticker,
      });
      setWorkshopView({
        kind: 'PERLER_PATTERN_STUDIO',
        itemIds,
        sessionKey,
      });
      return;
    }

    if (!pattern.originalItemId) {
      pushTaskNotice('error', '无法恢复拼豆工坊', '这张拼豆图纸缺少原始藏品记录，当前只能导出图片。');
      return;
    }

    const sourceItem = items.find((item) => item.id === pattern.originalItemId);
    if (!sourceItem) {
      pushTaskNotice('error', '无法恢复拼豆工坊', '没有找到这张拼豆图纸对应的原始藏品。');
      return;
    }

    const sourceImageUrl = sourceItem.imageUrl?.trim() || sourceItem.coverImageUrl?.trim() || '';
    if (!sourceImageUrl) {
      pushTaskNotice('error', '无法恢复拼豆工坊', '这张拼豆图纸关联的原始藏品缺少可用图片。');
      return;
    }

    const itemIds = [sourceItem.id];
    const sessionKey = `PERLER_PATTERN-LIBRARY-${Date.now()}-${sourceItem.id}`;
    setPerlerSession({
      itemIds,
      sessionKey,
      restoredPattern: pattern,
      restoredSourceSticker: {
        id: `perler-library-source-${pattern.id}`,
        originalItemId: sourceItem.id,
        stickerImageUrl: sourceImageUrl,
        dramaText: sourceItem.name,
        category: '__perler_source__',
        dateCreated: pattern.dateCreated,
      },
    });
    setWorkshopView({
      kind: 'PERLER_PATTERN_STUDIO',
      itemIds,
      sessionKey,
    });
  }, [items, pushTaskNotice]);

  const handleWorkshopLaunch = useCallback(async ({
    tool,
    items: selectedItems = [],
    stickers: selectedStickers = [],
  }: WorkshopLaunchRequest) => {
    if (tool === 'STICKER') {
      if (selectedItems.length === 0) {
        throw new Error('请先选择至少一件藏品。');
      }

      const previewNames = selectedItems.slice(0, 2).map((item) => `「${item.name}」`).join('、');
      const remainingCount = selectedItems.length - Math.min(selectedItems.length, 2);
      const queuedLabel = remainingCount > 0 ? `${previewNames} 等 ${selectedItems.length} 件藏品` : previewNames;

      pushTaskNotice(
        'info',
        selectedItems.length > 1 ? '已开始批量生成贴纸' : '已开始生成贴纸',
        selectedItems.length > 1
          ? `${queuedLabel} 已加入后台并行生成队列，你现在可以切换到其他界面继续浏览。`
          : `「${selectedItems[0].name}」正在后台生成贴纸，你现在可以切换到其他界面继续浏览。`,
      );

      void (async () => {
        const results = await Promise.allSettled(
          selectedItems.map(async (item) => {
            await handleGenerateStickerRequest(item);
            return item;
          }),
        );

        const successItems = results
          .filter((result): result is PromiseFulfilledResult<CollectedItem> => result.status === 'fulfilled')
          .map((result) => result.value);
        const failedItems = results
          .map((result, index) => ({ result, item: selectedItems[index] }))
          .filter((entry): entry is { result: PromiseRejectedResult; item: CollectedItem } => entry.result.status === 'rejected');

        if (failedItems.length === 0) {
          pushTaskNotice(
            'success',
            successItems.length > 1 ? '批量贴纸已生成' : '贴纸已生成',
            successItems.length > 1
              ? `${successItems.length} 件藏品的贴纸已经自动存入再生成果库。`
              : `「${successItems[0].name}」的贴纸已经自动存入再生成果库。`,
          );
          return;
        }

        const firstFailure = failedItems[0];
        const failureMessage = firstFailure.result.reason instanceof Error
          ? firstFailure.result.reason.message
          : '贴纸生成失败，请稍后重试。';

        if (successItems.length > 0) {
          pushTaskNotice(
            'info',
            '部分贴纸已生成',
            `已完成 ${successItems.length}/${selectedItems.length} 件藏品。未完成项包含「${firstFailure.item.name}」：${failureMessage}`,
          );
          return;
        }

        pushTaskNotice(
          'error',
          selectedItems.length > 1 ? '批量贴纸生成失败' : '贴纸生成失败',
          selectedItems.length > 1
            ? `这批藏品暂时没有生成成功。首先失败的是「${firstFailure.item.name}」：${failureMessage}`
            : failureMessage,
        );
      })();
      setWorkshopView({ kind: 'LIBRARY' });
      return;
    }

    if (tool === 'EMOJI_PACK') {
      if (selectedItems.length === 0) {
        throw new Error('请先选择至少一件藏品。');
      }

      const itemIds = selectedItems.map((item) => item.id);
      const sessionKey = `${tool}-${Date.now()}-${itemIds.join('-')}`;
      setEmojiSession({
        itemIds,
        sessionKey,
      });
      setWorkshopView({
        kind: 'EMOJI_PACK_STUDIO',
        itemIds,
        sessionKey,
      });
      return;
    }

    if (tool === 'PERLER_PATTERN') {
      if (selectedItems.length === 0) {
        throw new Error('请先选择一件藏品。');
      }

      const itemIds = selectedItems.map((item) => item.id);
      const sessionKey = `${tool}-${Date.now()}-${itemIds.join('-')}`;
      setPerlerSession({
        itemIds,
        sessionKey,
      });
      setWorkshopView({
        kind: 'PERLER_PATTERN_STUDIO',
        itemIds,
        sessionKey,
      });
      return;
    }

    if (tool === 'GUIDE') {
      if (selectedItems.length === 0) {
        throw new Error('请先选择至少一件藏品。');
      }

      const taskId = `guide-task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const sourceItems = selectedItems.map(buildGuideSourceSnapshot);

      setGuideTasks((prev) => [
        {
          id: taskId,
          itemIds: selectedItems.map((item) => item.id),
          sourceItems,
          status: 'running',
          error: null,
        },
        ...prev,
      ]);
      setGuideNotice({
        tone: 'info',
        title: '已开始生成综合改造指南',
        message: '你可以切换到其他界面继续浏览，生成会在后台继续，完成后会自动存入再生成果库。',
      });
      setWorkshopView({
        kind: 'GUIDE_TASK',
        taskId,
      });
      void runGuideGenerationTask(taskId, sourceItems);
      return;
    }

    const selectionIds = selectedStickers.map((sticker) => sticker.id);

    if (selectionIds.length === 0) {
      throw new Error('请先选择要进入工坊的贴纸。');
    }

    setWorkshopView({
      kind: 'STICKER_STUDIO',
      mode: tool,
      stickerIds: selectionIds,
      sessionKey: `${tool}-${selectionIds.join('-')}`,
    });
  }, [buildGuideSourceSnapshot, handleGenerateStickerRequest, pushTaskNotice, runGuideGenerationTask]);

  const handleSelectItem = (item: CollectedItem) => {
    setSelectedItem(item);
    handleChangeView('ITEM_DETAIL');
  };

  const handleOpenMemoryItem = useCallback((itemId: string) => {
    const targetItem = items.find((item) => item.id === itemId);
    if (!targetItem) {
      setPendingHallId(null);
      handleChangeView('MUSEUM');
      return;
    }

    setPendingHallId(targetItem.hallId);
    setSelectedItem(targetItem);
    handleChangeView('ITEM_DETAIL');
  }, [handleChangeView, items]);

  const handleCompleteRemuse = async (itemId: string) => {
    setItems(prev => prev.map(item =>
      item.id === itemId ? { ...item, status: 'remused' } : item
    ));
    if (user) {
      try {
        await updateItemOnServer(itemId, { status: 'remused' });
      } catch (err) {
        console.error('更新 remuse 状态失败:', err);
      }
    }
  };

  const handleAddHall = async (name: string, imageUrl: string) => {
    const newHall: ExhibitionHall = {
      id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
      name,
      imageUrl,
      isCustom: true,
    };
    // 乐观更新
    setHalls(prev => [...prev, newHall]);

    if (user) {
      try {
        // 将 blob URL 转为 base64
        const saved = await createHallOnServer({ id: newHall.id, name, imageUrl });
        setHalls(prev => prev.map(h => h.id === newHall.id && h.isCustom ? { ...saved } : h));
      } catch (err) {
        console.error('保存展馆到服务器失败:', err);
      }
    }
  };

  const handleUpdateHall = async (
    hallId: string,
    updates: {
      name: string;
      imageUrl?: string;
    },
  ) => {
    const nextName = updates.name.trim();
    if (!nextName) {
      return;
    }

    setHalls(prev => prev.map((hall) => (
      hall.id === hallId
        ? { ...hall, name: nextName, imageUrl: updates.imageUrl || hall.imageUrl }
        : hall
    )));
    setItems(prev => prev.map((item) => (
      item.hallId === hallId ? { ...item, category: nextName } : item
    )));
    setSelectedItem(prev => (
      prev && prev.hallId === hallId ? { ...prev, category: nextName } : prev
    ));

    try {
        const saved = await updateHallOnServer(hallId, {
          name: nextName,
          imageUrl: updates.imageUrl,
        });
        setHalls(prev => prev.map((hall) => (
          hall.id === hallId ? { ...saved } : hall
        )));
        setItems(prev => prev.map((item) => (
          item.hallId === hallId ? { ...item, category: saved.name } : item
        )));
        setSelectedItem(prev => (
          prev && prev.hallId === hallId ? { ...prev, category: saved.name } : prev
        ));
      } catch (err) {
        console.error('更新展馆到服务器失败:', err);
      }
  };

  const handleDeleteHall = async (hallId: string) => {
    if (hallId === ItemCategory.OTHER) {
      return;
    }

    const targetHall = halls.find((hall) => hall.id === hallId) ?? null;
    const fallbackHallId = ItemCategory.OTHER;
    const fallbackCategory = getHallNameById(halls, fallbackHallId, fallbackHallId);

    if (user) {
      try {
        await deleteHallOnServer(hallId);
      } catch (err) {
        console.error('删除展馆从服务器失败:', err);
        pushTaskNotice('error', '删除展馆失败', getActionErrorMessage(err, '服务器暂时没有完成删除，请稍后再试。'));
        return;
      }
    }

    setHalls(prev => prev.filter((hall) => hall.id !== hallId));
    setItems(prev => prev.map((item) => (
      item.hallId === hallId
        ? { ...item, hallId: fallbackHallId, category: fallbackCategory }
        : item
    )));
    setSelectedItem(prev => (
      prev && prev.hallId === hallId
        ? { ...prev, hallId: fallbackHallId, category: fallbackCategory }
        : prev
    ));
    setPendingHallId(prev => (prev === hallId ? null : prev));
    pushTaskNotice(
      'info',
      '展馆已删除',
      targetHall ? `“${targetHall.name}”已移除，原有藏品已归入“${fallbackCategory}”。` : `这座展馆已移除，原有藏品已归入“${fallbackCategory}”。`,
    );
  };

  const handleLogout = async () => {
    await authService.logout();
    setUser(null);
    setCurrentView('SCANNER');
    setItems([]);
    setHalls(DEFAULT_HALLS);
    setStickers([]);
    setJournals([]);
    setGuides([]);
    setSelectedItem(null);
    setWorkshopView({ kind: 'HOME' });
    setGuideTasks([]);
    setGuideNotice(null);
    setEmojiSession(null);
    setPerlerSession(null);
    setLoginMode('login');
    setAuthActionToken(null);
    setIsGuestUpgradeFlow(false);
    clearAuthActionFromUrl();
    setShowLogin(true);
  };

  const handleWorkspaceRefresh = async () => {
    const itemsBeforeClear = items;
    // 从本地状态中移除
    setItems(prev => prev);
    // 从服务器删除
    await Promise.resolve();
  };

  const handleUpdateToolbox = async (tools: Tool[]) => {
    try {
      const updatedUser = await authService.updatePreferences({ toolbox: tools });
      setUser(updatedUser);
    } catch (err) {
      console.error('更新工具箱失败:', err);
      throw err;
    }
  };

  // ============================================================
  // 渲染
  // ============================================================

  // 启动动画期间不渲染任何内容
  if (showLaunch) {
    return (
      <ErrorBoundary>
        <LaunchScreen onComplete={handleLaunchComplete} />
      </ErrorBoundary>
    );
  }

  // 展示登录/游客页面
  if (authLoading) {
    return (
      <ErrorBoundary>
        <div className="min-h-screen bg-remuse-dark text-white flex items-center justify-center">
          <div className="text-center space-y-3">
            <div className="w-12 h-12 mx-auto rounded-full border-4 border-neutral-800 border-t-remuse-accent animate-spin" />
            <p className="text-sm text-neutral-400 font-display tracking-[0.2em] uppercase">Restoring Session</p>
          </div>
        </div>
      </ErrorBoundary>
    );
  }

  if (showLogin) {
    return (
      <ErrorBoundary>
        <LoginScreen
          onGuestLogin={handleGuestLogin}
          onLogin={handleLogin}
          onRegister={handleRegister}
          onForgotPassword={handleForgotPassword}
          onResetPassword={handleResetPassword}
          onVerifyEmail={handleVerifyEmail}
          loading={authLoading}
          error={authError}
          initialMode={loginMode}
          actionToken={authActionToken}
          allowGuestLogin={!user}
          isGuestUpgrade={isGuestUpgradeFlow}
          onClose={user ? handleCloseAuthModal : undefined}
        />
      </ErrorBoundary>
    );
  }

  // 引导页
  if (showOnboarding) {
    return (
      <ErrorBoundary>
        <Onboarding onComplete={handleOnboardingComplete} />
      </ErrorBoundary>
    );
  }

  if (user?.isAdmin && currentView === 'ADMIN') {
    return (
      <ErrorBoundary>
        <Suspense fallback={<RouteLoader label="正在加载管理后台..." />}>
          <AdminWorkspace
            user={user}
            onLogout={handleLogout}
            onEnterProduct={() => setCurrentView('SCANNER')}
          />
        </Suspense>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <Layout
        currentView={currentView}
        onChangeView={(view) => {
          if (view === 'SHARED_MUSEUMS') {
            setSelectedSharedMuseum(null);
          }
          handleChangeView(view);
        }}
        ecoPoints={ecoPoints}
        showAdminEntry={!!user?.isAdmin}
      >
        {/* Skeleton overlay during transition */}
        {isTransitioning && (
          <div className="absolute inset-0 z-30">
            <SkeletonScreen view={currentView} />
          </div>
        )}

        {/* Actual content with enter animation */}
        <div className={`h-full transition-opacity duration-200 ${showContent && !isTransitioning ? 'opacity-100 animate-view-enter' : 'opacity-0'}`}>

          {/* Always render Scanner to preserve background processing state */}
          <div className={currentView === 'SCANNER' ? 'block h-full w-full relative' : 'hidden h-full'}>
            <Scanner
              key={scannerKey}
              halls={halls}
              onItemAdded={handleAddItem}
              onStickerCreated={handleStickerCreated}
              onReset={() => setScannerKey(k => k + 1)}
              onCancel={() => {
                setScannerKey(k => k + 1);
                handleChangeView('MUSEUM');
              }}
              onViewDetail={(item) => {
                setSelectedItem(item);
                handleChangeView('ITEM_DETAIL');
              }}
              onCompleteItem={handleCompleteRemuse}
              onUpdateItem={handleUpdateItem}
              onDeleteItem={handleDeleteItem}
              onNavigateToHall={(hallId) => {
                setPendingHallId(hallId);
                handleChangeView('MUSEUM');
              }}
              onNavigateToWorkshop={() => {
                setWorkshopView({ kind: 'HOME' });
                handleChangeView('STICKER_LIBRARY');
              }}
            />
          </div>

          {currentView === 'MUSEUM' && (
            <Gallery
              items={items}
              halls={halls}
              onSelectItem={handleSelectItem}
              onAddHall={handleAddHall}
              onUpdateHall={handleUpdateHall}
              onDeleteHall={handleDeleteHall}
              onUpdateItem={handleUpdateItem}
              onDeleteItem={handleDeleteItem}
              initialHallId={pendingHallId}
              onConsumeInitialHallId={() => setPendingHallId(null)}
            />
          )}

          {currentView === 'SHARED_MUSEUMS' && (
            <Suspense fallback={<RouteLoader label="正在加载共建藏馆..." />}>
              <SharedMuseumHub
                currentUserId={user?.id ?? null}
                museums={sharedMuseums}
                activeMuseum={selectedSharedMuseum}
                onOpenMuseum={handleOpenSharedMuseum}
                onBackToList={() => setSelectedSharedMuseum(null)}
                onCreateMuseum={handleCreateSharedMuseumLocal}
                onJoinMuseum={handleJoinSharedMuseumLocal}
                onUpdateMuseumSettings={handleUpdateSharedMuseumSettings}
                onResetInvite={handleResetSharedMuseumInvite}
                onRevokeInvite={handleRevokeSharedMuseumInvite}
                onLeaveMuseum={handleLeaveSharedMuseum}
                onChangeMuseumStatus={handleChangeSharedMuseumStatus}
                onUpdateMuseumItem={handleUpdateSharedMuseumItem}
                onRemoveMuseumItem={handleRemoveSharedMuseumItem}
                onSaveMonthlyReport={handleSaveSharedMuseumMonthlyReport}
              />
            </Suspense>
          )}

          {currentView === 'STICKER_LIBRARY' && workshopView.kind === 'HOME' && (
            <RegenerationWorkshop
              items={items}
              stickers={stickers}
              halls={halls}
              resultStats={workshopResultStats}
              onLaunchTool={handleWorkshopLaunch}
              onOpenLibrary={handleOpenWorkshopLibrary}
            />
          )}

          {currentView === 'STICKER_LIBRARY' && workshopView.kind === 'LIBRARY' && (
            <Suspense fallback={<RouteLoader label="正在加载再生成果库..." />}>
              <StickerLibrary
                stickers={stickers}
                sourceItems={items}
                journals={journals}
                guides={guides}
                onOpenPerlerPattern={handleOpenPerlerPatternFromLibrary}
                onDeleteSticker={handleDeleteSticker}
                onSaveJournal={handleSaveJournal}
                onDeleteJournal={handleDeleteJournal}
                headerTitle="再生成果库"
                headerDescription="贴纸、表情包、拼豆图纸、手账和综合改造指南都会沉淀在这里，方便继续查看与导出。"
                showLayoutModeToggle={false}
                onOpenGuide={(guide) => setWorkshopView({ kind: 'GUIDE_DETAIL', guideId: guide.id })}
                onExit={() => setWorkshopView({ kind: 'HOME' })}
              />
            </Suspense>
          )}

          {emojiSession && (
            <div className={currentView === 'STICKER_LIBRARY' && workshopView.kind === 'EMOJI_PACK_STUDIO' ? 'block h-full' : 'hidden h-full'}>
              <Suspense fallback={<RouteLoader label="正在加载表情包工坊..." />}>
                <EmojiPackStudio
                  key={emojiSession.sessionKey}
                  sourceItems={items.filter((item) => emojiSession.itemIds.includes(item.id))}
                  onSaveResult={handleStickerCreated}
                  onBack={() => setWorkshopView({ kind: 'HOME' })}
                  onTaskNotice={pushTaskNotice}
                />
              </Suspense>
            </div>
          )}

          {perlerSession && (
            <div className={currentView === 'STICKER_LIBRARY' && workshopView.kind === 'PERLER_PATTERN_STUDIO' ? 'block h-full' : 'hidden h-full'}>
              <Suspense fallback={<RouteLoader label="正在加载拼豆工坊..." />}>
                {perlerSession.restoredPattern && perlerSession.restoredSourceSticker ? (
                  <PerlerPatternStudio
                    key={perlerSession.sessionKey}
                    sourceStickers={[perlerSession.restoredSourceSticker]}
                    initialSnapshot={perlerSession.restoredPattern.metadata?.perlerPatternSnapshot ?? null}
                    initialPatternSticker={perlerSession.restoredPattern}
                    onPatternSaved={handleStickerCreated}
                    onBack={() => setWorkshopView({ kind: 'HOME' })}
                    onTaskNotice={pushTaskNotice}
                  />
                ) : (
                  <PerlerPatternItemStudio
                    key={perlerSession.sessionKey}
                    sourceItem={items.find((item) => perlerSession.itemIds.includes(item.id)) || null}
                    onPatternSaved={handleStickerCreated}
                    onBack={() => setWorkshopView({ kind: 'HOME' })}
                    onTaskNotice={pushTaskNotice}
                  />
                )}
              </Suspense>
            </div>
          )}

          {currentView === 'STICKER_LIBRARY' && workshopView.kind === 'STICKER_STUDIO' && (
            <Suspense fallback={<RouteLoader label="正在加载再生工坊..." />}>
              <StickerLibrary
                key={workshopView.sessionKey}
                stickers={stickers}
                sourceItems={items}
                journals={journals}
                onOpenPerlerPattern={handleOpenPerlerPatternFromLibrary}
                onDeleteSticker={handleDeleteSticker}
                onStickerCreated={handleStickerCreated}
                onSaveJournal={handleSaveJournal}
                onDeleteJournal={handleDeleteJournal}
                initialViewMode="CANVAS"
                initialCanvasMode={workshopView.mode}
                initialSelectionIds={workshopView.stickerIds}
                onExit={() => setWorkshopView({ kind: 'HOME' })}
              />
            </Suspense>
          )}

          {currentView === 'STICKER_LIBRARY' && workshopView.kind === 'GUIDE_TASK' && activeGuideTask && (
            <Suspense fallback={<RouteLoader label="正在加载改造指南..." />}>
              <TransformationGuideStudio
                sourceItems={activeGuideSourceItems}
                activeItems={activeGuideItems}
                guide={activeGuide}
                isGenerating={activeGuideTask.status === 'running'}
                error={activeGuideTask.status === 'failed' ? activeGuideTask.error || null : null}
                onRetry={() => handleRetryGuideTask(activeGuideTask)}
                onBack={() => setWorkshopView({ kind: 'HOME' })}
                onOpenLibrary={handleOpenWorkshopLibrary}
                onCompleteItem={handleCompleteRemuse}
              />
            </Suspense>
          )}

          {currentView === 'STICKER_LIBRARY' && workshopView.kind === 'GUIDE_DETAIL' && activeGuide && (
            <Suspense fallback={<RouteLoader label="正在加载改造指南..." />}>
              <TransformationGuideStudio
                sourceItems={activeGuideSourceItems}
                activeItems={activeGuideItems}
                guide={activeGuide}
                onBack={handleOpenWorkshopLibrary}
                onOpenLibrary={handleOpenWorkshopLibrary}
                onCompleteItem={handleCompleteRemuse}
              />
            </Suspense>
          )}

          {currentView === 'INSPIRATION' && (
            <Suspense fallback={<RouteLoader label="正在加载灵感广场..." />}>
              <InspirationPlaza />
            </Suspense>
          )}

          {currentView === 'ITEM_DETAIL' && selectedItem && (
            <Suspense fallback={<RouteLoader label="正在加载藏品详情..." />}>
              <ItemArchiveDetail
                item={selectedItem}
                halls={halls}
                sharedMuseums={sharedMuseums}
                onBack={() => handleChangeView('MUSEUM')}
                onUpdateItem={handleUpdateItem}
                onDeleteItem={handleDeleteItem}
                onAddToSharedMuseum={handleAddItemToSharedMuseumLocal}
                onOpenSharedMuseums={() => {
                  setSelectedSharedMuseum(null);
                  handleChangeView('SHARED_MUSEUMS');
                }}
              />
            </Suspense>
          )}

          {currentView === 'PROFILE' && (
            <Suspense fallback={<RouteLoader label="正在加载馆长办公室..." />}>
              <CuratorOffice
                items={items}
                user={user}
                onLogout={handleLogout}
                onUpdateToolbox={handleUpdateToolbox}
                onUpgradeAccount={user?.isGuest ? handleOpenGuestUpgrade : undefined}
                onOpenMemoryRag={() => handleChangeView('MEMORY_RAG')}
                onAccountDeleted={handleLogout}
              />
            </Suspense>
          )}

          {currentView === 'MEMORY_RAG' && (
            <Suspense fallback={<RouteLoader label="正在加载记忆工坊..." />}>
              <MemoryRagStudio
                items={items}
                user={user}
                onBack={() => handleChangeView('PROFILE')}
                onOpenItem={handleOpenMemoryItem}
                onOpenMuseum={() => handleChangeView('MUSEUM')}
              />
            </Suspense>
          )}
        </div>
      </Layout>

      {/* Milestone Celebration Overlay */}
      {milestoneInfo && (
        <MilestoneCelebration
          itemCount={milestoneInfo.count}
          itemName={milestoneInfo.name}
          onDismiss={() => setMilestoneInfo(null)}
        />
      )}

      {guideNotice && (
        <div className="pointer-events-none fixed bottom-5 right-5 z-[70] w-[min(420px,calc(100vw-2rem))]">
          <FloatingNotice
            tone={guideNotice.tone}
            title={guideNotice.title}
            message={guideNotice.message}
            onClose={() => setGuideNotice(null)}
            className="pointer-events-auto"
          />
        </div>
      )}
    </ErrorBoundary>
  );
};

export default App;
