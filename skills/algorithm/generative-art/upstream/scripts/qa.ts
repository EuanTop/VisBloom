#!/usr/bin/env bun
/**
 * generative-art/scripts/qa.ts — Run quality checks on a generative art project.
 *
 * Usage: bun scripts/qa.ts [dir]
 *
 * Checks:
 * - Canvas dimensions match target (print DPI / screen resolution)
 * - randomSeed() and noiseSeed() are set (reproducibility)
 * - Colors use style variables, not hardcoded hex
 * - frameRate() is set for interactive mode
 * - No loadFont() with remote URLs in preload()
 * - Export readiness (PNG/SVG/GIF)
 */

import { runCLI } from '../../_creative-shared/scripts/base';

const args = process.argv.slice(2);
const dir = args[0] || '.';

process.exit(runCLI(['qa', dir]));
