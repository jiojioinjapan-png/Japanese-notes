import { useEffect, useState } from 'react';
function savedPreference(key: string, fallback: string) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}
export function usePreference(key: string, fallback: string) {
  const [value, setValue] = useState(() => savedPreference(key, fallback));
  const update = (next: string) => {
    setValue(next);
    try {
      localStorage.setItem(key, next);
    } catch {
      /* Storage may be disabled. */
    }
  };
  return [value, update] as const;
}
export function useTheme() {
  const [theme, setTheme] = usePreference(
    'kotoba-theme',
    window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  );
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'dark' ? '#242522' : '#faf9f6');
  }, [theme]);
  return [theme, setTheme] as const;
}
