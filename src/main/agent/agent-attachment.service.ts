/**
 * What the renderer attached to a message, checked before any driver sees it.
 *
 * Both shapes are input. A path is checked to resolve inside the project and
 * to exist, and whether it is a folder is asked of the disk rather than taken
 * from the renderer. An image is checked against the formats and the size an
 * agent accepts, so a bad paste fails here, quietly, rather than failing the
 * agent's whole turn with an API error.
 */
import fsp from 'node:fs/promises';
import path from 'node:path';
import {
  AGENT_ATTACHMENT_LIMIT,
  AGENT_IMAGE_LIMIT,
  AGENT_IMAGE_TYPES,
  type AgentAttachment,
  type AgentImageType,
} from '@shared/agent.def';

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

function isImageType(value: unknown): value is AgentImageType {
  return AGENT_IMAGE_TYPES.some((type) => type === value);
}

export async function cleanAttachments(
  raw: unknown,
  root: string | null
): Promise<AgentAttachment[]> {
  if (!Array.isArray(raw)) return [];

  const cleaned = await Promise.all(
    raw.slice(0, AGENT_ATTACHMENT_LIMIT).map(async (item) => {
      const attachment = item as Partial<Record<string, unknown>>;
      if (attachment?.kind === 'path') return cleanPath(attachment.path, root);
      if (attachment?.kind === 'image') return cleanImage(attachment);
      return null;
    })
  );
  return cleaned.filter((item): item is AgentAttachment => item !== null);
}

async function cleanPath(
  value: unknown,
  root: string | null
): Promise<AgentAttachment | null> {
  if (!root || typeof value !== 'string') return null;
  const resolved = path.resolve(root, value);
  // The root itself is allowed — "the whole project" is a fair thing to
  // point at — and so is anything under it, and nothing else.
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;
  try {
    const stat = await fsp.stat(resolved);
    return { kind: 'path', path: resolved, isDir: stat.isDirectory() };
  } catch {
    return null;
  }
}

function cleanImage(
  attachment: Partial<Record<string, unknown>>
): AgentAttachment | null {
  const { mediaType, data, name } = attachment;
  if (
    typeof data !== 'string' ||
    !BASE64.test(data) ||
    !isImageType(mediaType)
  ) {
    return null;
  }
  // Decoded size from the encoded length: three bytes per four characters,
  // less the padding.
  const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0;
  if ((data.length / 4) * 3 - padding > AGENT_IMAGE_LIMIT) return null;

  return {
    kind: 'image',
    mediaType,
    data,
    name: typeof name === 'string' ? name.slice(0, 200) : 'image',
  };
}
