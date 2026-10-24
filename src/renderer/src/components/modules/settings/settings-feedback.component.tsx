import { useState } from 'react';
import { cn } from 'cn';
import { Bug, Lightbulb, Send } from 'lucide-react';
import { Button, Input } from '~/components/ui';
import { useAppInfo } from '~/lib/app';
import { useUpdateStore } from '~/lib/update';
import type { UpdateState } from '@shared/update.def';
import { Field, FieldGroup } from './settings-field.component';

type FeedbackKind = 'bug' | 'idea';

/**
 * Saying something is broken, or missing.
 *
 * The form is real and the send is not: there is nowhere for it to go yet,
 * and inventing an endpoint would be worse than saying so. The button is
 * disabled with the reason written next to it rather than hidden, because a
 * form that silently swallows a bug report is the one outcome worse than no
 * form.
 *
 * What it is for in the meantime is the part underneath — the versions a
 * report needs and nobody can be expected to know. They come from `app:info`,
 * which main answers once at startup, and they are selectable so they can be
 * pasted into an issue that *does* have somewhere to go.
 */
export default function SettingsFeedback() {
  const [kind, setKind] = useState<FeedbackKind>('bug');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const info = useAppInfo();
  const update = useUpdateStore((store) => store.state);

  return (
    <div className="flex flex-col gap-7">
      <FieldGroup>
        <Field label="What is this about?">
          <div className="flex gap-2">
            <KindButton
              active={kind === 'bug'}
              onClick={() => setKind('bug')}
              icon={<Bug className="size-3.5" />}
              label="Something is broken"
            />
            <KindButton
              active={kind === 'idea'}
              onClick={() => setKind('idea')}
              icon={<Lightbulb className="size-3.5" />}
              label="Something is missing"
            />
          </div>
        </Field>

        <Field label="Summary" htmlFor="settings-feedback-subject">
          <Input
            id="settings-feedback-subject"
            value={subject}
            placeholder={
              kind === 'bug'
                ? 'The terminal loses focus when a window is split'
                : 'A command palette'
            }
            onChange={(event) => setSubject(event.target.value)}
          />
        </Field>

        <Field
          label="Details"
          htmlFor="settings-feedback-body"
          hint={
            kind === 'bug'
              ? 'What you did, what happened, and what you expected instead.'
              : 'What you were trying to do when you wanted it.'
          }
        >
          <textarea
            id="settings-feedback-body"
            value={body}
            rows={5}
            spellCheck={false}
            onChange={(event) => setBody(event.target.value)}
            className="w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm text-fg shadow-xs outline-none transition-[color,box-shadow] placeholder:text-fg-subtle focus-visible:border-project dark:bg-input/30"
          />
        </Field>

        <div className="flex items-center gap-3">
          <Button size="sm" disabled>
            <Send />
            Send
          </Button>
          <p className="text-[11px] text-fg-subtle">
            Not wired up yet — this is the shape of it, not the thing. Nothing
            typed here leaves the window.
          </p>
        </div>
      </FieldGroup>

      <FieldGroup title="Worth including">
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-[11px] select-text">
          <Fact label="Frodon" value={info?.version ?? '—'} />
          <Fact label="Updates" value={describeUpdate(update)} />
          <Fact label="Platform" value={info?.platform ?? '—'} />
          <Fact label="Electron" value={info?.versions.electron ?? '—'} />
          <Fact label="Chromium" value={info?.versions.chrome ?? '—'} />
          <Fact label="Node" value={info?.versions.node ?? '—'} />
        </dl>
      </FieldGroup>
    </div>
  );
}

function KindButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-1 cursor-pointer items-center gap-2 rounded-lg border p-2.5 text-[13px] transition-colors',
        active
          ? 'border-project/60 bg-project/10 text-fg'
          : 'border-border text-fg-muted hover:bg-row-hover'
      )}
    >
      {icon}
      {label}
    </button>
  );
}

/**
 * The updater's state in a few words. Here and nowhere else: the header only
 * ever shows the restart button, so this is where "why have I not had the
 * new version" gets its answer.
 */
function describeUpdate(state: UpdateState): string {
  switch (state.kind) {
    case 'idle':
      return 'Up to date';
    case 'downloading':
      return `Downloading ${state.version}`;
    case 'ready':
      return `${state.version} ready — restart to update`;
    case 'unsupported':
      return state.reason;
    case 'error':
      return `Last check failed: ${state.message}`;
  }
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-fg-subtle">{label}</dt>
      <dd className="text-fg-muted tabular-nums">{value}</dd>
    </>
  );
}
