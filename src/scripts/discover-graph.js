/* The /discover graph: renders a discovered BrowserWorkflowProposal as a
 * left-to-right chain (Goal -> capability nodes) and recolours it through the
 * phases — planned / reviewed / running / succeeded / failed — from the real
 * ComposedWorkflowTrace. AntV G6 5.x (window.G6, loaded via CDN in the page).
 */

let graph = null;
let ordered = [];        // node ids in draw order, incl. the leading __goal
let phase = new Map();   // id -> 'planned'|'reviewed'|'succeeded'|'failed'
let labels = new Map();

function cssVar(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}
function palette() {
  return {
    accent: cssVar('--accent', '#debeef'),
    success: cssVar('--success', '#9ccdb2'),
    err: '#e8907d',
    border: cssVar('--border', 'rgba(128,128,128,0.35)'),
    card: cssVar('--bg-card', '#0a3852'),
    fg: cssVar('--fg', '#fdfaf1'),
    muted: cssVar('--fg-muted', '#aac1cb'),
  };
}
function isDark() { return document.documentElement.getAttribute('data-theme') !== 'light'; }

/* The last dotted segment only — "report.summarize-semantic" -> "summarize-semantic".
   Namespace and version stay visible elsewhere (mapping list, trace cards, the
   goal target); the graph is for shape at a glance, not the full identity. */
function shortName(capabilityId) {
  const i = capabilityId.lastIndexOf('.');
  return i === -1 ? capabilityId : capabilityId.slice(i + 1);
}

let aiNodeIds = new Set();

function styleFor(id) {
  const p = palette();
  const st = phase.get(id) || 'planned';
  const isAI = aiNodeIds.has(id);
  const base = {
    x: pos(id).x, y: pos(id).y, size: id === '__goal' ? 26 : (isAI ? 38 : 34),
    labelText: labels.get(id) || '',
    labelPlacement: 'bottom', labelOffsetY: 8, labelFill: p.muted,
    labelFontSize: 9, labelFontFamily: "'JetBrains Mono', monospace",
    labelWordWrap: true, labelMaxWidth: 120, labelMaxLines: 2, labelTextAlign: 'center',
    lineWidth: 1.5, fill: p.card, stroke: p.border,
  };
  if (id === '__goal') return { ...base, fill: 'color-mix(in srgb, ' + p.accent + ' 14%, transparent)', stroke: p.accent, labelFill: p.fg };
  // AI-backed (model_derived / bundled-model) capabilities keep a light accent
  // tint even before execution, so the different shape reads as intentional.
  const aiBase = isAI ? { ...base, fill: 'color-mix(in srgb, ' + p.accent + ' 10%, transparent)' } : base;
  if (st === 'reviewed') return { ...aiBase, stroke: p.accent, lineWidth: 2, labelFill: p.fg };
  if (st === 'succeeded') return { ...aiBase, stroke: p.success, fill: 'color-mix(in srgb, ' + p.success + ' 16%, transparent)', lineWidth: 2, labelFill: p.fg, shadowBlur: 12, shadowColor: p.success };
  if (st === 'failed') return { ...aiBase, stroke: p.err, fill: 'color-mix(in srgb, ' + p.err + ' 16%, transparent)', lineWidth: 2, labelFill: p.fg };
  return aiBase; // planned
}

let edgesMeta = []; // [{ id, source, target, mapCount }]
function edgeStyleFor(e) {
  const p = palette();
  return {
    stroke: p.border, lineWidth: 1.5, endArrow: true, endArrowSize: 7,
    labelText: e.mapCount ? e.mapCount + ' field' + (e.mapCount > 1 ? 's' : '') : '',
    labelFontSize: 8, labelFill: p.muted, labelBackground: false,
  };
}

let positions = new Map();
function pos(id) { return positions.get(id) || { x: 0, y: 0 }; }
function layout(ids, w, h) {
  positions = new Map();
  const marginX = 60;
  const y = Math.max(h / 2, 60);
  if (ids.length === 1) { positions.set(ids[0], { x: w / 2, y }); return; }
  const step = (w - 2 * marginX) / (ids.length - 1);
  ids.forEach((id, i) => positions.set(id, { x: marginX + step * i, y }));
}

