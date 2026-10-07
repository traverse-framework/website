/* /discover — additive real-generation panel.
 *
 * Decision 95 (docs/decision-log.md, traverse-framework/traverse) bridges
 * Spec 045 (traverse.inference.generate) and Spec 138 (governed exact-ref
 * model.execute) so a digest-verified WASM package can satisfy generation
 * fully offline, with no Ollama daemon and no network call. This panel
 * exercises that bridge mechanism directly: it runs the real, checked-in
 * conformance fixture (fixture.responder@1.0.0 — #1454/#1455) that proves
 * the bridge end-to-end, through the same ExactModelBrowserHost / Spec 138
 * model.execute path traverse-embedder-web ships and tests.
 *
 * This is independent of the goal-picker flow in discover.js: it does not
 * change what executeBrowserComposedWorkflow is allowed to auto-run there,
 * and the "runtime declines to authorize" goal above still declines for
 * the same real reason it always did.
 *
 * The fixture is small and deterministic on purpose (scans the prompt for
 * the byte pair "hi" and returns one of two fixed responses) — it is not a
 * trained language model, and this module never claims otherwise.
 */

import {
  ExactModelBrowserHost, encodeGuestFrame, normalizeModelExecuteEvidence, PLACEMENT_WASM_CPU,
} from 'traverse-embedder-web';

// fixtures/models/fixture-responder-1.0.0/model.wasm, checked into
// traverse-framework/traverse (crates/traverse-runtime/tests/inference_tests.rs).
// The exact file bytes (491 bytes, including its debug-names section) —
// not the debug-names-stripped 340-byte variant traverse-embedder-web's own
// unit test embeds — so the digest below matches the file's real pinned
// digest in fixtures/models/fixture-responder-1.0.0/model.manifest.json.
// Small enough to embed and audit directly rather than fetch.
const FIXTURE_WASM_B64 = 'AGFzbQEAAAABCQFgBH9/f38BfwMCAQAFAwEAAgcaAgZtZW1vcnkCAA1tb2RlbF9leGVjdXRlAAAK9AEB8QEBB38gAUEMSQRAQX8PCyAAKAIIIQQgAEEMaiEFQQwgBGogAUsEQEF/DwtBACEIQQAhBgJAA0AgBkECaiAESw0BIAUgBmotAABB6ABGIAUgBkEBamotAABB6QBGcQRAQQEhCAwCCyAGQQFqIQYMAAsLIAhBAUYEQEHKuAIhCUEIIQoFQd64AiEJQQMhCgtBDCAKaiADSwRAQX8PCyACQQE7AQAgAkEEOgACIAJBAToAAyACIAo2AgQgAiAKNgIIQQAhBwJAA0AgByAKTw0BIAJBDGogB2ogCSAHai0AADoAACAHQQFqIQcMAAsLQQwgCmoLCyMDAEHAuAILAmhpAEHKuAILCGhpIHRoZXJlAEHeuAILA2htbQCUAQRuYW1lAmIBAAsABmluX3B0cgEGaW5fbGVuAgdvdXRfcHRyAwdvdXRfY2FwBAtwYXlsb2FkX2xlbgULcGF5bG9hZF9wdHIGAWkHAWoIB21hdGNoZWQJCHJlc3BfcHRyCghyZXNwX2xlbgMpAQAEAgtzZWFyY2hfZG9uZQMGc2VhcmNoBwljb3B5X2RvbmUIBGNvcHk=';

