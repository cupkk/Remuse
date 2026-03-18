import {
  MemoryConversationSession,
  MemoryThreadSummary,
  MemoryAssistantMessage,
  MemoryAssistantResponse,
} from '../types';
import { apiFetch } from './apiClient';

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
