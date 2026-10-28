import importlib.util
from pathlib import Path
import unittest
import hashlib
import json
import tempfile

spec = importlib.util.spec_from_file_location("digit_prototype", Path(__file__).resolve().parents[1] / "tools/prototype-digits.py")
prototype = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prototype)


class DigitPrototypeTests(unittest.TestCase):
    def test_data_split_and_pixel_identity_are_checked_before_training(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            cases, labels = [], []
            for i, (identity, split) in enumerate([("2026test_qm1-v16", "train"), ("2026test_qm1-v40", "test"), ("2026test_qm3-v16", "calibration")]):
                raw = bytes([255 - i]) * (1280 * 20 * 3)
                path = folder / f"{i}.rgb"
                path.write_bytes(raw)
                cases.append({"id": identity, "rawRgb": str(path), "height": 20,
                              "fields": [{"id": "fuel", "kind": "fuel", "rect": [0, 0, .05, .02]}]})
                labels.append({"id": identity, "split": split, "sourceRgbSha256": hashlib.sha256(raw).hexdigest(), "values": {"fuel": 12}})
            case_file, reference_file = folder / "cases.json", folder / "references.json"
            case_file.write_text(json.dumps(cases))
            reference_file.write_text(json.dumps({"labels": labels}))
            with self.assertRaisesRegex(ValueError, "leak across"):
                prototype.load_examples(case_file, reference_file)
            cases[1]["id"] = labels[1]["id"] = "2026test_qm2-v40"
            case_file.write_text(json.dumps(cases))
            reference_file.write_text(json.dumps({"labels": labels}))
            self.assertEqual(len(prototype.load_examples(case_file, reference_file)), 3)
            labels[1]["sourceRgbSha256"] = "0" * 64
            reference_file.write_text(json.dumps({"labels": labels}))
            with self.assertRaisesRegex(ValueError, "identity mismatch"):
                prototype.load_examples(case_file, reference_file)

    def test_blank_pixels_and_outside_crops_are_rejected(self):
        self.assertEqual(prototype.glyphs(bytes([255]) * (1280 * 20 * 3), 20, [0, 0, .05, .02]), [])
        with self.assertRaisesRegex(ValueError, "Crop unavailable"):
            prototype.glyphs(bytes([255]) * (1280 * 20 * 3), 20, [.99, 0, .05, .02])
        with self.assertRaisesRegex(ValueError, "dimensions"):
            prototype.glyphs(b"truncated", 20, [0, 0, .05, .02])

    def test_calibration_rejects_wrong_accepts_and_hybrid_does_not_correct_with_labels(self):
        good = {"caseId": "cal", "fieldId": "fuel", "expected": 12, "tesseract": 12,
                "prediction": {"value": 12, "distance": .03, "margin": .05, "supported": True}}
        bad = {**good, "expected": 13, "prediction": {**good["prediction"], "margin": .005}}
        threshold = prototype.calibrate([good, bad])
        self.assertTrue(prototype.accepted(good["prediction"], threshold))
        self.assertFalse(prototype.accepted(bad["prediction"], threshold))
        # A confident wrong prediction must remain a measured error, even when
        # Tesseract or the reference has the right value.
        wrong = {**good, "prediction": {**good["prediction"], "value": 14}}
        result = prototype.summarize([wrong], threshold, "hybrid")
        self.assertEqual(result["falseAccepts"], 1)
        self.assertEqual(result["details"][0]["value"], 14)
        uncertain = {**wrong, "prediction": {**wrong["prediction"], "supported": False}}
        result = prototype.summarize([uncertain], threshold, "hybrid")
        self.assertEqual(result["correct"], 1)
        self.assertEqual(result["fallbackFields"], 1)


if __name__ == "__main__":
    unittest.main()
