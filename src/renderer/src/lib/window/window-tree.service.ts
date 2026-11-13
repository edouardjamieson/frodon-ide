/**
 * The arithmetic of where windows sit, kept out of the store.
 *
 * Everything here is pure: a tree in, a tree out. The store's actions read
 * like a sentence each, and the fiddly part — what a split, a close or a drop
 * does to everyone else's place — is written once, in functions that can be
 * reasoned about without a store.
 *
 * Every function that changes a tree hands its result to `normalizeTree`
 * rather than keeping the tree normal by construction. Writing each operation
 * so it never produces a one-child split or a split inside a split of the
 * same axis is possible, and it is four slightly different sets of special
 * cases; producing whatever is natural and normalizing afterwards is one.
 * Splitting a window rightwards inside a row is then "replace the leaf with a
 * horizontal split of two", and the flattening that turns it into a third
 * child of the row falls out.
 */
import {
  GUTTER_SIZE,
  MAX_WINDOWS,
  MIN_TILE_HEIGHT,
  MIN_TILE_WIDTH,
} from './window.constant';
import type {
  DropEdge,
  DropTarget,
  SplitAxis,
  SplitDirection,
  WindowRoom,
  WindowTree,
} from './window.def';

export function leaf(id: string): WindowTree {
  return { kind: 'window', id };
}

/** The axis an edge splits along: left and right sit side by side. */
export function axisOf(edge: DropEdge): SplitAxis {
  return edge === 'left' || edge === 'right' ? 'horizontal' : 'vertical';
}

/** Every window in the tree, left to right and top to bottom. */
export function windowIdsOf(tree: WindowTree): string[] {
  if (tree.kind === 'window') return [tree.id];
  return tree.children.flatMap(windowIdsOf);
}

/** The first window in a subtree — its top-left corner. */
export function firstWindowOf(tree: WindowTree): string {
  return tree.kind === 'window' ? tree.id : firstWindowOf(tree.children[0]!);
}

/** The last window in a subtree — its bottom-right corner. */
export function lastWindowOf(tree: WindowTree): string {
  return tree.kind === 'window'
    ? tree.id
    : lastWindowOf(tree.children[tree.children.length - 1]!);
}

/**
 * The same tree in normal form, or null when nothing is left in it.
 *
 * Three rules, applied bottom-up: an empty split disappears, a split of one
 * is replaced by its child, and a split directly inside another of the same
 * axis gives its children to its parent. See `WindowTree` for why.
 *
 * Returns the input itself when it was already normal, so a caller that
 * normalizes defensively does not hand React a new tree for nothing.
 */
export function normalizeTree(tree: WindowTree): WindowTree | null {
  if (tree.kind === 'window') return tree;

  let changed = false;
  const children: WindowTree[] = [];

  for (const child of tree.children) {
    const normal = normalizeTree(child);
    if (normal !== child) changed = true;
    if (!normal) continue;

    if (normal.kind === 'split' && normal.axis === tree.axis) {
      children.push(...normal.children);
      changed = true;
    } else {
      children.push(normal);
    }
  }

  if (children.length === 0) return null;
  if (children.length === 1) return children[0]!;
  return changed ? { ...tree, children } : tree;
}

/** The tree with only the windows `keep` accepts, normalized. */
export function filterTree(
  tree: WindowTree,
  keep: (id: string) => boolean
): WindowTree | null {
  const visit = (node: WindowTree): WindowTree | null => {
    if (node.kind === 'window') return keep(node.id) ? node : null;
    const children = node.children.map(visit).filter((child) => child !== null);
    return { ...node, children };
  };

  const filtered = visit(tree);
  return filtered && normalizeTree(filtered);
}

/** The tree without one window, normalized; null if it was the only one. */
export function removeFromTree(
  tree: WindowTree,
  id: string
): WindowTree | null {
  return filterTree(tree, (other) => other !== id);
}

/**
 * Puts a new window against one edge of an existing one, halving it.
 *
 * Inside a split of the matching axis that makes it a sibling — splitting
 * one of two side-by-side windows rightwards makes three side by side, not a
 * window that is half of a half. Across the axis it makes a new split in the
 * old window's place, which is the whole point of the tree: the windows
 * beside it keep their shape.
 */
export function insertBeside(
  tree: WindowTree,
  targetId: string,
  id: string,
  edge: DropEdge
): WindowTree {
  const fresh = leaf(id);
  const before = edge === 'left' || edge === 'top';

  const visit = (node: WindowTree): WindowTree => {
    if (node.kind === 'window') {
      if (node.id !== targetId) return node;
      return {
        kind: 'split',
        axis: axisOf(edge),
        children: before ? [fresh, node] : [node, fresh],
      };
    }
    return { ...node, children: node.children.map(visit) };
  };

  return normalizeTree(visit(tree)) ?? fresh;
}

/**
 * Puts a new window against an edge of the whole workbench: a column the
 * full height of it, or a row the full width.
 */
export function insertAtEdge(
  tree: WindowTree,
  id: string,
  edge: DropEdge
): WindowTree {
  const fresh = leaf(id);
  const before = edge === 'left' || edge === 'top';
  const wrapped: WindowTree = {
    kind: 'split',
    axis: axisOf(edge),
    children: before ? [fresh, tree] : [tree, fresh],
  };
  return normalizeTree(wrapped) ?? fresh;
}

/** The tree with a split window's new neighbour in it. */
export function splitInTree(
  tree: WindowTree,
  targetId: string,
  id: string,
  direction: SplitDirection
): WindowTree {
  return insertBeside(
    tree,
    targetId,
    id,
    direction === 'right' ? 'right' : 'bottom'
  );
}

