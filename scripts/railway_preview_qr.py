#!/usr/bin/env python3
"""Upsert app connection QR codes for a healthy Server/Worker PR preview.

Executed from the trusted default branch by pull_request_target/issue_comment.
Never checks out or executes PR code and never connects apps to a frontend URL.
"""
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

MARKER = '<!-- lovat-railway-preview-qr -->'
RAILWAY_BOT = 'railway-app[bot]'
RELEVANT = ('apps/server/', 'apps/worker/', 'packages/db/')


def affects_backend(files):
    return any(name.startswith(RELEVANT) or name in {
        '.github/workflows/server-railway-qr-codes.yml',
        'scripts/railway_preview_qr.py', 'scripts/railway_preview_qr_test.py',
    } for name in files)


def is_railway(comment):
    return (comment.get('user', {}).get('login') == RAILWAY_BOT
            and 'railway-bot-comment-version' in comment.get('body', ''))


def preview_url(body, number):
    """Prefer the API row; workers have no public URL of their own.

    For a worker-only table, api can be in Railway's 'not affected' list.
    Use the repository's established api-lovat-pr-N hostname only when Railway
    identifies that exact PR environment. The caller verifies /status before use.
    """
    expected = f'https://api-lovat-pr-{number}.up.railway.app'
    environment = f'lovat-pr-{number}'
    if not re.search(r'\[' + re.escape(environment) + r'\]\(https://railway\.(?:com|app)/', body):
        return None
    for line in body.splitlines():
        if not line.lstrip().startswith('|'):
            continue
        cells = [cell.strip() for cell in line.strip().strip('|').split('|')]
        if len(cells) < 3:
            continue
        service = cells[0].strip('*` ').lower()
        if service not in {'api', 'server', 'lovat-server'}:
            continue
        # A pending/failed API row must never be replaced by a frontend success.
        if not re.search(r'\b(?:Success|Sleeping)\b', cells[1], re.I):
            return None
        link = re.search(r'\[Web\]\((https://[^\s)]+)\)', cells[2])
        if link and link.group(1).rstrip('/') == expected:
            return expected
        return None
    # Worker-only changes reuse the existing API in the same PR environment.
    if re.search(r'\|\s*(?:\*\*)?worker(?:\*\*)?\s*\|[^|]*\b(?:Success|Sleeping)\b', body, re.I):
        return expected
    return None


def render_comment(url):
    encoded = urllib.parse.quote(url, safe='')
    collection = f'lovat-collection://set-url?u={encoded}'
    dashboard = f'com.frc8033.lovatdashboard:///set-url?u={encoded}'

    def qr(value):
        return 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=' + urllib.parse.quote(value, safe='')

    return f'''{MARKER}
## 📱 Connect your app to this PR deployment

Scan a QR code to use this PR's Server API. Worker changes use the same API;
the Worker has no public app endpoint.

**Server URL:** `{url}`

<details>
<summary><b>Lovat Collection</b></summary>

![QR code — Lovat Collection]({qr(collection)})

`{collection}`

</details>

<details>
<summary><b>Lovat Dashboard</b></summary>

![QR code — Lovat Dashboard]({qr(dashboard)})

`{dashboard}`

</details>
'''


class GitHub:
    def __init__(self, repository, token):
        if not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', repository):
            raise ValueError('Invalid repository')
        self.base = f'https://api.github.com/repos/{repository}'
        self.token = token

    def request(self, path, method='GET', payload=None):
        request = urllib.request.Request(self.base + path, method=method,
            data=None if payload is None else json.dumps(payload).encode(), headers={
                'Authorization': f'Bearer {self.token}',
                'Accept': 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
                'Content-Type': 'application/json',
            })
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.load(response)

    def pages(self, path):
        for page in range(1, 31):
            items = self.request(f'{path}?per_page=100&page={page}')
            yield from items
            if len(items) < 100:
                return
        raise RuntimeError('GitHub pagination limit reached; refusing partial data')


def healthy(url):
    # Only a deterministic PR API host reaches this function. No auth is sent.
    for attempt in range(3):
        try:
            with urllib.request.urlopen(url + '/status', timeout=10) as response:
                if response.status == 200 and response.read(256).strip() == b'Server running':
                    return True
        except (OSError, urllib.error.URLError):
            pass
        if attempt < 2:
            time.sleep(5)
    return False


def process(event, event_name, github, probe=healthy):
    if event_name == 'issue_comment':
        if not event.get('issue', {}).get('pull_request') or not is_railway(event.get('comment', {})):
            return 'Ignored non-Railway PR comment'
        number = event['issue']['number']
    elif event_name == 'pull_request_target':
        number = event['pull_request']['number']
    else:
        return 'Ignored event'
    pr = github.request(f'/pulls/{number}')
    if pr['state'] != 'open' or pr['head']['repo']['full_name'] != pr['base']['repo']['full_name']:
        return 'Skipped closed or fork PR'
    files = [name for entry in github.pages(f'/pulls/{number}/files')
             for name in (entry['filename'], entry.get('previous_filename', ''))]
    if not affects_backend(files):
        return 'Skipped PR without Server/Worker changes'
    comments = list(github.pages(f'/issues/{number}/comments'))
    railway = [comment for comment in comments if is_railway(comment)]
    # Use the event's edited content even if the list endpoint briefly lags.
    if event_name == 'issue_comment':
        railway = [c for c in railway if c.get('id') != event['comment']['id']] + [event['comment']]
    if not railway:
        return 'Waiting for Railway preview comment'
    latest = max(railway, key=lambda c: (c.get('updated_at', ''), c.get('id', 0)))
    url = preview_url(latest['body'], number)
    if url is None or not probe(url):
        return 'Waiting for healthy PR API; a Railway comment update will retry'
    body = render_comment(url)
    existing = [c for c in comments if c.get('user', {}).get('login') == 'github-actions[bot]' and
                (MARKER in c.get('body', '') or c.get('body', '').startswith('## 📱 Connect your app to this PR deployment'))]
    if existing:
        current = existing[-1]
        if current['body'] == body:
            return 'QR comment is current'
        github.request(f'/issues/comments/{current["id"]}', 'PATCH', {'body': body})
        return 'Updated QR comment'
    github.request(f'/issues/{number}/comments', 'POST', {'body': body})
    return 'Posted QR comment'


if __name__ == '__main__':
    payload = json.loads(Path(os.environ['GITHUB_EVENT_PATH']).read_text())
    print(process(payload, os.environ['GITHUB_EVENT_NAME'],
                  GitHub(os.environ['GITHUB_REPOSITORY'], os.environ['GITHUB_TOKEN'])))
