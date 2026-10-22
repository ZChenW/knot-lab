// 23.P: a photo from the phone becomes the picture to trace. The listener, the QR code and
// the relay live in the desktop shell (src-tauri/src/handoff.rs); this asks for a code and
// collects what arrives. Desktop only.
export type PhoneMode = 'lan' | 'internet';
export interface PhoneCode {
  mode: PhoneMode;
  url: string;
  /** the QR code as SVG markup */
  qr: string;
  expires_in: number;
}
const invoke = async <T>(command: string, args?: Record<string, unknown>) =>
  (await import('@tauri-apps/api/core')).invoke<T>(command, args);

export const startPhone = (mode: PhoneMode, lang: string) =>
  invoke<PhoneCode>('handoff_start', { mode, lang });
export const stopPhone = () => invoke<void>('handoff_stop').catch(() => {});
/** The oldest photo that has arrived, null while none waits, 'closed' once the code is gone. */
export async function takePhoto(): Promise<Blob | null | 'closed'> {
  try {
    const bytes = await invoke<ArrayBuffer | number[]>('handoff_take');
    const data = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : Uint8Array.from(bytes);
    return data.byteLength ? new Blob([data], { type: imageType(data) }) : null;
  } catch (error) {
    if (String(error).startsWith('handoff.closed')) return 'closed';
    throw error;
  }
}
export function imageType(data: Uint8Array): string {
  if (data[0] === 0x89 && data[1] === 0x50) return 'image/png';
  if (data[0] === 0xff && data[1] === 0xd8) return 'image/jpeg';
  return 'image/webp';
}
/** The catalog key and parameter of an error from the shell, e.g. "handoff.bind_failed:…". */
export function phoneError(error: unknown): { key: string; p0: string } {
  const text = String(error);
  const [code, ...rest] = text.split(':');
  const key =
    {
      'handoff.no_network': 'phone.noNetwork',
      'handoff.bind_failed': 'phone.bindFailed',
      'handoff.no_tunnel': 'phone.noTunnel',
      'handoff.tunnel_failed': 'phone.tunnelFailed',
      'handoff.closed': 'phone.closed',
    }[code] ?? 'phone.bindFailed';
  return {
    key,
    p0: code in { 'handoff.no_network': 1, 'handoff.no_tunnel': 1 } ? '' : rest.join(':') || text,
  };
}
