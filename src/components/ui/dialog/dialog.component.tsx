import { RGBA, TextAttributes } from '@opentui/core';
import { useDialogStore } from './dialog.store';
import { theme } from '~/lib/theme';
import Button from '../button';
import { useEffect, useState } from 'react';
import { useKeyboard } from '@opentui/react';

export default function Dialogs() {
  const { dialog, destroy } = useDialogStore();

  const [inputValue, setInputValue] = useState('');

  const onCancel = () => {
    if (!dialog || dialog.disableCancel) return;
    dialog.onCancel?.();
    destroy();
  };

  const onSubmit = () => {
    if (!dialog || dialog.disableSubmit) return;
    dialog.onSubmit?.(dialog.withInput ? inputValue : undefined);
    destroy();
  };

  const submitButtonText = dialog?.submitText ?? 'Ok';
  const cancelButtonText = dialog?.cancelText ?? 'Cancel';
  const showButtons = !dialog?.disableCancel || !dialog?.disableSubmit;

  useEffect(() => {
    if (dialog?.withInput && dialog.inputDefaultValue)
      setInputValue(dialog.inputDefaultValue ?? '');
  }, [dialog]);

  useKeyboard((key) => {
    if (!dialog) return;
    if (key.name === 'return') onSubmit();
    if (key.name === 'escape') onCancel();
  });

  if (!dialog) return null;

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
        backgroundColor={RGBA.fromValues(0, 0, 0, 0.5)}
        position="absolute"
        top={0}
        left={0}
        onMouseDown={onCancel}
      />

      {/* Body */}
      <box
        backgroundColor={theme.colors.neutral[900]}
        border
        borderColor={theme.colors.neutral[700]}
        padding={1}
        width={70}
      >
        {dialog.title && <text>{dialog.title}</text>}
        {dialog.description && (
          <text attributes={TextAttributes.DIM}>{dialog.description}</text>
        )}

        {dialog.withInput && (
          <input
            value={inputValue}
            onInput={(e) => setInputValue(e)}
            backgroundColor={theme.colors.neutral[700]}
            placeholder={dialog.inputPlaceholder}
            marginTop={1}
          />
        )}

        {/* Buttons */}
        {showButtons && (
          <box
            flexDirection="row"
            alignItems="center"
            justifyContent="flex-end"
            gap={1}
            marginTop={2}
          >
            {!dialog.disableCancel && (
              <Button text={cancelButtonText} onClick={onCancel} />
            )}
            {!dialog.disableSubmit && (
              <Button color="lime" text={submitButtonText} onClick={onSubmit} />
            )}
          </box>
        )}
      </box>
    </box>
  );
}
