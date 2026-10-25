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
 * The labels each kind asks for.
 *
 * GitHub's own defaults, so a fork has them without creating anything. They
 * are only *applied* when the person filing has triage rights on the
 * repository — for everyone else GitHub drops the parameter in silence, which
 * is the right failure: the issue still opens, unlabelled.
 */
export const ISSUE_LABELS: Record<FeedbackKind, string> = {
  bug: 'bug',
  idea: 'enhancement',
};
