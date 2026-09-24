/**
 * The entry point the rest of the app uses to fire actions. `triggerActions` is
 * a plain function (it reads the config and project stores lazily) so it can be
 * called from anywhere a filesystem event happens — an editor save, an explorer
 * mutation — without threading state through. `useActions` is the thin React
 * wrapper for surfaces that also want to render run history.
 */

import { useActionsStore } from './actions.store';
import { useConfigStore } from '../config/config.store';
import { useProjectStore } from '../project';
import { matches, runAction } from './actions.service';
import type { ActionEvent } from './actions.def';
import type { ActionContext } from './actions.def';

/** The file facts a trigger needs; `oldPath` is only meaningful for renames. */
interface TriggerFile {
  path: string;
  oldPath?: string;
}

/**
 * Fires every configured action registered for `event` whose `match` accepts
 * the file. Blocking actions run in declared order and are awaited — so a
 * formatter finishes before the editor re-reads the file — while non-blocking
 * ones are launched detached. The returned promise settles once all blocking
 * actions have completed.
 */
export async function triggerActions(
  event: ActionEvent,
  file: TriggerFile
): Promise<void> {
  const projectRoot = useProjectStore.getState().path || process.cwd();
  const actions = useConfigStore.getState().config.actions ?? [];

  const ctx: ActionContext = {
    event,
    path: file.path,
    oldPath: file.oldPath,
    projectRoot,
  };

  const applicable = actions.filter((action) => matches(action, ctx));
  for (const action of applicable) {
    if (action.blocking) await runAction(action, ctx);
    else void runAction(action, ctx);
  }
}

/** Run history plus the trigger, for panels that show and drive actions. */
export const useActions = () => {
  const runs = useActionsStore((state) => state.runs);
  return { runs, trigger: triggerActions };
};
