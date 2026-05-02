import { APP_CONFIG } from './appConfig.ts';
import { serverLogger } from './serverLogger.ts';

export type StepfunMultipartContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

type StepfunChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string | StepfunMultipartContentPart[];
};

type StepfunChatResponse = {
  model?: string;
  choices?: Array<{
    message?: {
      content?: string | StepfunAssistantContentPart[];
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

type StepfunAssistantContentPart = {
  type?: string;
  text?: string;
};

interface RequestStepfunChatOptions {
  feature: string;
  userContent: string | StepfunMultipartContentPart[];
  systemPrompt?: string;
  responseFormat?: 'text' | 'json_object';
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  modelCandidates?: string[];
  signal?: AbortSignal;
  timeoutMs?: number;
  attempts?: number;
}

export interface StepfunChatResult {
  text: string;
  model: string;
  usage?: StepfunChatResponse['usage'];
}

export interface StepfunStreamChunk {
  delta: string;
  fullText: string;
  model: string;
}

const STEPFUN_TEXT_MODEL = (process.env.STEPFUN_TEXT_MODEL || 'step-3.5-flash').trim();

export const STEPFUN_TEXT_MODEL_CANDIDATES = parseModelCandidates(
  process.env.STEPFUN_TEXT_MODEL_CANDIDATES,
  [STEPFUN_TEXT_MODEL],
);

export const STEPFUN_MEMORY_MODEL_CANDIDATES = parseModelCandidates(
  process.env.STEPFUN_MEMORY_MODEL_CANDIDATES,
  [process.env.STEPFUN_MEMORY_MODEL || STEPFUN_TEXT_MODEL],
);

export const STEPFUN_VISION_MODEL_CANDIDATES = parseModelCandidates(
  process.env.STEPFUN_VISION_MODEL_CANDIDATES,
  [process.env.STEPFUN_VISION_MODEL || 'step-1v-8k'],
);

function parseModelCandidates(envValue: string | undefined, defaults: string[]) {
  const parsed = (envValue || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  return [...new Set([...parsed, ...defaults])];
}

function shouldFallbackModel(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes('429')
    || message.includes('rate limit')
    || message.includes('too many')
    || message.includes('quota')
    || message.includes('insufficient')
    || message.includes('额度')
    || message.includes('service unavailable')
    || message.includes('model not found')
    || message.includes('unsupported model')
    || message.includes('does not support')
    || message.includes('structured_outputs is not supported')
  );
}

function shouldRetry(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes('timeout')
    || message.includes('network')
    || message.includes('fetch')
    || message.includes('429')
    || message.includes('503')
    || message.includes('502')
    || message.includes('rate limit')
    || message.includes('service unavailable')
  );
}

async function withRetries<T>(feature: string, task: () => Promise<T>, attempts = 4) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      serverLogger.warn('stepfun.retry', {
        feature,
        attempt,
        message: error instanceof Error ? error.message : String(error),
      });

      if (attempt >= attempts || !shouldRetry(error)) {
        break;
      }

      const baseDelayMs = Math.min(5000, 450 * (2 ** (attempt - 1)));
      const jitterMs = Math.floor(Math.random() * 300);
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs + jitterMs));
    }
  }

  throw lastError;
}

function normalizeAssistantContent(content: string | StepfunAssistantContentPart[] | undefined) {
  if (typeof content === 'string') {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part?.text === 'string' ? part.text : ''))
      .join('')
      .trim();
  }

  return '';
}

function buildMessages(options: RequestStepfunChatOptions) {
  const messages: StepfunChatMessage[] = [];
  const jsonInstruction = options.responseFormat === 'json_object'
    ? '\n\n\u8f93\u51fa\u8981\u6c42\uff1a\u53ea\u8fd4\u56de\u4e00\u4e2a\u5408\u6cd5 JSON \u5bf9\u8c61\uff0c\u4e0d\u8981\u4f7f\u7528 Markdown \u4ee3\u7801\u5757\uff0c\u4e0d\u8981\u6dfb\u52a0\u89e3\u91ca\u6587\u5b57\u3002'
    : '';

  if (options.systemPrompt?.trim()) {
    messages.push({
      role: 'system',
      content: `${options.systemPrompt.trim()}${jsonInstruction}`,
    });
  }

  messages.push({
    role: 'user',
    content: appendInstructionToUserContent(options.userContent, jsonInstruction),
  });

  return messages;
}

