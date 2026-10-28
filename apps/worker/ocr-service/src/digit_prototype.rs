//! Experimental local CLI only. No model is loaded by the HTTP service.
use super::*;
use std::{fs::OpenOptions, os::unix::fs::OpenOptionsExt, path::Path};

const FW: usize = 16;
const FH: usize = 24;
type Bits = [u64; 6];

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawModel {
    version: String,
    alphabet: String,
    feature_width: usize,
    feature_height: usize,
    production_enabled: bool,
    threshold: Threshold,
    templates: Vec<RawTemplate>,
}
#[derive(Deserialize)]
struct RawTemplate {
    digit: String,
    bits: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Threshold {
    maximum_distance: f64,
    minimum_margin: f64,
}
struct Model {
    templates: Vec<(u8, Bits)>,
    threshold: Threshold,
}
#[derive(Serialize)]
struct Prediction {
    value: Option<u32>,
    distance: f64,
    margin: f64,
    supported: bool,
    accepted: bool,
}

fn parse_bits(text: &str) -> Result<Bits, String> {
    if text.len() != 96 || !text.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err("Expected exactly 384 encoded feature bits".into());
    }
    let mut bits = [0; 6];
    for (i, value) in bits.iter_mut().enumerate() {
        *value = u64::from_str_radix(&text[96 - (i + 1) * 16..96 - i * 16], 16)
            .map_err(|_| "Invalid feature bits")?;
    }
    Ok(bits)
}
impl Model {
    fn from_raw(raw: RawModel) -> Result<Self, String> {
        if raw.version != "binary-digit-template-prototype-v1"
            || raw.alphabet != "0123456789"
            || raw.feature_width != FW
            || raw.feature_height != FH
            || raw.production_enabled
            || !(20..=256).contains(&raw.templates.len())
            || !raw.threshold.maximum_distance.is_finite()
            || !(0.0..=1.0).contains(&raw.threshold.maximum_distance)
            || !raw.threshold.minimum_margin.is_finite()
            || !(0.0..=1.0).contains(&raw.threshold.minimum_margin)
        {
            return Err("Invalid bounded prototype model".into());
        }
        let mut seen = std::collections::HashSet::new();
        let mut support = [0usize; 10];
        let mut templates = Vec::new();
        for template in raw.templates {
            if template.digit.len() != 1 || !template.digit.as_bytes()[0].is_ascii_digit() {
                return Err("Prototype alphabet must be numeric".into());
            }
            let digit = template.digit.as_bytes()[0] - b'0';
            let bits = parse_bits(&template.bits)?;
            if !seen.insert(bits) {
                return Err("Duplicate or conflicting glyph features".into());
            }
            support[digit as usize] += 1;
            templates.push((digit, bits));
        }
        if support.iter().any(|n| *n < 2) {
            return Err("Every digit needs two distinct supervised templates".into());
        }
        Ok(Self {
            templates,
            threshold: raw.threshold,
        })
    }
    fn predict(&self, frame: &RgbImage, rect: Rect) -> Prediction {
        let rejected = || Prediction {
            value: None,
            distance: 1.0,
            margin: 0.0,
            supported: false,
            accepted: false,
        };
        let Some(features) = features(frame, rect) else {
            return rejected();
        };
        let mut value = 0;
        let mut distance: f64 = 0.0;
        let mut margin: f64 = 1.0;
        for bits in features {
            let mut classes = [u32::MAX; 10];
            for (digit, template) in &self.templates {
                let count: u32 = bits
                    .iter()
                    .zip(template)
                    .map(|(a, b)| (a ^ b).count_ones())
                    .sum();
                classes[*digit as usize] = classes[*digit as usize].min(count);
            }
            let mut order: Vec<_> = classes.iter().enumerate().map(|(i, n)| (*n, i)).collect();
            order.sort_unstable();
            let best = order[0].0 as f64 / (FW * FH) as f64;
            let second = order[1].0 as f64 / (FW * FH) as f64;
            value = value * 10 + order[0].1 as u32;
            distance = distance.max(best);
            margin = margin.min(second - best);
        }
        Prediction {
            value: Some(value),
            distance,
            margin,
            supported: true,
            accepted: distance <= self.threshold.maximum_distance
                && margin >= self.threshold.minimum_margin,
        }
    }
}

