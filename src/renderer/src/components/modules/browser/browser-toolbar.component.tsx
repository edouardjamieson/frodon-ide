import {
  useRef,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Code2,
  LoaderCircle,
  RotateCw,
  X,
} from 'lucide-react';
import { cn } from 'cn';
import {
  isBlank,
  useSetDraft,
  useSetViewport,
  type BrowserTab,
  type Viewport,
} from '~/lib/browser';
import { BookmarkMenu, BookmarkStar } from '~/components/modules/bookmark';
import BrowserViewport from './browser-viewport.component';

/**
 * The address bar and the four buttons every browser has had since 1994.
 *
 * It sits in the body of the window rather than in its header, because the
 * header already holds the tab strip and a browser needs both rows. That also
 * puts it inside the tab it belongs to, which is what lets it talk to its own
 * guest by calling a function instead of parking a command somewhere for a
 * component in another subtree to pick up.
 *
 * The bookmarks pair sits between the address bar and the viewport picker,
 * which is the order the row is read in: where you are, what you do about
 * it, where else you could be, how big. The star takes `tab.url` and never
 * `tab.draft` — half a typed address is not a page, and a star that lit up
 * on what you were about to go to would be lying about what is saved.
 */
export default function BrowserToolbar({
  tab,
  scale,
  onNavigate,
  onBack,
  onForward,
  onReload,
  onStop,
  onToggleDevTools,
}: {
  tab: BrowserTab;
  scale: number;
  onNavigate: (input: string) => void;
  onBack: () => void;
  onForward: () => void;
  onReload: () => void;
  onStop: () => void;
  onToggleDevTools: () => void;
}) {
  const setDraft = useSetDraft();
  const setViewport = useSetViewport();
  const inputRef = useRef<HTMLInputElement>(null);

  // `about:blank` is a real URL and the guest reports it as one, but nobody
  // typed it and nobody wants to look at it.
  const shown = tab.draft ?? (isBlank(tab.url) ? '' : tab.url);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onNavigate(shown);
    inputRef.current?.blur();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Escape') return;
    // Abandons the edit and hands the bar back to the page's own URL, which is
    // what `draft: null` means.
    setDraft(tab.id, null);
    inputRef.current?.blur();
  };

  const onViewport = (viewport: Viewport | null) =>
    setViewport(tab.id, viewport);

  return (
    <div className="flex h-10 shrink-0 items-center gap-1 border-b border-pane-border bg-browser px-2">
      <NavButton label="Back" onClick={onBack} enabled={tab.canGoBack}>
        <ArrowLeft className="size-3.5" />
      </NavButton>
      <NavButton label="Forward" onClick={onForward} enabled={tab.canGoForward}>
        <ArrowRight className="size-3.5" />
      </NavButton>
      <NavButton
        label={tab.loading ? 'Stop' : 'Reload'}
        onClick={tab.loading ? onStop : onReload}
        enabled={!isBlank(tab.url) || tab.loading}
      >
        {tab.loading ? (
          <X className="size-3.5" />
        ) : (
          <RotateCw className="size-3.5" />
        )}
      </NavButton>

      <form onSubmit={submit} className="min-w-0 flex-1">
        <div className="flex h-7 items-center gap-1.5 rounded-md bg-input px-2">
          {tab.loading ? (
            <LoaderCircle className="size-3 shrink-0 animate-spin text-fg-subtle" />
          ) : null}
          <input
            ref={inputRef}
            // A tab that has not been pointed anywhere starts with the cursor
            // here, which is what every browser does on a new tab and what the
            // start page underneath is telling you to do. Only at mount, and a
            // new tab is always the active one when it is created — switching
            // between existing tabs does not remount, so this never steals
            // focus from a page you are reading.
            autoFocus={isBlank(tab.url)}
            value={shown}
            onChange={(event) => setDraft(tab.id, event.target.value)}
            onKeyDown={onKeyDown}
            onFocus={(event) => event.target.select()}
            placeholder="Enter a URL, or search"
            spellCheck={false}
            autoComplete="off"
            aria-label="Address"
            className="min-w-0 flex-1 bg-transparent text-[12px] text-fg outline-none placeholder:text-fg-subtle"
          />
        </div>
      </form>

      <BookmarkStar url={tab.url} title={tab.title} />
      <BookmarkMenu onNavigate={onNavigate} />

      <BrowserViewport
        viewport={tab.viewport}
        scale={scale}
        onChange={onViewport}
      />

      <NavButton
        label="Toggle DevTools"
        onClick={onToggleDevTools}
        enabled={!isBlank(tab.url)}
      >
        <Code2 className="size-3.5" />
      </NavButton>
    </div>
  );
}

/**
 * Disabled rather than hidden: back and forward move in and out of reach on
 * every navigation, and a row of buttons that changes width as you browse is
 * a row you have to look at to click.
 */
function NavButton({
  label,
  onClick,
  enabled,
  children,
}: {
  label: string;
  onClick: () => void;
  enabled: boolean;
  children: ReactNode;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      disabled={!enabled}
      onClick={onClick}
      className={cn(
        'flex size-7 shrink-0 items-center justify-center rounded-md text-fg-muted transition-colors',
        enabled
          ? 'cursor-pointer hover:bg-project/20 hover:text-fg'
          : 'opacity-30'
      )}
    >
      {children}
    </button>
  );
}
