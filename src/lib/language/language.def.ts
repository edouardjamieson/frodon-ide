export interface LanguageStore {
  /** Refractor ids that have been imported and registered. */
  loaded: Record<string, boolean>;
  /** Refractor ids whose dynamic import is currently in flight. */
  loading: Record<string, boolean>;
  /**
   * Dynamically imports and registers a refractor language by id. Idempotent:
   * a given id is only ever imported once, and languages already bundled with
   * refractor's common set are marked loaded without an import.
   */
  load: (id: string) => Promise<void>;
}
