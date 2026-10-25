import { cn } from 'cn';
import type { ReactNode } from 'react';

/**
 * The two shapes every settings page is built from.
 *
 * Here rather than inline in each page for the ordinary reason: four pages
 * that each invent their own spacing between a label and a control is four
 * dialogs wearing one title bar. Neither of these knows anything about
 * settings — they are layout, and they hold whatever a page puts in them.
 */

/** A labelled control, with the sentence that says what it does. */
export function Field({
  label,
  hint,
  htmlFor,
  aside,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  /**
   * Something small on the label's row, at the far end — a counter, a
   * status. On the label's line rather than under the control because it
   * describes the field, and the hint below is already saying what to type.
   */
  aside?: ReactNode;
  /** Set when the control is a single input, so the label focuses it. */
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <label
          htmlFor={htmlFor}
          className="text-xs font-medium text-fg select-none"
        >
          {label}
        </label>
        {aside}
      </div>
      {children}
      {hint ? <p className="text-[11px] text-fg-subtle">{hint}</p> : null}
    </div>
  );
}

/** A run of related fields under a quiet heading. */
export function FieldGroup({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      {title ? (
        <h3 className="text-[11px] font-semibold tracking-wide text-fg-subtle uppercase">
          {title}
        </h3>
      ) : null}
      {children}
    </section>
  );
}
