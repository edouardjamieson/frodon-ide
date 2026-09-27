export interface GitBranchDialogStore {
  open: boolean;
  setOpen: (open: boolean) => void;
}

/** A selectable row in the branch dialog: switch to a branch, or create one. */
export type BranchEntry =
  | { type: 'checkout'; branch: string }
  | { type: 'create'; branch: string };
