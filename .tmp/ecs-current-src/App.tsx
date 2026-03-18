
import React, { Suspense, useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Layout from './components/Layout';
import Scanner from './components/Scanner';
import Gallery from './components/Gallery';
import LaunchScreen from './components/LaunchScreen';
import Onboarding from './components/Onboarding';
import ErrorBoundary from './components/ErrorBoundary';
import SkeletonScreen from './components/SkeletonScreen';
import LoginScreen from './components/LoginScreen';
import MilestoneCelebration, { isMilestone } from './components/MilestoneCelebration';
import { CollectedItem, ExhibitionHall, ItemCategory, ViewState, Sticker, Tool, User } from './types';
import { generateSticker, generateEmojiPack, generateCollectionCover } from './services/geminiService';
import { imageUrlToBase64 } from './services/imageUtils';
import * as authService from './services/authService';
import { DEFAULT_HALLS, getHallNameById } from './services/halls';
import {
  createItemOnServer, updateItemOnServer, deleteItemOnServer,
  createStickerOnServer, deleteStickerOnServer,
  createHallOnServer, deleteHallOnServer, updateHallOnServer,
} from './services/dataService';
import { loadUserWorkspace } from './services/userDataService';
import { lazyWithChunkRetry } from './services/lazyWithChunkRetry';

const IdeaGenerator = lazyWithChunkRetry(() => import('./components/IdeaGenerator'), 'IdeaGenerator');
const CuratorOffice = lazyWithChunkRetry(() => import('./components/CuratorOffice'), 'CuratorOffice');
const StickerLibrary = lazyWithChunkRetry(() => import('./components/StickerLibrary'), 'StickerLibrary');
const InspirationPlaza = lazyWithChunkRetry(() => import('./components/InspirationPlaza'), 'InspirationPlaza');
const MemoryRagStudio = lazyWithChunkRetry(() => import('./components/MemoryRagStudio'), 'MemoryRagStudio');

type AuthModalMode = 'login' | 'register' | 'forgotPassword' | 'resetPassword' | 'verifyEmail';

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
  const [selectedItem, setSelectedItem] = useState<CollectedItem | null>(null);

  // Track sticker generation tasks globally
  const [generatingStickers, setGeneratingStickers] = useState<Record<string, boolean>>({});

  // Skeleton transition state
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [showContent, setShowContent] = useState(true);
  const prevViewRef = useRef<ViewState>(currentView);

  // Scanner remount key
  const [scannerKey, setScannerKey] = useState(0);

  // Milestone celebration state
  const [milestoneInfo, setMilestoneInfo] = useState<{ count: number; name: string } | null>(null);

  // Gallery: 从 Scanner 跳转时指定展馆
  const [pendingHallId, setPendingHallId] = useState<string | null>(null);
  const itemsRef = useRef<CollectedItem[]>([]);
  const coverGenerationQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

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

  const loadUserData = async (currentUser: User | null = user) => {
    try {
      const workspace = await loadUserWorkspace(currentUser);
      setItems(workspace.items);
      setStickers(workspace.stickers);
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
      setShowLogin(false);
      setLoginMode('login');
      setAuthActionToken(null);
      setIsGuestUpgradeFlow(false);
      clearAuthActionFromUrl();
      if (!u.emailVerified) {
        setCurrentView('PROFILE');
      }
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

  const syncItemCoverLocally = useCallback((itemId: string, coverImageUrl: string) => {
    setItems(prev => prev.map(item => (
      item.id === itemId ? { ...item, coverImageUrl } : item
    )));
    setSelectedItem(prev => (
      prev?.id === itemId ? { ...prev, coverImageUrl } : prev
    ));
  }, []);

  const enqueueItemCoverGeneration = useCallback((itemId: string, fallbackItem?: CollectedItem, force = false) => {
    if (!user) {
      return;
    }

    coverGenerationQueueRef.current = coverGenerationQueueRef.current
      .then(async () => {
        const latestItem = itemsRef.current.find(item => item.id === itemId) || fallbackItem;
        if (!latestItem) {
          return;
        }

        if (!force && latestItem.coverImageUrl) {
          return;
        }

        const base64 = await imageUrlToBase64(latestItem.imageUrl);
        const { coverImageUrl } = await generateCollectionCover(base64, latestItem.name, latestItem.hallId);
        syncItemCoverLocally(itemId, coverImageUrl);
        await updateItemOnServer(itemId, { coverImageBase64: coverImageUrl });
      })
      .catch((error) => {
        console.error('Failed to generate collection cover:', error);
      });
  }, [syncItemCoverLocally, user]);

  const handleAddItem = async (newItem: CollectedItem) => {
    // 先乐观更新 UI
    setItems(prev => {
      const updated = [newItem, ...prev];
      if (isMilestone(updated.length)) {
        setTimeout(() => setMilestoneInfo({ count: updated.length, name: newItem.name }), 600);
      }
      return updated;
    });

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
          imageBase64: isDataUrl ? newItem.imageUrl : undefined,
          story: newItem.story,
          tags: newItem.tags,
          ideas: newItem.ideas,
          status: newItem.status,
          dateCollected: newItem.dateCollected,
        });
        // 用服务端 ID 和图片路径替换，但保留本地可能已被用户修改过的字段（防止竞态覆盖）
        let mergedItem: CollectedItem | null = null;
        setItems(prev => prev.map(it => {
          if (it.id === newItem.id) {
            mergedItem = {
              ...it,           // 保留当前本地状态（用户可能已修改 category 等字段）
              id: saved.id,    // 使用服务端 ID
              imageUrl: saved.imageUrl || it.imageUrl, // 使用服务端图片路径
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
        if (mergedItem) {
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
  };

  const handleUpdateItem = async (updatedItem: CollectedItem) => {
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
        imageUrl: existing.imageUrl?.startsWith('/') ? existing.imageUrl : updatedItem.imageUrl,
        coverImageUrl: updatedItem.coverImageUrl || existing.coverImageUrl,
      };
      return prev.map((item, i) => i === idx ? merged : item);
    });

    if (selectedItem?.id === updatedItem.id || selectedItem?.id === resolvedId) {
      setSelectedItem({
        ...updatedItem,
        id: resolvedId,
        coverImageUrl: updatedItem.coverImageUrl || existingItem?.coverImageUrl,
      });
    }

    if (user) {
      try {
        const imageUrl = updatedItem.imageUrl;
        const isDataUrl = imageUrl?.startsWith('data:');
        await updateItemOnServer(resolvedId, {
          name: updatedItem.name,
          hallId: updatedItem.hallId,
          category: updatedItem.category,
          material: updatedItem.material,
          imageBase64: isDataUrl ? imageUrl : undefined,
          coverImageBase64: updatedItem.coverImageUrl?.startsWith('data:') ? updatedItem.coverImageUrl : undefined,
          story: updatedItem.story,
          tags: updatedItem.tags,
          ideas: updatedItem.ideas,
          status: updatedItem.status,
        });
        if (shouldRegenerateCover) {
          enqueueItemCoverGeneration(resolvedId, { ...updatedItem, id: resolvedId }, true);
        }
      } catch (err) {
        console.error('更新物品到服务器失败:', err);
      }
    }
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

  const handleStickerCreated = async (newSticker: Sticker) => {
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
        return;
      } catch (err) {
        setStickers(prev => (Array.isArray(prev) ? prev : []).filter(s => s.id !== newSticker.id));
        throw err;
        console.error('保存贴纸到服务器失败:', err);
      }
    }
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

      await handleStickerCreated(newSticker);
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

    if (user) {
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

    if (user) {
      try {
        await deleteHallOnServer(hallId);
      } catch (err) {
        console.error('删除展馆从服务器失败:', err);
      }
    }
  };

  const handleLogout = async () => {
    await authService.logout();
    setUser(null);
    setItems([]);
    setHalls(DEFAULT_HALLS);
    setStickers([]);
    setSelectedItem(null);
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

  return (
    <ErrorBoundary>
      <Layout
        currentView={currentView}
        onChangeView={handleChangeView}
        ecoPoints={ecoPoints}
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
            />
          )}

          {currentView === 'STICKER_LIBRARY' && (
            <Suspense fallback={<RouteLoader label="Loading sticker library..." />}>
              <StickerLibrary
                stickers={stickers}
                onDeleteSticker={handleDeleteSticker}
                onStickerCreated={handleStickerCreated}
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
              <IdeaGenerator
                item={selectedItem}
                halls={halls}
                onBack={() => handleChangeView('MUSEUM')}
                onComplete={handleCompleteRemuse}
                onUpdateItem={handleUpdateItem}
                onDeleteItem={handleDeleteItem}
                onStickerCreated={handleStickerCreated}
                hasExistingSticker={stickers.some(s => s.originalItemId === selectedItem.id)}
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
    </ErrorBoundary>
  );
};

export default App;
