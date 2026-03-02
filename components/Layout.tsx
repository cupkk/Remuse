
import React, { useEffect, useState } from 'react';
import { ViewState } from '../types';
import { Box, ScanLine, Trophy, Zap, Plus, BookOpen, Sticker, Compass } from 'lucide-react';

interface LayoutProps {
  currentView: ViewState;
  onChangeView: (view: ViewState) => void;
  children: React.ReactNode;
  ecoPoints: number;
}

const NavItem: React.FC<{ 
  icon: React.ReactNode; 
  label: string; 
  active: boolean; 
  onClick: () => void;
  desktop?: boolean;
}> = ({ icon, label, active, onClick, desktop }) => (
  <button 
    onClick={onClick}
    role="tab"
    aria-selected={active}
    aria-current={active ? 'page' : undefined}
    aria-label={label}
    className={`flex flex-col items-center justify-center p-2 min-h-[48px] w-full md:w-auto md:flex-row md:justify-start md:px-6 md:py-4 md:gap-4 transition-all duration-300
      ${active 
        ? 'text-remuse-accent bg-neutral-900 border-t-2 md:border-t-0 md:border-l-2 border-remuse-accent' 
        : 'text-neutral-400 hover:text-neutral-200'}
      ${desktop ? 'hidden md:flex' : ''}  
      `}
  >
    <div className="mb-1 md:mb-0 transform transition-transform duration-300 hover:scale-110">{icon}</div>
    <span className="text-[10px] md:text-sm font-display tracking-wide">{label}</span>
  </button>
);

const Layout: React.FC<LayoutProps> = ({ currentView, onChangeView, children, ecoPoints }) => {
  const [displayPoints, setDisplayPoints] = useState(ecoPoints);
  const [isPointsAnimating, setIsPointsAnimating] = useState(false);

  // Animate points when they change
  useEffect(() => {
    if (ecoPoints !== displayPoints) {
      setIsPointsAnimating(true);
      const diff = ecoPoints - displayPoints;
      // Simple increment effect
      const step = diff > 0 ? 1 : -1;
      const interval = setInterval(() => {
        setDisplayPoints(prev => {
          if (prev === ecoPoints) {
            clearInterval(interval);
            return prev;
          }
          return prev + step;
        });
      }, 50);

      // Reset animation class after a short delay
      const timeout = setTimeout(() => {
          setIsPointsAnimating(false);
          setDisplayPoints(ecoPoints); // Ensure sync
      }, 1000);

      return () => {
          clearInterval(interval);
          clearTimeout(timeout);
      };
    }
  }, [ecoPoints]);

  return (
    <div className="flex flex-col h-screen bg-remuse-dark text-white overflow-hidden">
      {/* Top Mobile Bar */}
      <div className="md:hidden p-4 safe-area-pt border-b border-remuse-border bg-remuse-panel flex justify-between items-center z-50">
        <h1 className="font-display font-bold text-xl tracking-tight">REMUSE</h1>
        <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-remuse-secondary">ONLINE</span>
            <div className="w-2 h-2 bg-remuse-secondary rounded-full animate-pulse"></div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden relative">
        {/* Sidebar (Desktop) */}
        <nav aria-label="主导航" className="hidden md:flex flex-col w-64 bg-remuse-panel border-r border-remuse-border z-40">
           <div className="p-8 border-b border-remuse-border">
             <h1 className="text-2xl font-bold tracking-tight font-display">REMUSE</h1>
             <p className="text-[10px] text-neutral-400 font-mono mt-2">V 1.0.0 // ONLINE</p>
           </div>
           
           <div className="flex-1 py-4 space-y-1" role="tablist" aria-label="页面导航">
             <NavItem 
               icon={<ScanLine size={20}/>} 
               label="扫描仪" 
               active={currentView === 'SCANNER'} 
               onClick={() => onChangeView('SCANNER')}
             />
             <NavItem
               icon={<Box size={20}/>}
               label="藏品馆"
               active={currentView === 'MUSEUM' || currentView === 'ITEM_DETAIL'}
               onClick={() => onChangeView('MUSEUM')}
             />
             <NavItem
               icon={<Sticker size={20}/>}
               label="贴纸库"
               active={currentView === 'STICKER_LIBRARY'} 
               onClick={() => onChangeView('STICKER_LIBRARY')}
             />
             <NavItem 
               icon={<Compass size={20}/>} 
               label="灵感广场" 
               active={currentView === 'INSPIRATION'} 
               onClick={() => onChangeView('INSPIRATION')}
             />
             <NavItem 
               icon={<Trophy size={20}/>} 
               label="馆长办公室" 
               active={currentView === 'PROFILE'} 
               onClick={() => onChangeView('PROFILE')}
             />
           </div>

           <div className="p-6 border-t border-remuse-border">
             <div className="bg-neutral-900 p-4 rounded border border-neutral-800 transition-all duration-300">
               <span className="text-xs text-neutral-400 font-mono block mb-1">环保积分</span>
               <div className="flex items-center gap-2">
                    <span className={`text-2xl font-bold text-remuse-secondary transition-all duration-300 ${isPointsAnimating ? 'scale-110 text-white' : ''}`}>
                        {displayPoints.toLocaleString()}
                    </span>
                    {isPointsAnimating && (
                        <Zap size={16} className="text-remuse-secondary animate-bounce" />
                    )}
               </div>
             </div>
           </div>
        </nav>

        {/* Main Content Area */}
        <main aria-label="内容区域" className="flex-1 relative overflow-hidden flex flex-col">
           {children}
        </main>
      </div>

      {/* Mobile Bottom Nav */}
      <nav aria-label="移动端导航" className="md:hidden bg-remuse-panel border-t border-remuse-border grid grid-cols-5 items-center z-50 safe-area-pb h-16">
        
        {/* Left Group */}
        <NavItem 
          icon={<ScanLine size={20}/>} 
          label="扫描" 
          active={currentView === 'SCANNER'} 
          onClick={() => onChangeView('SCANNER')}
        />
        <NavItem 
          icon={<Sticker size={20}/>} 
          label="贴纸" 
          active={currentView === 'STICKER_LIBRARY'} 
          onClick={() => onChangeView('STICKER_LIBRARY')}
        />

        {/* Center Prominent Button (Now Gallery) */}
        <div className="relative flex justify-center items-center -top-5">
          <button 
            onClick={() => onChangeView('MUSEUM')}
            aria-label="藏品馆"
            aria-current={currentView === 'MUSEUM' ? 'page' : undefined}
            className="group relative w-16 h-16 rounded-full flex items-center justify-center shadow-[0_0_15px_rgba(204,255,0,0.4)] transition-transform hover:scale-105 active:scale-95"
          >
            {/* Subtle glow ring (no persistent animation for GPU perf) */}
            <span className="absolute inset-0 rounded-full bg-remuse-secondary opacity-30 scale-110"></span>
            <span className="absolute inset-0 rounded-full bg-remuse-secondary opacity-100"></span>
            
            {/* Icon */}
            <Box size={32} strokeWidth={3} className="text-black relative z-10 transition-transform group-hover:scale-110" />
            
            {/* Decorative Corner Clip visual trick */}
            <span className="absolute top-1 right-1 w-2 h-2 bg-white rounded-full opacity-50"></span>
          </button>
        </div>

        {/* Right Group */}

        <NavItem 
          icon={<Trophy size={20}/>} 
          label="我的" 
          active={currentView === 'PROFILE'} 
          onClick={() => onChangeView('PROFILE')}
        />
      </nav>
    </div>
  );
};

export default Layout;
