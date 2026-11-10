import { useEffect, useState } from 'react';
import { cn } from 'cn';
import {
  AGENT_LABELS,
  type AgentAvailability,
  type AgentChoice,
  type AgentKind,
} from '@shared/agent.def';
import {
  isValidAgentPath,
  MAX_AGENT_PATH_LENGTH,
  type AgentSettings,
} from '@shared/config.def';
import { ChevronRight } from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from '~/components/ui';
import { CONFIG_SAVE_MS, useUserConfig } from '~/lib/config';
import { AgentIcon } from '~/components/modules/agent';
import { Field, FieldGroup } from './settings-field.component';

/**
 * How long a path has to stop changing before the agent is looked for —
 * past `CONFIG_SAVE_MS`, so main reads a file that already holds it.
 */
const LOCATE_DELAY_MS = CONFIG_SAVE_MS + 200;

/**
 * Radix's select cannot hold an empty value, and "no choice" is the most
 * common one here — the agent's own settings deciding. So it gets a name
 * that no agent's mode id can collide with.
 */
const AGENT_DECIDES = '__agent__';

/**
 * How each coding agent starts: which copy runs, and the permission mode a
 * new conversation begins in.
 *
 * Each agent is a panel that folds, wearing its logo and, folded, whether it
 * was found and which version — a page meant to hold several agents should
 * show one line for each until one is opened.
 *
 * One group per agent, because nothing here carries from one to another —
 * a Claude permission mode means nothing to any other agent. Every field is a
 * default: the pickers under a conversation still change it for that one
 * conversation, and a field left empty leaves the choice to the agent's own
 * configuration, the way a terminal would.
 */
export default function SettingsAgents() {
  return (
    <div className="flex flex-col gap-7">
      <FieldGroup title="Conversations">
        <EnterSends />
      </FieldGroup>
      {(Object.keys(AGENT_LABELS) as AgentKind[]).map((kind) => (
        <AgentGroup key={kind} kind={kind} />
      ))}
    </div>
  );
}

/**
 * Which of Enter and Shift+Enter sends. One switch for every agent, above
 * the panels, because the composer is the same whichever agent is behind it.
 */
function EnterSends() {
  const { config, update } = useUserConfig();

  return (
    <div className="flex items-start justify-between gap-6">
      <div className="flex flex-col gap-1">
        <label
          htmlFor="settings-agent-enter"
          className="text-xs font-medium text-fg select-none"
        >
          Send with Enter
        </label>
        <p className="text-[11px] text-fg-subtle">
          Enter sends the message and Shift+Enter starts a new line. Off, it is
          the other way round, so a list of steps is not sent halfway.
        </p>
      </div>
      <Switch
        id="settings-agent-enter"
        checked={config.agentEnterSends ?? false}
        // Off is the absent value, as for word wrap: switching it off removes
        // the key rather than writing `false`.
        onCheckedChange={(checked) =>
          update({ agentEnterSends: checked ? true : undefined })
        }
      />
    </div>
  );
}

function AgentGroup({ kind }: { kind: AgentKind }) {
  const { config, update } = useUserConfig();
  const settings = config.agents?.[kind] ?? {};
  const label = AGENT_LABELS[kind];
  const found = useAvailability(kind, settings.path);

  /** Writes one field, dropping the agent's entry once nothing is left. */
  const change = (patch: Partial<AgentSettings>) => {
    const next: AgentSettings = { ...settings, ...patch };
    for (const key of Object.keys(next) as (keyof AgentSettings)[])
      if (next[key] === undefined) delete next[key];
    const agents = { ...config.agents };
    if (Object.keys(next).length > 0) agents[kind] = next;
    else delete agents[kind];
    update({ agents: Object.keys(agents).length > 0 ? agents : undefined });
  };

  return (
    <Collapsible className="rounded-lg border border-pane-border">
      <CollapsibleTrigger className="group/agent flex w-full cursor-pointer items-center gap-2.5 px-3 py-2.5 text-left">
        <ChevronRight className="size-3.5 shrink-0 text-fg-subtle transition-transform group-data-[state=open]/agent:rotate-90" />
        <AgentIcon kind={kind} className="size-4 shrink-0" />
        <span className="text-xs font-medium text-fg">{label}</span>
        {/* What the open panel would say first, so a closed one still
            answers the question this page is usually opened to ask: is the
            agent there, and which one is it. */}
        <span className="ml-auto min-w-0 truncate text-[11px]">
          {!found ? (
            <span className="text-fg-subtle">Looking…</span>
          ) : found.status === 'missing' ? (
            <span className="text-fg-danger">Not found</span>
          ) : (
            <span className="text-fg-subtle">{found.version}</span>
          )}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-4 border-t border-pane-border px-3 pt-3 pb-4">
        <Field
          label="Executable"
          htmlFor={`settings-agent-${kind}-path`}
          hint={<Located found={found} label={label} />}
        >
          <PathInput
            id={`settings-agent-${kind}-path`}
            value={settings.path}
            placeholder={
              found && found.status === 'ready' && !found.configured
                ? found.path
                : 'Found on your PATH'
            }
            onChange={(path) => change({ path })}
          />
        </Field>

        <Field
          label="Permissions"
          hint={`How much a new conversation asks before acting. The picker under a conversation still changes it for that one. Left to ${label}, its own settings decide, as they would in a terminal.`}
        >
          <ModeSelect
            modes={found?.modes ?? []}
            value={settings.permissionMode}
            agent={label}
            onChange={(permissionMode) => change({ permissionMode })}
          />
        </Field>
      </CollapsibleContent>
    </Collapsible>
  );
}