// The same fixture's signed Spec 138 package files (traverse-embedder-web
// 0.14 admits packages only through registerPackage): the exact bytes of
// fixtures/models/fixture-responder-1.0.0/model.manifest.json (its SHA-256
// is the pin digest) and its detached Ed25519 model.sig.json.
const FIXTURE_MANIFEST_B64 = 'ewogICJzY2hlbWFfdmVyc2lvbiI6ICIyLjAuMCIsCiAgIm1vZGVsX2lkIjogImZpeHR1cmUucmVzcG9uZGVyIiwKICAidmVyc2lvbiI6ICIxLjAuMCIsCiAgIndhc21fZGlnZXN0IjogImJmMDQ3NjBiMTkzN2MyZjJiODEzYjZlMjhmMmZkYzZlMzM0ODMzYzJkZmFkYzFmN2M4NzJmM2YyOGMzNDEyOTQiLAogICJyZWdpc3RyeV9yZWYiOiAicmVnaXN0cnk6Zml4dHVyZS5yZXNwb25kZXJAMS4wLjAiLAogICJleGVjdXRhYmxlX2Zvcm1hdCI6ICJ0cmF2ZXJzZS1tb2RlbC13YXNtIiwKICAiYWJpX3ZlcnNpb24iOiAxLAogICJpbnB1dF9zY2hlbWFfcmVmIjogInNjaGVtYTpicmlkZ2VkLWdlbmVyYXRlLWluIiwKICAiaW5wdXRfc2NoZW1hX3ZlcnNpb24iOiAiMS4wLjAiLAogICJvdXRwdXRfc2NoZW1hX3JlZiI6ICJzY2hlbWE6YnJpZGdlZC1nZW5lcmF0ZS1vdXQiLAogICJvdXRwdXRfc2NoZW1hX3ZlcnNpb24iOiAiMS4wLjAiLAogICJyaWdodHMiOiB7CiAgICAibGljZW5zZV9pZCI6ICJBcGFjaGUtMi4wIiwKICAgICJhdHRyaWJ1dGlvbiI6ICJUcmF2ZXJzZSBTcGVjIDA0NS8xMzggYnJpZGdlIGNvbmZvcm1hbmNlIGZpeHR1cmUiLAogICAgInJlZGlzdHJpYnV0aW9uIjogInRlc3Qtb25seTsgbm90IGZvciBwcm9kdWN0aW9uIHJlZGlzdHJpYnV0aW9uIGNsYWltcyIsCiAgICAiY29tbWVyY2lhbF91c2UiOiAiYWxsb3dlZCIsCiAgICAic291cmNlX3VybCI6ICJodHRwczovL2dpdGh1Yi5jb20vdHJhdmVyc2UtZnJhbWV3b3JrL1RyYXZlcnNlL3RyZWUvbWFpbi9maXh0dXJlcy9tb2RlbHMvZml4dHVyZS1yZXNwb25kZXItMS4wLjAiCiAgfSwKICAic3VwcG9ydGVkX3Byb2ZpbGVzIjogWwogICAgIndhc20tY3B1IgogIF0sCiAgIm1heF9tZW1vcnlfYnl0ZXMiOiAxMzEwNzIsCiAgIm1heF9mdWVsIjogMTAwMDAwMCwKICAibWF4X2lucHV0X2J5dGVzIjogNDA5NiwKICAibWF4X291dHB1dF9ieXRlcyI6IDQwOTYsCiAgIm1heF9leGVjdXRpb25fbXMiOiA1MDAwLAogICJvZmZsaW5lX2FsbG93ZWQiOiB0cnVlCn0K';
const FIXTURE_SIGNATURE_B64 = 'ewogICJhbGciOiAiZWQyNTUxOSIsCiAgImtleV9pZCI6ICJlZDI1NTE5OjQ1NWRmZmIwOTMxNjNkODQzOWI1NDRjYzRmMGVhNzllMzNhMDdiMjA1OTRjNDczOWE4YmJiNGMwODE5ZDJkNjciLAogICJzaWduYXR1cmUiOiAiOTkzZDA0M2QzZTM5NmE5OTkxMjUzZmY1NWZiZDgwNjU4MWZlYjU5MTYxNDRjNTc5ZTAzMTMxZGZjOTVmMmNlOTBlZTE2ODQ1ZGE0YjY5ZmIzZWNkMzc2YjYzNmVhZTBjYTQzM2RlNTA1OWY1MmNkNWMzNjQ4Yjc0YmY2NThkMDQiCn0K';
// TEST-ONLY public key (fixtures/models/test-signing-key.json in
// traverse-framework/traverse) that signed the conformance fixtures. It is
// trusted here only to run this demo fixture; production hosts never trust it.
const FIXTURE_TEST_KEY_HEX = '97002eba1e28b582a739eb48750a5f0822b2bbcb61e6bcedd2fada36b51af355';

const MODEL_ID = 'fixture.responder';
const MODEL_VERSION = '1.0.0';
const GUEST_TEXT_DTYPE = 4; // matches the fixture's own conformance test (Spec 138 guest ABI v1)
const MAX_BYTES = 4096;

