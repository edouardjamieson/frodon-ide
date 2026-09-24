import { TextAttributes } from '@opentui/core';
import React, { useMemo } from 'react';
import { useGit, useGitStore } from '~/lib/git';
import { useProject, useProjectStore } from '~/lib/project';
import { theme } from '~/lib/theme';

export default function GitStatusBar() {
  const { shortPath } = useProject();
  const {
    inRepo,
    branch,
    stagedFiles,
    unstagedFiles,
    untrackedFiles,
    ahead,
    behind,
  } = useGitStore();

  const aheadBehindStr = useMemo(() => {
    if (ahead === 0 && behind === 0) return null;
    const strings: string[] = [];

    if (ahead > 0) strings.push(`${ahead}↑`);
    if (behind > 0) strings.push(`${behind}↓`);
    return strings.join(' ');
  }, [ahead, behind]);

  if (!inRepo) return null;

  return (
    <box
      flexDirection="row"
      backgroundColor={theme.colors.neutral[900]}
      paddingX={2}
      gap={1}
    >
      <text>{shortPath}</text>
      <text attributes={TextAttributes.DIM}>{'>'}</text>
      <text>{branch}</text>
      {aheadBehindStr && (
        <text attributes={TextAttributes.DIM}>({aheadBehindStr})</text>
      )}
      <text attributes={TextAttributes.DIM}>{'|'}</text>
      {stagedFiles.length > 0 && (
        <text fg="green">{stagedFiles.length} staged files</text>
      )}
      {(unstagedFiles.length > 0 || untrackedFiles.length > 0) && (
        <text fg="yellow">
          {unstagedFiles.length + untrackedFiles.length} files changed
        </text>
      )}
    </box>
  );
}
