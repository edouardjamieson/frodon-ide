import { useCallback, useEffect, useRef } from 'react';
import { IDLE_CHECK_MS, PURR_MS, SLEEP_AFTER_MS } from './companion.constant';
import { useCompanionStore } from './companion.store';

/**
 * The companion's moods, and the clock that puts it to sleep.
 *
 * Activity is *observed*, never handled: the listeners are passive, swallow
 * nothing and bind no key, so this is not the kind of `keydown` listener the
 * keybinding registry exists to prevent. They sit in the capture phase for
 * the same reason the registry does — xterm and CodeMirror both stop keys
 * they consume, and typing into a terminal is still being here.
 *
 * Every event only writes a timestamp into a ref. The store is touched when
 * the mood actually changes, which while you work is never: an app that
 * re-rendered the companion on every keystroke would be paying for a cat.
 */
export const useCompanion = () => {
  const mood = useCompanionStore((state) => state.mood);
  const setMood = useCompanionStore((state) => state.setMood);
  const lastActivity = useRef(0);
  const purrTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Mounting counts as activity: the clock starts when the companion
    // appears.
    lastActivity.current = Date.now();

    const onActivity = () => {
      lastActivity.current = Date.now();
      // Read through `getState` so the listeners are attached once rather
      // than torn down and re-added on every change of mood.
      if (useCompanionStore.getState().mood === 'asleep') setMood('awake');
    };

    const check = setInterval(() => {
      const idle = Date.now() - lastActivity.current;
      if (
        idle >= SLEEP_AFTER_MS &&
        useCompanionStore.getState().mood === 'awake'
      ) {
        setMood('asleep');
      }
    }, IDLE_CHECK_MS);

    const options = { capture: true, passive: true } as const;
    window.addEventListener('keydown', onActivity, options);
    window.addEventListener('pointerdown', onActivity, options);
    window.addEventListener('pointermove', onActivity, options);
    window.addEventListener('wheel', onActivity, options);

    return () => {
      clearInterval(check);
      window.removeEventListener('keydown', onActivity, options);
      window.removeEventListener('pointerdown', onActivity, options);
      window.removeEventListener('pointermove', onActivity, options);
      window.removeEventListener('wheel', onActivity, options);
    };
  }, [setMood]);

  useEffect(
    () => () => {
      if (purrTimer.current) clearTimeout(purrTimer.current);
    },
    []
  );

  /**
   * Petting restarts the purr rather than queueing another: stroking a cat
   * five times in a row is one long purr, not five short ones end to end.
   */
  const pet = useCallback(() => {
    if (purrTimer.current) clearTimeout(purrTimer.current);
    setMood('purring');
    purrTimer.current = setTimeout(() => {
      purrTimer.current = null;
      setMood('awake');
    }, PURR_MS);
  }, [setMood]);

  return { mood, pet };
};
