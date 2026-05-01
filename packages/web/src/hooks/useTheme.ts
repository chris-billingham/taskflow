import { useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';

export function useTheme() {
  const theme = useAuthStore((s) => s.user?.theme);

  useEffect(() => {
    const root = document.documentElement;

    function apply(dark: boolean) {
      root.classList.toggle('dark', dark);
    }

    if (theme === 'dark') {
      apply(true);
      return;
    }

    if (theme === 'light') {
      apply(false);
      return;
    }

    // 'system' or unset — follow OS preference
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    apply(mq.matches);
    const handler = (e: MediaQueryListEvent) => apply(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);
}
