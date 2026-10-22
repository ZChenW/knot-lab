import { t, type Key } from '../i18n';
export const isDesktop = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
export interface FileFilter {
  name: string;
  extensions: string[];
}
const knotFilter = (): FileFilter => ({ name: t('filter.knot'), extensions: ['knot'] });
const fileName = (path: string) => path.split(/[\\/]/).at(-1)!;
const failure = (action: Key, reason: unknown) =>
  new Error(t(action, { reason: reason instanceof Error ? reason.message : String(reason) }));
function requireDesktop() {
  if (!isDesktop) throw new Error(t('files.desktop'));
}
interface Pick {
  save: boolean;
  title: string;
  /** where the dialog starts the first time; it then remembers the folder per place */
  place: 'documents' | 'pictures';
  name?: string;
  filter: FileFilter;
}
// The app's own dialog command (the KDE file dialog); where that is not available,
// the dialog plugin, which goes through the desktop portal.
async function pick({ save, title, place, name, filter }: Pick): Promise<string | null> {
  const { invoke } = await import('@tauri-apps/api/core');
  try {
    return await invoke<string | null>('pick_path', {
      save,
      title,
      place,
      name: name ?? null,
      filter: filter.name,
      extensions: filter.extensions,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    if (reason.startsWith('exists:')) {
      throw new Error(t('files.exists', { name: fileName(reason.slice('exists:'.length)) }));
    }
    if (error !== 'unavailable') throw error;
  }
  const dialog = await import('@tauri-apps/plugin-dialog');
  if (save) return dialog.save({ title, defaultPath: name, filters: [filter] });
  const path = await dialog.open({ title, filters: [filter], multiple: false, directory: false });
  if (Array.isArray(path)) throw new Error(t('files.chooseOne'));
  return path;
}
// 14.H: browser files have names but no writable paths.
function openWebText(): Promise<{ name: string; text: string } | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.knot,application/json';
    input.hidden = true;
    const cleanup = () => {
      input.onchange = null;
      input.oncancel = null;
      input.remove();
    };
    input.oncancel = () => {
      cleanup();
      resolve(null);
    };
    input.onchange = () => {
      const file = input.files?.[0];
      cleanup();
      if (!file) resolve(null);
      else file.text().then((text) => resolve({ name: file.name, text }), reject);
    };
    try {
      document.body.append(input);
      input.click();
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}
// Inside a Claude artifact the page cannot start a download itself: the host's
// `downloads` capability asks the viewer and saves for it. Its allowlist has no
// `.knot`, so a diagram goes out as `.knot.json` — it is JSON, and Open accepts it.
interface HostDownloads {
  save(request: { filename: string; data: Blob }): Promise<unknown>;
}
async function hostDownloads(): Promise<HostDownloads | null> {
  const claude = (globalThis as { claude?: { use?: (name: string) => Promise<unknown> } }).claude;
  if (typeof claude?.use !== 'function') return null;
  try {
    return ((await claude.use('downloads')) as HostDownloads | null) ?? null;
  } catch {
    return null;
  }
}
/** The name the file went out under, or `null` when the viewer declined it. */
async function download(blob: Blob, name: string): Promise<string | null> {
  const host = await hostDownloads();
  if (host) {
    const filename = /\.knot$/i.test(name) ? `${name}.json` : name;
    try {
      await host.save({ filename, data: blob });
      return filename;
    } catch (error) {
      const refusal = error as { code?: string; message?: string } | null;
      if (refusal?.code === 'declined') return null;
      throw new Error(refusal?.message || refusal?.code || String(error));
    }
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  try {
    document.body.append(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    // Let the browser consume the URL before releasing it.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  return name;
}
export async function openText(): Promise<{ name: string; path?: string; text: string } | null> {
  try {
    if (!isDesktop) return await openWebText();
    const path = await pick({
      save: false,
      title: t('dialog.open'),
      place: 'documents',
      filter: knotFilter(),
    });
    if (path === null) return null;
    const { readTextFile } = await import('@tauri-apps/plugin-fs');
    return { name: fileName(path), path, text: await readTextFile(path) };
  } catch (error) {
    throw failure('files.openFailure', error);
  }
}
const imageTypes: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  avif: 'image/avif',
};
/** The picture to trace over, chosen in the same dialog as every other file. */
export async function openImage(): Promise<File | null> {
  try {
    requireDesktop();
    const path = await pick({
      save: false,
      title: t('dialog.picture'),
      place: 'pictures',
      filter: { name: t('filter.pictures'), extensions: Object.keys(imageTypes) },
    });
    if (path === null) return null;
    const name = fileName(path);
    const type = imageTypes[name.split('.').at(-1)!.toLowerCase()];
    if (!type) throw new Error(t('status.notPicture', { name }));
    const { readFile } = await import('@tauri-apps/plugin-fs');
    return new File([await readFile(path)], name, { type });
  } catch (error) {
    throw failure('files.imageFailure', error);
  }
}
export async function saveText(
  text: string,
  suggestedName: string,
): Promise<{ name: string; path?: string } | null> {
  try {
    if (!isDesktop) {
      const name = await download(new Blob([text], { type: 'application/json' }), suggestedName);
      return name === null ? null : { name };
    }
    const path = await pick({
      save: true,
      title: t('dialog.save'),
      place: 'documents',
      name: suggestedName,
      filter: knotFilter(),
    });
    if (path === null) return null;
    const { writeTextFile } = await import('@tauri-apps/plugin-fs');
    await writeTextFile(path, text);
    return { name: fileName(path), path };
  } catch (error) {
    throw failure('files.saveFailure', error);
  }
}
export async function writeText(path: string, text: string): Promise<void> {
  try {
    if (!isDesktop) {
      await download(new Blob([text], { type: 'application/json' }), fileName(path));
      return;
    }
    const { writeTextFile } = await import('@tauri-apps/plugin-fs');
    await writeTextFile(path, text);
  } catch (error) {
    throw failure('files.saveFailure', error);
  }
}
export async function saveBytes(
  bytes: Uint8Array,
  suggestedName: string,
  filter: FileFilter,
): Promise<string | null> {
  try {
    if (!isDesktop) {
      const type = filter.extensions.includes('svg')
        ? 'image/svg+xml'
        : filter.extensions.includes('png')
          ? 'image/png'
          : 'application/octet-stream';
      return await download(new Blob([new Uint8Array(bytes)], { type }), suggestedName);
    }
    const path = await pick({
      save: true,
      title: t('dialog.export'),
      place: 'pictures',
      name: suggestedName,
      filter,
    });
    if (path === null) return null;
    const { writeFile } = await import('@tauri-apps/plugin-fs');
    await writeFile(path, bytes);
    return fileName(path);
  } catch (error) {
    throw failure('files.exportFailure', error);
  }
}
export async function setTitle(name: string | null, dirty = false): Promise<void> {
  try {
    if (!isDesktop) return;
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().setTitle(name ? `${dirty ? '• ' : ''}${name} — Knot Lab` : 'Knot Lab');
  } catch (error) {
    throw failure('files.titleFailure', error);
  }
}
