/**
 * shadcn's components, vendored.
 *
 * Third-party source living in-tree by design: `shadcn add` writes these
 * files, and they are meant to be edited rather than upgraded. They are the
 * one place in `src/renderer` that does not follow the `*.component.tsx`
 * naming, because the CLI decides those names and fighting it would mean
 * renaming every file on every add.
 *
 * They carry no Frodon colors of their own — their tokens are aliased onto
 * theme roles in `styles.css`, so they follow a theme switch like everything
 * else.
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
