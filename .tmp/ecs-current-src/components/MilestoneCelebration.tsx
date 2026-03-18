
import React, { useEffect, useState } from 'react';

interface MilestoneCelebrationProps {
  itemCount: number;
  itemName: string;
  onDismiss: () => void;
}

const MILESTONES: Record<number, { emoji: string; title: string; subtitle: string }> = {
  1:  { emoji: '🌱', title: '第一件藏品！',   subtitle: '万物再生之旅正式开始' },
  3:  { emoji: '🌿', title: '初露锋芒',       subtitle: '已收集 3 件藏品' },
  5:  { emoji: '🪴', title: '收藏新星',       subtitle: '5 件藏品达成！' },
  10: { emoji: '🌳', title: '博物小馆长',     subtitle: '10 件藏品里程碑' },
  20: { emoji: '🏛️', title: '再生大师',       subtitle: '20 件！了不起的收藏' },
  50: { emoji: '✨', title: '传奇策展人',     subtitle: '半百藏品殿堂级成就' },
};

export const isMilestone = (count: number): boolean => count in MILESTONES;

const CONFETTI_COLORS = ['#ccff00', '#00ffff', '#ff6b9d', '#ffd700', '#a78bfa', '#ffffff'];

const MilestoneCelebration: React.FC<MilestoneCelebrationProps> = ({ itemCount, itemName, onDismiss }) => {
  const milestone = MILESTONES[itemCount];
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Trigger entrance
    requestAnimationFrame(() => setVisible(true));

    // Auto dismiss after 3.5s
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onDismiss, 400);
    }, 3500);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  if (!milestone) return null;

  return (
    <div 
      className={`fixed inset-0 z-[100] flex items-center justify-center transition-opacity duration-400 ${visible ? 'opacity-100' : 'opacity-0'}`}
      onClick={() => { setVisible(false); setTimeout(onDismiss, 400); }}
      role="dialog"
      aria-label={`里程碑成就：${milestone.title}`}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      {/* Confetti particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {Array.from({ length: 30 }).map((_, i) => {
          const left = Math.random() * 100;
          const delay = Math.random() * 0.8;
          const size = 4 + Math.random() * 8;
          const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
          const duration = 1.2 + Math.random() * 1;
          return (
            <div
              key={i}
              className="absolute rounded-sm"
              style={{
                left: `${left}%`,
                top: '-10px',
                width: `${size}px`,
                height: `${size * 0.6}px`,
                backgroundColor: color,
                animation: `confettiFall ${duration}s ease-out ${delay}s forwards`,
                transform: `rotate(${Math.random() * 360}deg)`,
              }}
            />
          );
        })}
      </div>

      {/* Main card */}
      <div className={`relative z-10 text-center transition-all duration-500 ${visible ? 'animate-milestone-pop' : 'scale-75 opacity-0'}`}>
        {/* Emoji */}
        <div className="text-6xl mb-4 drop-shadow-lg">{milestone.emoji}</div>
        
        {/* Achievement badge */}
        <div className="bg-remuse-panel border-2 border-remuse-accent px-8 py-6 clip-corner shadow-[0_0_40px_rgba(204,255,0,0.15)]">
          <div className="text-[10px] font-mono text-remuse-accent tracking-[0.3em] mb-2">MILESTONE UNLOCKED</div>
          <h2 className="text-3xl font-display font-black text-white mb-1">{milestone.title}</h2>
          <p className="text-neutral-400 text-sm mb-3">{milestone.subtitle}</p>
          <div className="border-t border-neutral-700 pt-3 mt-3">
            <span className="text-xs text-neutral-500 font-mono">最新藏品</span>
            <p className="text-remuse-secondary font-display font-bold text-lg">「{itemName}」</p>
          </div>
        </div>

        <p className="text-neutral-500 text-xs font-mono mt-4 animate-pulse">点击任意处关闭</p>
      </div>
    </div>
  );
};

export default MilestoneCelebration;
