import { zh } from './zh';
import { en } from './en';

export type Lang = 'zh' | 'en';
export type Key = keyof typeof zh;
export type Params = Record<string, string | number | bigint>;
const storageKey = 'knot-lab.lang';
const listeners = new Set<() => void>();
function initialLanguage(): Lang {
  try {
    const stored = globalThis.localStorage?.getItem(storageKey);
    if (stored === 'zh' || stored === 'en') return stored;
  } catch {
    // Private windows and embedded webviews may deny storage access.
  }
  if (typeof navigator === 'undefined') return 'en';
  const first = (navigator.languages ?? [navigator.language])[0];
  return first?.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}
let language = initialLanguage();
function updateDocument() {
  if (typeof document !== 'undefined') document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
}
updateDocument();
export const getLang = (): Lang => language;
export function setLang(lang: Lang) {
  if (lang !== 'zh' && lang !== 'en') return;
  try {
    globalThis.localStorage?.setItem(storageKey, lang);
  } catch {
    // Language switching still works without persistence.
  }
  if (language === lang) return;
  language = lang;
  updateDocument();
  listeners.forEach((listener) => listener());
}
export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function t(key: Key, params: Params = {}): string {
  return (language === 'zh' ? zh : en)[key].replace(/\{(\w+)\}/g, (token, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : token,
  );
}
