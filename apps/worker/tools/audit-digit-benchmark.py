"""Verify a frozen native digit benchmark without refitting its model."""
import argparse
import importlib.util
import json
import math
from pathlib import Path
import statistics

spec = importlib.util.spec_from_file_location("digit_prototype", Path(__file__).with_name("prototype-digits.py"))
prototype = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prototype)


def audit(cases, references, model_path, native_path):
    if model_path.stat().st_size > 1024 * 1024 or native_path.stat().st_size > 32 * 1024 * 1024:
        raise ValueError("Native benchmark exceeds budget")
    model_bytes = model_path.read_bytes()
    model = json.loads(model_bytes)
    native = json.loads(native_path.read_text())
    if native["prototypeModelSha256"] != prototype.digest(model_bytes) or native["productionEnabled"]:
        raise ValueError("Native/model identity mismatch")
    templates = [{**t, "bits": int(t["bits"], 16)} for t in model["templates"]]
    examples = prototype.load_examples(cases, references)
    # Re-derive provenance for verification only. Never replace the stored
    # model or choose thresholds from the held-out match labels.
    training, rejected = prototype.build_model([e for e in examples if e["split"] == "train"])
    if templates != training or model["trainingRejections"] != rejected:
        raise ValueError("Model glyphs do not derive from the declared training pixels")
    expected = {(e["caseId"], e["fieldId"]): e for e in examples}
    predictions = {key: prototype.predict(e["raw"], e["height"], e["rect"], templates) for key, e in expected.items()}
    calibration = [{"prediction": predictions[key], "expected": e["expected"]}
                   for key, e in expected.items() if e["split"] == "calibration"]
    if prototype.calibrate(calibration) != model["threshold"]:
        raise ValueError("Stored thresholds do not match the calibration-only selection")
    seen = set()
    for row in native["measurements"]:
        key = (row["caseId"], row["fieldId"])
        identity = (*key, row["round"])
        if identity in seen or key not in expected or row["round"] not in [1, 2]:
            raise ValueError("Unknown or duplicate native measurement")
        seen.add(identity)
        if row["sourceRgbSha256"] != expected[key]["sourceRgbSha256"] or row["field"] != expected[key]["field"]:
            raise ValueError("Native pixels/field identity mismatch")
        prediction, actual = predictions[key], row["prediction"]
        if (actual["value"] != prediction["value"] or actual["supported"] != prediction["supported"]
                or abs(actual["distance"] - prediction["distance"]) > 1e-14
                or abs(actual["margin"] - prediction["margin"]) > 1e-14
                or actual["accepted"] != prototype.accepted(prediction, model["threshold"])):
            raise ValueError("Native prediction differs from the frozen Python classifier")
        if (actual["accepted"] and (row["hybridValue"] != actual["value"] or row["hybridCalls"] != 0)
                or any(not 0 <= row[key] <= 3 for key in ["baselineCalls", "hybridCalls"])
                or any(not math.isfinite(row[key]) or row[key] < 0 for key in ["baselineMicros", "hybridMicros", "classifierMicros"])):
            raise ValueError("Native fallback or timing invariant failed")
    if len(seen) != len(expected) * 2:
        raise ValueError("Incomplete native benchmark")
    summary = {}
    for split in ["train", "calibration", "test"]:
        rows = [r for r in native["measurements"] if expected[(r["caseId"], r["fieldId"])]["split"] == split]
        groups = {}
        for row in rows:
            groups.setdefault((row["caseId"], row["fieldId"]), []).append(row)
        metrics = {}
        for mode in ["baseline", "hybrid"]:
            correct = wrong = missing = unstable = 0
            for key, repeated in groups.items():
                values = [r[mode + "Value"] for r in repeated]
                truth = expected[key]["expected"]
                unstable += len(set(values)) > 1
                if any(v is not None and v != truth for v in values):
                    wrong += 1
                elif all(v == truth for v in values):
                    correct += 1
                else:
                    missing += 1
            times = [statistics.median(r[mode + "Micros"] for r in repeated) for repeated in groups.values()]
            metrics[mode] = {"fields": len(groups), "correct": correct, "falseAccepts": wrong,
                             "missing": missing, "unstable": unstable, "medianMicros": statistics.median(times),
                             "meanMicros": statistics.mean(times), "p95Micros": sorted(times)[math.ceil(len(times) * .95) - 1],
                             "tesseractCallsAcrossTwoRounds": sum(r[mode + "Calls"] for r in rows)}
        metrics["classifierMedianMicros"] = statistics.median(r["classifierMicros"] for r in rows)
        summary[split] = metrics
    return {"allPredictionsMatchPython": True, "measurements": len(seen), "modelBytes": len(model_bytes),
            "modelSha256": prototype.digest(model_bytes), "nativeSha256": prototype.digest(native_path.read_bytes()),
            "referencesSha256": prototype.digest(references.read_bytes()), "runtime": native["runtime"], "summary": summary,
            "promoted": False, "limits": "Repeated rounds count once per field. Small agent-reviewed pixel set, not independent robot/HP counts. Timings are local crops with separate baseline/hybrid caches; video decoding and clock/identity gates are excluded. No event-wide or end-to-end accuracy/speed claim."}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ["cases", "references", "model", "native", "output"]:
        parser.add_argument("--" + name, type=Path, required=True)
    args = parser.parse_args()
    result = audit(args.cases, args.references, args.model, args.native)
    prototype.write_new(args.output, result)
    print(json.dumps(result))
