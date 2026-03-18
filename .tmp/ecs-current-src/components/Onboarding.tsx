
import React, { useState } from 'react';
import { ScanLine, Sticker, Recycle, BookOpen, ArrowRight, X, ChevronRight } from 'lucide-react';

interface OnboardingProps {
  onComplete: () => void;
}

const slides = [
  {
    id: 1,
    icon: <ScanLine size={64} />,
    title: "实体归档",
    sub: "ARCHIVE REALITY",
    desc: "将现实世界的废旧物品扫描上传，转化为永久保存的数字资产。每一个裂痕都是故事。",
    color: "text-remuse-accent"
  },
  {
    id: 2,
    icon: <Sticker size={64} />,
    title: "数字分身",
    sub: "DIGITAL TWIN",
    desc: "AI 视觉引擎自动提取物品特征，生成独一无二的矢量贴纸与短剧脚本。",
    color: "text-remuse-secondary"
  },
  {
    id: 3,
    icon: <Recycle size={64} />,
    title: "再生协议",
    sub: "REMUSE IDEA",
    desc: "获取针对性的改造方案，从简单装饰到复杂重构，让物品在现实中焕发新生。",
    color: "text-white"
  },
  {
    id: 4,
    icon: <BookOpen size={64} />,
    title: "馆长图鉴",
    sub: "COLLECTION",
    desc: "点亮你的收藏图鉴，赢取环保积分与成就徽章，成为再生博物馆的资深馆长。",
    color: "text-remuse-accent"
  }
];

const Onboarding: React.FC<OnboardingProps> = ({ onComplete }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isExiting, setIsExiting] = useState(false);
  const touchStartX = React.useRef(0);
  const touchEndX = React.useRef(0);

  const handleNext = () => {
    if (currentIndex < slides.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    touchEndX.current = e.changedTouches[0].clientX;
    const diff = touchStartX.current - touchEndX.current;
    if (Math.abs(diff) > 50) {
      if (diff > 0) handleNext();
      else handlePrev();
    }
  };

  const handleComplete = () => {
    setIsExiting(true);
    setTimeout(onComplete, 500); // Wait for exit animation
  };

  return (
    <div className={`fixed inset-0 z-[60] bg-remuse-dark flex flex-col transition-opacity duration-500 ${isExiting ? 'opacity-0' : 'opacity-100'}`}>
      {/* Background Decor */}
      <div className="absolute inset-0 bg-grid-pattern opacity-10 pointer-events-none"></div>
      
      {/* Skip Button */}
      <button 
        onClick={handleComplete}
        className="absolute top-6 right-6 text-neutral-500 hover:text-white font-display text-xs z-20 flex items-center gap-1 p-2 min-h-[44px] min-w-[44px]"
      >
        SKIP <X size={14} />
      </button>

      {/* Main Slider Area */}
      <div className="flex-1 relative overflow-hidden flex items-center justify-center"
           onTouchStart={handleTouchStart}
           onTouchEnd={handleTouchEnd}
      >
         <div 
            className="flex transition-transform duration-500 ease-out w-full h-full"
            style={{ transform: `translateX(-${currentIndex * 100}%)` }}
         >
            {slides.map((slide) => (
                <div key={slide.id} className="min-w-full h-full flex flex-col items-center justify-center p-8 relative">
                    {/* Decorative Ring */}
                    <div className="absolute w-64 h-64 md:w-96 md:h-96 border border-neutral-800 rounded-full flex items-center justify-center animate-spin-slow opacity-30">
                        <div className="w-[90%] h-[90%] border border-neutral-800 rounded-full border-dashed"></div>
                    </div>

                    {/* Content */}
                    <div className="relative z-10 flex flex-col items-center text-center max-w-md animate-fade-in">
                        <div className={`mb-8 p-6 bg-neutral-900/50 border border-neutral-800 rounded-2xl shadow-[0_0_30px_rgba(0,0,0,0.5)] ${slide.color}`}>
                            {slide.icon}
                        </div>
                        
                        <span className="text-xs font-mono text-neutral-500 tracking-[0.3em] mb-2 block">{slide.sub}</span>
                        <h2 className="text-3xl md:text-4xl font-bold text-white font-display mb-4">{slide.title}</h2>
                        <p className="text-neutral-400 leading-relaxed text-sm md:text-base">
                            {slide.desc}
                        </p>
                    </div>
                </div>
            ))}
         </div>
      </div>

      {/* Bottom Controls */}
      <div className="p-8 md:p-12 w-full max-w-md mx-auto z-20">
         <div className="flex items-center justify-between">
            {/* Dots */}
            <div className="flex gap-2">
                {slides.map((_, idx) => (
                    <div 
                        key={idx}
                        className={`h-1.5 rounded-full transition-all duration-300 ${
                            idx === currentIndex ? 'w-8 bg-remuse-accent' : 'w-2 bg-neutral-700'
                        }`}
                    />
                ))}
            </div>

            {/* Next/Start Button */}
            <button 
                onClick={handleNext}
                className="group flex items-center gap-2 px-6 py-3 bg-white text-black font-bold font-display text-sm hover:bg-remuse-accent transition-colors clip-corner"
            >
                {currentIndex === slides.length - 1 ? 'START JOURNEY' : 'NEXT'}
                {currentIndex === slides.length - 1 ? <ArrowRight size={16} /> : <ChevronRight size={16} />}
            </button>
         </div>
      </div>
    </div>
  );
};

export default Onboarding;
