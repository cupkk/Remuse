import React, { useEffect, useState } from 'react';

interface LaunchScreenProps {
  onComplete: () => void;
}

const LaunchScreen: React.FC<LaunchScreenProps> = ({ onComplete }) => {
  const [stage, setStage] = useState<'init' | 'text' | 'trace' | 'fade'>('init');

  useEffect(() => {
    // Phase 1: Mosaic flow happens automatically via CSS animation
    
    // Phase 2: Start text animation after 0.5s
    const textTimer = setTimeout(() => {
      setStage('text');
    }, 500);

    // Phase 3: Start tracing the outline after 3s (giving text time to draw)
    const traceTimer = setTimeout(() => {
      setStage('trace');
    }, 3000);

    // Phase 4: Start fading out
    const fadeTimer = setTimeout(() => {
      setStage('fade');
    }, 4500);

    // Phase 5: Unmount
    const completeTimer = setTimeout(() => {
      onComplete();
    }, 5200);

    return () => {
      clearTimeout(textTimer);
      clearTimeout(traceTimer);
      clearTimeout(fadeTimer);
      clearTimeout(completeTimer);
    };
  }, [onComplete]);

  return (
    <div 
      onClick={onComplete}
      role="button"
      aria-label="点击跳过启动动画"
      className={`fixed inset-0 z-[100] bg-black flex items-center justify-center transition-opacity duration-700 ease-out cursor-pointer ${stage === 'fade' ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
    >
      <div className="relative w-80 h-80">
        <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible">
          <defs>
            <clipPath id="museum-clip">
              {/* Building Silhouette */}
              <path d="M10 40 L50 15 L90 40 V90 H10 V40 Z" />
            </clipPath>
            {/* Mosaic Pattern */}
            <pattern id="poly-mosaic" x="0" y="0" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
               <path d="M0 0 L10 0 L5 8.66 Z" fill="#2a2a2a" />
               <path d="M5 8.66 L10 0 L15 8.66 Z" fill="#1f1f1f" />
               <path d="M0 0 L5 8.66 L-5 8.66 Z" fill="#1a1a1a" />
               <path d="M0 17.32 L5 8.66 L10 17.32 Z" fill="#222" />
            </pattern>
          </defs>

          {/* Masked Flowing Background */}
          <g clipPath="url(#museum-clip)">
             {/* Moving Background Rect */}
             <rect x="-50" y="-50" width="200" height="200" fill="url(#poly-mosaic)" className="animate-mosaic-flow">
             </rect>
             <rect width="100" height="100" fill="rgba(0,0,0,0.5)" /> {/* Darkened overlay for text contrast */}
          </g>

          {/* Static White Outline (Fine lines) */}
          <path 
            d="M10 40 L50 15 L90 40 V90 H10 V40 Z" 
            fill="none" 
            stroke="white" 
            strokeWidth="0.5" 
            strokeOpacity="0.2"
          />
          
          {/* Main Title Text - Center */}
          {stage !== 'init' && (
            <>
              <text 
                x="50" 
                y="55" 
                textAnchor="middle" 
                className="animate-text-draw font-mono"
                fontSize="10"
                fontWeight="bold"
                fill="none"
                stroke="white"
                strokeWidth="0.4"
                letterSpacing="1"
              >
                再生博物馆
              </text>
              <text 
                x="50" 
                y="65" 
                textAnchor="middle" 
                className="animate-text-draw font-mono"
                fontSize="5"
                fill="none"
                stroke="white"
                strokeWidth="0.3"
                letterSpacing="2"
                style={{ animationDelay: '0.5s' }}
              >
                REMUSE
              </text>
            </>
          )}

          {/* Inner Pillars (Decorative) */}
          <g stroke="white" strokeWidth="0.2" strokeOpacity="0.1">
            <path d="M25 40 V90" />
            <path d="M75 40 V90" />
          </g>

          {/* Energy Trace Path */}
          <path 
            d="M10 40 L50 15 L90 40 V90 H10 V40 Z" 
            fill="none" 
            stroke="#ccff00" 
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              strokeDasharray: 300,
              strokeDashoffset: stage === 'trace' || stage === 'fade' ? 0 : 300,
              transition: 'stroke-dashoffset 1.5s ease-in-out'
            }}
          />
        </svg>

        {/* Loading Text */}
        <div className="absolute -bottom-12 w-full text-center">
            <span className="font-mono text-xs text-neutral-400 tracking-[0.2em] uppercase animate-pulse">
                点击任意处跳过
            </span>
        </div>
      </div>
    </div>
  );
};

export default LaunchScreen;