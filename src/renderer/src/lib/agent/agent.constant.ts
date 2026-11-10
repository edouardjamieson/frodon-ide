import type { AgentKind } from '@shared/agent.def';

/**
 * The agent a new conversation talks to.
 *
 * A constant while there is one driver. With a second, the tile's `+` becomes
 * a choice and this becomes the person's default — a user setting, since
 * which agent you pay for is not something a project should decide.
 */
export const DEFAULT_AGENT: AgentKind = 'claude';
