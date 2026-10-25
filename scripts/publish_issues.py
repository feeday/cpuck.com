"""Publish owner-authored documentation Issues; store articles only in data; Git preserves revisions."""
from datetime import datetime, timezone, timedelta
import hashlib
import base64
import html
import json
import os
import re
from pathlib import Path
import subprocess
import urllib.request


def api(path):
    request = urllib.request.Request(
        "https://api.github.com" + path,
        headers={"Authorization": "Bearer " + os.environ["GH_TOKEN"],
                 "Accept": "application/vnd.github.full+json",
                 "X-GitHub-Api-Version": "2022-11-28"})
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)


def render(issue, canonical_url=None):
    script = Path(__file__).with_name("article.js").read_text(encoding="utf-8")
    css = Path(__file__).with_name("article.css").read_text(encoding="utf-8")
    script_hash = base64.b64encode(hashlib.sha256(script.encode()).digest()).decode()
    title = html.escape(issue["title"])
    canonical_tag = f'<link rel="canonical" href="{html.escape(canonical_url, quote=True)}">' if canonical_url else ""
    source = html.escape(issue["html_url"], quote=True)
    updated = datetime.fromisoformat(issue["updated_at"].replace("Z", "+00:00")).astimezone(timezone(timedelta(hours=8)))
    display_date = updated.strftime("%Y年%m月%d日 %H:%M")
    # body_html is rendered and sanitized by GitHub, never raw Issue HTML.
    body = issue.get("body_html")
    if body is None:
        raise ValueError("GitHub did not return rendered body_html")
    return f"""<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="icon" type="image/png" href="/favicon.png">
{canonical_tag}
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-{script_hash}'; img-src https: data:; media-src https:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>{title} · CPuck</title>
<style>{css}</style></head><body><main id="article-top">
<nav class="page-nav" aria-label="文章导航"><a class="home-link" href="/">← CPuck</a>
<div class="nav-actions"><a href="{source}">编辑原文</a><a href="/data/md/{issue['number']}.md">Markdown</a><button type="button" class="theme-toggle" aria-label="切换深色模式">深色</button></div></nav>
<header class="article-header"><p class="article-label">CPuck · 文章</p><h1 class="article-title">{title}</h1>
<div class="article-meta"><span>更新于 <time datetime="{html.escape(issue['updated_at'], quote=True)}">{display_date}</time>（北京时间）</span><span class="reading-time"></span></div></header>
<article>{body}</article>
<footer class="article-footer"><span>CPuck · 记录与分享</span><a href="/">返回资源导航 →</a></footer>
</main><script>{script}</script></body></html>
"""


def write(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(value, encoding="utf-8")


def article_path(issue):
    """An explicit permalink wins; ASCII English titles otherwise become slugs."""
    match = re.match(r"\s*<!--\s*permalink:\s*(.*?)\s*-->", issue.get("body") or "", re.I)
    if match:
        value = match.group(1).strip().lstrip("/")
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]*(?:\.html)?", value):
            raise ValueError(f"Issue #{issue['number']}: permalink must be a single root path")
        return "/" + value
    title = issue["title"].strip()
    if title.isascii() and re.search(r"[A-Za-z]", title):
        slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
        return "/" + slug + ".html"
    return f"/{issue['number']}.html"


def output_path(url):
    return url.lstrip("/") if url.endswith(".html") else url.lstrip("/") + "/index.html"


def alias_page(url, base=None):
    target = html.escape(url, quote=True)
    canonical = html.escape((base.rstrip("/") + url) if base else url, quote=True)
    return (f'<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">'
            f'<meta name="viewport" content="width=device-width,initial-scale=1">'
            f'<link rel="icon" type="image/png" href="/favicon.png">'
            f'<link rel="canonical" href="{canonical}">'
            f'<meta http-equiv="refresh" content="0;url={target}">'
            f'<title>文章跳转 | CPuck</title></head>'
            f'<body><main><a href="{target}">阅读文章</a> · <a href="/">返回首页</a></main></body></html>\n')


