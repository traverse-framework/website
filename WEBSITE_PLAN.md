# Traverse Website — Full Redesign Plan

## Overview

A complete multi-page rebuild of traverse-framework.com. Design direction: Linear.app-inspired — dark-first, clean grid, rich typography, subtle gradients, code blocks as first-class citizens. SEO-optimized with structured data, per-page meta, and sitemap.

**Stack:** Pure HTML/CSS/JS — no framework, static files served via GitHub Pages.  
**Version:** v0.7.0  
**License:** Apache 2.0

---

## Site Architecture

```
/                   → Home
/docs               → Documentation hub
/docs/quickstart    → First runnable flow
/docs/concepts      → Core concepts (contracts, registry, runtime)
/docs/guides        → Authoring guides
/examples           → Expedition example + patterns
/use-cases          → Concrete apps you can build today
/changelog          → Release history
```

Each page is a standalone `.html` file sharing a common `_includes/`-style header/footer injected via JS template literals, or duplicated for static simplicity.

---

## Design System

### Colors (Dark-first, Light toggle)
```css
/* Dark (default) */
--bg:           #0A0A0A;
--bg-elevated:  #111111;
--bg-card:      #161616;
--fg:           #EDEDED;
--fg-muted:     #8A8A8A;
--accent:       #E8510A;
--accent-glow:  rgba(232, 81, 10, 0.15);
--border:       rgba(255,255,255,0.08);
--code-bg:      #0D1117;
--success:      #3FB950;

/* Light */
--bg:           #FFFFFF;
--bg-elevated:  #FAFAFA;
--bg-card:      #F5F5F5;
--fg:           #0D0D0D;
--fg-muted:     #6B6B6B;
--border:       rgba(0,0,0,0.08);
```

### Typography
- **Display:** Space Grotesk 600/700 — headlines, hero
- **Body:** Inter 300/400 — paragraphs, nav
- **Mono:** JetBrains Mono 400/500 — code, badges, version numbers

### Visual Language (Linear-inspired)
- Hairline borders (`1px`) on cards
- Subtle radial gradients behind key sections (orange glow from accent)
- Frosted glass nav with `backdrop-filter: blur`
- Animated underlines on links (not color changes)
- Code blocks with syntax highlighting (Prism.js)
- No border-radius > 8px — sharp, minimal
- Capability graph animation on home hero (canvas)
- Grid lines as decorative background texture

---

## Pages

---

### 1. Home (`/index.html`)

**SEO title:** `Traverse — Contract-Driven WASM Runtime for Portable Business Capabilities`  
**Meta description:** `Traverse is a contract-driven Rust and WASM runtime. Define business logic once, run it identically across browser, edge, cloud, and AI pipelines — governed by machine-readable contracts.`

**Sections:**

#### Hero
- Dark background with subtle orange radial glow
- Animated capability graph (canvas) — nodes for browser/edge/cloud/ai-agent pulsing
- Headline: `Business logic that runs anywhere. Governed by contracts.`
- Subhead: exact current copy
- CTAs: `View on GitHub →` (primary orange) + `Read the docs` (ghost)
- Version badge: `v0.7.0 · Apache 2.0`

#### Social Proof Bar
- Horizontal strip: `Rust-first` · `WASM-native` · `100% test coverage` · `Spec-governed` · `CI-gated`

#### Problem (4 cards, 2×2 grid)
- Same 4 problem cards from current site
- Dark card style with left-border accent on hover
- Section label, headline, narrative paragraph

#### How It Works (3-step horizontal)
```
1. Define a contract     →     2. Compile to WASM     →     3. Place anywhere
   [contract.toml]              [capability.wasm]              browser|edge|cloud|ai
```
- With the `traverse.spec.toml` code block (current site copy)

#### What You Can Build (6 tiles, links to /use-cases)
1. Browser-hosted app with governed runtime
2. MCP server for AI capability discovery
3. Workflow-backed business capabilities
4. Portable WASM agents
5. Multi-environment business rules
6. Auditable AI pipelines

#### Core Principles (6 cards)
- Current 6 principles, card grid
- Icon per principle (SVG)

#### Live Example Preview
- Trimmed expedition planning walkthrough
- Terminal-style animated output showing: `ready → discovering → executing → completed`
- Link to `/examples` for full walkthrough

#### Lineage
- Current lineage section — UMA, Book, C-DAD, GitHub links
- Status card (v0.7.0, shipping checklist)

#### CTA Band
- Dark orange band: `Start building. Read the quickstart.`
- Buttons: `Quickstart →` + `GitHub`

#### Footer
- Logo + tagline
- Nav columns: Product, Docs, Ecosystem, Author
- Social: GitHub, Twitter, enricopiovesan.com

