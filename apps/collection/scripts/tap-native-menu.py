"""Tap Android's native End Match menu using its actual accessibility bounds.

Maestro 2.12.1's gRPC taps are ineffective after rotation on the CI image.
Unlike the field buttons, this menu distinguishes short taps from long presses.
"""

from pathlib import Path
import re
import subprocess
import time
import xml.etree.ElementTree as ET

APP_ID = "com.frc8033.lovatcollection"


def tap_point(data, attribute):
    nodes = [
        n for n in ET.fromstring(data).iter("node")
        if n.get("package") == APP_ID and n.get(attribute) == "End match"
    ]
    if len(nodes) != 1 or nodes[0].get("enabled") != "true":
        raise ValueError("Expected exactly one enabled End match " + attribute)
    match = re.fullmatch(
        r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", nodes[0].get("bounds", "")
    )
    if match is None:
        raise ValueError("Invalid menu bounds")
    x1, y1, x2, y2 = map(int, match.groups())
    if x2 <= x1 or y2 <= y1:
        raise ValueError("Menu target has no visible area")
    return ((x1 + x2) // 2, (y1 + y2) // 2)


def run():
    out = Path(".maestro/results")
    suite = ET.Element("testsuite", name="Android native end menu", failures="0")
    try:
        for name, attribute in [("open-menu", "content-desc"), ("confirm-end", "text")]:
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
                        x, y = tap_point(data, attribute)
                        break
                    except ValueError:
                        if time.monotonic() >= deadline:
                            raise
                        time.sleep(0.25)
                print(name, "Android input tap at", x, y, flush=True)
                subprocess.run(
                    ["adb", "shell", "input", "tap", str(x), str(y)],
                    check=True, timeout=10,
                )
            except Exception as error:
                suite.set("failures", "1")
                ET.SubElement(case, "failure", message=str(error)).text = repr(error)
                raise
    finally:
        suite.set("tests", str(len(suite.findall("testcase"))))
        ET.ElementTree(suite).write(
            out / "end-match.xml", encoding="utf-8", xml_declaration=True
        )


if __name__ == "__main__":
    run()