def site_base(root):
    root = Path(root)
    cname = (root / "CNAME").read_text(encoding="utf-8").strip() if (root / "CNAME").exists() else "cpuck.com"
    domain = re.sub(r"^https?://", "", cname).strip("/")
    if not domain or "/" in domain or any(ch.isspace() for ch in domain):
        raise ValueError("CNAME must contain a single domain name")
    return "https://" + domain


def page_metadata(root, route, plans, posts):
    """Resolve each public route to a useful title, description, and modification date."""
    root = Path(root)
    if route == "/sitemap.html":
        return ("网站地图 | CPuck", "CPuck 所有公开页面的标题、简介、更新时间与链接索引。", None, None)
    plan = next((item for item in plans.values() if item.get("url") == route), None)
    if plan:
        page = root / plan["file"]
    elif route == "/":
        page = root / "index.html"
    elif route.endswith("/"):
        page = root / route.lstrip("/") / "index.html"
    else:
        page = root / route.lstrip("/")
    source = page.read_text(encoding="utf-8") if page.is_file() else ""
    title_match = re.search(r"<title[^>]*>(.*?)</title>", source, re.I | re.S)
    title = html.unescape(re.sub(r"<[^>]+>", " ", title_match.group(1))).strip() if title_match else ""
    title = re.sub(r"\s+", " ", title).strip() or ("首页 | CPuck" if route == "/" else route.strip("/") or "CPuck")
    description_match = re.search(r'<meta\b(?=[^>]*\bname=["\']description["\'])(?=[^>]*\bcontent=["\']([^"\']*)["\'])[^>]*>', source, re.I)
    description = html.unescape(description_match.group(1)).strip() if description_match else ""
    post = next((item for item in posts if item.get("url") == route), None)
    if not description and post:
        description = re.sub(r"\s+", " ", html.unescape(post.get("desc", ""))).strip()
    if not description and source:
        visible = re.sub(r"<(script|style|svg|noscript)\b[^>]*>[\s\S]*?</\1>", " ", source, flags=re.I)
        body_match = re.search(r"<body\b[^>]*>([\s\S]*?)</body>", visible, re.I)
        visible = body_match.group(1) if body_match else visible
        visible = html.unescape(re.sub(r"<[^>]+>", " ", visible))
        visible = re.sub(r"\s+", " ", visible).strip()
        description = visible[:180].rstrip()
    if not description:
        description = f"{title}。CPuck 网站页面。"
    if len(description) > 240:
        description = description[:237].rstrip() + "..."
    lastmod = ""
    if post:
        timestamp = post.get("updated_at") or post.get("date") or ""
        if re.match(r"^\d{4}-\d{2}-\d{2}", timestamp):
            lastmod = timestamp[:10]
    if not lastmod and page.is_file():
        try:
            relative = page.relative_to(root).as_posix()
            result = subprocess.run(["git", "log", "-1", "--format=%cs", "--", relative],
                                    cwd=root, capture_output=True, text=True, check=False)
            candidate = result.stdout.strip()
            if re.fullmatch(r"\d{4}-\d{2}-\d{2}", candidate):
                lastmod = candidate
        except (OSError, ValueError):
            pass
    return title, description, lastmod or None, page if page.is_file() else None


