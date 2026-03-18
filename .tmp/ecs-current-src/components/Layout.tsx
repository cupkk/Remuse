import React, { useEffect, useState } from 'react';
import { ViewState } from '../types';
import { Box, ScanLine, Trophy, Zap, Sticker, Compass, History } from 'lucide-react';

interface LayoutProps {
  currentView: ViewState;
  onChangeView: (view: ViewState) => void;
  children: React.ReactNode;
  ecoPoints: number;
}

interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  desktop?: boolean;
}

const NavItem: React.FC<NavItemProps> = ({ icon, label, active, onClick, desktop }) => (
  <button
    onClick={onClick}
    role="tab"
    aria-selected={active}
    aria-current={active ? 'page' : undefined}
    aria-label={label}
    className={`flex w-full min-h-[52px] flex-col items-center justify-center gap-1 px-2 py-2.5 transition-all duration-300 md:w-auto md:flex-row md:justify-start md:gap-4 md:px-6 md:py-4 ${
      active
        ? 'border-t-2 border-remuse-accent bg-neutral-900 text-remuse-accent md:border-l-2 md:border-t-0'
        : 'text-neutral-400 hover:text-neutral-200'
    } ${desktop ? 'hidden md:flex' : ''}`}
  >
    <div className="transform transition-transform duration-300 hover:scale-110">{icon}</div>
    <span className="text-[10px] font-display tracking-wide md:text-sm">{label}</span>
  </button>
);

const Layout: React.FC<LayoutProps> = ({ currentView, onChangeView, children, ecoPoints }) => {
  const [displayPoints, setDisplayPoints] = useState(ecoPoints);
  const [isPointsAnimating, setIsPointsAnimating] = useState(false);

  useEffect(() => {
    if (ecoPoints === displayPoints) {
      return;
    }

    setIsPointsAnimating(true);
    const diff = ecoPoints - displayPoints;
    const step = diff > 0 ? 1 : -1;

    const interval = setInterval(() => {
      setDisplayPoints((prev) => {
        if (prev === ecoPoints) {
          clearInterval(interval);
          return prev;
        }

        return prev + step;
      });
    }, 50);

    const timeout = setTimeout(() => {
      setIsPointsAnimating(false);
      setDisplayPoints(ecoPoints);
    }, 1000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [displayPoints, ecoPoints]);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-remuse-dark text-white">
      <div className="safe-area-pt z-50 flex items-center justify-between border-b border-remuse-border bg-remuse-panel px-4 py-3 md:hidden">
        <h1 className="font-display text-xl font-bold tracking-tight">REMUSE</h1>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-remuse-secondary">ONLINE</span>
          <div className="h-2 w-2 animate-pulse rounded-full bg-remuse-secondary" />
        </div>
      </div>

      <div className="relative flex flex-1 overflow-hidden">
        <nav aria-label="主导航" className="z-40 hidden w-64 flex-col border-r border-remuse-border bg-remuse-panel md:flex">
          <div className="border-b border-remuse-border p-8">
            <h1 className="font-display text-2xl font-bold tracking-tight">REMUSE</h1>
            <p className="mt-2 font-mono text-[10px] text-neutral-400">V 1.0.0 // ONLINE</p>
          </div>

          <div className="flex-1 space-y-1 py-4" role="tablist" aria-label="页面导航">
            <NavItem icon={<ScanLine size={20} />} label="扫描仪" active={currentView === 'SCANNER'} onClick={() => onChangeView('SCANNER')} />
            <NavItem
              icon={<Box size={20} />}
              label="藏品馆"
              active={currentView === 'MUSEUM' || currentView === 'ITEM_DETAIL'}
              onClick={() => onChangeView('MUSEUM')}
            />
            <NavItem icon={<Sticker size={20} />} label="贴纸库" active={currentView === 'STICKER_LIBRARY'} onClick={() => onChangeView('STICKER_LIBRARY')} />
            <NavItem icon={<Compass size={20} />} label="灵感广场" active={currentView === 'INSPIRATION'} onClick={() => onChangeView('INSPIRATION')} />
            <NavItem icon={<Trophy size={20} />} label="馆长办公室" active={currentView === 'PROFILE'} onClick={() => onChangeView('PROFILE')} />
            <NavItem icon={<History size={20} />} label="记忆对话" active={currentView === 'MEMORY_RAG'} onClick={() => onChangeView('MEMORY_RAG')} />
          </div>

          <div className="border-t border-remuse-border p-6">
            <div className="rounded border border-neutral-800 bg-neutral-900 p-4 transition-all duration-300">
              <span className="mb-1 block font-mono text-xs text-neutral-400">环保积分</span>
              <div className="flex items-center gap-2">
                <span className={`text-2xl font-bold text-remuse-secondary transition-all duration-300 ${isPointsAnimating ? 'scale-110 text-white' : ''}`}>
                  {displayPoints.toLocaleString()}
                </span>
                {isPointsAnimating && <Zap size={16} className="animate-bounce text-remuse-secondary" />}
              </div>
            </div>
          </div>
        </nav>

        <main aria-label="内容区域" className="relative flex flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
          <div className="pointer-events-none h-6 shrink-0 bg-remuse-dark md:hidden" />
        </main>
      </div>

      <nav
        aria-label="移动端导航"
        className="safe-area-pb z-50 grid min-h-[4.75rem] grid-cols-5 items-end border-t border-remuse-border bg-remuse-panel/95 px-2 pt-2 backdrop-blur md:hidden"
      >
        <NavItem icon={<ScanLine size={20} />} label="扫描" active={currentView === 'SCANNER'} onClick={() => onChangeView('SCANNER')} />
        <NavItem icon={<Sticker size={20} />} label="贴纸" active={currentView === 'STICKER_LIBRARY'} onClick={() => onChangeView('STICKER_LIBRARY')} />

        <div className="relative -top-6 flex items-center justify-center">
          <button
            onClick={() => onChangeView('MUSEUM')}
            aria-label="藏品馆"
            aria-current={currentView === 'MUSEUM' ? 'page' : undefined}
            className="group relative flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full shadow-[0_0_15px_rgba(204,255,0,0.4)] transition-transform hover:scale-105 active:scale-95"
          >
            <span className="absolute inset-0 scale-110 rounded-full bg-remuse-secondary opacity-30" />
            <span className="absolute inset-0 rounded-full bg-remuse-secondary opacity-100" />
            <Box size={32} strokeWidth={3} className="relative z-10 text-black transition-transform group-hover:scale-110" />
            <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-white opacity-50" />
          </button>
        </div>

        <NavItem icon={<Compass size={20} />} label="灵感" active={currentView === 'INSPIRATION'} onClick={() => onChangeView('INSPIRATION')} />
        <NavItem icon={<Trophy size={20} />} label="我的" active={currentView === 'PROFILE'} onClick={() => onChangeView('PROFILE')} />
      </nav>
    </div>
  );
};

export default Layout;