---

### 2. Docs Hub (`/docs/index.html`)

**SEO title:** `Traverse Docs — Quickstart, Concepts, Guides`  
**Meta description:** `Everything you need to build with Traverse. From your first runnable flow to authoring capabilities, events, workflows, and WASM modules.`

**Layout:** Two-column — fixed left sidebar + scrollable content area

**Sidebar sections:**
```
Getting Started
  → Quickstart
  → What can I build?
  → Installation

Core Concepts
  → Contracts
  → Registry
  → Runtime & Execution
  → Placement Targets

Guides
  → Author a Capability
  → Author an Event
  → Build a Workflow
  → Build a WASM Agent
  → MCP Server Setup

Reference
  → CLI Reference
  → Contract Schema
  → Changelog
```

**Main content (hub page):**
- Learning paths table (same as README)
- Quick cards linking to each major section
- "Where to start?" decision tree

---

### 3. Quickstart (`/docs/quickstart.html`)

**SEO title:** `Traverse Quickstart — Your First Runnable Flow`  
**Meta description:** `Run the Traverse expedition planning example in under 5 minutes. Browser demo, CLI commands, and expected output — step by step.`

**Content:**
1. Prerequisites (`cargo`, `node`, Rust 1.94+)
2. Clone the repo
3. Run the browser adapter (Terminal 1)
4. Run the React demo (Terminal 2)
5. Open browser at `http://127.0.0.1:4173`
6. Click "Submit approved request" — show the JSON payload
7. Expected output with state transitions: `ready → streaming → completed`
8. Bundle inspection: `cargo run -p traverse-cli -- bundle inspect ...`
9. Expected bundle output
10. Next steps: link to authoring guide, concepts, MCP setup

---

### 4. Core Concepts (`/docs/concepts.html`)

**SEO title:** `Traverse Core Concepts — Contracts, Registry, Runtime, Placement`  
**Meta description:** `Understand how Traverse's contract system, capability registry, deterministic runtime, and placement abstraction work together.`

**Sections:**
1. **Capability Contracts** — anatomy of `contract.json`, all fields
2. **Event Contracts** — event schema, publishers, subscribers
3. **Registry** — capability/event/workflow registry, bundle structure
4. **Runtime Execution Model** — state machine diagram (idle → loading_registry → ready → ... → completed)
5. **Placement Abstraction** — browser/edge/cloud/ai-pipeline/local targets
6. **Trace Artifacts** — what a trace contains, how to read it
7. **Workflow Composition** — graph traversal, determinism, terminal conditions
8. **Spec-Driven Development** — the 9 governing specs, the spec-alignment gate

---

### 5. Examples (`/examples/index.html`)

**SEO title:** `Traverse Examples — Expedition Planning, Workflow Patterns`  
**Meta description:** `Explore Traverse examples. Start with the expedition planning domain: 6 capabilities, 5 events, 1 workflow — fully governed and traceable.`

**Content:**

#### Example 1: Expedition Planning (featured)
- Domain overview
- Architecture diagram: 6 capabilities as nodes, 5 events as edges, 1 workflow
- Each capability card:
  - `interpret-expedition-intent`
  - `capture-expedition-objective`
  - `assess-conditions-summary`
  - `validate-team-readiness`
  - `assemble-expedition-plan`
  - `plan-expedition` (workflow orchestrator)
- Contract snippet for `plan-expedition`
- Expected trace output (formatted JSON)
- Full bundle CLI commands

#### Example 2: Patterns Index (cards)
- Browser-hosted governed runtime
- AI agent with MCP capability discovery
- Multi-step validated workflow
- Portable WASM rule engine

---

### 6. Use Cases (`/use-cases/index.html`)

**SEO title:** `What You Can Build with Traverse — Apps, Agents, Pipelines`  
**Meta description:** `Discover what you can build with Traverse today: governed browser apps, MCP-backed AI agents, workflow pipelines, portable WASM business rules.`

**5 detailed use case sections:**

#### 1. Browser-Hosted App with Governed Runtime
- Problem: UI calling business logic scattered across services
- Traverse solution: local browser adapter + capability registry
- Architecture: diagram (UI → adapter:4174 → runtime → WASM capability)
- Code snippet: submitting a governed request from the browser
- Real output: trace showing discovered → executed path

#### 2. MCP Server for AI Capability Discovery
- Problem: AI agents guessing at what a system can do
- Traverse solution: stdio MCP server exposing governed capabilities
- Architecture: AI client → MCP stdio → traverse-mcp → registry
- Code snippet: MCP tool call + response
- Why it matters: agents operate on declared contracts, not inferred APIs

