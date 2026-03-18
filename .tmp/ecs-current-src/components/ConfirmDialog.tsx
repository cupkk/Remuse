import React from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmTone?: 'danger' | 'accent';
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  message,
  confirmLabel = '确认',
  cancelLabel = '取消',
  confirmTone = 'danger',
  busy = false,
  onConfirm,
  onCancel,
}) => {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="关闭确认弹窗" onClick={onCancel} />
      <div className="relative z-10 w-full max-w-md rounded-[28px] border border-white/10 bg-[#111315] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.48)]">
        <div className="flex items-start gap-3">
          <div className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-red-400/20 bg-red-500/10 text-red-300">
            <AlertTriangle size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-xl font-display font-bold text-white">{title}</h3>
            <p className="mt-2 text-sm leading-7 text-neutral-400">{message}</p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="inline-flex min-h-[46px] items-center justify-center rounded-full border border-neutral-700 bg-black/20 px-4 py-3 text-sm text-neutral-300 transition-colors hover:border-white hover:text-white disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`inline-flex min-h-[46px] items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-display font-bold transition-colors disabled:opacity-50 ${
              confirmTone === 'accent'
                ? 'bg-remuse-accent text-black hover:bg-white'
                : 'bg-red-600 text-white hover:bg-red-500'
            }`}
          >
            {busy && <Loader2 size={16} className="animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
