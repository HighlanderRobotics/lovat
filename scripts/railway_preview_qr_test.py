import unittest
import urllib.parse
from railway_preview_qr import affects_backend, preview_url, render_comment, process, MARKER

NUMBER = 42
API = 'https://api-lovat-pr-42.up.railway.app'
HEADER = '<!-- railway-bot-comment-version=2 -->\n🚅 Deployed to [lovat-pr-42](https://railway.com/project/synthetic?environmentId=synthetic)\n'
TABLE = HEADER + '''| **Service** | **Status** | **Web** | **Updated** |
| :--- | :--- | :--- | :--- |
| learn | ✅ Success | [Web](https://learn-lovat-pr-42.up.railway.app) | now |
| dashboard | ✅ Success | [Web](https://dashboard-lovat-pr-42.up.railway.app) | now |
| api | ✅ Success ([View Logs](https://railway.com/log)) | [Web](https://api-lovat-pr-42.up.railway.app) | now |
'''
WORKER = HEADER + '''| **Service** | **Status** | **Web** | **Updated** |
| :--- | :--- | :--- | :--- |
| worker | ✅ Success | — | now |
<details><summary>Services not affected</summary>api</details>
'''


def railway(body=TABLE):
    return {'id': 7, 'user': {'login': 'railway-app[bot]'}, 'body': body, 'updated_at': '2026-11-10T00:00:00Z'}


def event(comment=None):
    return {'issue': {'number': NUMBER, 'pull_request': {'url': 'https://api.github.com/repos/example/lovat/pulls/42'}}, 'comment': comment or railway()}


class FakeGitHub:
    def __init__(self, files=None, comments=None):
        self.files = files or [{'filename': 'apps/server/src/app.ts'}]
        self.comments = [railway()] if comments is None else comments
        self.pr = {'state': 'open', 'head': {'repo': {'full_name': 'example/lovat'}}, 'base': {'repo': {'full_name': 'example/lovat'}}}
        self.writes = []

    def request(self, path, method='GET', payload=None):
        if method == 'GET':
            assert path == '/pulls/42'
            return self.pr
        self.writes.append((path, method, payload))
        return {}

    def pages(self, path):
        if path == '/pulls/42/files':
            return iter(self.files)
        assert path == '/issues/42/comments'
        return iter(self.comments)


