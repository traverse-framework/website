#!/usr/bin/env python3
"""
Convert legacy HTML pages → Astro .astro pages.

Usage:
  python3 scripts/convert.py

For each .html file (excluding index.html, handled separately):
  - Parses title, description, canonical, JSON-LD
  - Detects layout (QuestionLayout, SubpageLayout, BaseLayout)
  - Extracts body content between mobile-menu and <footer>
  - Writes src/pages/<path>.astro
"""

import os
import re
from pathlib import Path

ROOT = Path(__file__).parent.parent
SRC_PAGES = ROOT / "src" / "pages"

# Pages that have bespoke .astro files already (skip them)
SKIP = {"index.html"}

# Maps folder → breadcrumb label
SECTION_LABELS = {
    "questions": "Questions",
    "docs": "Docs",
    "solutions": "Solutions",
    "use-cases": "Use Cases",
    "blog": "Blog",
    "compare": "Compare",
    "examples": "Examples",
}

# Maps folder → question category (for QuestionLayout)
QUESTION_CATEGORIES = {
    "questions": True,
}


def get_tag_text(html: str, tag: str, attr: str = None, attr_val: str = None) -> str:
    """Extract text of a tag, optionally filtered by attr=attr_val."""
    if attr:
        pattern = rf'<{tag}[^>]*\s{attr}=["\']([^"\']*)["\'][^>]*\s(?:name|property)=["\'][^"\']*["\'][^>]*/>'
        # simpler: just match name/property attributes
        patterns = [
            rf'<meta[^>]*name=["\']{attr_val}["\'][^>]*content=["\']([^"\']*)["\']',
            rf'<meta[^>]*content=["\']([^"\']*)["\'][^>]*name=["\']{attr_val}["\']',
            rf'<meta[^>]*property=["\']{attr_val}["\'][^>]*content=["\']([^"\']*)["\']',
            rf'<meta[^>]*content=["\']([^"\']*)["\'][^>]*property=["\']{attr_val}["\']',
        ]
        for p in patterns:
            m = re.search(p, html)
            if m:
                return m.group(1)
        return ""
    m = re.search(rf'<{tag}[^>]*>(.*?)</{tag}>', html, re.DOTALL)
    return m.group(1).strip() if m else ""


def get_description(html: str) -> str:
    return get_tag_text(html, "meta", "name", "description")


def get_canonical(html: str) -> str:
    m = re.search(r'<link[^>]*rel=["\']canonical["\'][^>]*href=["\']([^"\']+)["\']', html)
    if not m:
        m = re.search(r'<link[^>]*href=["\']([^"\']+)["\'][^>]*rel=["\']canonical["\']', html)
    return m.group(1) if m else ""


def get_json_ld(html: str) -> str:
    m = re.search(r'<script type=["\']application/ld\+json["\']>(.*?)</script>', html, re.DOTALL)
    return m.group(1).strip() if m else ""


def get_body_content(html: str) -> str:
    """Extract everything between the end of nav-mobile-menu div and the footer."""
    # Find end of nav-mobile-menu
    nav_end = html.find('</div>', html.find('id="nav-mobile-menu"'))
    if nav_end == -1:
        # Fallback: end of </nav>
        nav_end = html.find('</nav>') + len('</nav>')
    else:
        nav_end += len('</div>')

    # Find start of footer
    footer_start = html.rfind('<footer')
    if footer_start == -1:
        footer_start = html.rfind('</body>')

    content = html[nav_end:footer_start].strip()
    return content


def get_q_content(html: str) -> tuple[str, list[dict], str]:
    """Extract question body, related links, and detect category from q-layout."""
    # Category label
    cat_m = re.search(r'class=["\']q-label["\'][^>]*>([^<]+)<', html)
    category = cat_m.group(1).strip() if cat_m else "Questions"

    # Main body content (inside q-body)
    body_m = re.search(r'<div class=["\']q-body["\']>(.*?)</div>\s*</main>', html, re.DOTALL)
    body = body_m.group(1).strip() if body_m else ""

    # Related links
    related = []
    related_block = re.search(r'class=["\']q-related["\'][^>]*>(.*?)</div>', html, re.DOTALL)
    if related_block:
        for m in re.finditer(r'<a href=["\']([^"\']+)["\'][^>]*>([^<]+)</a>', related_block.group(1)):
            related.append({"href": m.group(1), "label": m.group(2).strip()})

    return body, related, category


def escape_backtick(s: str) -> str:
    return s.replace('`', r'\`').replace('$', r'\$')


