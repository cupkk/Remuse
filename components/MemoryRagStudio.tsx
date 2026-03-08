import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CollectedItem, MemoryAssistantMatch, MemoryAssistantMessage, MemoryConversationSession, User } from '../types';
import { askMemoryAssistant } from '../services/memoryService';
import { isSpeechRecognitionSupported, SpeechCaptureSession, startSpeechCapture } from '../services/speechRecognition';
import { ArrowLeft, History, Loader2, MessageCircle, Mic, Plus, Search, Send, Sparkles, Square, Trash2 } from 'lucide-react';

interface MemoryRagStudioProps {
  items: CollectedItem[];
  user?: User | null;
  onBack?: () => void;
}

const DEFAULT_MEMORY_PROMPTS = [
  '帮我找和学生时代有关的藏品',
  '有没有哪件物品让我想到家人',
  '我收藏过哪些最有纪念意义的东西',
];

const INITIAL_RETRIEVAL_SUMMARY = '先发起一次检索，我会从你录入过故事的藏品里帮你召回相关记忆。';
const GREETING = '我是你的记忆馆长。你可以和我聊旧物、人物、时间、地点或情绪，我会基于你自己的藏品故事帮你回忆过去。';

function createMessage(role: MemoryAssistantMessage['role'], content: string): MemoryAssistantMessage {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    role,
    content,
  };
}

function createSession(seedTitle = '新的回忆对话'): MemoryConversationSession {
  const now = new Date().toISOString();
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    title: seedTitle,
    createdAt: now,
    updatedAt: now,
    messages: [createMessage('assistant', GREETING)],
    matches: [],
    suggestions: DEFAULT_MEMORY_PROMPTS,
    retrievalSummary: INITIAL_RETRIEVAL_SUMMARY,
    sourceCount: 0,
    usedFallback: false,
  };
}

