import { useState } from 'react';
import { cn } from 'cn';
import { Bug, ExternalLink, Lightbulb } from 'lucide-react';
import { Button, Input } from '~/components/ui';
import { useAppInfo } from '~/lib/app';
import { useUpdateStore } from '~/lib/update';
import { describeUpdate } from '@shared/update.def';
import {
  MAX_FEEDBACK_DETAILS_LENGTH,
  MAX_FEEDBACK_TITLE_LENGTH,
  type FeedbackKind,
} from '@shared/feedback.def';
import { Field, FieldGroup } from './settings-field.component';

/** Where the last press of the button got to. */
type Handoff = 'idle' | 'opening' | 'opened' | 'failed';

/**
 * Saying something is broken, or missing.
 *
 * The button opens a GitHub issue in the browser rather than sending
 * anything. There is no server behind this app, and the repository's issue
 * tracker is already where a report can be read, answered and closed — see
 * `main/feedback/`. The form's job is to arrive there with the title, the
 * details and the versions already in place, so the person's last step is
 * reading what they are about to post and pressing Submit on it.
 *
 * The versions underneath stay on screen. They are what goes at the bottom of
 * the issue, and showing them here is what makes it no surprise when they
 * turn up there.
 */
export default function SettingsFeedback() {
  const [kind, setKind] = useState<FeedbackKind>('bug');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [handoff, setHandoff] = useState<Handoff>('idle');
  const info = useAppInfo();
  const update = useUpdateStore((store) => store.state);

  const open = async () => {
    setHandoff('opening');
    try {
      const { ok } = await window.frodon.app.reportIssue({
        kind,
        title: subject,
        details: body,
      });
      setHandoff(ok ? 'opened' : 'failed');
    } catch {
      setHandoff('failed');
    }
  };

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
            maxLength={MAX_FEEDBACK_TITLE_LENGTH}
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
            maxLength={MAX_FEEDBACK_DETAILS_LENGTH}
            spellCheck={false}
            onChange={(event) => setBody(event.target.value)}
            className="w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm text-fg shadow-xs outline-none transition-[color,box-shadow] placeholder:text-fg-subtle focus-visible:border-project dark:bg-input/30"
          />
        </Field>

        <div className="flex items-center gap-3">
          <Button
            size="sm"
            disabled={!subject.trim() || handoff === 'opening'}
            onClick={() => void open()}
          >
            <ExternalLink />
            Open on GitHub
          </Button>
          <p className="text-[11px] text-fg-subtle">{HANDOFF_NOTES[handoff]}</p>
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

/**
 * What the line beside the button says.
 *
 * The idle sentence is the important one: it says the report is not sent
 * from here *before* the button is pressed, so nobody presses it expecting a
 * "thanks" and gets a browser instead.
 */
const HANDOFF_NOTES: Record<Handoff, string> = {
  idle: 'Opens a new issue in your browser with all of this filled in. Nothing is posted until you submit it there.',
  opening: 'Opening your browser…',
  opened: 'Opened in your browser. Read it over, then submit it there.',
  failed:
    'Could not open your browser. The versions below are selectable, to paste into an issue by hand.',
};

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

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-fg-subtle">{label}</dt>
      <dd className="text-fg-muted tabular-nums">{value}</dd>
    </>
  );
}
