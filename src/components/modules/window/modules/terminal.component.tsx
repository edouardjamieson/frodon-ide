import { useWindowManagerStore } from '~/lib/window/window.store';
import type { WindowModuleProps } from './modules.def';
import { useEffect, useRef, useState } from 'react';
import { theme } from '~/lib/theme';
import Tooltip from '~/components/ui/tooltip';
import Terminal from '../../terminal';
import { TextAttributes } from '@opentui/core';
import { useShortcut } from '~/lib/utils';

export default function WindowTerminal(props: WindowModuleProps) {
  const { window, isFocused } = props;
  const {
    getWindowTerminals,
    addWindowTerminal,
    closeWindowTerminal,
    destroy,
    setFocusedWindowId,
  } = useWindowManagerStore();
  const sessions = getWindowTerminals(window.id);

  const [activeSession, setActiveSession] = useState<string | null>(null);

  // Seed the first shell once when the window becomes a terminal. Guarded so
  // that closing every tab later leaves the empty state instead of respawning.
  const seeded = useRef(false);
  useEffect(() => {
    if (!seeded.current && sessions.length === 0) {
      seeded.current = true;
      setActiveSession(addWindowTerminal(window.id));
    }
  }, []);

  // Keep the selection pointing at a live session; `openSession`, the seed, and
  // `closeSession` set it explicitly, so this only recovers from a stale id.
  useEffect(() => {
    if (activeSession && sessions.includes(activeSession)) return;
    setActiveSession(sessions[sessions.length - 1] ?? null);
  }, [sessions.length]);

  const openSession = () => {
    setActiveSession(addWindowTerminal(window.id));
  };

  const closeSession = (session: string) => {
    closeWindowTerminal(window.id, session);
    if (activeSession === session) {
      const remaining = sessions.filter((s) => s !== session);
      setActiveSession(remaining[remaining.length - 1] ?? null);
    }
  };

  // Ctrl+W closes the active tab; with no session left the window itself goes.
  useShortcut('ctrl+w', () => {
    if (!isFocused) return;
    if (!activeSession || sessions.length === 0) {
      destroy(window.id);
      return;
    }
    closeSession(activeSession);
  });

  return (
    <box flexGrow={1} flexDirection="column">
      <box
        flexDirection="row"
        backgroundColor={theme.colors.neutral[900]}
        flexShrink={0}
      >
        {sessions.map((session, index) => {
          const isActive = session === activeSession;
          return (
            <box
              key={session}
              flexDirection="row"
              paddingX={1}
              backgroundColor={
                isActive ? theme.colors.neutral[700] : theme.colors.neutral[800]
              }
              onMouseDown={() => setActiveSession(session)}
              marginBottom={1}
            >
              <text>{`Terminal ${index + 1}`}</text>
              <Tooltip title="Close terminal">
                <text
                  fg={theme.colors.neutral[600]}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    closeSession(session);
                  }}
                >
                  {'  ×'}
                </text>
              </Tooltip>
            </box>
          );
        })}
        <Tooltip title="New terminal">
          <box
            paddingX={1}
            marginBottom={1}
            backgroundColor={theme.colors.neutral[800]}
            onMouseDown={openSession}
          >
            <text>{'+'}</text>
          </box>
        </Tooltip>
      </box>

      {/* Every session stays mounted so its shell keeps running; only the
          active one is visible (the rest are laid out with `display: none`). */}
      {sessions.length > 0 ? (
        <box position="relative" flexGrow={1}>
          {sessions.map((session) => {
            const isActive = session === activeSession;
            return (
              <Terminal
                key={session}
                active={isActive}
                focused={isFocused && isActive}
                onFocusRequest={() => setFocusedWindowId(window.id)}
              />
            );
          })}
        </box>
      ) : (
        <box flexGrow={1} alignItems="center" justifyContent="center">
          <text attributes={TextAttributes.DIM}>
            No open terminals — press + to start a new session
          </text>
        </box>
      )}
    </box>
  );
}
