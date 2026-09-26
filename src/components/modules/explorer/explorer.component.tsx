import { TextAttributes } from '@opentui/core';
import type { ReactNode } from 'react';
import type { File } from '~/lib/fs/fs.def';
import { useProject } from '~/lib/project';
import { theme } from '~/lib/theme';
import {
  useExplorer,
  useExplorerActions,
  useExplorerNode,
} from './explorer.hook';
import Tooltip from '~/components/ui/tooltip';
import { useSidebarStore } from '../sidebar/sidebar.store';

export default function Explorer() {
  const { project } = useProject();
  const { maxDeepness } = useExplorer();

  return (
    <box flexGrow={1}>
      <ExplorerToolbar />
      <scrollbox scrollX scrollY focusable={false} flexGrow={1}>
        <box width={maxDeepness * 8}></box>
        {project?.files.map((f) => (
          <ExplorerNode key={f.path} file={f} level={0} />
        ))}
      </scrollbox>
    </box>
  );
}

function ExplorerToolbar() {
  const { newFile, newFolder, rename, remove, hasSelection } =
    useExplorerActions();

  return (
    <box flexDirection="row" gap={1} marginBottom={1}>
      <ToolbarButton title="New file" onClick={newFile}>
        +📄
      </ToolbarButton>
      <ToolbarButton title="New folder" onClick={newFolder}>
        +📁
      </ToolbarButton>
      <ToolbarButton title="Rename" onClick={rename} disabled={!hasSelection}>
        ✏️
      </ToolbarButton>
      <ToolbarButton title="Delete" onClick={remove} disabled={!hasSelection}>
        🗑
      </ToolbarButton>
    </box>
  );
}

interface ToolbarButtonProps {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}

function ToolbarButton({
  title,
  onClick,
  disabled,
  children,
}: ToolbarButtonProps) {
  return (
    <Tooltip title={title} align="bottom">
      <box
        paddingX={1}
        backgroundColor={theme.colors.neutral[800]}
        onMouseDown={(e) => {
          e.stopPropagation();
          if (!disabled) onClick();
        }}
      >
        <text
          attributes={disabled ? TextAttributes.DIM : undefined}
          fg={disabled ? theme.colors.neutral[500] : undefined}
        >
          {children}
        </text>
      </box>
    </Tooltip>
  );
}

function ExplorerNode({ file, level }: { file: File; level: number }) {
  const { isToggled, isSelected, onMouseDown, isFileOpened, gitStatus } =
    useExplorerNode(file);
  const { showIcons } = useSidebarStore();

  const backgroundColor = isSelected
    ? theme.colors.neutral[600]
    : isFileOpened
      ? theme.colors.neutral[700]
      : undefined;

  // Git status colors take precedence so a changed file stays visibly marked
  // even when open or selected.
  const gitColor =
    gitStatus === 'staged'
      ? 'green'
      : gitStatus === 'changed'
        ? 'yellow'
        : null;
  const fg =
    gitColor ??
    (isFileOpened || isToggled || isSelected
      ? 'white'
      : theme.colors.neutral[300]);

  return (
    <box
      paddingLeft={level * 1}
      border={level === 0 ? false : ['left']}
      borderColor={level === 0 ? undefined : theme.colors.neutral[700]}
      onMouseDown={(e) => {
        e.stopPropagation();
        onMouseDown();
      }}
      position={level === 0 ? 'relative' : 'static'}
      backgroundColor={backgroundColor}
    >
      <box flexDirection="row" gap={1}>
        {file.isDir && (
          <text attributes={TextAttributes.DIM}>{isToggled ? 'v' : '>'}</text>
        )}
        {file.isDir && showIcons && <text>📁</text>}
        <text
          wrapMode="none"
          attributes={isToggled ? TextAttributes.BOLD : undefined}
          fg={fg}
        >
          {file.name}
        </text>
      </box>
      {file.isDir &&
        isToggled &&
        file.children?.map((c) => (
          <ExplorerNode key={c.path} file={c} level={level + 1} />
        ))}

      {isToggled && (
        <box
          position="absolute"
          width={'100%'}
          left={0}
          top={0}
          backgroundColor={theme.colors.neutral[800]}
          zIndex={-1}
        />
      )}
    </box>
  );
}
