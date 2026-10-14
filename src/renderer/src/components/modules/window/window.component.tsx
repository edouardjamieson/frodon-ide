import { cn } from 'cn';
import { Columns2, Rows2, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useWindow, type WindowState } from '~/lib/window';
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui';
import {
  EditorWindowBody,
  EditorWindowHeader,
} from './window-editor.component';
import {
  TerminalWindowBody,
  TerminalWindowHeader,
} from './window-terminal.component';
import { GitWindowBody, GitWindowHeader } from './window-git.component';
import { BoardWindowBody, BoardWindowHeader } from './window-board.component';
import {
  BrowserWindowBody,
  BrowserWindowHeader,
} from './window-browser.component';
import { EmptyWindowBody, EmptyWindowHeader } from './window-welcome.component';

/**
 * The frame around one window: a border, a header, and whatever module the
 * window holds.
 *
 * The frame knows three things about modules — what they draw in the header,
 * what they draw in the body, and what surface they sit on. Everything else is
 * the module's own business, which is what makes a new window type two files
 * and three cases rather than a rewrite of this one.
 *
 * The focused window's outline is the app's main "you are here" signal, so it
 * takes the accent and every other pane stays on the neutral border color.
 */
export default function Window({ window: win }: { window: WindowState }) {
  const {
    focused,
    focus,
    close,
    splitRight,
    splitDown,
    canSplitRight,
    canSplitDown,
  } = useWindow(win);

  return (
    <section
      // Capture, because the click that reaches a CodeMirror line or a tab
      // must still move focus to the window first — and `onClick` would fire
      // after the module has already acted on it.
      onMouseDownCapture={focus}
      onFocusCapture={focus}
      className={cn(
        'group/window flex h-full w-full min-w-0 flex-col overflow-hidden rounded-xl border transition-colors',
        surfaceOf(win),
        focused ? 'border-project/50' : 'border-pane-border'
      )}
    >
      <header className="flex h-9 shrink-0 items-stretch gap-1 pr-1">
        <div className="flex min-w-0 flex-1 items-stretch overflow-hidden">
          <WindowHeader window={win} />
        </div>

        {/* Hidden until the window is focused or hovered: four icon buttons on
            every pane of a nine-pane grid is a lot of chrome to look at while
            reading code. */}
        <div
          className={cn(
            'flex shrink-0 items-center gap-0.5 self-center transition-opacity',
            focused
              ? 'opacity-100'
              : 'opacity-0 group-hover/window:opacity-60 focus-within:opacity-100'
          )}
        >
          {canSplitRight ? (
            <WindowAction
              label="Split right"
              onClick={splitRight}
              shortcut={['mod', 'shift', 'right']}
            >
              <Columns2 className="size-3.5" />
            </WindowAction>
          ) : null}
          {canSplitDown ? (
            <WindowAction
              label="Split down"
              onClick={splitDown}
              shortcut={['mod', 'shift', 'down']}
            >
              <Rows2 className="size-3.5" />
            </WindowAction>
          ) : null}
          <WindowAction
            label="Close window"
            onClick={close}
            shortcut={['mod', 'w']}
          >
            <X className="size-3.5" />
          </WindowAction>
        </div>
      </header>

      <div className="min-h-0 flex-1">
        <WindowBody window={win} focused={focused} />
      </div>
    </section>
  );
}

/**
 * The module switch, written out twice rather than hidden behind a registry of
 * components: the union is discriminated, so TypeScript checks both halves and
 * names the file to open when a new window type arrives.
 */
function WindowHeader({ window: win }: { window: WindowState }) {
  switch (win.type) {
    case 'editor':
      return <EditorWindowHeader window={win} />;
    case 'terminal':
      return <TerminalWindowHeader window={win} />;
    case 'git':
      return <GitWindowHeader window={win} />;
    case 'board':
      return <BoardWindowHeader window={win} />;
    case 'browser':
      return <BrowserWindowHeader window={win} />;
    default:
      return <EmptyWindowHeader />;
  }
}

function WindowBody({
  window: win,
  focused,
}: {
  window: WindowState;
  focused: boolean;
}) {
  switch (win.type) {
    case 'editor':
      return <EditorWindowBody window={win} />;
    case 'terminal':
      // The only module that needs to know: a shell takes keystrokes, and
      // exactly one shell in the workbench may have them.
      return <TerminalWindowBody window={win} focused={focused} />;
    case 'git':
      return <GitWindowBody window={win} />;
    case 'board':
      return <BoardWindowBody window={win} />;
    case 'browser':
      return <BrowserWindowBody window={win} />;
    default:
      return <EmptyWindowBody window={win} />;
  }
}

/** The surface a module sits on, so a terminal can be themed apart from code. */
function surfaceOf(win: WindowState): string {
  switch (win.type) {
    case 'editor':
      return 'bg-editor';
    case 'terminal':
      return 'bg-terminal';
    // A tool panel, not a document: the same surface the sidebar sits on.
    case 'git':
      return 'bg-sidebar';
    // A document, like the editor — and the canvas paints its own background
    // anyway, so this only shows in the moment before it has.
    case 'board':
      return 'bg-board';
    // Chrome around someone else's page. The surface only shows in the
    // address bar and in the matte around a page pinned to a device size.
    case 'browser':
      return 'bg-browser';
    default:
      return 'bg-app';
  }
}

function WindowAction({
  label,
  onClick,
  children,
  shortcut,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  shortcut?: string[];
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          aria-label={label}
          onClick={onClick}
          className="flex size-6 cursor-pointer items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-project/20 hover:text-fg"
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" shortcut={shortcut}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
