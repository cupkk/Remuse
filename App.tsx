
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
import { CollectedItem, ExhibitionHall, ItemCategory, SavedTransformationGuide, TransformationGuideSourceItem, ViewState, Sticker, Tool, User } from './types';
import { generateSticker, generateEmojiPack, generateTransformationGuide } from './services/geminiService';
import { imageUrlToBase64 } from './services/imageUtils';
import * as authService from './services/authService';
import { DEFAULT_HALLS, getHallNameById } from './services/halls';
import {
  createItemOnServer, updateItemOnServer, deleteItemOnServer,
  createStickerOnServer, deleteStickerOnServer,
  createHallOnServer, createTransformationGuideOnServer, deleteHallOnServer, updateHallOnServer,
} from './services/dataService';
import { loadUserWorkspace } from './services/userDataService';
import { lazyWithChunkRetry } from './services/lazyWithChunkRetry';
import { EMOJI_PACK_CATEGORY, PERLER_PATTERN_CATEGORY, isSourceSticker } from './shared/stickerCategories';

const ItemArchiveDetail = lazyWithChunkRetry(() => import('./components/ItemArchiveDetail'), 'ItemArchiveDetail');
const AdminWorkspace = lazyWithChunkRetry(() => import('./components/AdminWorkspace'), 'AdminWorkspace');
const CuratorOffice = lazyWithChunkRetry(() => import('./components/CuratorOffice'), 'CuratorOffice');
const StickerLibrary = lazyWithChunkRetry(() => import('./components/StickerLibrary'), 'StickerLibrary');
const InspirationPlaza = lazyWithChunkRetry(() => import('./components/InspirationPlaza'), 'InspirationPlaza');
const MemoryRagStudio = lazyWithChunkRetry(() => import('./components/MemoryRagStudio'), 'MemoryRagStudio');
const TransformationGuideStudio = lazyWithChunkRetry(() => import('./components/TransformationGuideStudio'), 'TransformationGuideStudio');

