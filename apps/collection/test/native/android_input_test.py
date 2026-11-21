import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("menu_input", Path(__file__).resolve().parents[2] / "scripts/native-android-journey.py")
menu = importlib.util.module_from_spec(spec)
spec.loader.exec_module(menu)


class MenuInputTest(unittest.TestCase):
    def node(self, **overrides):
        import xml.etree.ElementTree as ET
        attrs = {"package": menu.APP_ID, "content-desc": "End match", "enabled": "true", "bounds": "[572,7][622,53]"}
        attrs.update(overrides)
        return ET.tostring(ET.Element("node", attrs))

    def test_uses_current_bounds_and_separates_icon_from_menu_item(self):
        self.assertEqual(menu.tap_point(self.node(), "content-desc"), (597, 30))
        self.assertEqual(menu.tap_point(self.node(text="End match", bounds="[350,60][620,110]"), "text"), (485, 85))
        with self.assertRaises(ValueError):
            menu.tap_point(self.node(), "text")

    def test_rejects_disabled_missing_ambiguous_or_invalid_targets(self):
        for data in [b"<hierarchy/>", self.node(enabled="false"), self.node(package="other.app"), self.node(bounds="[1,2][1,2]"), self.node(bounds="bad"), b"<hierarchy>" + self.node() + self.node() + b"</hierarchy>"]:
            with self.subTest(data=data), self.assertRaises(ValueError):
                menu.tap_point(data, "content-desc")

    def test_state_assertions_reject_wrong_or_absent_state(self):
        menu.assert_state(self.node(selected="true"), "End match", {"selected": "true"})
        menu.assert_state(self.node(enabled="false"), "End match", {"enabled": "false"})
        with self.assertRaises(AssertionError):
            menu.assert_state(self.node(selected="false"), "End match", {"selected": "true"})
        with self.assertRaises(ValueError):
            menu.assert_state(b"<hierarchy/>", "End match", {"enabled": "false"})


if __name__ == "__main__":
    unittest.main()
