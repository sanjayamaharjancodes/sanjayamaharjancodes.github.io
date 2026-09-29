"""Portfolio verification probe.

Cheapest gates first: static privacy checks, then a headless journey through the
page at desktop and phone sizes that must reach the contact section, then
screenshots for human/visual review.

    python _tools/verify.py [--shots DIR]

Exits non-zero on any failure and prints a state dump for the step that failed.
"""
import argparse
import functools
import http.server
import json
import pathlib
import re
import socketserver
import sys
import threading
import time

ROOT = pathlib.Path(__file__).resolve().parents[1]
EMAIL = "smaharjan.codes@gmail.com"
EMAILS = re.compile(r"[\w.+-]+@[A-Za-z][\w-]*(?:\.[A-Za-z]{2,})+")
PHONE = re.compile(r"(\+?\d[\d\s().-]{8,}\d)")
FAILS = []
sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def check(ok, msg, dump=None):
    print(("  PASS " if ok else "  FAIL ") + msg)
    if not ok:
        FAILS.append(msg)
        if dump is not None:
            print("       state:", json.dumps(dump, default=str)[:1500])
    return ok


def phone_like(text):
    hits = []
    for m in PHONE.finditer(text):
        digits = re.sub(r"\D", "", m.group(1))
        if 10 <= len(digits) <= 13 and not re.fullmatch(r"(19|20)\d{2}(19|20)\d{2}.*", digits):
            hits.append(m.group(1))
    return hits


def static_checks():
    print("static")
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    js = (ROOT / "script.js").read_text(encoding="utf-8")
    check("tel:" not in html.lower(), "no tel: links in index.html")
    check(not phone_like(re.sub(r"<[^>]+>", " ", html)), "no phone-number-like text in index.html",
          phone_like(re.sub(r"<[^>]+>", " ", html)))
    found = set(EMAILS.findall(html)) | set(EMAILS.findall(js))
    check(found == {EMAIL}, f"the only email address on the site is {EMAIL}", sorted(found))
    check(html.count(EMAIL) >= 3, f"new email {EMAIL} is used for contact links")
    for f in ["assets/favicon.svg", "assets/favicon-32.png", "assets/apple-touch-icon.png"]:
        check(f in html and (ROOT / f).exists(), f"{f} exists and is linked")
    try:
        from PIL import Image
        im = Image.open(ROOT / "assets" / "apple-touch-icon.png").convert("RGB")
        dark = sum(1 for px in im.getdata() if sum(px) < 150) / (im.width * im.height)
        check(dark > 0.4, f"touch icon actually rendered (dark tile {dark:.0%}), not a broken-image placeholder")
    except ImportError:
        pass
    try:
        import pymupdf
        doc = pymupdf.open(ROOT / "assets" / "cv.pdf")
        txt = "".join(p.get_text() for p in doc)
        check(not re.search(r"\d{3}[-. )]\d{3}[-. ]\d{4}", txt), "cv.pdf contains no phone number")
        check(set(EMAILS.findall(txt)) == {EMAIL}, "cv.pdf carries the new email only", sorted(set(EMAILS.findall(txt))))
        check("AI & Cloud Architect" in txt and "Lead Software Engineer | Cloud-Native" not in txt, "cv.pdf title matches the site (AI & Cloud Architect)")
    except ImportError:
        check(False, "pymupdf missing - cannot inspect cv.pdf")


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def serve():
    handler = functools.partial(Quiet, directory=str(ROOT))
    srv = socketserver.TCPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, f"http://127.0.0.1:{srv.server_address[1]}/"


STATE_JS = """() => ({
  sm: window.__sm, theme: document.documentElement.dataset.theme,
  ready: document.documentElement.classList.contains('ready'),
  scrollY: scrollY, docH: document.documentElement.scrollHeight, vw: innerWidth,
  sw: document.documentElement.scrollWidth,
  unrevealed: [...document.querySelectorAll('[data-reveal]:not(.is-in)')].map(e => e.className || e.tagName).slice(0, 8),
})"""


