# VisBloom

**A local creative workbench for digital art and data visualization.**

Use your own coding agent to develop an idea, then edit the artwork's code, data, and parameters in the same project. Build a still, an animation, or an interactive work. Bring CSV or JSON when the piece calls for data, and use [AntV AVA](https://github.com/antvis/AVA) to inspect and transform it.

[Browse the gallery](https://artwork.euantop.work/collection.html) · [Create with your agent](https://artwork.euantop.work/help/agent-setup.html?lang=en) · [简体中文](README.zh-CN.md)

## Quick start

1. Open the [setup guide](https://artwork.euantop.work/help/agent-setup.html?lang=en) and paste its prompt into a coding agent that can run commands on your computer.
2. Describe an idea or give the agent a local file to work with. For a data example, try the built-in [Physarum artwork](https://artwork.euantop.work/artworks/physarum.html).
3. Open the workbench URL the agent gives you. Refine the draft in conversation, by adjusting parameters on the canvas, or by editing the source. Export a PNG or a standalone HTML work when ready.

The Creator Kit supports macOS and Linux with Node.js 22.13 or later. The local workbench opens without an account. The current workbench interface is in Simplified Chinese.

## Run from source

```sh
npm ci
npm run dev
```

Open [http://127.0.0.1:4318](http://127.0.0.1:4318). Local projects are saved in `.art-workbench/` by default. Set `ART_WORKBENCH_DIR` to use a different directory.

## How it fits together

- **Creative guidance.** The VisBloom Skill starts from either a digital art or a data brief and uses specialist Skills and public gallery examples when they help with a specific creative decision.
- **Workbench.** Canvas 2D, Three.js, and document artworks run in a browser preview. Source, parameters, data, and checkpoints stay with the project.
- **Agent access.** The Creator Kit includes a CLI and an optional local MCP adapter for the same workbench API. The standalone Skill download contains guides. A team's private reference library requires separate authorization.
- **Sharing.** Standalone HTML runs independently of the workbench. Publish a finished piece to your own GitHub Pages or use the optional share service for a versioned link and iframe.

## Development

```sh
npm run check
npm test
npm run build
```

`npm run build:portal` produces the static portal, gallery, community index, and downloads in `dist/portal/`.

| Path | Contents |
| --- | --- |
| `apps/` | Workbench, project API, agent adapters, and share service |
| `packages/` | Project core, data adapter, storage, renderers, and export |
| `skills/` | Creative guides, specialist Skills, and pinned versions |
| `cases/` | Bundled example projects and data provenance |

Contributions should include the check that covers the change. Keep authorship, provenance, and license notices with third-party code, media, and data.

[CLI reference](docs/CLI.md) · [Deployment](docs/DEPLOYMENT.md) · [Skill catalog](skills/entries.json)

## License and credits

VisBloom’s original platform code and original Skills are available under [CC BY-NC 4.0](LICENSE). Credit VisBloom and its contributors when sharing or adapting these materials for noncommercial use, link to the license, and indicate any changes. Third-party code, fonts, data, artwork, and adapted Skills retain their applicable terms and notices. See the [portal credits](https://artwork.euantop.work/portal/credits.html) and the [Skill attribution catalog](skills/catalog.json).
