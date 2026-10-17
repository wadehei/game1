/**
 * 主题切换：夜间/日间/跟随系统
 * - data-theme 属性挂在 <html> 上，全局样式按 html[data-theme='dark'] 覆盖
 * - 选择持久化在 localStorage('theme')；'auto' 跟随系统 prefers-color-scheme
 */

export type ThemeChoice = 'auto' | 'light' | 'dark';

const THEME_KEY = 'theme';

export const getThemeChoice = (): ThemeChoice => {
  const v = localStorage.getItem(THEME_KEY);
  return v === 'light' || v === 'dark' ? v : 'auto';
};

const systemPrefersDark = (): boolean =>
  typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches;

const apply = (choice: ThemeChoice): void => {
  const dark = choice === 'dark' || (choice === 'auto' && systemPrefersDark());
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
};

/** 应用当前选择并监听系统切换（auto 模式下实时跟随） */
export const initTheme = (): void => {
  apply(getThemeChoice());
  if (typeof window.matchMedia === 'function') {
    try {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (getThemeChoice() === 'auto') apply('auto');
      });
    } catch {
      // 旧浏览器无 addEventListener 版本则忽略
    }
  }
};

export const setTheme = (choice: ThemeChoice): void => {
  localStorage.setItem(THEME_KEY, choice);
  apply(choice);
};
