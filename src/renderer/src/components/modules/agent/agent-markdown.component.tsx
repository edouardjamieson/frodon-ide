import { memo, useEffect, useMemo, useState, type ReactNode } from 'react';
import { cn } from 'cn';
import { Check, Copy } from 'lucide-react';
import type { SyntaxNode } from '@lezer/common';
import { useFindFile, type FileReference } from '~/lib/agent';
import {
  grammarFor,
  highlightLines,
  parseMarkdown,
} from './agent-markdown.service';

/**
 * A reply, drawn as the markdown it was written in.
 *
 * Memoized on the text alone. A transcript re-renders every row on every
 * delta that streams in, and parsing every earlier reply again each time
 * would make a long conversation slower the longer it ran; this way only the
 * reply being written is parsed, once per delta. `onOpenFile` is left out of
 * the comparison on purpose: it is a fresh closure on every render, and the
 * one a row first got opens the same files. What counts as a file in the
 * project is read through `useFindFile`, which re-renders a reply when the
 * tree changes — so a path the agent has just created becomes a link.
 *
 * Mid-stream text is half a document — a fence with no close, a table with
 * one row — and the parser takes it as it is: an open fence runs to the end
 * of the reply until its close arrives.
 */
export const Markdown = memo(
  function Markdown({
    text,
    onOpenFile,
  }: {
    text: string;
    onOpenFile: (path: string, line?: number) => void;
  }) {
    const tree = useMemo(() => parseMarkdown(text), [text]);
    const findFile = useFindFile();
    return (
      <div className="flex flex-col gap-2.5 text-fg select-text">
        {blocks(tree.topNode, { text, onOpenFile, findFile })}
      </div>
    );
  },
  (before, after) => before.text === after.text
);

interface Context {
  text: string;
  onOpenFile: (path: string, line?: number) => void;
  findFile: (text: string) => FileReference | null;
}

/** Syntax the parser keeps and a reader does not want to see. */
const MARKS = new Set([
  'HeaderMark',
  'EmphasisMark',
  'CodeMark',
  'CodeInfo',
  'LinkMark',
  'LinkLabel',
  'LinkTitle',
  'QuoteMark',
  'ListMark',
  'StrikethroughMark',
  'TableDelimiter',
  'TaskMarker',
  'LinkReference',
]);

const HEADINGS: Record<string, string> = {
  ATXHeading1: 'text-[17px] font-semibold',
  SetextHeading1: 'text-[17px] font-semibold',
  ATXHeading2: 'text-[16px] font-semibold',
  SetextHeading2: 'text-[16px] font-semibold',
  ATXHeading3: 'text-[15px] font-semibold',
  ATXHeading4: 'font-semibold',
  ATXHeading5: 'font-semibold',
  ATXHeading6: 'font-semibold text-fg-muted',
};

function childrenOf(node: SyntaxNode): SyntaxNode[] {
  const out: SyntaxNode[] = [];
  for (let child = node.firstChild; child; child = child.nextSibling)
    out.push(child);
  return out;
}

/** The block-level children of a node, the space between them dropped. */
function blocks(node: SyntaxNode, context: Context): ReactNode[] {
  return childrenOf(node).map((child, index) => block(child, context, index));
}

