import importlib.util
from pathlib import Path
import unittest
import xml.etree.ElementTree as ET
from tempfile import TemporaryDirectory
from unittest.mock import patch
import subprocess

spec = importlib.util.spec_from_file_location("menu_input", Path(__file__).resolve().parents[2] / "scripts/prepare-native-android.py")
menu = importlib.util.module_from_spec(spec)
spec.loader.exec_module(menu)


class NativePreparationTest(unittest.TestCase):
    def node(self, **overrides):
        import xml.etree.ElementTree as ET
        attrs = {"package": menu.APP_ID, "content-desc": "End match", "enabled": "true", "bounds": "[572,7][622,53]"}
        attrs.update(overrides)
        return ET.tostring(ET.Element("node", attrs))

    def test_uses_current_control_bounds(self):
        self.assertEqual(menu.point_for(ET.fromstring(self.node())), (597, 30))
        self.assertEqual(menu.point_for(ET.fromstring(self.node(bounds="[350,60][620,110]"))), (485, 85))

    def test_rejects_disabled_or_invalid_control_bounds(self):
        for data in [self.node(enabled="false"), self.node(bounds="[1,2][1,2]"), self.node(bounds="bad")]:
            with self.subTest(data=data), self.assertRaises(ValueError):
                menu.point_for(ET.fromstring(data))

    def test_app_state_rejects_missing_wrong_app_or_ambiguous_nodes(self):
        for data in [b"<hierarchy/>", self.node(package="other.app"), b"<hierarchy>" + self.node() + self.node() + b"</hierarchy>"]:
            with self.subTest(data=data), self.assertRaises(ValueError):
                menu.assert_state(data, "End match", {"enabled": "true"})

    def test_state_assertions_reject_wrong_or_absent_state(self):
        menu.assert_state(self.node(selected="true"), "End match", {"selected": "true"})
        menu.assert_state(self.node(enabled="false"), "End match", {"enabled": "false"})
        with self.assertRaises(AssertionError):
            menu.assert_state(self.node(selected="false"), "End match", {"selected": "true"})
        with self.assertRaises(ValueError):
            menu.assert_state(b"<hierarchy/>", "End match", {"enabled": "false"})

    def test_recognizes_captured_android_immersive_confirmation(self):
        data = (Path(__file__).parent / "fixtures/immersive-confirmation.xml").read_bytes()
        self.assertEqual(menu.immersive_confirmation_point(data), (510, 190))
        # An app button or another system OK dialog must never be acknowledged.
        self.assertIsNone(menu.immersive_confirmation_point(self.node(text="Got it")))
        self.assertIsNone(menu.immersive_confirmation_point(
            b'<node package="android" resource-id="android:id/ok" />'
        ))

    def test_immersive_confirmation_rejects_disabled_or_ambiguous_button(self):
        import xml.etree.ElementTree as ET
        data = (Path(__file__).parent / "fixtures/immersive-confirmation.xml").read_bytes()
        for mode in ["disabled", "duplicate", "wrong-package"]:
            root = ET.fromstring(data)
            button = next(n for n in root.iter("node") if n.get("resource-id") == "android:id/ok")
            if mode == "disabled":
                button.set("enabled", "false")
            elif mode == "wrong-package":
                button.set("package", "other.app")
            else:
                root.append(ET.fromstring(ET.tostring(button)))
            with self.subTest(mode=mode), self.assertRaises(ValueError):
                menu.immersive_confirmation_point(ET.tostring(root))

    def test_failed_idle_capture_cannot_pass_using_a_stale_dump(self):
        # The real CLI prints an idle error but exits zero and leaves its old
        # XML behind. That stale XML would satisfy both preparation assertions.
        stale = b'<hierarchy>' + self.node(**{
            "content-desc": "Start position Hub"
        }) + self.node(**{
            "content-desc": "Start match", "enabled": "false"
        }) + b'</hierarchy>'
        with TemporaryDirectory() as directory:
            root = Path(directory)
            remote = root / "device-ui.xml"
            remote.write_bytes(stale)

            def run_command(args, **kwargs):
                if args[1:4] == ["shell", "rm", "-f"]:
                    remote.unlink(missing_ok=True)
                # A failed dump intentionally produces no new file.
                return subprocess.CompletedProcess(args, 0)

            def read_command(args, **kwargs):
                if not remote.exists():
                    raise subprocess.CalledProcessError(1, args)
                return remote.read_bytes()

            with patch.object(menu, "Path", side_effect=lambda p: root / p), \
                    patch.object(menu.subprocess, "run", side_effect=run_command), \
                    patch.object(menu.subprocess, "check_output", side_effect=read_command), \
                    self.assertRaises(subprocess.CalledProcessError):
                menu.run()
            report = ET.parse(root / ".maestro/results/prepare-landscape.xml")
            self.assertEqual(report.getroot().get("failures"), "1")
            self.assertIsNotNone(report.find("testcase/failure"))


if __name__ == "__main__":
    unittest.main()
