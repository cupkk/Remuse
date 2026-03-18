import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, CheckCircle2, Download, Grid, Loader2, Search, X } from 'lucide-react';
import { Sticker } from '../types';
import PerlerPatternCanvas from './PerlerPatternCanvas';
import logger from '../services/logger';
import {
  buildPerlerPatternCsv,
  drawPerlerPatternCanvas,
  generatePerlerPattern,
  getPerlerDisplayColorCounts,
  PerlerColorSystem,
  PerlerPatternMode,
  PerlerPatternResult,
  perlerColorSystemOptions,
} from '../services/perlerPattern';
import { PERLER_PATTERN_CATEGORY } from '../shared/stickerCategories';

interface PerlerPatternStudioProps {
  sourceStickers: Sticker[];
  onBack: () => void;
  onPatternSaved?: (patternSticker: Sticker) => Promise<void> | void;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1200);
}

async function exportCanvasAsPng(canvas: HTMLCanvasElement, filename: string) {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) {
    throw new Error('Failed to export perler canvas');
  }

  triggerDownload(blob, filename);
}

function createExportCanvas(
  pattern: PerlerPatternResult,
  options: {
    cellSize: number;
    colorSystem: PerlerColorSystem;
    showCellCodes: boolean;
  },
) {
  const exportCanvas = document.createElement('canvas');
  drawPerlerPatternCanvas(exportCanvas, pattern, {
    title: 'RE-MUSE 拼豆图纸',
    summary: `${pattern.columns} x ${pattern.rows} · ${pattern.totalBeads} beads · ${pattern.colorCounts.length} colors`,
    cellSize: options.cellSize,
    displayColorSystem: options.colorSystem,
    showCellCodes: options.showCellCodes,
    highlightColor: null,
  });
  return exportCanvas;
}

function exportCsvFile(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, filename);
}

function buildPatternSummary(sourceSticker: Sticker, pattern: PerlerPatternResult) {
  const sourceText = (sourceSticker.dramaText?.trim() || '未命名贴纸').slice(0, 80);
  return `拼豆图纸 · ${sourceText} · ${pattern.columns}x${pattern.rows} · ${pattern.totalBeads}豆 · ${pattern.colorCounts.length}色`;
}

