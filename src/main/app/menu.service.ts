/**
 * The application menu, and the Dock's.
 *
 * It exists for one reason, and it is not the menu: **Electron's default menu
 * owns Cmd+W**. A menu accelerator is handled before the key ever reaches the
 * page, so as long as the default menu is in place `mod+w` closes the OS
 * window and the renderer never hears about it — which is the wrong thing for
 * an editor, where Cmd+W closes a tab.
 *
 * So the menu is built here instead, from Electron's own roles, with one
 * omission: the Window submenu has no `close` item. That frees the
 * accelerator for `lib/keybinding/`, which closes a tab and only closes the
 * window when there is no tab left to close.
 *
 * Everything else is kept deliberately. Dropping the menu entirely
 * (`setApplicationMenu(null)`) would have been shorter and would also have
 * taken Cmd+Q, Cmd+C and Cmd+V with it — on macOS those are menu
 * accelerators, not browser behaviour, and text fields stop working without
 * them.
 */
import { app, Menu, type MenuItemConstructorOptions } from 'electron';
import { openProjectWindow } from './window.service';

export function createMenu(): void {
  const isMac = process.platform === 'darwin';

  const template: MenuItemConstructorOptions[] = [
    // The app menu — About, Services, Hide, Quit — exists only on macOS.
    ...(isMac
      ? [{ role: 'appMenu' } as MenuItemConstructorOptions]
      : [
          {
            label: 'File',
            submenu: [{ role: 'quit' }],
          } as MenuItemConstructorOptions,
        ]),

    // Undo, cut, copy, paste, select all. Load-bearing on macOS, where these
    // are accelerators rather than anything Chromium does by itself.
    { role: 'editMenu' },
    { role: 'viewMenu' },

    {
      label: 'Window',
      submenu: [
        // No accelerator, deliberately. A menu accelerator is handled before
        // the page sees the key, so putting one here would take the chord
        // away from `lib/keybinding/` — which is the trap this whole file
        // exists because of. The chord lives in `DEFAULT_KEYBINDINGS` with
        // every other one; this is the same command with a menu in front.
        {
          label: 'New Window',
          click: () => openProjectWindow(),
        },
        { type: 'separator' },
        { role: 'minimize' },
        { role: 'zoom' },
        // No `close`. That is the whole point of this file.
        ...(isMac ? ([{ type: 'separator' }, { role: 'front' }] as const) : []),
      ] as MenuItemConstructorOptions[],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/**
 * The Dock tile's context menu. macOS only.
 *
 * Right-clicking the tile is how you ask an app on this platform for another
 * window without first bringing one to the front — which is exactly the case
 * this is for: the app is in the background, or every window is on a space
 * you are not looking at, and `mod+shift+n` would mean finding a window to
 * press it in first.
 *
 * macOS adds its own items below whatever is set here — Options, Show All
 * Windows, Quit — so this contributes the one item it has and does not
 * rebuild the rest.
 *
 * Static, and set once. The item does not name a project: New Window opens
 * the launcher, and a Dock menu that listed projects would be a second
 * recents list to keep current, in a surface that cannot show a hue or an
 * icon anyway.
 *
 * `app.dock` is undefined off macOS, which is also the platform test — there
 * is no Dock to put a menu on.
 */
export function createDockMenu(): void {
  if (process.platform !== 'darwin') return;

  app.dock?.setMenu(
    Menu.buildFromTemplate([
      // No accelerator, for the reason nothing in this file has one: it would
      // be handled before the page saw the key. See `createMenu` above.
      { label: 'New Window', click: () => openProjectWindow() },
    ])
  );
}
