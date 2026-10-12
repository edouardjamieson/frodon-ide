import { useProjectStore } from '~/lib/project';
import { useThemeSwitcher } from '~/lib/theme';

/**
 * The status bar, carrying a theme picker so the role -> CSS-variable
 * pipeline is visible and exercised from the first run. Switching here
 * rewrites custom properties on `:root`; nothing re-renders.
 */
export default function StatusBar() {
  const root = useProjectStore((state) => state.root);
  const { theme, themes, apply } = useThemeSwitcher();

  return (
    <footer className="flex h-6 shrink-0 items-center justify-between border-t border-border bg-status-bar px-3 text-[11px] text-fg-subtle">
      <span className="truncate">{root || 'No project open'}</span>

      <select
        value={theme.name}
        onChange={(event) => apply(event.target.value)}
        className="rounded bg-transparent px-1 text-[11px] text-fg-muted outline-none hover:text-fg"
      >
        {themes.map((candidate) => (
          <option key={candidate.name} value={candidate.name}>
            {candidate.name}
          </option>
        ))}
      </select>
    </footer>
  );
}
