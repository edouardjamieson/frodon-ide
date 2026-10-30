import { cn } from 'cn';
import {
  Check,
  FilePen,
  FileSearch,
  FileText,
  LoaderCircle,
  MessageCircleQuestion,
  SquareTerminal,
  Wrench,
  X,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type {
  AgentAction,
  AgentActionKind,
  AgentChange,
  AgentReply,
} from '@shared/agent.def';
import type { TranscriptEntry } from '~/lib/agent';
import { QuestionForm } from './agent-question.component';

/**
 * One row of a transcript.
 *
 * Every row is drawn from Frodon's vocabulary and none from an agent's: a
 * change is a diff whoever made it, a command is a command. That is the
 * point of `shared/agent.def.ts`, and the reason nothing in this folder
 * imports a driver's names.
 */
export function TranscriptRow({
  entry,
  approval,
  onRespond,
  onOpenFile,
}: {
  entry: TranscriptEntry;
  /** The open question about this action, if there is one. */
  approval: string | null;
  onRespond: (requestId: string, reply: AgentReply) => void;
  onOpenFile: (path: string) => void;
}) {
  switch (entry.kind) {
    case 'user':
      return (
        <div className="ml-8 self-end rounded-lg bg-tab-active px-3 py-2 whitespace-pre-wrap text-fg select-text">
          {entry.text}
        </div>
      );
    case 'assistant':
      return (
        <div className="whitespace-pre-wrap text-fg select-text">
          {entry.text}
        </div>
      );
    case 'notice':
      return (
        <div
          className={cn(
            'text-[13px] select-text',
            entry.tone === 'danger' ? 'text-fg-danger' : 'text-fg-subtle'
          )}
        >
          {entry.text}
        </div>
      );
    case 'action':
      return (
        <ActionCard
          action={entry.action}
          result={entry.result}
          approval={approval}
          onRespond={onRespond}
          onOpenFile={onOpenFile}
        />
      );
  }
}

const ICONS: Record<AgentActionKind, ReactNode> = {
  change: <FilePen className="size-3.5 shrink-0" />,
  command: <SquareTerminal className="size-3.5 shrink-0" />,
  read: <FileText className="size-3.5 shrink-0" />,
  search: <FileSearch className="size-3.5 shrink-0" />,
  question: <MessageCircleQuestion className="size-3.5 shrink-0" />,
  other: <Wrench className="size-3.5 shrink-0" />,
};

/**
 * A tool call: what it is, whether it is done, and — while it waits — the
 * question.
 *
 * The question sits on the card rather than in a dialog. An agent can ask
 * several things in a row and keep working in the meantime, and a modal
 * would take the whole window away from the tiles that are not asking.
 */
function ActionCard({
  action,
  result,
  approval,
  onRespond,
  onOpenFile,
}: {
  action: AgentAction;
  result: { ok: boolean; output: string } | null;
  approval: string | null;
  onRespond: (requestId: string, reply: AgentReply) => void;
  onOpenFile: (path: string) => void;
}) {
  const { path } = action;

  return (
    <div
      className={cn(
        'rounded-lg border text-[13px]',
        approval ? 'border-project/60' : 'border-pane-border'
      )}
    >
      <div className="flex min-w-0 items-center gap-2 px-2.5 py-1.5 text-fg-muted">
        {ICONS[action.kind]}
        {path ? (
          // The path is the link, not the whole row: the title can name a
          // tool and a file, and only one of those opens anything.
          <button
            onClick={() => onOpenFile(path)}
            title={`Open ${path}`}
            className="min-w-0 cursor-pointer truncate text-left hover:text-fg hover:underline"
          >
            {action.title}
          </button>
        ) : (
          <span className="min-w-0 truncate">{action.title}</span>
        )}
        <span className="ml-auto shrink-0">
          <ActionState result={result} waiting={approval !== null} />
        </span>
      </div>

      {action.command ? (
        <pre className="overflow-x-auto border-t border-pane-border px-2.5 py-1.5 font-mono text-fg select-text">
          $ {action.command}
        </pre>
      ) : null}

      {action.changes?.map((change, index) => (
        <ChangeView key={index} change={change} />
      ))}

      {result?.output ? (
        <details className="border-t border-pane-border">
          <summary className="cursor-pointer px-2.5 py-1 text-fg-subtle select-none">
            Output
          </summary>
          <pre className="max-h-60 overflow-auto px-2.5 pb-2 font-mono text-fg-muted select-text">
            {result.output}
          </pre>
        </details>
      ) : null}

      {approval && action.questions ? (
        <QuestionForm
          questions={action.questions}
          onReply={(reply) => onRespond(approval, reply)}
        />
      ) : approval ? (
        <div className="flex items-center gap-2 border-t border-pane-border px-2.5 py-1.5">
          <span className="text-fg-muted">Allow this?</span>
          <button
            onClick={() => onRespond(approval, { allow: true })}
            className="ml-auto cursor-pointer rounded-md bg-button-accent px-2.5 py-1 text-button-accent-fg transition-colors hover:bg-button-accent-hover"
          >
            Allow
          </button>
          <button
            onClick={() => onRespond(approval, { allow: false })}
            className="cursor-pointer rounded-md border border-pane-border bg-button px-2.5 py-1 text-button-fg transition-colors hover:bg-button-hover"
          >
            Deny
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ActionState({
  result,
  waiting,
}: {
  result: { ok: boolean } | null;
  waiting: boolean;
}) {
  if (waiting) return <span className="text-project">waiting</span>;
  if (!result) return <LoaderCircle className="size-3.5 animate-spin" />;
  return result.ok ? (
    <Check className="size-3.5 text-fg-success" />
  ) : (
    <X className="size-3.5 text-fg-danger" />
  );
}

/**
 * One file's change, as the two halves the agent reported.
 *
 * Not a computed diff. `before` and `after` are the exact strings swapped —
 * for an edit, a few lines on each side — so showing them whole is already
 * the minimal view, and a diff algorithm here would be a second opinion
 * about a change the agent has stated precisely.
 */
function ChangeView({ change }: { change: AgentChange }) {
  return (
    <div className="max-h-80 overflow-auto border-t border-pane-border font-mono select-text">
      {change.before ? <Lines text={change.before} sign="-" /> : null}
      <Lines text={change.after} sign="+" />
    </div>
  );
}

function Lines({ text, sign }: { text: string; sign: '-' | '+' }) {
  return (
    <pre
      className={cn(
        'px-2.5 py-1',
        sign === '-' ? 'text-git-removed' : 'text-git-added'
      )}
    >
      {text
        .split('\n')
        .map((line) => `${sign} ${line}`)
        .join('\n')}
    </pre>
  );
}
