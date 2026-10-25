/**
 * The tables behind the markdown page: which syntax nodes are blocks, and what
 * the `/` menu offers.
 */

/**
 * The nodes that are a *block* — the unit that turns back into source when the
 * cursor goes into it.
 *
 * The innermost one around the cursor wins, so a paragraph inside a list item
 * reveals that item's line and not the whole list. A list item itself is not
 * here: its paragraph is, and widening to whole lines brings the item's marker
 * along with it.
 */
export const BLOCK_NODES: ReadonlySet<string> = new Set([
  'Paragraph',
  'ATXHeading1',
  'ATXHeading2',
  'ATXHeading3',
  'ATXHeading4',
  'ATXHeading5',
  'ATXHeading6',
  'SetextHeading1',
  'SetextHeading2',
  'HorizontalRule',
  'LinkReference',
  'Task',
]);

/**
 * Blocks revealed whole, whichever part of them the cursor is in.
 *
 * A fence, a table or a run of HTML is one thing in source and one thing on
 * the page. Revealing a single row of a table would leave the other rows drawn
 * as a grid beside a line of pipes, which is neither.
 */
export const WHOLE_NODES: ReadonlySet<string> = new Set([
  'FencedCode',
  'CodeBlock',
  'Table',
  'HTMLBlock',
  'CommentBlock',
]);

/**
 * The HTML elements a page will draw. Everything a README uses to lay itself
 * out — alignment, sizes, keys, sub- and superscript, collapsible sections —
 * and nothing that runs, submits, or embeds another document.
 */
export const HTML_TAGS: ReadonlySet<string> = new Set([
  'a',
  'abbr',
  'article',
  'b',
  'blockquote',
  'br',
  'center',
  'code',
  'dd',
  'del',
  'details',
  'div',
  'dl',
  'dt',
  'em',
  'figcaption',
  'figure',
  'footer',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hr',
  'i',
  'ins',
  'kbd',
  'li',
  'mark',
  'ol',
  'p',
  'pre',
  's',
  'section',
  'small',
  'span',
  'strike',
  'strong',
  'sub',
  'summary',
  'sup',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'u',
  'ul',
]);

/**
 * Elements dropped with everything inside them, rather than unwrapped to
 * their text: a script's text is code, a style's is CSS, and the rest would
 * fetch or embed something on the page's behalf.
 */
export const HTML_DROPPED: ReadonlySet<string> = new Set([
  'audio',
  'base',
  'button',
  'canvas',
  'embed',
  'form',
  'frame',
  'frameset',
  'iframe',
  'input',
  'link',
  'math',
  'meta',
  'noscript',
  'object',
  'script',
  'select',
  'source',
  'style',
  'svg',
  'template',
  'textarea',
  'video',
]);

/**
 * Attributes that cross. Presentational only: no `style`, which can fetch, no
 * `class` or `id`, which would reach into the app's own stylesheet, and no
 * `on*`, which the CSP would refuse anyway.
 */
export const HTML_ATTRIBUTES: readonly string[] = [
  'align',
  'valign',
  'width',
  'height',
  'title',
  'colspan',
  'rowspan',
  'open',
  'start',
];

/**
 * Elements that open a region of the page when written alone on a line, the
 * way `<div align="center">` does — see `HtmlContainers`.
 */
export const HTML_CONTAINERS: ReadonlySet<string> = new Set([
  'article',
  'center',
  'details',
  'div',
  'figure',
  'footer',
  'header',
  'p',
  'section',
]);

/**
 * Inline tags drawn by hiding the tags and styling what is between them, when
 * they are written in a paragraph: `<kbd>⌘P</kbd>`.
 */
export const HTML_INLINE: ReadonlySet<string> = new Set([
  'a',
  'abbr',
  'b',
  'code',
  'del',
  'em',
  'i',
  'ins',
  'kbd',
  'mark',
  's',
  'small',
  'span',
  'strike',
  'strong',
  'sub',
  'sup',
  'u',
]);

/** Blocks whose inline content may hold HTML tags. */
export const INLINE_HOSTS: ReadonlySet<string> = new Set([
  'Paragraph',
  'ATXHeading1',
  'ATXHeading2',
  'ATXHeading3',
  'ATXHeading4',
  'ATXHeading5',
  'ATXHeading6',
  'SetextHeading1',
  'SetextHeading2',
  'Task',
]);

/** The glyph for a bullet, by how deeply its list is nested. */
export const BULLETS = ['•', '◦', '▪'] as const;

export interface SlashCommand {
  label: string;
  /** Matched as well as the label, so `/h1` and `/todo` both find something. */
  keywords: string;
  /** What stands in for an icon in the menu: a character or two. */
  badge: string;
  /** Written before the cursor. */
  before: string;
  /** Written after it. */
  after: string;
  /**
   * Wants an empty line above it. A `---` straight under a paragraph is not a
   * divider but a second-level heading of that paragraph, and a fence or a
   * table glued to the text above reads as part of it.
   */
  blankBefore?: boolean;
}

/**
 * What `/` offers, in the order it offers it.
 *
 * Each is a piece of markdown with a place for the cursor, not a node type:
 * the file is the document, and the menu is a way of typing into it without
 * remembering the syntax. Anything it writes is exactly what would have been
 * typed by hand.
 */
export const SLASH_COMMANDS: readonly SlashCommand[] = [
  {
    label: 'Text',
    keywords: 'paragraph plain',
    badge: 'T',
    before: '',
    after: '',
  },
  {
    label: 'Heading 1',
    keywords: 'h1 title',
    badge: 'H1',
    before: '# ',
    after: '',
  },
  {
    label: 'Heading 2',
    keywords: 'h2 subtitle',
    badge: 'H2',
    before: '## ',
    after: '',
  },
  {
    label: 'Heading 3',
    keywords: 'h3',
    badge: 'H3',
    before: '### ',
    after: '',
  },
  {
    label: 'Bulleted list',
    keywords: 'ul unordered bullet',
    badge: '•',
    before: '- ',
    after: '',
  },
  {
    label: 'Numbered list',
    keywords: 'ol ordered number',
    badge: '1.',
    before: '1. ',
    after: '',
  },
  {
    label: 'To-do',
    keywords: 'todo task checkbox check',
    badge: '☐',
    before: '- [ ] ',
    after: '',
  },
  {
    label: 'Quote',
    keywords: 'blockquote citation',
    badge: '❝',
    before: '> ',
    after: '',
  },
  {
    label: 'Code',
    keywords: 'fence snippet pre',
    badge: '{}',
    // The cursor lands on the fence, where the language goes. Enter from
    // there puts it on the empty line inside.
    before: '```',
    after: '\n\n```',
    blankBefore: true,
  },
  {
    label: 'Table',
    keywords: 'grid columns',
    badge: '▦',
    before: '| ',
    after: ' |  |\n| --- | --- |\n|  |  |',
    blankBefore: true,
  },
  {
    label: 'Divider',
    keywords: 'hr rule separator line',
    badge: '—',
    before: '---\n',
    after: '',
    blankBefore: true,
  },
  {
    label: 'Image',
    keywords: 'picture img',
    badge: '▣',
    before: '![](',
    after: ')',
  },
  {
    label: 'Link',
    keywords: 'url href',
    badge: '↗',
    before: '[',
    after: ']()',
  },
];
