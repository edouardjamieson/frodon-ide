export default function Welcome({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="drag-region flex h-full flex-col items-center justify-center gap-5 bg-app">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-fg">
          Frodon
        </h1>
        <p className="mt-1 text-[13px] text-fg-subtle">
          Open a folder to get started.
        </p>
      </div>

      <button
        onClick={onOpen}
        className="no-drag rounded-md bg-button-accent px-4 py-2 text-[13px] font-medium text-button-accent-fg hover:bg-button-accent-hover"
      >
        Open folder
      </button>
    </div>
  );
}
