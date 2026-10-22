import { t } from '../i18n';
import type { ExportFonts } from '../core/export';
import math from '@fontsource/stix-two-text/files/stix-two-text-latin-400-normal.woff2?url&inline';
import mathItalic from '@fontsource/stix-two-text/files/stix-two-text-latin-400-italic.woff2?url&inline';
import mathSemibold from '@fontsource/stix-two-text/files/stix-two-text-latin-600-normal.woff2?url&inline';
import ui from '@fontsource-variable/instrument-sans/files/instrument-sans-latin-wght-normal.woff2?url&inline';

export const exportFonts: ExportFonts = { math, mathItalic, mathSemibold, ui };

export async function rasterize(svg: string, scale = 2): Promise<Blob> {
  const faces: FontFace[] = [];
  let url: string | undefined;
  try {
    const xml = new DOMParser().parseFromString(svg, 'image/svg+xml');
    if (xml.querySelector('parsererror') || xml.documentElement.localName !== 'svg')
      throw new Error(t('export.invalidSVG'));
    const width = Number(xml.documentElement.getAttribute('width'));
    const height = Number(xml.documentElement.getAttribute('height'));
    if (![width, height, scale].every((v) => Number.isFinite(v) && v > 0))
      throw new Error(t('export.invalidSize'));
    // Load every embedded face before constructing the image, including italic math.
    for (const rule of (xml.querySelector('style')?.textContent ?? '').matchAll(
      /@font-face\s*\{([^}]+)\}/g,
    )) {
      const family = /font-family:\s*'([^']+)'/.exec(rule[1])?.[1];
      const source = /src:\s*(url\([^)]+\)\s*format\('[^']+'\))/.exec(rule[1])?.[1];
      if (!family || !source) throw new Error(t('export.invalidFont'));
      const face = new FontFace(family, source, {
        weight: /font-weight:\s*([^;]+)/.exec(rule[1])?.[1],
        style: /font-style:\s*([^;]+)/.exec(rule[1])?.[1],
      });
      faces.push(face);
    }
    await Promise.all(faces.map((face) => face.load()));
    faces.forEach((face) => document.fonts.add(face));
    await document.fonts.ready;
    url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error(t('export.loadSVG')));
      image.src = url!;
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const context = canvas.getContext('2d');
    if (!context) throw new Error(t('export.canvas'));
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error(t('export.png')))), 'image/png'),
    );
  } catch (error) {
    throw new Error(
      t('files.exportFailure', { reason: error instanceof Error ? error.message : String(error) }),
    );
  } finally {
    if (url) URL.revokeObjectURL(url);
    faces.forEach((face) => document.fonts.delete(face));
  }
}
export function blobDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error(t('files.exportFailure', { reason: t('export.readImage') })));
    reader.onerror = () => reject(new Error(t('files.exportFailure', { reason: t('export.readImage') })));
    reader.readAsDataURL(blob);
  });
}
