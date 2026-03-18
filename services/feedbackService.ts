import { apiFetch } from './apiClient';

export async function submitFeedback(payload: {
  type: 'bug' | 'feature' | 'support' | 'other';
  message: string;
}) {
  return apiFetch<{ success: boolean; feedbackId: string; message: string }>('/api/feedback', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
