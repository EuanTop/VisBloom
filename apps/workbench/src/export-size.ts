import { validCaptureSize } from '@art/contracts';
export const exportSizePresets = [
  { id: 'landscape', label: '横向 · 16:9', width: 1920, height: 1080 },
  { id: 'portrait', label: '竖向 · 9:16', width: 1080, height: 1920 },
  { id: 'poster', label: '长海报', width: 1440, height: 6400 },
  { id: 'square', label: '方形 · 1:1', width: 1600, height: 1600 },
] as const;

/** Match the capture service's integer bounds without silently changing a size. */
export function parseExportSize(width: string, height: string): { width: number; height: number } | null {
  const values = [width, height].map(value => /^\d+$/.test(value.trim()) ? Number(value) : NaN);
  if (!validCaptureSize(values[0],values[1])) return null;
  return { width: values[0], height: values[1] };
}
