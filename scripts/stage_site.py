"""Build clean public URLs in deployment output, never in the repository."""
import json
from pathlib import Path
import shutil
import sys
from publish_issues import alias_page, output_path, validate_routes, write


def stage(root, destination):
    root, destination = Path(root).resolve(), Path(destination).resolve()
    if destination == root or root in destination.parents or destination in root.parents:
        raise ValueError('Deployment output must be outside the repository')
    if destination.exists() and any(destination.iterdir()):
        raise ValueError('Deployment output must be empty')
    plans = json.loads((root / 'data/article-routes.json').read_text(encoding='utf-8'))
    validate_routes(root, plans)
    shutil.copytree(root, destination, dirs_exist_ok=True,
                    ignore=shutil.ignore_patterns('.git', '.github', 'scripts', 'tests', '__pycache__'))
    for plan in plans.values():
        source = destination / plan['file']
        if source.parent != destination / 'data/html' or source.suffix != '.html':
            raise ValueError('Article source must be an HTML file in data/html')
        page = source.read_text(encoding='utf-8')
        write(destination / output_path(plan['url']), page)
        source.unlink()
        for alias in plan.get('aliases', []):
            write(destination / output_path(alias), alias_page(plan['url']))
        # Preserve existing Markdown downloads only in the deployed artifact.
        if plan.get('markdown'):
            md = destination / plan['markdown']
            if md.parent != destination / 'data/md' or md.suffix != '.md':
                raise ValueError('Markdown source must be in data/md')
            number = md.stem
            for alias in [f'data/{number}.md', f'{number}.md', f'blog/md/{number}.md', f'blog/posts/issue-{number}.md']:
                write(destination / alias, md.read_text(encoding='utf-8'))


if __name__ == '__main__':
    stage(Path(__file__).resolve().parent.parent, sys.argv[1])
