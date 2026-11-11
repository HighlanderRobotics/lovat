#!/usr/bin/env python3
"""Execute the real Flutter integration target against a synthetic HTTP server."""
import os
import pathlib
import subprocess
import sys
import time
import urllib.request
from run_tests import page
ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / 'test-report/browser'
OUT.mkdir(parents=True, exist_ok=True)
processes = []
status = 1
(OUT / 'journey.log').write_text('Browser journey did not start.\n')
try:
    with (OUT / 'fixture.log').open('w') as fixture_log, (OUT / 'driver.log').open('w') as driver_log:
        processes.append(subprocess.Popen(['node', 'tool/fixture_api.mjs'], cwd=ROOT, stdout=fixture_log, stderr=subprocess.STDOUT))
        processes.append(subprocess.Popen(['chromedriver', '--port=4444'], cwd=ROOT, stdout=driver_log, stderr=subprocess.STDOUT))
        for url in ['http://127.0.0.1:9878/healthz', 'http://127.0.0.1:4444/status']:
            for attempt in range(60):
                try:
                    with urllib.request.urlopen(url, timeout=1):
                        break
                except OSError:
                    if attempt == 59:
                        raise RuntimeError('Local test service did not start: ' + url)
                    time.sleep(.5)
        with (OUT / 'journey.log').open('w') as log:
            command = ['flutter', 'drive', '--driver=test_driver/integration_test.dart', '--target=integration_test/app_journey_test.dart', '-d', 'web-server', '--browser-name=chrome', '--headless']
            # ChromeDriver does not read Flutter's CHROME_EXECUTABLE variable.
            # Explicitly select the binary paired with the pinned driver.
            if os.environ.get('CHROME_EXECUTABLE'):
                command += ['--chrome-binary', os.environ['CHROME_EXECUTABLE']]
            status = subprocess.call(command, cwd=ROOT, stdout=log, stderr=subprocess.STDOUT)
        print((OUT / 'journey.log').read_text())
except Exception as error:
    print(error)
    (OUT / 'journey.log').write_text(str(error))
finally:
    for process in reversed(processes):
        process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
    import html
    page(OUT / 'index.html', 'Dashboard Chrome integration', '<p>' + ('PASSED' if status == 0 else 'FAILED') + '</p><p>Production widgets and HTTP client against synthetic local fixtures. Auth0 popup and physical-device permissions are separate manual checks.</p><p><a href="journey.log">Journey log</a> · <a href="fixture.log">Fixture log</a> · <a href="driver.log">Driver log</a></p><pre>' + html.escape((OUT / 'journey.log').read_text()) + '</pre>')
sys.exit(status)
