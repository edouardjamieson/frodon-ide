import { cn } from 'cn';

/**
 * A count in a small square, as the header's git buttons carry them: commits
 * behind and ahead on pull and push, staged and changed files on the branch.
 *
 * In a file of its own because both the branch menu and the controls that
 * hold it draw one, and the controls already import the branch menu — the
 * square living in either of them would make the two import each other.
 *
 * Project-colored unless the caller says otherwise. A count stops at 9+, and
 * the square widens to take the extra character rather than squeezing it.
 */
export default function Indicator({
  count,
  className,
}: {
  count: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex h-[14px] items-center justify-center rounded-sm border border-project bg-project/30 text-[11px] font-bold text-project',
        count > 9 ? 'w-[18px]' : 'w-[14px]',
        className
      )}
    >
      {count > 9 ? '9+' : count}
    </div>
  );
}
