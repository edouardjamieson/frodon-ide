import { TextAttributes, type InputRenderable } from '@opentui/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useKeyboard } from '@opentui/react';
import { useScrollbarOptions, useTheme } from '~/lib/theme';
import { useUpDownActions } from '~/lib/utils';
import type { BranchEntry } from './git-branch-dialog.def';
import { useGitBranchDialog } from './git-branch-dialog.hook';

export default function GitBranchDialog() {
  const {
    open,
    branches,
    currentBranch,
    hasChanges,
    changedCount,
    close,
    switchTo,
    create,
  } = useGitBranchDialog();

  const [query, setQuery] = useState('');
  const searchRef = useRef<InputRenderable>(null);
  const { colors, icons } = useTheme();
  const scrollbarOptions = useScrollbarOptions();

  // Reset the filter each time the dialog opens and grab focus for typing.
  useEffect(() => {
    if (open) {
      setQuery('');
      searchRef.current?.focus();
    }
  }, [open]);

  const entries: BranchEntry[] = useMemo(() => {
    const q = query.trim();
    const lower = q.toLowerCase();

    const matches = branches
      .filter((b) => b.toLowerCase().includes(lower))
      .map((b): BranchEntry => ({ type: 'checkout', branch: b }));

    // Offer to create a branch when the typed name doesn't already exist.
    const exists = branches.some((b) => b === q);
    if (q.length > 0 && !exists) {
      matches.push({ type: 'create', branch: q });
    }

    return matches;
  }, [branches, query]);

  const runEntry = (entry?: BranchEntry) => {
    if (!entry) return;
    if (entry.type === 'create') create(entry.branch);
    else switchTo(entry.branch);
  };

  const { index } = useUpDownActions({
    maxIndex: entries.length,
    onEnter: (i) => runEntry(entries[i]),
  });

  useKeyboard((key) => {
    if (open && key.name === 'escape') close();
  });

  if (!open) return null;

  return (
    <box
      width={'100%'}
      height={'100%'}
      justifyContent="center"
      alignItems="center"
      position="absolute"
      top={0}
      left={0}
      zIndex={1000}
    >
      {/* Back drop */}
      <box
        width={'100%'}
        height={'100%'}
        backgroundColor={colors.scrim}
        position="absolute"
        top={0}
        left={0}
        onMouseDown={close}
      />

      {/* Body */}
      <box
        backgroundColor={colors.overlayBg}
        border
        borderColor={colors.border}
        width={80}
      >
        <box
          flexDirection="row"
          alignItems="center"
          justifyContent="center"
          border={['bottom']}
          borderColor={colors.border}
        >
          <text fg={colors.fg}>{`${icons.gitBranch} Switch branch`}</text>
        </box>

        {hasChanges && (
          <box
            border={['bottom']}
            borderColor={colors.border}
            backgroundColor={colors.overlayElevatedBg}
            paddingX={2}
          >
            <text fg={colors.fgWarning}>
              {icons.warning} {changedCount} uncommitted{' '}
              {changedCount === 1 ? 'change' : 'changes'} — commit or stash to
              switch branches.
            </text>
            <text fg={colors.fgMuted} attributes={TextAttributes.DIM}>
              You can still create a new branch to carry your changes over.
            </text>
          </box>
        )}

        <box border={['bottom']} borderColor={colors.border} paddingX={2}>
          <input
            ref={searchRef}
            value={query}
            onInput={(v) => setQuery(v)}
            placeholder="Filter or type a new branch name..."
            backgroundColor={colors.inputBg}
          />
        </box>

        <scrollbox
          scrollY
          focusable={false}
          maxHeight={20}
          paddingX={1}
          scrollbarOptions={scrollbarOptions}
        >
          <box gap={0} paddingY={1}>
            {entries.length === 0 && (
              <text
                fg={colors.fgMuted}
                attributes={TextAttributes.DIM}
                paddingX={1}
              >
                No branches
              </text>
            )}
            {entries.map((entry, i) => {
              const isCurrent =
                entry.type === 'checkout' && entry.branch === currentBranch;
              // Switching to another branch is blocked while dirty; creating a
              // branch and selecting the current one stay available.
              const disabled =
                hasChanges && entry.type === 'checkout' && !isCurrent;

              return (
                <BranchRow
                  key={`${entry.type}:${entry.branch}`}
                  entry={entry}
                  selected={(index ?? 0) === i}
                  isCurrent={isCurrent}
                  disabled={disabled}
                  onClick={() => runEntry(entry)}
                />
              );
            })}
          </box>
        </scrollbox>
      </box>
    </box>
  );
}

function BranchRow({
  entry,
  selected,
  isCurrent,
  disabled,
  onClick,
}: {
  entry: BranchEntry;
  selected: boolean;
  isCurrent: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const { colors, icons } = useTheme();
  const dimmed = disabled ? { attributes: TextAttributes.DIM } : {};

  return (
    <box
      flexDirection="row"
      alignItems="center"
      gap={1}
      paddingX={2}
      paddingY={0}
      backgroundColor={selected ? colors.menuItemSelectedBg : undefined}
      onMouseDown={disabled ? undefined : onClick}
    >
      {entry.type === 'create' ? (
        <>
          <text fg={colors.fgAccent}>{icons.plus}</text>
          <text fg={colors.fgAccent}>Create branch </text>
          <text fg={colors.fgAccent} attributes={TextAttributes.BOLD}>
            {entry.branch}
          </text>
        </>
      ) : (
        <>
          <text fg={isCurrent ? colors.fgAccent : colors.fg} {...dimmed}>
            {isCurrent ? icons.disc : ' '}
          </text>
          <text
            attributes={
              isCurrent
                ? TextAttributes.BOLD
                : disabled
                  ? TextAttributes.DIM
                  : undefined
            }
            fg={isCurrent ? colors.fgAccent : colors.fg}
          >
            {entry.branch}
          </text>
          {isCurrent && (
            <text fg={colors.fgMuted} attributes={TextAttributes.DIM}>
              (current)
            </text>
          )}
          {disabled && <text fg={colors.fgSubtle}>{icons.blocked}</text>}
        </>
      )}
    </box>
  );
}
