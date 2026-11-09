import * as React from 'react';
import { cn } from 'cn';
import { ScrollArea as ScrollAreaPrimitive } from 'radix-ui';

/**
 * `fitWidth`: Radix wraps the content in a div styled `display: table`
 * inline, which grows to the widest row — so rows that should truncate
 * never do, and push whatever sits at their end out of view. This makes the
 * wrapper a block, which takes `!important` to beat an inline style. For any
 * list of rows that truncate; see docs/learned.md.
 */
function ScrollArea({
  className,
  children,
  fitWidth,
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.Root> & {
  fitWidth?: boolean;
}) {
  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      className={cn(
        'relative',
        fitWidth && '[&_[data-radix-scroll-area-viewport]>div]:block!',
        className
      )}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        data-slot="scroll-area-viewport"
        className="size-full rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1"
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
}

function ScrollBar({
  className,
  orientation = 'vertical',
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>) {
  return (
    <ScrollAreaPrimitive.ScrollAreaScrollbar
      data-slot="scroll-area-scrollbar"
      orientation={orientation}
      className={cn(
        'flex touch-none p-px transition-colors select-none',
        orientation === 'vertical' &&
          'h-full w-2.5 border-l border-l-transparent',
        orientation === 'horizontal' &&
          'h-2.5 flex-col border-t border-t-transparent',
        className
      )}
      {...props}
    >
      <ScrollAreaPrimitive.ScrollAreaThumb
        data-slot="scroll-area-thumb"
        className="relative flex-1 rounded-full bg-border"
      />
    </ScrollAreaPrimitive.ScrollAreaScrollbar>
  );
}

export { ScrollArea, ScrollBar };