def generate_sitemap(root, plans):
    """Build Google-compatible URLs plus CPuck metadata and a readable HTML sitemap."""
    root = Path(root)
    base = site_base(root)
    posts_path = root / "data/posts.json"
    posts = json.loads(posts_path.read_text(encoding="utf-8")) if posts_path.exists() else []
    urls = {"/", "/sitemap.html"}
    for page in root.glob("*.html"):
        if page.name.lower() not in {"index.html", "404.html"}:
            urls.add("/" + page.name)
    for page in root.glob("*/index.html"):
        if page.parent.name.lower() not in {"assets", "data", "scripts", "tests", ".github"}:
            urls.add("/" + page.parent.name + "/")
    for plan in plans.values():
        route = plan.get("url", "")
        if route.startswith("/") and not route.startswith("//"):
            urls.add(route)
    entries = []
    for route in sorted(urls):
        title, description, lastmod, _ = page_metadata(root, route, plans, posts)
        entries.append({"route": route, "title": title, "description": description, "lastmod": lastmod})
    xml = ['<?xml version="1.0" encoding="UTF-8"?>',
           '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
           '        xmlns:cpuck="https://cpuck.com/xml/sitemap/1.0">']
    for item in entries:
        safe_comment = re.sub(r"--+", "—", item["title"]).strip("- ")
        xml.append("  <!-- " + safe_comment + " -->")
        xml.append("  <url>")
        xml.append("    <loc>" + html.escape(base + item["route"], quote=False) + "</loc>")
        if item["lastmod"]:
            xml.append("    <lastmod>" + item["lastmod"] + "</lastmod>")
        xml.append("    <cpuck:title>" + html.escape(item["title"], quote=False) + "</cpuck:title>")
        xml.append("    <cpuck:description>" + html.escape(item["description"], quote=False) + "</cpuck:description>")
        xml.append("  </url>")
    xml.append("</urlset>")
    write(root / "sitemap.xml", "\n".join(xml) + "\n")
    cards = []
    for item in entries:
        cards.append(
            '<li><a class="page-title" href="' + html.escape(item["route"], quote=True) + '">' +
            html.escape(item["title"]) + '</a><p>' + html.escape(item["description"]) + '</p>' +
            '<div class="page-meta"><code>' + html.escape(item["route"]) + '</code>' +
            (('<span>更新：' + html.escape(item["lastmod"]) + '</span>') if item["lastmod"] else '') +
            '</div></li>')
    sitemap_html = '''<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="CPuck 所有公开页面的标题、简介、更新时间与链接索引。">
<link rel="icon" type="image/png" href="/favicon.png">
<link rel="canonical" href="''' + html.escape(base + "/sitemap.html", quote=True) + '''">
<title>网站地图 | CPuck</title>
<style>
:root{color-scheme:light dark}*{box-sizing:border-box}body{margin:0;background:#f5f7fb;color:#182230;font:16px/1.65 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:960px;margin:0 auto;padding:28px 18px 48px}.top{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
a{color:#1457b8}.home{display:inline-flex;padding:7px 12px;border:1px solid #d0d7e2;border-radius:9px;text-decoration:none;background:#fff}
h1{font-size:28px;margin:24px 0 4px}.intro{color:#5b6677;margin:0 0 22px}
ul{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,360px),1fr));gap:12px}
li{background:#fff;border:1px solid #e0e5ec;border-radius:12px;padding:16px;min-width:0}.page-title{font-weight:700;text-decoration:none}.page-title:hover{text-decoration:underline}
li p{color:#5b6677;margin:7px 0 12px;font-size:14px;overflow-wrap:anywhere}.page-meta{display:flex;gap:10px;flex-wrap:wrap;align-items:center;color:#7a8595;font-size:12px}.page-meta code{overflow-wrap:anywhere}
@media(prefers-color-scheme:dark){body{background:#0c1118;color:#e6edf3}.intro,li p{color:#9ba7b4}li{background:#131b26;border-color:#293443}.home{background:#17212e;color:#e6edf3;border-color:#334155}.page-meta{color:#9ba7b4}}
</style></head><body><main><div class="top"><strong>CPuck · 网站导航</strong><a class="home" href="/">← 返回首页</a></div>
<h1>网站地图</h1><p class="intro">页面标题、简介、规范地址与更新时间。XML 版本：<a href="/sitemap.xml">sitemap.xml</a></p>
<ul>''' + "\n".join(cards) + '''</ul></main></body></html>
'''
    write(root / "sitemap.html", sitemap_html)
    write(root / "robots.txt", "User-agent: *\nAllow: /\n\nSitemap: " + base + "/sitemap.xml\n")



