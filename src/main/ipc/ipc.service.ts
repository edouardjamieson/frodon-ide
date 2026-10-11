/**
 * The typed wrapper around `ipcMain.handle`.
 *
 * Nothing in the app calls `ipcMain.handle` directly. Going through `handle`
 * means the channel name is checked against `IpcContract`, the handler's
 * argument is typed from `Req`, and its return value is checked against `Res`
 * — so a channel whose payload changes fails to compile on both sides at once
 * instead of failing at runtime in a packaged build.
 *
 * It also centralises error translation. An exception thrown in a handler
 * crosses the boundary as an opaque `Error: Error invoking remote method ...`,
 * which tells the renderer nothing. Logging it here with its channel keeps the
 * real stack where someone can read it.
 *
 * The invoke event is passed through as a second argument for the handlers
 * that need to know *which* window asked — a terminal's output belongs to the
 * window that spawned it, not to everyone. Most handlers ignore it.
 */
import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { createLogger } from '@main/logger';
import type { Channel, Req, Res } from '@shared/ipc.def';

const log = createLogger('ipc');

export function handle<C extends Channel>(
  channel: C,
  handler: (req: Req<C>, event: IpcMainInvokeEvent) => Res<C> | Promise<Res<C>>
): void {
  ipcMain.handle(channel, async (event, req: Req<C>) => {
    try {
      return await handler(req, event);
    } catch (error) {
      log.error(`${channel} failed`, error);
      throw error;
    }
  });
}
