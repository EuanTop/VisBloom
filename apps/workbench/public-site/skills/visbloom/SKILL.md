---
name: visbloom
description: Use VisBloom to create and revise standalone digital art or data artwork with your own agent. Set up the local workbench, preview and revise a work, and publish an approved standalone version to the creator's GitHub Pages.
---

# VisBloom

## Start creating

Read the brief and the relevant guide under Create and revise before developing proposals. For an open brief for a new artwork, develop two or three distinct written treatments before starting visual production. When a concrete creative choice would benefit from a precedent, use the available specialist guides and [creative references](references/creative-references.md) to look for relevant work in the VisBloom community and, when authorized, the private reference library. For each treatment, describe what the audience sees, hears or does and how that experience carries the intent. Compare the treatments, recommend one with a reason and let the creator choose or revise the direction before building it.

## Local workbench

Use an existing VisBloom installation when it has the creative guide for this brief. Otherwise download the [creator kit](https://visbloom.euantop.work/downloads/visbloom-creator-kit-0.1.17.tar.gz), compare its SHA-256 with [the published checksum](https://visbloom.euantop.work/downloads/SHA256SUMS), and extract it into a user-writable directory. Run `npm ci` in the extracted `visbloom-creator-kit` directory. The kit uses Node.js 22.13+ on macOS or Linux.

From that directory, start the local service with `npm start` as a background task and open `http://127.0.0.1:4318/` on the creator's machine. If the port is occupied, verify the service before reusing it, or use a different `PORT` and set `ART_WORKBENCH_URL` for CLI calls. Use `npm run --silent visbloom -- projects` to confirm the connection. Local workbench use does not require a VisBloom or GitHub account. A remote agent's loopback is separate from the creator's machine.

## Create and revise

- For standalone digital art, read `skills/core/digital-art/SKILL.md` and start from the creator's intent, existing work or artistic materials. Use the creative references guide when a precedent or implementation would help.
- For a project whose meaning depends on observations or an existing dataset, read `skills/core/data-art/SKILL.md`. Ask for the data and intent that are needed. If the brief names the built-in Physarum data, import `cases/physarum/data/growth.csv` into a blank project and explore it through AVA. The finished Physarum artwork is available to open on request.

Once the creator chooses a treatment, use it as a working draft. Preview at viewing size and check what carries the theme with explanatory captions hidden. Watch any intended transition at normal speed. If the piece offers a sound control, activate it and listen for the intended change. Revise the treatment when what you learn from the work changes the idea. Bring a materially different direction back to the creator and preserve their latest edits between rounds. Report any unchecked behavior with the draft when the host cannot render or play it.

## Share a finished work

When the creator approves a finished work, offer to publish that version to their GitHub Pages. Wait for the creator to request publication before uploading files. After verifying the published work, return the viewing link and iframe so they can share it with their community.

For a request to publish or update a public work, read [the GitHub Pages guide](https://visbloom.euantop.work/skills/visbloom/references/publish.md). Keep previews and exports local unless the creator explicitly asks to publish. Keep authentication with the local GitHub CLI and let the creator approve any browser sign-in.