function appendInstructionToUserContent(
  userContent: RequestStepfunChatOptions['userContent'],
  instruction: string,
): RequestStepfunChatOptions['userContent'] {
  if (!instruction) {
    return userContent;
  }

  if (typeof userContent === 'string') {
    return `${userContent}${instruction}`;
  }

  const next = [...userContent];
  for (let index = next.length - 1; index >= 0; index -= 1) {
    const part = next[index];
    if (part.type === 'text') {
      next[index] = { ...part, text: `${part.text}${instruction}` };
      return next;
    }
  }

  const instructionPart: StepfunMultipartContentPart = { type: 'text', text: instruction.trim() };
  return [...next, instructionPart];
}

function buildStepfunAbortSignal(signal?: AbortSignal, timeoutMs = APP_CONFIG.stepfunTimeoutMs) {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  if (!signal) {
    return timeoutSignal;
  }

  if (typeof AbortSignal.any === 'function') {
    return AbortSignal.any([signal, timeoutSignal]);
  }

  return signal;
}

async function readErrorDetail(response: Response) {
  const rawBody = await response.text();
  let detail = rawBody || response.statusText;
  try {
    const parsed = JSON.parse(rawBody) as {
      error?: { message?: string; code?: string };
      message?: string;
      code?: string;
    };
    detail = parsed.error?.message || parsed.message || parsed.error?.code || parsed.code || detail;
  } catch {
    // keep raw body
  }

  return detail;
}

function normalizeStreamDelta(delta: unknown) {
  if (typeof delta === 'string') {
    return delta;
  }

  if (Array.isArray(delta)) {
    return delta
      .map((part) => {
        if (typeof part === 'string') {
          return part;
        }

        if (part && typeof part === 'object' && 'text' in part && typeof part.text === 'string') {
          return part.text;
        }

        return '';
      })
      .join('');
  }

  if (delta && typeof delta === 'object' && 'text' in delta && typeof delta.text === 'string') {
    return delta.text;
  }

  return '';
}

function extractStreamDelta(payload: any) {
  const choice = payload?.choices?.[0];
  if (!choice) {
    return '';
  }

  return normalizeStreamDelta(
    choice.delta?.content
    ?? choice.message?.content
    ?? choice.text
    ?? '',
  );
}

async function consumeStepfunStream(
  response: Response,
  model: string,
  onDelta: (chunk: StepfunStreamChunk) => void | Promise<void>,
) {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('StepFun 流式响应不可用。');
  }

  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let fullText = '';
  let resolvedModel = model;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split(/\r?\n\r?\n/);
    buffer = frames.pop() || '';

    for (const frame of frames) {
      const lines = frame
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

      for (const line of lines) {
        if (!line.startsWith('data:')) {
          continue;
        }

        const data = line.slice(5).trim();
        if (!data) {
          continue;
        }

        if (data === '[DONE]') {
          return {
            text: fullText.trim(),
            model: resolvedModel,
          };
        }

        let payload: any;
        try {
          payload = JSON.parse(data);
        } catch {
          continue;
        }

        resolvedModel = payload?.model || resolvedModel;
        const delta = extractStreamDelta(payload);
        if (!delta) {
          continue;
        }

        fullText += delta;
        await onDelta({
          delta,
          fullText,
          model: resolvedModel,
        });
      }
    }
  }

  buffer += decoder.decode();
  if (buffer.trim()) {
    const lines = buffer
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    for (const line of lines) {
      if (!line.startsWith('data:')) {
        continue;
      }

      const data = line.slice(5).trim();
      if (!data || data === '[DONE]') {
        continue;
      }

      let payload: any;
      try {
        payload = JSON.parse(data);
      } catch {
        continue;
      }

      resolvedModel = payload?.model || resolvedModel;
      const delta = extractStreamDelta(payload);
      if (!delta) {
        continue;
      }

      fullText += delta;
      await onDelta({
        delta,
        fullText,
        model: resolvedModel,
      });
    }
  }

  return {
    text: fullText.trim(),
    model: resolvedModel,
  };
}

