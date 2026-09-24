import { useWindowManagerStore } from '~/lib/window/window.store';
import type { WindowModuleProps } from './modules.def';
import { useEffect, useState } from 'react';
import { useDialog } from '~/components/ui/dialog';
import { theme } from '~/lib/theme';
import Tooltip from '~/components/ui/tooltip';
import Editor from '../../editor';
import { TextAttributes } from '@opentui/core';
import { useShortcut } from '~/lib/utils';
import { usePaletteStore } from '../../palette/palette.store';

export default function WindowEditor(props: WindowModuleProps) {
  const { window, isFocused } = props;
  const {
    getWindowFiles,
    closeWindowFile,
    isFileDirty,
    setFileDirty,
    destroy,
  } = useWindowManagerStore();
  const files = getWindowFiles(window.id);

  const { setOpen, setActiveModule, setSearch } = usePaletteStore();

  const [activeFile, setActiveFile] = useState<string | null>(null);

  const { openDialog } = useDialog();

  useEffect(() => {
    if (files.length > 0) {
      setActiveFile(files[files.length - 1]!);
    }
  }, [files.length]);

  const closeFile = (file: string) => {
    closeWindowFile(window.id, file);
    if (activeFile === file) {
      const remaining = files.filter((f) => f !== file);
      setActiveFile(remaining[remaining.length - 1] ?? null);
    }
  };

  // Closing a file with unsaved changes discards them, so confirm first.
  const requestCloseFile = (file: string) => {
    const name = file.split('/').pop() ?? file;
    if (!isFileDirty(window.id, file)) {
      closeFile(file);
      return;
    }
    openDialog({
      title: `Close "${name}" without saving?`,
      description:
        'This file has unsaved changes. Closing it now will discard them.',
      submitText: 'Discard & close',
      onSubmit: () => closeFile(file),
    });
  };

  // Opens the command palette straight to the file picker, targeting this
  // (focused) window.
  const openFilePicker = () => {
    setActiveModule('open-file');
    setSearch('');
    setOpen(true);
  };

  // Ctrl+W closes the active tab; with nothing left open the window itself goes.
  useShortcut('ctrl+w', () => {
    if (!isFocused) return;
    if (!activeFile || files.length === 0) {
      destroy(window.id);
      return;
    }
    requestCloseFile(activeFile);
  });

  return (
    <box flexGrow={1} flexDirection="column">
      <box
        flexDirection="row"
        backgroundColor={theme.colors.neutral[900]}
        flexShrink={0}
      >
        {files.map((file) => {
          const name = file.split('/').pop() ?? file;
          const isActive = file === activeFile;
          const isDirty = isFileDirty(window.id, file);
          return (
            <box
              key={file}
              flexDirection="row"
              paddingX={1}
              backgroundColor={
                isActive ? theme.colors.neutral[700] : theme.colors.neutral[800]
              }
              onMouseDown={() => setActiveFile(file)}
              marginBottom={1}
            >
              <text>{isDirty ? `${name} *` : name}</text>
              <Tooltip title="Close file" shortcut="CTRL + w">
                <text
                  fg={theme.colors.neutral[600]}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    requestCloseFile(file);
                  }}
                >
                  {'  ×'}
                </text>
              </Tooltip>
            </box>
          );
        })}
        <Tooltip title="Open a file" shortcut="CTRL + p">
          <box
            paddingX={1}
            marginBottom={1}
            backgroundColor={theme.colors.neutral[800]}
            onMouseDown={openFilePicker}
          >
            <text>{'+'}</text>
          </box>
        </Tooltip>
      </box>

      {/* Only the active file is mounted, so a single editor owns the keyboard. */}
      {activeFile ? (
        <Editor
          key={activeFile}
          filePath={activeFile}
          focused={isFocused}
          onDirtyChange={(dirty) => setFileDirty(window.id, activeFile, dirty)}
        />
      ) : (
        <box flexGrow={1} alignItems="center" justifyContent="center">
          <text attributes={TextAttributes.DIM}>
            Select a file from the explorer to start editing
          </text>
        </box>
      )}
    </box>
  );
}
