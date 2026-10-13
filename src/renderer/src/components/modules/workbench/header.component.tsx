import { useProject } from '~/lib/project';
import GitControls from '~/components/modules/git';

export default function Header() {
  const { name, isOpen } = useProject();

  if (!isOpen) return <header className="h-12 shrink-0" />;

  return (
    <header className="flex h-11 shrink-0 items-center gap-2 pl-[96px] pr-2">
      <div className="flex items-center gap-2 group text-left shrink-0">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-project text-sm font-bold text-shadow-lg">
          {name.slice(0, 1).toUpperCase()}
        </div>
        <span className="text-xs font-semibold">{name}</span>
      </div>

      <div className="w-full h-full [-webkit-app-region:drag]"></div>

      <GitControls />
    </header>
  );
}
