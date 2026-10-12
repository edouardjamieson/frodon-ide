import { Dither } from '~/components/ui';
import { useTheme } from '~/lib/theme';

export default function Welcome({ onOpen }: { onOpen: () => void }) {
  const theme = useTheme();

  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 bg-app">
      <div className="text-center z-10">
        <h1 className="text-2xl font-semibold tracking-tight text-fg">
          Frodon
        </h1>
        <p className="mt-1 text-[13px] text-fg-subtle">
          Open a folder to get started.
        </p>
      </div>

      <button
        onClick={onOpen}
        className="no-drag z-10 rounded-md bg-button-accent px-4 py-2 text-[13px] font-medium text-button-accent-fg hover:bg-button-accent-hover"
      >
        Open folder
      </button>

      <div
        style={{
          width: '100%',
          height: '100%',
          position: 'absolute',
          opacity: 0.3,
          zIndex: 0,
        }}
      >
        <Dither
          waveColor="#a7a7a7ff"
          backgroundColor={theme.colors.appBg}
          ditherMode="bayer"
          className="pointer-events-none"
          colorNum={4}
          pixelSize={2}
          waveSpeed={0.05}
          waveFrequency={3}
          waveAmplitude={0.24}
          mouseEffect="reveal"
          mouseRadius={0.3}
          palette={[]}
          scale={1}
          contrast={1}
          brightness={-0.18}
          mouseStrength={0.3}
          trail={0.5}
          enableMouseInteraction
          clickRipple={false}
          intro
          disableAnimation={false}
        />
      </div>
    </div>
  );
}
