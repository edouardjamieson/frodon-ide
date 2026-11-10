import { useState } from 'react';
import { cn } from 'cn';
import type { AgentQuestion, AgentReply } from '@shared/agent.def';

interface Draft {
  /** The options picked, by label. */
  picked: string[];
  /** What the person wrote instead, or as well. */
  other: string;
}

/**
 * The agent's questions, as something to answer rather than to allow.
 *
 * A question is an approval with something to say — Allow alone would tell
 * the agent it may ask and then hand it no answer — so the card draws the
 * options as buttons and a line to write one's own, and replies with the
 * answers in the order asked.
 *
 * One question with one answer to pick is answered by the click: a second
 * button to confirm a single choice is a step with nothing in it. Anything
 * more — several questions, several picks, a written answer — waits for
 * Answer.
 */
export function QuestionForm({
  questions,
  onReply,
}: {
  questions: AgentQuestion[];
  onReply: (reply: AgentReply) => void;
}) {
  // Local, like the composer's draft: half an answer belongs to the card on
  // screen and to nothing else, and is gone with it.
  const [drafts, setDrafts] = useState<Draft[]>(() =>
    questions.map(() => ({ picked: [], other: '' }))
  );

  const single = questions.length === 1 && !questions[0]?.multiple;
  const answers = drafts.map(answerOf);
  const complete = answers.every((answer) => answer.length > 0);

  const change = (index: number, next: Draft): void =>
    setDrafts((current) =>
      current.map((draft, i) => (i === index ? next : draft))
    );

  const pick = (index: number, question: AgentQuestion, label: string) => {
    if (single) {
      onReply({ allow: true, answers: [label] });
      return;
    }
    const draft = drafts[index] as Draft;
    if (!question.multiple) {
      change(index, { picked: [label], other: '' });
      return;
    }
    change(index, {
      ...draft,
      picked: draft.picked.includes(label)
        ? draft.picked.filter((picked) => picked !== label)
        : [...draft.picked, label],
    });
  };

  return (
    <div className="flex flex-col gap-3 border-t border-pane-border px-2.5 py-2">
      {questions.map((question, index) => {
        const draft = drafts[index] as Draft;
        return (
          <div key={index} className="flex flex-col gap-1.5">
            <div className="flex items-baseline gap-2">
              {question.header ? (
                <span className="shrink-0 rounded-sm bg-project/15 px-1.5 text-[11px] text-project">
                  {question.header}
                </span>
              ) : null}
              <span className="text-fg">{question.question}</span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {question.options.map((option) => (
                <button
                  key={option.label}
                  title={option.description || undefined}
                  onClick={() => pick(index, question, option.label)}
                  className={cn(
                    'cursor-pointer rounded-md border px-2.5 py-1 transition-colors',
                    draft.picked.includes(option.label)
                      ? 'border-project/60 bg-project/15 text-fg'
                      : 'border-pane-border bg-button text-button-fg hover:bg-button-hover'
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <input
              value={draft.other}
              onChange={(event) =>
                change(index, {
                  // For a single choice, writing one's own replaces the pick;
                  // for several, it is one more.
                  picked: question.multiple ? draft.picked : [],
                  other: event.target.value,
                })
              }
              onKeyDown={(event) => {
                if (event.key === 'Enter' && complete) {
                  event.preventDefault();
                  onReply({ allow: true, answers });
                }
              }}
              placeholder="Or write your own answer"
              className="rounded-md border border-pane-border bg-input px-2 py-1 text-fg outline-none placeholder:text-fg-subtle focus:border-project/50"
            />
          </div>
        );
      })}

      <div className="flex items-center gap-2">
        <button
          onClick={() => onReply({ allow: true, answers })}
          disabled={!complete}
          className="ml-auto cursor-pointer rounded-md bg-button-accent px-2.5 py-1 text-button-accent-fg transition-colors hover:bg-button-accent-hover disabled:cursor-default disabled:opacity-40"
        >
          Answer
        </button>
        <button
          onClick={() => onReply({ allow: false })}
          className="cursor-pointer rounded-md border border-pane-border bg-button px-2.5 py-1 text-button-fg transition-colors hover:bg-button-hover"
        >
          Skip
        </button>
      </div>
    </div>
  );
}

/** One question's answer, as the agent will read it. */
function answerOf({ picked, other }: Draft): string {
  return [...picked, other.trim()].filter(Boolean).join(', ');
}
