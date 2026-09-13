"""Publish owner-authored documentation Issues; keep immutable MD/HTML revisions."""
import hashlib
import html
import json
import os
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
    title = html.escape(issue["title"])
    source = html.escape(issue["html_url"], quote=True)
    # body_html is rendered and sanitized by GitHub, never raw Issue HTML.
    body = issue.get("body_html")
    if body is None:
        raise ValueError("GitHub did not return rendered body_html")
    return f"""<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; media-src https:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>{title} · CPuck</title>
<style>
body{{margin:0;background:#020617;color:#f8fafc;font:16px/1.8 system-ui,sans-serif}}
main{{max-width:900px;margin:32px auto;padding:24px;border:1px solid #334155;border-radius:16px;background:#0f172a;overflow-wrap:anywhere}}
a{{color:#38bdf8}} img,video{{max-width:100%;height:auto}} pre{{overflow:auto;padding:16px;background:#020617}}
table{{display:block;overflow:auto;border-collapse:collapse}}td,th{{border:1px solid #475569;padding:8px}}
blockquote{{border-left:3px solid #38bdf8;margin-left:0;padding-left:16px;color:#94a3b8}}
</style></head><body><main><nav><a href="/t2.html">← 资源导航</a> ·
<a href="{source}">原始 Issue / 编辑</a> · <a href="/blog/posts/issue-{issue['number']}.md">Markdown</a></nav>
<h1>{title}</h1><p>更新：{html.escape(issue['updated_at'])}</p><article>{body}</article>
</main></body></html>
"""


def write(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(value, encoding="utf-8")


def publish(root, issues, owner):
    root = Path(root)
    index = root / "data/posts.json"
    existing = json.loads(index.read_text(encoding="utf-8")) if index.exists() else []
    # Preserve manually maintained entries, rebuild only our Issue entries.
    posts = [p for p in existing if p.get("source") != "github-issue"]
    for issue in issues:
        labels = {label["name"] for label in issue.get("labels", [])}
        if (issue.get("pull_request") or issue["user"]["login"].lower() != owner.lower()
                or "documentation" not in labels):
            continue
        number = int(issue["number"])
        issue = {**issue, "number": number}
        md = "# " + issue["title"] + "\n\n" + (issue.get("body") or "") + "\n"
        page = render(issue)
        write(root / str(number) / "index.html", page)
        stem = f"issue-{number}"
        revision = hashlib.sha256((md + page).encode()).hexdigest()[:16]
        for extension, content in [("md", md), ("html", page)]:
            write(root / f"blog/posts/{stem}.{extension}", content)
            backup = root / f"blog/backups/{stem}/{revision}.{extension}"
            if not backup.exists():
                write(backup, content)
        posts.append({
            "source": "github-issue", "issue": number, "isArticle": True, "cat": "log",
            "title": issue["title"], "desc": (issue.get("body_text") or issue.get("body") or "")[:180],
            "content": issue.get("body_text") or issue.get("body") or "",
            "tag": sorted(labels), "date": issue["created_at"][:10],
            "updated_at": issue["updated_at"], "url": f"/{number}/",
            "markdown": f"blog/posts/{stem}.md", "issue_url": issue["html_url"]})
    posts.sort(key=lambda p: p.get("updated_at", p.get("date", "")), reverse=True)
    for path in ["data/posts.json", "data/search.json"]:
        write(root / path, json.dumps(posts, ensure_ascii=False, indent=2) + "\n")
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
