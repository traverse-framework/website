/* Hero capability graph animation */
(function () {
  const canvas = document.getElementById('hero-graph');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const ACCENT = '#E8510A';
  const MUTED  = 'rgba(255,255,255,0.12)';
  const NODE_STROKE = 'rgba(255,255,255,0.08)';

  const nodes = [
    { id: 'core',     label: 'Traverse',  x: 0.5,  y: 0.5,  r: 28, primary: true  },
    { id: 'browser',  label: 'Browser',   x: 0.18, y: 0.22, r: 18, primary: false },
    { id: 'edge',     label: 'Edge',      x: 0.82, y: 0.22, r: 18, primary: false },
    { id: 'cloud',    label: 'Cloud',     x: 0.82, y: 0.75, r: 18, primary: false },
    { id: 'ai',       label: 'AI Agent',  x: 0.18, y: 0.75, r: 18, primary: false },
    { id: 'c1',       label: 'capability', x: 0.5,  y: 0.18, r: 10, cap: true     },
    { id: 'c2',       label: 'capability', x: 0.72, y: 0.48, r: 10, cap: true     },
    { id: 'c3',       label: 'capability', x: 0.5,  y: 0.78, r: 10, cap: true     },
    { id: 'c4',       label: 'capability', x: 0.28, y: 0.48, r: 10, cap: true     },
  ];

  const edges = [
    ['core', 'browser'], ['core', 'edge'], ['core', 'cloud'], ['core', 'ai'],
    ['core', 'c1'], ['core', 'c2'], ['core', 'c3'], ['core', 'c4'],
    ['c1', 'browser'], ['c1', 'edge'],
    ['c2', 'edge'], ['c2', 'cloud'],
    ['c3', 'cloud'], ['c3', 'ai'],
    ['c4', 'ai'], ['c4', 'browser'],
  ];

  /* Packets travelling along edges */
  const packets = edges.map((e) => ({
    from: e[0], to: e[1],
    t: Math.random(),
    speed: 0.003 + Math.random() * 0.003,
    active: Math.random() > 0.5,
  }));

  let W, H, dpr;
  function resize() {
    dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    W = rect.width;
    H = rect.height || 520;
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';
    ctx.scale(dpr, dpr);
  }
  resize();
  window.addEventListener('resize', () => { ctx.setTransform(1,0,0,1,0,0); resize(); });

  function pos(n) { return { x: n.x * W, y: n.y * H }; }
  function getNode(id) { return nodes.find(n => n.id === id); }

  let frame = 0;
  function draw() {
    ctx.clearRect(0, 0, W, H);
    frame++;

    /* Edges */
    edges.forEach(([aId, bId]) => {
      const a = pos(getNode(aId));
      const b = pos(getNode(bId));
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = MUTED;
      ctx.lineWidth = 0.75;
      ctx.stroke();
    });

    /* Packets */
    packets.forEach(p => {
      if (!p.active) {
        if (Math.random() < 0.002) p.active = true;
        return;
      }
      p.t += p.speed;
      if (p.t > 1) {
        p.t = 0;
        p.active = Math.random() > 0.3;
      }
      const a = pos(getNode(p.from));
      const b = pos(getNode(p.to));
      const x = a.x + (b.x - a.x) * p.t;
      const y = a.y + (b.y - a.y) * p.t;
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = ACCENT;
      ctx.globalAlpha = 0.9;
      ctx.fill();
      ctx.globalAlpha = 1;
    });

    /* Nodes */
    nodes.forEach(n => {
      const { x, y } = pos(n);
      const pulse = n.primary ? (0.85 + 0.15 * Math.sin(frame * 0.025)) : 1;

      if (n.primary) {
        /* Glow */
        const grd = ctx.createRadialGradient(x, y, 0, x, y, n.r * 3);
        grd.addColorStop(0, 'rgba(232,81,10,0.18)');
        grd.addColorStop(1, 'rgba(232,81,10,0)');
        ctx.beginPath();
        ctx.arc(x, y, n.r * 3, 0, Math.PI * 2);
        ctx.fillStyle = grd;
        ctx.fill();
      }

      /* Circle */
      ctx.beginPath();
      ctx.arc(x, y, n.r * pulse, 0, Math.PI * 2);
      ctx.fillStyle = n.primary ? '#141414' : (n.cap ? '#0f0f0f' : '#111');
      ctx.fill();
      ctx.strokeStyle = n.primary ? ACCENT : (n.cap ? 'rgba(232,81,10,0.35)' : NODE_STROKE);
      ctx.lineWidth = n.primary ? 1.5 : (n.cap ? 1 : 0.75);
      ctx.stroke();

      /* Label */
      ctx.fillStyle = n.primary ? '#ededed' : (n.cap ? 'rgba(232,81,10,0.7)' : 'rgba(255,255,255,0.5)');
      ctx.font = n.primary
        ? `600 ${11}px 'Space Grotesk', sans-serif`
        : `${9}px 'Inter', sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (!n.cap) ctx.fillText(n.label, x, y);
    });

    requestAnimationFrame(draw);
  }
  draw();
})();
