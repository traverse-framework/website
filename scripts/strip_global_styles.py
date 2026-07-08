#!/usr/bin/env python3
"""
Strip CSS rules for classes now defined globally in components.css
from page-level <style is:global slot="head"> blocks.
"""
import re
from pathlib import Path

ROOT = Path(__file__).parent.parent
SRC_PAGES = ROOT / "src" / "pages"

# Class name prefixes now defined in components.css (subpage section)
GLOBAL_PREFIXES = (
    ".page-hero",
    ".two-col",
    ".section-title-sm",
    ".section-lead",
    ".problem-list",
    ".problem-item",
    ".problem-icon",
    ".problem-text",
    ".benefit-list",
    ".benefit-item",
    ".benefit-icon",
    ".benefit-body",
    ".benefit-title",
    ".benefit-desc",
    ".use-case-grid",
    ".use-case-card",
    ".use-case-num",
    ".use-case-title",
    ".use-case-desc",
    ".stat-row",
    ".stat-card",
    ".stat-value",
    ".stat-label",
    # Already handled by Breadcrumb.astro scoped styles
    ".breadcrumb",
    ".breadcrumb-sep",
    # Already in SubpageLayout padding
    "body { padding-top: var(--nav-h)",
)


def strip_rule(css: str, prefix: str) -> str:
    """Remove all CSS rules/declarations that start with `prefix`."""
    # Match selector { ... } blocks — greedy within balanced braces
    pattern = re.compile(
        r'\s*' + re.escape(prefix) + r'[^{]*\{[^}]*\}',
        re.DOTALL
    )
    return pattern.sub('', css)


def strip_single_line(css: str, prefix: str) -> str:
    """Remove single-line declarations starting with prefix (no braces)."""
    pattern = re.compile(r'\n[ \t]*' + re.escape(prefix) + r'[^\n]*', re.DOTALL)
    return pattern.sub('', css)


def clean_style_block(css: str) -> str:
    for p in GLOBAL_PREFIXES:
        css = strip_rule(css, p)
    # Remove orphaned @media blocks that are now empty or only contain whitespace
    css = re.sub(r'@media[^{]+\{\s*\}', '', css)
    return css.strip()


def process_file(path: Path):
    content = path.read_text(encoding="utf-8")

    def replace_style(m):
        attrs = m.group(1)
        original = m.group(2)
        cleaned = clean_style_block(original)
        if cleaned == original.strip():
            return m.group(0)  # no change
        if not cleaned:
            return ''  # remove empty style block
        return f'<style{attrs}>{cleaned}</style>'

    new_content = re.sub(
        r'<style([^>]*)>(.*?)</style>',
        replace_style,
        content,
        flags=re.DOTALL
    )

    if new_content != content:
        path.write_text(new_content, encoding="utf-8")
        print(f"  ✓ {path.relative_to(ROOT)}")


def main():
    pages = list(SRC_PAGES.rglob("*.astro"))
    print(f"Scanning {len(pages)} pages...\n")
    for p in sorted(pages):
        process_file(p)
    print("\nDone.")


if __name__ == "__main__":
    main()
