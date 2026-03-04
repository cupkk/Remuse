
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Layout from './components/Layout';
import Scanner from './components/Scanner';
import Gallery from './components/Gallery';
import IdeaGenerator from './components/IdeaGenerator';
import LaunchScreen from './components/LaunchScreen';
import Onboarding from './components/Onboarding';
import CuratorOffice from './components/CuratorOffice';
import StickerLibrary from './components/StickerLibrary';
import InspirationPlaza from './components/InspirationPlaza';
import ErrorBoundary from './components/ErrorBoundary';
import SkeletonScreen from './components/SkeletonScreen';
import MilestoneCelebration, { isMilestone } from './components/MilestoneCelebration';
import { CollectedItem, ItemCategory, ViewState, Difficulty, ExhibitionHall, Sticker } from './types';
import { generateSticker, generateEmojiPack } from './services/geminiService';

// Mock Data for Initial Load
const MOCK_ITEMS: CollectedItem[] = [
  {
    id: '1',
    name: '复古茶叶罐',
    category: ItemCategory.CONTAINER,
    material: '金属',
    imageUrl: 'https://picsum.photos/400/400?random=1',
    dateCollected: '2023-10-15',
    story: '承载着一个被遗忘冬日温暖的容器。',
    tags: ['复古', '收纳', '金属'],
    status: 'raw',
    ideas: [
      {
        title: '多肉植物盆栽',
        description: '将铁罐改造成耐旱植物的田园风家园。',
        difficulty: Difficulty.EASY,
        materials: ['土壤', '碎石', '多肉植物'],
        steps: ['在底部钻排水孔', '铺设碎石层', '填入土壤', '种下多肉植物']
      }
    ]
  },
  {
    id: '2',
    name: '电路板碎片',
    category: ItemCategory.ELECTRONIC,
    material: '复合材料',
    imageUrl: 'https://picsum.photos/400/400?random=2',
    dateCollected: '2023-11-02',
    story: '一台退役机器的神经系统。',
    tags: ['科技', '艺术', '环保'],
    status: 'remused',
    ideas: []
  },
  {
    id: '3',
    name: '玻璃汽水瓶',
    category: ItemCategory.CONTAINER,
    material: '玻璃',
    imageUrl: 'https://picsum.photos/400/400?random=3',
    dateCollected: '2023-11-05',
    story: '夏日清凉的透明回声。',
    tags: ['透明', '蓝色', '装饰'],
    status: 'raw',
    ideas: [
       {
        title: 'LED氛围灯',
        description: '放入灯串，营造忧郁或温馨的夜间氛围灯。',
        difficulty: Difficulty.EASY,
        materials: ['LED灯串', '软木塞'],
        steps: ['彻底清洗瓶子', '塞入灯串', '固定电池盒']
      }
    ]
  }
];

// Default Covers
const DEFAULT_COVERS: Record<string, string> = {
  // 奶茶周边 — 两杯梅森罐饮品，温暖柔和
  [ItemCategory.PACKAGING]: 'https://images.unsplash.com/photo-1525803377221-4f6ccdaa5133?auto=format&fit=crop&q=80&w=400',
  // 瓶瓶罐罐 — 窗台彩色复古玻璃花瓶
  [ItemCategory.CONTAINER]: 'https://images.unsplash.com/photo-1709346727368-dc3e2b8c6124?auto=format&fit=crop&q=80&w=400',
  // 手办玩偶 — 穿裙子戴皇冠的可爱兔兔
  [ItemCategory.PAPER]: 'https://images.unsplash.com/photo-1692935318316-8315eb21761e?auto=format&fit=crop&q=80&w=400',
  // 徽章冰箱贴 — 贴满旅行磁贴的白色冰箱
  [ItemCategory.ELECTRONIC]: 'https://images.unsplash.com/photo-1597502321303-ac7965ad7e8e?auto=format&fit=crop&q=80&w=400',
  // 纪念票根 — 日本地铁纸质车票，复古文艺
  [ItemCategory.TEXTILE]: 'https://images.unsplash.com/photo-1611550082883-a65b37a8ea89?auto=format&fit=crop&q=80&w=400',
  // 其他好物 — 手帐本+贴纸+和纸胶带平铺
  [ItemCategory.OTHER]: 'https://images.unsplash.com/photo-1609338177258-4ce9fafc513e?auto=format&fit=crop&q=80&w=400',
};

