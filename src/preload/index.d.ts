import type { FrodonApi } from '@shared/ipc.def';

declare global {
  interface Window {
    frodon: FrodonApi;
  }
}

export {};
