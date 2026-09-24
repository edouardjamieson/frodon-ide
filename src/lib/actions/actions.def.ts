/**
 * User-configured commands bound to filesystem events. An action names an
 * `event`, an optional glob to narrow which files it applies to, and a shell
 * `run` template whose `{{variables}}` are resolved against the file that
 * triggered it (see `actions.service.ts`).
 */

/** The filesystem event an action reacts to. */
export enum ActionEvent {
  /** The editor wrote a file to disk. */
  SAVE = 'save',
  /** A file/directory was created from within the app. */
  CREATE = 'create',
  /** A file/directory was renamed or moved. */
  RENAME = 'rename',
  /** A file/directory was deleted. */
  DELETE = 'delete',
  /** A file changed on disk outside the app (e.g. an external edit). */
  CHANGE = 'change',
}

/** A single configured command. */
export interface Action {
  /** Which event fires this command. */
  on: ActionEvent;
  /** Shell command with `{{variables}}` placeholders. */
  run: string;
  /**
   * Glob (relative to the project root) limiting which paths trigger this;
   * omitted means every path. E.g. `"**\/*.ts"`.
   */
  match?: string;
  /**
   * When true, the trigger awaits this command before continuing — used for
   * formatters so the editor can adopt their output. Non-blocking actions run
   * detached and never hold up the editor.
   */
  blocking?: boolean;
}

/** The concrete filesystem fact that triggered a run, before resolution. */
export interface ActionContext {
  event: ActionEvent;
  /** Absolute path of the (new) file involved. */
  path: string;
  /** Absolute prior path, for rename events only. */
  oldPath?: string;
  /** Absolute project root; commands run with this as their cwd. */
  projectRoot: string;
}