#### 3. Workflow-Backed Business Capabilities
- Problem: multi-step business flows with invisible state and no audit trail
- Traverse solution: workflow definition + deterministic graph traversal
- Architecture: workflow graph (5 nodes, 5 events)
- Code snippet: workflow contract + event emissions
- Output: ordered trace with emitted events at each step

#### 4. Portable WASM Business Rules
- Problem: pricing/eligibility/validation logic copy-pasted across 4 runtimes
- Traverse solution: single WASM binary under a contract, placed anywhere
- Architecture: same binary → browser | edge | cloud | ai-pipeline
- Code snippet: capability contract with multi-target placement
- Output: identical result regardless of placement target

#### 5. Auditable AI Pipeline
- Problem: AI decisions with no record of what ran or why
- Traverse solution: contract-first execution with trace artifacts
- Architecture: ai-agent → traverse runtime → governed capabilities → trace
- Code snippet: trace artifact (structured JSON)
- Output: every decision queryable, every path recorded

---

### 7. Changelog (`/changelog.html`)

**SEO title:** `Traverse Changelog — v0.7.0`  
**Meta description:** `Release history for Traverse. See what shipped in each version.`

**Content:**
- v0.7.0 — current (Browser adapter, MCP server, React demo, expedition example)
- v0.5.0 — release artifacts, app registration
- Earlier — spec governance, foundation

---

## SEO Implementation

### Per-page
```html
<title>{page title}</title>
<meta name="description" content="{description}">
<link rel="canonical" href="https://traverse-framework.com{path}">

<!-- Open Graph -->
<meta property="og:title" content="{title}">
<meta property="og:description" content="{description}">
<meta property="og:url" content="https://traverse-framework.com{path}">
<meta property="og:image" content="https://traverse-framework.com/assets/og-image.png">
<meta property="og:type" content="website">

<!-- Twitter -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:creator" content="@enricopiovesan">
```

### Structured Data (JSON-LD on homepage)
```json
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "Traverse",
  "description": "Contract-driven WASM runtime...",
  "url": "https://traverse-framework.com",
  "author": { "@type": "Person", "name": "Enrico Piovesan" },
  "license": "https://www.apache.org/licenses/LICENSE-2.0",
  "applicationCategory": "DeveloperApplication",
  "operatingSystem": "Any"
}
```

### Sitemap (updated)
```xml
/
/docs/
/docs/quickstart
/docs/concepts
/examples/
/use-cases/
/changelog
```

### robots.txt
```
User-agent: *
Allow: /
Sitemap: https://traverse-framework.com/sitemap.xml
```

---

## File Structure

```
traverseweb/
├── index.html
├── sitemap.xml
├── robots.txt
├── favicon.svg
├── CNAME
├── assets/
│   ├── css/
│   │   ├── base.css        # reset, tokens, typography
│   │   ├── nav.css
│   │   └── components.css  # cards, code blocks, badges
│   ├── js/
│   │   ├── nav.js          # mobile nav, active state
│   │   ├── theme.js        # dark/light toggle
│   │   ├── graph.js        # hero canvas animation
│   │   └── prism.min.js    # syntax highlighting
│   ├── img/
│   │   ├── logo.png
│   │   ├── logo-medium.jpeg
│   │   └── og-image.png
│   └── fonts/              # (loaded via Google Fonts CDN)
├── docs/
│   ├── index.html
│   ├── quickstart.html
│   └── concepts.html
├── examples/
│   └── index.html
├── use-cases/
│   └── index.html
└── changelog.html
```

---

## Build Order

1. **`assets/css/base.css`** — tokens, reset, typography
2. **`assets/css/components.css`** — shared UI components
3. **Shared nav + footer HTML snippet** (inline in each page)
4. **`index.html`** — Home (all sections)
5. **`use-cases/index.html`** — 5 use cases with code
6. **`examples/index.html`** — Expedition walkthrough
7. **`docs/quickstart.html`** — Step-by-step guide
8. **`docs/concepts.html`** — Core concepts reference
9. **`docs/index.html`** — Docs hub with sidebar
10. **`changelog.html`** — Release history
11. **`sitemap.xml`** — Updated with all pages
12. **`robots.txt`**

---

## Notes

- All pages share Google Analytics tag `G-Z2T980YV3P`
- Logo `logo.png` from repo — used in nav and footer
- Dark mode is default; system preference respected via `prefers-color-scheme`
- Light/dark toggle persisted in `localStorage`
- Mobile-responsive: sidebar collapses to hamburger on docs pages
- No JS frameworks — vanilla ES modules only
- Code syntax highlighting: Prism.js (Rust, TOML, JSON, Bash)
