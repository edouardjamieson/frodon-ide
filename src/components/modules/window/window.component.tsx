import { useWindowManagerStore } from '../../../lib/window/window.store';
import Button from '~/components/ui/button';
import {
  useCalculateLayout,
  useSpawnWindow,
  useMoveWindow,
} from '../../../lib/window/window.hook';
import { WindowType, type Window } from '~/lib/window';
import { theme } from '~/lib/theme';
import Tooltip from '~/components/ui/tooltip';
import { TextAttributes } from '@opentui/core';
import { useDialog } from '~/components/ui/dialog';
import { WindowWelcomePage, WindowEditor, WindowTerminal } from './modules';
import { useShortcut } from '~/lib/utils';
import { useEffect, useState } from 'react';
import Logger from '~/lib/logger/logger.service';

export default function WindowsManager() {
  const { windows } = useWindowManagerStore();

  return (
    <box flexGrow={1}>
      {windows.length > 0 && (
        <box position="relative" flexGrow={1}>
          {windows.map((w) => (
            <Window key={w.id} window={w} />
          ))}
        </box>
      )}
    </box>
  );
}

function Window({ window }: { window?: Window }) {
  if (!window) return null;
  const {
    getWindowLayout,
    getWindowBorders,
    layout,
    getPossibleMoveDirections,
  } = useCalculateLayout();
  const {
    focusedWindowId,
    setFocusedWindowId,
    windows,
    setWindowName,
    destroy,
  } = useWindowManagerStore();
  const { spawn } = useSpawnWindow();
  const { moveWindow } = useMoveWindow(window);
  const { openDialog } = useDialog();
  const { left, top, width, height } = getWindowLayout(window);
  const showWelcomePage = !window.type;

  const possibleMoveDirections = getPossibleMoveDirections(window);
  const [moveButtonsVisible, setMoveButtonsVisible] = useState(false);

  // Typed windows close their active tab from within their module; an untyped
  // (welcome) window has nothing to close, so Ctrl+W destroys it outright.
  useShortcut('ctrl+w', () => {
    if (focusedWindowId !== window.id || window.type) return;
    destroy(window.id);
  });

  const windowName = window.title ?? 'Untitled window';
  const isFocused = focusedWindowId === window.id;

  const focusedWindow = windows.find((w) => w.id === focusedWindowId);
  const focusedWindowName = focusedWindow?.title ?? 'Untitled window';

  const renderModule = () => {
    switch (window.type) {
      case WindowType.CODE_EDITOR:
        return <WindowEditor window={window} isFocused={isFocused} />;

      case WindowType.TERMINAL:
        return <WindowTerminal window={window} isFocused={isFocused} />;

      default:
        return null;
    }
  };

  if (!focusedWindow) return null;

  return (
    <box
      left={`${left}%`}
      top={`${top}%`}
      width={`${width}%`}
      height={`${height}%`}
      position="absolute"
      onMouseDown={() => setFocusedWindowId(window.id)}
      border={getWindowBorders(window)}
      borderColor={theme.colors.neutral[700]}
    >
      <box flexShrink={0} paddingX={1} flexDirection="row" gap={2} zIndex={10}>
        <text attributes={isFocused ? TextAttributes.BOLD : TextAttributes.DIM}>
          {windowName}
        </text>
        {isFocused && (
          <box flexDirection="row" alignItems="center" gap={1} flexGrow={1}>
            {/* Split horizontal */}
            <Tooltip title="Split horizontal" align="bottom">
              <Button
                text="]["
                size="sm"
                onClick={() => {
                  spawn(
                    focusedWindow.rowIndex,
                    layout[focusedWindow.rowIndex] ?? 0
                  );
                }}
              />
            </Tooltip>
            {/* Split vertical */}
            <Tooltip title="Split vertical" align="bottom">
              <Button
                text="="
                size="sm"
                onClick={() => {
                  spawn(layout.length, 0);
                }}
              />
            </Tooltip>
            {/* Rename */}
            <Tooltip title="Rename window" align="bottom">
              <Button
                text="✏️"
                size="sm"
                onClick={() =>
                  openDialog({
                    title: `Rename "${focusedWindowName}"`,
                    withInput: true,
                    inputPlaceholder: 'My awesome window',
                    inputDefaultValue: focusedWindow?.title ?? '',
                    onSubmit: (inputValue) =>
                      setWindowName(focusedWindow.id, inputValue ?? ''),
                  })
                }
              />
            </Tooltip>
            {/* Close */}
            <Tooltip title="Close window" align="bottom">
              <Button
                text="❌"
                size="sm"
                onClick={() => {
                  openDialog({
                    title: `Close "${focusedWindowName}" ?`,
                    description:
                      'All your active editors and terminals in this window will be terminated.',
                    onSubmit: () => destroy(focusedWindow.id),
                  });
                }}
              />
            </Tooltip>

            {/* Move */}
            {(possibleMoveDirections.x !== null ||
              possibleMoveDirections.y !== null) && (
              <box marginLeft={'auto'}>
                <Tooltip
                  title={moveButtonsVisible ? 'Cancel' : 'Move window'}
                  align="bottom"
                  disabled={moveButtonsVisible}
                >
                  <box position="relative" zIndex={10}>
                    <Button
                      text={moveButtonsVisible ? '⛔️' : '⏺️'}
                      size="sm"
                      onClick={() => setMoveButtonsVisible((prev) => !prev)}
                    />
                    {moveButtonsVisible && (
                      <>
                        {possibleMoveDirections.x !== null &&
                          possibleMoveDirections.x <= 0 && (
                            <text
                              position="absolute"
                              right={'100%'}
                              onMouseDown={() => {
                                moveWindow('left');
                                setMoveButtonsVisible(false);
                              }}
                            >
                              ◀️
                            </text>
                          )}
                        {possibleMoveDirections.x !== null &&
                          possibleMoveDirections.x >= 0 && (
                            <text
                              position="absolute"
                              left={'100%'}
                              onMouseDown={() => {
                                moveWindow('right');
                                setMoveButtonsVisible(false);
                              }}
                            >
                              ▶️
                            </text>
                          )}
                        {possibleMoveDirections.y !== null &&
                          possibleMoveDirections.y <= 0 && (
                            <text
                              position="absolute"
                              bottom={'100%'}
                              onMouseDown={() => {
                                moveWindow('up');
                                setMoveButtonsVisible(false);
                              }}
                            >
                              🔼
                            </text>
                          )}

                        {possibleMoveDirections.y !== null &&
                          possibleMoveDirections.y >= 0 && (
                            <text
                              position="absolute"
                              top={'100%'}
                              onMouseDown={() => {
                                moveWindow('down');
                                setMoveButtonsVisible(false);
                              }}
                            >
                              🔽
                            </text>
                          )}
                      </>
                    )}
                  </box>
                </Tooltip>
              </box>
            )}
          </box>
        )}
      </box>
      {showWelcomePage && (
        <WindowWelcomePage window={window} isFocused={isFocused} />
      )}
      {renderModule()}
    </box>
  );
}
