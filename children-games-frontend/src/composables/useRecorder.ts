// 按住说话的录音器（房间临时语音用）：MediaRecorder 封装，最长 60 秒自动停
import { ref } from 'vue';

const MAX_SECONDS = 60;

export const useRecorder = () => {
  const recording = ref(false);
  const seconds = ref(0);
  const error = ref('');

  let mediaRecorder: MediaRecorder | null = null;
  let stream: MediaStream | null = null;
  let chunks: Blob[] = [];
  let secTimer: ReturnType<typeof setInterval> | null = null;
  let resolveStop: ((r: { blob: Blob; duration: number } | null) => void) | null = null;

  const cleanup = () => {
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    if (secTimer) {
      clearInterval(secTimer);
      secTimer = null;
    }
    recording.value = false;
  };

  /** 开始录音；失败（无麦克风权限等）返回 false */
  const start = async (): Promise<boolean> => {
    error.value = '';
    // HTTP 非安全上下文：mediaDevices 整个不可用（生产 http://IP:80 / 域名:90 都属此类）
    if (!window.isSecureContext || !navigator.mediaDevices) {
      error.value = '当前是 HTTP 页面，浏览器禁止使用麦克风。语音需要 HTTPS 环境（或在办备案后启用 https / 本机调试）';
      return false;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      const err = e as DOMException;
      if (err?.name === 'NotAllowedError' || err?.name === 'SecurityError' || err?.name === 'PermissionDeniedError') {
        error.value = '麦克风权限被拒绝：点浏览器地址栏左侧的权限图标，允许麦克风后再试';
      } else if (err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError') {
        error.value = '没有检测到麦克风设备';
      } else {
        error.value = `无法访问麦克风（${err?.name || '未知错误'}）`;
      }
      return false;
    }
    chunks = [];
    const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
    mediaRecorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    mediaRecorder.onstop = () => {
      cleanup();
      const blob = chunks.length ? new Blob(chunks, { type: chunks[0].type || 'audio/webm' }) : null;
      const duration = seconds.value;
      resolveStop?.(blob ? { blob, duration } : null);
      resolveStop = null;
    };
    mediaRecorder.start();
    seconds.value = 0;
    recording.value = true;
    secTimer = setInterval(() => {
      seconds.value += 1;
      if (seconds.value >= MAX_SECONDS) stop();
    }, 1000);
    return true;
  };

  /** 结束录音，返回音频（取消返回 null） */
  const stop = (cancel = false): Promise<{ blob: Blob; duration: number } | null> => {
    if (!mediaRecorder || mediaRecorder.state === 'inactive') return Promise.resolve(null);
    if (cancel) {
      chunks = [];
      mediaRecorder.stop();
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      resolveStop = resolve;
      mediaRecorder!.stop();
    });
  };

  return { recording, seconds, error, start, stop };
};
