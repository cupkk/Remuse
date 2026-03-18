import { v4 as uuidv4 } from 'uuid';
import db from './database.ts';
import type { MemoryAssistantMatch, MemoryAssistantMessage, MemoryConversationSession } from '../types.ts';
import {
  DEFAULT_MEMORY_PROMPTS,
  DEFAULT_MEMORY_THREAD_TITLE,
  INITIAL_MEMORY_RETRIEVAL_SUMMARY,
  MEMORY_ASSISTANT_GREETING,
} from './memoryDefaults.ts';

interface MemoryThreadRow {
  id: string;
  user_id: string;
  title: string;
  matches_json: string;
  suggestions_json: string;
  retrieval_summary: string;
  source_count: number;
  used_fallback: number;
  created_at: string;
  updated_at: string;
}

interface MemoryMessageRow {
  id: string;
  thread_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

db.exec(`
  CREATE TABLE IF NOT EXISTS memory_threads (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    matches_json TEXT NOT NULL DEFAULT '[]',
    suggestions_json TEXT NOT NULL DEFAULT '[]',
    retrieval_summary TEXT NOT NULL DEFAULT '',
    source_count INTEGER NOT NULL DEFAULT 0,
    used_fallback INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_memory_threads_user_updated
  ON memory_threads(user_id, updated_at DESC);

  CREATE TABLE IF NOT EXISTS memory_messages (
    id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (thread_id) REFERENCES memory_threads(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_memory_messages_thread_created
  ON memory_messages(thread_id, created_at ASC);
`);

const stmts = {
  insertThread: db.prepare<{
    id: string;
    user_id: string;
    title: string;
    matches_json: string;
    suggestions_json: string;
    retrieval_summary: string;
    source_count: number;
    used_fallback: number;
  }>(`
    INSERT INTO memory_threads (
      id,
      user_id,
      title,
      matches_json,
      suggestions_json,
      retrieval_summary,
      source_count,
      used_fallback
    ) VALUES (
      @id,
      @user_id,
      @title,
      @matches_json,
      @suggestions_json,
      @retrieval_summary,
      @source_count,
      @used_fallback
    )
  `),
  getThreadById: db.prepare<[string, string]>(`
    SELECT * FROM memory_threads
    WHERE id = ? AND user_id = ?
    LIMIT 1
  `),
  listThreadsByUser: db.prepare<[string]>(`
    SELECT
      t.*,
      (
        SELECT content
        FROM memory_messages m
        WHERE m.thread_id = t.id
        ORDER BY m.created_at DESC
        LIMIT 1
      ) AS last_message
    FROM memory_threads t
    WHERE t.user_id = ?
    ORDER BY t.updated_at DESC, t.created_at DESC
  `),
  listMessagesByThread: db.prepare<[string]>(`
    SELECT * FROM memory_messages
    WHERE thread_id = ?
    ORDER BY created_at ASC
  `),
  insertMessage: db.prepare<{
    id: string;
    thread_id: string;
    role: 'user' | 'assistant';
    content: string;
  }>(`
    INSERT INTO memory_messages (id, thread_id, role, content)
    VALUES (@id, @thread_id, @role, @content)
  `),
  updateThread: db.prepare<{
    id: string;
    title: string;
    matches_json: string;
    suggestions_json: string;
    retrieval_summary: string;
    source_count: number;
    used_fallback: number;
  }>(`
    UPDATE memory_threads
    SET title = @title,
        matches_json = @matches_json,
        suggestions_json = @suggestions_json,
        retrieval_summary = @retrieval_summary,
        source_count = @source_count,
        used_fallback = @used_fallback,
        updated_at = datetime('now')
    WHERE id = @id
  `),
  renameThread: db.prepare<{
    id: string;
    user_id: string;
    title: string;
  }>(`
    UPDATE memory_threads
    SET title = @title,
        updated_at = datetime('now')
    WHERE id = @id AND user_id = @user_id
  `),
  deleteThread: db.prepare<[string, string]>(`
    DELETE FROM memory_threads
    WHERE id = ? AND user_id = ?
  `),
};

export function createMemoryThread(userId: string, title = DEFAULT_MEMORY_THREAD_TITLE) {
  const id = uuidv4();
  stmts.insertThread.run({
    id,
    user_id: userId,
    title,
    matches_json: JSON.stringify([]),
    suggestions_json: JSON.stringify(DEFAULT_MEMORY_PROMPTS),
    retrieval_summary: INITIAL_MEMORY_RETRIEVAL_SUMMARY,
    source_count: 0,
    used_fallback: 0,
  });

  appendMemoryMessage(id, 'assistant', MEMORY_ASSISTANT_GREETING);
  return getMemoryThreadSession(userId, id);
}

export function ensureMemoryThread(userId: string, threadId?: string | null) {
  if (threadId) {
    const thread = getMemoryThreadSession(userId, threadId);
    if (thread) {
      return thread;
    }
  }

  const existingThreads = listMemoryThreadSummaries(userId);
  if (existingThreads.length > 0) {
    return getMemoryThreadSession(userId, existingThreads[0].id);
  }

  return createMemoryThread(userId);
}

export function listMemoryThreadSummaries(userId: string) {
  const rows = stmts.listThreadsByUser.all(userId) as Array<MemoryThreadRow & { last_message?: string | null }>;
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastMessage: row.last_message || '',
    sourceCount: row.source_count,
    usedFallback: !!row.used_fallback,
  }));
}

