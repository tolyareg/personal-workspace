import { useState, useEffect, useRef, useCallback } from 'react';

export type SaveStatus = 'saved' | 'saving' | 'error';

export function useAutoSave<T>(
  data: T,
  saveFn: (value: T) => Promise<void>,
  debounceMs = 500
): { status: SaveStatus; flush: () => Promise<void> } {
  const [status, setStatus] = useState<SaveStatus>('saved');
  const latestData = useRef<T>(data);
  const isInitial = useRef(true);
  const timer = useRef<number | null>(null);

  latestData.current = data;

  const persist = useCallback(async () => {
    setStatus('saving');
    try {
      await saveFn(latestData.current);
      setStatus('saved');
    } catch (e) {
      console.error('Autosave write failed:', e);
      setStatus('error');
    }
  }, [saveFn]);

  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    await persist();
  }, [persist]);

  useEffect(() => {
    if (isInitial.current) {
      isInitial.current = false;
      return;
    }

    setStatus('saving');
    if (timer.current) clearTimeout(timer.current);

    timer.current = window.setTimeout(() => {
      persist();
    }, debounceMs);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [data, debounceMs, persist]);

  // Сохранение при сворачивании вкладки (гораздо надежнее beforeunload)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flush();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [flush]);

  return { status, flush };
}