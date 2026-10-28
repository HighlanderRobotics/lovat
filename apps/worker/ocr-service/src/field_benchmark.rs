//! Operator-only local benchmark. No HTTP endpoint or production tuning flag.
use super::*;
use std::{
    fs::OpenOptions,
    os::unix::fs::OpenOptionsExt,
    path::{Path, PathBuf},
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Case {
    pub(super) id: String,
    pub(super) raw_rgb: PathBuf,
    pub(super) height: u32,
    pub(super) fields: Vec<Field>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Field {
    pub(super) id: String,
    pub(super) rect: Rect,
    pub(super) kind: CropKind,
}
#[derive(Clone, Copy)]
struct Variant {
    scale: u32,
    psm: i32,
    padding: u32,
    stage: RecognitionStage,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Measurement {
    case_id: String,
    field_id: String,
    source_rgb_sha256: String,
    field: CropKind,
    round: usize,
    scale: u32,
    psm: i32,
    padding: u32,
    stage: RecognitionStage,
    text: String,
    parsed_value: Option<u32>,
    confidence: f64,
    confident_syntax: bool,
    elapsed_micros: u128,
}
pub(super) fn load_cases(input: &Path) -> Result<Vec<Case>, String> {
    let mut bytes = Vec::new();
    std::fs::File::open(input)
        .map_err(|_| "Missing benchmark cases")?
        .take(65537)
        .read_to_end(&mut bytes)
        .map_err(|_| "Cannot read cases")?;
    if bytes.len() > 65536 {
        return Err("Cases exceed budget".into());
    }
    let cases: Vec<Case> = serde_json::from_slice(&bytes).map_err(|_| "Invalid benchmark cases")?;
    if cases.is_empty() || cases.len() > 40 {
        return Err("Expected 1..40 cases".into());
    }
    let mut ids = std::collections::HashSet::new();
    for case in &cases {
        if case.id.is_empty()
            || case.id.len() > 80
            || !ids.insert(&case.id)
            || !(1..=HEIGHT).contains(&case.height)
            || case.fields.is_empty()
            || case.fields.len() > 8
        {
            return Err("Invalid case identity or dimensions".into());
        }
        let mut fields = std::collections::HashSet::new();
        if case.fields.iter().any(|f| {
            f.id.is_empty() || f.id.len() > 80 || !fields.insert(&f.id) || !valid_rect(f.rect)
        }) {
            return Err("Invalid field identity or geometry".into());
        }
    }
    Ok(cases)
}
pub(super) fn load_frame(case: &Case) -> Result<(RgbImage, String), String> {
    let length = (WIDTH * case.height * 3) as usize;
    let mut raw = Vec::new();
    std::fs::File::open(&case.raw_rgb)
        .map_err(|_| "Missing RGB frame")?
        .take((length + 1) as u64)
        .read_to_end(&mut raw)
        .map_err(|_| "Cannot read RGB frame")?;
    if raw.len() != length {
        return Err("RGB length/dimensions mismatch".into());
    }
    let hash = model_sha256(&raw);
    raw.resize(length + 64, 0);
    let frame = RgbImage::from_raw(WIDTH, case.height, raw).ok_or("Invalid RGB frame")?;
    Ok((frame, hash))
}
pub(super) fn run(input: &Path, output: &Path) -> Result<(), String> {
    let cases = load_cases(input)?;
    // Never replace a saved measurement or a reference label file.
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(0o600)
        .open(output)
        .map_err(|_| "Output must be a new file")?;
    let mut engine = Engine::new()?;
    let mut variants = Vec::new();
    for scale in [2, 3, 4] {
        for psm in [7, 8, 13] {
            for (padding, stage) in [
                (0, RecognitionStage::Primary),
                (10, RecognitionStage::Primary),
                (20, RecognitionStage::Primary),
                (10, RecognitionStage::NormalizedGray),
                (10, RecognitionStage::Binary),
            ] {
                variants.push(Variant {
                    scale,
                    psm,
                    padding,
                    stage,
                });
            }
        }
    }
    let mut measurements = Vec::new();
    for round in 1..=2 {
        let mut order: Vec<_> = cases.iter().collect();
        if round == 2 {
            order.reverse();
            variants.reverse();
        }
        for case in order {
            let (frame, source_hash) = load_frame(case)?;
            for field in &case.fields {
                for variant in &variants {
                    let started = Instant::now();
                    let mut crop = prepare_scaled(
                        &frame,
                        field.rect,
                        variant.padding,
                        &mut engine.scalers,
                        variant.scale,
                    )
                    .ok_or("Unavailable crop")?;
                    match variant.stage {
                        RecognitionStage::Primary => (),
                        RecognitionStage::NormalizedGray => {
                            normalize(&mut crop, variant.padding, false)
                        }
                        RecognitionStage::Binary => normalize(&mut crop, variant.padding, true),
                        RecognitionStage::Glyph => unreachable!(),
                    }
                    let (text, confidence) = engine.recognize(
                        &crop,
                        field.kind != CropKind::Text,
                        variant.psm,
                        field.kind,
                        variant.stage,
                    );
                    let elapsed_micros = started.elapsed().as_micros();
                    measurements.push(Measurement {
                        case_id: case.id.clone(),
                        field_id: field.id.clone(),
                        source_rgb_sha256: source_hash.clone(),
                        field: field.kind,
                        round,
                        scale: variant.scale,
                        psm: variant.psm,
                        padding: variant.padding,
                        stage: variant.stage,
                        confident_syntax: confidence >= 85.0 && field.kind.accepts(&text),
                        parsed_value: match field.kind {
                            CropKind::Clock => clock(&text),
                            CropKind::Fuel => fuel(&text),
                            CropKind::Points if field.kind.accepts(&text) => fuel(&text),
                            _ => None,
                        },
                        text,
                        confidence,
                        elapsed_micros,
                    });
                }
            }
        }
    }
    serde_json::to_writer(&mut file, &serde_json::json!({"runtime": engine.runtime,
        "note": "Independent reference labels required; confident syntax is not accuracy. Production settings unchanged.",
        "measurements": measurements})).map_err(|_| "Cannot write measurements")?;
    file.write_all(b"\n")
        .map_err(|_| "Cannot finish measurements")?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn local_benchmark_records_real_variants_and_never_overwrites_labels() {
        let dir = tempfile::tempdir().unwrap();
        let rgb = dir.path().join("blank.rgb");
        std::fs::write(&rgb, vec![255; (WIDTH * 20 * 3) as usize]).unwrap();
        let cases = dir.path().join("cases.json");
        let value = serde_json::json!([{"id":"synthetic-blank", "rawRgb":rgb,
            "height":20, "fields":[{"id":"fuel", "kind":"fuel", "rect":[0.1,0.0,0.02,0.02]}]}]);
        std::fs::write(&cases, value.to_string()).unwrap();
        let output = dir.path().join("measurements.json");
        run(&cases, &output).unwrap();
        let saved = std::fs::read(&output).unwrap();
        let result: serde_json::Value = serde_json::from_slice(&saved).unwrap();
        let rows = result["measurements"].as_array().unwrap();
        assert_eq!(rows.len(), 90);
        assert!(rows.iter().all(|r| r["confidentSyntax"] == false));
        assert!(rows.iter().any(|r| r["scale"] == 2 && r["psm"] == 13));
        assert!(run(&cases, &output).is_err());
        assert_eq!(std::fs::read(&output).unwrap(), saved);
        std::fs::write(&rgb, b"truncated").unwrap();
        assert!(
            run(&cases, &dir.path().join("bad-result.json"))
                .unwrap_err()
                .contains("RGB length")
        );
    }

    #[test]
    fn local_benchmark_rejects_reference_labels_and_invalid_field_geometry() {
        let dir = tempfile::tempdir().unwrap();
        let cases = dir.path().join("cases.json");
        let output = dir.path().join("output.json");
        let mut value = serde_json::json!([{"id":"case", "rawRgb":"unused", "height":20,
            "fields":[{"id":"clock", "kind":"clock", "rect":[0.1,0.0,0.02,0.02], "expectedValue":4}]}]);
        std::fs::write(&cases, value.to_string()).unwrap();
        assert!(run(&cases, &output).is_err());
        assert!(!output.exists());
        value[0]["fields"][0]
            .as_object_mut()
            .unwrap()
            .remove("expectedValue");
        value[0]["fields"][0]["rect"] = serde_json::json!([0.9, 0.0, 0.2, 0.2]);
        std::fs::write(&cases, value.to_string()).unwrap();
        assert!(run(&cases, &output).is_err());
        assert!(!output.exists());
    }
}
