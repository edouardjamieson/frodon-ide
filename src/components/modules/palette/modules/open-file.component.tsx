import { useProject } from '~/lib/project';
import { usePaletteStore } from '../palette.store';
import { useWindowManagerStore } from '~/lib/window/window.store';
import { useMemo } from 'react';
import { flattenFiles } from '~/lib/fs';
import { useUpDownActions } from '~/lib/utils';
import { useTheme } from '~/lib/theme';
import { TextAttributes } from '@opentui/core';
import {
  CommandPaletteBody,
  CommandPaletteHeader,
  CommandPaletteSearch,
} from './templates.component';

export default function PaletteModuleOpenFile() {
  const { project } = useProject();
  const { search, close } = usePaletteStore();
  const { colors } = useTheme();
  const files = project?.files ?? [];
  const { addWindowFile, windows, focusedWindowId } = useWindowManagerStore();

  // The tree arrives already filtered by `files.exclude`, so this is a flatten
  // and nothing more -- the ignore list this used to carry is gone.
  const searchKeys: Record<string, string> = useMemo(() => {
    const records: Record<string, string> = {};
    for (const file of flattenFiles(files)) records[file.path] = file.name;
    return records;
  }, [files]);

  const searchEntries: Record<string, string> = useMemo(() => {
    const keys = Object.keys(searchKeys);

    // No search: keep the natural order, capped.
    if (!search.trim()) {
      const entries: Record<string, string> = {};
      for (const key of keys.slice(0, 30)) {
        entries[key] = searchKeys[key] ?? '';
      }
      return entries;
    }

    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'gi');

    const scored = keys
      .map((key) => ({ key, count: (key.match(regex) ?? []).length }))
      .filter((s) => s.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 30);

    const entries: Record<string, string> = {};
    for (const { key } of scored) {
      entries[key] = searchKeys[key] ?? '';
    }
    return entries;
  }, [searchKeys, search]);

  const spawnWindow = (path: string) => {
    const w = windows.find((w) => w.id === focusedWindowId);
    // Logger.log(w, true);
    addWindowFile(w?.id ?? '', path);
  };

  const { index } = useUpDownActions({
    maxIndex: Object.keys(searchEntries).length,
    onEnter: (index) => {
      const path = Object.keys(searchEntries)[index];
      if (path) {
        spawnWindow(path);
        close();
      }
    },
  });

  return (
    <>
      <CommandPaletteHeader title="Open file" icon="document" />
      <CommandPaletteSearch />
      <CommandPaletteBody>
        <box gap={1}>
          {Object.entries(searchEntries).map(([path, name], i) => (
            <box
              key={path}
              backgroundColor={
                index === i ? colors.menuItemSelectedBg : undefined
              }
              onMouseDown={() => {
                spawnWindow(path);
                close();
              }}
            >
              <text fg={colors.fg}>{name}</text>
              <text fg={colors.fgMuted} attributes={TextAttributes.DIM}>
                .{path.replace(project?.path ?? '', '')}
              </text>
            </box>
          ))}
        </box>
      </CommandPaletteBody>
    </>
  );
}