def journey(page, url, label, shots, desktop):
    print(f"journey: {label}")
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.goto(url, wait_until="networkidle")
    page.wait_for_function("() => document.documentElement.classList.contains('ready')", timeout=8000)
    if shots and desktop:
        page.wait_for_timeout(650)  # mid-intro: terrain emerging, letters inflating
        page.screenshot(path=str(shots / f"{label}-00-intro.png"))
    page.wait_for_timeout(3200)  # intro
    st = page.evaluate(STATE_JS)
    check(st["sm"]["webgl"], "WebGL terrain initialised", st)
    check(not st["sm"]["errors"], "no module errors", st["sm"]["errors"])
    check(st["sm"]["frames"] > 20, f"render loop running ({st['sm']['frames']} frames)")
    fonts = page.evaluate("""() => ['800 40px Anybody','400 16px "Instrument Sans"','400 12px "Martian Mono"']
        .map(f => document.fonts.check(f))""")
    check(all(fonts), "web fonts loaded (Anybody, Instrument Sans, Martian Mono)", fonts)
    check(st["sw"] <= st["vw"], f"no horizontal overflow ({st['sw']} <= {st['vw']})", st)
    name = page.evaluate("""() => { const h = document.querySelector('[data-name]').getBoundingClientRect();
        return [...document.querySelectorAll('.name-line')].map(l => l.lastElementChild.getBoundingClientRect().right <= h.right + 1 && l.firstElementChild.getBoundingClientRect().left >= -1) }""")
    check(all(name), "hero name fits inside the viewport", name)
    if desktop:
        name_box = page.evaluate("() => { const r = document.querySelector('[data-name]').getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom] }")
        page.mouse.move(900, 220)  # open terrain above the name
        page.wait_for_timeout(700)
        ro = page.evaluate("() => [document.querySelector('[data-readout]').classList.contains('is-on'), document.querySelector('[data-ro-elev]').textContent]")
        check(ro[0] and ro[1] != "0", f"cursor elevation readout live over terrain ({ro[1]} m)", ro)
        page.mouse.move(900, (name_box[1] + name_box[3]) / 2, steps=4)
        page.wait_for_timeout(500)
        on_name = page.evaluate("() => document.querySelector('[data-readout]').classList.contains('is-on')")
        check(not on_name, "readout steps aside while the cursor is over the name")
        page.mouse.move(900, 220, steps=4)
        page.wait_for_timeout(700)
    if shots:
        page.screenshot(path=str(shots / f"{label}-01-hero.png"))

    mode = page.evaluate("() => window.__sm.ascentMode")
    check(mode == ("horizontal" if desktop else "vertical"), f"ascent layout = {mode}")

    # scroll the full page in viewport steps; stall detection on each step
    vh = page.evaluate("innerHeight")
    y, shot_marks, last_y, stalls = 0, {}, -1, 0
    while True:
        page.evaluate(f"window.scrollTo({{top: {y}, behavior: 'instant'}})")
        page.wait_for_timeout(260)
        cur = page.evaluate("scrollY")
        if cur == last_y:
            stalls += 1
            if stalls >= 2:
                break
        last_y = cur
        if shots:
            for sel, tag in [("#about", "02-notes"), ("#work", "04-work"), ("#stack", "05-stack"), (".marks", "06-marks")]:
                if tag not in shot_marks and page.evaluate(f"(() => {{ const r = document.querySelector('{sel}').getBoundingClientRect(); return r.top < innerHeight*0.25 && r.top > -innerHeight*0.2 }})()"):
                    page.wait_for_timeout(1300)
                    page.screenshot(path=str(shots / f"{label}-{tag}.png"))
                    shot_marks[tag] = True
            if desktop and "03-ascent" not in shot_marks:
                prog = page.evaluate("(() => { const p = document.querySelector('[data-ascent-pin]').getBoundingClientRect(); return -p.top / (p.height - innerHeight) })()")
                if 0.45 < prog < 0.75:
                    page.wait_for_timeout(900)
                    page.screenshot(path=str(shots / f"{label}-03-ascent.png"))
                    shot_marks["03-ascent"] = True
        y += int(vh * 0.55)
        if y > 60000:
            break
    page.wait_for_timeout(1400)
    st = page.evaluate(STATE_JS)
    at_bottom = st["scrollY"] + vh >= st["docH"] - 4
    check(at_bottom, "journey reached the end of the page", st)
    check(not st["unrevealed"], "every reveal element became visible", st["unrevealed"])
    reached = page.evaluate("() => [...document.querySelectorAll('.camp')].every(c => c.classList.contains('is-reached'))")
    check(reached, "all nine camps reached on the ascent")
    contact_vis = page.evaluate("() => { const r = document.querySelector('#contact-title').getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0 && getComputedStyle(document.querySelector('#contact-title')).opacity === '1' }")
    check(contact_vis, "contact headline visible at the end")
    if shots:
        page.evaluate("document.querySelector('.strata').scrollIntoView()")
        page.wait_for_timeout(1200)
        page.screenshot(path=str(shots / f"{label}-05b-strata.png"))
        page.evaluate("document.querySelector('#contact').scrollIntoView()")
        page.wait_for_timeout(1500)
        page.screenshot(path=str(shots / f"{label}-07-contact.png"))

    # ownership tree grows when on screen
    page.evaluate("document.querySelector('[data-tree]').scrollIntoView({block:'center'})")
    page.wait_for_timeout(600)
    t1 = page.evaluate("() => document.querySelectorAll('[data-tree] .is-found').length")
    page.wait_for_timeout(2400)
    t2 = page.evaluate("() => document.querySelectorAll('[data-tree] .is-found').length")
    check(t2 > t1, f"ownership tree grows node by node ({t1} -> {t2} found)")
    steps = []
    for _ in range(14):
        steps.append(page.evaluate("() => window.__sm.treeStep"))
        page.wait_for_timeout(300)
    back = [(a, b) for a, b in zip(steps, steps[1:]) if b < a and not (a == 4 and b == 0)]
    check(not back, f"tree step log only moves forward ({steps})")
    if shots:
        page.wait_for_timeout(3600)
        page.screenshot(path=str(shots / f"{label}-02c-tree.png"))

    # agent diagram replays its cycle when on screen
    page.evaluate("document.querySelector('[data-agents]').scrollIntoView({block:'center'})")
    page.wait_for_timeout(700)
    s1 = page.evaluate("() => window.__sm.agentsStep")
    page.wait_for_timeout(2600)
    s2 = page.evaluate("() => window.__sm.agentsStep")
    check(s1 is not None and s2 is not None and s1 != s2, f"agent diagram advances through the governance cycle ({s1} -> {s2})")
    if shots:
        page.wait_for_timeout(1400)
        page.screenshot(path=str(shots / f"{label}-02b-agents.png"))
        page.evaluate("document.querySelector('#ai').scrollIntoView()")
        page.wait_for_timeout(1500)
        page.screenshot(path=str(shots / f"{label}-02a-ai.png"))

    # field reports: dialog on the sideways ascent, inline on phones
    if desktop:
        page.evaluate("window.scrollTo({top: document.querySelector('[data-ascent-pin]').getBoundingClientRect().top + scrollY + 1100, behavior: 'instant'})")
        page.wait_for_timeout(1000)
        clipped = page.evaluate("() => [...document.querySelectorAll('.camp article')].filter(a => { const r = a.getBoundingClientRect(); return r.bottom > innerHeight - 40 || r.top < 60 }).map(a => a.querySelector('h3').textContent)")
        check(not clipped, "none of the nine ascent cards runs off the top or bottom of the pinned view", clipped)
        vis = page.evaluate("() => [...document.querySelectorAll('.camp-more summary')].findIndex(s => { const r = s.getBoundingClientRect(); return r.left > 0 && r.right < innerWidth && r.top > 0 && r.bottom < innerHeight })")
        if vis >= 0:
            page.locator('.camp-more summary').nth(vis).click()
            page.wait_for_timeout(600)
            rep = page.evaluate("() => [document.querySelector('[data-report]').open, document.querySelectorAll('[data-report-list] li').length]")
            check(rep[0] and rep[1] >= 2, f"field report opens as a dialog ({rep[1]} items)", rep)
            if shots:
                page.screenshot(path=str(shots / f"{label}-03b-report.png"))
            page.keyboard.press("Escape")
            page.wait_for_timeout(300)
            check(not page.evaluate("document.querySelector('[data-report]').open"), "Escape closes the field report")
        else:
            check(False, "a field report button is reachable on the ascent")
    else:
        page.evaluate("document.querySelectorAll('.camp-more summary')[4].scrollIntoView({block:'center'})")
        page.locator('.camp-more summary').nth(4).click()
        page.wait_for_timeout(400)
        n_open = page.evaluate("() => document.querySelectorAll('.camp-more[open] li').length")
        check(n_open >= 3, f"field report expands inline on phones ({n_open} items)")

    # anchors resolve
    missing = page.evaluate("() => [...document.querySelectorAll('a[href^=\"#\"]')].map(a => a.getAttribute('href')).filter(h => h.length > 1 && !document.querySelector(h))")
    check(not missing, "all in-page anchors have targets", missing)

    # filters
    page.evaluate("document.querySelector('.offmap').scrollIntoView()")
    page.wait_for_timeout(500)
    page.click("[data-filter='public']")
    page.wait_for_timeout(800)
    n = page.evaluate("() => document.querySelectorAll('.om-card:not(.is-hidden)').length")
    check(n == 2, f"'Public sector' filter shows 2 projects (got {n})")
    page.click("[data-filter='all']")
    page.wait_for_timeout(400)
    n = page.evaluate("() => document.querySelectorAll('.om-card:not(.is-hidden)').length")
    check(n == 13, f"'All' filter restores 13 projects (got {n})")

    if desktop:
        page.evaluate("document.querySelector('.work-list').scrollIntoView({block:'center'})")
        page.wait_for_timeout(600)
        box = page.locator(".work-row").nth(2).bounding_box()
        page.mouse.move(box["x"] + box["width"] * 0.35, box["y"] + box["height"] / 2, steps=6)
        page.wait_for_timeout(1100)
        on = page.evaluate("() => document.querySelector('[data-preview]').classList.contains('is-on')")
        check(on, "hovering a project shows its survey tile")
        tex = page.evaluate("() => window.__sm.previewTex")
        check(tex == "linotype.com", f"tile surveys the hovered site's real homepage ({tex})")
        if shots:
            page.screenshot(path=str(shots / f"{label}-04b-work-hover.png"))
        page.mouse.move(5, 5)

    # copy
    page.evaluate("document.querySelector('[data-copy]').scrollIntoView({block:'center'})")
    page.click("[data-copy]")
    page.wait_for_timeout(300)
    lab = page.evaluate("() => document.querySelector('[data-copy-label]').textContent")
    check(lab.startswith("Copied"), f"copy button confirms ({lab})")

    # theme
    page.evaluate("window.scrollTo(0,0)")
    page.wait_for_timeout(900)
    page.click("[data-theme-toggle]")
    page.wait_for_timeout(1400)
    theme = page.evaluate("() => [document.documentElement.dataset.theme, localStorage.getItem('sm-theme'), getComputedStyle(document.body).backgroundColor]")
    check(theme[0] == "day" and theme[1] == "day", f"theme toggles to day and persists {theme}")
    if shots:
        page.wait_for_timeout(600)
        page.screenshot(path=str(shots / f"{label}-08-day-hero.png"))
        page.evaluate("document.querySelector('.strata').scrollIntoView()")
        page.wait_for_timeout(1800)
        page.screenshot(path=str(shots / f"{label}-09-day-strata.png"))
        page.evaluate("window.scrollTo(0,0)")
        page.wait_for_timeout(500)
    page.click("[data-theme-toggle]")
    page.wait_for_timeout(1200)
    check(page.evaluate("document.documentElement.dataset.theme") == "night", "theme toggles back to night")

    if not desktop:
        page.click("[data-menu-btn]")
        page.wait_for_timeout(900)
        vis = page.evaluate("() => { const m = document.querySelector('[data-menu]'); return !m.hidden && m.classList.contains('is-open') }")
        check(vis, "mobile menu opens")
        if shots:
            page.screenshot(path=str(shots / f"{label}-10-menu.png"))
        page.click("[data-menu] a[href='#work']")
        page.wait_for_timeout(1400)
        closed = page.evaluate("() => document.querySelector('[data-menu]').hidden")
        check(closed, "mobile menu closes after choosing a link")

    real = [e for e in errors if "favicon" not in e]
    check(not real, "no console / page errors", real)


