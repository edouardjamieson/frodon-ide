/**
 * The project's color, spread thin behind everything else.
 *
 * Purely decorative: it carries no state, takes no input, and exists to make
 * two windows open on two projects distinguishable from across the room. The
 * gradients themselves are in `styles.css` under `.fd-backdrop`.
 *
 * Mount it as the first child of a `relative isolate` container. `isolate`
 * matters: it makes that container a stacking context, so `-z-10` puts the
 * wash above the container's own background but below every sibling —
 * including static ones, whose text would otherwise paint *under* a plain
 * absolute layer.
 */
export default function Backdrop() {
  return (
    <div
      aria-hidden
      className="fd-backdrop pointer-events-none absolute inset-0 -z-10"
    />
  );
}
