import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
} from 'react';
import { cn } from 'cn';
import { ArrowUp, Brain, Plus, ShieldCheck, Square } from 'lucide-react';
import {
  AGENT_ATTACHMENT_LIMIT,
  AGENT_LABELS,
  type AgentAttachment,
} from '@shared/agent.def';
import {
  imageAttachment,
  resolvePath,
  useConversation,
  useConversationLifetime,
  useFavoriteName,
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
import { FavoriteButton } from './agent-favorite.component';
import { AttachmentChip, AttachPicker } from './agent-attach.component';

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
  const favoriteName = useFavoriteName(conversationId);

  const root = useProjectStore((state) => state.root);
  const openFile = useOpenFile();
  const [draft, setDraft] = useState('');
  // Local, like the draft: what is attached to a message not yet sent
  // belongs to this composer and to nothing else.
  const [attachments, setAttachments] = useState<AgentAttachment[]>([]);
  const [picking, setPicking] = useState(false);
  const [dragging, setDragging] = useState(false);
  /** Why the last paste or drop was refused, until the next one. */
  const [refusal, setRefusal] = useState<string | null>(null);

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
  const firstMessage = conversation.entries.find(
    (entry) => entry.kind === 'user'
  );
  const working = status === 'working';
  const ended = status === 'ended';

  const sendable = !ended && (draft.trim() !== '' || attachments.length > 0);

  const submit = () => {
    if (!sendable) return;
    send(draft, attachments);
    setDraft('');
    setAttachments([]);
    setRefusal(null);
    following.current = true;
  };

  const attach = (next: AgentAttachment[]) => {
    const merged = [...attachments];
    for (const attachment of next) {
      const duplicate =
        attachment.kind === 'path' &&
        merged.some(
          (existing) =>
            existing.kind === 'path' && existing.path === attachment.path
        );
      if (!duplicate) merged.push(attachment);
    }
    if (merged.length > AGENT_ATTACHMENT_LIMIT) {
      setRefusal(
        `A message can carry ${AGENT_ATTACHMENT_LIMIT} attachments at most.`
      );
    }
    setAttachments(merged.slice(0, AGENT_ATTACHMENT_LIMIT));
  };

  /**
   * Images from a paste or a drop. Files that are not images are refused
   * with a reason rather than ignored: a dropped file that silently did
   * nothing reads as a broken drop.
   */
  const takeImages = async (files: File[]) => {
    const read = await Promise.all(files.map(imageAttachment));
    const images = read.filter(
      (item): item is AgentAttachment => typeof item !== 'string'
    );
    setRefusal(read.find((item) => typeof item === 'string') ?? null);
    attach(images);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (ended) return;
    void takeImages([...event.dataTransfer.files]);
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
        <div
          // Dropping a file anywhere else in the window would navigate the
          // page to it, so the composer claims every drag that carries
          // files, and only the composer.
          onDragOver={(event) => {
            if (!event.dataTransfer.types.includes('Files')) return;
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node))
              setDragging(false);
          }}
          onDrop={onDrop}
          className={cn(
            'relative flex flex-col gap-2 rounded-lg border border-pane-border bg-input px-2 py-1.5 focus-within:border-project/50',
            { 'border-dashed border-project/70': dragging }
          )}
        >
          {attachments.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              {attachments.map((attachment, index) => (
                <AttachmentChip
                  key={
                    attachment.kind === 'path'
                      ? attachment.path
                      : `${index}:${attachment.name}`
                  }
                  attachment={attachment}
                  onRemove={() =>
                    setAttachments((current) =>
                      current.filter((_, at) => at !== index)
                    )
                  }
                />
              ))}
            </div>
          ) : null}
          {refusal ? (
            <p className="text-[11px] text-fg-danger">{refusal}</p>
          ) : null}
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            onPaste={(event) => {
              // Only a paste that carries images is taken over; text pastes
              // as text, which is nearly every paste.
              const images = [...event.clipboardData.files].filter((file) =>
                file.type.startsWith('image/')
              );
              if (images.length === 0) return;
              event.preventDefault();
              void takeImages(images);
            }}
            disabled={ended}
            rows={Math.min(8, Math.max(1, draft.split('\n').length))}
            placeholder={
              ended
                ? 'This conversation has ended.'
                : 'Message — paste or drop a screenshot to show it'
            }
            className="min-w-0 flex-1 resize-none bg-transparent text-[14px] text-fg outline-none placeholder:text-fg-subtle"
          />
          <div className="flex items-center justify-between gap-2">
            <FavoriteButton
              kind={conversation.kind}
              session={conversation.session}
              favoriteName={favoriteName}
              suggestion={
                firstMessage?.kind === 'user'
                  ? firstMessage.text.replace(/\s+/g, ' ').slice(0, 60)
                  : null
              }
            />
            <div className="ml-auto flex items-center gap-1">
              <Button
                variant="ghost"
                size="xs"
                disabled={ended}
                onClick={() => setPicking((open) => !open)}
                className="text-fg-subtle hover:text-fg"
              >
                <Plus className="size-3.5" />
                Add
              </Button>
              {picking ? (
                <AttachPicker
                  attached={
                    new Set(
                      attachments.flatMap((attachment) =>
                        attachment.kind === 'path' ? [attachment.path] : []
                      )
                    )
                  }
                  onPick={(file) => {
                    attach([
                      { kind: 'path', path: file.path, isDir: file.isDir },
                    ]);
                    setPicking(false);
                  }}
                  onClose={() => setPicking(false)}
                />
              ) : null}
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
                    <Button onClick={submit} disabled={!sendable} size={'xs'}>
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
