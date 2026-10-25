/**
 * The `/` menu: type a slash at the start of a line, or after a space, and
 * pick what the line should become.
 *
 * Built on CodeMirror's autocompletion rather than a popover of our own,
 * because a completion list is exactly this — a list anchored at the cursor,
 * filtered by what is typed after a trigger, driven by the arrow keys and
 * Enter — and it already knows how to stay out of the way of the keys it is
 * not using. Its keymap runs ahead of the markdown one, so Enter picks an
 * entry while the menu is open and continues a list when it is not.
 */
import {
  autocompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from '@codemirror/autocomplete';
import { syntaxTree } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';
import { SLASH_COMMANDS, type SlashCommand } from './editor-markdown.constant';

interface SlashCompletion extends Completion {
  command: SlashCommand;
}

/**
 * Where a slash is a character rather than a menu: inside code, where it is
 * a comment or a division or a path, and inside a URL.
 */
const LITERAL_NODES: ReadonlySet<string> = new Set([
  'FencedCode',
  'CodeBlock',
  'InlineCode',
  'HTMLBlock',
  'CommentBlock',
  'URL',
]);

/**
 * Only list and quote markers in front of the slash — `- /`, `> /`,
 * `1. [ ] /` — which means the line has no text of its own yet and the
 * command can turn the line itself into something else.
 */
const MARKERS_ONLY = /^\s*(?:(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?|>\s?)*$/;

/**
 * Writes a command where its slash was.
 *
 * A line with nothing but markers before the slash *becomes* the block, its
 * markers replaced — a slash in a bullet that picks Heading 1 makes the bullet
 * a heading, and Text makes it a plain line. A slash after text puts the block
 * on a new line beneath, since there is no reading of `some words # ` in which
 * that was the heading meant.
 */
function apply(
  view: EditorView,
  command: SlashCommand,
  from: number,
  to: number
): void {
  const { doc } = view.state;
  const line = doc.lineAt(from);
  const before = line.text.slice(0, from - line.from);

  if (MARKERS_ONLY.test(before)) {
    const indent = /^\s*/.exec(before)![0];
    const above = line.number > 1 ? doc.line(line.number - 1).text : '';
    const gap = command.blankBefore && above.trim() ? '\n' : '';
    const start = line.from + indent.length;
    view.dispatch({
      changes: {
        from: start,
        to,
        insert: gap + command.before + command.after,
      },
      selection: { anchor: start + gap.length + command.before.length },
      userEvent: 'input.complete',
    });
    return;
  }

  const rest = line.text.slice(to - line.from);
  const lead = rest + '\n' + (command.blankBefore ? '\n' : '');
  view.dispatch({
    changes: {
      from,
      to: line.to,
      insert: lead + command.before + command.after,
    },
    selection: { anchor: from + lead.length + command.before.length },
    userEvent: 'input.complete',
  });
}

function source(context: CompletionContext): CompletionResult | null {
  const typed = context.matchBefore(/\/[\w-]*$/);
  if (!typed) return null;

  const line = context.state.doc.lineAt(typed.from);
  const before = line.text.slice(0, typed.from - line.from);
  // `and/or`, `src/main` — a slash with a word against it is a slash.
  if (before && !/\s$/.test(before)) return null;

  for (
    let node: SyntaxNode | null = syntaxTree(context.state).resolveInner(
      typed.from,
      -1
    );
    node;
    node = node.parent
  ) {
    if (LITERAL_NODES.has(node.name)) return null;
  }

  const query = typed.text.slice(1).toLowerCase();
  const options: SlashCompletion[] = SLASH_COMMANDS.filter(
    (command) =>
      !query ||
      command.label.toLowerCase().includes(query) ||
      command.keywords.includes(query)
  ).map((command) => ({
    label: command.label,
    command,
    apply: (view, _completion, from, to) => apply(view, command, from, to),
  }));

  if (options.length === 0) return null;

  // Filtered here rather than by CodeMirror, whose matching is on the label
  // alone — and `/todo` has to find To-do, and `/h1` Heading 1.
  return { from: typed.from, options, filter: false };
}

export function slashMenu(): Extension {
  return autocompletion({
    override: [source],
    icons: false,
    addToOptions: [
      {
        render: (completion) => {
          const badge = document.createElement('span');
          badge.className = 'cm-md-slash-badge';
          badge.textContent = (completion as SlashCompletion).command.badge;
          return badge;
        },
        position: 20,
      },
    ],
  });
}
