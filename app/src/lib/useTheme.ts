import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark';
const STORAGE_KEY = 'sneakercare_theme';

function getSavedTheme(): Theme | null {
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved === 'light' || saved === 'dark' ? saved : null;
}

function systemPrefersDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** ก่อนผู้ใช้กดสลับเองครั้งแรก จะตามธีมของเครื่อง/เบราว์เซอร์แบบสด (ไม่ตั้ง data-theme ค้างไว้
 *  ปล่อยให้ @media (prefers-color-scheme) ทำงานตามปกติ) — พอกดสลับแล้วค่อยจำไว้แทนถาวร */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => getSavedTheme() ?? (systemPrefersDark() ? 'dark' : 'light'));

  useEffect(() => {
    const saved = getSavedTheme();
    if (saved) {
      document.documentElement.dataset.theme = saved;
      return;
    }
    delete document.documentElement.dataset.theme;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setTheme(mq.matches ? 'dark' : 'light');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem(STORAGE_KEY, next);
    document.documentElement.dataset.theme = next;
    setTheme(next);
  };

  return { theme, toggle };
}
