/**
 * The lengths offered as one click each, with a field after them for any
 * other. Short ones first: a five-minute timer is a tea, a sixty-minute one
 * is a block of work, and both are things people reach for. The field is
 * last because a timer that has to be typed before it starts is one nobody
 * starts — it is there for the length you already know you want.
 */
export const FOCUS_PRESETS = [5, 10, 15, 20, 25, 30, 45, 60] as const;

/**
 * The longest session the field takes, in minutes. Eight hours is a working
 * day; anything past it is a typo for a smaller number.
 */
export const FOCUS_MAX_MINUTES = 480;
