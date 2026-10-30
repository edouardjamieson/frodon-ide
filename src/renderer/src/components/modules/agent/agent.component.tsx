import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { cn } from 'cn';
import { ArrowUp, Brain, ShieldCheck, Square } from 'lucide-react';
import { AGENT_LABELS } from '@shared/agent.def';
import {
  resolvePath,
  useConversation,
  useConversationLifetime,
} from '~/lib/agent';
import { useProjectStore } from '~/lib/project';
import { useOpenFile } from '~/lib/window';
import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '~/components/ui';
import { TranscriptRow } from './agent-entry.component';
import { AgentIcon } from './agent-icon.component';
import { ChoicePicker } from './agent-choice.component';

interface AgentProps {
  conversationId: string;
  /** Whether this conversation is the visible tab in its window. */
  active: boolean;
}

/**
 * A conversation, on screen: the transcript, and a box to type into.
 *
 * Every conversation in a window stays mounted and an inactive one is
 * hidden, for the terminal's reason — unmounting ends the agent, and one
 * that is halfway through a refactor in the tab you clicked away from has to
 * keep going.
 */
export default function Agent({ conversationId, active }: AgentProps) {
  useConversationLifetime(conversationId);
  const { conversation, send, interrupt, respond, chooseModel, chooseMode } =
    useConversation(conversationId);

  const root = useProjectStore((state) => state.root);
  const openFile = useOpenFile();
  const [draft, setDraft] = useState('');

  const scrollRef = useRef<HTMLDivElement>(null);
  /**
   * Whether the view follows the reply as it streams. True until the person
   * scrolls up to read something, and true again once they scroll back to
   * the bottom — a transcript that yanks you down mid-sentence is worse than
   * one that makes you scroll.
   */
  const following = useRef(true);
  const entries = conversation?.entries;
  useEffect(() => {
    const element = scrollRef.current;
    if (element && following.current) element.scrollTop = element.scrollHeight;
  }, [entries]);

  if (!conversation) return null;

  const { status, approvals } = conversation;
  const working = status === 'working';
  const ended = status === 'ended';

  const submit = () => {
    if (!draft.trim() || ended) return;
    send(draft);
    setDraft('');
    following.current = true;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Shift+Enter sends and Enter breaks the line — the reverse of the chat
    // convention, on purpose: a message to an agent is a paragraph or a list
    // of steps more often than a line, and an Enter that sends cuts it off
    // halfway. Composition is excluded so confirming a word in an IME does
    // not send.
    if (
      event.key === 'Enter' &&
      event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <div
      className={cn('absolute inset-0 flex flex-col bg-editor', {
        hidden: !active,
      })}
    >
      <div
        ref={scrollRef}
        onScroll={(event) => {
          const element = event.currentTarget;
          following.current =
            element.scrollHeight - element.scrollTop - element.clientHeight <
            40;
        }}
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3 text-[14px] leading-relaxed"
      >
        {conversation.entries.length === 0 ? (
          <div className="m-auto flex flex-col items-center gap-3">
            <AgentIcon
              kind={conversation.kind}
              className={cn('size-9', {
                'animate-pulse': status === 'starting',
              })}
            />
            <p className="text-[13px] text-fg-subtle">
              {status === 'starting'
                ? `Starting ${AGENT_LABELS[conversation.kind]}…`
                : `Ask ${AGENT_LABELS[conversation.kind]} anything about this project.`}
            </p>
          </div>
        ) : null}

        {conversation.entries.map((entry) => (
          <TranscriptRow
            key={entry.id}
            entry={entry}
            approval={
              entry.kind === 'action'
                ? (approvals.find((open) => open.action.id === entry.id)
                    ?.requestId ?? null)
                : null
            }
            onRespond={respond}
            onOpenFile={(path) => openFile(resolvePath(root, path))}
          />
        ))}
      </div>

      <div className="shrink-0 border-t border-pane-border p-2">
        <div className="flex flex-col gap-2 rounded-lg border border-pane-border bg-input px-2 py-1.5 focus-within:border-project/50">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            disabled={ended}
            rows={Math.min(8, Math.max(1, draft.split('\n').length))}
            placeholder={ended ? 'This conversation has ended.' : 'Message'}
            className="min-w-0 flex-1 resize-none bg-transparent text-[14px] text-fg outline-none placeholder:text-fg-subtle"
          />
          <div className="flex items-center justify-end gap-2">
            {working ? (
              <button
                aria-label="Stop"
                onClick={interrupt}
                className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md bg-button text-button-fg transition-colors hover:bg-button-hover"
              >
                <Square className="size-3" />
              </button>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  {/* The button is the trigger itself, so the tooltip only
                    opens while it is enabled — a disabled button receives
                    no pointer events. With an empty draft the shortcut goes
                    unannounced, though the "Send" label still says what the
                    button does. */}
                  <Button
                    onClick={submit}
                    disabled={ended || !draft.trim()}
                    size={'xs'}
                  >
                    <ArrowUp className="size-3.5" />
                    Send
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" shortcut={['shift', 'enter']}>
                  Send
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>

        <div className="flex gap-1 pt-1 text-[11px] text-fg-subtle items-center">
          <div className="flex items-center border rounded-md">
            <div className="flex items-center gap-2 pl-2 py-1">
              <AgentIcon kind={conversation.kind} className="size-3" />
              <span className="text-xxs font-semibold">
                {AGENT_LABELS[conversation.kind]}
              </span>
              {conversation.version && (
                <span className="bg-project/30 text-project rounded-full text-xxs font-semibold px-1.5">
                  {conversation.version}
                </span>
              )}
            </div>
            {conversation.models.length > 0 && (
              <>
                <div className="h-[stretch] bg-border w-[1px] mx-1.5 shrink-0" />
                <ChoicePicker
                  icon={<Brain className="size-4" />}
                  choices={conversation.models}
                  selected={conversation.chosenModel}
                  fallback={conversation.model}
                  placeholder="Model"
                  disabled={ended}
                  onChoose={chooseModel}
                />
              </>
            )}
            {conversation.modes.length > 0 && (
              <>
                <div className="h-[stretch] bg-border w-[1px] mx-1.5 shrink-0" />
                {/* Unknown until the first turn: the agent's own settings
                    pick its starting mode, and it says which only once it
                    is spoken to. */}
                <ChoicePicker
                  icon={<ShieldCheck className="size-4" />}
                  choices={conversation.modes}
                  selected={conversation.mode}
                  fallback={conversation.mode}
                  placeholder="Permissions"
                  disabled={ended}
                  onChoose={chooseMode}
                />
              </>
            )}
          </div>
          {conversation.costUsd > 0 ? (
            <span className="border px-1.5 py-1 rounded-md">
              ${conversation.costUsd.toFixed(2)}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
