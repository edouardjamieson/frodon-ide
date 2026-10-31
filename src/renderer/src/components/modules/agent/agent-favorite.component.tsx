import { cn } from 'cn';
import { Heart } from 'lucide-react';
import type { AgentKind } from '@shared/agent.def';
import { useFavorites } from '~/lib/agent';
import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '~/components/ui';

/**
 * The heart under the composer: marks this conversation a favorite, or
 * takes it off.
 *
 * Nothing is a favorite until somebody says so. The agent already holds
 * every conversation it has had, and most of them are throwaway; a
 * favorite is the one worth finding again, by name, from the sidebar —
 * after a restart, from another window. One click, named after the first
 * thing said, because that is usually what the conversation is about; the
 * sidebar renames it.
 *
 * Offered once there is something to come back to: a conversation nobody
 * has spoken in has no transcript on the agent's side, and a favorite
 * pointing at it would reopen onto nothing.
 */
export function FavoriteButton({
  kind,
  session,
  favoriteName,
  suggestion,
}: {
  kind: AgentKind;
  /** Null while the agent is starting, or when it cannot be reopened. */
  session: string | null;
  favoriteName: string | null;
  /** The first message, as a name. Null until something has been said. */
  suggestion: string | null;
}) {
  const { add, remove } = useFavorites();
  const favorite = favoriteName !== null;
  const available = session !== null && (favorite || suggestion !== null);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* A span around the button, unlike Send's: a disabled button gets
            no pointer events, and here the tooltip is what explains why it
            is disabled. */}
        <span>
          <Button
            variant="ghost"
            size="xs"
            disabled={!available}
            aria-pressed={favorite}
            onClick={() => {
              if (!session) return;
              if (favorite) void remove(kind, session);
              else void add(kind, session, suggestion ?? '');
            }}
            className={cn('text-fg-subtle hover:text-fg', {
              'text-project hover:text-project': favorite,
            })}
          >
            <Heart className={cn('size-3.5', { 'fill-current': favorite })} />
            {favorite ? 'Favorite' : 'Add to favorites'}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">
        {!available
          ? 'Say something first — then this conversation can be a favorite'
          : favorite
            ? `Remove “${favoriteName}” from favorites`
            : 'Find it again in the sidebar, even after a restart'}
      </TooltipContent>
    </Tooltip>
  );
}
