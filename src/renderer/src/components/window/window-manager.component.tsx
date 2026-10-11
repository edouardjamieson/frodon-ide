import { Fragment } from 'react';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '~/components/ui';
import { MIN_PANE_SIZE, useWindowRows } from '~/lib/window';
import Window from './window.component';

/**
 * The workbench: every window, laid out.
 *
 * Rows of windows become nested resizable panel groups — a vertical group of
 * rows, each row a horizontal group of windows. This is where the TUI's
 * `useCalculateLayout` used to be, which turned each window's row/col into
 * percentage left/top/width/height by hand because a terminal has no layout
 * engine. None of that arithmetic survives: the browser sizes the panels, and
 * the splitters between them come with the library rather than being
 * simulated.
 *
 * The gutters are the splitters themselves, widened and left transparent, so
 * the gap a window is drawn inside is also the thing you grab to resize it.
 */
const GUTTER =
  'w-2 bg-transparent after:w-0.5 after:rounded-full hover:after:bg-neutral-600 aria-[orientation=horizontal]:h-2 aria-[orientation=horizontal]:w-full aria-[orientation=horizontal]:after:top-1 aria-[orientation=horizontal]:after:h-0.5 aria-[orientation=horizontal]:after:w-full';

export default function WindowManager() {
  const rows = useWindowRows();

  return (
    <ResizablePanelGroup orientation="vertical" className="min-w-0 flex-1">
      {rows.map((row, rowIndex) => (
        // Rows are positional — closing a window repacks them — so the key and
        // the panel id are the position, not an identity. The windows inside
        // keep their own ids, which is what has to stay stable.
        <Fragment key={`row-${rowIndex}`}>
          {rowIndex > 0 ? <ResizableHandle className={GUTTER} /> : null}

          <ResizablePanel id={`row-${rowIndex}`} minSize={MIN_PANE_SIZE}>
            <ResizablePanelGroup orientation="horizontal">
              {row.map((window, colIndex) => (
                <Fragment key={window.id}>
                  {colIndex > 0 ? <ResizableHandle className={GUTTER} /> : null}

                  <ResizablePanel id={window.id} minSize={MIN_PANE_SIZE}>
                    <Window window={window} />
                  </ResizablePanel>
                </Fragment>
              ))}
            </ResizablePanelGroup>
          </ResizablePanel>
        </Fragment>
      ))}
    </ResizablePanelGroup>
  );
}
