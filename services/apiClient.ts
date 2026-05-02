const BASE_URL = '';

let accessTokenMemory: string | null = null;
let refreshPromise: Promise<boolean> | null = null;

interface ApiFetchOptions extends RequestInit {
  skipAuthRefresh?: boolean;
}

export function getAccessToken(): string | null {
  return accessTokenMemory;
}

export function setAccessToken(token: string | null) {
  accessTokenMemory = token;
}

export function clearAuthSession() {
  accessTokenMemory = null;
}

async function refreshAccessToken(): Promise<boolean> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const response = await fetch(`${BASE_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        clearAuthSession();
        return false;
      }

      const data = (await response.json()) as { accessToken?: string };
      setAccessToken(data.accessToken || null);
      return !!data.accessToken;
    } catch {
      clearAuthSession();
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export async function apiFetch<T = any>(
  url: string,
  options: ApiFetchOptions = {},
): Promise<T> {
  const response = await apiFetchResponse(url, options);
  return (await response.json()) as T;
}

export async function apiFetchResponse(
  url: string,
  options: ApiFetchOptions = {},
): Promise<Response> {
  const { skipAuthRefresh = false, ...requestOptions } = options;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((requestOptions.headers as Record<string, string> | undefined) || {}),
  };

  let token = getAccessToken();
  if (!token && !skipAuthRefresh) {
    const refreshed = await refreshAccessToken();
    token = getAccessToken();
    if (!refreshed || !token) {
      throw new ApiError(401, '\u767b\u5f55\u72b6\u6001\u5df2\u5931\u6548\u3002', { error: '\u767b\u5f55\u72b6\u6001\u5df2\u5931\u6548\u3002' });
    }
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response = await fetch(`${BASE_URL}${url}`, {
    ...requestOptions,
    credentials: 'include',
    headers,
  });

  if (response.status === 401 && !skipAuthRefresh) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      const nextToken = getAccessToken();
      if (nextToken) {
        headers.Authorization = `Bearer ${nextToken}`;
      } else {
        delete headers.Authorization;
      }

      response = await fetch(`${BASE_URL}${url}`, {
        ...requestOptions,
        credentials: 'include',
        headers,
      });
    }
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
      [key: string]: unknown;
    };
    throw new ApiError(response.status, body.error || response.statusText, body);
  }

  return response;
}

export class ApiError extends Error {
  status: number;
  body: any;

  constructor(status: number, message: string, body: any = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}
