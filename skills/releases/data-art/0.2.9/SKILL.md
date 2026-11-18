---
name: data-art
description: Collaborate on artistic data visualizations in Visloom; use when turning data and visual references into editable works, refining their visual language, or continuing a creator’s canvas and code edits.
---

# Data art with a creator

Begin with the actual work and the creator’s current request. The next useful action may be understanding the material, trying a visual relationship, refining one detail, or continuing a human edit. Do not restart exploration when the creator has chosen a direction.

## Decide what needs to change

Read current project context, the relevant source and controls, and the supplied reference. Distinguish **committed choices**, **open questions**, and **your proposal**. A visual reference may specify a shape, a data relationship, a surface treatment, or all three: establish which applies before changing it. Preserve chosen geometry, encoding and current human edits unless the request changes them.

For an open brief, find a consequential relationship in the material and propose or build a small experiment that makes it perceptible. Ask only when a missing choice would materially change the direction. An explicitly requested local change should lead to a local change, without a compulsory manifesto, questionnaire or set number of alternatives.

## Connect the material to the expression

Use AVA to check the grain, identities, units, relationships and unknowns needed for this work. A row, an entity and a visual mark need not be the same thing. Trace the intended relationship from source through transformations to what a viewer can perceive; use [data and expression](references/data-expression.md) when that connection is unresolved.

Artistic abstraction may transform a relationship, but cannot invent an observation. Separate data-bearing geometry, material variation and viewer controls. Do not use an attractive algorithm as a reason to replace an already chosen expression. Choose a generative mechanism for what it can express or let the creator manipulate, rather than for complexity alone.

When the direction depends on a relationship in the data, run a read-only AVA query first. Keep the unit of comparison, the denominator and the unknowns visible in the result. Turn the finding into a concrete change such as choosing comparable records, highlighting a field, or driving a mark or interaction. Apply the selected query at the current project revision and verify the actual picture. For a local material edit, keep the accepted data and mapping.

## Compose the work

For a new work or a broad visual revision, use [visual direction](references/visual-direction.md) to choose what the audience should see first, what changes on closer inspection, and what makes this composition specific to the material. When the brief leaves the form open and a choice matters, try the competing visual ideas at the same scale before building the full interface. Share a visible study when the creator's judgment would change the decision.

In an information work, give the comparison or pattern the visual space it needs. In an art-led work, give the data a consequence in form, surface, light or time that the audience can experience directly. Let navigation, type, legends and exact values support that experience. Read the guidance for the work at hand, including mixed formats, and preserve the creator's chosen structure on a local edit.

Translate a reference into concrete behavior: edges, mark formation, spatial rhythm, layering, density, color relationships, motion or participation. A style name or palette alone is not an implementation. For a material-only request, locate the drawing or shading layer and keep the data transforms and layout stable. [Ink and drawn marks](references/ink-marks.md) is an optional implementation reference for ink, dry strokes or drawing on paper; it is not a default house style.

Expose controls at meaningful editing boundaries, with stable identifiers and useful ranges. Reuse existing controls and values. A new technique or style does not justify resetting the creator’s background, selection, camera, time or source changes. When randomness is useful, key it by stable entity/mark identity so a local edit does not reshuffle the whole work.

Implement, view the real picture, and revise the part that fails. At the main viewing size, check whether the chosen relationship or artistic gesture leads the eye. Try a relevant detail or difficult state; for motion, inspect the transition or multiple meaningful moments. For a visual revision, compare before and after at the same state and scale. Record which change is visible and any unresolved issue. A successful build or export only establishes that the artifact runs.

## Continue and deliver

Use [workbench operations](references/workbench.md) when operating CLI/AVA, writing source or controls, resolving revisions, capturing or exporting. It contains the exact integration constraints. Read fresh context after a creator intervenes; inspect changed files as well as parameters and reconcile a conflict instead of replacing the whole project with your earlier snapshot.

For live viewer filtering or summaries, see [AVA in the finished work](references/workbench.md#ava-in-the-finished-work). Decide what the audience can see and query from the exported rows.

Use notes for confirmed intent and decisions that should survive another conversation; keep tentative interpretations distinct. Show the work first and explain only meaningful changes, choices or limitations. Deliver completed artwork captures and editable source/controls; use a completed standalone Web export when requested. Do not publish or upload without a request. Record unavailable capabilities and missing evidence plainly.

When a question needs specific style, material, algorithm or technology knowledge, use `npm run --silent visloom -- skills find --query QUERY` to find current entries, optionally filtering by an attribute axis/tag. Read the selected package's integration entry first, then only the relevant original reference or source. `skills read --id ID@VERSION --file PATH --start-line N --lines COUNT` reads a bounded excerpt; the response identifies its range and full resource hash. Do not load the whole library or force a preset style. Open-source authors, exact commits and license notices are retained with each imported package; an imported tool guide does not install that engine or establish that its artistic effect has been tested.

This is a project Skill with no personal Skill dependency. Additional style, algorithm or technology knowledge is loaded only for the current question; the attribute map is a discovery aid, not an obligatory creative process. External engines are not available merely because a Skill mentions them. For a host requiring protocol tools, read [MCP compatibility](references/mcp.md).
