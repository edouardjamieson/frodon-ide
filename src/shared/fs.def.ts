/** A node in the project tree. Mirrors the TUI's `File`, unchanged. */
export interface File {
  name: string;
  path: string;
  isDir: boolean;
  children?: File[];
}

/** Outcome of a filesystem mutation; `error` is a user-facing message. */
export interface FsResult {
  ok: boolean;
  error?: string;
}
