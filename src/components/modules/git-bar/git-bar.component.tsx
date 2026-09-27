import { TextAttributes } from '@opentui/core';
import React, { useMemo } from 'react';
import Button from '~/components/ui/button';
import Tooltip from '~/components/ui/tooltip';
import { useGit, useGitStore } from '~/lib/git';
import { useProject, useProjectStore } from '~/lib/project';
import { theme } from '~/lib/theme';

export default function GitStatusBar() {
  const { inRepo } = useGitStore();

  if (!inRepo) return null;

  return (
    <box
      flexDirection="row"
      backgroundColor={theme.colors.neutral[900]}
      paddingX={2}
      gap={1}
    >
      <GitBarPrefix />
      <GitBarBranch />
      <GitBarPushPull />
      <GitBarStaging />
    </box>
  );
}

function GitBarPrefix() {
  const { shortPath } = useProject();
  const { expanded } = useGitStore();

  return (
    <box flexDirection="row" gap={1}>
      {expanded && <text attributes={TextAttributes.DIM}>{shortPath}</text>}
      <text attributes={TextAttributes.DIM}>{'>'}</text>
    </box>
  );
}

function GitBarSeparator() {
  return <text attributes={TextAttributes.DIM}>{'|'}</text>;
}

function GitBarBranch() {
  const { branch } = useGitStore();

  return (
    <Tooltip align="top" title="Switch branch">
      <Button text={branch} />
    </Tooltip>
  );
}

function GitBarPushPull() {
  const { ahead, behind } = useGitStore();
  if (ahead === 0 && behind === 0) return null;

  return (
    <>
      <GitBarSeparator />
      <box flexDirection="row" gap={1}>
        {ahead > 0 && (
          <Tooltip
            align="top"
            title={`Push ${ahead} ${ahead === 1 ? 'commit' : 'commits'}`}
          >
            <Button text={`${ahead} ⬆️`} size="sm" />
          </Tooltip>
        )}
        {behind > 0 && (
          <Tooltip
            align="top"
            title={`Pull ${behind} ${behind === 1 ? 'commit' : 'commits'}`}
          >
            <Button text={`${behind} ⬇️`} size="sm" />
          </Tooltip>
        )}
      </box>
    </>
  );
}

function GitBarStaging() {
  const { stagedFiles, unstagedFiles, untrackedFiles, expanded } =
    useGitStore();

  const stagedFilesCount = stagedFiles.length;
  const unStagedUnTrackedFilesCount =
    unstagedFiles.length + untrackedFiles.length;

  if (stagedFilesCount === 0 && unStagedUnTrackedFilesCount === 0) return null;

  return (
    <>
      <GitBarSeparator />
      <box flexDirection="row" gap={1}>
        {stagedFilesCount > 0 && (
          <text fg="green">
            {!expanded ? (
              stagedFilesCount
            ) : (
              <>
                {stagedFilesCount} staged{' '}
                {stagedFilesCount === 1 ? 'file' : 'files'}
              </>
            )}
          </text>
        )}
        {stagedFilesCount > 0 && unStagedUnTrackedFilesCount > 0 && (
          <GitBarSeparator />
        )}
        {unStagedUnTrackedFilesCount > 0 && (
          <text fg="yellow">
            {!expanded ? (
              unStagedUnTrackedFilesCount
            ) : (
              <>
                {unStagedUnTrackedFilesCount}{' '}
                {unStagedUnTrackedFilesCount === 1 ? 'file' : 'files'} changed
              </>
            )}
          </text>
        )}
      </box>
    </>
  );
}
