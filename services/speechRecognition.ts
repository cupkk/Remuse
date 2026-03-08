export interface SpeechCaptureSession {
  stop: () => void;
}

interface SpeechCaptureOptions {
  lang?: string;
  continuous?: boolean;
  interimResults?: boolean;
  onTranscript: (transcript: string, isFinal: boolean) => void;
  onError?: (message: string) => void;
  onEnd?: () => void;
}

type BrowserSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type BrowserSpeechRecognitionCtor = new () => BrowserSpeechRecognition;

declare global {
  interface Window {
    SpeechRecognition?: BrowserSpeechRecognitionCtor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionCtor;
  }
}

function getSpeechRecognitionCtor(): BrowserSpeechRecognitionCtor | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export function isSpeechRecognitionSupported() {
  return !!getSpeechRecognitionCtor();
}

export function startSpeechCapture(options: SpeechCaptureOptions): SpeechCaptureSession {
  const SpeechRecognitionCtor = getSpeechRecognitionCtor();
  if (!SpeechRecognitionCtor) {
    throw new Error('当前浏览器不支持语音输入，请使用 Chrome 或 Edge。');
  }

  const recognition = new SpeechRecognitionCtor();
  recognition.lang = options.lang || 'zh-CN';
  recognition.continuous = options.continuous ?? false;
  recognition.interimResults = options.interimResults ?? true;
  recognition.maxAlternatives = 1;

  recognition.onresult = (event) => {
    let transcript = '';
    let isFinal = true;

    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      transcript += event.results[index][0]?.transcript || '';
      if (!event.results[index].isFinal) {
        isFinal = false;
      }
    }

    options.onTranscript(transcript.trim(), isFinal);
  };

  recognition.onerror = (event) => {
    options.onError?.(mapSpeechError(event?.error));
  };

  recognition.onend = () => {
    options.onEnd?.();
  };

  recognition.start();

  return {
    stop: () => recognition.stop(),
  };
}

function mapSpeechError(error: string | undefined) {
  switch (error) {
    case 'not-allowed':
    case 'service-not-allowed':
      return '请允许麦克风权限后再试。';
    case 'audio-capture':
      return '没有检测到可用麦克风。';
    case 'network':
      return '语音识别网络异常，请稍后重试。';
    case 'no-speech':
      return '没有识别到语音，可以再说一遍。';
    default:
      return '语音输入失败，请稍后重试。';
  }
}
