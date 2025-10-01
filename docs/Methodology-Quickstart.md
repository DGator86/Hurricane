# Hurricane Methodology Quickstart

This quickstart summarizes the core files used by the automation workflow.

## Daily Workflow

1. Checkout the repository and install dependencies with `npm ci`.
2. Run `npx tsx automation/hurricane_sync/reportStatus.ts` to produce the status
   snapshot. The command writes `hurricane-status.md` and prints the report to
   stdout.
3. Review the generated markdown for health score context and supporting data.
4. Push the updated artefacts or allow the scheduled GitHub Action to open a PR
   on your behalf.

## Project Structure

- `docs/` — Methodology references and onboarding guides.
- `specs/` — JSON/YAML schemas used for validation checks.
- `assistants/` — Prompt and metadata for the Codex reviewer bot.
- `src/hurricane/` — TypeScript implementations of the public Hurricane API.
- `automation/hurricane_sync/` — Scripts invoked by CI to score the repo.

## Replacing Mock Data

`reportStatus.ts` uses a mock `runPaper` invocation so the workflow succeeds
before real data is wired up. Update the import to use
`src/hurricane/pipeline/runPaper.ts` once the production runner is available.
When invoking manually with another runner, ensure ES modules are enabled. The
`tsx` binary used by CI resolves the TypeScript entrypoint automatically.

## Validation

The schema files provide machine-readable expectations for Hurricane payloads.
Use them when building tests or ingest pipelines to ensure downstream systems
stay in sync.
