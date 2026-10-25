import { ExternalLink } from 'lucide-react';
import AnimatedLogo from '~/components/utils/animated-logo';
import { useAppInfo } from '~/lib/app';
import { useUpdateStore } from '~/lib/update';
import { describeUpdate } from '@shared/update.def';
import type { Platform } from '@shared/ipc.def';
import { FieldGroup } from './settings-field.component';

/**
 * Which Frodon this is, what it is running on, and where it comes from.
 *
 * The versions used to sit under the feedback form, as something to paste
 * into a report. Main writes them into the issue itself now, so they moved
 * here, where they answer the question people actually ask of them — "which
 * build am I on, and why have I not got the new one" — without a form around
 * them.
 *
 * Everything comes from `app:info`, which main answers once at startup, and
 * from the updater's store. The repository link is main's `RELEASE_REPO`
 * rather than a URL written here, so a fork's About page points at the fork.
 * It opens in the system browser through the window's open handler — see
 * `main/app/window.service.ts` — never inside this window.
 */
export default function SettingsAbout() {
  const info = useAppInfo();
  const update = useUpdateStore((store) => store.state);

  return (
    <div className="flex flex-col gap-7">
      <div className="flex items-center gap-4 rounded-lg border border-project/15 bg-overlay-elevated p-4">
        <AnimatedLogo className="w-14 shrink-0" />
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-base font-semibold text-fg">Frodon</span>
          <span className="text-[12px] text-fg-muted tabular-nums select-text">
            Version {info?.version ?? '—'}
          </span>
          <span className="text-[11px] text-fg-subtle">
            {describeUpdate(update)}
          </span>
        </div>
      </div>

      <FieldGroup title="Running on">
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-[11px] select-text">
          <Fact
            label="Platform"
            value={
              info
                ? `${PLATFORM_NAMES[info.platform]} ${info.osRelease} (${info.arch})`
                : '—'
            }
          />
          <Fact label="Electron" value={info?.versions.electron ?? '—'} />
          <Fact label="Chromium" value={info?.versions.chrome ?? '—'} />
          <Fact label="Node" value={info?.versions.node ?? '—'} />
        </dl>
      </FieldGroup>

      <FieldGroup title="Source">
        {info ? (
          <a
            href={info.repository}
            target="_blank"
            rel="noreferrer"
            className="flex w-fit items-center gap-1.5 text-[12px] text-fg-muted transition-colors hover:text-project"
          >
            {info.repository.replace(/^https:\/\//, '')}
            <ExternalLink className="size-3.5" />
          </a>
        ) : null}
        <p className="text-[11px] text-fg-subtle">
          Releases, the issue tracker, and the code. A fork that changes where
          its updates come from changes this link with them.
        </p>
      </FieldGroup>
    </div>
  );
}

/**
 * What each platform is called by the people using it. The release beside
 * it is the kernel's — `25.5.0` on macOS — because that is what main can ask
 * for without a shell-out, and it is what a bug report needs anyway.
 */
const PLATFORM_NAMES: Record<Platform, string> = {
  darwin: 'macOS',
  win32: 'Windows',
  linux: 'Linux',
};

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-fg-subtle">{label}</dt>
      <dd className="text-fg-muted tabular-nums">{value}</dd>
    </>
  );
}
