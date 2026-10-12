import { useProject } from '~/lib/project';
import { ChevronDown } from 'lucide-react';
import GitControls from '~/components/git';

export default function Header() {
  const { name, isOpen, open } = useProject();

  if (!isOpen) return <header className="h-12 shrink-0" />;

  return (
    <header className="flex h-11 shrink-0 items-center gap-2 pl-[96px] pr-2">
      <button
        className="flex items-center gap-2 cursor-pointer group text-left shrink-0"
        onClick={open}
      >
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-project text-sm font-bold text-shadow-lg">
          {name.slice(0, 1).toUpperCase()}
        </div>
        <span className="text-xs font-semibold">{name}</span>
        <ChevronDown className="size-4 opacity-40 group-hover:opacity-100 transition-opacity" />
      </button>

      <div className="w-full h-full [-webkit-app-region:drag]"></div>

      <GitControls />
    </header>
  );
}
