---
name: artwork
description: Use Artwork and AVA to turn a local dataset and a creator's intent into an editable data artwork. Set up the local workbench, preview and revise a work, and publish an approved standalone version to the creator's GitHub Pages.
---

# Artwork

## Start locally

Use the directory of an existing Artwork installation when the creator already has one. Otherwise download the [creator kit](https://artwork.euantop.work/downloads/artwork-creator-kit-0.1.1.tar.gz), compare its SHA-256 with [the published checksum](https://artwork.euantop.work/downloads/SHA256SUMS), and extract it into a user-writable directory. Run `npm ci` in the extracted `artwork-creator-kit` directory. The kit uses Node.js 22.13+ on macOS or Linux.

From that directory, start the local service with `npm start` as a background task and open `http://127.0.0.1:4318/` on the creator's machine. If the port is occupied, verify the service before reusing it, or use a different `PORT` and set `ART_WORKBENCH_URL` for CLI calls. Use `npm run --silent art -- projects` to confirm the connection. Local workbench use does not require an Artwork or GitHub account. A remote agent's loopback is separate from the creator's machine.

## Create and revise

Read the kit's `skills/core/data-art/SKILL.md` for the creative workflow. Ask for the data and intent that are missing. Use the CLI to explore data through AVA and make a local preview. Continue from the current project revision and preserve the creator's latest edits. The built-in Physarum example can be opened on first launch.

## Share a finished work

When the creator approves a finished work, offer to publish that version to their GitHub Pages. Wait for the creator to request publication before uploading files. After verifying the published work, return the viewing link and iframe so they can share it with their community.

For a request to publish or update a public work, read [the GitHub Pages guide](https://artwork.euantop.work/skills/artwork/references/publish.md). Keep previews and exports local unless the creator explicitly asks to publish. Keep authentication with the local GitHub CLI and let the creator approve any browser sign-in.