const PerlerPatternStudio: React.FC<PerlerPatternStudioProps> = ({
  sourceStickers,
  onBack,
  onPatternSaved,
}) => {
  const sourceSticker = sourceStickers[0] ?? null;
  const canGenerate = sourceStickers.length === 1 && !!sourceSticker;
  const [pattern, setPattern] = useState<PerlerPatternResult | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const [columns, setColumns] = useState(48);
  const [similarityThreshold, setSimilarityThreshold] = useState(30);
  const [mode, setMode] = useState<PerlerPatternMode>('dominant');
  const [colorSystem, setColorSystem] = useState<PerlerColorSystem>('MARD');
  const [highlightColor, setHighlightColor] = useState<string | null>(null);
  const [legendSearch, setLegendSearch] = useState('');
  const [previewCellSize, setPreviewCellSize] = useState(22);
  const [showCellCodes, setShowCellCodes] = useState(true);
  const [saveStatus, setSaveStatus] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const generationTokenRef = useRef(0);

  useEffect(() => {
    if (!saveStatus) {
      return undefined;
    }

    const timer = window.setTimeout(() => setSaveStatus(''), 2200);
    return () => window.clearTimeout(timer);
  }, [saveStatus]);

  useEffect(() => {
    setHighlightColor(null);
  }, [pattern, colorSystem]);

  useEffect(() => {
    if (!canGenerate || !sourceSticker) {
      setPattern(null);
      setError('');
      setIsGenerating(false);
      return undefined;
    }

    const currentToken = generationTokenRef.current + 1;
    generationTokenRef.current = currentToken;
    setIsGenerating(true);
    setError('');

    const timer = window.setTimeout(async () => {
      try {
        const nextPattern = await generatePerlerPattern(sourceSticker.stickerImageUrl, {
          columns,
          similarityThreshold,
          mode,
        });

        if (generationTokenRef.current === currentToken) {
          setPattern(nextPattern);
        }
      } catch (generationError) {
        logger.error('Perler pattern generation failed:', generationError);
        if (generationTokenRef.current === currentToken) {
          setPattern(null);
          setError('拼豆图纸生成失败，请重试');
        }
      } finally {
        if (generationTokenRef.current === currentToken) {
          setIsGenerating(false);
        }
      }
    }, 180);

    return () => window.clearTimeout(timer);
  }, [canGenerate, columns, mode, similarityThreshold, sourceSticker]);

  const displayCounts = useMemo(() => {
    if (!pattern) {
      return [];
    }

    const keyword = legendSearch.trim().toLowerCase();
    return getPerlerDisplayColorCounts(pattern, colorSystem).filter((color) => {
      if (!keyword) {
        return true;
      }

      return (
        color.displayKey.toLowerCase().includes(keyword) ||
        color.color.toLowerCase().includes(keyword)
      );
    });
  }, [colorSystem, legendSearch, pattern]);

  const handleDownloadPng = async () => {
    if (!pattern) {
      return;
    }

    try {
      const exportCanvas = createExportCanvas(pattern, {
        cellSize: previewCellSize,
        colorSystem,
        showCellCodes,
      });
      await exportCanvasAsPng(exportCanvas, `remuse-perler-pattern-${Date.now()}.png`);
      setSaveStatus('图纸已下载');
    } catch (downloadError) {
      logger.error('Perler PNG export failed:', downloadError);
      setError('图纸导出失败，请重试');
    }
  };

  const handleDownloadCsv = () => {
    if (!pattern) {
      return;
    }

    try {
      exportCsvFile(
        buildPerlerPatternCsv(pattern, colorSystem),
        `remuse-perler-pattern-${Date.now()}.csv`,
      );
      setSaveStatus('色号 CSV 已下载');
    } catch (downloadError) {
      logger.error('Perler CSV export failed:', downloadError);
      setError('CSV 导出失败，请重试');
    }
  };

  const handleSaveToLibrary = async () => {
    if (!pattern || !sourceSticker || !onPatternSaved) {
      return;
    }

    try {
      const exportCanvas = createExportCanvas(pattern, {
        cellSize: previewCellSize,
        colorSystem,
        showCellCodes,
      });
      const stickerImageUrl = exportCanvas.toDataURL('image/png');
      const nextSticker: Sticker = {
        id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
        originalItemId: sourceSticker.originalItemId,
        stickerImageUrl,
        dramaText: buildPatternSummary(sourceSticker, pattern),
        category: PERLER_PATTERN_CATEGORY,
        dateCreated: new Date().toISOString(),
      };
      await onPatternSaved(nextSticker);
      setSaveStatus('已存入拼豆库');
    } catch (saveError) {
      logger.error('Perler library save failed:', saveError);
      setError('存入拼豆库失败，请重试');
    }
  };

  return (
    <div className="remuse-studio h-full bg-remuse-dark text-white flex flex-col">
      <div className="p-4 border-b border-neutral-800 bg-remuse-panel flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="text-neutral-500 hover:text-white">
            <X size={24} />
          </button>
          <div>
            <h2 className="text-xl font-bold font-display text-white flex items-center gap-2">
              <Box size={20} className="text-cyan-300" />
              拼豆图纸工坊
            </h2>
            <p className="text-xs text-neutral-500 mt-1">更接近 perler-beads-master 的图纸视图、色号与导出体验</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSaveToLibrary}
            disabled={!pattern || isGenerating || !onPatternSaved}
            className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-fuchsia-400 to-violet-400 text-white rounded-full text-sm font-display font-bold hover:scale-105 transition-transform shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            <CheckCircle2 size={15} />
            存入拼豆库
          </button>
          <button
            onClick={handleDownloadCsv}
            disabled={!pattern || isGenerating}
            className="flex items-center gap-2 px-5 py-2 bg-neutral-900 border border-neutral-700 text-white rounded-full text-sm font-display font-bold hover:border-cyan-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Grid size={15} />
            导出 CSV
          </button>
          <button
            onClick={handleDownloadPng}
            disabled={!pattern || isGenerating}
            className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-cyan-300 to-blue-400 text-black rounded-full text-sm font-display font-bold hover:scale-105 transition-transform shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            <Download size={15} />
            下载图纸
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto md:overflow-hidden flex flex-col md:flex-row pb-[calc(env(safe-area-inset-bottom)+5rem)] md:pb-0">
        <div className="flex-1 p-4 md:p-5 space-y-5 md:overflow-y-auto">
          {sourceSticker && (
            <div className="p-4 bg-neutral-900 border border-neutral-800 rounded-xl">
              <p className="text-xs text-neutral-500 font-display mb-3">当前拼豆源贴纸</p>
              <div className="flex items-center gap-4">
                <div
                  className="w-20 h-20 rounded-xl overflow-hidden bg-neutral-950 border border-neutral-800 flex items-center justify-center"
                  style={{
                    backgroundImage:
                      'linear-gradient(45deg, #1a1a1a 25%, transparent 25%), linear-gradient(-45deg, #1a1a1a 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1a1a1a 75%), linear-gradient(-45deg, transparent 75%, #1a1a1a 75%)',
                    backgroundSize: '10px 10px',
                    backgroundPosition: '0 0, 0 5px, 5px -5px, -5px 0px',
                  }}
                >
                  <img src={sourceSticker.stickerImageUrl} alt="" className="w-16 h-16 object-contain" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-display font-bold text-white mb-1">像素化源图</p>
                  <p className="text-xs text-neutral-500 leading-relaxed line-clamp-2">
                    {sourceSticker.dramaText || '未命名贴纸'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {!canGenerate && (
            <div className="flex flex-col items-center justify-center py-16 border-2 border-dashed border-neutral-800 rounded-xl gap-4">
              <div className="w-14 h-14 rounded-2xl bg-cyan-400/10 border border-cyan-400/20 flex items-center justify-center">
                <Box size={24} className="text-cyan-300" />
              </div>
              <p className="text-neutral-300 font-display text-sm">拼豆图纸暂时只支持单张贴纸</p>
              <p className="text-xs text-neutral-600 text-center max-w-sm">
                当前已选 {sourceStickers.length} 张。返回上一页后单选 1 张贴纸，再进入此模块会更清晰。
              </p>
            </div>
          )}

          {canGenerate && isGenerating && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="relative">
                <div className="w-16 h-16 rounded-full border-4 border-cyan-400/20 border-t-cyan-300 animate-spin" />
                <Grid size={22} className="absolute inset-0 m-auto text-cyan-300" />
              </div>
              <p className="text-sm text-neutral-400 text-center max-w-xs">正在按拼豆色板重新计算网格，请稍等片刻</p>
            </div>
          )}

          {canGenerate && !isGenerating && !pattern && (
            <div className="flex flex-col items-center justify-center py-16 border-2 border-dashed border-neutral-800 rounded-xl gap-4">
              <div className="w-14 h-14 rounded-2xl bg-cyan-400/10 border border-cyan-400/20 flex items-center justify-center">
                <Grid size={24} className="text-cyan-300" />
              </div>
              <p className="text-neutral-300 font-display text-sm">调整参数后自动生成拼豆图纸</p>
              <p className="text-xs text-neutral-600 text-center max-w-sm">
                图纸会输出网格、每格色号、图纸统计，并支持 CSV 导出。
              </p>
            </div>
          )}

          {pattern && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <div className="px-3 py-1.5 rounded-full bg-cyan-400/10 border border-cyan-400/20 text-xs text-cyan-200 font-mono">
                  {pattern.columns} x {pattern.rows}
                </div>
                <div className="px-3 py-1.5 rounded-full bg-neutral-900 border border-neutral-800 text-xs text-neutral-300 font-mono">
                  {pattern.totalBeads} beads
                </div>
                <div className="px-3 py-1.5 rounded-full bg-neutral-900 border border-neutral-800 text-xs text-neutral-300 font-mono">
                  {pattern.colorCounts.length} colors
                </div>
                <div className="px-3 py-1.5 rounded-full bg-neutral-900 border border-neutral-800 text-xs text-neutral-300 font-mono">
                  {mode === 'dominant' ? '主色优先' : '平均取色'}
                </div>
                <div className="px-3 py-1.5 rounded-full bg-neutral-900 border border-neutral-800 text-xs text-neutral-300 font-mono">
                  {colorSystem}
                </div>
              </div>

              <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden shadow-2xl">
                <div className="p-3 border-b border-neutral-800 flex items-center justify-between">
                  <span className="text-xs font-display text-neutral-400">拼豆图纸预览</span>
                  <div className="flex items-center gap-3 text-xs text-neutral-500">
                    {highlightColor && <span>highlighted</span>}
                    <span>threshold {similarityThreshold}</span>
                  </div>
                </div>
                <div className="p-4 overflow-auto" style={{ background: 'linear-gradient(135deg, #101010 0%, #1a1a1a 100%)' }}>
                  <PerlerPatternCanvas
                    pattern={pattern}
                    canvasRef={canvasRef}
                    title="RE-MUSE 拼豆图纸"
                    summary={`${pattern.columns} x ${pattern.rows} · ${pattern.totalBeads} beads · ${pattern.colorCounts.length} colors`}
                    cellSize={previewCellSize}
                    highlightColor={highlightColor}
                    displayColorSystem={colorSystem}
                    showCellCodes={showCellCodes}
                    className="block mx-auto max-w-full h-auto rounded-xl bg-white shadow-xl"
                  />
                </div>
              </div>
            </div>
          )}

          {error && <p className="text-sm text-red-400">{error}</p>}
          {saveStatus && <p className="text-sm text-emerald-400">{saveStatus}</p>}
        </div>

        <div className="w-full md:w-80 flex-shrink-0 bg-remuse-panel border-t md:border-t-0 md:border-l border-neutral-800 p-4 md:p-5 space-y-5 md:overflow-y-auto">
          <div className="bg-neutral-900 rounded-xl border border-neutral-800 p-4">
            <p className="text-xs font-display text-neutral-400 uppercase tracking-wider mb-3">使用说明</p>
            <div className="space-y-2 text-xs text-neutral-500 leading-relaxed">
              <p>1. 单选 1 张贴纸进入模块。</p>
              <p>2. 调整颗粒度、相似色和色号体系。</p>
              <p>3. 点击右侧色号可高亮该颜色的位置。</p>
              <p>4. 生成后可以下载 PNG、CSV，或直接存入拼豆库。</p>
            </div>
          </div>

          <div>
            <label className="text-xs font-display text-neutral-400 uppercase tracking-wider mb-3 block">图纸颗粒度</label>
            <div className="grid grid-cols-4 gap-2 mb-3">
              {[32, 48, 64, 80].map((value) => (
                <button
                  key={value}
                  onClick={() => setColumns(value)}
                  disabled={isGenerating}
                  className={`py-2 rounded-lg border text-xs font-display font-bold transition-all ${
                    columns === value
                      ? 'bg-cyan-300 text-black border-cyan-300'
                      : 'bg-neutral-900 text-neutral-400 border-neutral-700 hover:border-neutral-500'
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={24}
                max={96}
                step={2}
                value={columns}
                onChange={(event) => setColumns(parseInt(event.target.value, 10))}
                disabled={isGenerating}
                className="flex-1 accent-cyan-300"
              />
              <span className="text-sm font-mono text-cyan-200 w-8 text-center">{columns}</span>
            </div>
            <p className="text-[10px] text-neutral-600 mt-1.5">值越高，图纸越细，格子越多。</p>
          </div>

          <div>
            <label className="text-xs font-display text-neutral-400 uppercase tracking-wider mb-3 block">相似色合并</label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={60}
                step={2}
                value={similarityThreshold}
                onChange={(event) => setSimilarityThreshold(parseInt(event.target.value, 10))}
                disabled={isGenerating}
                className="flex-1 accent-cyan-300"
              />
              <span className="text-sm font-mono text-cyan-200 w-8 text-center">{similarityThreshold}</span>
            </div>
            <p className="text-[10px] text-neutral-600 mt-1.5">值越高，接近的颜色越容易被合并，图纸会更简化。</p>
          </div>

          <div>
            <label className="text-xs font-display text-neutral-400 uppercase tracking-wider mb-3 block">取色模式</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setMode('dominant')}
                disabled={isGenerating}
                className={`py-2 rounded-lg border text-xs font-display font-bold transition-all ${
                  mode === 'dominant'
                    ? 'bg-cyan-300 text-black border-cyan-300'
                    : 'bg-neutral-900 text-neutral-400 border-neutral-700 hover:border-neutral-500'
                }`}
              >
                主色优先
              </button>
              <button
                onClick={() => setMode('average')}
                disabled={isGenerating}
                className={`py-2 rounded-lg border text-xs font-display font-bold transition-all ${
                  mode === 'average'
                    ? 'bg-cyan-300 text-black border-cyan-300'
                    : 'bg-neutral-900 text-neutral-400 border-neutral-700 hover:border-neutral-500'
                }`}
              >
                平均取色
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs font-display text-neutral-400 uppercase tracking-wider mb-3 block">色号体系</label>
            <div className="grid grid-cols-2 gap-2">
              {perlerColorSystemOptions.map((option) => (
                <button
                  key={option.key}
                  onClick={() => setColorSystem(option.key)}
                  className={`py-2 rounded-lg border text-xs font-display font-bold transition-all ${
                    colorSystem === option.key
                      ? 'bg-cyan-300 text-black border-cyan-300'
                      : 'bg-neutral-900 text-neutral-400 border-neutral-700 hover:border-neutral-500'
                  }`}
                >
                  {option.name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-display text-neutral-400 uppercase tracking-wider mb-3 block">预览缩放</label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={16}
                max={36}
                step={1}
                value={previewCellSize}
                onChange={(event) => setPreviewCellSize(parseInt(event.target.value, 10))}
                className="flex-1 accent-cyan-300"
              />
              <span className="text-sm font-mono text-cyan-200 w-8 text-center">{previewCellSize}</span>
            </div>
          </div>

          <button
            onClick={() => setShowCellCodes((current) => !current)}
            className={`w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-display font-bold transition-all ${
              showCellCodes
                ? 'bg-cyan-300 text-black'
                : 'bg-neutral-900 border border-neutral-700 text-neutral-300'
            }`}
          >
            <Grid size={16} />
            {showCellCodes ? '隐藏格内色号' : '显示格内色号'}
          </button>

          <div className="bg-neutral-900 rounded-xl border border-neutral-800 p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-display text-neutral-400 uppercase tracking-wider">色号统计</p>
              <span className="text-xs font-mono text-neutral-500">{pattern?.totalBeads ?? 0}</span>
            </div>

            <div className="relative mb-3">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
              <input
                value={legendSearch}
                onChange={(event) => setLegendSearch(event.target.value)}
                placeholder="搜索色号 / HEX"
                className="w-full bg-black/30 border border-neutral-700 rounded-lg py-2 pl-9 pr-3 text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-cyan-300"
              />
            </div>

            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {displayCounts.map((color) => {
                const isHighlighted = highlightColor?.toUpperCase() === color.color.toUpperCase();
                return (
                  <button
                    key={`${color.displayKey}-${color.color}`}
                    onClick={() =>
                      setHighlightColor((current) =>
                        current?.toUpperCase() === color.color.toUpperCase() ? null : color.color,
                      )
                    }
                    className={`w-full flex items-center gap-3 text-xs rounded-lg border px-3 py-2 transition-all ${
                      isHighlighted
                        ? 'border-cyan-300 bg-cyan-300/10'
                        : 'border-neutral-800 bg-black/10 hover:border-neutral-700'
                    }`}
                  >
                    <span
                      className="w-4 h-4 rounded-sm border border-white/10 flex-shrink-0"
                      style={{ backgroundColor: color.color }}
                    />
                    <span className="font-mono text-neutral-100 w-12 text-left">{color.displayKey}</span>
                    <span className="text-neutral-500 truncate text-left">{color.color}</span>
                    <span className="ml-auto font-mono text-cyan-200">{color.count}</span>
                  </button>
                );
              })}

              {!displayCounts.length && (
                <p className="text-xs text-neutral-600 text-center py-4">没有匹配到对应色号</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PerlerPatternStudio;
