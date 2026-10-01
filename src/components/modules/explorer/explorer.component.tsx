import { TextAttributes } from '@opentui/core';
import type { File } from '~/lib/fs/fs.def';
import { useProject } from '~/lib/project';
import { useTheme, useScrollbarOptions, type IconName } from '~/lib/theme';
import {
  useExplorer,
  useExplorerActions,
  useExplorerNode,
} from './explorer.hook';
import Tooltip from '~/components/ui/tooltip';
import Icon, { resolveFileIcon } from '~/components/ui/icon';
import { useSidebarStore } from '../sidebar/sidebar.store';

export default function Explorer() {
  const { project } = useProject();
  const { maxDeepness } = useExplorer();
  const scrollbarOptions = useScrollbarOptions();

  return (
    <box flexGrow={1}>
      <ExplorerToolbar />
      <scrollbox
        scrollX
        scrollY
        focusable={false}
        flexGrow={1}
        scrollbarOptions={scrollbarOptions}
      >
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
      <ToolbarButton title="New file" icon="newFile" onClick={newFile} />
      <ToolbarButton title="New folder" icon="newFolder" onClick={newFolder} />
      <ToolbarButton
        title="Rename"
        icon="rename"
        onClick={rename}
        disabled={!hasSelection}
      />
      <ToolbarButton
        title="Delete"
        icon="delete"
        onClick={remove}
        disabled={!hasSelection}
      />
    </box>
  );
}

interface ToolbarButtonProps {
  title: string;
  icon: IconName;
  onClick: () => void;
  disabled?: boolean;
}

function ToolbarButton({ title, icon, onClick, disabled }: ToolbarButtonProps) {
  const { colors } = useTheme();

  return (
    <Tooltip title={title} align="bottom">
      <box
        paddingX={1}
        backgroundColor={colors.buttonBg}
        onMouseDown={(e) => {
          e.stopPropagation();
          if (!disabled) onClick();
        }}
      >
        <Icon name={icon} color={disabled ? colors.fgSubtle : colors.fg} />
      </box>
    </Tooltip>
  );
}

function ExplorerNode({ file, level }: { file: File; level: number }) {
  const { isToggled, isSelected, onMouseDown, isFileOpened, gitStatus } =
    useExplorerNode(file);
  const { showIcons } = useSidebarStore();
  const { colors, icons } = useTheme();

  const backgroundColor = isSelected
    ? colors.explorerRowSelectedBg
    : isFileOpened
      ? colors.explorerRowOpenBg
      : undefined;

  // Git status colors take precedence so a changed file stays visibly marked
  // even when open or selected.
  const gitColor =
    gitStatus === 'staged'
      ? colors.gitStagedFg
      : gitStatus === 'changed'
        ? colors.gitChangedFg
        : null;
  const fg =
    gitColor ??
    (isFileOpened || isToggled || isSelected
      ? colors.explorerActiveFg
      : colors.explorerFileFg);

  return (
    <box
      paddingLeft={level * 1}
      border={level === 0 ? false : ['left']}
      borderColor={level === 0 ? undefined : colors.explorerIndentBorder}
      onMouseDown={(e) => {
        e.stopPropagation();
        onMouseDown();
      }}
      position={level === 0 ? 'relative' : 'static'}
      backgroundColor={backgroundColor}
    >
      <box flexDirection="row" gap={1}>
        {file.isDir && (
          <text fg={colors.fgSubtle} attributes={TextAttributes.DIM}>
            {isToggled ? icons.chevronDown : icons.chevronRight}
          </text>
        )}
        {file.isDir && showIcons && (
          <Icon name={resolveFileIcon(file, isToggled)} color={fg} />
        )}
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
          backgroundColor={colors.explorerDirExpandedBg}
          zIndex={-1}
        />
      )}
    </box>
  );
}
