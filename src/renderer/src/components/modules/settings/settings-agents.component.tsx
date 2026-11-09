import { useEffect, useState } from 'react';
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
import {
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui';
import { CONFIG_SAVE_MS, useUserConfig } from '~/lib/config';
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
 * One group per agent, because nothing here carries from one to another —
 * a Claude permission mode means nothing to any other agent. Every field is a
 * default: the pickers under a conversation still change it for that one
 * conversation, and a field left empty leaves the choice to the agent's own
 * configuration, the way a terminal would.
 */
export default function SettingsAgents() {
  return (
    <div className="flex flex-col gap-7">
      {(Object.keys(AGENT_LABELS) as AgentKind[]).map((kind) => (
        <AgentGroup key={kind} kind={kind} />
      ))}
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
    <FieldGroup title={label}>
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
    </FieldGroup>
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
