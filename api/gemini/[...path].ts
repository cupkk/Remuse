// Vercel Serverless Function — Gemini API 反向代理
// 路由: /api/gemini/*
// 功能: 将客户端请求转发到 Gemini API，同时注入真实 API Key

type ApiRequest = {
  body?: unknown;
  headers: Record<string, string | string[] | undefined>;
  method?: string;
  url?: string;
};

type ApiResponse = {
  end: () => ApiResponse;
  json: (body: unknown) => ApiResponse;
  send: (body: unknown) => ApiResponse;
  setHeader: (name: string, value: string) => void;
  status: (code: number) => ApiResponse;
};

export default async function handler(req: ApiRequest, res: ApiResponse) {
  const geminiApiKey = process.env.GEMINI_API_KEY;
  const geminiBaseUrl = process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com';

  if (!geminiApiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });
  }

  // 从请求路径中提取真实的 API 路径
  // req.url 形如 /api/gemini/v1beta/models/xxx:generateContent?key=PROXIED
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const apiPath = url.pathname.replace(/^\/api\/gemini/, '');

  // 替换占位 key 为真实 key
  url.searchParams.delete('key');
  url.searchParams.set('key', geminiApiKey);

  const targetUrl = `${geminiBaseUrl}${apiPath}?${url.searchParams.toString()}`;

  try {
    // 转发请求到 Gemini API
    const headers: Record<string, string> = {
      'Content-Type': req.headers['content-type'] || 'application/json',
      'x-goog-api-key': geminiApiKey,
    };

    const fetchOptions: RequestInit = {
      method: req.method || 'POST',
      headers,
    };

    // POST/PUT/PATCH 请求需要转发 body
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      fetchOptions.body = JSON.stringify(req.body);
    }

    const response = await fetch(targetUrl, fetchOptions);

    // 设置 CORS 头
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    const data = await response.text();
    res.status(response.status);

    // 透传响应头中的 content-type
    const contentType = response.headers.get('content-type');
    if (contentType) {
      res.setHeader('Content-Type', contentType);
    }

    return res.send(data);
  } catch (error) {
    console.error('Gemini proxy error:', error);
    return res.status(502).json({
      error: 'Failed to proxy request to Gemini API',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}