/**
 * Where main finds the agent, asked again whenever the path settles.
 *
 * After a delay rather than on every keystroke: each ask runs the agent's
 * `--version`, and a path half typed is a missing file on every letter.
 */
function useAvailability(
  kind: AgentKind,
  path: string | undefined
): AgentAvailability | null {
  const [found, setFound] = useState<AgentAvailability | null>(null);

  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      void window.frodon.agent.availability(kind).then((answer) => {
        if (live) setFound(answer);
      });
    }, LOCATE_DELAY_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [kind, path]);

  return found;
}

function Located({
  found,
  label,
}: {
  found: AgentAvailability | null;
  label: string;
}) {
  if (!found) return <>Looking for {label}…</>;
  if (found.status === 'missing')
    return <span className="text-fg-danger">{found.reason}</span>;
  return (
    <>
      {label} {found.version},{' '}
      {found.configured ? 'from this path' : 'found on your PATH'}. Left empty,
      the first one on your login shell&rsquo;s PATH runs.
      {found.builtFor && found.drift !== 'none' ? (
        <span
          className={cn('mt-1 block', {
            'text-fg-danger': found.drift === 'line',
          })}
        >
          {found.drift === 'line'
            ? `Frodon was built for ${label} ${found.builtFor}. Versions this far apart may not understand each other — update one or the other if conversations fail to start or behave oddly.`
            : `Frodon was built for ${label} ${found.builtFor}. Versions a patch apart work together.`}
        </span>
      ) : null}
    </>
  );
}

/**
 * The executable's path. Held as typed, and stored only once it is an
 * absolute path — `~/bin/claude` is a path to a shell, not to a process, and
 * storing it would give main something it cannot spawn.
 */
function PathInput({
  id,
  value,
  placeholder,
  onChange,
}: {
  id: string;
  value: string | undefined;
  placeholder: string;
  onChange: (next: string | undefined) => void;
}) {
  const [draft, setDraft] = useState(value ?? '');
  const invalid = draft.trim() !== '' && !isValidAgentPath(draft);

  return (
    <div className="flex flex-col gap-1">
      <Input
        id={id}
        value={draft}
        spellCheck={false}
        autoComplete="off"
        maxLength={MAX_AGENT_PATH_LENGTH}
        placeholder={placeholder}
        aria-invalid={invalid}
        className="font-mono text-xs"
        onChange={(event) => {
          const next = event.target.value;
          setDraft(next);
          if (!next.trim()) onChange(undefined);
          else if (isValidAgentPath(next)) onChange(next);
        }}
      />
      {invalid ? (
        <p className="text-[11px] text-fg-danger">
          An absolute path, starting with /. Not saved until it is one.
        </p>
      ) : null}
    </div>
  );
}

function ModeSelect({
  modes,
  value,
  agent,
  onChange,
}: {
  modes: AgentChoice[];
  value: string | undefined;
  agent: string;
  onChange: (next: string | undefined) => void;
}) {
  // A mode saved by hand that this agent does not offer is still shown, by
  // its id, rather than silently reading as "left to the agent".
  const unknown = value && !modes.some((mode) => mode.id === value);

  return (
    <Select
      value={value ?? AGENT_DECIDES}
      onValueChange={(next) =>
        onChange(next === AGENT_DECIDES ? undefined : next)
      }
    >
      <SelectTrigger className="w-72">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={AGENT_DECIDES}>Left to {agent}</SelectItem>
        {modes.map((mode) => (
          <SelectItem key={mode.id} value={mode.id}>
            {mode.label} — {mode.description}
          </SelectItem>
        ))}
        {unknown ? <SelectItem value={value}>{value}</SelectItem> : null}
      </SelectContent>
    </Select>
  );
}
