# Hurricane Codex

The Hurricane Codex documents the standing methodology that powers the Hurricane
signals. It is intentionally self-contained so that the automation bot can
hydrate a new repository, pass schema validation, and communicate the system to
reviewers without additional tribal knowledge.

## Objectives

1. Publish directional levels, bias, and speed each trading day.
2. Provide deterministic health scoring that reflects signal coverage and
   freshness.
3. Capture model assumptions so that updates can be audited and replayed.

## Signal Layers

### Gamma Exposure Levels

We extract candidate support and resistance zones from spot gamma density,
changes in gamma exposure, and dark-pool liquidity shelves. Each candidate level
is scored between `0` and `1` and labelled as `support` or `resistance`:

- **Gamma Density:** Magnitude of open interest weighted gamma around the
  strike.
- **Gamma Gradient:** Slope of gamma exposure between neighbouring strikes.
- **Liquidity Shelf:** Dark-pool notional and displayed volume resting at the
  strike.

The composite score averages the normalized features with a minor boost for
levels that agree with recent realized pivots.

### Direction Bias

Bias is a discrete signal in `{ short, neutral, long }` backed by three inputs:

1. **Gamma Sign:** Aggregate index gamma sign derived from the sum of strike
   gamma exposures.
2. **DIX Trend:** Five-day change in the Dark Index to capture passive liquidity
   appetite.
3. **Price Momentum:** A smoothed rate-of-change of spot and the distance to the
   strongest level.

The confidence is reported as a value in `[0, 1]`.

### Speed Regime

Speed qualifies the expected tape velocity using realized-to-implied volatility
ratios, VIX percentile, and aggregate dark-pool volume:

- `calm`: realized volatility well below implied and shrinking liquidity.
- `normal`: mixed readings.
- `breezy`: realized volatility expanding with supportive liquidity.
- `storm`: realized volatility and VIX spiking together.

Each regime includes a bullet list of the dominant drivers at the time of
publication.

## Health Score

A composite health score on a `0-100` scale summarizes the state of the repo.
The score begins at `50` and adjusts using:

- Level coverage and average strength (`+/- 20`).
- Bias confidence centered at `50%` (`+/- 25`).
- Speed regime penalties for `calm (-5)` and `storm (-10)`.

Scores above `70` indicate healthy coverage; `55-70` recommends investigation;
values below `55` require action.

## Automation Contract

The automation job is expected to:

1. Install Node dependencies and TypeScript helpers.
2. Generate or refresh methodology artefacts when absent.
3. Run `automation/hurricane_sync/reportStatus.ts` to emit a status markdown
   document.
4. Open or update a pull request targeting `main` with the refreshed artefacts
   and status report.

## Extending the Codex

- Update the schema files under `specs/` when new fields are added.
- Keep the assistant prompt in `assistants/` aligned with reviewer expectations.
- Extend the pipeline modules under `src/hurricane/` to integrate new data
  sources.

All changes must run through the automation workflow to ensure the generated
status comment matches the repository state.