const INITIAL_HALLS: ExhibitionHall[] = Object.values(ItemCategory).map(cat => ({
  id: cat,
  name: cat,
  imageUrl: DEFAULT_COVERS[cat] || DEFAULT_COVERS[ItemCategory.OTHER],
  isCustom: false
}));

const App: React.FC = () => {
  const [showLaunch, setShowLaunch] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Default view is SCANNER
  const [currentView, setCurrentView] = useState<ViewState>('SCANNER');
  const [items, setItems] = useState<CollectedItem[]>(MOCK_ITEMS);
  const [halls, setHalls] = useState<ExhibitionHall[]>(INITIAL_HALLS);
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [selectedItem, setSelectedItem] = useState<CollectedItem | null>(null);
  
  // Track sticker generation tasks globally
  const [generatingStickers, setGeneratingStickers] = useState<Record<string, boolean>>({});

  // Skeleton transition state
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [showContent, setShowContent] = useState(true);
  const prevViewRef = useRef<ViewState>(currentView);

  // Scanner remount key — increments to force fresh Scanner state
  const [scannerKey, setScannerKey] = useState(0);

  // Milestone celebration state
  const [milestoneInfo, setMilestoneInfo] = useState<{ count: number; name: string } | null>(null);

  // --- View transition with skeleton ---
  const handleChangeView = useCallback((newView: ViewState) => {
    // 如果已经在 SCANNER 并且再次点击（比如通过导航栏），此时才强制重置 Scanner 状态
    if (newView === currentView) {
      if (newView === 'SCANNER') {
        setScannerKey(k => k + 1);
      }
      return;
    }
    prevViewRef.current = currentView;

    // 不再默认给 SCANNER 递增 key 强制重新挂载（以便保留后台处理进度）
    if (newView === 'SCANNER') {
      setCurrentView(newView);
      setShowContent(true);
      setIsTransitioning(false);
      return;
    }

    // 带骨架屏过渡动画
    setIsTransitioning(true);
    setShowContent(false);

    setTimeout(() => {
      setCurrentView(newView);
      setIsTransitioning(false);
      requestAnimationFrame(() => setShowContent(true));
    }, 280);
  }, [currentView]);

  // Handle Launch Completion
  const handleLaunchComplete = () => {
    setShowLaunch(false);
    // Check local storage to see if user has already visited
    const hasVisited = localStorage.getItem('remuse_visited_v1');
    if (!hasVisited) {
      setShowOnboarding(true);
    }
  };

  // Handle Onboarding Completion
  const handleOnboardingComplete = () => {
    localStorage.setItem('remuse_visited_v1', 'true');
    setShowOnboarding(false);
  };

  // Calculate Eco Points dynamically
  const ecoPoints = useMemo(() => {
    return items.reduce((total, item) => {
        let points = 5; // Base collection points
        if (item.status === 'remused') {
            points += 10; // Remuse bonus
        }
        return total + points;
    }, 0);
  }, [items]);

  const handleAddItem = (newItem: CollectedItem) => {
    setItems(prev => {
      const updated = [newItem, ...prev];
      const newCount = updated.length;
      // Check for milestone
      if (isMilestone(newCount)) {
        setTimeout(() => setMilestoneInfo({ count: newCount, name: newItem.name }), 600);
      }
      return updated;
    });
  };

  const handleUpdateItem = (updatedItem: CollectedItem) => {
    setItems(prev => prev.map(item => 
      item.id === updatedItem.id ? updatedItem : item
    ));
    // Also sync selectedItem if viewing detail
    if (selectedItem?.id === updatedItem.id) {
      setSelectedItem(updatedItem);
    }
  };

  const handleDeleteItem = (itemId: string) => {
    setItems(prev => prev.filter(item => item.id !== itemId));
    // Navigate back from detail view
    if (selectedItem?.id === itemId) {
      setSelectedItem(null);
      handleChangeView('MUSEUM');
    }
  };

  const handleStickerCreated = (newSticker: Sticker) => {
      setStickers(prev => [newSticker, ...prev]);
  };

  const handleGenerateStickerRequest = async (item: CollectedItem) => {
    if (generatingStickers[item.id]) return;

    setGeneratingStickers(prev => ({ ...prev, [item.id]: true }));
    
    try {
      const base64 = item.imageUrl.split(',')[1];
      const { stickerImageUrl, dramaText } = await generateSticker(base64, item.name);
      
      const newSticker: Sticker = {
          id: self.crypto?.randomUUID?.() ?? (`${Date.now()}-${Math.random().toString(36).slice(2,11)}`),
          originalItemId: item.id,
          stickerImageUrl: stickerImageUrl,
          dramaText: dramaText,
          category: item.category,
          dateCreated: new Date().toISOString()
      };
      
      handleStickerCreated(newSticker);
    } catch (err) {
      console.error("Background sticker generation failed for item", item.id, err);
      // Optional: Store error state or show a toast notification here
      // alert("贴纸生成失败..."); (Only if you want global alerts on failures)
    } finally {
      setGeneratingStickers(prev => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
    }
  };

  const handleDeleteSticker = (id: string) => {
      setStickers(prev => prev.filter(s => s.id !== id));
  };

  const handleSelectItem = (item: CollectedItem) => {
    setSelectedItem(item);
    handleChangeView('ITEM_DETAIL');
  };

  const handleCompleteRemuse = (itemId: string) => {
    setItems(prev => prev.map(item => 
      item.id === itemId ? { ...item, status: 'remused' } : item
    ));
  };

  const handleAddHall = (name: string, imageUrl: string) => {
    const newHall: ExhibitionHall = {
      id: name,
      name: name,
      imageUrl: imageUrl,
      isCustom: true
    };
    setHalls(prev => [...prev, newHall]);
  };

  return (
    <ErrorBoundary>
      {showLaunch && <LaunchScreen onComplete={handleLaunchComplete} />}
      
      {/* Show Onboarding after Launch and before Layout if needed */}
      {!showLaunch && showOnboarding && (
        <Onboarding onComplete={handleOnboardingComplete} />
      )}
      
      {!showLaunch && !showOnboarding && (
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
          
          {/* Always render Scanner to preserve background processing state, hide if not currentView */}
          <div className={currentView === 'SCANNER' ? 'block h-full w-full relative' : 'hidden h-full'}>
            <Scanner 
              key={scannerKey}
              halls={halls}
              onItemAdded={handleAddItem} 
              onStickerCreated={handleStickerCreated}
              onReset={() => setScannerKey(k => k + 1)}
              onCancel={() => {
                setScannerKey(k => k + 1); // 点击取消/关闭时重置扫描仪并返回画廊
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
            />
          </div>

          {currentView === 'MUSEUM' && (
            <Gallery 
              items={items} 
              halls={halls}
              onSelectItem={handleSelectItem} 
              onAddHall={handleAddHall}
            />
          )}

          {currentView === 'STICKER_LIBRARY' && (
            <StickerLibrary 
                stickers={stickers}
                onDeleteSticker={handleDeleteSticker}
                onStickerCreated={handleStickerCreated}
            />
          )}
          
          {currentView === 'ITEM_DETAIL' && selectedItem && (
            <IdeaGenerator
              item={selectedItem}
              onBack={() => handleChangeView('MUSEUM')}
              onComplete={handleCompleteRemuse}
              onUpdateItem={handleUpdateItem}
              onDeleteItem={handleDeleteItem}
              onStickerCreated={handleStickerCreated}
              hasExistingSticker={stickers.some(s => s.originalItemId === selectedItem.id)}
              onGenerateStickerRequest={handleGenerateStickerRequest}
              isGeneratingStickerGlobal={generatingStickers[selectedItem.id]}
            />
          )}

          {currentView === 'PROFILE' && (
            <CuratorOffice items={items} />
          )}

          {currentView === 'INSPIRATION' && (
            <InspirationPlaza />
          )}
          </div>
        </Layout>
      )}

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