export function getMemoryThreadSession(userId: string, threadId: string): MemoryConversationSession | null {
  const thread = stmts.getThreadById.get(threadId, userId) as MemoryThreadRow | undefined;
  if (!thread) {
    return null;
  }

  const messages = (stmts.listMessagesByThread.all(thread.id) as MemoryMessageRow[]).map(rowToMessage);
  return {
    id: thread.id,
    title: thread.title,
    createdAt: thread.created_at,
    updatedAt: thread.updated_at,
    messages,
    matches: safeJsonParse<MemoryAssistantMatch[]>(thread.matches_json, []),
    suggestions: safeJsonParse<string[]>(thread.suggestions_json, DEFAULT_MEMORY_PROMPTS),
    retrievalSummary: thread.retrieval_summary || INITIAL_MEMORY_RETRIEVAL_SUMMARY,
    sourceCount: thread.source_count,
    usedFallback: !!thread.used_fallback,
  };
}

export function appendMemoryMessage(
  threadId: string,
  role: 'user' | 'assistant',
  content: string,
  id = uuidv4(),
) {
  stmts.insertMessage.run({
    id,
    thread_id: threadId,
    role,
    content,
  });
}

export function updateMemoryThreadContext(
  threadId: string,
  updates: Partial<{
    title: string;
    matches: MemoryAssistantMatch[];
    suggestions: string[];
    retrievalSummary: string;
    sourceCount: number;
    usedFallback: boolean;
  }>,
) {
  const current = db.prepare(`SELECT * FROM memory_threads WHERE id = ? LIMIT 1`).get(threadId) as MemoryThreadRow | undefined;
  if (!current) {
    return;
  }

  stmts.updateThread.run({
    id: threadId,
    title: updates.title ?? current.title,
    matches_json: JSON.stringify(updates.matches ?? safeJsonParse<MemoryAssistantMatch[]>(current.matches_json, [])),
    suggestions_json: JSON.stringify(updates.suggestions ?? safeJsonParse<string[]>(current.suggestions_json, DEFAULT_MEMORY_PROMPTS)),
    retrieval_summary: updates.retrievalSummary ?? current.retrieval_summary,
    source_count: updates.sourceCount ?? current.source_count,
    used_fallback: typeof updates.usedFallback === 'boolean' ? (updates.usedFallback ? 1 : 0) : current.used_fallback,
  });
}

export function renameMemoryThread(userId: string, threadId: string, title: string) {
  const trimmed = title.trim();
  if (!trimmed) {
    return null;
  }

  stmts.renameThread.run({
    id: threadId,
    user_id: userId,
    title: trimmed,
  });

  return getMemoryThreadSession(userId, threadId);
}

export function deleteMemoryThread(userId: string, threadId: string) {
  return stmts.deleteThread.run(threadId, userId);
}

export function buildThreadTitle(currentTitle: string, messages: MemoryAssistantMessage[], prompt: string) {
  if (currentTitle !== DEFAULT_MEMORY_THREAD_TITLE) {
    return currentTitle;
  }

  const userMessageCount = messages.filter((message) => message.role === 'user').length;
  if (userMessageCount > 1) {
    return currentTitle;
  }

  return prompt.trim().slice(0, 24) || DEFAULT_MEMORY_THREAD_TITLE;
}

function rowToMessage(row: MemoryMessageRow): MemoryAssistantMessage {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
  };
}

function safeJsonParse<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
