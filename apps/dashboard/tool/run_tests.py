#!/usr/bin/env python3
"""Run both Flutter packages, retain failures, and publish dependency-free HTML."""
import html
import json
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
REPORT = ROOT / 'test-report'


def page(path, title, body):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>' + html.escape(title) + '</title><style>body{font:16px system-ui;max-width:1100px;margin:2rem auto;padding:1rem}pre{white-space:pre-wrap;overflow-wrap:anywhere}.hit{background:#dfd}.miss{background:#fdd}td,th{padding:.4rem;text-align:left}</style><h1>' + html.escape(title) + '</h1>' + body)


def coverage(package, output):
    records = {}
    current = None
    lcov = package / 'coverage/lcov.info'
    if lcov.exists():
        for line in lcov.read_text().splitlines():
            if line.startswith('SF:'):
                current = line[3:]
                records.setdefault(current, {})
            elif line.startswith('DA:') and current:
                number, hits, *_ = line[3:].split(',')
                records[current][int(number)] = int(hits)
    rows = []
    failures = []
    floors = json.loads((ROOT / 'tool/coverage_floors.json').read_text())
    for index, (name, lines) in enumerate(sorted(records.items())):
        percent = 100 * sum(h > 0 for h in lines.values()) / max(1, len(lines))
        target = f'{index}.html'
        source = pathlib.Path(name)
        if not source.is_absolute():
            source = package / source
        body = ''
        if source.is_file():
            for number, content in enumerate(source.read_text().splitlines(), 1):
                css = 'hit' if lines.get(number, 0) > 0 else 'miss' if number in lines else ''
                body += f'<span class="{css}">{number:4} {html.escape(content)}</span>\n'
        page(output / target, name, '<pre>' + body + '</pre>')
        rows.append(f'<tr><td><a href="{target}">{html.escape(name)}</a></td><td>{percent:.1f}% ({sum(h > 0 for h in lines.values())}/{len(lines)})</td></tr>')
    for name, floor in floors.items():
        if package != ROOT:
            continue
        matches = [v for k, v in records.items() if k.endswith(name)]
        actual = 100 * sum(h > 0 for h in matches[0].values()) / max(1, len(matches[0])) if matches else 0
        if actual < floor:
            failures.append(f'{name}: {actual:.1f}% < {floor}%')
    page(output / 'index.html', 'Line coverage', '<p>Coverage is scoped to loaded files; configured critical files have enforced floors.</p><table><tr><th>Source</th><th>Covered lines</th></tr>' + ''.join(rows) + '</table><pre>' + html.escape('\n'.join(failures)) + '</pre>')
    return failures


def run(package, output):
    output.mkdir(parents=True, exist_ok=True)
    names, results, errors = {}, [], []
    log = output / 'events.jsonl'
    command = ['flutter', 'test', '--machine', '--coverage']
    with log.open('w') as stream:
        process = subprocess.Popen(command, cwd=package, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        for line in process.stdout:
            stream.write(line)
            stream.flush()
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                print(line, end='')
                continue
            if not isinstance(event, dict):
                continue
            if event.get('type') == 'testStart':
                names[event['test']['id']] = event['test']['name']
            elif event.get('type') == 'testDone' and not event.get('hidden'):
                result = event['result']
                name = names.get(event['testID'], str(event['testID']))
                results.append((name, result, event.get('skipped', False)))
                print(f'{result}: {name}', flush=True)
            elif event.get('type') == 'error':
                errors.append(event.get('error', '') + '\n' + event.get('stackTrace', ''))
                print(errors[-1], flush=True)
        status = process.wait()
    failures = coverage(package, output / 'coverage')
    status = status or bool(failures)
    rows = ''.join('<li>' + html.escape(f'{result}{" (skipped)" if skipped else ""}: {name}') + '</li>' for name, result, skipped in results)
    page(output / 'index.html', 'Dashboard tests' if package == ROOT else 'chips_input tests', f'<p>{"FAILED" if status else "PASSED"} — {len(results)} test results.</p><p><a href="coverage/index.html">Coverage</a> · <a href="events.jsonl">Machine results</a></p><ul>{rows}</ul><pre>' + html.escape('\n'.join(errors + failures)) + '</pre>')
    return int(bool(status))


if __name__ == '__main__':
    status = run(ROOT, REPORT)
    subprocess.run(['flutter', 'pub', 'get'], cwd=ROOT / 'packages/chips_input', check=True)
    status |= run(ROOT / 'packages/chips_input', REPORT / 'packages/chips_input')
    index = REPORT / 'index.html'
    index.write_text(index.read_text() + '<p><a href="packages/chips_input/index.html">chips_input package results</a> · <a href="browser/index.html">Chrome journey (separate CI job)</a></p>')
    sys.exit(status)
