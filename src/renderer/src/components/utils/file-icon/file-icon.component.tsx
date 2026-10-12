import { cn } from 'cn';
import { iconForFile } from './file-icon.service';
import type { FileIconProps } from './file-icon.def';

/**
 * The icon for a file or directory, chosen from its name.
 *
 * Deliberately colorless: the SVG inherits `currentColor`, so it takes the
 * color of whatever row it sits in and changes with the theme, with selection,
 * and with the eventual git status coloring — without this component knowing
 * that any of those exist.
 */
export default function FileIcon({
  file,
  open = false,
  className,
}: FileIconProps) {
  const Icon = iconForFile(file, open);

  return (
    // `static-components` reads `iconForFile` as building a component here and
    // warns that its state would reset. It does not build one: it picks from a
    // fixed set of lucide components created at module load, and the same file
    // always yields the same reference, so there is no identity to churn. The
    // rule cannot see through the lookup, and lucide icons hold no state to
    // lose either way.
    // eslint-disable-next-line react-hooks/static-components
    <Icon
      aria-hidden
      // Thinner than lucide's default 2: at 14px a 2px stroke fills in the
      // detail that distinguishes one file shape from another.
      // strokeWidth={1.75}
      className={cn('size-4 shrink-0 text-neutral-500', className)}
    />
  );
}
