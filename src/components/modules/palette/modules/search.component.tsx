import { TextAttributes } from '@opentui/core';
import { useUpDownActions } from '~/lib/utils';
import { useTheme } from '~/lib/theme';
import { usePaletteSearch } from './search.hook';
import {
  CommandPaletteBody,
  CommandPaletteHeader,
  CommandPaletteSearch,
} from './templates.component';

export default function PaletteModuleSearch() {
  const { results, searching, openResult, projectPath } = usePaletteSearch();
  const { colors } = useTheme();

  const { index } = useUpDownActions({
    maxIndex: results.length,
    onEnter: (index) => {
      const result = results[index];
      if (result) openResult(result.path);
    },
  });

  return (
    <>
      <CommandPaletteHeader title="Search" icon="search" />
      <CommandPaletteSearch placeholder="Search files for a string or pattern..." />
      <CommandPaletteBody>
        <box gap={1}>
          {searching && results.length === 0 && (
            <text fg={colors.fgMuted} attributes={TextAttributes.DIM}>
              Searching...
            </text>
          )}
          {results.map((result, i) => (
            <box
              key={result.path}
              backgroundColor={
                index === i ? colors.menuItemSelectedBg : undefined
              }
              onMouseDown={() => openResult(result.path)}
            >
              <box flexDirection="row" gap={1} alignItems="center">
                <text fg={colors.fg}>{result.name}</text>
                <text fg={colors.fgMuted} attributes={TextAttributes.DIM}>
                  {result.count} {result.count === 1 ? 'match' : 'matches'}
                </text>
              </box>
              <text fg={colors.fgMuted} attributes={TextAttributes.DIM}>
                .{result.path.replace(projectPath, '')}
              </text>
              {result.preview && (
                <text fg={colors.fgSubtle}>{result.preview}</text>
              )}
            </box>
          ))}
        </box>
      </CommandPaletteBody>
    </>
  );
}
