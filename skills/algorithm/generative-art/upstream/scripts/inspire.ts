#!/usr/bin/env bun
/**
 * generative-art/scripts/inspire.ts — Get creative brief for generative art.
 *
 * Usage: bun scripts/inspire.ts --style ink-wash
 *
 * Returns: Design DNA, palette, algorithm recommendation, parameter ranges,
 *          and generative-art-specific composition suggestions for the given style.
 */

import { runCLI, parseStyleFormat } from '../../_creative-shared/scripts/base';

const { style, format } = parseStyleFormat('generative');

if (!style) {
  console.error('Usage: bun scripts/inspire.ts --style <slug>');
  console.error('Example: bun scripts/inspire.ts --style ink-wash');
  process.exit(1);
}

process.exit(runCLI(['inspire', '--style', style, '--format', format]));
