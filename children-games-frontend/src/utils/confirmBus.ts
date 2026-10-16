import { ref } from 'vue';

export interface ConfirmOptions {
  title: string;
  detail?: string;
  /** 危险操作时确认按钮标红 */
  danger?: boolean;
  confirmText?: string;
  cancelText?: string;
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

/** 全局确认弹框：confirmAction() 返回 Promise<boolean>，App.vue 的 AppConfirm 消费（替代原生 confirm） */
export const pendingConfirm = ref<PendingConfirm | null>(null);

export const confirmAction = (opts: ConfirmOptions): Promise<boolean> =>
  new Promise((resolve) => {
    // 已有弹框在展示时直接取消上一个（排队没有意义，确认类操作总是针对当下场景）
    if (pendingConfirm.value) pendingConfirm.value.resolve(false);
    pendingConfirm.value = { ...opts, resolve };
  });

export const settleConfirm = (ok: boolean): void => {
  const cur = pendingConfirm.value;
  if (!cur) return;
  pendingConfirm.value = null;
  cur.resolve(ok);
};
