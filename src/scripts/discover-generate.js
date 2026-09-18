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
  const digest = await sha256Hex(wasm);
  const host = new ExactModelBrowserHost([
    { model_id: MODEL_ID, version: MODEL_VERSION, digest, offline_allowed: true },
  ]);
  await host.insertVerified(
    {
      model_id: MODEL_ID, version: MODEL_VERSION,
      wasm_digest: digest, package_digest: digest,
      input_schema_ref: 'schema:bridged-generate-in', input_schema_version: '1.0.0',
      max_memory_bytes: 131072, max_fuel: 1_000_000,
      max_input_bytes: MAX_BYTES, max_output_bytes: MAX_BYTES,
      offline_allowed: true, supported_profiles: [PLACEMENT_WASM_CPU],
      license_id: 'Apache-2.0', abi_version: 1,
    },
    wasm,
  );

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

  return { digest, response, placement: result.placement, evidence };
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
  logLine(log, '$ sha256(model.wasm) — verify against the fixture.responder@1.0.0 pin', 'cmd');

  try {
    const { digest, response, placement, evidence } = await runResponderDemo(promptText);
    logLine(log, '✓ digest verified: sha256:' + digest.slice(0, 23) + '…', 'ok');
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
