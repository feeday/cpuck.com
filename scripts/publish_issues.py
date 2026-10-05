"""Publish owner-authored documentation Issues; store articles only in data; Git preserves revisions."""
from datetime import datetime, timezone, timedelta
import hashlib
import base64
import html
import json
import os
import re
from pathlib import Path
import urllib.request


def api(path):
    request = urllib.request.Request(
        "https://api.github.com" + path,
        headers={"Authorization": "Bearer " + os.environ["GH_TOKEN"],
                 "Accept": "application/vnd.github.full+json",
                 "X-GitHub-Api-Version": "2022-11-28"})
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)


def render(issue):
    script = Path(__file__).with_name("article.js").read_text(encoding="utf-8")
    css = Path(__file__).with_name("article.css").read_text(encoding="utf-8")
    script_hash = base64.b64encode(hashlib.sha256(script.encode()).digest()).decode()
    title = html.escape(issue["title"])
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


def alias_page(url):
    target = html.escape(url, quote=True)
    return (f'<!doctype html><html><head><meta charset="utf-8">'
            f'<meta http-equiv="refresh" content="0;url={target}">'
            f'<link rel="canonical" href="{target}"><title>文章跳转</title></head>'
            f'<body><a href="{target}">阅读文章</a></body></html>\n')


def validate_routes(root, plans):
    claimed = {}
    for key, plan in plans.items():
        for route in [plan["url"], *plan.get("aliases", [])]:
            if not re.fullmatch(r"/(?:blog/(?:posts/)?)?[A-Za-z0-9][A-Za-z0-9_-]*(?:\.html)?", route):
                raise ValueError(f"Unsafe article route: {route}")
            file = output_path(route)
            top = file.split("/")[0].split(".")[0].lower()
            if top in {"data", "assets", "scripts", "tests", "gpu", "index", "404", "cname", "readme", "favicon"}:
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
        write(root / plan["file"], render(issue))
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
