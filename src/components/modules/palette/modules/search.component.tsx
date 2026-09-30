import { TextAttributes } from '@opentui/core';
import { useUpDownActions } from '~/lib/utils';
import { theme } from '~/lib/theme';
import { usePaletteSearch } from './search.hook';
import {
  CommandPaletteBody,
  CommandPaletteHeader,
  CommandPaletteSearch,
} from './templates.component';

export default function PaletteModuleSearch() {
  const { results, searching, openResult, projectPath } = usePaletteSearch();

  const { index } = useUpDownActions({
    maxIndex: results.length,
    onEnter: (index) => {
      const result = results[index];
      if (result) openResult(result.path);
    },
  });

  return (
    <>
      <CommandPaletteHeader title="Search" icon="🔍" />
      <CommandPaletteSearch placeholder="Search files for a string or pattern..." />
      <CommandPaletteBody>
        <box gap={1}>
          {searching && results.length === 0 && (
            <text attributes={TextAttributes.DIM}>Searching...</text>
          )}
          {results.map((result, i) => (
            <box
              key={result.path}
              backgroundColor={
                index === i ? theme.colors.neutral[700] : undefined
              }
              onMouseDown={() => openResult(result.path)}
            >
              <box flexDirection="row" gap={1} alignItems="center">
                <text>{result.name}</text>
                <text attributes={TextAttributes.DIM}>
                  {result.count} {result.count === 1 ? 'match' : 'matches'}
                </text>
              </box>
              <text attributes={TextAttributes.DIM}>
                .{result.path.replace(projectPath, '')}
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
