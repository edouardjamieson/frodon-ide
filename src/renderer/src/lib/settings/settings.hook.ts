import { useSettingsStore } from './settings.store';

/** Whether the dialog is open, which page it is on, and how to change both. */
export const useSettings = () => {
  const open = useSettingsStore((state) => state.open);
  const section = useSettingsStore((state) => state.section);
  const setSection = useSettingsStore((state) => state.setSection);
  const close = useSettingsStore((state) => state.close);

  return { open, section, setSection, close };
};

/** Opening it from anywhere: a rail button, a badge, a chord. */
export const useOpenSettings = () =>
  useSettingsStore((state) => state.openSettings);
