import type { UpdateState } from '@shared/update.def';

export interface UpdateStore {
  /** Main's updater state, replicated. `idle` until the first answer. */
  state: UpdateState;
  setState: (state: UpdateState) => void;
}