function sortSessions(sessions: MemoryConversationSession[]) {
  return [...sessions].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

function summarizeSession(session: MemoryConversationSession) {
  const lastUserMessage = [...session.messages].reverse().find((message) => message.role === 'user');
  return lastUserMessage?.content || session.messages[session.messages.length - 1]?.content || '还没有开始对话';
}

function getStorageKey(user?: User | null) {
  return `remuse:memory-rag:${user?.id || 'guest'}`;
}

const MemoryRagStudio: React.FC<MemoryRagStudioProps> = ({ items, user, onBack }) => {
  const storyItems = useMemo(
    () => items.filter((item) => item.story?.trim()),
    [items],
  );

  const recentMemoryItems = useMemo<MemoryAssistantMatch[]>(
    () =>
      storyItems.slice(0, 6).map((item, index) => ({
        itemId: item.id,
        itemName: item.name,
        imageUrl: item.imageUrl,
        hallName: item.category || item.hallId,
        material: item.material || '未记录',
        dateCollected: item.dateCollected,
        storySnippet: item.story?.trim() || '',
        tags: item.tags || [],
        score: 100 - index,
      })),
    [storyItems],
  );

  const storageKey = useMemo(() => getStorageKey(user), [user]);
  const [sessions, setSessions] = useState<MemoryConversationSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState('');
  const [query, setQuery] = useState('');
  const [mobilePanel, setMobilePanel] = useState<'chat' | 'history' | 'memories'>('chat');
  const [isAsking, setIsAsking] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechCaptureSession | null>(null);
  const draftBaseRef = useRef('');
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) {
        const initialSession = createSession();
        setSessions([initialSession]);
        setActiveSessionId(initialSession.id);
        return;
      }

      const parsed = JSON.parse(raw) as MemoryConversationSession[];
      const normalized = Array.isArray(parsed) && parsed.length > 0 ? sortSessions(parsed) : [createSession()];
      setSessions(normalized);
      setActiveSessionId(normalized[0].id);
    } catch {
      const initialSession = createSession();
      setSessions([initialSession]);
      setActiveSessionId(initialSession.id);
    }
  }, [storageKey]);

  useEffect(() => {
    if (!sessions.length) {
      return;
    }
    localStorage.setItem(storageKey, JSON.stringify(sessions));
  }, [sessions, storageKey]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [activeSessionId, sessions, isAsking]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
    };
  }, []);

  const activeSession =
    sessions.find((session) => session.id === activeSessionId) ||
    sessions[0] ||
    null;

  function updateSession(sessionId: string, updater: (session: MemoryConversationSession) => MemoryConversationSession) {
    setSessions((prev) =>
      sortSessions(
        prev.map((session) => (session.id === sessionId ? updater(session) : session)),
      ),
    );
  }

  function handleCreateConversation() {
    const next = createSession();
    setSessions((prev) => sortSessions([next, ...prev]));
    setActiveSessionId(next.id);
    setQuery('');
    setError(null);
    setMobilePanel('chat');
  }

  function handleDeleteConversation(sessionId: string) {
    if (!window.confirm('确认删除这段记忆对话吗？已保存的聊天记录会从当前浏览器移除。')) {
      return;
    }

    setSessions((prev) => {
      const remaining = prev.filter((session) => session.id !== sessionId);
      if (remaining.length > 0) {
        const nextSessions = sortSessions(remaining);
        const nextActive = nextSessions[0];
        setActiveSessionId(nextActive.id);
        return nextSessions;
      }

      const fresh = createSession();
      setActiveSessionId(fresh.id);
      return [fresh];
    });
  }

  async function handleAsk(seedQuery?: string) {
    if (!activeSession) {
      return;
    }

    const prompt = (seedQuery ?? query).trim();
    if (prompt.length < 2 || isAsking || storyItems.length === 0) {
      return;
    }

    const userMessage = createMessage('user', prompt);
    const nextHistory = [...activeSession.messages, userMessage];
    const now = new Date().toISOString();
    const nextTitle =
      activeSession.messages.length <= 1 && activeSession.title === '新的回忆对话'
        ? prompt.slice(0, 18)
        : activeSession.title;

    setError(null);
    setQuery('');
    updateSession(activeSession.id, (session) => ({
      ...session,
      title: nextTitle,
      messages: nextHistory,
      updatedAt: now,
    }));
    setIsAsking(true);

    try {
      const response = await askMemoryAssistant(prompt, nextHistory);
      const assistantMessage = createMessage('assistant', response.answer);
      updateSession(activeSession.id, (session) => ({
        ...session,
        title: nextTitle,
        messages: [...session.messages, assistantMessage],
        matches: response.matches,
        suggestions: response.suggestions.length > 0 ? response.suggestions : session.suggestions,
        retrievalSummary: response.retrievalSummary,
        sourceCount: response.sourceCount,
        usedFallback: response.usedFallback,
        updatedAt: new Date().toISOString(),
      }));
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : '记忆检索失败，请稍后再试。';
      setError(message);
      updateSession(activeSession.id, (session) => ({
        ...session,
        messages: [
          ...session.messages,
          createMessage('assistant', '这次我没能顺利调出你的记忆档案。你可以换个更具体的问法，或者稍后再试一次。'),
        ],
        retrievalSummary: '这次没有成功完成检索，请稍后重试或把问题问得更具体一些。',
        updatedAt: new Date().toISOString(),
      }));
    } finally {
      setIsAsking(false);
    }
  }

  function toggleVoiceInput() {
    if (isRecording) {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      setIsRecording(false);
      return;
    }

    if (!isSpeechRecognitionSupported()) {
      setError('当前浏览器不支持语音输入，建议使用 Chrome 或 Edge。');
      return;
    }

    draftBaseRef.current = query.trim() ? `${query.trim()} ` : '';
    setError(null);
    setIsRecording(true);

    try {
      recognitionRef.current = startSpeechCapture({
        onTranscript: (transcript) => {
          setQuery(`${draftBaseRef.current}${transcript}`.trim());
        },
        onError: (message) => {
          setError(message);
          setIsRecording(false);
          recognitionRef.current = null;
        },
        onEnd: () => {
          setIsRecording(false);
          recognitionRef.current = null;
        },
      });
    } catch (voiceError) {
      setError(voiceError instanceof Error ? voiceError.message : '语音输入启动失败');
      setIsRecording(false);
      recognitionRef.current = null;
    }
  }

  const visibleMatches = activeSession?.matches.length ? activeSession.matches : recentMemoryItems;
  const suggestionItems = activeSession?.suggestions.length ? activeSession.suggestions : DEFAULT_MEMORY_PROMPTS;

  return (
    <div className="h-full overflow-hidden bg-remuse-dark">
      <div className="mx-auto flex h-full w-full max-w-[1800px] flex-col gap-6 overflow-hidden p-4 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-remuse-border pb-4">
          <div className="min-w-0">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-remuse-accent/30 bg-remuse-accent/10 px-3 py-1 text-[11px] font-mono uppercase tracking-[0.24em] text-remuse-accent">
              <Sparkles size={14} />
              Memory Rag Studio
            </div>
            <h2 className="text-2xl font-display font-bold text-white md:text-3xl">和你的旧物慢慢聊过去</h2>
            <p className="mt-2 hidden max-w-3xl text-sm leading-7 text-neutral-400 md:block">
              这里是独立的记忆对话界面。你可以新建回忆会话、保留历史聊天，并让 AI 基于你自己录入的旧物故事继续陪你回想过去。
            </p>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-400 md:hidden">
              手机端只保留一个主面板，把历史会话和召回结果改成切换查看，避免信息过挤。
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
                返回馆长办公室
              </button>
            )}
            <button
              type="button"
              onClick={handleCreateConversation}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-remuse-accent px-4 py-2 text-sm font-display font-bold text-black transition-colors hover:bg-white"
            >
              <Plus size={16} />
              新增对话
            </button>
          </div>
        </div>

        <div className="grid gap-3 xl:hidden">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-2xl border border-remuse-secondary/20 bg-remuse-panel px-3 py-3">
              <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-neutral-500">会话</p>
              <p className="mt-2 text-xl font-display font-bold text-remuse-secondary">{sessions.length}</p>
            </div>
            <div className="rounded-2xl border border-remuse-accent/20 bg-remuse-panel px-3 py-3">
              <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-neutral-500">故事源</p>
              <p className="mt-2 text-xl font-display font-bold text-remuse-accent">{storyItems.length}</p>
            </div>
            <div className="rounded-2xl border border-neutral-800 bg-remuse-panel px-3 py-3">
              <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-neutral-500">召回</p>
              <p className="mt-2 text-xl font-display font-bold text-white">{visibleMatches.length}</p>
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => setMobilePanel('chat')}
              className={`inline-flex min-h-[42px] shrink-0 items-center justify-center gap-2 rounded-full border px-4 py-2 text-sm transition-colors ${
                mobilePanel === 'chat'
                  ? 'border-remuse-accent bg-remuse-accent text-black'
                  : 'border-neutral-800 bg-remuse-panel text-neutral-300'
              }`}
            >
              <MessageCircle size={15} />
              当前对话
            </button>
            <button
              type="button"
              onClick={() => setMobilePanel('history')}
              className={`inline-flex min-h-[42px] shrink-0 items-center justify-center gap-2 rounded-full border px-4 py-2 text-sm transition-colors ${
                mobilePanel === 'history'
                  ? 'border-remuse-accent bg-remuse-accent text-black'
                  : 'border-neutral-800 bg-remuse-panel text-neutral-300'
              }`}
            >
              <History size={15} />
              历史会话
            </button>
            <button
              type="button"
              onClick={() => setMobilePanel('memories')}
              className={`inline-flex min-h-[42px] shrink-0 items-center justify-center gap-2 rounded-full border px-4 py-2 text-sm transition-colors ${
                mobilePanel === 'memories'
                  ? 'border-remuse-accent bg-remuse-accent text-black'
                  : 'border-neutral-800 bg-remuse-panel text-neutral-300'
              }`}
            >
              <Search size={15} />
              召回结果
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 xl:grid xl:grid-cols-[280px_minmax(0,1fr)_380px] xl:gap-6">
          <aside className={`${mobilePanel === 'history' ? 'flex' : 'hidden'} min-h-0 flex-col overflow-hidden rounded-[28px] border border-remuse-border bg-remuse-panel xl:flex`}>
            <div className="border-b border-remuse-border px-5 py-4">
              <p className="text-[11px] font-mono uppercase tracking-[0.28em] text-neutral-500">Conversation Archive</p>
              <div className="mt-3 flex items-end justify-between gap-3">
                <div>
                  <p className="text-3xl font-display font-bold text-remuse-secondary">{sessions.length}</p>
                  <p className="text-xs text-neutral-500">段历史对话</p>
                </div>
                <div className="rounded-2xl border border-remuse-secondary/20 bg-black/20 px-3 py-2 text-right">
                  <p className="text-[11px] font-mono uppercase tracking-[0.24em] text-neutral-500">Story Sources</p>
                  <p className="text-lg font-display font-bold text-white">{storyItems.length}</p>
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <div className="space-y-3">
                {sessions.map((session) => {
                  const active = session.id === activeSession?.id;
                  return (
                    <button
                      key={session.id}
                      type="button"
                      onClick={() => {
                        setActiveSessionId(session.id);
                        setError(null);
                        setMobilePanel('chat');
                      }}
                      className={`group w-full rounded-2xl border p-4 text-left transition-colors ${
                        active
                          ? 'border-remuse-accent/40 bg-remuse-accent/10'
                          : 'border-neutral-800 bg-black/20 hover:border-remuse-secondary/40 hover:bg-black/35'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className={`truncate text-sm font-display font-bold ${active ? 'text-white' : 'text-neutral-200'}`}>
                            {session.title}
                          </p>
                          <p className="mt-2 line-clamp-2 text-xs leading-6 text-neutral-500">{summarizeSession(session)}</p>
                        </div>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleDeleteConversation(session.id);
                          }}
                          className="rounded-full border border-transparent p-2 text-neutral-500 transition-colors hover:border-red-500/30 hover:text-red-300"
                          aria-label={`删除会话 ${session.title}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <div className="mt-3 flex items-center justify-between text-[11px] font-mono text-neutral-500">
                        <span>{session.messages.length} 条消息</span>
                        <span>{new Date(session.updatedAt).toLocaleDateString('zh-CN')}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </aside>

          <section className={`${mobilePanel === 'chat' ? 'flex' : 'hidden'} min-h-0 flex-col overflow-hidden rounded-[28px] border border-remuse-border bg-remuse-panel xl:flex`}>
            <div className="border-b border-remuse-border px-5 py-4 md:px-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[11px] font-mono uppercase tracking-[0.28em] text-remuse-accent">Active Conversation</p>
                  <h3 className="mt-2 truncate text-2xl font-display font-bold text-white">
                    {activeSession?.title || '新的回忆对话'}
                  </h3>
                </div>
                <div className="rounded-full border border-remuse-border bg-black/20 px-3 py-1.5 text-[11px] font-mono text-neutral-400">
                  {activeSession?.usedFallback ? 'fallback answer' : 'grounded answer'}
                </div>
              </div>
            </div>

            <div className="flex h-full min-h-0 flex-col p-5 md:p-6">
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                {activeSession?.messages.map((message) => (
                  <div key={message.id} className={`flex ${message.role === 'assistant' ? 'justify-start' : 'justify-end'}`}>
                    <div
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

                {isAsking && (
                  <div className="flex justify-start">
                    <div className="inline-flex items-center gap-2 rounded-2xl border border-remuse-border bg-black/25 px-4 py-3 text-sm text-neutral-300">
                      <Loader2 size={16} className="animate-spin text-remuse-accent" />
                      正在翻阅你的记忆档案...
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className="mt-5 rounded-[24px] border border-neutral-800 bg-black/30 p-4">
                <label className="block text-xs font-mono uppercase tracking-[0.24em] text-neutral-500">
                  输入一个与旧物有关的问题
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
                  placeholder="例如：帮我找和毕业有关的藏品；有没有哪件东西让我想到妈妈；我最早收藏的那件旧物是什么？"
                />

                <div className="mt-4 flex gap-2 overflow-x-auto pb-1 xl:flex-wrap">
                  {suggestionItems.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => {
                        void handleAsk(suggestion);
                      }}
                      className="shrink-0 rounded-full border border-neutral-800 bg-black/20 px-3 py-2 text-xs text-neutral-300 transition-colors hover:border-remuse-accent hover:text-white"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>

                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                    <span className="rounded-full border border-neutral-800 bg-black/20 px-3 py-1.5">支持语音输入</span>
                    <span className="hidden rounded-full border border-neutral-800 bg-black/20 px-3 py-1.5 sm:inline-flex">历史会话保存在当前账号浏览器中</span>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={toggleVoiceInput}
                      className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border px-4 py-2 text-sm transition-colors ${
                        isRecording
                          ? 'border-red-500/60 bg-red-500/10 text-red-300'
                          : 'border-neutral-700 bg-black/20 text-neutral-300 hover:border-remuse-secondary hover:text-white'
                      }`}
                    >
                      {isRecording ? <Square size={15} /> : <Mic size={15} />}
                      {isRecording ? '停止语音' : '语音提问'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void handleAsk();
                      }}
                      disabled={isAsking || query.trim().length < 2 || storyItems.length === 0}
                      className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-remuse-accent px-4 py-2 text-sm font-display font-bold text-black transition-colors hover:bg-white disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
                    >
                      {isAsking ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                      开始回忆
                    </button>
                  </div>
                </div>

                {error && <p className="mt-3 text-xs text-red-300">{error}</p>}
                {storyItems.length === 0 && (
                  <p className="mt-3 text-xs leading-6 text-neutral-500">
                    你现在还没有录入带故事的藏品。先在扫描归档或藏品编辑中写下几段回忆，这里才会有可检索的内容。
                  </p>
                )}
              </div>
            </div>
          </section>

          <aside className={`${mobilePanel === 'memories' ? 'flex' : 'hidden'} min-h-0 flex-col overflow-hidden rounded-[28px] border border-remuse-border bg-remuse-panel xl:flex`}>
            <div className="border-b border-remuse-border px-5 py-4 md:px-6">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-mono uppercase tracking-[0.28em] text-neutral-500">Retrieved Memories</p>
                  <h3 className="mt-2 text-xl font-display font-bold text-white">
                    {activeSession?.matches.length ? '当前召回结果' : '最近录入的故事'}
                  </h3>
                  <p className="mt-2 text-xs leading-6 text-neutral-500">
                    {activeSession?.retrievalSummary || INITIAL_RETRIEVAL_SUMMARY}
                  </p>
                </div>
                <div className="rounded-full border border-remuse-border bg-black/20 px-3 py-1.5 text-[11px] font-mono text-neutral-400">
                  {activeSession?.matches.length ? `${activeSession.matches.length} matches` : `${recentMemoryItems.length} recent`}
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-5 md:p-6">
              <div className="mb-4 hidden grid-cols-2 gap-3 md:grid">
                <div className="rounded-2xl border border-remuse-secondary/20 bg-black/20 p-4">
                  <span className="text-[11px] font-mono uppercase tracking-[0.24em] text-neutral-500">Story Archive</span>
                  <p className="mt-2 text-2xl font-display font-bold text-remuse-secondary">{storyItems.length}</p>
                  <p className="text-xs text-neutral-500">件藏品带有故事记录</p>
                </div>
                <div className="rounded-2xl border border-neutral-800 bg-black/20 p-4">
                  <span className="text-[11px] font-mono uppercase tracking-[0.24em] text-neutral-500">Source Count</span>
                  <p className="mt-2 text-2xl font-display font-bold text-white">{activeSession?.sourceCount || storyItems.length}</p>
                  <p className="text-xs text-neutral-500">次会话可用记忆源</p>
                </div>
              </div>

              <div className="space-y-3">
                {visibleMatches.map((match) => (
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
                    {match.tags.length > 0 && (
                      <div className="flex flex-wrap gap-2 border-t border-remuse-border px-3 py-2">
                        {match.tags.slice(0, 4).map((tag) => (
                          <span key={tag} className="rounded-full bg-white/5 px-2 py-1 text-[10px] text-neutral-400">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}

                {visibleMatches.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-neutral-800 bg-black/20 px-4 py-8 text-center text-sm leading-7 text-neutral-500">
                    这里会显示和当前问题最相关的旧物记忆线索。
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
