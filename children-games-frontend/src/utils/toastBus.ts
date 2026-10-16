import { ref } from 'vue';

export interface ToastMsg {
  id: number;
  text: string;
  kind: 'info' | 'error';
}

/** 全局 toast 队列：任何页面用 showToast() 投递，App.vue 的 AppToast 消费（替代原生 alert） */
export const toastQueue = ref<ToastMsg[]>([]);

let seq = 0;

export const showToast = (text: string, kind: 'info' | 'error' = 'info'): void => {
  toastQueue.value.push({ id: ++seq, text, kind });
};

export const shiftToast = (): ToastMsg | undefined => toastQueue.value.shift();