function block(node: SyntaxNode, context: Context, key: number): ReactNode {
  const { text } = context;
  const name = node.name;

  if (MARKS.has(name)) return null;

  const heading = HEADINGS[name];
  if (heading) {
    return (
      <p key={key} className={`${heading} mt-1`}>
        {inline(node, context)}
      </p>
    );
  }

  switch (name) {
    case 'Paragraph':
      return <p key={key}>{inline(node, context)}</p>;

    case 'BulletList':
      return (
        <ul key={key} className="flex list-disc flex-col gap-1 pl-5">
          {blocks(node, context)}
        </ul>
      );

    case 'OrderedList': {
      const first = node.getChild('ListItem')?.getChild('ListMark');
      const start = first ? parseInt(text.slice(first.from, first.to), 10) : 1;
      return (
        <ol
          key={key}
          start={Number.isNaN(start) ? 1 : start}
          className="flex list-decimal flex-col gap-1 pl-5"
        >
          {blocks(node, context)}
        </ol>
      );
    }

    case 'ListItem':
      return (
        <li key={key} className="pl-0.5 [&>*+*]:mt-1">
          {blocks(node, context)}
        </li>
      );

    case 'Task': {
      const marker = node.getChild('TaskMarker');
      const done = marker
        ? /x/i.test(text.slice(marker.from, marker.to))
        : false;
      return (
        <span key={key} className="inline-flex items-baseline gap-1.5">
          <input
            type="checkbox"
            checked={done}
            readOnly
            tabIndex={-1}
            className="translate-y-px accent-project"
          />
          <span>{inline(node, context)}</span>
        </span>
      );
    }

    case 'Blockquote':
      return (
        <blockquote
          key={key}
          className="flex flex-col gap-2 border-l-2 border-pane-border pl-3 text-fg-muted"
        >
          {blocks(node, context)}
        </blockquote>
      );

    case 'FencedCode':
    case 'CodeBlock': {
      const info = node.getChild('CodeInfo');
      return (
        <CodeBlock
          key={key}
          code={childrenOf(node)
            .filter((child) => child.name === 'CodeText')
            .map((child) => text.slice(child.from, child.to))
            .join('\n')}
          info={info ? text.slice(info.from, info.to) : ''}
        />
      );
    }

    case 'Table':
      return (
        <div key={key} className="overflow-x-auto">
          <table className="border-collapse text-[13px]">
            <tbody>{blocks(node, context)}</tbody>
          </table>
        </div>
      );

    case 'TableHeader':
    case 'TableRow': {
      const header = name === 'TableHeader';
      return (
        <tr key={key} className={header ? 'bg-input' : undefined}>
          {node.getChildren('TableCell').map((cell, index) =>
            header ? (
              <th
                key={index}
                className="border border-pane-border px-2 py-1 text-left font-semibold"
              >
                {inline(cell, context)}
              </th>
            ) : (
              <td key={index} className="border border-pane-border px-2 py-1">
                {inline(cell, context)}
              </td>
            )
          )}
        </tr>
      );
    }

    case 'HorizontalRule':
      return <hr key={key} className="border-pane-border" />;

    default:
      // Raw HTML, comments, anything a later dialect adds: shown as the
      // text it is. Never as markup — see the service's header.
      return (
        <p key={key} className="whitespace-pre-wrap">
          {text.slice(node.from, node.to)}
        </p>
      );
  }
}

/**
 * The inline content of a node: its children drawn, and the text between
 * them as text. Marks are children too, and draw as nothing, which is what
 * leaves `*em*` as an `em` holding "em".
 */
function inline(node: SyntaxNode, context: Context): ReactNode[] {
  const { text } = context;
  const out: ReactNode[] = [];
  let at = node.from;
  childrenOf(node).forEach((child, index) => {
    if (child.from > at) out.push(text.slice(at, child.from));
    out.push(span(child, context, index));
    at = child.to;
  });
  if (at < node.to) out.push(text.slice(at, node.to));
  return out;
}

function span(node: SyntaxNode, context: Context, key: number): ReactNode {
  const { text } = context;

  if (MARKS.has(node.name)) return null;

  switch (node.name) {
    case 'Emphasis':
      return <em key={key}>{inline(node, context)}</em>;
    case 'StrongEmphasis':
      return (
        <strong key={key} className="font-semibold">
          {inline(node, context)}
        </strong>
      );
    case 'Strikethrough':
      return (
        <del key={key} className="text-fg-muted">
          {inline(node, context)}
        </del>
      );
    case 'InlineCode': {
      // A path in backticks is how an agent names a file nine times out of
      // ten — `src/main/index.ts:42` — so one that is in the project opens
      // it, at the line, like a link would.
      const marks = node.getChildren('CodeMark');
      const content = text.slice(
        marks[0]?.to ?? node.from,
        marks[1]?.from ?? node.to
      );
      const reference = context.findFile(content);
      const code = (
        <code
          key={reference ? undefined : key}
          className={cn('rounded bg-input px-1 py-px font-mono text-[12.5px]', {
            'text-project': reference,
          })}
        >
          {inline(node, context)}
        </code>
      );
      if (!reference) return code;
      return (
        <a
          key={key}
          href={reference.path}
          title={`Open ${reference.path}${reference.line ? `:${reference.line}` : ''}`}
          onClick={(event) => {
            event.preventDefault();
            context.onOpenFile(reference.path, reference.line ?? undefined);
          }}
          className="cursor-pointer decoration-project/60 underline-offset-2 hover:underline"
        >
          {code}
        </a>
      );
    }
    case 'HardBreak':
      return <br key={key} />;
    case 'Escape':
      return text.slice(node.from + 1, node.to);
    case 'Entity':
      return (
        ENTITIES[text.slice(node.from, node.to)] ??
        text.slice(node.from, node.to)
      );

    case 'Link':
    case 'Image': {
      // An image is drawn as a link to it: a remote picture would be a
      // request the agent's words make on the person's behalf, and the
      // page's CSP refuses it anyway.
      const url = node.getChild('URL');
      const href = url ? text.slice(url.from, url.to) : null;
      const label = inline(node, context).filter((part) => part !== null);
      return (
        <ReplyLink key={key} href={href} context={context}>
          {node.name === 'Image' && label.length === 0 ? href : label}
        </ReplyLink>
      );
    }

    case 'Autolink':
    case 'URL': {
      // A link's own address is its `href`, already read by the link.
      if (node.parent?.name === 'Link' || node.parent?.name === 'Image')
        return null;
      const url = node.name === 'URL' ? node : node.getChild('URL');
      const href = url ? text.slice(url.from, url.to) : null;
      return (
        <ReplyLink key={key} href={href} context={context}>
          {href}
        </ReplyLink>
      );
    }

    default:
      // Inline HTML and anything unknown, as its source.
      return text.slice(node.from, node.to);
  }
}

