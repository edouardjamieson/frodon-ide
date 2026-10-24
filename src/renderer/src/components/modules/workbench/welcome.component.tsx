import { FolderOpen } from 'lucide-react';
import { Button, Silk } from '~/components/ui';
import AnimatedLogo from '~/components/utils/animated-logo';
import { useTheme } from '~/lib/theme';
import UpdateButton from '~/components/modules/update';
import WelcomeRecents from './welcome-recents.component';
import { useState } from 'react';

export default function Welcome({ onOpen }: { onOpen: () => void }) {
  const theme = useTheme();
  const [logoTint, setLogoTint] = useState<string | undefined>(undefined);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 bg-app">
      <div className="absolute top-0 left-0 w-full h-11 [-webkit-app-region:drag]" />

      {/* Top right, clear of the traffic lights, and above the drag strip so
          it can still be clicked. */}
      <div className="absolute top-2 right-2 z-20">
        <UpdateButton />
      </div>

      <div className="flex flex-col items-center text-center z-10">
        <AnimatedLogo className="w-16" outlineColor={logoTint} />

        <p className="mt-4 text-[13px] text-fg-subtle">
          Open a project to get started.
        </p>
      </div>

      <Button
        variant={'outline'}
        className="cursor-pointer z-10"
        onClick={onOpen}
      >
        <FolderOpen />
        <span>Open project</span>
      </Button>

      {/* Below the button, not instead of it: the picker is the way in that
          always works, and the list is the shortcut past it. */}
      <WelcomeRecents onColorChange={(c) => setLogoTint(c ?? undefined)} />

      <div
        style={{
          width: '100%',
          height: '100%',
          position: 'absolute',
          opacity: 0.3,
          zIndex: 0,
          pointerEvents: 'none',
        }}
      >
        <Silk
          color={'#141414ff'}
          sheenColor={theme.colors.fg}
          lightMode={!theme.dark}
          className="pointer-events-none"
          speed={2}
          scale={0.7}
          noiseIntensity={1.2}
          depth={0.6}
          glow={0.25}
          sheen={0.4}
          ripple={1.4}
          fade={0.35}
          mouseInteraction={false}
          clickRipple={false}
          intro={false}
        />
      </div>
    </div>
  );
}