type AuthModalMode = 'login' | 'register' | 'forgotPassword' | 'resetPassword' | 'verifyEmail';
type WorkshopCanvasMode = 'EMOJI_PACK' | 'PERLER_PATTERN' | 'PRINT';
type WorkshopViewState =
  | { kind: 'HOME' }
  | { kind: 'LIBRARY' }
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
  const [guides, setGuides] = useState<SavedTransformationGuide[]>([]);
  const [selectedItem, setSelectedItem] = useState<CollectedItem | null>(null);
  const [workshopView, setWorkshopView] = useState<WorkshopViewState>({ kind: 'HOME' });
  const [guideTasks, setGuideTasks] = useState<GuideGenerationTask[]>([]);
  const [guideNotice, setGuideNotice] = useState<{
    tone: 'success' | 'error' | 'info';
    title: string;
    message: string;
  } | null>(null);

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
      setGuides(workspace.guides);
      setHalls(workspace.halls);
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
    setItems(prev => prev.filter(item => item.id !== itemId));
    if (selectedItem?.id === itemId) {
      setSelectedItem(null);
      handleChangeView('MUSEUM');
    }

    if (user) {
      try {
        await deleteItemOnServer(itemId);
      } catch (err) {
        console.error('删除物品从服务器失败:', err);
      }
    }
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

  const handleDeleteSticker = async (id: string) => {
    setStickers(prev => (Array.isArray(prev) ? prev : []).filter(s => s.id !== id));

    if (user) {
      try {
        await deleteStickerOnServer(id);
      } catch (err) {
        console.error('删除贴纸从服务器失败:', err);
      }
    }
  };

  const handleGenerateStickerRequest = async (item: CollectedItem) => {
    if (generatingStickers[item.id]) return;
    setGeneratingStickers(prev => ({ ...prev, [item.id]: true }));

    try {
      const base64 = await imageUrlToBase64(item.imageUrl);
      const { stickerImageUrl, dramaText } = await generateSticker(base64, item.name);

      const newSticker: Sticker = {
        id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
        originalItemId: item.id,
        stickerImageUrl,
        dramaText,
        category: item.category,
        dateCreated: new Date().toISOString(),
      };

      await persistGeneratedSticker(newSticker);
    } catch (err) {
      console.error('贴纸生成失败 for item', item.id, err);
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
      const inputs = await Promise.all(sourceItems.map(async (item, index) => {
        const guideImageUrl = item.coverImageUrl || item.imageUrl || '';
        const imageBase64 = index < 4 && guideImageUrl
          ? await imageUrlToBase64(guideImageUrl).catch(() => '')
          : '';

        return {
          id: item.id,
          name: item.name,
          category: item.category,
          material: item.material,
          description: item.description || '',
          story: item.story || '',
          tags: item.tags || [],
          imageBase64: imageBase64 || undefined,
        };
      }));

      const generatedGuide = await generateTransformationGuide(inputs);
      const savedGuide = await createTransformationGuideOnServer({
        title: generatedGuide.title,
        summary: generatedGuide.summary,
        concept: generatedGuide.concept,
        materials: generatedGuide.materials,
        steps: generatedGuide.steps,
        tips: generatedGuide.tips,
        imageBase64: generatedGuide.imageUrl.startsWith('data:') ? generatedGuide.imageUrl : undefined,
        imageUrl: generatedGuide.imageUrl.startsWith('data:') ? undefined : generatedGuide.imageUrl,
        itemIds: sourceItems.map((item) => item.id),
        sourceItems,
        dateCreated: new Date().toISOString(),
      });

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

  const handleWorkshopLaunch = useCallback(async ({
    tool,
    items: selectedItems = [],
    stickers: selectedStickers = [],
  }: WorkshopLaunchRequest) => {
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
  }, [buildGuideSourceSnapshot, runGuideGenerationTask]);

  const handleSelectItem = (item: CollectedItem) => {
    setSelectedItem(item);
    handleChangeView('ITEM_DETAIL');
  };

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

    const fallbackHallId = ItemCategory.OTHER;
    const fallbackCategory = getHallNameById(halls, fallbackHallId, fallbackHallId);

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

    try {
        await deleteHallOnServer(hallId);
      } catch (err) {
        console.error('删除展馆从服务器失败:', err);
      }
  };

  const handleLogout = async () => {
    await authService.logout();
    setUser(null);
    setCurrentView('SCANNER');
    setItems([]);
    setHalls(DEFAULT_HALLS);
    setStickers([]);
    setGuides([]);
    setSelectedItem(null);
    setWorkshopView({ kind: 'HOME' });
    setGuideTasks([]);
    setGuideNotice(null);
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
        <Suspense fallback={<RouteLoader label="Loading admin workspace..." />}>
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
        onChangeView={handleChangeView}
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
              existingStickers={stickers}
              onGenerateStickerRequest={handleGenerateStickerRequest}
              generatingStickersGlobal={generatingStickers}
              onNavigateToHall={(hallId) => {
                setPendingHallId(hallId);
                handleChangeView('MUSEUM');
              }}
              onNavigateToStickerLibrary={() => {
                setWorkshopView({ kind: 'LIBRARY' });
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
            <Suspense fallback={<RouteLoader label="Loading regeneration library..." />}>
              <StickerLibrary
                stickers={stickers}
                guides={guides}
                onDeleteSticker={handleDeleteSticker}
                onStickerCreated={handleStickerCreated}
                headerTitle="再生成果库"
                headerDescription="贴纸、表情包、拼豆图纸和综合改造指南都会沉淀在这里，方便继续查看与导出。"
                showLayoutModeToggle={false}
                onOpenGuide={(guide) => setWorkshopView({ kind: 'GUIDE_DETAIL', guideId: guide.id })}
                onExit={() => setWorkshopView({ kind: 'HOME' })}
              />
            </Suspense>
          )}

          {currentView === 'STICKER_LIBRARY' && workshopView.kind === 'STICKER_STUDIO' && (
            <Suspense fallback={<RouteLoader label="Loading regeneration studio..." />}>
              <StickerLibrary
                key={workshopView.sessionKey}
                stickers={stickers}
                onDeleteSticker={handleDeleteSticker}
                onStickerCreated={handleStickerCreated}
                initialViewMode="CANVAS"
                initialCanvasMode={workshopView.mode}
                initialSelectionIds={workshopView.stickerIds}
                onExit={() => setWorkshopView({ kind: 'HOME' })}
              />
            </Suspense>
          )}

          {currentView === 'STICKER_LIBRARY' && workshopView.kind === 'GUIDE_TASK' && activeGuideTask && (
            <Suspense fallback={<RouteLoader label="Loading regeneration guide..." />}>
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
            <Suspense fallback={<RouteLoader label="Loading regeneration guide..." />}>
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
            <Suspense fallback={<RouteLoader label="Loading inspiration plaza..." />}>
              <InspirationPlaza />
            </Suspense>
          )}

          {currentView === 'ITEM_DETAIL' && selectedItem && (
            <Suspense fallback={<RouteLoader label="Loading item workspace..." />}>
              <ItemArchiveDetail
                item={selectedItem}
                halls={halls}
                onBack={() => handleChangeView('MUSEUM')}
                onUpdateItem={handleUpdateItem}
                onDeleteItem={handleDeleteItem}
                hasExistingSticker={stickers.some(
                  (sticker) => sticker.originalItemId === selectedItem.id && isSourceSticker(sticker),
                )}
                onGenerateStickerRequest={handleGenerateStickerRequest}
                isGeneratingStickerGlobal={generatingStickers[selectedItem.id]}
              />
            </Suspense>
          )}

          {currentView === 'PROFILE' && (
            <Suspense fallback={<RouteLoader label="Loading curator office..." />}>
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
            <Suspense fallback={<RouteLoader label="Loading memory studio..." />}>
              <MemoryRagStudio
                items={items}
                user={user}
                onBack={() => handleChangeView('PROFILE')}
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