def fallbacks(browser, url):
    print("fallbacks")
    ctx = browser.new_context(viewport={"width": 1440, "height": 900}, java_script_enabled=False)
    page = ctx.new_page()
    page.goto(url, wait_until="networkidle")
    hidden = page.evaluate("""() => [...document.querySelectorAll('h1, h2, .camp, .work-row, .om-card, .stratum, .mark, .contact-title, .hero-sub')]
        .filter(e => { const s = getComputedStyle(e); return s.opacity === '0' || s.visibility === 'hidden' || s.display === 'none' }).length""")
    check(hidden == 0, f"no-JS: all content visible ({hidden} hidden)")
    ctx.close()
    ctx = browser.new_context(viewport={"width": 1440, "height": 900}, reduced_motion="reduce")
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(url, wait_until="networkidle")
    page.wait_for_timeout(1500)
    st = page.evaluate("""() => ({ mode: window.__sm.ascentMode, errs: window.__sm.errors,
        dim: [...document.querySelectorAll('[data-reveal], .name .ch, .statement')].filter(e => getComputedStyle(e).opacity !== '1').length })""")
    check(st["mode"] == "vertical" and not st["errs"] and st["dim"] == 0 and not errors,
          "reduced motion: static layout, everything visible, no errors", st)
    ctx.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--shots", default="")
    ap.add_argument("--only", default="")
    ap.add_argument("--hq", action="store_true", help="lock full render quality (for review screenshots)")
    ap.add_argument("--url", default="", help="run the journeys against a deployed URL instead of a local server")
    args = ap.parse_args()
    shots = pathlib.Path(args.shots) if args.shots else None
    if shots:
        shots.mkdir(parents=True, exist_ok=True)
    static_checks()
    from playwright.sync_api import sync_playwright
    srv, url = serve()
    if args.url:
        url = args.url if args.url.endswith("/") else args.url + "/"
    try:
        with sync_playwright() as p:
            gpu = ["--headless=new", "--use-angle=d3d11", "--enable-gpu"] if sys.platform == "win32" else ["--use-angle=swiftshader"]
            browser = p.chromium.launch(args=["--enable-webgl", "--ignore-gpu-blocklist"] + gpu)
            configs = [("desktop", dict(viewport={"width": 1440, "height": 900}), True),
                       ("mobile", dict(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True), False)]
            fallbacks(browser, url)
            for label, opts, desktop in configs:
                if args.only and args.only != label:
                    continue
                ctx = browser.new_context(**opts)
                ctx.grant_permissions(["clipboard-read", "clipboard-write"], origin=url.rstrip("/"))
                page = ctx.new_page()
                t0 = time.time()
                try:
                    journey(page, url + ("?hq" if args.hq else ""), label, shots, desktop)
                except Exception as e:  # stall / timeout: dump and fail fast
                    try:
                        st = page.evaluate(STATE_JS)
                    except Exception:
                        st = None
                    check(False, f"{label} journey crashed: {e}", st)
                print(f"  ({time.time() - t0:.1f}s)")
                ctx.close()
            browser.close()
    finally:
        srv.shutdown()
    print("\nRESULT:", "FAIL (" + str(len(FAILS)) + ")" if FAILS else "ALL PASS")
    for f in FAILS:
        print("  -", f)
    sys.exit(1 if FAILS else 0)


if __name__ == "__main__":
    main()