export function resetGraph(container) {
  phase = new Map();
  aiNodeIds = new Set();
  edgesMeta = [];
  if (graph) { try { graph.clear(); } catch (e) { void e; } }
  if (container) container.dataset.empty = 'true';
}

/* Re-applies current styles to the already-built graph without touching
   `phase` (so an in-progress or completed run keeps its succeeded/failed
   colouring). Needed because styleFor()/edgeStyleFor() read CSS vars at
   call time — a theme toggle or viewport resize after the graph was first
   drawn otherwise leaves stale, theme-mismatched colors baked into the
   canvas (e.g. dark-mode label text stranded on a light background). */
function redraw() {
  if (!graph) return;
  try {
    graph.updateNodeData(ordered.map((id) => ({ id, style: styleFor(id) })));
    graph.updateEdgeData(edgesMeta.map((e) => ({ id: e.id, style: edgeStyleFor(e) })));
    graph.draw();
  } catch (e) { console.error('[discover-graph]', e); }
}

export async function renderPlanGraph(container, proposal, aiCapabilityIds = []) {
  if (!container || !window.G6) return;
  container.dataset.empty = 'false';

  const nodes = proposal.proposal.nodes;
  ordered = ['__goal', ...nodes.map((n) => n.node_id)];
  labels = new Map([['__goal', 'Goal']]);
  phase = new Map(ordered.map((id) => [id, 'planned']));
  const aiSet = new Set(aiCapabilityIds);
  aiNodeIds = new Set(nodes.filter((n) => aiSet.has(n.capability_id)).map((n) => n.node_id));
  const mapCount = new Map();
  for (const m of proposal.proposal.mappings) mapCount.set(m.to_node_id, (mapCount.get(m.to_node_id) || 0) + 1);
  nodes.forEach((n) => labels.set(n.node_id, shortName(n.capability_id)));

  edgesMeta = [{ id: 'e-goal', source: '__goal', target: nodes[0].node_id, mapCount: mapCount.get(nodes[0].node_id) || 0 }];
  for (let i = 1; i < nodes.length; i++) {
    edgesMeta.push({ id: 'e-' + i, source: nodes[i - 1].node_id, target: nodes[i].node_id, mapCount: mapCount.get(nodes[i].node_id) || 0 });
  }

  layout(ordered, container.clientWidth || 640, container.clientHeight || 220);

  const data = {
    nodes: ordered.map((id) => ({ id, type: aiNodeIds.has(id) ? 'diamond' : 'circle', style: styleFor(id) })),
    edges: edgesMeta.map((e) => ({ id: e.id, source: e.source, target: e.target, style: edgeStyleFor(e) })),
  };

  try {
    if (!graph) {
      graph = new window.G6.Graph({
        container, width: container.clientWidth, height: container.clientHeight,
        theme: isDark() ? 'dark' : 'light', animation: false,
        data, node: {}, edge: { type: 'cubic-horizontal' }, behaviors: ['drag-canvas'],
      });
      await graph.render();
    } else {
      graph.setSize(container.clientWidth, container.clientHeight);
      await graph.clear();
      graph.addData(data);
      await graph.draw();
    }
    await graph.fitView({ padding: 26 });
  } catch (e) {
    // A graph failure must not take the run down — the receipt below is the source of truth.
    console.error('[discover-graph]', e);
  }
}

export function setGraphPhase(state, nodeId) {
  if (!graph) return;
  const ids = nodeId ? [nodeId] : ordered.filter((id) => id !== '__goal');
  for (const id of ids) phase.set(id, state);
  redraw();
}

if (typeof window !== 'undefined') {
  window.addEventListener('resize', () => {
    if (!graph) return;
    const c = graph.getCanvas && graph.getCanvas().getContainer && graph.getCanvas().getContainer().parentElement;
    if (!c) return;
    layout(ordered, c.clientWidth, c.clientHeight);
    graph.setSize(c.clientWidth, c.clientHeight);
    redraw();
  });
  // The theme toggle (Nav.astro) only sets documentElement[data-theme] — it
  // dispatches no event. Watch the attribute directly so an already-drawn
  // graph repaints instead of keeping colors baked in for the prior theme.
  new MutationObserver(redraw).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
}
