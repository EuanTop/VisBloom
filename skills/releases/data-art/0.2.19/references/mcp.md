# MCP compatibility

Use this path when the Agent host needs MCP tools. CLI is preferred when a terminal is available. Both adapters call the same local project service.

Configure a stdio server with command `npm`, args `["run", "--silent", "mcp"]`, cwd set to this repository's absolute path, and ART_WORKBENCH_URL set to the local service origin (default http://127.0.0.1:4318). Reading this document does not configure a host.

- Start with project_context using view="summary" and an explicit projectId. Save eventCursor; use after for incremental pages and follow hasMoreEvents.
- project_read_file reads one source/control file with revision and hash. Context view="full" preserves the complete legacy response for explicit access.
- dataset_inspect is temporary AVA analysis; dataset_query applies results to the artwork and creates a revision. Supply expectedRevision for applying results.
- project_write_files requires the current revision and expectedHash for existing files. artwork_patch changes controls/state; re-read on conflict.
- artwork_capture returns a real PNG from a connected current renderer. artwork_export returns a job; only completed is a finished output.

The creative and evidence principles in SKILL.md apply to both adapters. CLI execution does not verify native MCP host configuration, or vice versa.
