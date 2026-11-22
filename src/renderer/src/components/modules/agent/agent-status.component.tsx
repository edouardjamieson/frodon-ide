import { cn } from 'cn';
import { LoaderCircle } from 'lucide-react';
import {
  useConversationKind,
  useConversationStatus,
  useConversationWaiting,
} from '~/lib/agent';
import { AgentIcon } from './agent-icon.component';

/**
 * A conversation's state, drawn as its agent's logo: a spinner until the
 * agent is up, then the logo — turning while a turn runs, with an accent dot
 * when it is waiting on a click, faded once it has ended.
 *
 * Shared by the tab and the sidebar's row, so the two never disagree about
 * which agent is stuck on a question. The dot is the reason either reads the
 * store at all: several agents at once is only workable if a glance says
 * which one is waiting for you. A dot rather than a recolored icon, because a
 * logo is not the theme's to recolor.
 */
export function ConversationIcon({ id }: { id: string }) {
  const kind = useConversationKind(id);
  const status = useConversationStatus(id);
  const waiting = useConversationWaiting(id);

  if (status === 'starting')
    return <LoaderCircle className="size-3.5 shrink-0 animate-spin" />;

  return (
    <span className="relative shrink-0">
      <AgentIcon
        kind={kind}
        className={cn('size-3.5', {
          'animate-[spin_3s_linear_infinite]': status === 'working' && !waiting,
          'opacity-40 grayscale': status === 'ended',
        })}
      />
      {waiting ? (
        <span className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-project" />
      ) : null}
    </span>
  );
}
