import { useEffect, useMemo, useState } from 'react';
import {
  AGENT_LABELS,
  type AgentAvailability,
  type AgentChoice,
  type AgentKind,
} from '@shared/agent.def';
import {
  isValidAgentId,
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
import { useAgentStore } from '~/lib/agent';
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
 * How each coding agent starts: which copy runs, the permission mode a new
 * conversation begins in, and the model it begins with.
 *
 * One group per agent, because nothing here carries from one to another —
 * a Claude model id means nothing to any other agent. Every field is a
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
  const models = useKnownModels(kind);

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

      <Field
        label="Model"
        htmlFor={`settings-agent-${kind}-model`}
        hint={`The model a new conversation starts with, by ${label}'s own name for it. Empty for ${label}'s default.`}
      >
        <ModelInput
          id={`settings-agent-${kind}-model`}
          value={settings.model}
          models={models}
          onChange={(model) => change({ model })}
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

/**
 * The models open conversations of this kind have offered, for the model
 * field's suggestions. Only an agent can say which models it has, and only
 * once it is running; with no conversation open the field takes a name typed
 * by hand.
 */
function useKnownModels(kind: AgentKind): AgentChoice[] {
  const conversations = useAgentStore((state) => state.conversations);
  return useMemo(() => {
    const byId = new Map<string, AgentChoice>();
    for (const conversation of Object.values(conversations)) {
      if (conversation.kind !== kind) continue;
      for (const model of conversation.models) byId.set(model.id, model);
    }
    return [...byId.values()];
  }, [conversations, kind]);
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

/**
 * The model's id. Free text, with the models any open conversation has
 * offered as suggestions — the list is the agent's and changes without
 * Frodon, so it is a help and not a constraint. A keystroke that makes the
 * value something no agent spells a model as is not taken.
 */
function ModelInput({
  id,
  value,
  models,
  onChange,
}: {
  id: string;
  value: string | undefined;
  models: AgentChoice[];
  onChange: (next: string | undefined) => void;
}) {
  const list = `${id}-models`;
  return (
    <>
      <Input
        id={id}
        list={list}
        value={value ?? ''}
        spellCheck={false}
        autoComplete="off"
        placeholder="sonnet, opus, haiku…"
        className="w-72 font-mono text-xs"
        onChange={(event) => {
          const next = event.target.value.trim();
          if (!next) onChange(undefined);
          else if (isValidAgentId(next)) onChange(next);
        }}
      />
      <datalist id={list}>
        {models.map((model) => (
          <option key={model.id} value={model.id}>
            {model.label}
          </option>
        ))}
      </datalist>
    </>
  );
}
