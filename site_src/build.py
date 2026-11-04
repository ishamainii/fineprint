# build.py: assembles site/ from site_src/ (python site_src/build.py)
# each page fragment in pages/ starts with comment lines:
#   <!-- title: ... -->  <!-- dek: ... -->  and optionally  <!-- stamp: ... -->
import re
import shutil
from pathlib import Path

SRC = Path(__file__).parent
OUT = SRC.parent / "site"
# slug, tab label, case number
PAGES = [("index", "Case board", ""), ("arrival", "The Confessions", "01"), ("vocabulary", "The Wiretap", "02"),
         ("hedging", "The Interrogation", "03"), ("readability", "The Paper Trail", "04"), ("placement", "Where It's Buried", "05"),
         ("churn", "The Stakeout", "06"), ("templates", "The Accomplices", "07"), ("model", "The Polygraph", "08"),
         ("methods", "Case Notes", "09")]

HEAD = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{title}</title>
<meta name="description" content="{dek}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Caveat:wght@500&family=Courier+Prime:ital,wght@0,400;0,700;1,400&family=Special+Elite&display=swap">
<link rel="stylesheet" href="css/site.css">
</head>
<body>
<nav class="tabs" aria-label="Case files">{nav}</nav>
"""
FOOT = """{pager}
<script src="js/noir.js"></script>
<script src="js/charts.js"></script>
{script}
</body>
</html>
"""

shutil.rmtree(OUT, ignore_errors=True)
shutil.copytree(SRC / "css", OUT / "css")
shutil.copytree(SRC / "js", OUT / "js")
shutil.copytree(SRC.parent / "build" / "data", OUT / "data")

nav = '<a class="home" href="index.html">The Fine Print</a>' + "".join(
    f'<a class="tab" href="{s}.html"{{cur_{s}}}><b>{n}</b>{t}</a>' for s, t, n in PAGES[1:])

for i, (slug, tab, num) in enumerate(PAGES):
    raw = (SRC / "pages" / f"{slug}.html").read_text(encoding="utf-8")
    meta = dict(re.findall(r"<!-- (\w+): (.*?) -->", raw))
    body = re.sub(r"<!-- \w+: .*? -->\n?", "", raw)
    this_nav = nav
    for s, _, _ in PAGES[1:]:
        this_nav = this_nav.replace(f"{{cur_{s}}}", ' aria-current="page"' if s == slug else "")
    prev = PAGES[i - 1] if i > 0 else None
    nxt = PAGES[i + 1] if i + 1 < len(PAGES) else None
    pager = '<nav class="pager" aria-label="Previous and next case">' + \
        (f'<a href="{prev[0]}.html"><small>previous file</small>{prev[1]}</a>' if prev else "<span></span>") + \
        (f'<a href="{nxt[0]}.html" style="text-align:right"><small>next file</small>{nxt[1]}</a>' if nxt else "<span></span>") + "</nav>"
    script = f'<script src="js/{slug}.js"></script>' if (SRC / "js" / f"{slug}.js").exists() else ""
    if slug == "index":
        main = body                        # the case board lays itself out
    else:
        stamp = f'<span class="stamp big headstamp" data-slam>{meta["stamp"]}</span>' if "stamp" in meta else ""
        main = (f'<main class="file">{stamp}<div class="casehead"><span>CASE FILE {num}</span><span>THE FINE PRINT</span><span>FILED BY I. MAINI, NOV 2026</span></div>'
                f'<h1 data-type>{meta["title"]}</h1><p class="dek">{meta["dek"]}</p>{body}</main>')
    html = HEAD.format(title=f'{meta["title"]} | The Fine Print' if slug != "index" else meta["title"],
                       dek=meta["dek"].replace('"', "&quot;"), nav=this_nav) + main + FOOT.format(pager=pager, script=script)
    (OUT / f"{slug}.html").write_text(html, encoding="utf-8")
    print("built", slug)
