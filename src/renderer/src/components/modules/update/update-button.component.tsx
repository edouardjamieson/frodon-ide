import { RefreshCw } from 'lucide-react';
import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '~/components/ui';
import { installUpdate, useReadyUpdate } from '~/lib/update';

/**
 * "Restart to update", drawn only once there is a version to restart into.
 *
 * In the header and on the launcher both, since either can be the only thing
 * on screen. It does not ask: the tooltip says what a click costs, and a
 * confirmation in front of a button whose label already says "restart" would
 * be a second click for nothing.
 */
export default function UpdateButton() {
  const version = useReadyUpdate();
  if (!version) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0 cursor-pointer border-project/50 text-xs [-webkit-app-region:no-drag]"
          onClick={installUpdate}
        >
          <RefreshCw className="size-3.5 text-project" />
          <span>Restart to update</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        Frodon {version} is ready. Your projects reopen; unsaved edits do not
        survive.
      </TooltipContent>
    </Tooltip>
  );
}
