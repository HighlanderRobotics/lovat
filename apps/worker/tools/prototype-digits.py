"""Local supervised 0-9 prototype for fuel/points; never production allocation.

No third-party Python packages, network, database, synthetic labels or random
split. Frames/labels/model stay outside Git. Clock/identity OCR stays Tesseract.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import re
import statistics
import time

WIDTH, FEATURE_W, FEATURE_H = 1280, 16, 24
DISTANCES = [.02, .04, .06, .08, .10, .12, .16, .20, .25, .30, .40]
MARGINS = [0, .005, .01, .02, .03, .05, .08, .10, .15, .20]


def digest(data):
    return hashlib.sha256(data).hexdigest()


def glyphs(raw, height, rect):
    if len(raw) != WIDTH * height * 3 or not 1 <= height <= 720:
        raise ValueError("RGB dimensions mismatch")
    if len(rect) != 4 or any(not math.isfinite(v) for v in rect):
        raise ValueError("Invalid rectangle")
    x, y, width, h = [math.floor(v * scale + .5) for v, scale in zip(rect, [1280, 720, 1280, 720])]
    if x < 0 or y < 0 or width < 1 or h < 1 or x + width > WIDTH or y + h > height:
        raise ValueError("Crop unavailable")
    # This classifier owns a cheap source-resolution feature path. It is not
    # claimed identical to Tesseract's bicubic RGB-to-gray preprocessing.
    gray = []
    for row in range(y, y + h):
        start = (row * WIDTH + x) * 3
        for col in range(width):
            r, g, b = raw[start + col * 3:start + col * 3 + 3]
            gray.append((77 * r + 150 * g + 29 * b) >> 8)
    median = sorted(gray)[len(gray) // 2]
    background = max(1, 255 - median if median < 128 else median)
    mask = [min(255, (255 - v if median < 128 else v) * 255 // background) < 160 for v in gray]
    runs = []
    for col in range(width):
        if sum(mask[row * width + col] for row in range(h)) < 2:
            continue
        if runs and runs[-1][1] == col:
            runs[-1][1] = col + 1
        else:
            runs.append([col, col + 1])
    if not 1 <= len(runs) <= 4:
        return []
    features = []
    for left, right in runs:
        rows = [row for row in range(h) if any(mask[row * width + col] for col in range(left, right))]
        if not rows or rows[-1] - rows[0] + 1 < 6:
            return []
        top, gh, gw = rows[0], rows[-1] - rows[0] + 1, right - left
        scale = min((FEATURE_W - 2) / gw, (FEATURE_H - 2) / gh)
        tw, th = max(1, int(gw * scale)), max(1, int(gh * scale))
        ox, oy = (FEATURE_W - tw) // 2, (FEATURE_H - th) // 2
        bits = 0
        for dy in range(th):
            sy = min(gh - 1, int((dy + .5) * gh / th)) + top
            for dx in range(tw):
                sx = min(gw - 1, int((dx + .5) * gw / tw)) + left
                if mask[sy * width + sx]:
                    bits |= 1 << ((oy + dy) * FEATURE_W + ox + dx)
        features.append(bits)
    return features


def build_model(training):
    templates = {}
    rejected = []
    for example in training:
        digits = str(example["expected"])
        features = glyphs(example["raw"], example["height"], example["rect"])
        if len(features) != len(digits):
            rejected.append({"caseId": example["caseId"], "fieldId": example["fieldId"], "reason": "segmentation-count-mismatch"})
            continue
        for digit, bits in zip(digits, features):
            prior = templates.get(bits)
            if prior and prior["digit"] != digit:
                raise ValueError("Conflicting supervised glyph labels; review training pixels")
            templates.setdefault(bits, {"digit": digit, "bits": bits,
                                        "caseId": example["caseId"], "fieldId": example["fieldId"]})
    if not templates:
        raise ValueError("No usable training glyphs")
    return sorted(templates.values(), key=lambda t: (t["digit"], t["bits"])), rejected


def predict(raw, height, rect, templates):
    features = glyphs(raw, height, rect)
    if not features:
        return {"value": None, "distance": 1.0, "margin": 0.0, "supported": False}
    support = {str(d): sum(t["digit"] == str(d) for t in templates) for d in range(10)}
    word, distances, margins, supported = "", [], [], True
    for bits in features:
        # 384-bit Hamming distance: the Rust equivalent is six u64 XOR/popcounts.
        classes = {}
        for template in templates:
            distance = (bits ^ template["bits"]).bit_count() / (FEATURE_W * FEATURE_H)
            classes[template["digit"]] = min(classes.get(template["digit"], 1.0), distance)
        ordered = sorted(classes.items(), key=lambda item: (item[1], item[0]))
        if len(ordered) < 2:
            return {"value": None, "distance": 1.0, "margin": 0.0, "supported": False}
        (digit, distance), (_, runner_up) = ordered[:2]
        word += digit
        distances.append(distance)
        margins.append(runner_up - distance)
        supported &= support[digit] >= 2
    return {"value": int(word), "distance": max(distances), "margin": min(margins), "supported": supported}


def accepted(prediction, threshold):
    return (prediction["value"] is not None and prediction["supported"]
            and prediction["distance"] <= threshold["maximumDistance"]
            and prediction["margin"] >= threshold["minimumMargin"])


def calibrate(rows):
    if not rows:
        raise ValueError("Independent calibration match required")
    candidates = []
    for distance in DISTANCES:
        for margin in MARGINS:
            threshold = {"maximumDistance": distance, "minimumMargin": margin}
            used = [r for r in rows if accepted(r["prediction"], threshold)]
            errors = sum(r["prediction"]["value"] != r["expected"] for r in used)
            if errors == 0:
                candidates.append({**threshold, "correct": len(used), "falseAccepts": errors})
    # Calibration error budget is zero observed errors, not a statistical
    # guarantee. Prefer stricter thresholds when calibration coverage is tied.
    if not candidates:
        return {"maximumDistance": 0, "minimumMargin": 1, "correct": 0, "falseAccepts": 0}
    return min(candidates, key=lambda c: (-c["correct"], c["maximumDistance"], -c["minimumMargin"]))


def summarize(rows, threshold, mode):
    correct = wrong = missing = fallback = 0
    details = []
    for row in rows:
        usable = accepted(row["prediction"], threshold)
        if mode == "tesseract":
            value = row["tesseract"]
        elif usable:
            value = row["prediction"]["value"]
        elif mode == "hybrid":
            value = row["tesseract"]
            fallback += 1
        else:
            value = None
        correct += value == row["expected"]
        wrong += value is not None and value != row["expected"]
        missing += value is None
        details.append({"caseId": row["caseId"], "fieldId": row["fieldId"], "expected": row["expected"],
                        "value": value, "prototypeAccepted": usable, "prediction": row["prediction"]})
    return {"fields": len(rows), "correct": correct, "falseAccepts": wrong, "missing": missing,
            "fallbackFields": fallback, "details": details}


def load_examples(cases_path, references_path):
    if cases_path.stat().st_size > 1024 * 1024 or references_path.stat().st_size > 1024 * 1024:
        raise ValueError("Dataset metadata exceeds budget")
    references = json.loads(references_path.read_text())["labels"]
    labels = {r["id"]: r for r in references}
    if len(labels) != len(references):
        raise ValueError("Duplicate references")
    match_splits, pixel_splits, examples, seen = {}, {}, [], set()
    cases = json.loads(cases_path.read_text())
    if not 1 <= len(cases) <= 100:
        raise ValueError("Expected 1..100 local frame cases")
    for case in cases:
        if not re.fullmatch(r"2026[a-z0-9]+_qm\d+-v\d+", case["id"]):
            raise ValueError("Explicit match/frame identity required")
        label = labels.get(case["id"])
        if label is None or case["id"] in seen:
            raise ValueError("Missing/duplicate case reference")
        seen.add(case["id"])
        split = label["split"]
        if split not in ["train", "calibration", "test"]:
            raise ValueError("Invalid split")
        raw_path = cases_path.parent / case["rawRgb"]
        if raw_path.stat().st_size > WIDTH * 720 * 3:
            raise ValueError("Frame exceeds pixel budget")
        raw = raw_path.read_bytes()
        if type(case["height"]) is not int or not 1 <= case["height"] <= 720 or len(raw) != WIDTH * case["height"] * 3:
            raise ValueError("RGB dimensions mismatch")
        if digest(raw) != label["sourceRgbSha256"]:
            raise ValueError("Pixel/reference identity mismatch")
        for mapping, identity in [(match_splits, case["id"].split("-v")[0]), (pixel_splits, digest(raw))]:
            if identity in mapping and mapping[identity] != split:
                raise ValueError("Match/pixels leak across splits")
            mapping[identity] = split
        field_ids = set()
        if not 1 <= len(case["fields"]) <= 8:
            raise ValueError("Expected 1..8 fields per frame")
        for field in case["fields"]:
            if field["id"] in field_ids:
                raise ValueError("Duplicate field identity")
            field_ids.add(field["id"])
            if field["kind"] not in ["fuel", "points"]:
                continue
            expected = label["values"][field["id"]]
            if type(expected) is not int or not 0 <= expected <= 9999:
                raise ValueError("Invalid independent digit reference")
            examples.append({"caseId": case["id"], "fieldId": field["id"], "field": field["kind"],
                             "split": split, "expected": expected, "sourceRgbSha256": digest(raw),
                             "raw": raw, "height": case["height"], "rect": field["rect"]})
    if set(match_splits.values()) != {"train", "calibration", "test"}:
        raise ValueError("All three match-level splits required")
    return examples


def tesseract_results(grid):
    groups = {}
    for row in grid["measurements"]:
        key = (row["caseId"], row["fieldId"])
        groups.setdefault(key, {})[(row["round"], row["scale"], row["psm"], row["padding"], row["stage"])] = row
    results = {}
    for key, rows in groups.items():
        values = []
        for round_index in [1, 2]:
            value = None
            for padding, stage in [(0, "primary"), (10, "normalizedGray"), (10, "binary")]:
                row = rows.get((round_index, 4, 7, padding, stage))
                if row is None:
                    raise ValueError("Incomplete Tesseract fallback grid")
                if row["confidentSyntax"]:
                    value = row["parsedValue"]
                    break
            values.append(value)
        results[key] = values[0] if values[0] == values[1] else None
    return results


def write_new(path, value):
    with path.open("x") as handle:
        json.dump(value, handle, indent=2)
        handle.write("\n")
    path.chmod(0o600)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cases", type=Path, required=True)
    parser.add_argument("--references", type=Path, required=True)
    parser.add_argument("--tesseract-grid", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    examples = load_examples(args.cases, args.references)
    args.output.mkdir(mode=0o700, parents=True, exist_ok=False)
    templates, rejected = build_model([r for r in examples if r["split"] == "train"])
    if args.tesseract_grid.stat().st_size > 32 * 1024 * 1024:
        raise ValueError("Fallback grid exceeds budget")
    grid = json.loads(args.tesseract_grid.read_text())
    fallback = tesseract_results(grid)
    grid_hashes = {(r["caseId"], r["fieldId"]): r["sourceRgbSha256"] for r in grid["measurements"]}
    evaluations = []
    for example in examples:
        if example["split"] == "train":
            continue
        key = (example["caseId"], example["fieldId"])
        if key not in fallback or grid_hashes[key] != example["sourceRgbSha256"]:
            raise ValueError("Fallback pixels or references do not match")
        started = time.perf_counter_ns()
        prediction = predict(example["raw"], example["height"], example["rect"], templates)
        evaluations.append({**{k: v for k, v in example.items() if k not in ["raw", "rect", "height"]},
                            "prediction": prediction, "tesseract": fallback[key],
                            "inferenceMicros": (time.perf_counter_ns() - started) / 1000})
    calibration = [r for r in evaluations if r["split"] == "calibration"]
    threshold = calibrate(calibration)
    model = {"version": "binary-digit-template-prototype-v1", "alphabet": "0123456789", "featureWidth": FEATURE_W,
             "featureHeight": FEATURE_H, "threshold": threshold,
             "classSupport": {str(d): sum(t["digit"] == str(d) for t in templates) for d in range(10)},
             "templates": [{**t, "bits": format(t["bits"], "096x")} for t in templates],
             "trainingRejections": rejected, "productionEnabled": False}
    # Save the trained model and calibration choice before computing test scores.
    write_new(args.output / "model.json", model)
    summary = {"modelSha256": digest((args.output / "model.json").read_bytes()),
               "referencesSha256": digest(args.references.read_bytes()), "gridSha256": digest(args.tesseract_grid.read_bytes()),
               "promoted": False, "splits": {},
               "limits": "Small agent-labeled pixel set; no independent double review. Fuel/points only. Zero calibration errors is not an accuracy guarantee. Python inference excludes video decoding and frame I/O. Hybrid work uses saved native fallback results, not a live integrated pipeline. No robot/HP attribution claim."}
    for split in ["calibration", "test"]:
        rows = [r for r in evaluations if r["split"] == split]
        times = sorted(r["inferenceMicros"] for r in rows)
        summary["splits"][split] = {"classifier": summarize(rows, threshold, "classifier"),
                                    "tesseract": summarize(rows, threshold, "tesseract"),
                                    "hybrid": summarize(rows, threshold, "hybrid"),
                                    "medianInferenceMicros": statistics.median(times),
                                    "p95InferenceMicros": times[math.ceil(len(times) * .95) - 1]}
    write_new(args.output / "evaluation.json", summary)
    print(json.dumps({"modelSha256": summary["modelSha256"], "templates": len(templates), "classSupport": model["classSupport"],
                      "threshold": threshold, "splits": {s: {k: {a: b for a, b in v.items() if a != "details"} if isinstance(v, dict) else v
                          for k, v in result.items()} for s, result in summary["splits"].items()}}))


if __name__ == "__main__":
    main()