function b64ToBytes(value) {
  const bin = atob(value);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function sha256Hex(bytes) {
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* Runs the real bridge fixture against `promptText` and returns the
   genuinely computed result. No branch here fabricates a response —
   the WASM guest decides, and this function only reports what it did. */
export async function runResponderDemo(promptText) {
  const wasm = b64ToBytes(FIXTURE_WASM_B64);
  const manifestBytes = b64ToBytes(FIXTURE_MANIFEST_B64);
  const wasmDigest = await sha256Hex(wasm);
  // Spec 138: the pin digest is the SHA-256 of the exact signed manifest
  // bytes, which pin wasm_digest in turn.
  const digest = await sha256Hex(manifestBytes);
  const host = new ExactModelBrowserHost(
    [{
      model_id: MODEL_ID, version: MODEL_VERSION, digest, offline_allowed: true,
      target: PLACEMENT_WASM_CPU, rights: { license_id: 'Apache-2.0', commercial_use: 'allowed' },
    }],
    { trustedPublicKeysHex: [FIXTURE_TEST_KEY_HEX] },
  );
  // Real verification: Ed25519 signature by a trusted key over the exact
  // manifest bytes, pin digest, WASM digest, rights, target, and limits.
  // Any mismatch throws; nothing here can fabricate an admitted package.
  await host.registerPackage(manifestBytes, wasm, b64ToBytes(FIXTURE_SIGNATURE_B64));

  const promptBytes = new TextEncoder().encode(promptText);
  const frame = encodeGuestFrame(GUEST_TEXT_DTYPE, [promptBytes.length], promptBytes);
  const input_ref = host.io.stageModelInput(frame, MAX_BYTES);
  const result = await host.execute({
    model_ref: { model_id: MODEL_ID, version: MODEL_VERSION, digest },
    input_ref,
    policy_ref: 'discover-generate-demo',
    data_classification: 'public',
    input_schema_ref: 'schema:bridged-generate-in',
    input_schema_version: '1.0.0',
    max_output_bytes: MAX_BYTES,
    allowed_classifications: ['public'],
  });

  const output = host.io.readModelOutput(result.output_ref, MAX_BYTES);
  const view = new DataView(output.buffer, output.byteOffset, output.byteLength);
  const respLen = view.getUint32(8, true);
  const response = new TextDecoder().decode(output.slice(12, 12 + respLen));

  const evidence = normalizeModelExecuteEvidence({
    status: 'ok',
    model_ref: { model_id: MODEL_ID, version: MODEL_VERSION, digest },
    placement: result.placement,
    output_ref: result.output_ref,
  });

  return { digest, wasmDigest, response, placement: result.placement, evidence };
}

function el(id) { return document.getElementById(id); }
function logLine(log, text, cls) {
  if (!log) return;
  const d = document.createElement('div');
  d.className = 'discover-log-line' + (cls ? ' ' + cls : '');
  d.textContent = text;
  log.appendChild(d);
  log.scrollTop = log.scrollHeight;
}

async function runDemo() {
  const input = el('discover-gen-prompt');
  const btn = el('discover-gen-run');
  const log = el('discover-gen-log');
  const out = el('discover-gen-output');
  if (!input || !log || !btn) return;

  const promptText = input.value || '';
  log.innerHTML = '';
  if (out) out.hidden = true;
  btn.disabled = true;
  logLine(log, '$ registerPackage — verify the Ed25519 signature (test-only fixture key), manifest pin, and sha256(model.wasm)', 'cmd');

  try {
    const { digest, wasmDigest, response, placement, evidence } = await runResponderDemo(promptText);
    logLine(log, '✓ signed package verified: pin sha256:' + digest.slice(0, 16) + '…, wasm sha256:' + wasmDigest.slice(0, 16) + '…', 'ok');
    logLine(log, '$ encode prompt as a Spec 138 guest frame (ABI v1) and stage it', 'cmd');
    logLine(log, '$ execute — wasm-cpu, offline, no network, no daemon', 'cmd');
    logLine(log, '✓ response: "' + response + '" (placement=' + placement + ')', 'ok');
    const respEl = el('discover-gen-response');
    const evEl = el('discover-gen-evidence');
    if (respEl) respEl.textContent = response;
    if (evEl) evEl.textContent = JSON.stringify(evidence, null, 2);
    if (out) out.hidden = false;
  } catch (e) {
    logLine(log, '✗ execution halted — ' + (e && e.code ? e.code : String(e && e.message || e)), 'err');
    console.error('[discover-generate]', e);
  } finally {
    btn.disabled = false;
  }
}

export function initGenerateDemo() {
  const btn = el('discover-gen-run');
  if (!btn) return;
  btn.addEventListener('click', () => { runDemo().catch((e) => console.error('[discover-generate]', e)); });
  runDemo().catch((e) => console.error('[discover-generate]', e));
}
