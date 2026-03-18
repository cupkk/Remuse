export interface RecordedAudio {
  blob: Blob;
  dataUrl: string;
  mimeType: string;
}

export interface AudioRecordingSession {
  stop: () => Promise<RecordedAudio>;
  cancel: () => void;
}

const CANDIDATE_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/ogg',
  'audio/mp4',
];

export function isAudioRecordingSupported() {
  return typeof window !== 'undefined'
    && typeof navigator !== 'undefined'
    && typeof navigator.mediaDevices?.getUserMedia === 'function'
    && typeof MediaRecorder !== 'undefined';
}

export async function startAudioRecording(): Promise<AudioRecordingSession> {
  if (!isAudioRecordingSupported()) {
    throw new Error('当前浏览器不支持录音，请使用 Chrome 或 Edge。');
  }

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mimeType = resolveRecordingMimeType();
  const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
  const chunks: BlobPart[] = [];
  let settled = false;

  recorder.addEventListener('dataavailable', (event) => {
    if (event.data && event.data.size > 0) {
      chunks.push(event.data);
    }
  });

  recorder.start(250);

  const cleanup = () => {
    stream.getTracks().forEach((track) => track.stop());
  };

  return {
    stop: () => new Promise<RecordedAudio>((resolve, reject) => {
      if (settled) {
        reject(new Error('录音会话已经结束。'));
        return;
      }

      recorder.addEventListener('stop', async () => {
        try {
          const finalMimeType = recorder.mimeType || mimeType || 'audio/webm';
          const blob = new Blob(chunks, { type: finalMimeType });
          const dataUrl = await blobToDataUrl(blob);
          settled = true;
          cleanup();
          resolve({
            blob,
            dataUrl,
            mimeType: finalMimeType,
          });
        } catch (error) {
          settled = true;
          cleanup();
          reject(error instanceof Error ? error : new Error('录音保存失败。'));
        }
      }, { once: true });

      recorder.stop();
    }),
    cancel: () => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      if (recorder.state !== 'inactive') {
        recorder.stop();
      }
    },
  };
}

function resolveRecordingMimeType() {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return '';
  }

  return CANDIDATE_MIME_TYPES.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) || '';
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('录音读取失败。'));
    reader.readAsDataURL(blob);
  });
}
