/**
 * Vendored components — shadcn's, and React Bits' for the few visual pieces
 * shadcn has no equivalent of.
 *
 * Third-party source living in-tree by design: `shadcn add` writes these
 * files, and they are meant to be edited rather than upgraded. They are the
 * one place in `src/renderer` that does not follow the `*.component.tsx`
 * naming, because the CLI decides those names — including the PascalCase the
 * React Bits registry uses — and fighting it would mean renaming every file
 * on every add.
 *
 * They carry no Frodon colors of their own — shadcn's tokens are aliased onto
 * theme roles in `styles.css`, so they follow a theme switch like everything
 * else, and `Dither` paints a canvas from colors its caller hands it.
 *
 * Adding a component means adding a line here. The CLI will not do it.
 */
export { Button, buttonVariants } from './button';
export { Checkbox } from './checkbox';
export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from './dialog';
export { default as Dither } from './Dither';
export type { DitherMode, DitherMouseEffect, DitherProps } from './Dither';
export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from './dropdown-menu';
export { Input } from './input';
export { Label } from './label';
export {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from './resizable';
export { ScrollArea, ScrollBar } from './scroll-area';
export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from './select';
export { Separator } from './separator';
export { Switch } from './switch';
export {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  tabsListVariants,
} from './tabs';
export {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './tooltip';
