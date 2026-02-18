# Fuzz Fixtures

These are small, deterministic strings used in invariant and fuzz-style tests. Each file targets a specific risk area.

- `combining-heavy.txt` — base letters with stacked combining marks.
- `bidi-controls.txt` — bidi controls and isolates around text.
- `lone-surrogates.txt` — isolated high/low surrogates mixed with ASCII.
- `mixed-scripts.txt` — Latin/Greek/Cyrillic mixing for confusables and script detection.
- `winnowing-repeat.txt` — highly repetitive tokens for density control.
- `tibetan-collation.txt` — Tibetan-style non-starter patterns that exercise UCA discontiguous matching.
- `emoji-zwj.txt` — emoji + ZWJ/ZWNJ + variation selectors.
