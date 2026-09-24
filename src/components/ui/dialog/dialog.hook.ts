import type { Dialog } from './dialog.def';
import { useDialogStore } from './dialog.store';

export const useDialog = () => {
  const { setDialog } = useDialogStore();

  const openDialog = (dialog: Dialog) => setDialog(dialog);

  return { openDialog };
};
