/**
 * What the companion is doing. Three moods for now, each one drawn from the
 * same pose — the face and the one part that moves (a cat's tail, a fish's
 * fin, a robot's arm) are what change.
 *
 * - `awake`: blinking, moving slowly.
 * - `asleep`: eyes shut, still. Nobody has touched the app in a while.
 * - `purring`: just petted. Moving fast; the heart is the click's own.
 */
export type CompanionMood = 'awake' | 'asleep' | 'purring';

export interface CompanionStore {
  mood: CompanionMood;
  setMood: (mood: CompanionMood) => void;
  /**
   * Whether the chosen feature's popover is open over the companion. One
   * flag rather than one per feature, because only one feature is ever
   * chosen.
   */
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
}