def validate_routes(root, plans):
    claimed = {}
    for key, plan in plans.items():
        for route in [plan["url"], *plan.get("aliases", [])]:
            if not re.fullmatch(r"/(?:blog/(?:posts/)?)?[A-Za-z0-9][A-Za-z0-9_-]*(?:\.html)?", route):
                raise ValueError(f"Unsafe article route: {route}")
            file = output_path(route)
            top = file.split("/")[0].split(".")[0].lower()
            if top in {"data", "assets", "scripts", "tests", "gpu", "index", "404", "cname", "readme", "favicon", "sitemap", "robots"}:
                raise ValueError(f"Reserved site route: {route}")
            if file in claimed and claimed[file] != key:
                raise ValueError(f"Duplicate article route: {route}")
            if (Path(root) / file).exists():
                raise ValueError(f"Article route would overwrite site file: {route}")
            claimed[file] = key


def publish(root, issues, owner):
    root = Path(root)
    index = root / "data/posts.json"
    existing = json.loads(index.read_text(encoding="utf-8")) if index.exists() else []
    # Preserve manually maintained entries, rebuild only our Issue entries.
    posts = [p for p in existing if p.get("source") != "github-issue"]
    eligible = [i for i in issues if not i.get("pull_request")
                and i["user"]["login"].lower() == owner.lower()
                and "documentation" in {label["name"] for label in i.get("labels", [])}]
    manifest = root / "data/article-routes.json"
    plans = json.loads(manifest.read_text(encoding="utf-8")) if manifest.exists() else {}
    for issue in eligible:
        number = int(issue["number"])
        url = article_path(issue)
        old = plans.get(str(number), {})
        aliases = set(old.get("aliases", [])) | {f"/{number}.html", f"/{number}",
                    f"/blog/{number}.html", f"/blog/posts/issue-{number}.html"}
        if old.get("url"):
            aliases.add(old["url"])
        plans[str(number)] = {"url": url, "aliases": sorted(set(aliases) - {url}),
                              "file": f"data/html/{number}.html", "markdown": f"data/md/{number}.md"}
    validate_routes(root, plans)
    for issue in eligible:
        labels = {label["name"] for label in issue.get("labels", [])}
        if (issue.get("pull_request") or issue["user"]["login"].lower() != owner.lower()
                or "documentation" not in labels):
            continue
        number = int(issue["number"])
        issue = {**issue, "number": number}
        md = "# " + issue["title"] + "\n\n" + (issue.get("body") or "") + "\n"
        plan = plans[str(number)]
        url, aliases = plan["url"], plan["aliases"]
        write(root / plan["file"], render(issue, site_base(root) + url))
        write(root / plan["markdown"], md)
        posts.append({
            "source": "github-issue", "issue": number, "isArticle": True, "cat": "log",
            "title": issue["title"], "desc": (issue.get("body_text") or issue.get("body") or "")[:180],
            "content": issue.get("body_text") or issue.get("body") or "",
            "tag": sorted(labels), "date": issue["created_at"][:10],
            "updated_at": issue["updated_at"], "url": url, "aliases": sorted(set(aliases) - {url}),
            "markdown": f"/data/md/{number}.md", "issue_url": issue["html_url"]})
    posts.sort(key=lambda p: p.get("updated_at", p.get("date", "")), reverse=True)
    for path in ["data/posts.json", "data/search.json"]:
        write(root / path, json.dumps(posts, ensure_ascii=False, indent=2) + "\n")
    write(manifest, json.dumps(plans, ensure_ascii=False, indent=2) + "\n")
    generate_sitemap(root, plans)
    return posts


def main():
    repo = os.environ["GITHUB_REPOSITORY"]
    issues = []
    page = 1
    while True:
        batch = api(f"/repos/{repo}/issues?state=all&per_page=100&page={page}")
        issues.extend(batch)
        if len(batch) < 100:
            break
        page += 1
    publish(".", issues, repo.split("/")[0])


if __name__ == "__main__":
    main()
