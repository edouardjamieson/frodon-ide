/**
 * A report a person wants to make, on its way to becoming a GitHub issue.
 *
 * There is no server behind Frodon and there is not going to be one, so a
 * report goes where the project already takes them: the repository's issue
 * tracker, opened in the person's own browser with the form filled in. They
 * see exactly what is about to be posted, under their own account, and can
 * change any of it before pressing the button that sends it.
 */

export type FeedbackKind = 'bug' | 'idea';

export const FEEDBACK_KINDS: readonly FeedbackKind[] = ['bug', 'idea'];

export interface FeedbackReport {
  kind: FeedbackKind;
  /** Becomes the issue's title. */
  title: string;
  /** Becomes the top of the issue's body, above the versions. */
  details: string;
}

/** GitHub truncates titles past this, so the field stops here too. */
export const MAX_FEEDBACK_TITLE_LENGTH = 200;

/**
 * Longest body the form takes.
 *
 * The report travels as a query string, and GitHub turns away a new-issue URL
 * much past eight kilobytes. Percent-encoding triples anything outside ASCII,
 * so this is a third of that with room left for the versions — and main still
 * trims, because the renderer's limit is a courtesy, not a guarantee.
 */
export const MAX_FEEDBACK_DETAILS_LENGTH = 2400;

export function isFeedbackKind(value: unknown): value is FeedbackKind {
  return (
    typeof value === 'string' &&
    (FEEDBACK_KINDS as readonly string[]).includes(value)
  );
}
