import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  History,
  Loader2,
  MessageCircle,
  Plus,
  Search,
  Send,
  Sparkles,
  Trash2,
  PencilLine,
  Check,
  X,
} from 'lucide-react';
import { CollectedItem, MemoryConversationSession, MemoryThreadSummary, User } from '../types';
import {
  createMemoryThread,
  deleteMemoryThread,
  getMemoryThread,
  listMemoryThreads,
  queryMemoryThread,
  renameMemoryThread,
} from '../services/memoryService';
import ConfirmDialog from './ConfirmDialog';

interface MemoryRagStudioProps {
  items: CollectedItem[];
  user?: User | null;
  onBack?: () => void;
}

const MemoryRagStudio: React.FC<MemoryRagStudioProps> = ({ items, user, onBack }) => {
  const [threads, setThreads] = useState<MemoryThreadSummary[]>([]);
  const [activeThread, setActiveThread] = useState<MemoryConversationSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [renamingThreadId, setRenamingThreadId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [pendingDeleteThreadId, setPendingDeleteThreadId] = useState<string | null>(null);
  const [isDeletingThread, setIsDeletingThread] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const storyItemCount = useMemo(() => items.filter((item) => item.story?.trim()).length, [items]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const loadedThreads = await listMemoryThreads();
        if (cancelled) {
          return;
        }

        if (loadedThreads.length === 0) {
          const created = await createMemoryThread();
          if (cancelled) {
            return;
          }
          setThreads([{ id: created.id, title: created.title, createdAt: created.createdAt, updatedAt: created.updatedAt, lastMessage: created.messages[created.messages.length - 1]?.content || '', sourceCount: created.sourceCount, usedFallback: created.usedFallback }]);
          setActiveThread(created);
          return;
        }

        setThreads(loadedThreads);
        const firstThread = await getMemoryThread(loadedThreads[0].id);
        if (!cancelled) {
          setActiveThread(firstThread);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : '加载记忆线程失败。');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [activeThread, isSubmitting]);

  async function refreshThread(threadId: string) {
    const [nextThreads, nextThread] = await Promise.all([
      listMemoryThreads(),
      getMemoryThread(threadId),
    ]);
    setThreads(nextThreads);
    setActiveThread(nextThread);
  }

  function requestDeleteThread(threadId: string) {
    setPendingDeleteThreadId(threadId);
  }

  async function confirmDeleteThread() {
    if (!pendingDeleteThreadId) {
      return;
    }

    setError(null);
    setIsDeletingThread(true);
    try {
      const result = await deleteMemoryThread(pendingDeleteThreadId);
      setThreads(result.threads);
      setActiveThread(result.activeThread);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : '删除记忆会话失败。');
    } finally {
      setIsDeletingThread(false);
      setPendingDeleteThreadId(null);
    }
  }

  async function handleCreateThread() {
    setError(null);
    const thread = await createMemoryThread();
    setThreads((prev) => [
      {
        id: thread.id,
        title: thread.title,
        createdAt: thread.createdAt,
        updatedAt: thread.updatedAt,
        lastMessage: thread.messages[thread.messages.length - 1]?.content || '',
        sourceCount: thread.sourceCount,
        usedFallback: thread.usedFallback,
      },
      ...prev,
    ]);
    setActiveThread(thread);
    setQuery('');
  }

  async function handleSelectThread(threadId: string) {
    setError(null);
    try {
      const thread = await getMemoryThread(threadId);
      setActiveThread(thread);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '加载会话失败。');
    }
  }

  async function handleRenameThread() {
    if (!renamingThreadId || !renameDraft.trim()) {
      return;
    }

    try {
      const updatedThread = await renameMemoryThread(renamingThreadId, renameDraft.trim());
      setRenamingThreadId(null);
      setRenameDraft('');
      setThreads((prev) => prev.map((thread) => (
        thread.id === updatedThread.id ? { ...thread, title: updatedThread.title, updatedAt: updatedThread.updatedAt } : thread
      )));
      if (activeThread?.id === updatedThread.id) {
        setActiveThread(updatedThread);
      }
    } catch (renameError) {
      setError(renameError instanceof Error ? renameError.message : '重命名失败。');
    }
  }

  async function handleAsk() {
    if (!activeThread || query.trim().length < 2 || isSubmitting) {
      return;
    }

    setError(null);
    setIsSubmitting(true);
    const prompt = query.trim();
    setQuery('');

    try {
      const updatedThread = await queryMemoryThread(activeThread.id, prompt);
      setActiveThread(updatedThread);
      setThreads(await listMemoryThreads());
    } catch (queryError) {
      setError(queryError instanceof Error ? queryError.message : '记忆查询失败。');
      setQuery(prompt);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-remuse-dark">
        <div className="inline-flex items-center gap-3 rounded-full border border-remuse-border bg-remuse-panel px-4 py-3 text-sm text-neutral-300">
          <Loader2 size={16} className="animate-spin text-remuse-accent" />
          正在同步记忆线程...
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-remuse-dark xl:overflow-hidden">
      <ConfirmDialog
        open={!!pendingDeleteThreadId}
        title="删除记忆会话"
        message="确认删除这个记忆会话吗？删除后无法恢复。"
        confirmLabel="删除"
        cancelLabel="取消"
        busy={isDeletingThread}
        onConfirm={() => void confirmDeleteThread()}
        onCancel={() => {
          if (!isDeletingThread) {
            setPendingDeleteThreadId(null);
          }
        }}
      />
      <div className="mx-auto flex min-h-full w-full max-w-[1800px] flex-col gap-6 p-4 md:p-6 xl:h-full xl:overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-remuse-border pb-4">
          <div className="min-w-0">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-remuse-accent/30 bg-remuse-accent/10 px-3 py-1 text-[11px] font-mono uppercase tracking-[0.24em] text-remuse-accent">
              <Sparkles size={14} />
              Memory RAG Studio
            </div>
            <h2 className="text-2xl font-display font-bold text-white md:text-3xl">记忆工作室</h2>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-neutral-400">
              记忆对话现在按服务端线程保存，支持跨设备同步、重命名和删除。当前可检索的故事藏品数量为 {storyItemCount} 件。
            </p>
          </div>

          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border border-neutral-700 bg-black/20 px-4 py-2 text-sm text-neutral-300 transition-colors hover:border-remuse-secondary hover:text-white"
              >
                <ArrowLeft size={16} />
                返回
              </button>
            )}
            <button
              type="button"
              onClick={handleCreateThread}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-remuse-accent px-4 py-2 text-sm font-display font-bold text-black transition-colors hover:bg-white"
              data-testid="memory-create-thread"
            >
              <Plus size={16} />
              新建会话
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-6 xl:min-h-0 xl:flex-1 xl:grid xl:grid-cols-[minmax(280px,300px)_minmax(0,1fr)_minmax(320px,390px)] xl:gap-6 xl:overflow-hidden">
          <aside className="flex max-h-[420px] flex-col overflow-hidden rounded-[28px] border border-remuse-border bg-remuse-panel xl:min-h-0 xl:max-h-none">
            <div className="border-b border-remuse-border px-5 py-4">
              <p className="text-[11px] font-mono uppercase tracking-[0.28em] text-neutral-500">Conversation Archive</p>
              <div className="mt-3 flex items-center justify-between">
                <div>
                  <p className="text-3xl font-display font-bold text-remuse-secondary">{threads.length}</p>
                  <p className="text-xs text-neutral-500">服务端同步会话</p>
                </div>
                <div className="rounded-2xl border border-remuse-secondary/20 bg-black/20 px-3 py-2">
                  <p className="text-[11px] font-mono uppercase tracking-[0.24em] text-neutral-500">Story Sources</p>
                  <p className="text-lg font-display font-bold text-white">{storyItemCount}</p>
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <div className="space-y-3">
                {threads.map((thread) => {
                  const active = thread.id === activeThread?.id;
                  const isRenaming = renamingThreadId === thread.id;
                  return (
                    <div
                      key={thread.id}
                      className={`rounded-2xl border p-4 transition-colors ${
                        active
                          ? 'border-remuse-accent/40 bg-remuse-accent/10'
                          : 'border-neutral-800 bg-black/20 hover:border-remuse-secondary/40 hover:bg-black/35'
                      }`}
                    >
                      {isRenaming ? (
                        <div className="space-y-3">
                          <input
                            value={renameDraft}
                            onChange={(event) => setRenameDraft(event.target.value)}
                            className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none focus:border-remuse-accent/40"
                          />
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={handleRenameThread}
                              className="inline-flex items-center gap-2 rounded-full bg-remuse-accent px-3 py-2 text-xs font-semibold text-black"
                            >
                              <Check size={14} />
                              保存
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setRenamingThreadId(null);
                                setRenameDraft('');
                              }}
                              className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-xs text-neutral-300"
                            >
                              <X size={14} />
                              取消
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => void handleSelectThread(thread.id)}
                            className="w-full text-left"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className={`truncate text-sm font-display font-bold ${active ? 'text-white' : 'text-neutral-200'}`}>
                                  {thread.title}
                                </p>
                                <p className="mt-2 line-clamp-2 text-xs leading-6 text-neutral-500">{thread.lastMessage || '暂无消息'}</p>
                              </div>
                              <div className="flex shrink-0 items-center gap-2">
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setRenamingThreadId(thread.id);
                                    setRenameDraft(thread.title);
                                  }}
                                  className="rounded-full border border-transparent p-2 text-neutral-500 transition-colors hover:border-white/10 hover:text-white"
                                >
                                  <PencilLine size={14} />
                                </button>
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    requestDeleteThread(thread.id);
                                  }}
                                  className="rounded-full border border-transparent p-2 text-neutral-500 transition-colors hover:border-red-500/30 hover:text-red-300"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>
                            <div className="mt-3 flex items-center justify-between text-[11px] font-mono text-neutral-500">
                              <span>{new Date(thread.updatedAt).toLocaleDateString('zh-CN')}</span>
                              <span>{thread.sourceCount} sources</span>
                            </div>
                          </button>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </aside>

          <section className="flex min-h-[560px] flex-col overflow-hidden rounded-[28px] border border-remuse-border bg-remuse-panel xl:min-h-0 xl:h-full">
            <div className="border-b border-remuse-border px-5 py-4 md:px-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[11px] font-mono uppercase tracking-[0.28em] text-remuse-accent">Active Conversation</p>
                  <h3 className="mt-2 truncate text-2xl font-display font-bold text-white">
                    {activeThread?.title || '记忆工作室'}
                  </h3>
                </div>
                <div className="rounded-full border border-remuse-border bg-black/20 px-3 py-1.5 text-[11px] font-mono text-neutral-400">
                  {activeThread?.usedFallback ? 'fallback answer' : 'grounded answer'}
                </div>
              </div>
            </div>

            <div className="flex h-full min-h-0 flex-col p-5 md:p-6">
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                {activeThread?.messages.map((message) => (
                  <div key={message.id} className={`flex ${message.role === 'assistant' ? 'justify-start' : 'justify-end'}`}>
                    <div
                      data-testid={`memory-message-${message.role}`}
                      className={`max-w-[92%] rounded-2xl px-4 py-3 text-sm leading-7 sm:max-w-[86%] ${
                        message.role === 'assistant'
                          ? 'border border-remuse-border bg-black/25 text-neutral-200'
                          : 'bg-remuse-accent text-black'
                      }`}
                    >
                      {message.content}
                    </div>
                  </div>
                ))}

                {isSubmitting && (
                  <div className="flex justify-start">
                    <div className="inline-flex items-center gap-2 rounded-2xl border border-remuse-border bg-black/25 px-4 py-3 text-sm text-neutral-300">
                      <Loader2 size={16} className="animate-spin text-remuse-accent" />
                      正在整理你的记忆线索...
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className="mt-5 rounded-[24px] border border-neutral-800 bg-black/30 p-4">
                <label className="block text-xs font-mono uppercase tracking-[0.24em] text-neutral-500">
                  输入你想重新整理的记忆问题
                </label>
                <textarea
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      void handleAsk();
                    }
                  }}
                  rows={3}
                  className="mt-3 w-full resize-none rounded-2xl border border-neutral-800 bg-black/40 px-4 py-4 text-sm leading-7 text-white outline-none transition-colors focus:border-remuse-accent"
                  placeholder="比如：这个旧物最像我哪段被忽略的记忆？"
                  data-testid="memory-query-input"
                />

                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2 text-xs text-neutral-500">
                    <span className="rounded-full border border-neutral-800 bg-black/20 px-3 py-1.5">跨设备同步</span>
                    <span className="rounded-full border border-neutral-800 bg-black/20 px-3 py-1.5">线程持久化</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => void handleAsk()}
                    disabled={isSubmitting || query.trim().length < 2 || !activeThread}
                    className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-remuse-accent px-4 py-2 text-sm font-display font-bold text-black transition-colors hover:bg-white disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
                    data-testid="memory-send-query"
                  >
                    {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                    发送问题
                  </button>
                </div>

                {error && <p className="mt-3 text-xs text-red-300">{error}</p>}
              </div>
            </div>
          </section>

          <aside className="flex max-h-[560px] flex-col overflow-hidden rounded-[28px] border border-remuse-border bg-remuse-panel xl:min-h-0 xl:max-h-none">
            <div className="border-b border-remuse-border px-5 py-4 md:px-6">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-mono uppercase tracking-[0.28em] text-neutral-500">Retrieved Memories</p>
                  <h3 className="mt-2 text-xl font-display font-bold text-white">
                    {activeThread?.matches.length ? '本次检索结果' : '最近可检索的故事'}
                  </h3>
                  <p className="mt-2 text-xs leading-6 text-neutral-500">
                    {activeThread?.retrievalSummary || '暂无检索结果。'}
                  </p>
                </div>
                <div className="rounded-full border border-remuse-border bg-black/20 px-3 py-1.5 text-[11px] font-mono text-neutral-400">
                  {activeThread?.matches.length ? `${activeThread.matches.length} matches` : '0 matches'}
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-5 md:p-6">
              <div className="mb-4 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-remuse-secondary/20 bg-black/20 p-4">
                  <span className="text-[11px] font-mono uppercase tracking-[0.24em] text-neutral-500">Story Archive</span>
                  <p className="mt-2 text-2xl font-display font-bold text-remuse-secondary">{storyItemCount}</p>
                </div>
                <div className="rounded-2xl border border-neutral-800 bg-black/20 p-4">
                  <span className="text-[11px] font-mono uppercase tracking-[0.24em] text-neutral-500">Source Count</span>
                  <p className="mt-2 text-2xl font-display font-bold text-white">{activeThread?.sourceCount || 0}</p>
                </div>
              </div>

              <div className="space-y-3">
                {activeThread?.matches.map((match) => (
                  <div key={`${match.itemId}-${match.score}`} className="overflow-hidden rounded-2xl border border-remuse-border bg-black/20">
                    <div className="flex min-w-0 gap-3 p-3">
                      <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-xl border border-white/10 bg-neutral-900">
                        <img src={match.imageUrl} alt={match.itemName} className="h-full w-full object-cover" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="truncate font-display text-base font-bold text-white">{match.itemName}</h4>
                          <span className="rounded-full border border-remuse-accent/20 bg-remuse-accent/10 px-2 py-0.5 text-[10px] font-mono text-remuse-accent">
                            {match.hallName}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] font-mono uppercase tracking-[0.18em] text-neutral-500">
                          {match.material} · {new Date(match.dateCollected).toLocaleDateString('zh-CN')}
                        </p>
                        <p className="mt-2 line-clamp-3 text-sm leading-6 text-neutral-300">{match.storySnippet}</p>
                      </div>
                    </div>
                  </div>
                ))}

                {!activeThread?.matches.length && (
                  <div className="rounded-2xl border border-dashed border-neutral-800 bg-black/20 px-4 py-8 text-center text-sm leading-7 text-neutral-500">
                    输入一个更具体的问题后，系统会在你的故事馆藏中进行检索并展示对应的结果。
                  </div>
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default MemoryRagStudio;
