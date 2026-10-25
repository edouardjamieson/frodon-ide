/**
 * The settings dialog, as state rather than as a component.
 *
 * Two axes, which is the whole of its shape. **Scope** is where a setting is
 * written — the project's `.frodon/config.json`, which travels with the
 * repository, or `~/.frodon/config.json`, which belongs to the person. That
 * is not a presentation choice: it is the same split boards already make, and
 * the dialog's job is to make it visible rather than to hide it behind one
 * undifferentiated list. **Category** is what the setting is about.
 *
 * A section is one point on both axes, named `scope.category`, so a caller
 * can open the dialog straight onto the thing it is about — the project badge
 * in the header opens `project.general`, because that is the badge you are
 * trying to change.
 */
export type SettingsScope = 'project' | 'user';

export type SettingsSection =
  | 'project.general'
  | 'project.files'
  | 'user.appearance'
  | 'user.editor'
  | 'user.shortcuts'
  | 'user.feedback';

/** One row in the dialog's own sidebar. */
export interface SettingsCategory {
  id: SettingsSection;
  scope: SettingsScope;
  label: string;
  /** One line under the heading, saying what this page is for. */
  description: string;
}

export interface SettingsStore {
  open: boolean;
  /** Survives a close, so reopening lands where you left off. */
  section: SettingsSection;

  /** Opens the dialog, optionally on a particular page. */
  openSettings: (section?: SettingsSection) => void;
  close: () => void;
  setSection: (section: SettingsSection) => void;
}
