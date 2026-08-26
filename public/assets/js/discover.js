/* Live workflow discovery demo.
   Fetches the real, current Traverse capability registry catalog at runtime
   and composes a plausible multi-node workflow from whatever's actually
   published right now -- no canned graph, no fixture data. Graph rendering
   uses AntV G6 (window.G6, loaded via CDN script in discover.astro).

   Layout is four fixed rows, top to bottom:
     Goal  ->  heuristic composition  ->  capability chain  ->  simulated result.

   After the workflow is composed, a second pass simulates execution order:
   each node steps through idle -> running -> complete, the same three-state
   separation UMA's chapter-13 reference app uses. This page does not
   actually invoke the WASM binaries -- see the "How this is actually
   built" section on the page for what's real and what's a simulation. */
(function () {
  const CATALOG_URL = 'https://registry.traverse-framework.com/catalog.json';
  const REGISTRY_BASE = 'https://registry.traverse-framework.com';

  const root = document.getElementById('discover-root');
  if (!root) return;

  const graphEl = document.getElementById('discover-graph');
  const logEl = document.getElementById('discover-log');
  const cardsEl = document.getElementById('discover-cards');
  const statsEl = document.getElementById('discover-stats');
  const runBtn = document.getElementById('discover-run');
  const phaseTitleEl = document.getElementById('discover-phase-title');

  const STAGES = [
    { label: 'ingest', verbs: ['normalize', 'validate', 'initialize', 'capture'] },
    { label: 'interpret', verbs: ['extract', 'analyze', 'classify', 'assess', 'resolve', 'evaluate', 'curate', 'score', 'organize', 'process', 'completeness'] },
    { label: 'decide', verbs: ['assign', 'authorize', 'decide', 'calculate', 'transition', 'apply', 'select', 'prepare', 'eligibility'] },
    { label: 'act', verbs: ['recommend', 'notify', 'generate', 'record', 'aggregate', 'summarize', 'finalize', 'improve', 'recover', 'create'] },
  ];

  const GOAL_NODE = { id: '__goal', label: 'Goal', shape: 'diamond', size: 26 };
  const SYSTEM_NODES = [
    { id: '__catalog', label: 'Live catalog', shape: 'diamond', size: 30 },
    { id: '__heuristic', label: 'Name heuristic', shape: 'hexagon', size: 32 },
  ];
  const RESULT_NODE = { id: '__result', label: 'Result', shape: 'diamond', size: 26 };

  function stageOf(name) {
    for (let i = 0; i < STAGES.length; i++) {
      if (STAGES[i].verbs.some((v) => name.indexOf(v) !== -1)) return i;
    }
    return 2;
  }

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

  let colors = readColors();
  function readColors() {
    return {
      accent: cssVar('--accent') || '#debeef',
      border: cssVar('--border') || 'rgba(128,128,128,0.3)',
      card: cssVar('--bg-card') || '#0a3852',
      fg: cssVar('--fg') || '#fdfaf1',
      muted: cssVar('--fg-muted') || '#aac1cb',
      subtle: cssVar('--fg-subtle') || '#7d99a6',
      success: cssVar('--success') || '#9ccdb2',
    };
  }
  function isDarkTheme() { return document.documentElement.getAttribute('data-theme') !== 'light'; }

  function logLine(text, cls) {
    const line = document.createElement('div');
    line.className = 'discover-log-line' + (cls ? ' ' + cls : '');
    line.textContent = text;
    logEl.appendChild(line);
    logEl.scrollTop = logEl.scrollHeight;
  }

  function cmpVersion(a, b) {
    const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
      const d = (pa[i] || 0) - (pb[i] || 0);
      if (d !== 0) return d;
    }
    return 0;
  }

  async function fetchCatalog() {
    const res = await fetch(CATALOG_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  function latestByNamespace(data) {
    const latest = new Map();
    data.capabilities.forEach((entry) => {
      const id = entry.contract.id;
      const cur = latest.get(id);
      if (!cur || cmpVersion(entry.contract.version, cur.contract.version) > 0) latest.set(id, entry);
    });
    const byNs = new Map();
    latest.forEach((entry) => {
      const ns = entry.contract.namespace;
      if (!byNs.has(ns)) byNs.set(ns, []);
      byNs.get(ns).push(entry);
    });
    return byNs;
  }

  function pickWorkflow(byNs) {
    const eligible = Array.from(byNs.entries()).filter(([, list]) => list.length >= 2);
    if (!eligible.length) return null;
    const [namespace, list] = eligible[Math.floor(Math.random() * eligible.length)];
    const chain = list
      .slice()
      .sort((a, b) => {
        const sa = stageOf(a.contract.name), sb = stageOf(b.contract.name);
        return sa !== sb ? sa - sb : a.contract.name.localeCompare(b.contract.name);
      })
      .slice(0, 5);
    return { namespace, chain };
  }

  function registryUrl(entry) {
    const c = entry.contract;
    return REGISTRY_BASE + '/#/capability/' + encodeURIComponent(c.namespace + '/' + c.id + '@' + c.version);
  }

  function stageBadge(name) { return STAGES[stageOf(name)].label; }

  function humanizeName(name) {
    return name.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  /* ---- execution-state styling: idle (not used yet) / running (running now) / complete ---- */

  function stateStyle(state) {
    if (state === 'running') {
      return {
        fill: 'color-mix(in srgb, ' + colors.accent + ' 20%, transparent)',
        stroke: colors.accent,
        lineWidth: 2.5,
        shadowBlur: 22,
        shadowColor: colors.accent,
        labelFill: colors.fg,
      };
    }
    if (state === 'complete') {
      return {
        fill: 'color-mix(in srgb, ' + colors.success + ' 18%, transparent)',
        stroke: colors.success,
        lineWidth: 2,
        shadowBlur: 10,
        shadowColor: colors.success,
        labelFill: colors.fg,
      };
    }
    return {
      fill: colors.card,
      stroke: colors.border,
      lineWidth: 1.25,
      shadowBlur: 0,
      shadowColor: 'transparent',
      labelFill: colors.muted,
    };
  }

  function edgeStrokeFor(state) {
    if (state === 'running') return colors.accent;
    if (state === 'complete') return colors.success;
    return colors.border;
  }

  let graph = null;
  let nodeMeta = new Map();
  let nodeState = new Map();
  let edgeIntoNode = new Map();
  let edgeDashed = new Map();
  let positions = new Map();
  let orderedNodeIds = [];
  const urlById = new Map();

  function spread(n, minX, maxX) {
    if (n <= 1) return [(minX + maxX) / 2];
    const step = (maxX - minX) / (n - 1);
    return Array.from({ length: n }, (_, i) => minX + step * i);
  }

  function computePositions(capCount, W, H) {
    const marginX = 54, marginY = 44;
    const minX = marginX, maxX = Math.max(W - marginX, marginX + 1);
    const rowY = (i) => marginY + ((Math.max(H - 2 * marginY, 1)) * i) / 3;

    const map = new Map();
    map.set(GOAL_NODE.id, { x: (minX + maxX) / 2, y: rowY(0) });

    const sysXs = spread(SYSTEM_NODES.length, minX, maxX);
    SYSTEM_NODES.forEach((n, i) => map.set(n.id, { x: sysXs[i], y: rowY(1) }));

    const capXs = spread(Math.max(capCount, 1), minX, maxX);
    for (let i = 0; i < capCount; i++) map.set('__cap-slot-' + i, { x: capXs[i], y: rowY(2) });

    map.set(RESULT_NODE.id, { x: (minX + maxX) / 2, y: rowY(3) });
    return map;
  }

  function buildGraphPieces(chain) {
    urlById.clear();
    nodeMeta = new Map();
    edgeIntoNode = new Map();
    edgeDashed = new Map();
    positions = computePositions(chain.length, graphEl.clientWidth, graphEl.clientHeight);

    nodeMeta.set(GOAL_NODE.id, { kind: 'role', shape: GOAL_NODE.shape, size: GOAL_NODE.size, label: GOAL_NODE.label });
    const goalNode = { id: GOAL_NODE.id, type: GOAL_NODE.shape, data: {} };

    /* The intermediate layer describes only what this page does: read live
       catalog metadata and derive an order with a client-side heuristic. */
    const systemNodes = SYSTEM_NODES.map((n) => {
      nodeMeta.set(n.id, { kind: 'role', shape: n.shape, size: n.size, label: n.label });
      return { id: n.id, type: n.shape, data: {} };
    });

    const goalEdgeId = 'goal-edge';
    const goalEdge = { id: goalEdgeId, source: GOAL_NODE.id, target: '__catalog' };
    edgeIntoNode.set('__catalog', goalEdgeId);
    edgeDashed.set(goalEdgeId, true);

    /* Catalog -> heuristic is derived metadata flow, not an execution path. */
    const systemEdges = [];
    for (let i = 0; i < SYSTEM_NODES.length - 1; i++) {
      const id = 'system-edge-' + i;
      systemEdges.push({ id, source: SYSTEM_NODES[i].id, target: SYSTEM_NODES[i + 1].id });
      edgeIntoNode.set(SYSTEM_NODES[i + 1].id, id);
      edgeDashed.set(id, true);
    }

    /* The solid path is a derived pipeline visualization, not execution. */
    const capSteps = chain.map((entry, i) => {
      const c = entry.contract;
      const nodeId = 'cap-' + c.id;
      const url = registryUrl(entry);
      urlById.set(nodeId, url);
      nodeMeta.set(nodeId, { kind: 'capability', shape: 'circle', size: 20, label: humanizeName(c.name) });
      positions.set(nodeId, positions.get('__cap-slot-' + i));
      const node = { id: nodeId, type: 'circle', data: {} };
      const prevId = i === 0 ? '__heuristic' : 'cap-' + chain[i - 1].contract.id;
      const edgeId = 'cap-edge-' + i;
      const edge = { id: edgeId, source: prevId, target: nodeId };
      edgeIntoNode.set(nodeId, edgeId);
      edgeDashed.set(edgeId, false);
      return { node, edge };
    });

    nodeMeta.set(RESULT_NODE.id, { kind: 'role', shape: RESULT_NODE.shape, size: RESULT_NODE.size, label: RESULT_NODE.label });
    const resultNode = { id: RESULT_NODE.id, type: RESULT_NODE.shape, data: {} };
    const lastCapId = capSteps.length ? capSteps[capSteps.length - 1].node.id : '__heuristic';
    const resultEdgeId = 'result-edge';
    const resultEdge = { id: resultEdgeId, source: lastCapId, target: RESULT_NODE.id };
    edgeIntoNode.set(RESULT_NODE.id, resultEdgeId);
    edgeDashed.set(resultEdgeId, false);

    orderedNodeIds = [GOAL_NODE.id, ...SYSTEM_NODES.map((n) => n.id), ...capSteps.map((s) => s.node.id), RESULT_NODE.id];
    nodeState = new Map(orderedNodeIds.map((id) => [id, 'idle']));

    return { goalNode, goalEdge, systemNodes, systemEdges, capSteps, resultNode, resultEdge };
  }

  function nodeStyleFor(id) {
    const meta = nodeMeta.get(id);
    const state = nodeState.get(id) || 'idle';
    const pos = positions.get(id) || { x: 0, y: 0 };
    return Object.assign(
      {
        x: pos.x,
        y: pos.y,
        size: meta.size,
        cursor: meta.kind === 'capability' ? 'pointer' : 'default',
        labelText: meta.label,
        labelFontFamily: "'JetBrains Mono', monospace",
        labelFontSize: meta.kind === 'role' ? 10 : 8,
        labelFontWeight: meta.kind === 'role' ? 600 : 400,
        labelPlacement: 'bottom',
        labelOffsetY: meta.kind === 'role' ? 8 : 6,
        labelWordWrap: true,
        labelMaxWidth: meta.kind === 'role' ? 108 : 66,
        labelMaxLines: meta.kind === 'role' ? 2 : 4,
        labelTextAlign: 'center',
        halo: false,
      },
      stateStyle(state)
    );
  }

  function edgeStyleFor(edgeId, targetId) {
    const state = nodeState.get(targetId) || 'idle';
    return {
      id: edgeId,
      style: {
        stroke: edgeStrokeFor(state),
        lineWidth: state === 'idle' ? 1.25 : 1.75,
        lineDash: edgeDashed.get(edgeId) ? [4, 4] : [],
        endArrow: true,
        endArrowSize: 6,
      },
    };
  }

  function comboStyleFor() {
    return {
      fill: 'color-mix(in srgb, ' + colors.accent + ' 8%, transparent)',
      stroke: 'color-mix(in srgb, ' + colors.accent + ' 55%, transparent)',
      lineWidth: 1.5,
      lineDash: [3, 3],
      labelText: 'Traverse system',
      labelPlacement: 'top',
      labelFill: colors.fg,
      labelFontFamily: "'JetBrains Mono', monospace",
      labelFontSize: 9.5,
      labelFontWeight: 600,
      padding: 18,
    };
  }

  async function paintNode(id) {
    graph.updateNodeData([{ id, style: nodeStyleFor(id) }]);
    const edgeId = edgeIntoNode.get(id);
    if (edgeId) graph.updateEdgeData([edgeStyleFor(edgeId, id)]);
    await graph.draw();
  }

  async function paintNodes(ids) {
    graph.updateNodeData(ids.map((id) => ({ id, style: nodeStyleFor(id) })));
    const edgeUpdates = ids.filter((id) => edgeIntoNode.has(id)).map((id) => edgeStyleFor(edgeIntoNode.get(id), id));
    if (edgeUpdates.length) graph.updateEdgeData(edgeUpdates);
    await graph.draw();
  }

  async function repaintAll() {
    if (!graph) return;
    graph.updateNodeData(orderedNodeIds.map((id) => ({ id, style: nodeStyleFor(id) })));
    graph.updateEdgeData(
      orderedNodeIds.filter((id) => edgeIntoNode.has(id)).map((id) => edgeStyleFor(edgeIntoNode.get(id), id))
    );
    await graph.draw();
  }

  new MutationObserver(() => {
    colors = readColors();
    if (graph) {
      graph.setOptions({ theme: isDarkTheme() ? 'dark' : 'light' });
      repaintAll();
    }
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  window.addEventListener('resize', () => {
    if (graph) graph.setSize(graphEl.clientWidth, graphEl.clientHeight);
  });

  /* Reuse a single Graph instance across runs -- destroying and recreating
     it on every "Discover another workflow" click was measured to make each
     subsequent render ~20s slower (first render is fast, every recreation
     after that pays a large fixed cost). graph.clear() resets content on
     the same instance without that cost. */
  async function renderGraph(chain) {
    const { goalNode, goalEdge, systemNodes, systemEdges, capSteps, resultNode, resultEdge } = buildGraphPieces(chain);

    if (!graph) {
      graph = new G6.Graph({
        container: graphEl,
        width: graphEl.clientWidth,
        height: graphEl.clientHeight,
        theme: isDarkTheme() ? 'dark' : 'light',
        animation: false,
        data: { nodes: [], edges: [], combos: [] },
        node: {},
        edge: { type: 'cubic-vertical' },
        behaviors: ['drag-canvas'],
      });
      await graph.render();

      graph.on('node:click', (evt) => {
        const url = urlById.get(evt.target.id);
        if (url) window.open(url, '_blank', 'noopener');
      });
    } else {
      graph.setSize(graphEl.clientWidth, graphEl.clientHeight);
      await graph.clear();
    }

    /* Fixed part -- Goal and the page's metadata layer are the same on every
       run, so they render immediately instead of trickling in. Only the
       capability chain (what actually changed) reveals one at a time. */
    graph.addData({
      nodes: [
        { ...goalNode, style: nodeStyleFor(goalNode.id) },
        ...systemNodes.map((n) => ({ ...n, style: nodeStyleFor(n.id) })),
      ],
      edges: [goalEdge, ...systemEdges].map((e) => ({ ...e, style: edgeStyleFor(e.id, e.target).style })),
      combos: [],
    });
    await graph.draw();
    await graph.fitView({ padding: 24 });

    for (const step of capSteps) {
      graph.addData({
        nodes: [{ ...step.node, style: nodeStyleFor(step.node.id) }],
        edges: [{ ...step.edge, style: edgeStyleFor(step.edge.id, step.edge.target).style }],
      });
      await graph.draw();
      await sleep(260);
    }

    graph.addData({
      nodes: [{ ...resultNode, style: nodeStyleFor(resultNode.id) }],
      edges: [{ ...resultEdge, style: edgeStyleFor(resultEdge.id, resultEdge.target).style }],
    });
    await graph.draw();

    await graph.fitView({ padding: 24, animation: { duration: 300, easing: 'ease-out' } });
    await simulateExecution();
  }

  async function simulateExecution() {
    await sleep(200);
    if (phaseTitleEl) phaseTitleEl.textContent = 'simulation · visualizing derived pipeline states';
    logLine('→ simulating execution order -- nothing here invokes the real WASM binaries', 'muted');
    await sleep(200);

    /* Fixed metadata steps complete instantly -- Goal and the page's derived layer
       are always reached the same way, nothing interesting to watch there.
       Only the capability chain + Result step one at a time. */
    const fixedIds = [GOAL_NODE.id, ...SYSTEM_NODES.map((n) => n.id)];
    fixedIds.forEach((id) => nodeState.set(id, 'complete'));
    await paintNodes(fixedIds);
    await sleep(200);

    const dynamicIds = orderedNodeIds.filter((id) => !fixedIds.includes(id));
    for (const id of dynamicIds) {
      nodeState.set(id, 'running');
      await paintNode(id);
      await sleep(380);
      nodeState.set(id, 'complete');
      await paintNode(id);
      await sleep(120);
    }
    if (phaseTitleEl) phaseTitleEl.textContent = 'simulation · visualization complete';
    logLine('✓ simulated run complete -- every node is now in a state a real execution would leave it in', 'ok');
  }

  function renderCards(chain) {
    cardsEl.innerHTML = '';
    chain.forEach((entry) => {
      const c = entry.contract;
      const cov = entry.test_coverage ? Math.round(entry.test_coverage.lines_percent) + '% covered' : null;
      const card = document.createElement('a');
      card.href = registryUrl(entry);
      card.target = '_blank';
      card.rel = 'noopener';
      card.className = 'card card-accent-hover discover-card';
      card.innerHTML =
        '<div class="discover-card-top">' +
        '<span class="badge badge-accent">' + stageBadge(c.name) + '</span>' +
        (cov ? '<span class="badge badge-success">' + cov + '</span>' : '') +
        '</div>' +
        '<div class="discover-card-title">' + humanizeName(c.name) + '</div>' +
        '<div class="discover-card-id">' + c.id + '</div>' +
        '<div class="discover-card-summary t-body-sm t-muted">' + c.summary + '</div>' +
        '<div class="discover-card-link">View real contract v' + c.version + ' →</div>';
      cardsEl.appendChild(card);
    });
  }

  function withTimeout(promise, ms, label) {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(label + ' timed out after ' + ms + 'ms')), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }

  async function run() {
    runBtn.disabled = true;
    logEl.innerHTML = '';
    cardsEl.innerHTML = '';
    if (phaseTitleEl) phaseTitleEl.textContent = 'live catalog · deriving a heuristic pipeline';

    try {
      logLine('$ fetch registry.traverse-framework.com/catalog.json', 'cmd');
      let data;
      try {
        data = await fetchCatalog();
      } catch (err) {
        logLine('✗ registry unreachable (' + err.message + ')', 'err');
        logLine('  this demo needs a live connection to the public catalog -- nothing here is faked locally', 'muted');
        return;
      }

      const byNs = latestByNamespace(data);
      const activeCount = Array.from(byNs.values()).reduce((s, l) => s + l.length, 0);
      logLine('✓ ' + data.capabilities.length + ' published versions retrieved, ' + activeCount + ' active capabilities across ' + byNs.size + ' namespaces', 'ok');
      statsEl.textContent = data.capabilities.length + ' published versions · ' + activeCount + ' active capabilities · ' + byNs.size + ' namespaces';
      await sleep(150);

      logLine('→ scanning namespaces for a composable chain (2+ active capabilities)...', 'muted');
      await sleep(200);
      const picked = pickWorkflow(byNs);
      if (!picked) {
        logLine('✗ no namespace currently has enough active capabilities to chain', 'err');
        return;
      }
      logLine('✓ "' + picked.namespace + '" has ' + picked.chain.length + ' active capabilities available', 'ok');
      await sleep(150);
      logLine('→ ordering by pipeline stage: ingest → interpret → decide → act', 'muted');
      await sleep(150);
      logLine('→ live catalog metadata is grouped and ordered by a client-side heuristic', 'muted');
      await sleep(150);
      logLine('✓ workflow composed: ' + picked.chain.map((c) => humanizeName(c.contract.name)).join(' → ') + ' → Result', 'accent');

      renderCards(picked.chain);
      await withTimeout(renderGraph(picked.chain), 15000, 'graph render');
    } catch (err) {
      logLine('✗ graph render failed (' + err.message + ') -- see console for details', 'err');
      console.error('[discover]', err);
    } finally {
      runBtn.disabled = false;
    }
  }

  runBtn.addEventListener('click', run);
  run();
})();
