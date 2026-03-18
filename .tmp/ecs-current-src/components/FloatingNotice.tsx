import React from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

type NoticeTone = 'success' | 'error' | 'info';

interface FloatingNoticeProps {
  tone?: NoticeTone;
  title?: string;
  message: string;
  onClose?: () => void;
  className?: string;
}

const toneMap: Record<NoticeTone, { icon: React.ReactNode; border: string; bg: string; iconColor: string }> = {
  success: {
    icon: <CheckCircle2 size={18} />,
    border: 'border-emerald-400/25',
    bg: 'bg-emerald-500/10',
    iconColor: 'text-emerald-300',
  },
  error: {
    icon: <AlertCircle size={18} />,
    border: 'border-red-400/25',
    bg: 'bg-red-500/10',
    iconColor: 'text-red-300',
  },
  info: {
    icon: <Info size={18} />,
    border: 'border-cyan-400/25',
    bg: 'bg-cyan-500/10',
    iconColor: 'text-cyan-300',
  },
};

const FloatingNotice: React.FC<FloatingNoticeProps> = ({
  tone = 'info',
  title,
  message,
  onClose,
  className = '',
}) => {
  const style = toneMap[tone];

  return (
    <div className={`rounded-2xl border ${style.border} ${style.bg} px-4 py-3 shadow-lg backdrop-blur-sm ${className}`.trim()}>
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 ${style.iconColor}`}>{style.icon}</div>
        <div className="min-w-0 flex-1">
          {title && <p className="text-sm font-display font-bold text-white">{title}</p>}
          <p className={`text-sm leading-6 text-neutral-200 ${title ? 'mt-1' : ''}`.trim()}>{message}</p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/20 text-neutral-400 transition-colors hover:text-white"
            aria-label="关闭提示"
          >
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
};

export default FloatingNotice;
