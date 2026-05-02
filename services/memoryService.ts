import {
  MemoryConversationSession,
  MemoryThreadSummary,
  MemoryAssistantMessage,
  MemoryAssistantResponse,
} from '../types';
import { apiFetch, apiFetchResponse } from './apiClient';

type MemoryQueryStreamEvent =
  | { type: 'started'; threadId: string }
  | { type: 'delta'; delta: string }
  | { type: 'done'; thread: MemoryConversationSession }
  | { type: 'error'; error: string };

export async function askMemoryAssistant(
  query: string,
  history: MemoryAssistantMessage[],
): Promise<MemoryAssistantResponse> {
  return apiFetch<MemoryAssistantResponse>('/api/memory/query', {
    method: 'POST',
    body: JSON.stringify({
      query,
      history: history.slice(-8).map(({ id, role, content }) => ({ id, role, content })),
    }),
  });
}

export async function listMemoryThreads(): Promise<MemoryThreadSummary[]> {
  const data = await apiFetch<{ threads: MemoryThreadSummary[] }>('/api/memory/threads');
  return data.threads;
}

export async function createMemoryThread(title?: string): Promise<MemoryConversationSession> {
  const data = await apiFetch<{ thread: MemoryConversationSession }>('/api/memory/threads', {
    method: 'POST',
    body: JSON.stringify(title ? { title } : {}),
  });
  return data.thread;
}

export async function getMemoryThread(threadId: string): Promise<MemoryConversationSession> {
  const data = await apiFetch<{ thread: MemoryConversationSession }>(`/api/memory/threads/${threadId}`);
  return data.thread;
}

export async function renameMemoryThread(threadId: string, title: string): Promise<MemoryConversationSession> {
  const data = await apiFetch<{ thread: MemoryConversationSession }>(`/api/memory/threads/${threadId}`, {
    method: 'PATCH',
    body: JSON.stringify({ title }),
  });
  return data.thread;
}

export async function deleteMemoryThread(threadId: string): Promise<{
  success: boolean;
  threads: MemoryThreadSummary[];
  activeThread: MemoryConversationSession | null;
}> {
  return apiFetch(`/api/memory/threads/${threadId}`, {
    method: 'DELETE',
  });
}

export async function queryMemoryThread(threadId: string, query: string): Promise<MemoryConversationSession> {
  const data = await apiFetch<{ thread: MemoryConversationSession }>(`/api/memory/threads/${threadId}/query`, {
    method: 'POST',
    body: JSON.stringify({ query }),
  });
  return data.thread;
}

export async function streamMemoryThreadQuery(
  threadId: string,
  query: string,
  handlers: {
    onStarted?: (threadId: string) => void;
    onDelta?: (delta: string) => void;
  } = {},
): Promise<MemoryConversationSession> {
  const response = await apiFetchResponse(`/api/memory/threads/${threadId}/query/stream`, {
    method: 'POST',
    body: JSON.stringify({ query }),
    headers: {
      Accept: 'application/x-ndjson',
    },
  });

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('记忆流式输出不可用。');
  }

  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      const event = JSON.parse(trimmed) as MemoryQueryStreamEvent;
      if (event.type === 'started') {
        handlers.onStarted?.(event.threadId);
        continue;
      }

      if (event.type === 'delta') {
        handlers.onDelta?.(event.delta);
        continue;
      }

      if (event.type === 'done') {
        return event.thread;
      }

      if (event.type === 'error') {
        throw new Error(event.error || '记忆检索失败。');
      }
    }
  }

  if (buffer.trim()) {
    const event = JSON.parse(buffer.trim()) as MemoryQueryStreamEvent;
    if (event.type === 'done') {
      return event.thread;
    }
    if (event.type === 'error') {
      throw new Error(event.error || '记忆检索失败。');
    }
  }

  throw new Error('记忆流式输出已中断。');
}
