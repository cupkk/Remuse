import { AdminOverview, AdminUserDetail, AdminUserFlagStatus, AdminUserActivity, FeedbackSubmission } from '../types';
import { apiFetch } from './apiClient';

export async function fetchAdminOverview(): Promise<AdminOverview> {
  return apiFetch<AdminOverview>('/api/admin/overview');
}

export async function fetchAdminFeedback(): Promise<{
  feedback: FeedbackSubmission[];
  feedbackSummary: {
    open: number;
    inReview: number;
    closed: number;
  };
}> {
  return apiFetch('/api/admin/feedback');
}

export async function updateFeedbackStatus(id: string, status: FeedbackSubmission['status']) {
  return apiFetch<{ success: boolean }>(`/api/admin/feedback/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export async function searchAdminUsers(query: string): Promise<AdminUserActivity[]> {
  const search = new URLSearchParams({ query });
  const data = await apiFetch<{ users: AdminUserActivity[] }>(`/api/admin/users?${search.toString()}`);
  return data.users;
}

export async function fetchAdminUserDetail(userId: string): Promise<AdminUserDetail> {
  return apiFetch<AdminUserDetail>(`/api/admin/users/${userId}`);
}

export async function updateAdminUserFlag(
  userId: string,
  status: AdminUserFlagStatus,
  note = '',
) {
  return apiFetch<{ success: boolean; user: AdminUserActivity | null }>(`/api/admin/users/${userId}/flag`, {
    method: 'PATCH',
    body: JSON.stringify({ status, note }),
  });
}
