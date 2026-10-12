/**
 * Turning a list of commits into a drawable graph.
 *
 * Pure, and kept apart from the store and the component for the same reason
 * `main/git/git.parser.ts` is kept apart from its service: it is a function of
 * an array, so it can be reasoned about — and one day tested — without a
 * repository, a store or a render.
 *
 * The algorithm is the one every graph log uses. Walk the commits newest to
 * oldest holding a row of *lanes*, each lane remembering the sha it is still
 * waiting to draw. A commit takes the lane that was waiting for it, or the
 * first free one if nothing was; its first parent inherits that lane, and any
 * further parent — a merge — takes a lane of its own unless one is already
 * waiting for it, in which case the two lines join.
 *
 * That last case is what makes a merge look like a merge: the second parent's
 * line is usually already on screen, so the edge bends into it rather than
 * starting a lane that would immediately end.
 *
 * The commits must arrive in topological order (`--topo-order`, which
 * `readLog` passes) or the lanes cross back over themselves — a child drawn
 * below its own parent has nowhere sensible to put its line.
 */
import type { GitLogCommit } from '@shared/git.def';
import type { Graph, GraphRow } from './git.def';

/** The first lane with nothing in it, or a new one on the right. */
function firstFree(lanes: (string | null)[]): number {
  const free = lanes.indexOf(null);
  return free === -1 ? lanes.length : free;
}

export function buildGraph(commits: GitLogCommit[]): Graph {
  const lanes: (string | null)[] = [];
  const rows: GraphRow[] = [];
  let widest = 1;

  for (const commit of commits) {
    // Which lanes were drawing a line down to this commit. More than one
    // means children on different branches share it — the point where a
    // history that forked comes back together as you read upwards.
    const incoming: number[] = [];
    for (let lane = 0; lane < lanes.length; lane += 1) {
      if (lanes[lane] === commit.sha) incoming.push(lane);
    }

    // A commit nothing was waiting for is a tip: it starts its own lane.
    const lane = incoming.length > 0 ? incoming[0]! : firstFree(lanes);

    // Every arriving line ends here, so their lanes are free again — the
    // commit's own included, which is what lets its first parent keep it.
    for (const index of incoming) lanes[index] = null;
    // Pushed rather than assigned past the end: a sparse array has holes
    // instead of nulls, and `indexOf(null)` skips a hole entirely.
    while (lanes.length <= lane) lanes.push(null);

    // Lanes busy with something else pass straight through the row. Computed
    // before the parents are placed, so a lane a parent is about to be put in
    // is not mistaken for one that was already running.
    const through: number[] = [];
    for (let index = 0; index < lanes.length; index += 1) {
      if (lanes[index] != null) through.push(index);
    }

    const outgoing: number[] = [];
    commit.parents.forEach((parent, index) => {
      // A parent another lane is already waiting for does not get a lane of
      // its own: the edge bends across into the line that exists.
      const existing = lanes.indexOf(parent);
      if (existing !== -1) {
        outgoing.push(existing);
        return;
      }

      // The first parent continues the commit's own lane, which is what keeps
      // a branch a straight vertical line for its whole length.
      const slot = index === 0 && lanes[lane] == null ? lane : firstFree(lanes);
      lanes[slot] = parent;
      outgoing.push(slot);
    });

    rows.push({ commit, lane, through, incoming, outgoing });

    // Every lane this row drew something in, as a count of columns. Taken
    // before the trim below, which is about the rows still to come.
    widest = Math.max(widest, lanes.length);

    // Lanes only ever grow on the right, so trailing empties are given back
    // — otherwise one long-dead branch keeps the gutter wide forever.
    while (lanes.length > 0 && lanes[lanes.length - 1] === null) lanes.pop();
  }

  return { rows, lanes: widest };
}
