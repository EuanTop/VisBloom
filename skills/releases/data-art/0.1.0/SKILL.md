---
name: data-art
description: Create and continue artistic data visualizations in the local Art Workbench using its CLI, AVA data core, live canvas and shared project state.
---

# Data art collaboration

This skill is shipped with the project. It does not require any personal creative-art-rendering skill.

## Connect

With the local service running, use the CLI from the repository root. Start with `npm run --silent art -- --help`, then `npm run --silent art -- context --project PROJECT_ID`. Set ART_WORKBENCH_URL when the service uses another local port. CLI is the default for shell-capable Coding Agents; [MCP compatibility](references/mcp.md) covers hosts that need protocol tools. If a capability is unavailable, report the actual missing dependency.

Context is an overview, not all project data. Read individual source files, notes and paged results when needed. Keep eventCursor and use `context --after CURSOR` for subsequent changes; follow hasMoreEvents before treating an incremental page as complete. Use --out for large results. --full is an explicit diagnostic option. A data sample must not be mistaken for the complete artwork dataset.

## Work with the creator

Let conversation, direct canvas work and source edits alternate naturally. First read current context, including changed source, human parameter edits and the renderer version. Never assume your last message describes the current artwork. Separate actual edits from creator-confirmed intent and your own tentative interpretation.

Understand what the creator wants to express and how the data contributes. Offer meaningfully different artistic approaches when exploration is useful; do not require a fixed number of variants or force a form-filling stage before experimentation. Keep aesthetics and expression under the creator's judgment.

## Use AVA as the data core

Inspect the dataset schema and source notes. CLI query performs temporary AVA analysis without changing the artwork result, mapping or revision. Inspect rows, counts and truncation. Applying data to the picture is a separate decision: `query --apply --revision REVISION` replaces the artwork result and commits a version. Preserve SQL and provenance. Structured execution uses existing Agent reasoning; an additional AVA model key is not required. Text extraction or direct AVA model calls are separate capabilities, not assumed.

## Edit and inspect

Use declared parameters for local changes and code for new geometry, motion or relationships. Read controls.json and src/artwork.ts first. Save with current project revision and expected file hashes; local files can be supplied through a manifest rather than embedding source in a shell string. On conflict, re-read and reconcile. Preserve compatible controls and the creator's recent choices. The Agent authors controls and visual mappings after considering data and intent; the UI does not infer them automatically.

Include accurate bindings descriptions (`[{field,channel}]`) with the source manifest so the inspector explains the current geometry. They describe the code; they do not implement a mapping. Changed source without explicit bindings clears old descriptions. Use an empty array if no description is appropriate; retain an explanation only when it still matches the actual picture.

Read the project renderer first. A Three.js artwork returns a scene and optional update/objects/dispose; its context includes THREE and weights. A Canvas2D artwork returns draw(context) with canvas/ctx/data/parameters/time and optional hitTest/objects/dispose. Canvas artwork can declare timeline(context) with enabled/label/duration and optional enableParameters; only offer animation controls that actually affect this work. Mark usesSeed only when the code uses the seed. Controls are declared in controls.json; UI generation from declarations is not automatic inference of artistic intent. Relative source helpers/GLSL are allowed where supported.

Check the actual picture. Use `capture --out FILE` and inspect the PNG; runtime acceptance is not visual completion. Capture needs an open Workbench displaying the current revision; a project can be opened using ?project=ID. Explain whether a failure is data, compilation, runtime or disconnected renderer. Never return an old screenshot as evidence of a new change. Uncommitted canvas previews are not project decisions.

Save named checkpoints for directions the creator wants to preserve. A restored checkpoint creates a new revision. Use project notes for explicit intentions and decisions; general reusable creative methods belong in this skill's references, not automatically extracted from a single artwork.

## Deliver

PNG captures only the artwork. Web export contains a frozen data/source/state snapshot and runs without the local service; use the actual completed job result. Do not publish, send or upload artwork unless requested. Report meaningful limitations rather than implying arbitrary GPU objects or multimodal inputs are already supported.

## Evidence and identity

Project actor labels are categories, not authenticated model identity. Preserve visible tool/output/source evidence when validating a workflow, and label simulated UI operations, missing records and unverified host integration accurately. Protocol tests and developer-imported examples do not prove an actual Agent creation workflow. See docs/CASE_CREATION_RECORD.md for the original cases and docs/evidence/agent-trial/README.md for the subsequent real MCP trial.
