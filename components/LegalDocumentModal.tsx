import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { LegalDocumentKey, LEGAL_DOCUMENTS } from '../services/legalDocuments';

interface LegalDocumentModalProps {
  documentKey: LegalDocumentKey | null;
  onClose: () => void;
}

const LegalDocumentModal: React.FC<LegalDocumentModalProps> = ({ documentKey, onClose }) => {
  useEffect(() => {
    if (!documentKey) {
      return undefined;
    }

    const body = window.document.body;
    const previousOverflow = body.style.overflow;
    body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [documentKey, onClose]);

  if (!documentKey) {
    return null;
  }

  const legalDocument = LEGAL_DOCUMENTS[documentKey];

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-sm">
      <button type="button" className="absolute inset-0" aria-label="关闭法律文档" onClick={onClose} />

      <div className="relative z-10 flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[#111315] shadow-[0_24px_80px_rgba(0,0,0,0.48)]">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-6 py-5">
          <div>
            <p className="text-[11px] font-mono uppercase tracking-[0.28em] text-remuse-accent">{legalDocument.title}</p>
            <h2 className="mt-2 text-2xl font-display font-bold text-white">{legalDocument.summary}</h2>
            <p className="mt-2 text-sm text-neutral-400">
              版本 {legalDocument.version} · 更新于 {legalDocument.updatedAt}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/20 text-neutral-300 transition-colors hover:border-white/20 hover:text-white"
            aria-label="关闭"
          >
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-6">
          <div className="space-y-6">
            {legalDocument.sections.map((section) => (
              <section key={section.heading} className="rounded-2xl border border-white/8 bg-white/[0.03] p-5">
                <h3 className="text-lg font-display font-bold text-white">{section.heading}</h3>
                <div className="mt-3 space-y-3 text-sm leading-7 text-neutral-300">
                  {section.body.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LegalDocumentModal;
