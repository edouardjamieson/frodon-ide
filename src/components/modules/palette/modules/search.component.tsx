import fs from 'node:fs';
import { useMemo } from 'react';
import { TextAttributes } from '@opentui/core';
import { useProject } from '~/lib/project';
import type { File } from '~/lib/fs/fs.def';
import { useUpDownActions } from '~/lib/utils';
import { theme } from '~/lib/theme';
import { useWindowManagerStore } from '~/lib/window/window.store';
import { usePaletteStore } from '../palette.store';
import {
  CommandPaletteBody,
  CommandPaletteHeader,
  CommandPaletteSearch,
} from './templates.component';

interface SearchResult {
  path: string;
  name: string;
  count: number;
  preview: string;
}

const DIRS_TO_IGNORE = ['node_modules', '.git', 'build', '.next', '.vercel'];

export default function PaletteModuleSearch() {
  const { project } = useProject();
  const { search, close } = usePaletteStore();
  const files = project?.files ?? [];
  const { addWindowFile, windows, focusedWindowId } = useWindowManagerStore();

  // Flatten the project tree into a list of file paths, ignoring the usual
  // heavy directories — same traversal as the open-file module.
  const filePaths: string[] = useMemo(() => {
    const traverse = (files: File[]): string[] => {
      let paths: string[] = [];
      for (const file of files) {
        if (DIRS_TO_IGNORE.includes(file.name)) continue;

        if (file.isDir && file.children) {
          paths = [...paths, ...traverse(file.children)];
        } else if (!file.isDir) {
          paths.push(file.path);
        }
      }
      return paths;
    };

    return traverse(files);
  }, [files]);

  const results: SearchResult[] = useMemo(() => {
    const query = search.trim();
    if (!query) return [];

    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'gi');

    const matches: SearchResult[] = [];
    for (const path of filePaths) {
      let content: string;
      try {
        content = fs.readFileSync(path, 'utf8');
      } catch {
        continue;
      }

      const count = (content.match(regex) ?? []).length;
      if (count === 0) continue;

      const line =
        content.split('\n').find((l) => l.match(regex)) ?? '';

      matches.push({
        path,
        name: path.split('/').pop() ?? path,
        count,
        preview: line.trim().slice(0, 80),
      });
    }

    return matches.sort((a, b) => b.count - a.count).slice(0, 30);
  }, [filePaths, search]);

  const spawnWindow = (path: string) => {
    const w = windows.find((w) => w.id === focusedWindowId);
    addWindowFile(w?.id ?? '', path);
  };

  const { index } = useUpDownActions({
    maxIndex: results.length,
    onEnter: (index) => {
      const result = results[index];
      if (result) {
        spawnWindow(result.path);
        close();
      }
    },
  });

  return (
    <>
      <CommandPaletteHeader title="Search" icon="🔍" />
      <CommandPaletteSearch placeholder="Search files for a string or pattern..." />
      <CommandPaletteBody>
        <box gap={1}>
          {results.map((result, i) => (
            <box
              key={result.path}
              backgroundColor={
                index === i ? theme.colors.neutral[700] : undefined
              }
              onMouseDown={() => {
                spawnWindow(result.path);
                close();
              }}
            >
              <box flexDirection="row" gap={1} alignItems="center">
                <text>{result.name}</text>
                <text attributes={TextAttributes.DIM}>
                  {result.count} {result.count === 1 ? 'match' : 'matches'}
                </text>
              </box>
              <text attributes={TextAttributes.DIM}>
                .{result.path.replace(project?.path ?? '', '')}
              </text>
              {result.preview && (
                <text fg={theme.colors.neutral[600]}>{result.preview}</text>
              )}
            </box>
          ))}
        </box>
      </CommandPaletteBody>
    </>
  );
}