/** The handful a reply actually contains. Anything else stays as written. */
const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
};

/** A scheme, so `https:` and `mailto:` are told from a relative path. */
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/**
 * A link in a reply, which never navigates the page it is on.
 *
 * Every click is stopped, because a followed `href` would load the URL into
 * the window that holds the preload bridge. A web address goes through
 * `window.open`, which main hands to the person's own browser and denies
 * everything else; a path opens in the editor, without the `#L12` or `:12`
 * an agent puts on the end; any other scheme does nothing.
 */
function ReplyLink({
  href,
  context,
  children,
}: {
  href: string | null;
  context: Context;
  children: ReactNode;
}) {
  if (!href) return <>{children}</>;

  const follow = () => {
    if (/^https?:/i.test(href)) {
      window.open(href, '_blank');
    } else if (!SCHEME.test(href) && !href.startsWith('#')) {
      const reference = context.findFile(decodeURI(href));
      if (reference) {
        context.onOpenFile(reference.path, reference.line ?? undefined);
        return;
      }
      const path = decodeURI(href.replace(/#.*$/, '')).replace(
        /:\d+(:\d+)?$/,
        ''
      );
      if (path) context.onOpenFile(path);
    }
  };

  return (
    <a
      href={href}
      title={href}
      onClick={(event) => {
        event.preventDefault();
        follow();
      }}
      className="cursor-pointer text-project underline decoration-project/40 underline-offset-2 hover:decoration-project"
    >
      {children}
    </a>
  );
}

/** How long the copy button says it copied. */
const COPIED_MS = 1500;

/**
 * A fenced block, highlighted in the language its fence names.
 *
 * Plain until the grammar is here. Grammars are a chunk each, fetched on
 * first use — the editor's arrangement, and the same chunks — so the first
 * TypeScript block of a session is drawn plain for the moment the fetch
 * takes, and every one after it is colored from the start.
 */
function CodeBlock({ code, info }: { code: string; info: string }) {
  const description = useMemo(() => grammarFor(info), [info]);
  // The description keeps the grammar once it has loaded it, so the grammar
  // is read from there on every render; this only says a load finished.
  const [, setLoads] = useState(0);
  const grammar = description?.support ?? null;

  useEffect(() => {
    if (!description || description.support) return;
    let live = true;
    description.load().then(
      () => live && setLoads((count) => count + 1),
      // A grammar that will not load is a block without colors.
      () => {}
    );
    return () => {
      live = false;
    };
  }, [description]);

  const lines = useMemo(
    () => (grammar ? highlightLines(code, grammar) : null),
    [code, grammar]
  );

  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <div className="group/code relative">
      {/* Over the block's corner and only on hover, so it costs a block no
          room and a reply full of them no noise. Copies the code as the
          agent wrote it, without the fence or the highlighting. */}
      <button
        aria-label={copied ? 'Copied' : 'Copy'}
        title={copied ? 'Copied' : 'Copy'}
        onClick={() => {
          // A refused write leaves the button as it was: there is nothing
          // more useful to say about a clipboard that would not take it.
          navigator.clipboard.writeText(code).then(
            () => setCopied(true),
            () => {}
          );
        }}
        className={cn(
          'absolute top-1.5 right-1.5 flex size-6 cursor-pointer items-center justify-center rounded-md border border-pane-border bg-input text-fg-subtle opacity-0 transition-opacity group-hover/code:opacity-100 hover:text-fg',
          { 'opacity-100': copied }
        )}
      >
        {copied ? (
          <Check className="size-3.5 text-fg-success" />
        ) : (
          <Copy className="size-3.5" />
        )}
      </button>
      <pre className="overflow-x-auto rounded-md border border-pane-border bg-input px-3 py-2 font-mono text-[12.5px] leading-normal text-(--fd-syntax-plain)">
        <code>
          {lines
            ? lines.map((line, index) => (
                <span key={index}>
                  {index > 0 ? '\n' : null}
                  {line.map((part, at) =>
                    part.className ? (
                      <span key={at} className={part.className}>
                        {part.text}
                      </span>
                    ) : (
                      part.text
                    )
                  )}
                </span>
              ))
            : code}
        </code>
      </pre>
    </div>
  );
}
