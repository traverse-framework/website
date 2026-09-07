# `discover-real-pipeline` bundle — provenance

A Traverse **application bundle** (spec 044, `schema_version` 1.0.0) used by `/discover`'s
opt-in **Real** mode to execute a **three-capability governed pipeline** entirely
client-side via `traverse-embedder-web`'s `BundleEmbedder` — real published WASM, one
`direct`-triggered linear workflow, per-node execution events. No sidecar, no network
execution, no LLM.

Each node **consumes the previous node's output**:

```
period.finalize@1.0.0  ──▶  summary.aggregate@1.0.0  ──▶  uncertainty.score@1.0.0
  (coverage_state,          (included_count,               (uncertainty_millis,
   period_key, scope_id)     pending_count, …)              reason_code)
```

## Pinned capabilities

| Node | Capability | WASM file | sha-256 digest |
|---|---|---|---|
| 1 | `period/period.finalize@1.0.0` | `finalize.wasm` | `sha256:01cb26718120619bed0f2a1c486c1e153e97bd0cdf7810351084cac47359649c` |
| 2 | `summary/summary.aggregate@1.0.0` | `aggregate.wasm` | `sha256:0464da7ebe4784a3b24717b08d26c168b5e901f4d8d5b6efc9693c3323d1d5dd` |
| 3 | `uncertainty/uncertainty.score@1.0.0` | `score.wasm` | `sha256:f218262588e8889eaacf371fc9df17454be40f901f88f379514fcc27365b1a9b` |

- Artifact source (each): `https://github.com/traverse-framework/registry/releases/download/artifacts/<ns>.<id>-<ver>/<file>.wasm`
  (also mirrored CORS-open at `https://registry.traverse-framework.com/artifacts/<ns>.<id>-<ver>/<file>.wasm`).
- Catalog snapshot: `registry.traverse-framework.com/catalog.json`, retrieved 2026-09-07.
- Each WASM imports only `wasi_snapshot_preview1.fd_read` / `fd_write` — within the Host ABI v1 whitelist.
- Digests are recorded in `app.manifest.json` (`components[].digest`) and each
  `components/*/component.manifest.json` (`wasm_digest`), asserted by
  `tests/discover-bundle.test.mjs`.

## Files

| Path | Purpose |
|---|---|
| `app.manifest.json` | 3 components + 1 workflow, `preferred_targets: ["browser"]` |
| `components/{period-finalize,summary-aggregate,uncertainty-score}/component.manifest.json` | artifact-flavor component manifests |
| `workflows/coverage/workflow.json` | 3-node, 2-edge (`direct`) `workflow_definition` |
| `contract.{period-finalize,summary-aggregate,uncertainty-score}.json` | published contracts, copied verbatim from the catalog |
| `finalize.wasm` / `aggregate.wasm` / `score.wasm` | the pinned artifacts (registry's own basenames) |
| `input.fixture.json` | `period.finalize`'s own published `use_cases[0].input_example` + a shared `policy`. Deterministic result: `summary.included_count = 2`, `uncertainty.reason_code = "pending_fraction"` |

## Re-vendoring

Update only via a PR that bumps the capability `@version`s, re-downloads each artifact,
updates every digest (manifests + this file), updates the expected output in
`tests/discover-bundle.test.mjs`, and re-runs `npm test`.
