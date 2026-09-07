# `discover-real` bundle — provenance

This is a Traverse **application bundle** (spec 044, `schema_version` 1.0.0) used by
`/discover`'s opt-in **Real** mode. It wraps exactly one published, verified capability
and is executed **client-side** in the browser by
[`traverse-embedder-web`](https://www.npmjs.com/package/traverse-embedder-web)'s
`BundleEmbedder` — no `traverse-cli serve` sidecar, no network execution, no LLM.

## Pinned capability

| Field | Value |
|---|---|
| Capability | `core/core.calculate-price@1.1.0` |
| Registry contract | https://registry.traverse-framework.com/#/capability/core/core.calculate-price@1.1.0 |
| Artifact source | `https://github.com/traverse-framework/registry/releases/download/artifacts/core.calculate-price-1.1.0/core-calculate-price.wasm` |
| Artifact digest | `sha256:a046e5d001ae78b8de339d40378e2c22f04384d601a1b801b52cf99a3e44f0b2` |
| Catalog snapshot | `registry.traverse-framework.com/catalog.json`, retrieved 2026-09-07 |

The digest above is the SHA-256 of `core-calculate-price.wasm` as committed here. It is
recorded in `app.manifest.json` (`components[0].digest`) and
`components/calculate-price/component.manifest.json` (`wasm_digest`), asserted by
`tests/discover-bundle.test.mjs`, and re-verified against the live registry catalog by
that test's network-gated check.

## Files

| Path | Purpose |
|---|---|
| `app.manifest.json` | Application bundle manifest — one component, one single-node workflow, `preferred_targets: ["browser"]` |
| `components/calculate-price/component.manifest.json` | Component manifest — artifact flavor (`wasm_binary_path` + `wasm_digest`), not `registry_ref` |
| `workflows/calculate-price/workflow.json` | Single-node, zero-edge `workflow_definition` invoking `core.calculate-price@1.1.0` |
| `contract.json` | The published contract for `core.calculate-price@1.1.0`, copied verbatim from the catalog |
| `core-calculate-price.wasm` | The pinned WASM artifact (imports: `wasi_snapshot_preview1.fd_read` / `fd_write` only — within the Host ABI v1 whitelist) |
| `input.fixture.json` | The capability's own published `use_cases[0].input_example` (USD, 2 × $50, `summer-10` 10% discount, 8% tax). Expected `totals.net`: **97.2** |

## Re-vendoring

Update this bundle **only** via a PR that:
1. bumps `core/core.calculate-price` to the new `@version`,
2. re-downloads the artifact and updates the digest in all three places (manifest ×2, this file),
3. updates the expected output in `tests/discover-bundle.test.mjs`,
4. re-runs `npm test`.

Never hand-edit `core-calculate-price.wasm` or the digests independently — the test
fails closed on any mismatch.
