import { cn } from 'cn';
import { Fragment } from 'react/jsx-runtime';
import { useAppStore } from '~/lib/app';

interface KeyboardKeyProps {
  val?: string;
  isMod?: boolean;
  className?: string;
}

interface KeyboardKeysProps {
  vals: Omit<KeyboardKeyProps, 'className'>[];
  className?: string;
}

export function KeyboardKey({ val, isMod, className }: KeyboardKeyProps) {
  const { info } = useAppStore();
  const value = isMod
    ? info?.platform === 'darwin'
      ? '⌘'
      : 'ctrl'
    : val
      ? val.toLocaleLowerCase()
      : '';

  if (value?.length === 0) return null;
  return (
    <div
      className={cn(
        'h-5 bg-gradient-to-br z-10 from-neutral-700 text-xs to-neutral-950 to-neutral-950 border rounded-sm text-neutral-100 px-1.5 flex items-center justify-center font-semibold',
        className
      )}
    >
      {value}
    </div>
  );
}

export function KeyboardKeys({ vals, className }: KeyboardKeysProps) {
  return (
    <div className={cn('flex items-center gap-0.5', className)}>
      {vals.map((key, i) => (
        <Fragment key={i}>
          <KeyboardKey {...key} />
          {i < vals.length - 1 ? (
            <span className="text-xs text-neutral-500 font-bold">+</span>
          ) : null}
        </Fragment>
      ))}
    </div>
  );
}
