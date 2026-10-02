import { useTheme } from '~/lib/theme';
import { useSidebar } from './sidebar.hook';
import { Explorer } from '../explorer';
import Tooltip from '~/components/ui/tooltip';

export default function Sidebar() {
  const { colors, icons } = useTheme();
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
      backgroundColor={colors.sidebarBg}
      border={['right']}
      borderColor={colors.border}
    >
      {/* Context switcher */}
      {showToolbar && (
        <box
          width={SIDEBAR_CONTEXT_SWITCHER_WIDTH}
          backgroundColor={colors.sidebarToolbarBg}
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
              <text fg={colors.fg}>
                {expanded ? icons.chevronRight : icons.chevronLeft}
              </text>
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
                  <text>{icons[item.icon]}</text>
                  {/* <Icon name={item.icon} color={colors.fgMuted} /> */}
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
