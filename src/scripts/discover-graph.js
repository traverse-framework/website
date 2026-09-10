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

function styleFor(id) {
  const p = palette();
  const st = phase.get(id) || 'planned';
  const base = {
    x: pos(id).x, y: pos(id).y, size: id === '__goal' ? 26 : 34,
    labelText: labels.get(id) || '',
    labelPlacement: 'bottom', labelOffsetY: 8, labelFill: p.muted,
    labelFontSize: 9, labelFontFamily: "'JetBrains Mono', monospace",
    labelWordWrap: true, labelMaxWidth: 120, labelMaxLines: 2, labelTextAlign: 'center',
    lineWidth: 1.5, fill: p.card, stroke: p.border,
  };
  if (id === '__goal') return { ...base, fill: 'color-mix(in srgb, ' + p.accent + ' 14%, transparent)', stroke: p.accent, labelFill: p.fg };
  if (st === 'reviewed') return { ...base, stroke: p.accent, lineWidth: 2, labelFill: p.fg };
  if (st === 'succeeded') return { ...base, stroke: p.success, fill: 'color-mix(in srgb, ' + p.success + ' 16%, transparent)', lineWidth: 2, labelFill: p.fg, shadowBlur: 12, shadowColor: p.success };
  if (st === 'failed') return { ...base, stroke: p.err, fill: 'color-mix(in srgb, ' + p.err + ' 16%, transparent)', lineWidth: 2, labelFill: p.fg };
  return base; // planned
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
  if (graph) { try { graph.clear(); } catch (e) { void e; } }
  if (container) container.dataset.empty = 'true';
}

export async function renderPlanGraph(container, proposal) {
  if (!container || !window.G6) return;
  container.dataset.empty = 'false';

  const nodes = proposal.proposal.nodes;
  ordered = ['__goal', ...nodes.map((n) => n.node_id)];
  labels = new Map([['__goal', 'Goal']]);
  phase = new Map(ordered.map((id) => [id, 'planned']));
  const mapCount = new Map();
  for (const m of proposal.proposal.mappings) mapCount.set(m.to_node_id, (mapCount.get(m.to_node_id) || 0) + 1);
  nodes.forEach((n) => labels.set(n.node_id, n.capability_id + '\n@' + n.capability_version));

  const edges = [];
  edges.push({ id: 'e-goal', source: '__goal', target: nodes[0].node_id });
  for (let i = 1; i < nodes.length; i++) {
    edges.push({ id: 'e-' + i, source: nodes[i - 1].node_id, target: nodes[i].node_id });
  }

  layout(ordered, container.clientWidth || 640, container.clientHeight || 220);

  const data = {
    nodes: ordered.map((id) => ({ id, type: 'circle', style: styleFor(id) })),
    edges: edges.map((e) => ({
      ...e,
      style: {
        stroke: palette().border, lineWidth: 1.5, endArrow: true, endArrowSize: 7,
        labelText: mapCount.get(e.target) ? mapCount.get(e.target) + ' field' + (mapCount.get(e.target) > 1 ? 's' : '') : '',
        labelFontSize: 8, labelFill: palette().muted, labelBackground: false,
      },
    })),
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
  try {
    graph.updateNodeData(ids.map((id) => ({ id, style: styleFor(id) })));
    graph.draw();
  } catch (e) { console.error('[discover-graph]', e); }
}

if (typeof window !== 'undefined') {
  window.addEventListener('resize', () => { if (graph) { const c = graph.getCanvas && graph.getCanvas().getContainer && graph.getCanvas().getContainer().parentElement; if (c) { layout(ordered, c.clientWidth, c.clientHeight); graph.setSize(c.clientWidth, c.clientHeight); graph.updateNodeData(ordered.map((id) => ({ id, style: styleFor(id) }))); graph.draw(); } } });
}
