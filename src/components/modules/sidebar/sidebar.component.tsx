import { theme } from '~/lib/theme';
import { useSidebar } from './sidebar.hook';
import { useProject } from '~/lib/project';
import { Explorer } from '../explorer';
import Tooltip from '~/components/ui/tooltip';

export default function Sidebar() {
  const {
    SIDEBAR_WIDTH,
    SIDEBAR_CONTEXT_SWITCHER_WIDTH,
    SIDEBAR_CONTEXT_VIEW_WIDTH,
    contextSidebarItems,
    expanded,
    setExpanded,
    showToolbar,
  } = useSidebar();

  if (!showToolbar && !expanded) return null;

  return (
    <box
      width={SIDEBAR_WIDTH}
      flexDirection="row"
      backgroundColor={theme.colors.neutral[900]}
      border={['right']}
      borderColor={theme.colors.neutral[700]}
    >
      {/* Context switcher */}
      {showToolbar && (
        <box
          width={SIDEBAR_CONTEXT_SWITCHER_WIDTH}
          backgroundColor={theme.colors.neutral[800]}
          paddingY={0}
        >
          <Tooltip
            title={expanded ? 'Hide explorer' : 'Show explorer'}
            shortcut={'CTRL + b'}
            align="right"
          >
            <box
              width={'100%'}
              justifyContent="center"
              alignItems="center"
              paddingY={1}
              onMouseDown={() => setExpanded(!expanded)}
            >
              <text>{expanded ? '>' : '<'}</text>
            </box>
          </Tooltip>

          {contextSidebarItems.map((item) => {
            return (
              <Tooltip title={item.name} shortcut={item.shortcut} align="right">
                <box
                  key={item.id}
                  width={'100%'}
                  justifyContent="center"
                  alignItems="center"
                  paddingY={1}
                  onMouseDown={() => item.onClick()}
                >
                  <text>{item.icon}</text>
                </box>
              </Tooltip>
            );
          })}
        </box>
      )}

      {/* Context view */}
      {expanded && (
        <box width={SIDEBAR_CONTEXT_VIEW_WIDTH} paddingX={1} paddingY={1}>
          <Explorer />
        </box>
      )}
    </box>
  );
}
