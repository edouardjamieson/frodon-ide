import type { FeedbackKind } from '@shared/feedback.def';

/**
 * The longest new-issue URL worth handing to the browser.
 *
 * GitHub answers a URL much past eight kilobytes with an error page rather
 * than the form, and loses everything that was typed into it on the way. A
 * little under that, so the trim below always lands on the safe side.
 */
export const MAX_ISSUE_URL_LENGTH = 7800;

/**
 * The issue form each kind opens, in `.github/ISSUE_TEMPLATE/`.
 *
 * A form rather than a free-text body, so a report filed from the app and one
 * typed on GitHub arrive in the same shape. The form also carries the labels:
 * a `labels` query parameter is only honoured for people with triage rights
 * on the repository, but labels a template declares are applied to every
 * issue opened from it.
 *
 * If a fork deletes the forms, GitHub opens a blank issue and the fields
 * below have nowhere to land — the title survives and the rest is lost, which
 * is why the forms are checked in beside the code that names them.
 */
export const ISSUE_TEMPLATES: Record<FeedbackKind, string> = {
  bug: 'bug.yml',
  idea: 'idea.yml',
};

/**
 * The form fields the app fills, by their `id` in the templates. GitHub fills
 * any form field whose id matches a query parameter; these two are the
 * contract, and renaming one on either side leaves that field empty.
 */
export const ISSUE_FIELDS = {
  details: 'details',
  environment: 'environment',
} as const;
