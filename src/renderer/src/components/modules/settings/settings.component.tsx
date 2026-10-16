import { cn } from 'cn';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '~/components/ui';
import { useConfigSaveError } from '~/lib/config';
import { useProjectStore } from '~/lib/project';
import {
  SETTINGS_CATEGORIES,
  SETTINGS_SCOPES,
  useSettings,
  type SettingsCategory,
  type SettingsSection,
} from '~/lib/settings';
import SettingsAppearance from './settings-appearance.component';
import SettingsFeedback from './settings-feedback.component';
import SettingsProject from './settings-project.component';
import SettingsShortcuts from './settings-shortcuts.component';
import { InfoIcon } from 'lucide-react';

/**
 * The settings dialog: scope down the side, category under it, one page at a
 * time on the right.
 *
 * The sidebar is grouped by **scope** rather than sorted into one list, and
 * each group says which file it writes under its own name. That is the one
 * piece of this dialog that is not decoration: `.frodon/config.json` is
 * committed and `~/.frodon/config.json` is not, so "will my colleague get
 * this?" is a question the dialog should answer before it is asked, not one
 * a person has to go and look up.
 *
 * Nothing here has a Save button. Every control writes to the config store as
 * it is touched, and `useConfigSaveEffect` puts the file down once the
 * touching stops — so the only thing this dialog ever has to report is a
 * write that failed, which it does at the bottom.
 *
 * Mounted once, at the shell, and drawn only when it is open.
 */
export default function Settings() {
  const { open, section, setSection, close } = useSettings();
  const hasProject = useProjectStore((state) => state.root !== '');
  const saveError = useConfigSaveError();

  // On the launcher there is no project to have settings, so its group is not
  // offered — and a section left over from the last project is stepped past
  // rather than stored over, so reopening with a project lands back on it.
  const categories = SETTINGS_CATEGORIES.filter(
    (category) => hasProject || category.scope !== 'project'
  );
  const current =
    categories.find((category) => category.id === section) ?? categories[0]!;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogContent className="flex h-[34rem] max-h-[85vh] max-w-3xl gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogTitle className="sr-only">Settings</DialogTitle>
        <DialogDescription className="sr-only">
          Settings for this project and for you.
        </DialogDescription>

        <nav className="flex w-52 shrink-0 flex-col gap-5 overflow-y-auto border-r border-border bg-sidebar p-3">
          {SETTINGS_SCOPES.map((scope) => {
            const items = categories.filter(
              (category) => category.scope === scope.scope
            );
            if (items.length === 0) return null;

            return (
              <div key={scope.scope} className="flex flex-col gap-1">
                <div className="px-2 pb-1 flex items-center gap-2">
                  <scope.icon className="size-4 text-project" />
                  <p className="text-[11px] font-semibold tracking-wide text-fg">
                    {scope.label}
                  </p>
                  <Tooltip>
                    <TooltipTrigger className="ml-auto">
                      <InfoIcon className="size-3 text-neutral-500" />
                    </TooltipTrigger>
                    <TooltipContent>{scope.file}</TooltipContent>
                  </Tooltip>

                  {/* The whole point of the scope axis, in eight words.
                  <p className="font-mono text-[10px] text-fg-subtle">
            
                  </p> */}
                </div>

                {items.map((category) => (
                  <NavItem
                    key={category.id}
                    category={category}
                    active={category.id === current.id}
                    onSelect={setSection}
                  />
                ))}
              </div>
            );
          })}
        </nav>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="shrink-0 border-b border-border px-6 py-4">
            <h2 className="text-sm font-semibold text-fg">{current.label}</h2>
            <p className="mt-0.5 text-[11px] text-fg-subtle">
              {current.description}
            </p>
          </header>

          {/* Keyed on the section so each page mounts fresh — which is what
              resets a half-typed feedback draft, and what keeps a page from
              having to clear itself in an effect. */}
          <div key={current.id} className="min-h-0 flex-1 overflow-y-auto p-6">
            <Page section={current.id} />
          </div>

          {saveError ? (
            <footer className="shrink-0 border-t border-error-border/40 bg-overlay-elevated px-6 py-2.5 text-[11px] text-fg-danger">
              {saveError}
            </footer>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NavItem({
  category,
  active,
  onSelect,
}: {
  category: SettingsCategory;
  active: boolean;
  onSelect: (section: SettingsSection) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(category.id)}
      className={cn(
        'cursor-pointer rounded-md px-2 py-1.5 text-left text-[13px] transition-colors',
        active
          ? 'bg-project/20 text-fg'
          : 'text-fg-muted hover:bg-row-hover hover:text-fg'
      )}
    >
      {category.label}
    </button>
  );
}

/**
 * Which page is on screen.
 *
 * An exhaustive switch with no default, so a section added to
 * `SettingsSection` fails to compile until it has something to draw.
 */
function Page({ section }: { section: SettingsSection }) {
  switch (section) {
    case 'project.general':
      return <SettingsProject />;
    case 'user.appearance':
      return <SettingsAppearance />;
    case 'user.shortcuts':
      return <SettingsShortcuts />;
    case 'user.feedback':
      return <SettingsFeedback />;
  }
}
