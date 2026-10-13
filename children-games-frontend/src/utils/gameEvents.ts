/**
 * 全局游戏暂停/恢复事件
 * 供护眼休息等全局层叫停/恢复游戏，各游戏页自行监听并接入自己的暂停逻辑
 */
export const GAME_PAUSE_EVENT = 'game:pause';
export const GAME_RESUME_EVENT = 'game:resume';

export const emitGamePause = (): void => {
  document.dispatchEvent(new CustomEvent(GAME_PAUSE_EVENT));
};

export const emitGameResume = (): void => {
  document.dispatchEvent(new CustomEvent(GAME_RESUME_EVENT));
};