/** Two windows trading places. Nothing else in the tree moves. */
export function swapInTree(tree: WindowTree, a: string, b: string): WindowTree {
  const visit = (node: WindowTree): WindowTree => {
    if (node.kind === 'window') {
      if (node.id === a) return leaf(b);
      if (node.id === b) return leaf(a);
      return node;
    }
    return { ...node, children: node.children.map(visit) };
  };
  return visit(tree);
}

/** Whether two normal trees say the same thing. */
export function sameTree(a: WindowTree, b: WindowTree): boolean {
  if (a === b) return true;
  if (a.kind === 'window' || b.kind === 'window') {
    return a.kind === b.kind && firstWindowOf(a) === firstWindowOf(b);
  }
  return (
    a.axis === b.axis &&
    a.children.length === b.children.length &&
    a.children.every((child, index) => sameTree(child, b.children[index]!))
  );
}

/**
 * The tree after a dragged window is let go, or null when the drop does
 * nothing.
 *
 * Written as remove-then-insert rather than as arithmetic of its own: the
 * window leaves through `removeFromTree`, so the space it left closes up
 * exactly the way a close would, and it arrives through the same insert a
 * split uses. The centre is the exception, and the one move that can never
 * run out of room — the shape stays and only the occupants change.
 *
 * A drop that lands a window where it already was — the left edge of the
 * window to its right — comes back as the tree it started from, and is
 * reported as null so the drop target draws nothing for it.
 */
export function moveInTree(
  tree: WindowTree,
  id: string,
  target: DropTarget
): WindowTree | null {
  if (target.targetId === id) return null;

  let next: WindowTree;

  if (target.targetId !== null && target.zone === 'center') {
    next = swapInTree(tree, id, target.targetId);
  } else {
    const rest = removeFromTree(tree, id);
    if (!rest) return null;

    if (target.targetId === null) {
      next = insertAtEdge(rest, id, target.zone as DropEdge);
    } else {
      if (!windowIdsOf(rest).includes(target.targetId)) return null;
      next = insertBeside(rest, target.targetId, id, target.zone as DropEdge);
    }
  }

  return sameTree(next, tree) ? null : next;
}

/**
 * The same move, but only if the window being split has the room for it —
 * what the drop target asks before it lights up, and what `move` runs.
 *
 * The room is asked of the target as it is now, before the dragged window
 * leaves. That is a little cautious: taking a window out of a row widens its
 * neighbours. The cost is a drop refused that would just have fitted, which
 * is a better mistake than a split that leaves two slivers.
 */
export function planMove(
  tree: WindowTree,
  id: string,
  target: DropTarget,
  roomOf: (id: string) => WindowRoom
): WindowTree | null {
  if (target.targetId !== null && target.zone !== 'center') {
    const room = roomOf(target.targetId);
    const fits = axisOf(target.zone) === 'horizontal' ? room.right : room.down;
    if (!fits) return null;
  }
  return moveInTree(tree, id, target);
}

/**
 * Who inherits the focus when a window closes: the neighbour that takes its
 * space, at the edge that touched it.
 *
 * The sibling before it if there is one, else the one after — and within
 * that sibling the window nearest the gap, which is where the eye already
 * is.
 */
export function heirOf(tree: WindowTree, id: string): string | null {
  if (tree.kind === 'window') return null;

  const index = tree.children.findIndex(
    (child) => child.kind === 'window' && child.id === id
  );
  if (index !== -1) {
    const before = tree.children[index - 1];
    if (before) return lastWindowOf(before);
    const after = tree.children[index + 1];
    return after ? firstWindowOf(after) : null;
  }

  for (const child of tree.children) {
    const found = heirOf(child, id);
    if (found) return found;
  }
  return null;
}

/**
 * Where a window spawned for something to open should go: beside the
 * focused window if it has room, else beside the first that does — and to
 * the right in preference to below, because a file or a page wants width
 * before it wants height. Null when nothing has room, or the workbench holds
 * as many windows as it ever will.
 *
 * Replaces the old `firstFreeSlot`. A grid had free slots to find; a tree
 * has windows big enough to halve, and the size store is what knows which.
 */
export function spawnSite(
  tree: WindowTree,
  focusedId: string,
  roomOf: (id: string) => WindowRoom
): { targetId: string; direction: SplitDirection } | null {
  const ids = windowIdsOf(tree);
  if (ids.length >= MAX_WINDOWS) return null;

  const order = ids.includes(focusedId)
    ? [focusedId, ...ids.filter((id) => id !== focusedId)]
    : ids;

  for (const targetId of order) {
    const room = roomOf(targetId);
    if (room.right) return { targetId, direction: 'right' };
    if (room.down) return { targetId, direction: 'down' };
  }
  return null;
}

/**
 * The fewest pixels a subtree can be squeezed to along an axis.
 *
 * What each panel is handed as its `minSize`, so a splitter stops before any
 * window inside the panel it is shrinking drops below `MIN_TILE_WIDTH` — not
 * only the panel's own edge. Children laid out along the axis add up, gutters
 * included; children across it are as small as the largest of them.
 */
export function minExtent(tree: WindowTree, axis: SplitAxis): number {
  if (tree.kind === 'window') {
    return axis === 'horizontal' ? MIN_TILE_WIDTH : MIN_TILE_HEIGHT;
  }

  const extents = tree.children.map((child) => minExtent(child, axis));
  if (tree.axis !== axis) return Math.max(...extents);
  return (
    extents.reduce((sum, extent) => sum + extent, 0) +
    GUTTER_SIZE * (extents.length - 1)
  );
}
