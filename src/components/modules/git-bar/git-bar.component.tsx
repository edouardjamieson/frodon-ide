import { TextAttributes } from '@opentui/core';
import React from 'react';
import Button from '~/components/ui/button';
import Tooltip from '~/components/ui/tooltip';
import { useGit, useGitStore } from '~/lib/git';
import { useGitBranchDialog } from '~/components/modules/git-branch-dialog';
import { useProject } from '~/lib/project';
import { useTheme } from '~/lib/theme';

export default function GitStatusBar() {
  const { inRepo } = useGitStore();
  const { colors } = useTheme();

  if (!inRepo) return null;

  return (
    <box
      flexDirection="row"
      backgroundColor={colors.statusBarBg}
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
  const { colors, icons } = useTheme();

  return (
    <box flexDirection="row" gap={1}>
      {expanded && (
        <text fg={colors.fgMuted} attributes={TextAttributes.DIM}>
          {shortPath}
        </text>
      )}
      <text fg={colors.fgAccent}>{icons.terminal}</text>
    </box>
  );
}

function GitBarSeparator() {
  const { colors } = useTheme();
  return (
    <text fg={colors.fgSubtle} attributes={TextAttributes.DIM}>
      {'|'}
    </text>
  );
}

function GitBarBranch() {
  const { branch } = useGitStore();
  const { openBranchDialog } = useGitBranchDialog();

  return (
    <Tooltip align="top" title="Switch branch">
      <Button text={branch} onClick={openBranchDialog} />
    </Tooltip>
  );
}

function GitBarPushPull() {
  const { ahead, behind } = useGitStore();
  const { pull, push } = useGit();
  const { icons } = useTheme();
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
            <Button
              text={`${ahead} ${icons.gitPush}`}
              size="sm"
              onClick={() => push()}
            />
          </Tooltip>
        )}
        {behind > 0 && (
          <Tooltip
            align="top"
            title={`Pull ${behind} ${behind === 1 ? 'commit' : 'commits'}`}
          >
            <Button
              text={`${behind} ${icons.gitPull}`}
              size="sm"
              onClick={() => pull()}
            />
          </Tooltip>
        )}
      </box>
    </>
  );
}

function GitBarStaging() {
  const { stagedFiles, unstagedFiles, untrackedFiles, expanded } =
    useGitStore();
  const { colors } = useTheme();

  const stagedFilesCount = stagedFiles.length;
  const unStagedUnTrackedFilesCount =
    unstagedFiles.length + untrackedFiles.length;

  if (stagedFilesCount === 0 && unStagedUnTrackedFilesCount === 0) return null;

  return (
    <>
      <GitBarSeparator />
      <box flexDirection="row" gap={1}>
        {stagedFilesCount > 0 && (
          <text fg={colors.gitStagedFg}>
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
          <text fg={colors.gitChangedFg}>
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
