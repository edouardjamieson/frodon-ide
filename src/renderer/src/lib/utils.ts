/**
 * The `utils` alias from `components.json`, kept alive on purpose.
 *
 * Current shadcn components import `cn` straight from the `cn` package, so
 * nothing in the tree imports this today. It exists because registry items
 * written against the older `@/lib/utils` convention still exist, and the CLI
 * rewrites that import to this path — without the file, such a component would
 * arrive with a broken import and no warning.
 */
export { cn } from 'cn';
