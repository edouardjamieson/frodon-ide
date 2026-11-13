import type { PocketFile } from './pocket.def';

/**
 * The files in a drop, as the pocket keeps them. Anything without a path —
 * an image dragged off a web page arrives as a `File` too — is left out:
 * the point of keeping a file is handing its path to something later, and
 * holding the bytes of one that has none would make the pocket a place
 * files live rather than a place they are pointed at.
 */
export function pocketFiles(list: FileList): PocketFile[] {
  return Array.from(list).flatMap((file) => {
    const path = window.frodon.file.pathOf(file);
    if (!path) return [];
    return [
      {
        id: crypto.randomUUID(),
        path,
        name: file.name,
        preview: file.type.startsWith('image/')
          ? URL.createObjectURL(file)
          : null,
      },
    ];
  });
}

/**
 * A path as a shell reads it: bare when it is only safe characters, single
 * quoted otherwise. What a terminal is handed when a file is dragged out of
 * the pocket into it — an agent reading a prompt and a shell reading a
 * command line both want a path with a space in it to stay one word.
 */
export function shellQuote(path: string): string {
  if (/^[\w@%+=:,./-]+$/.test(path)) return path;
  return `'${path.replaceAll("'", `'\\''`)}'`;
}

/** Done with a file's thumbnail, so its bytes can go. */
export function release(file: PocketFile) {
  if (file.preview) URL.revokeObjectURL(file.preview);
}
