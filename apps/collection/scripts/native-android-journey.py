"""Record a report with Android short taps and fresh accessibility bounds.

Maestro 2.12.1's gRPC taps are ineffective after rotation on the CI image.
Keep real gestures and state assertions rather than relying on driver success.
"""

from pathlib import Path
import re
import subprocess
import time
import xml.etree.ElementTree as ET

APP_ID = "com.frc8033.lovatcollection"


def node_for(data, label, attribute):
    nodes = [
        n for n in ET.fromstring(data).iter("node")
        if n.get("package") == APP_ID and n.get(attribute) == label
    ]
    if len(nodes) != 1:
        raise ValueError("Expected exactly one " + label + " " + attribute)
    return nodes[0]


def tap_point(data, attribute, label="End match"):
    node = node_for(data, label, attribute)
    if node.get("enabled") != "true":
        raise ValueError("Expected enabled " + label)
    match = re.fullmatch(
        r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", node.get("bounds", "")
    )
    if match is None:
        raise ValueError("Invalid control bounds")
    x1, y1, x2, y2 = map(int, match.groups())
    if x2 <= x1 or y2 <= y1:
        raise ValueError("Control has no visible area")
    return ((x1 + x2) // 2, (y1 + y2) // 2)


def assert_state(data, label, expected):
    node = node_for(data, label, "content-desc")
    for key, value in expected.items():
        if node.get(key) != value:
            raise AssertionError(label + " expected " + key + "=" + value)


def run():
    out = Path(".maestro/results")
    out.mkdir(parents=True, exist_ok=True)
    suite = ET.Element("testsuite", name="Android landscape report", failures="0")
    # Outpost actions exist in Auto, Teleop and Endgame. Accessibility snapshots
    # can wait for Android's idle state, so these assertions do not race the
    # real match clock or change production match timing for the test.
    steps = [
        ("select-hub", "tap", "Start position Hub", "content-desc"),
        ("hub-selected", "state", "Start position Hub", {"selected": "true"}),
        ("start-enabled", "state", "Start match", {"enabled": "true"}),
        ("start-match", "tap", "Start match", "content-desc"),
        ("undo-empty", "state", "Undo", {"enabled": "false"}),
        ("open-first-intake", "tap", "Open outpost actions", "content-desc"),
        ("first-intake", "tap", "Intake from outpost", "content-desc"),
        ("undo-available", "state", "Undo", {"enabled": "true"}),
        ("undo-intake", "tap", "Undo", "content-desc"),
        ("undo-cleared", "state", "Undo", {"enabled": "false"}),
        ("open-final-intake", "tap", "Open outpost actions", "content-desc"),
        ("final-intake", "tap", "Intake from outpost", "content-desc"),
        ("final-event-recorded", "state", "Undo", {"enabled": "true"}),
        ("open-end-menu", "tap", "End match", "content-desc"),
        ("confirm-end", "tap", "End match", "text"),
    ]
    try:
        for name, action, label, condition in steps:
            case = ET.SubElement(suite, "testcase", name=name)
            try:
                deadline = time.monotonic() + 30
                while True:
                    subprocess.run(
                        ["adb", "shell", "uiautomator", "dump", "/sdcard/collection-menu.xml"],
                        check=True, timeout=20,
                    )
                    data = subprocess.check_output(
                        ["adb", "exec-out", "cat", "/sdcard/collection-menu.xml"],
                        timeout=10,
                    )
                    (out / (name + ".xml")).write_bytes(data)
                    try:
                        if action == "state":
                            assert_state(data, label, condition)
                        else:
                            x, y = tap_point(data, condition, label)
                        break
                    except (ValueError, AssertionError):
                        if time.monotonic() >= deadline:
                            raise
                        time.sleep(0.25)
                if action == "tap":
                    print(name, "Android input tap at", x, y, flush=True)
                    subprocess.run(
                        ["adb", "shell", "input", "tap", str(x), str(y)],
                        check=True, timeout=10,
                    )
                else:
                    print(name, "state assertion passed", flush=True)
            except Exception as error:
                suite.set("failures", "1")
                ET.SubElement(case, "failure", message=str(error)).text = repr(error)
                raise
    finally:
        suite.set("tests", str(len(suite.findall("testcase"))))
        ET.ElementTree(suite).write(
            out / "record-match.xml", encoding="utf-8", xml_declaration=True
        )


if __name__ == "__main__":
    run()
