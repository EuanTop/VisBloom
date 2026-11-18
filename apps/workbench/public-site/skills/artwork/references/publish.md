# Publish an Artwork project with GitHub Pages

Use the creator's GitHub account and an explicitly intended work repository. A local preview or a request for an HTML file is an export. A request to publish a confirmed version authorizes the public delivery of that version.

1. Identify the project and revision with `npm run --silent art -- context --project PROJECT_ID`. Check which data rows and fields are needed for viewing. AVA can prepare a selected result for the work. Keep the original project and complete source dataset in the creative workspace.
2. Export that revision with `npm run --silent art -- export --project PROJECT_ID --revision REVISION --type web --out PATH/index.html`. Use a separate publishing directory. Inspect the HTML's embedded viewing payload and check the page locally before pushing. Include necessary public assets and an empty `.nojekyll` for branch publishing.
3. Run `gh auth status` on the creator's machine. If needed, guide the creator through `gh auth login --web` and resume after GitHub authorization. Use the existing session to publish the staged files to the agreed repository. Leave unrelated files, raw data, project source, notes, and credentials in the local environment.
4. Enable GitHub Pages for the publishing branch. Wait for the actual Pages URL to return the expected HTML. Verify a meaningful interaction and an iframe on another origin. Return the live URL and the iframe code in the original conversation.

[GitHub Pages publishing source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
