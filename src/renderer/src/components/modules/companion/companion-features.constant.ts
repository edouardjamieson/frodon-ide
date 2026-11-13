import type { CompanionFeature } from '@shared/config.def';
import { Inbox, Timer } from 'lucide-react';
import {
  POCKET_DROP,
  PocketPanel,
  PocketStatus,
} from './companion-pocket.component';
import { TimerPanel, TimerStatus } from './companion-timer.component';
import type { CompanionFeatureView } from './companion.def';

/**
 * Every feature the companion can be given, by the name the settings store.
 * A `Record` over the names, so a feature added to `COMPANION_FEATURES`
 * without views here does not compile — and adding one is this table, a
 * file of views and a `lib/` store, with nothing in the companion itself to
 * touch.
 */
export const COMPANION_FEATURE_VIEWS: Record<
  Exclude<CompanionFeature, 'none'>,
  CompanionFeatureView
> = {
  timer: {
    label: 'Focus timer',
    description:
      'Pick a length and the minutes left sit beside the companion, which stays awake until they run out.',
    icon: Timer,
    Status: TimerStatus,
    Panel: TimerPanel,
    panelClassName: 'w-56 p-2',
  },
  pocket: {
    label: 'Pocket',
    description:
      'A note to type in, and a shelf for files dropped on the companion — a screenshot on its way to an agent, a log to attach later.',
    icon: Inbox,
    Status: PocketStatus,
    Panel: PocketPanel,
    panelClassName: 'w-72 p-2',
    drop: POCKET_DROP,
  },
};
