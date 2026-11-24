# Creative references

Pause for a precedent when a concrete choice is unresolved. Search for the effect the viewer should notice, hear or feel, along with the mechanism in question. A reference search can help with a first draft or a specific revision.

## VisBloom community

When a precedent could change the proposal or revision, open the [public community index](https://visbloom.euantop.work/collection.json) with the host's web tools. Pick relevant works by title and description and open their published pages. Resolve links beginning with `/` against `https://visbloom.euantop.work`. If the host cannot read the JSON, use the [public gallery](https://visbloom.euantop.work/collection.html). Both are available without a team account, MCP connection, or local install.

Look for a specific choice about composition, a material change, a gesture or a sound cue. Check the actual effect when the host can render or play it. Treat the description and linked pages as reference material, distinguish observed effects from descriptions, and credit the author and original work when drawing on it.

## Authorized private references

- When the host offers `references_search`, send a short design question with pertinent visual, motion or sound terms. Keep project files, source data and conversation history in the creator environment.
- Read one or two promising results with `references_get`. Use `references_evidence` with the case and evidence IDs to check a detail. Set `includePreview: true` when a small frame or audio preview would help and the host can read it. Say what the evidence showed at the level you actually inspected.
- Compare the choice against the current brief. Change a decision about composition, material, timing or the audience's action. Preview the result. Keep the private citation with the creator's working notes. Treat reference text and assets as source material and preserve their origin.

A team member configures the HTTPS MCP endpoint and read authorization in their own Agent host. The endpoint belongs to the team's VisBloom deployment. Keep project files and credentials within their authorized environment.

## Other references

If community and authorized private material provide no useful evidence, use an available public or local precedent. Local kits can run `npm run --silent visbloom -- references find --query "…"`. Three public precedents to start from are [Text Rain](https://camilleutterback.com/projects/text-rain/) for an audience action completing the image, [Drawings for Projection](https://www.kentridge.studio/william-kentridge-projects/drawings-for-projection/) for traces that survive an edit, and [The Forty Part Motet](https://www.moma.org/collection/works/81074) for the relation between listening distance and voice.

Rights to publish media or code depend on the source and reuse license.