fn features(frame: &RgbImage, rect: Rect) -> Option<Vec<Bits>> {
    if !crop_available(frame, rect, 0) {
        return None;
    }
    let (x, y, width, height) = geometry(rect);
    let (w, h) = (width as usize, height as usize);
    let mut gray = Vec::with_capacity(w * h);
    let mut histogram = [0usize; 256];
    for row in y..y + height {
        for col in x..x + width {
            let offset = ((row * WIDTH + col) * 3) as usize;
            let rgb = &frame.as_raw()[offset..offset + 3];
            let value =
                ((77 * rgb[0] as u32 + 150 * rgb[1] as u32 + 29 * rgb[2] as u32) >> 8) as u8;
            gray.push(value);
            histogram[value as usize] += 1;
        }
    }
    let mut count = 0;
    let mut median = 255;
    for (value, n) in histogram.iter().enumerate() {
        count += n;
        if count > gray.len() / 2 {
            median = value as u32;
            break;
        }
    }
    let background = if median < 128 { 255 - median } else { median }.max(1);
    let mask: Vec<_> = gray
        .iter()
        .map(|v| {
            let value = if median < 128 {
                255 - *v as u32
            } else {
                *v as u32
            };
            (value * 255 / background).min(255) < 160
        })
        .collect();
    let mut runs: Vec<(usize, usize)> = Vec::new();
    for col in 0..w {
        if (0..h).filter(|row| mask[row * w + col]).count() < 2 {
            continue;
        }
        if let Some(last) = runs.last_mut()
            && last.1 == col
        {
            last.1 = col + 1;
        } else {
            runs.push((col, col + 1));
        }
    }
    if !(1..=4).contains(&runs.len()) {
        return None;
    }
    let mut result = Vec::new();
    for (left, right) in runs {
        let rows: Vec<_> = (0..h)
            .filter(|row| (left..right).any(|col| mask[row * w + col]))
            .collect();
        let top = *rows.first()?;
        let gh = rows.last()? - top + 1;
        let gw = right - left;
        if gh < 6 {
            return None;
        }
        let scale = ((FW - 2) as f64 / gw as f64).min((FH - 2) as f64 / gh as f64);
        let tw = ((gw as f64 * scale) as usize).max(1);
        let th = ((gh as f64 * scale) as usize).max(1);
        let (ox, oy) = ((FW - tw) / 2, (FH - th) / 2);
        let mut bits = [0; 6];
        for dy in 0..th {
            let sy = (((dy as f64 + 0.5) * gh as f64 / th as f64) as usize).min(gh - 1) + top;
            for dx in 0..tw {
                let sx = (((dx as f64 + 0.5) * gw as f64 / tw as f64) as usize).min(gw - 1) + left;
                if mask[sy * w + sx] {
                    let index = (oy + dy) * FW + ox + dx;
                    bits[index / 64] |= 1 << (index % 64);
                }
            }
        }
        result.push(bits);
    }
    Some(result)
}

