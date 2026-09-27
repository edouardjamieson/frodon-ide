import { useGit, useGitStore } from '~/lib/git';
import { useGitBranchDialogStore } from './git-branch-dialog.store';

export const useGitBranchDialog = () => {
  const { open, setOpen } = useGitBranchDialogStore();
  const { fetchBranches, checkout, createBranch } = useGit();
  const branches = useGitStore((s) => s.branches);
  const currentBranch = useGitStore((s) => s.branch);
  const stagedFiles = useGitStore((s) => s.stagedFiles);
  const unstagedFiles = useGitStore((s) => s.unstagedFiles);

  // Modified tracked files (staged or not) are what make `git checkout` fail;
  // untracked files don't block a switch, so they're intentionally excluded.
  const changedCount = stagedFiles.length + unstagedFiles.length;
  const hasChanges = changedCount > 0;

  const openBranchDialog = () => {
    // Refresh the list before showing so it reflects branches created/deleted
    // outside the TUI since the dialog was last opened.
    fetchBranches();
    setOpen(true);
  };

  const close = () => setOpen(false);

  const switchTo = async (branch: string) => {
    // Selecting the current branch is a no-op — just dismiss.
    if (branch === currentBranch) {
      close();
      return;
    }
    // Blocked while the working tree is dirty; the dialog explains why.
    if (hasChanges) return;
    close();
    await checkout(branch);
  };

  const create = async (branch: string) => {
    close();
    await createBranch(branch);
  };

  return {
    open,
    branches,
    currentBranch,
    hasChanges,
    changedCount,
    openBranchDialog,
    close,
    switchTo,
    create,
  };
};
