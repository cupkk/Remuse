import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  BookImage,
  Box,
  CheckCircle2,
  Hammer,
  Loader2,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { CollectedItem, SavedTransformationGuide, TransformationGuideSourceItem } from '../types';

interface TransformationGuideStudioProps {
  sourceItems: TransformationGuideSourceItem[];
  guide?: SavedTransformationGuide | null;
  isGenerating?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onBack: () => void;
  onOpenLibrary?: () => void;
  activeItems?: CollectedItem[];
  onCompleteItem?: (itemId: string) => Promise<void> | void;
}

const TransformationGuideStudio: React.FC<TransformationGuideStudioProps> = ({
  sourceItems = [],
  guide = null,
  isGenerating = false,
  error = null,
  onRetry,
  onBack,
  onOpenLibrary,
  activeItems = [],
  onCompleteItem,
}) => {
  const safeSourceItems = Array.isArray(sourceItems) ? sourceItems : [];
  const safeActiveItems = Array.isArray(activeItems) ? activeItems : [];
  const [isCompleting, setIsCompleting] = useState(false);

  const selectedCount = safeSourceItems.length;
  const pendingItems = safeActiveItems.filter((item) => item.status !== 'remused');
  const remusedCount = safeActiveItems.length - pendingItems.length;

  const headline = useMemo(() => {
    if (guide?.title) {
      return guide.title;
    }

    if (safeSourceItems.length === 1) {
      return `围绕 ${safeSourceItems[0].name} 生成综合改造指南`;
    }

    return `为 ${safeSourceItems.length} 件藏品生成综合改造指南`;
  }, [guide?.title, safeSourceItems]);

  const handleComplete = async () => {
    if (!onCompleteItem || pendingItems.length === 0) {
      return;
    }

    setIsCompleting(true);
    try {
      await Promise.all(pendingItems.map((item) => Promise.resolve(onCompleteItem(item.id))));
    } finally {
      setIsCompleting(false);
    }
  };

  return (
    <div data-testid="guide-studio" className="h-full overflow-y-auto bg-remuse-dark px-4 py-5 md:px-8 md:py-8">
      <div className="mx-auto flex max-w-[1480px] flex-col gap-6">
        <section className="rounded-[32px] border border-remuse-border bg-[radial-gradient(circle_at_top_left,rgba(204,255,0,0.14),transparent_30%),linear-gradient(180deg,rgba(18,22,26,0.98),rgba(8,10,13,0.98))] p-5 shadow-[0_24px_72px_rgba(0,0,0,0.3)] md:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="space-y-3">
              <button
                type="button"
                onClick={onBack}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-neutral-700 px-4 text-sm text-neutral-300 transition-colors hover:border-white hover:text-white"
              >
                <ArrowLeft size={16} />
                返回再生工坊
              </button>
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 rounded-full border border-remuse-accent/20 bg-remuse-accent/10 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.28em] text-remuse-accent">
                  <Hammer size={14} />
                  Guide Studio
                </div>
                <h1 className="font-display text-3xl font-black tracking-[-0.04em] text-white md:text-4xl">{headline}</h1>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm text-neutral-300">
                已选 <span className="font-mono text-white">{selectedCount}</span> 件
              </div>
              {guide ? (
                <div className="rounded-full border border-remuse-secondary/25 bg-remuse-secondary/10 px-4 py-2 text-sm text-remuse-secondary">
                  已入库
                </div>
              ) : null}
              {onOpenLibrary ? (
                <button
                  type="button"
                  onClick={onOpenLibrary}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-neutral-700 px-4 text-sm text-neutral-200 transition-colors hover:border-white hover:text-white"
                >
                  <BookImage size={16} />
                  打开成果库
                </button>
              ) : null}
              {error && onRetry ? (
                <button
                  type="button"
                  onClick={onRetry}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-remuse-accent px-5 text-sm font-display font-bold text-black transition-colors hover:bg-white"
                >
                  <RefreshCw size={16} />
                  重新生成
                </button>
              ) : null}
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {safeSourceItems.map((item) => (
            <article key={item.id} className="overflow-hidden rounded-[26px] border border-remuse-border bg-remuse-panel shadow-[0_16px_40px_rgba(0,0,0,0.2)]">
              <div className="relative aspect-[4/3] overflow-hidden bg-black/30">
                {item.coverImageUrl || item.imageUrl ? (
                  <img src={item.coverImageUrl || item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-neutral-500">
                    <Box size={28} />
                  </div>
                )}
              </div>
              <div className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-display text-xl font-bold text-white">{item.name}</h2>
                  {safeActiveItems.some((activeItem) => activeItem.id === item.id && activeItem.status === 'remused') ? (
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-remuse-accent text-black">
                      <CheckCircle2 size={16} />
                    </div>
                  ) : null}
                </div>
                <p className="text-sm text-neutral-400">{item.material || '未记录材质'}</p>
                <p className="line-clamp-2 text-sm leading-6 text-neutral-500">
                  {item.description || item.story || '将基于这件藏品生成综合改造方案。'}
                </p>
                <div className="pt-1">
                  <span className="inline-flex rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[11px] font-mono uppercase tracking-[0.24em] text-neutral-400">
                    {item.category || '藏品'}
                  </span>
                </div>
              </div>
            </article>
          ))}
        </section>

        {isGenerating ? (
          <section className="rounded-[30px] border border-remuse-border bg-remuse-panel p-6 shadow-[0_20px_56px_rgba(0,0,0,0.22)]">
            <div className="flex min-h-[360px] flex-col items-center justify-center gap-5 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full border border-remuse-accent/30 bg-remuse-accent/10 text-remuse-accent">
                <Loader2 size={24} className="animate-spin" />
              </div>
              <div className="max-w-2xl">
                <h2 className="font-display text-2xl font-bold text-white">正在生成综合改造指南</h2>
                <p className="mt-3 text-sm leading-8 text-neutral-400">
                  你现在可以切换到其他界面继续浏览，生成任务会在后台继续运行。完成后，结果会自动保存到再生成果库。
                </p>
              </div>
            </div>
          </section>
        ) : null}

        {error ? (
          <section className="rounded-[28px] border border-red-500/30 bg-red-500/8 p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-display font-bold text-red-100">综合改造指南生成失败</p>
                <p className="mt-2 text-sm leading-7 text-red-200/90">{error}</p>
              </div>
              {onRetry ? (
                <button
                  type="button"
                  onClick={onRetry}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-red-300/40 px-4 text-sm text-red-100 transition-colors hover:border-red-200 hover:bg-red-500/10"
                >
                  <RefreshCw size={16} />
                  重试
                </button>
              ) : null}
            </div>
          </section>
        ) : null}

        {guide ? (
          <section className="grid gap-6 xl:grid-cols-[minmax(420px,0.94fr)_minmax(0,1.06fr)]">
            <article className="overflow-hidden rounded-[30px] border border-remuse-border bg-remuse-panel shadow-[0_20px_56px_rgba(0,0,0,0.22)]">
              <div className="aspect-[4/3] overflow-hidden bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_44%),linear-gradient(180deg,rgba(18,21,26,1),rgba(8,10,12,1))]">
                <img src={guide.imageUrl} alt={guide.title} className="h-full w-full object-cover" />
              </div>
            </article>

            <div className="grid gap-6">
              <article className="rounded-[30px] border border-remuse-border bg-remuse-panel p-5 shadow-[0_18px_48px_rgba(0,0,0,0.2)] md:p-6">
                <div className="inline-flex items-center gap-2 rounded-full border border-remuse-secondary/20 bg-remuse-secondary/10 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.24em] text-remuse-secondary">
                  <Sparkles size={14} />
                  综合方案
                </div>
                <h2 className="mt-4 font-display text-3xl font-black tracking-[-0.04em] text-white">{guide.title}</h2>
                <p className="mt-4 text-sm leading-8 text-neutral-200">{guide.summary}</p>
                <div className="mt-5 rounded-[22px] border border-neutral-800 bg-black/20 p-4">
                  <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-remuse-accent">成品构想</p>
                  <p className="mt-3 text-sm leading-7 text-neutral-200">{guide.concept}</p>
                </div>
                <div className="mt-5 flex flex-wrap gap-3 text-xs text-neutral-500">
                  <span>来源藏品 {guide.sourceItems.length}</span>
                  <span>生成时间 {new Date(guide.dateCreated).toLocaleDateString('zh-CN')}</span>
                </div>
              </article>

              <article className="rounded-[30px] border border-remuse-border bg-remuse-panel p-5 shadow-[0_18px_48px_rgba(0,0,0,0.2)] md:p-6">
                <div className="grid gap-6 lg:grid-cols-2">
                  <div>
                    <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-remuse-accent">补充材料</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {guide.materials.map((material) => (
                        <span key={material} className="rounded-full border border-white/10 bg-black/25 px-3 py-1.5 text-sm text-neutral-200">
                          {material}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-remuse-accent">实施提示</p>
                    <div className="mt-4 grid gap-3">
                      {guide.tips.map((tip, index) => (
                        <div key={`${tip}-${index}`} className="rounded-[20px] border border-neutral-800 bg-black/20 px-4 py-3 text-sm leading-7 text-neutral-200">
                          {tip}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </article>

              <article className="rounded-[30px] border border-remuse-border bg-remuse-panel p-5 shadow-[0_18px_48px_rgba(0,0,0,0.2)] md:p-6">
                <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-remuse-accent">改造步骤</p>
                <div className="mt-4 grid gap-3">
                  {guide.steps.map((step, index) => (
                    <div key={`${step}-${index}`} className="rounded-[22px] border border-neutral-800 bg-black/20 px-4 py-4">
                      <div className="flex items-start gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-remuse-accent font-mono text-sm font-bold text-black">
                          {index + 1}
                        </div>
                        <p className="text-sm leading-7 text-neutral-200">{step}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </article>

              {onCompleteItem && safeActiveItems.length > 0 ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm text-neutral-400">
                    已标记完成 <span className="font-mono text-white">{remusedCount}</span> / {safeActiveItems.length}
                  </div>
                  <button
                    type="button"
                    disabled={isCompleting || pendingItems.length === 0}
                    onClick={() => void handleComplete()}
                    className="inline-flex min-h-[46px] items-center gap-2 rounded-full bg-remuse-accent px-5 text-sm font-display font-bold text-black transition-colors hover:bg-white disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
                  >
                    {isCompleting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                    {pendingItems.length === 0 ? '这些藏品已标记完成' : '标记这些藏品已完成改造'}
                  </button>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
};

export default TransformationGuideStudio;
