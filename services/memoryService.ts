import { MemoryAssistantMessage, MemoryAssistantResponse } from '../types';
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
