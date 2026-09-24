import type { ReactNode } from 'react';

export interface Dialog {
  title?: string;
  description?: string;

  disableCancel?: boolean;
  disableSubmit?: boolean;

  submitText?: string;
  cancelText?: string;

  withInput?: boolean;
  inputPlaceholder?: string;
  inputDefaultValue?: string;
  inputValiationFn?: (value: string) => true | string;

  onSubmit?: (inputValue?: string) => void;
  onCancel?: () => void;
}

export interface DialogStore {
  dialog: Dialog | null;

  setDialog: (dialog: Dialog) => void;
  destroy: () => void;
}
