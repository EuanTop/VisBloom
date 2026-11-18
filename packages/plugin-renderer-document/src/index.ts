import type { PluginManifest, RendererPlugin } from '@art/contracts';
import { createCanvasRenderer, type CanvasRendererOptions } from '../../plugin-renderer-canvas/src/index';

export const rendererManifest: PluginManifest = {
  id: 'renderer.document', kind: 'renderer', version: '0.1.0', apiVersion: '1',
  capabilities: ['document', 'html', 'svg', 'canvas2d', 'parameters', 'pick', 'scroll', 'capture.png'],
};
export type DocumentRendererOptions = CanvasRendererOptions;
export type { DocumentArtwork, DocumentArtworkContext, DocumentArtworkFactory } from './runtime';

/** The isolated-frame transport is shared; layout and capture belong to the runtime. */
export function createDocumentRenderer(options: DocumentRendererOptions): RendererPlugin {
  return { ...createCanvasRenderer({ ...options, title: '交互作品', label: 'Document' }), manifest: rendererManifest };
}
