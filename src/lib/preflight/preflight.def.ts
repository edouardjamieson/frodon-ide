/** A semantic version reduced to the three numbers we compare. */
export type Version = [major: number, minor: number, patch: number];

/** Why the current runtime can't run Frodon. */
export enum RuntimeProblem {
  /** Not Bun at all — no `Bun` global, so this is Node or another runtime. */
  NOT_BUN = 'NOT_BUN',
  /** Bun, but older than the floor Frodon is built against. */
  BUN_TOO_OLD = 'BUN_TOO_OLD',
}

/** The outcome of the startup runtime check. */
export type RuntimeCheck =
  | { ok: true }
  | {
      ok: false;
      problem: RuntimeProblem;
      /** The version string the runtime reported, when there was one. */
      found?: string;
    };