def convert_question(html_path: Path, rel_parts: list[str]):
    html = html_path.read_text(encoding="utf-8")
    title = get_tag_text(html, "title")
    # Strip the site suffix for display
    display_title = re.sub(r'\s*[—–-]\s*Traverse Framework$', '', title).strip()
    description = get_description(html)
    canonical = get_canonical(html)
    json_ld = get_json_ld(html)
    body, related, category = get_q_content(html)

    related_str = "[\n" + ",\n".join(
        f'    {{ href: "{r["href"]}", label: "{escape_backtick(r["label"])}" }}'
        for r in related
    ) + "\n  ]" if related else "[]"

    json_ld_escaped = escape_backtick(json_ld)

    crumbs = [
        '{ label: "Home", href: "/" }',
        '{ label: "Questions", href: "/questions/" }',
    ]

    json_ld_const = f'\nconst _jsonLd = {json.dumps(json_ld, ensure_ascii=False)};' if json_ld else ''
    json_ld_prop = '\n  jsonLd={_jsonLd}' if json_ld else ''

    # All string props use {expr} to safely handle internal quotes
    out = f"""---
import QuestionLayout from '@layouts/QuestionLayout.astro';

const relatedLinks = {related_str};
const _body = {json.dumps(body, ensure_ascii=False)};{json_ld_const}
---
<QuestionLayout
  title={{{json.dumps(display_title, ensure_ascii=False)}}}
  description={{{json.dumps(description, ensure_ascii=False)}}}
  canonical={{{json.dumps(canonical, ensure_ascii=False)}}}
  category={{{json.dumps(category, ensure_ascii=False)}}}
  relatedLinks={{relatedLinks}}{json_ld_prop}
>
  <Fragment set:html={{_body}} />
</QuestionLayout>
"""
    return out


def convert_subpage(html_path: Path, rel_parts: list[str]):
    html = html_path.read_text(encoding="utf-8")
    title = get_tag_text(html, "title")
    description = get_description(html)
    canonical = get_canonical(html)
    json_ld = get_json_ld(html)

    # Detect breadcrumb section
    folder = rel_parts[0] if rel_parts else ""
    section_label = SECTION_LABELS.get(folder, folder.replace("-", " ").title())
    section_href = f"/{folder}/" if folder else "/"

    body = get_body_content(html)

    if folder:
        crumbs_code = '{[{ label: "Home", href: "/" }, { label: "' + section_label + '", href: "' + section_href + '" }]}'
    else:
        crumbs_code = '{[{ label: "Home", href: "/" }]}'

    json_ld_const = f'\nconst _jsonLd = {json.dumps(json_ld, ensure_ascii=False)};' if json_ld else ''
    json_ld_prop = '\n  jsonLd={_jsonLd}' if json_ld else ''

    out = f"""---
import SubpageLayout from '@layouts/SubpageLayout.astro';

const _body = {json.dumps(body, ensure_ascii=False)};{json_ld_const}
---
<SubpageLayout
  title={{{json.dumps(title, ensure_ascii=False)}}}
  description={{{json.dumps(description, ensure_ascii=False)}}}
  canonical={{{json.dumps(canonical, ensure_ascii=False)}}}{json_ld_prop}
  crumbs={crumbs_code}
>
  <Fragment set:html={{_body}} />
</SubpageLayout>
"""
    return out


import json


def process_file(html_path: Path):
    rel = html_path.relative_to(ROOT)
    parts = list(rel.parts)  # e.g. ['questions', 'what-is-traverse.html']

    if parts[-1] in SKIP:
        return

    # Determine output path
    stem = Path(parts[-1]).stem  # filename without .html
    folder_parts = parts[:-1]   # e.g. ['questions']

    out_dir = SRC_PAGES
    for p in folder_parts:
        out_dir = out_dir / p

    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{stem}.astro"

    if out_path.exists():
        # Don't overwrite bespoke files
        return

    folder = folder_parts[0] if folder_parts else ""
    html = html_path.read_text(encoding="utf-8")

    if folder == "questions":
        content = convert_question(html_path, folder_parts)
    else:
        content = convert_subpage(html_path, folder_parts)

    out_path.write_text(content, encoding="utf-8")
    print(f"  ✓ {rel} → src/pages/{'/'.join(folder_parts)}/{stem}.astro")


def main():
    # Collect all .html files (not in public/ or node_modules/)
    html_files = []
    for p in sorted(ROOT.rglob("*.html")):
        # Skip public, node_modules, dist, .git
        str_p = str(p.relative_to(ROOT))
        if any(str_p.startswith(x) for x in ["public/", "node_modules/", "dist/", ".git/"]):
            continue
        html_files.append(p)

    print(f"Converting {len(html_files)} HTML files...\n")
    for f in html_files:
        process_file(f)
    print(f"\nDone. Check src/pages/")


if __name__ == "__main__":
    main()
