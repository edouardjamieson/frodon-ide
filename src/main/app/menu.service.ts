/**
 * The application menu.
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
import { Menu, type MenuItemConstructorOptions } from 'electron';

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
        { role: 'minimize' },
        { role: 'zoom' },
        // No `close`. That is the whole point of this file.
        ...(isMac ? ([{ type: 'separator' }, { role: 'front' }] as const) : []),
      ] as MenuItemConstructorOptions[],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