async function sendStepfunChatRequest(
  feature: string,
  model: string,
  options: RequestStepfunChatOptions,
) {
  if (APP_CONFIG.disableLiveAi) {
    throw new Error('当前环境已关闭实时 AI 文本能力。');
  }

  if (!APP_CONFIG.stepfunApiKey) {
    throw new Error('缺少 STEPFUN_API_KEY 配置。');
  }

  const response = await fetch(`${APP_CONFIG.stepfunBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${APP_CONFIG.stepfunApiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: buildMessages(options),
      stream: false,
      temperature: options.temperature ?? 0.45,
      top_p: options.topP ?? 0.9,
      ...(options.maxTokens ? { max_tokens: options.maxTokens } : {}),
    }),
    signal: buildStepfunAbortSignal(options.signal, options.timeoutMs),
  });

  if (!response.ok) {
    const detail = await readErrorDetail(response);
    throw new Error(`StepFun ${response.status}: ${detail}`);
  }

  const data = await response.json() as StepfunChatResponse;
  const text = normalizeAssistantContent(data.choices?.[0]?.message?.content);
  if (!text) {
    throw new Error('StepFun 未返回可用文本内容。');
  }

  serverLogger.info('stepfun.chat.completed', {
    feature,
    model: data.model || model,
    promptTokens: data.usage?.prompt_tokens || 0,
    completionTokens: data.usage?.completion_tokens || 0,
  });

  return {
    text,
    model: data.model || model,
    usage: data.usage,
  } satisfies StepfunChatResult;
}

async function sendStepfunChatStreamRequest(
  feature: string,
  model: string,
  options: RequestStepfunChatOptions,
  onDelta: (chunk: StepfunStreamChunk) => void | Promise<void>,
) {
  if (APP_CONFIG.disableLiveAi) {
    throw new Error('当前环境已关闭实时 AI 文本能力。');
  }

  if (!APP_CONFIG.stepfunApiKey) {
    throw new Error('缺少 STEPFUN_API_KEY 配置。');
  }

  const response = await fetch(`${APP_CONFIG.stepfunBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${APP_CONFIG.stepfunApiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: buildMessages(options),
      stream: true,
      temperature: options.temperature ?? 0.45,
      top_p: options.topP ?? 0.9,
      ...(options.maxTokens ? { max_tokens: options.maxTokens } : {}),
    }),
    signal: buildStepfunAbortSignal(options.signal, options.timeoutMs),
  });

  if (!response.ok) {
    const detail = await readErrorDetail(response);
    throw new Error(`StepFun ${response.status}: ${detail}`);
  }

  const result = await consumeStepfunStream(response, model, onDelta);
  if (!result.text) {
    throw new Error('StepFun 未返回可用的流式文本内容。');
  }

  serverLogger.info('stepfun.chat.stream_completed', {
    feature,
    model: result.model,
  });

  return result satisfies Pick<StepfunChatResult, 'text' | 'model'>;
}

export async function requestStepfunChatCompletion(options: RequestStepfunChatOptions) {
  const modelCandidates = options.modelCandidates?.length
    ? options.modelCandidates
    : STEPFUN_TEXT_MODEL_CANDIDATES;

  let lastError: unknown;

  for (let index = 0; index < modelCandidates.length; index += 1) {
    const model = modelCandidates[index];
    try {
      return await withRetries(options.feature, () => sendStepfunChatRequest(options.feature, model, options), options.attempts ?? 4);
    } catch (error) {
      lastError = error;
      serverLogger.warn('stepfun.model_fallback', {
        feature: options.feature,
        model,
        step: index + 1,
        total: modelCandidates.length,
        message: error instanceof Error ? error.message : String(error),
      });

      if (!shouldFallbackModel(error) || index >= modelCandidates.length - 1) {
        break;
      }
    }
  }

  throw lastError;
}

export async function requestStepfunChatCompletionStream(
  options: RequestStepfunChatOptions,
  onDelta: (chunk: StepfunStreamChunk) => void | Promise<void>,
) {
  const modelCandidates = options.modelCandidates?.length
    ? options.modelCandidates
    : STEPFUN_TEXT_MODEL_CANDIDATES;

  let lastError: unknown;

  for (let index = 0; index < modelCandidates.length; index += 1) {
    const model = modelCandidates[index];
    try {
      return await sendStepfunChatStreamRequest(options.feature, model, options, onDelta);
    } catch (error) {
      lastError = error;
      serverLogger.warn('stepfun.stream_model_fallback', {
        feature: options.feature,
        model,
        step: index + 1,
        total: modelCandidates.length,
        message: error instanceof Error ? error.message : String(error),
      });

      if (!shouldFallbackModel(error) || index >= modelCandidates.length - 1) {
        break;
      }
    }
  }

  throw lastError;
}

export function parseJsonFromModelText<T>(text: string) {
  const trimmed = (text || '').trim();
  if (!trimmed) {
    throw new Error('AI 未返回可解析的 JSON 内容。');
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const objectMatch = trimmed.match(/\{[\s\S]*\}/);
  const candidate = fencedMatch?.[1]?.trim() || objectMatch?.[0]?.trim() || trimmed;
  return JSON.parse(candidate) as T;
}