class PreviewTests(unittest.TestCase):
    def test_selects_api_even_when_frontend_is_the_first_web_link(self):
        self.assertEqual(preview_url(TABLE, NUMBER), API)

    def test_worker_only_reuses_same_pr_api_without_worker_public_url(self):
        self.assertEqual(preview_url(WORKER, NUMBER), API)

    def test_sleeping_api_can_wake_but_failed_or_building_api_is_not_replaced(self):
        self.assertEqual(preview_url(TABLE.replace('✅ Success ([View Logs]', '😴 Sleeping ([View Logs]'), NUMBER), API)
        for state in ['❌ Failed', '🔨 Building']:
            self.assertIsNone(preview_url(TABLE.replace('✅ Success ([View Logs]', state + ' ([View Logs]'), NUMBER))

    def test_rejects_other_pr_production_or_missing_environment(self):
        self.assertIsNone(preview_url(TABLE, 43))
        self.assertIsNone(preview_url(TABLE.replace(API, 'https://api.lovat.app'), NUMBER))
        self.assertIsNone(preview_url(TABLE.replace('[lovat-pr-42]', '[production]'), NUMBER))

    def test_frontend_only_tables_do_not_invent_api(self):
        self.assertIsNone(preview_url('\n'.join(line for line in TABLE.splitlines() if '| api |' not in line), NUMBER))

    def test_deep_links_match_current_app_schemes_and_round_trip_encoding(self):
        body = render_comment(API)
        self.assertIn(MARKER, body)
        import re
        images = re.findall(r'!\[[^]]+\]\(([^)]+)\)', body)
        links = [urllib.parse.parse_qs(urllib.parse.urlparse(url).query)['data'][0] for url in images]
        self.assertEqual(urllib.parse.urlparse(links[0]).scheme, 'lovat-collection')
        self.assertEqual(urllib.parse.urlparse(links[1]).scheme, 'com.frc8033.lovatdashboard')
        for link in links:
            self.assertEqual(urllib.parse.parse_qs(urllib.parse.urlparse(link).query)['u'], [API])

    def test_backend_scope_includes_worker_server_and_shared_db(self):
        for path in ['apps/worker/index.ts', 'apps/server/src/app.ts', 'packages/db/prisma/schema.prisma', '.railway/railway.ts']:
            self.assertTrue(affects_backend([path]))
        self.assertFalse(affects_backend(['apps/website/src/routes/+page.svelte']))

    def test_created_and_edited_comments_post_then_update_without_duplicates(self):
        github = FakeGitHub()
        self.assertEqual(process(event(), 'issue_comment', github, lambda url: url == API), 'Posted QR comment')
        self.assertEqual(github.writes[0][:2], ('/issues/42/comments', 'POST'))
        old = {'id': 99, 'user': {'login': 'github-actions[bot]'}, 'body': MARKER + '\nOld QR'}
        github = FakeGitHub(comments=[railway(), old])
        self.assertEqual(process(event(), 'issue_comment', github, lambda _: True), 'Updated QR comment')
        self.assertEqual(github.writes[0][:2], ('/issues/comments/99', 'PATCH'))

    def test_unchanged_comment_is_a_noop(self):
        github = FakeGitHub(comments=[railway(), {'id': 99, 'user': {'login': 'github-actions[bot]'}, 'body': render_comment(API)}])
        self.assertEqual(process(event(), 'issue_comment', github, lambda _: True), 'QR comment is current')
        self.assertEqual(github.writes, [])

    def test_edited_payload_wins_over_stale_comment_listing(self):
        github = FakeGitHub(comments=[railway(TABLE.replace('✅ Success ([View Logs]', 'Building ([View Logs]'))])
        process(event(railway()), 'issue_comment', github, lambda _: True)
        self.assertEqual(len(github.writes), 1)

    def test_pull_request_event_handles_worker_changes(self):
        github = FakeGitHub(files=[{'filename': 'apps/worker/index.ts'}], comments=[railway(WORKER)])
        self.assertEqual(process({'pull_request': {'number': NUMBER}}, 'pull_request_target', github, lambda _: True), 'Posted QR comment')

    def test_skips_unhealthy_api_nonbackend_forks_and_untrusted_comments(self):
        github = FakeGitHub()
        process(event(), 'issue_comment', github, lambda _: False)
        self.assertEqual(github.writes, [])
        cases = [FakeGitHub(files=[{'filename': 'apps/learn/src/page.md'}]), FakeGitHub()]
        cases[1].pr['head']['repo']['full_name'] = 'fork/lovat'
        for github in cases:
            process(event(), 'issue_comment', github, lambda _: True)
            self.assertEqual(github.writes, [])
        github = FakeGitHub()
        untrusted = event(); untrusted['comment']['user']['login'] = 'someone'
        self.assertIn('Ignored', process(untrusted, 'issue_comment', github, lambda _: True))
        self.assertEqual(github.writes, [])

    def test_worker_pending_and_backend_rename(self):
        self.assertIsNone(preview_url(WORKER.replace('✅ Success', 'Building'), NUMBER))
        github = FakeGitHub(files=[{'filename': 'archive/removed.ts', 'previous_filename': 'apps/server/src/old.ts'}])
        process(event(), 'issue_comment', github, lambda _: True)
        self.assertEqual(len(github.writes), 1)

    def test_closed_pr_and_missing_railway_comment_do_not_post(self):
        github = FakeGitHub(); github.pr['state'] = 'closed'
        process(event(), 'issue_comment', github, lambda _: True)
        self.assertEqual(github.writes, [])
        github = FakeGitHub(comments=[])
        self.assertIn('Waiting', process({'pull_request': {'number': NUMBER}}, 'pull_request_target', github, lambda _: True))
        self.assertEqual(github.writes, [])


if __name__ == '__main__':
    unittest.main()
