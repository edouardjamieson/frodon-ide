import { cn } from 'cn';
import { Minus, Plus } from 'lucide-react';
import { Input, Switch } from '~/components/ui';
import { useEditorText, useTerminalText, useUserConfig } from '~/lib/config';
import {
  MAX_FONT_FAMILY_LENGTH,
  MAX_FONT_SIZE,
  MIN_FONT_SIZE,
  isValidFontFamily,
} from '@shared/config.def';
import { Field, FieldGroup } from './settings-field.component';

/**
 * How code is set: the face and size in the editor, the same two for the
 * terminal, and whether long lines wrap.
 *
 * Every control is live, like the theme list. The editor and every terminal
 * behind the dialog change as the field changes, which is a better preview
 * than any sample this page could draw — though it draws one anyway, because
 * the dialog covers most of what it is changing.
 *
 * The terminal's fields are *derivations of the editor's* when left empty,
 * not of the built-in defaults, and each says so in its placeholder. Most
 * people want one font for code wherever it is; the split exists for the face
 * whose ligatures read well in a file and badly in a TUI.
 */
export default function SettingsEditor() {
  const { config, update } = useUserConfig();
  const editor = useEditorText();
  const terminal = useTerminalText();

  return (
    <div className="flex flex-col gap-7">
      <Sample family={editor.fontFamily} size={editor.fontSize} />

      <FieldGroup>
        <Field
          label="Font"
          htmlFor="settings-editor-font"
          hint="Any font installed on this machine, or a list of them. The built-in monospace stack stays behind it, so a font that is missing falls back to that."
        >
          <FontInput
            id="settings-editor-font"
            value={config.editorFontFamily}
            placeholder="JetBrains Mono, SF Mono, Menlo"
            onChange={(next) => update({ editorFontFamily: next })}
          />
        </Field>

        <Field label="Size">
          <SizeStepper
            value={editor.fontSize}
            chosen={config.editorFontSize !== undefined}
            onChange={(next) => update({ editorFontSize: next })}
          />
        </Field>

        <div className="flex items-start justify-between gap-6">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="settings-editor-wrap"
              className="text-xs font-medium text-fg select-none"
            >
              Wrap long lines
            </label>
            <p className="text-[11px] text-fg-subtle">
              Fold a line at the edge of the pane instead of scrolling sideways
              to it. Markdown drawn as a page always wraps.
            </p>
          </div>
          <Switch
            id="settings-editor-wrap"
            checked={editor.wordWrap}
            // Off is the absent value, so switching it off removes the key
            // rather than writing `false` — the file stays a list of choices.
            onCheckedChange={(checked) =>
              update({ wordWrap: checked ? true : undefined })
            }
          />
        </div>
      </FieldGroup>

      <FieldGroup title="Terminal">
        <Field
          label="Font"
          htmlFor="settings-terminal-font"
          hint="Left empty, the terminal uses the editor’s font."
        >
          <FontInput
            id="settings-terminal-font"
            value={config.terminalFontFamily}
            placeholder={config.editorFontFamily ?? 'Same as the editor'}
            onChange={(next) => update({ terminalFontFamily: next })}
          />
        </Field>

        <Field label="Size">
          <SizeStepper
            value={terminal.fontSize}
            chosen={config.terminalFontSize !== undefined}
            resetLabel="Same as the editor"
            onChange={(next) => update({ terminalFontSize: next })}
          />
        </Field>
      </FieldGroup>
    </div>
  );
}

/**
 * A font-family field.
 *
 * A keystroke that would make the value something CSS should not be handed
 * is not taken, the way the icon field refuses a third letter — see
 * `isValidFontFamily`. Stored untrimmed while typing, so a space between two
 * words of a family name can be typed at all; main trims it on the way to
 * the file.
 */
function FontInput({
  id,
  value,
  placeholder,
  onChange,
}: {
  id: string;
  value: string | undefined;
  placeholder: string;
  onChange: (next: string | undefined) => void;
}) {
  return (
    <Input
      id={id}
      value={value ?? ''}
      spellCheck={false}
      autoComplete="off"
      maxLength={MAX_FONT_FAMILY_LENGTH}
      placeholder={placeholder}
      onChange={(event) => {
        const next = event.target.value;
        if (!next.trim()) return onChange(undefined);
        if (isValidFontFamily(next)) onChange(next);
      }}
    />
  );
}

/**
 * A size, a pixel at a time.
 *
 * Buttons rather than a number field, because a typed size passes through
 * values nobody means on the way to the one they do — "1" on the way to
 * "14" — and every one of them would resize every open editor and terminal.
 */
function SizeStepper({
  value,
  chosen,
  resetLabel = 'Default',
  onChange,
}: {
  /** The size in force, chosen or derived. */
  value: number;
  /** Whether the config pins it, which is when there is something to reset. */
  chosen: boolean;
  resetLabel?: string;
  onChange: (next: number | undefined) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center rounded-md border border-border">
        <StepButton
          label="Smaller"
          disabled={value <= MIN_FONT_SIZE}
          onClick={() => onChange(value - 1)}
        >
          <Minus className="size-3.5" />
        </StepButton>
        <span className="w-12 text-center font-mono text-[12px] text-fg tabular-nums">
          {value}px
        </span>
        <StepButton
          label="Larger"
          disabled={value >= MAX_FONT_SIZE}
          onClick={() => onChange(value + 1)}
        >
          <Plus className="size-3.5" />
        </StepButton>
      </div>

      <button
        type="button"
        onClick={() => onChange(undefined)}
        className={cn(
          'h-7 cursor-pointer rounded-md px-2 text-[11px] transition-colors',
          chosen
            ? 'text-fg-subtle hover:bg-project/15 hover:text-fg-muted'
            : 'bg-project/25 text-fg'
        )}
      >
        {resetLabel}
      </button>
    </div>
  );
}

function StepButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-7 cursor-pointer items-center justify-center text-fg-muted transition-colors hover:bg-row-hover hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/**
 * A few lines in the chosen face and size, with the characters that tell
 * fonts apart — `0O`, `1lI`, and the operators a ligature font redraws.
 */
function Sample({
  family,
  size,
}: {
  family: string | undefined;
  size: number;
}) {
  return (
    <pre
      aria-hidden
      style={{
        fontFamily: family ? `${family}, var(--font-mono)` : 'var(--font-mono)',
        fontSize: `${size}px`,
      }}
      className="overflow-hidden rounded-lg border border-project/15 bg-editor p-3 leading-[1.6] text-fg"
    >
      {`const ready = items.filter((x) => x.id !== 0 && x.size >= 1);\n// O0 l1I {} [] <= => === !==`}
    </pre>
  );
}