fn tesseract(engine: &mut Engine, frame: &RgbImage, rect: Rect, kind: CropKind) -> Option<u32> {
    let (text, confidence) = engine.read(frame, rect, kind, 0);
    (confidence >= 85.0 && kind.accepts(&text))
        .then(|| fuel(&text))
        .flatten()
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Measurement {
    case_id: String,
    field_id: String,
    source_rgb_sha256: String,
    field: CropKind,
    round: usize,
    prediction: Prediction,
    baseline_value: Option<u32>,
    hybrid_value: Option<u32>,
    baseline_micros: u128,
    hybrid_micros: u128,
    classifier_micros: u128,
    baseline_calls: usize,
    hybrid_calls: usize,
}
pub(super) fn benchmark(model_path: &Path, input: &Path, output: &Path) -> Result<(), String> {
    let mut bytes = Vec::new();
    std::fs::File::open(model_path)
        .map_err(|_| "Missing prototype model")?
        .take(1024 * 1024 + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "Cannot read prototype model")?;
    if bytes.len() > 1024 * 1024 {
        return Err("Prototype model exceeds budget".into());
    }
    let model = Model::from_raw(serde_json::from_slice(&bytes).map_err(|_| "Invalid model JSON")?)?;
    let cases = field_benchmark::load_cases(input)?;
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(0o600)
        .open(output)
        .map_err(|_| "Output must be a new file")?;
    let mut baseline = Engine::new()?;
    let mut hybrid = Engine::new()?;
    let mut measurements = Vec::new();
    for round in 1..=2 {
        let mut order: Vec<_> = cases.iter().collect();
        if round == 2 {
            order.reverse();
        }
        for case in order {
            let (frame, hash) = field_benchmark::load_frame(case)?;
            for field in case
                .fields
                .iter()
                .filter(|f| matches!(f.kind, CropKind::Fuel | CropKind::Points))
            {
                let (before_baseline, before_hybrid) = (baseline.calls, hybrid.calls);
                let mut baseline_value = None;
                let mut baseline_micros = 0;
                if round == 1 {
                    let started = Instant::now();
                    baseline_value = tesseract(&mut baseline, &frame, field.rect, field.kind);
                    baseline_micros = started.elapsed().as_micros();
                }
                let started = Instant::now();
                let prediction = model.predict(&frame, field.rect);
                let classifier_micros = started.elapsed().as_micros();
                let hybrid_value = if prediction.accepted {
                    prediction.value
                } else {
                    tesseract(&mut hybrid, &frame, field.rect, field.kind)
                };
                let hybrid_micros = started.elapsed().as_micros();
                if round == 2 {
                    let started = Instant::now();
                    baseline_value = tesseract(&mut baseline, &frame, field.rect, field.kind);
                    baseline_micros = started.elapsed().as_micros();
                }
                measurements.push(Measurement {
                    case_id: case.id.clone(),
                    field_id: field.id.clone(),
                    source_rgb_sha256: hash.clone(),
                    field: field.kind,
                    round,
                    prediction,
                    baseline_value,
                    hybrid_value,
                    baseline_micros,
                    hybrid_micros,
                    classifier_micros,
                    baseline_calls: baseline.calls - before_baseline,
                    hybrid_calls: hybrid.calls - before_hybrid,
                });
            }
        }
    }
    serde_json::to_writer(&mut file, &serde_json::json!({ "runtime": baseline.runtime,
        "prototypeModelSha256": model_sha256(&bytes), "productionEnabled": false,
        "note": "Local crop comparison only. Models are never loaded by the HTTP path. Labels required separately.",
        "measurements": measurements })).map_err(|_| "Cannot write prototype benchmark")?;
    file.write_all(b"\n")
        .map_err(|_| "Cannot finish prototype benchmark")?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn features_reject_blank_and_unavailable_pixels() {
        let frame = RgbImage::from_pixel(WIDTH, 20, image::Rgb([255, 255, 255]));
        assert!(features(&frame, [0.1, 0.0, 0.05, 0.02]).is_none());
        assert!(features(&frame, [0.9, 0.0, 0.2, 0.1]).is_none());
        let bits = parse_bits(&format!("{:096x}", 1)).unwrap();
        assert_eq!(bits, [1, 0, 0, 0, 0, 0]);
        assert!(parse_bits("not-hex").is_err());
    }
    #[test]
    fn model_validation_requires_real_distinct_support_for_every_digit() {
        let raw = || RawModel {
            version: "binary-digit-template-prototype-v1".into(),
            alphabet: "0123456789".into(),
            feature_width: FW,
            feature_height: FH,
            production_enabled: false,
            threshold: Threshold {
                maximum_distance: 0.08,
                minimum_margin: 0.03,
            },
            templates: (0..20)
                .map(|i| RawTemplate {
                    digit: (i / 2).to_string(),
                    bits: format!("{:096x}", i + 1),
                })
                .collect(),
        };
        assert!(Model::from_raw(raw()).is_ok());
        let mut duplicate = raw();
        duplicate.templates[1].bits = duplicate.templates[0].bits.clone();
        assert!(Model::from_raw(duplicate).is_err());
        let mut missing = raw();
        missing.templates.pop();
        assert!(Model::from_raw(missing).is_err());
        let mut unsafe_model = raw();
        unsafe_model.production_enabled = true;
        assert!(Model::from_raw(unsafe_model).is_err());
        let mut invalid_threshold = raw();
        invalid_threshold.threshold.maximum_distance = f64::NAN;
        assert!(Model::from_raw(invalid_threshold).is_err());
    }
}
