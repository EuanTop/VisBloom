#!/usr/bin/env bun
/**
 * generative-art/scripts/scaffold.ts — Scaffold a new generative art project.
 *
 * Usage: bun scripts/scaffold.ts ./art --algorithm flow-field --style ink-wash
 *
 * Creates: p5.js sketch, style CSS, HTML wrapper with canvas.
 * After scaffolding, TUNE parameters in the sketch file — the scaffold sets
 * sensible defaults, but the art comes from parameter exploration.
 */

import { runCLI } from '../../_creative-shared/scripts/base';

const args = process.argv.slice(2);

if (args.length === 0) {
  console.error('Usage: bun scripts/scaffold.ts <dir> [--algorithm <name>] [--style <slug>] [--seed <int>]');
  console.error('Algorithms: flow-field, particle-system, voronoi, cellular-automata, fractal, wave');
  process.exit(1);
}

process.exit(runCLI(['generative', 'new', ...args]));
