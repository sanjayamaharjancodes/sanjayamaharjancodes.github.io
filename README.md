# Sanjaya Maharjan — Portfolio

Live at <https://sanjayamaharjancodes.github.io/>. Static site, no build step, no frameworks —
GitHub Pages serves the files as-is.

## Concept — "Survey"

A live topographic survey. The hero is a WebGL contour map (fragment shader, domain-warped value
noise) with a cursor survey lens and a live elevation readout; the career is drawn as an ascent from
Kathmandu (1,400 m) in a pinned sideways-scrolling section; the stack is shown as geological strata.
Night (umber) and Day (paper map) themes, toggled with a View-Transition wipe.

| File | What it holds |
| --- | --- |
| `index.html` | All content (roles, projects, credentials, contact). Edit copy here. |
| `styles.css` | Tokens for both themes at the top (`:root` / `[data-theme="day"]`), then sections in page order. |
| `script.js` | Terrain shader + its CPU mirror, hero, ascent, work preview, filters, strata, nav/theme. Each module fails soft. |
| `assets/` | `cv.pdf` (phone number removed), `portrait.jpg/.webp`, `og.jpg` social card. |
| `_tools/verify.py` | Verification probe (not served — Jekyll skips `_` folders). |
| `_tools/build_cv.py` | Rebuilds `assets/cv.pdf` from the same facts the site states — run it after editing roles or AI work. |

Adding a role: add an `<li class="camp" data-start="YYYY.f">` to the ascent list in chronological
order — the ridge, altitude and HUD are computed from `data-start`.

## Verify before pushing

```bash
python _tools/verify.py                  # privacy checks + desktop/phone journeys, exits non-zero on failure
python _tools/verify.py --hq --shots out # same, plus full-quality screenshots into ./out
```

Needs Python with `playwright` (Chromium installed) and `pymupdf`. It checks: no phone numbers in the
page or the CV, only the current email, WebGL + fonts load, no console errors, no horizontal overflow,
a full scroll journey reaches the contact section with every reveal fired, filters, copy button,
theme toggle and the phone menu.

## Previous designs

Kept locally in `_alt-design-*` folders (untracked, not served).
