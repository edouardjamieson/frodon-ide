/**
 * Turning a feedback form into a GitHub issue the person can read before it
 * is posted.
 *
 * The form used to have a Send button wired to nothing, because there was
 * nowhere for a report to go. There still is not — no server, no account, no
 * mail relay — and building one to receive a handful of reports would be the
 * largest piece of infrastructure this project owns. The repository's issue
 * tracker already exists, already notifies, and already lets someone reply.
 *
 * So the report is handed to the browser as a prefilled `issues/new` URL. The
 * person lands on GitHub's own form with the title and body in place, sees
 * every word that is about to become public, and submits it under their own
 * name. Frodon posts nothing.
 *
 * The cost is that a report needs a GitHub account, and that the browser
 * leaving the app is a context switch the old form promised to avoid. Both
 * are cheaper than a backend.
 */
import { release } from 'node:os';
import { app, shell } from 'electron';
import { createLogger } from '@main/logger';
import { RELEASE_REPO, getUpdateState } from '@main/update';
import {
  MAX_FEEDBACK_DETAILS_LENGTH,
  MAX_FEEDBACK_TITLE_LENGTH,
  isFeedbackKind,
  type FeedbackReport,
} from '@shared/feedback.def';
import { describeUpdate } from '@shared/update.def';
import {
  ISSUE_FIELDS,
  ISSUE_TEMPLATES,
  MAX_ISSUE_URL_LENGTH,
} from './feedback.constant';

const log = createLogger('feedback');

/**
 * The facts a report needs and nobody can be expected to know, as a block
 * at the bottom of the issue.
 *
 * Gathered here rather than taken from the renderer. The form prints the same
 * values so they can be read, but the ones that go into a public issue should
 * be the ones main actually has — not whatever the page said they were.
 */
function environment(): string {
  const rows = [
    ['Frodon', app.getVersion()],
    ['Updates', describeUpdate(getUpdateState())],
    ['Platform', `${process.platform} ${release()} (${process.arch})`],
    ['Electron', process.versions.electron ?? '—'],
    ['Chromium', process.versions.chrome ?? '—'],
    ['Node', process.versions.node ?? '—'],
  ];

  return [
    '| | |',
    '| --- | --- |',
    ...rows.map(([label, value]) => `| ${label} | ${value} |`),
  ].join('\n');
}

function issueUrl(report: FeedbackReport, details: string): string {
  // Into the issue form's own fields rather than one `body`, so the report
  // lands under the headings the template gives it — the same issue whether
  // it was filed from the app or typed on GitHub.
  const query = new URLSearchParams({
    template: ISSUE_TEMPLATES[report.kind],
    title: report.title,
    [ISSUE_FIELDS.details]: details,
    [ISSUE_FIELDS.environment]: environment(),
  });

  return `https://github.com/${RELEASE_REPO}/issues/new?${query.toString()}`;
}

/**
 * The URL for a report, with the details shortened until it fits.
 *
 * Trimmed from the end of the details and nowhere else: the title is short by
 * construction, and the version block is the part a reader cannot get back
 * by asking. A note says it was cut, so the person sees it on GitHub's form
 * and can paste the rest in before submitting.
 */
function fittedIssueUrl(report: FeedbackReport): string {
  let details = report.details.trim();
  let url = issueUrl(report, details);

  while (url.length > MAX_ISSUE_URL_LENGTH && details.length > 0) {
    details = details.slice(0, Math.floor(details.length * 0.85));
    url = issueUrl(
      report,
      `${details}…\n\n_(Shortened to fit — paste the rest here.)_`
    );
  }

  return url;
}

/**
 * Opens the new-issue page for a report. False if the report was not one, or
 * the browser could not be asked.
 *
 * Every field is checked again here, because what arrives over IPC is
 * whatever the renderer sent: a kind outside the two, a title that is not a
 * string, a body far past the form's own limit.
 */
export async function reportIssue(report: unknown): Promise<{ ok: boolean }> {
  if (typeof report !== 'object' || report === null) return { ok: false };
  const raw = report as Record<string, unknown>;

  if (!isFeedbackKind(raw.kind)) return { ok: false };
  if (typeof raw.title !== 'string' || typeof raw.details !== 'string') {
    return { ok: false };
  }

  const title = raw.title.trim().slice(0, MAX_FEEDBACK_TITLE_LENGTH);
  if (!title) return { ok: false };

  const url = fittedIssueUrl({
    kind: raw.kind,
    title,
    details: raw.details.slice(0, MAX_FEEDBACK_DETAILS_LENGTH),
  });

  try {
    await shell.openExternal(url);
    return { ok: true };
  } catch (error) {
    log.error('could not open the new-issue page', error);
    return { ok: false };
  }
}
