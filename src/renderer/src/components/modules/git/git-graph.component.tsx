import { cn } from 'cn';
import { DOT_RADIUS, LANE_WIDTH, ROW_HEIGHT, type GraphRow } from '~/lib/git';

/**
 * One row of the commit graph: the lines passing through it and the dot that
 * belongs to it.
 *
 * SVG rather than divs with borders, because the interesting part of a graph
 * log is the curves — a merge that bends back into a line already on screen
 * is what tells you two branches met, and a box model has no way to draw it.
 *
 * Each row is its own `<svg>` of a fixed height rather than one tall canvas
 * behind the list. That costs an element per row and buys the thing that
 * matters here: the row is laid out by the same flexbox as the text beside
 * it, so a subject that wraps or a list that virtualises later cannot
 * desynchronise the lines from the commits they belong to.
 *
 * Lanes are told apart by position, not color. Only lane 0 is tinted — it is
 * where HEAD's own line runs, since the log is walked from HEAD first — which
 * makes "the branch I am on" readable at a glance without turning the gutter
 * into a rainbow.
 */
export default function GitGraph({
  row,
  lanes,
}: {
  row: GraphRow;
  lanes: number;
}) {
  const width = Math.max(1, lanes) * LANE_WIDTH;
  const middle = ROW_HEIGHT / 2;
  const x = (lane: number) => lane * LANE_WIDTH + LANE_WIDTH / 2;

  return (
    <svg
      width={width}
      height={ROW_HEIGHT}
      viewBox={`0 0 ${width} ${ROW_HEIGHT}`}
      className="shrink-0 overflow-visible"
      aria-hidden
    >
      {/* Branches this commit is not on, running the full height of the row. */}
      {row.through.map((lane) => (
        <line
          key={`through-${lane}`}
          x1={x(lane)}
          y1={0}
          x2={x(lane)}
          y2={ROW_HEIGHT}
          strokeWidth={1.5}
          className={strokeOf(lane)}
        />
      ))}

      {/* Children coming down to this commit. More than one is a fork read
          upwards: two branches whose histories both include this commit. */}
      {row.incoming.map((lane) => (
        <path
          key={`in-${lane}`}
          d={
            lane === row.lane
              ? `M ${x(lane)} 0 L ${x(lane)} ${middle}`
              : `M ${x(lane)} 0 C ${x(lane)} ${middle} ${x(row.lane)} 0 ${x(row.lane)} ${middle}`
          }
          fill="none"
          strokeWidth={1.5}
          className={strokeOf(lane)}
        />
      ))}

      {/* Parents leaving it. The second one is the merge. */}
      {row.outgoing.map((lane) => (
        <path
          key={`out-${lane}`}
          d={
            lane === row.lane
              ? `M ${x(lane)} ${middle} L ${x(lane)} ${ROW_HEIGHT}`
              : `M ${x(row.lane)} ${middle} C ${x(row.lane)} ${ROW_HEIGHT} ${x(lane)} ${middle} ${x(lane)} ${ROW_HEIGHT}`
          }
          fill="none"
          strokeWidth={1.5}
          className={strokeOf(lane)}
        />
      ))}

      <circle
        cx={x(row.lane)}
        cy={middle}
        r={DOT_RADIUS}
        className={cn(
          'stroke-[1.5]',
          row.lane === 0
            ? 'fill-project stroke-project'
            : 'fill-git-node stroke-git-node'
        )}
      />
    </svg>
  );
}

/** Lane 0 is HEAD's. Everything else is drawn in the neutral edge color. */
function strokeOf(lane: number): string {
  return lane === 0 ? 'stroke-project/70' : 'stroke-git-edge';
}
