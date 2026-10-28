use axum::{
    Json, Router,
    extract::{DefaultBodyLimit, Multipart, State},
    http::{HeaderMap, StatusCode},
    routing::{get, post},
};
use image::RgbImage;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    cell::RefCell,
    ffi::{CStr, c_char, c_int, c_void},
    io::{Read, Write},
    ops::Deref,
    process::{Command, Stdio},
    rc::Rc,
    sync::{Arc, Condvar, Mutex},
    time::{Duration, Instant},
};
use tokio::sync::Semaphore;

const LIMIT: usize = 96 * 1024 * 1024;
const WIDTH: u32 = 1280;
const HEIGHT: u32 = 720;
type Rect = [f64; 4];
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Layout {
    season: u16,
    version: String,
    red_fuel: Rect,
    blue_fuel: Rect,
    clock: Rect,
    #[serde(default)]
    red_points: Option<Rect>,
    #[serde(default)]
    blue_points: Option<Rect>,
    #[serde(default)]
    clock_alternatives: Vec<Rect>,
    teams: Vec<Rect>,
    match_label: Rect,
    #[serde(default)]
    alternatives: Vec<Layout>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Request {
    template: Layout,
    expected_teams: Vec<u32>,
    expected_match_label: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Observation {
    time: u32,
    red: u32,
    blue: u32,
    confidence: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    red_points: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    blue_points: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    points_confidence: Option<f64>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Output {
    observations: Vec<Observation>,
    channels: Channels,
    layout_version: String,
    elapsed_ms: u128,
    frames: usize,
    profile: Profile,
    runtime: RuntimeIdentity,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeIdentity {
    tesseract_version: String,
    language: String,
    model_sha256: String,
}
fn model_sha256(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
fn expected_model_matches(actual: &str, expected: Option<&str>) -> bool {
    expected.is_none_or(|value| {
        value.len() == 64
            && value.bytes().all(|b| b.is_ascii_hexdigit())
            && value.eq_ignore_ascii_case(actual)
    })
}
#[derive(Clone, Copy, Default)]
struct RecognitionStats {
    calls: usize,
    confident_syntax: usize,
    elapsed_micros: u128,
}
#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
enum RecognitionStage {
    Primary,
    NormalizedGray,
    Binary,
    Glyph,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FieldRecognition {
    field: CropKind,
    stage: RecognitionStage,
    calls: usize,
    confident_syntax: usize,
    elapsed_micros: u128,
}
#[derive(Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct Profile {
    probe_ms: u128,
    decoder_read_wait_ms: u128,
    identity_ms: u128,
    clock_ms: u128,
    counter_ms: u128,
    recognition_ms: u128,
    recognition_calls: usize,
    cache_hits: usize,
    frame_allocations: usize,
    frame_buffer_bytes: usize,
    fields: Vec<FieldRecognition>,
}
type FramePool = Rc<RefCell<Option<Vec<u8>>>>;
struct FrameBuffer {
    image: Option<RgbImage>,
    pool: FramePool,
}
impl Deref for FrameBuffer {
    type Target = RgbImage;
    fn deref(&self) -> &RgbImage {
        self.image.as_ref().expect("Live frame buffer")
    }
}
impl Drop for FrameBuffer {
    fn drop(&mut self) {
        if let Some(image) = self.image.take() {
            let mut pool = self.pool.borrow_mut();
            // Keep only one spare; queued identity frames retain ownership and
            // return it on normal completion, early continues, and errors.
            if pool.is_none() {
                *pool = Some(image.into_raw());
            }
        }
    }
}
#[derive(Default, Serialize)]
struct Channels {
    red: Vec<ChannelObservation>,
    blue: Vec<ChannelObservation>,
}
#[derive(Debug, PartialEq, Serialize)]
struct ChannelObservation {
    time: u32,
    count: u32,
    confidence: f64,
}
// Keep an observed alliance even when the other counter is unreadable.
// Duplicate clock-zero frames obey the same settling rule as the paired series.
fn retain_channel(
    samples: &mut Vec<ChannelObservation>,
    time: u32,
    text: &str,
    confidence: f64,
    settling: bool,
) {
    let Some(count) = fuel(text) else {
        return;
    };
    if confidence < 85.0 || samples.last().is_some_and(|s| time < s.time) {
        return;
    }
    if let Some(previous) = samples.last()
        && time == previous.time
    {
        if !settling || count < previous.count {
            return;
        }
        samples.pop();
    }
    samples.push(ChannelObservation {
        time,
        count,
        confidence,
    });
}
#[derive(Clone)]
struct App {
    token: Arc<String>,
    slots: Arc<Semaphore>,
}

unsafe extern "C" {
    fn TessVersion() -> *const c_char;
    fn TessBaseAPIGetDatapath(api: *mut c_void) -> *const c_char;
    fn TessBaseAPICreate() -> *mut c_void;
    fn TessBaseAPIDelete(api: *mut c_void);
    fn TessBaseAPIInit3(api: *mut c_void, path: *const c_char, lang: *const c_char) -> c_int;
    fn TessBaseAPISetPageSegMode(api: *mut c_void, mode: c_int);
    fn TessBaseAPIClearAdaptiveClassifier(api: *mut c_void);
    fn TessBaseAPISetImage(
        api: *mut c_void,
        image: *const u8,
        width: c_int,
        height: c_int,
        bpp: c_int,
        stride: c_int,
    );
    fn TessBaseAPISetVariable(api: *mut c_void, name: *const c_char, value: *const c_char)
    -> c_int;
    fn TessBaseAPIGetTsvText(api: *mut c_void, page: c_int) -> *mut c_char;
    fn TessDeleteText(text: *mut c_char);
}
unsafe extern "C" {
    fn sws_getContext(
        sw: c_int,
        sh: c_int,
        sf: c_int,
        dw: c_int,
        dh: c_int,
        df: c_int,
        flags: c_int,
        src_filter: *const c_void,
        dst_filter: *const c_void,
        param: *const f64,
    ) -> *mut c_void;
    fn sws_scale(
        ctx: *mut c_void,
        src: *const *const u8,
        stride: *const c_int,
        y: c_int,
        h: c_int,
        dst: *const *mut u8,
        dst_stride: *const c_int,
    ) -> c_int;
    fn sws_freeContext(ctx: *mut c_void);
}
#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
enum CropKind {
    Text,
    Fuel,
    Points,
    Clock,
}
impl CropKind {
    fn accepts(self, text: &str) -> bool {
        match self {
            Self::Text => !text.is_empty(),
            Self::Fuel => fuel(text).is_some(),
            Self::Points => !text.contains('/') && fuel(text).is_some(),
            Self::Clock => clock(text).is_some(),
        }
    }
}
type CropKey = (u32, u32, u32, u32, CropKind, u32);
type CachedCrop = (Vec<u8>, Vec<u8>, (String, f64));
struct Engine {
    api: *mut c_void,
    cache: std::collections::HashMap<CropKey, CachedCrop>,
    scalers: Scalers,
    calls: usize,
    hits: usize,
    recognition_time: Duration,
    field_stats: [[RecognitionStats; 4]; 4],
    runtime: RuntimeIdentity,
}
impl Drop for Engine {
    fn drop(&mut self) {
        unsafe { TessBaseAPIDelete(self.api) }
    }
}
impl Engine {
    fn new() -> Result<Self, String> {
        unsafe {
            let mut engine = Self {
                api: TessBaseAPICreate(),
                cache: Default::default(),
                scalers: Default::default(),
                calls: 0,
                hits: 0,
                recognition_time: Duration::ZERO,
                field_stats: [[RecognitionStats::default(); 4]; 4],
                runtime: RuntimeIdentity {
                    tesseract_version: String::new(),
                    language: "eng".into(),
                    model_sha256: String::new(),
                },
            };
            if engine.api.is_null() {
                return Err("Cannot allocate OCR engine".into());
            }
            if TessBaseAPIInit3(engine.api, std::ptr::null(), c"eng".as_ptr()) != 0 {
                return Err("Cannot initialize OCR engine".into());
            }
            let path = TessBaseAPIGetDatapath(engine.api);
            let version = TessVersion();
            if path.is_null() || version.is_null() {
                return Err("Cannot identify OCR engine model".into());
            }
            let model_path =
                std::path::PathBuf::from(CStr::from_ptr(path).to_string_lossy().into_owned())
                    .join("eng.traineddata");
            let file =
                std::fs::File::open(model_path).map_err(|_| "Cannot read OCR engine model")?;
            let mut bytes = Vec::new();
            file.take(64 * 1024 * 1024 + 1)
                .read_to_end(&mut bytes)
                .map_err(|_| "Cannot read OCR engine model")?;
            if bytes.len() > 64 * 1024 * 1024 {
                return Err("Cannot verify oversized OCR engine model".into());
            }
            let hash = model_sha256(&bytes);
            let expected = std::env::var("OCR_EXPECTED_MODEL_SHA256").ok();
            if !expected_model_matches(&hash, expected.as_deref()) {
                return Err("OCR engine model hash mismatch".into());
            }
            engine.runtime = RuntimeIdentity {
                tesseract_version: CStr::from_ptr(version).to_string_lossy().into_owned(),
                language: "eng".into(),
                model_sha256: hash,
            };
            TessBaseAPISetPageSegMode(engine.api, 7);
            TessBaseAPISetVariable(engine.api, c"debug_file".as_ptr(), c"/dev/null".as_ptr());
            Ok(engine)
        }
    }
    fn recognize(
        &mut self,
        prepared: &Prepared,
        numeric: bool,
        psm: i32,
        field: CropKind,
        stage: RecognitionStage,
    ) -> (String, f64) {
        let started = Instant::now();
        let result = self.recognize_inner(prepared, numeric, psm);
        let elapsed = started.elapsed();
        self.recognition_time += elapsed;
        let stats = &mut self.field_stats[field as usize][stage as usize];
        stats.calls += 1;
        stats.confident_syntax += usize::from(result.1 >= 85.0 && field.accepts(&result.0));
        stats.elapsed_micros += elapsed.as_micros();
        result
    }
    fn recognize_inner(&mut self, prepared: &Prepared, numeric: bool, psm: i32) -> (String, f64) {
        self.calls += 1;
        unsafe {
            TessBaseAPIClearAdaptiveClassifier(self.api);
            TessBaseAPISetPageSegMode(self.api, psm);
            TessBaseAPISetVariable(
                self.api,
                c"tessedit_char_whitelist".as_ptr(),
                if psm == 10 {
                    c"0123456789".as_ptr()
                } else {
                    c"".as_ptr()
                },
            );
            TessBaseAPISetImage(
                self.api,
                prepared.image.as_ptr(),
                prepared.width as i32,
                prepared.height as i32,
                1,
                prepared.stride as i32,
            );
            let ptr = TessBaseAPIGetTsvText(self.api, 0);
            if ptr.is_null() {
                return (String::new(), 0.0);
            }
            let result = parse_tsv(&CStr::from_ptr(ptr).to_string_lossy(), numeric);
            TessDeleteText(ptr);
            result
        }
    }
    fn read(
        &mut self,
        frame: &RgbImage,
        rect: Rect,
        kind: CropKind,
        padding: u32,
    ) -> (String, f64) {
        if !crop_available(frame, rect, padding) {
            return (String::new(), 0.0);
        }
        let (x, y, w, h) = geometry(rect);
        let key = (x, y, w, h, kind, padding);
        let numeric = kind != CropKind::Text;
        // Compare exact source RGB bytes before allocating/scaling the crop.
        // A one-pixel change invalidates recognition; no fuzzy digit caching.
        let rows = || {
            (y..y + h).map(|row| {
                let start = ((row * WIDTH + x) * 3) as usize;
                &frame.as_raw()[start..start + (w * 3) as usize]
            })
        };
        if let Some((pixels, _, result)) = self.cache.get(&key)
            && rows()
                .zip(pixels.chunks_exact((w * 3) as usize))
                .all(|(a, b)| a == b)
        {
            self.hits += 1;
            return result.clone();
        }
        let pixels = rows().flatten().copied().collect();
        let Some(original) = prepare_with(frame, rect, padding, &mut self.scalers) else {
            return (String::new(), 0.0);
        };
        // RGB noise can disappear during grayscale conversion. Preserve the
        // original exact-gray cache too, so the earlier check never adds OCR work.
        if let Some((source, prepared_pixels, result)) = self.cache.get_mut(&key)
            && *prepared_pixels == original.image
        {
            *source = pixels;
            self.hits += 1;
            return result.clone();
        }
        let mut best = self.recognize(&original, numeric, 7, kind, RecognitionStage::Primary);
        let valid = |r: &(String, f64)| r.1 >= 85.0 && kind.accepts(&r.0);
        if !valid(&best) {
            for binary in [false, true] {
                let Some(mut recovered) = prepare_with(frame, rect, 10, &mut self.scalers) else {
                    continue;
                };
                normalize(&mut recovered, 10, binary);
                let candidate = self.recognize(
                    &recovered,
                    numeric,
                    7,
                    kind,
                    if binary {
                        RecognitionStage::Binary
                    } else {
                        RecognitionStage::NormalizedGray
                    },
                );
                if valid(&candidate) || candidate.1 > best.1 {
                    best = candidate;
                }
                if valid(&best) {
                    break;
                }
            }
        }
        self.cache
            .insert(key, (pixels, original.image, best.clone()));
        best
    }
    fn team(&mut self, frame: &RgbImage, rect: Rect, expected: &[u32]) -> Option<u32> {
        let (text, confidence) = self.read(frame, rect, CropKind::Text, 0);
        if confidence >= 85.0
            && let Ok(number) = text.parse::<u32>()
            && expected.contains(&number)
        {
            return Some(number);
        }
        // Isolate glyphs when the word model mistakes a narrow 1 for punctuation.
        // This is used for roster identity only, never to invent a score reading.
        let mut prepared = prepare_with(frame, rect, 0, &mut self.scalers)?;
        normalize(&mut prepared, 0, false);
        let groups = glyphs(&prepared);
        if groups.is_empty() || groups.len() > 5 {
            return None;
        }
        let mut digits = String::new();
        for glyph in groups {
            if narrow_one(&glyph) {
                digits.push('1');
                continue;
            }
            let (text, confidence) =
                self.recognize(&glyph, true, 10, CropKind::Text, RecognitionStage::Glyph);
            if confidence < 85.0 || text.len() != 1 || !text.bytes().all(|c| c.is_ascii_digit()) {
                return None;
            }
            digits.push_str(&text);
        }
        digits.parse().ok()
    }
}
struct Prepared {
    image: Vec<u8>,
    width: u32,
    height: u32,
    stride: u32,
}
struct Scaler(*mut c_void);
impl Drop for Scaler {
    fn drop(&mut self) {
        unsafe { sws_freeContext(self.0) }
    }
}
type Scalers = std::collections::HashMap<(u32, u32), Scaler>;
#[cfg(test)]
fn prepare(frame: &RgbImage, rect: Rect, padding: u32) -> Option<Prepared> {
    prepare_with(frame, rect, padding, &mut Scalers::new())
}
fn prepare_with(
    frame: &RgbImage,
    rect: Rect,
    padding: u32,
    scalers: &mut Scalers,
) -> Option<Prepared> {
    if !crop_available(frame, rect, padding) {
        return None;
    }
    let (x, y, w, h) = geometry(rect);
    let width = w * 4 + padding * 2;
    let height = h * 4 + padding * 2;
    let stride = (width + 127) & !63;
    let mut image = vec![255u8; (stride * height + 64) as usize];
    // Use the same bicubic RGB-to-gray scaler as the CLI reference. Cropping
    // before conversion matters for small colored text at the clock edge.
    unsafe {
        let scaler = scalers.entry((w, h)).or_insert_with(|| {
            Scaler(sws_getContext(
                w as i32,
                h as i32,
                2,
                (w * 4) as i32,
                (h * 4) as i32,
                8,
                4,
                std::ptr::null(),
                std::ptr::null(),
                std::ptr::null(),
            ))
        });
        let context = scaler.0;
        if context.is_null() {
            return None;
        }
        let src = [
            frame.as_ptr().add(((y * WIDTH + x) * 3) as usize),
            std::ptr::null(),
            std::ptr::null(),
            std::ptr::null(),
        ];
        let src_stride = [(WIDTH * 3) as i32, 0, 0, 0];
        let dst = [
            image
                .as_mut_ptr()
                .add((padding * stride + padding) as usize),
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            std::ptr::null_mut(),
        ];
        let dst_stride = [stride as i32, 0, 0, 0];
        let scaled = sws_scale(
            context,
            src.as_ptr(),
            src_stride.as_ptr(),
            0,
            h as i32,
            dst.as_ptr(),
            dst_stride.as_ptr(),
        );
        if scaled != (h * 4) as i32 {
            return None;
        }
    }
    // SIMD scaling can write past the visible row width into alignment
    // bytes. Restore the white border after scaling, then pass its real stride.
    if padding > 0 {
        for row in 0..height {
            let offset = (row * stride) as usize;
            if row < padding || row >= height - padding {
                image[offset..offset + width as usize].fill(255);
            } else {
                image[offset..offset + padding as usize].fill(255);
                image[offset + (width - padding) as usize..offset + width as usize].fill(255);
            }
        }
    }
    // Aligned scaler writes outside the visible row are not OCR pixels.
    // Clear them so reused scaler buffers are deterministic as well.
    for row in 0..height {
        image[(row * stride + width) as usize..((row + 1) * stride) as usize].fill(255);
    }
    image[(stride * height) as usize..].fill(255);
    Some(Prepared {
        image,
        width,
        height,
        stride,
    })
}
// Normalize only the crop interior; preserve a white OCR border.
fn normalize(p: &mut Prepared, padding: u32, binary: bool) {
    let mut histogram = [0usize; 256];
    for y in padding..p.height - padding {
        for x in padding..p.width - padding {
            histogram[p.image[(y * p.stride + x) as usize] as usize] += 1;
        }
    }
    let total: usize = histogram.iter().sum();
    let mut n = 0;
    let mut median = 255;
    for (value, count) in histogram.iter().enumerate() {
        n += count;
        if n >= total / 2 {
            median = value;
            break;
        }
    }
    for y in padding..p.height - padding {
        for x in padding..p.width - padding {
            let index = (y * p.stride + x) as usize;
            let v = if median < 128 {
                255 - p.image[index]
            } else {
                p.image[index]
            };
            let background = if median < 128 { 255 - median } else { median };
            let v = ((v as usize * 255) / background.max(1)).min(255) as u8;
            p.image[index] = if binary {
                if v < 160 { 0 } else { 255 }
            } else {
                v
            };
        }
    }
}
fn glyphs(p: &Prepared) -> Vec<Prepared> {
    let mut runs: Vec<(u32, u32)> = Vec::new();
    for x in 0..p.width {
        let count = (0..p.height)
            .filter(|y| p.image[(y * p.stride + x) as usize] < 130)
            .count();
        if count < 3 {
            continue;
        }
        if let Some(last) = runs.last_mut()
            && x == last.1
        {
            last.1 = x + 1;
            continue;
        }
        runs.push((x, x + 1));
    }
    runs.into_iter()
        .filter_map(|(left, right)| {
            let rows: Vec<_> = (0..p.height)
                .filter(|y| (left..right).any(|x| p.image[(y * p.stride + x) as usize] < 130))
                .collect();
            let top = *rows.first()?;
            let bottom = rows.last()? + 1;
            if bottom - top < 16 || right - left < 2 {
                return None;
            }
            let width = right - left + 20;
            let height = bottom - top + 20;
            let stride = (width + 63) & !63;
            let mut image = vec![255; (stride * height + 64) as usize];
            for y in top..bottom {
                for x in left..right {
                    image[((y - top + 10) * stride + x - left + 10) as usize] =
                        p.image[(y * p.stride + x) as usize];
                }
            }
            Some(Prepared {
                image,
                width,
                height,
                stride,
            })
        })
        .collect()
}
fn narrow_one(p: &Prepared) -> bool {
    let w = p.width - 20;
    let h = p.height - 20;
    if w * 100 > h * 42 || h < 16 {
        return false;
    }
    // A one must have a near-continuous vertical stem, not just a narrow blob.
    (10..p.width - 10).any(|x| {
        (10..p.height - 10)
            .filter(|y| p.image[(y * p.stride + x) as usize] < 130)
            .count()
            * 100
            >= h as usize * 80
    })
}
fn geometry(r: Rect) -> (u32, u32, u32, u32) {
    // FFmpeg crop on grayscale has no chroma subsampling constraints.
    (
        (r[0] * WIDTH as f64).round() as u32,
        (r[1] * HEIGHT as f64).round() as u32,
        (r[2] * WIDTH as f64).round() as u32,
        (r[3] * HEIGHT as f64).round() as u32,
    )
}
fn crop_available(frame: &RgbImage, rect: Rect, padding: u32) -> bool {
    if !valid_rect(rect)
        || frame.width() != WIDTH
        || !(1..=HEIGHT).contains(&frame.height())
        || padding > 20
    {
        return false;
    }
    // Rectangles retain their original 720p coordinates even in a compact band.
    let (_, y, _, h) = geometry(rect);
    y + h <= frame.height()
}
fn decoded_height(template: &Layout) -> u32 {
    // Crop only after full-frame scaling and RGB conversion. Keep coordinates
    // unchanged, including alternate layouts/clock positions and SIMD guard rows.
    std::iter::once(template)
        .chain(template.alternatives.iter())
        .flat_map(|layout| {
            [
                Some(layout.red_fuel),
                Some(layout.blue_fuel),
                Some(layout.clock),
                Some(layout.match_label),
                layout.red_points,
                layout.blue_points,
            ]
            .into_iter()
            .flatten()
            .chain(layout.teams.iter().copied())
            .chain(layout.clock_alternatives.iter().copied())
        })
        .map(|r| {
            let (_, y, _, h) = geometry(r);
            y + h
        })
        .max()
        .unwrap_or(HEIGHT)
        .saturating_add(16)
        .min(HEIGHT)
}
fn valid_rect(r: Rect) -> bool {
    r.iter().all(|v| v.is_finite())
        && r[0] >= 0.0
        && r[1] >= 0.0
        && r[2] > 0.0
        && r[3] > 0.0
        && r[0] + r[2] <= 1.0000001
        && r[1] + r[3] <= 1.0000001
        && geometry(r).2 > 0
        && geometry(r).3 > 0
        && geometry(r).0 + geometry(r).2 <= WIDTH
        && geometry(r).1 + geometry(r).3 <= HEIGHT
}
fn valid_layout(l: &Layout) -> bool {
    l.season == 2026
        && !l.version.is_empty()
        && l.version.len() <= 80
        && l.teams.len() == 6
        && l.teams
            .iter()
            .chain([&l.red_fuel, &l.blue_fuel, &l.clock, &l.match_label])
            .all(|r| valid_rect(*r))
        && l.red_points.is_some() == l.blue_points.is_some()
        && l.red_points
            .iter()
            .chain(l.blue_points.iter())
            .all(|r| valid_rect(*r))
        && l.clock_alternatives.len() <= 3
        && l.clock_alternatives.iter().all(|r| valid_rect(*r))
        && l.alternatives.len() <= 3
        && l.alternatives
            .iter()
            .all(|a| a.alternatives.is_empty() && valid_layout(a))
}
fn parse_tsv(tsv: &str, numeric: bool) -> (String, f64) {
    let mut words = Vec::new();
    let mut confidence: f64 = 100.0;
    for line in tsv.lines().skip(1) {
        let cells: Vec<_> = line.split('\t').collect();
        if cells.len() < 12 {
            continue;
        }
        let text = cells[11].trim();
        if text.is_empty()
            || (numeric
                && !text
                    .chars()
                    .all(|c| c.is_ascii_digit() || c == '/' || c == ':'))
        {
            continue;
        }
        let c = cells[10].parse::<f64>().unwrap_or(0.0);
        if !c.is_finite() {
            return (String::new(), 0.0);
        }
        confidence = confidence.min(c);
        words.push(text);
    }
    if words.is_empty() {
        (String::new(), 0.0)
    } else {
        (words.join(" "), confidence)
    }
}
fn fuel(s: &str) -> Option<u32> {
    let mut parts = s.split('/');
    let n = parts.next()?.trim();
    if n.is_empty() || n.len() > 4 || !n.bytes().all(|c| c.is_ascii_digit()) {
        return None;
    }
    if let Some(denom) = parts.next() {
        let d = denom.trim();
        if d.is_empty() || d.len() > 4 || !d.bytes().all(|c| c.is_ascii_digit()) {
            return None;
        }
    }
    if parts.next().is_some() {
        return None;
    }
    n.parse().ok()
}
fn clock(s: &str) -> Option<u32> {
    let p: Vec<_> = s.trim().split(':').collect();
    let digits = |text: &str| !text.is_empty() && text.bytes().all(|b| b.is_ascii_digit());
    let seconds = match p.as_slice() {
        [s] if s.len() <= 3 && digits(s) => s.parse().ok()?,
        [m, s] if m.len() == 1 && s.len() == 2 && digits(m) && digits(s) => {
            let seconds = s.parse::<u32>().ok()?;
            if seconds >= 60 {
                return None;
            }
            m.parse::<u32>().ok()? * 60 + seconds
        }
        _ => return None,
    };
    (seconds <= 140).then_some(seconds)
}
fn choose_clock(readings: Vec<(String, f64)>) -> (String, f64) {
    let mut valid: Vec<_> = readings
        .into_iter()
        .filter(|(text, c)| c.is_finite() && *c >= 85.0 && clock(text).is_some_and(|s| s <= 140))
        .collect();
    if valid.is_empty() || valid.iter().any(|r| clock(&r.0) != clock(&valid[0].0)) {
        return (String::new(), 0.0);
    }
    valid.sort_by(|a, b| b.1.total_cmp(&a.1));
    valid.remove(0)
}
fn canonical(s: &str) -> String {
    s.chars()
        .filter(|c| !c.is_whitespace())
        .flat_map(char::to_lowercase)
        .collect()
}
// A watchdog kills a blocked decoder even while the consumer is reading stdout.
#[derive(Default, Clone)]
struct ClockTracker {
    origin: Option<i32>,
    teleop: bool,
}
impl ClockTracker {
    fn finished(&self, frame: usize) -> bool {
        self.teleop
            && self
                .origin
                .is_some_and(|origin| frame as i32 - origin > 166)
    }
    fn time(&mut self, seconds: u32, confidence: f64, frame: usize) -> Option<u32> {
        if !confidence.is_finite() || confidence < 85.0 || seconds > 140 {
            return None;
        }
        if self.origin.is_none() && !self.teleop && frame <= 30 && seconds <= 20 {
            self.origin = Some(frame as i32 - (20 - seconds) as i32);
        }
        let elapsed = frame as i32 - self.origin?;
        // The long clock uniquely identifies teleop. Check elapsed video time rather
        // than requiring OCR to see the exact last second of autonomous.
        if !self.teleop
            && (135..=140).contains(&seconds)
            && (elapsed - (163 - seconds) as i32).abs() <= 3
        {
            self.teleop = true;
        }
        let time = if self.teleop {
            163 - seconds
        } else if seconds <= 20 {
            20 - seconds
        } else {
            return None;
        };
        if (time as i32 - elapsed).abs() > 3 {
            None
        } else {
            Some(time)
        }
    }
}
struct Decoder {
    state: Arc<(Mutex<(std::process::Child, bool)>, Condvar)>,
    watchdog: Option<std::thread::JoinHandle<()>>,
}
impl Decoder {
    fn new(child: std::process::Child, budget: Duration) -> Self {
        let state = Arc::new((Mutex::new((child, false)), Condvar::new()));
        let watched = state.clone();
        let watchdog = std::thread::spawn(move || {
            let (lock, signal) = &*watched;
            let guard = lock.lock().unwrap();
            let (mut guard, timeout) = signal.wait_timeout_while(guard, budget, |s| !s.1).unwrap();
            if timeout.timed_out() && !guard.1 {
                let _ = guard.0.kill();
            }
        });
        Self {
            state,
            watchdog: Some(watchdog),
        }
    }
    fn stdout(&self) -> Option<std::process::ChildStdout> {
        self.state.0.lock().unwrap().0.stdout.take()
    }
    fn wait(&self) -> Result<std::process::ExitStatus, String> {
        loop {
            if let Some(status) = self
                .state
                .0
                .lock()
                .unwrap()
                .0
                .try_wait()
                .map_err(|_| "Decoder failed")?
            {
                return Ok(status);
            }
            std::thread::sleep(Duration::from_millis(10));
        }
    }
}
impl Drop for Decoder {
    fn drop(&mut self) {
        {
            let mut state = self.state.0.lock().unwrap();
            state.1 = true;
            let _ = state.0.kill();
            let _ = state.0.wait();
        }
        self.state.1.notify_all();
        if let Some(thread) = self.watchdog.take() {
            let _ = thread.join();
        }
    }
}
fn identity_matches(
    engine: &mut Engine,
    frame: &RgbImage,
    layout: &Layout,
    expected: &[u32],
    label: &str,
) -> bool {
    // The cheap label gate rejects an incompatible layout before six roster
    // reads. A successful identity still needs the label and all six robots.
    let (text, confidence) = engine.read(frame, layout.match_label, CropKind::Text, 0);
    if confidence < 85.0 || canonical(&text) != canonical(label) {
        return false;
    }
    let mut teams = Vec::new();
    for rect in &layout.teams {
        let Some(number) = engine.team(frame, *rect, expected) else {
            return false;
        };
        if teams.contains(&number) {
            return false;
        }
        teams.push(number);
    }
    if teams.len() != 6 || !expected.iter().all(|team| teams.contains(team)) {
        return false;
    }
    true
}
fn extract(path: &std::path::Path, request: Request) -> Result<Output, String> {
    let start = Instant::now();
    let mut profile = Profile::default();
    let probe = Command::new("ffprobe")
        .args([
            "-v",
            "quiet",
            "-protocol_whitelist",
            "file,pipe",
            "-format_whitelist",
            "mov,matroska,webm",
            "-show_format",
            "-of",
            "json",
        ])
        .arg(path)
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| "Cannot probe video")?;
    let probe = Decoder::new(probe, Duration::from_secs(5));
    let mut meta = Vec::new();
    probe
        .stdout()
        .ok_or("Missing probe output")?
        .take(65536)
        .read_to_end(&mut meta)
        .map_err(|_| "Probe failed")?;
    if !probe.wait()?.success() {
        return Err("Invalid video".into());
    }
    let info: serde_json::Value = serde_json::from_slice(&meta).map_err(|_| "Invalid video")?;
    let duration = info["format"]["duration"]
        .as_str()
        .and_then(|s| s.parse::<f64>().ok())
        .ok_or("Missing video duration")?;
    if !duration.is_finite() || duration > 600.0 || duration <= 0.0 {
        return Err("Video exceeds OCR budget".into());
    }
    profile.probe_ms = start.elapsed().as_millis();
    let decoded_height = decoded_height(&request.template);
    let frame_bytes = (WIDTH * decoded_height * 3) as usize;
    profile.frame_buffer_bytes = frame_bytes + 64;
    let filters = format!("fps=1,scale=1280:720,format=rgb24,crop=1280:{decoded_height}:0:0");
    let child = Command::new("ffmpeg")
        .args([
            "-nostdin",
            "-protocol_whitelist",
            "file,pipe",
            "-format_whitelist",
            "mov,matroska,webm",
            "-v",
            "error",
            "-threads",
            "1",
            "-filter_threads",
            "1",
            "-i",
        ])
        .arg(path)
        .args([
            "-vf",
            &filters,
            "-frames:v",
            "600",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "rgb24",
            "pipe:1",
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| "Cannot decode video")?;
    let decoder = Decoder::new(child, Duration::from_secs(480));
    let mut stdout = decoder.stdout().ok_or("Missing decoder output")?;
    let mut engine = Engine::new()?;
    let mut confirmed = vec![0; 1 + request.template.alternatives.len()];
    let layouts: Vec<_> = std::iter::once(&request.template)
        .chain(request.template.alternatives.iter())
        .collect();
    let mut selected = None;
    let mut observations: Vec<Observation> = Vec::new();
    let mut channels = Channels::default();
    let mut clock_tracker = ClockTracker::default();
    let mut frames = 0;
    let mut pending = std::collections::VecDeque::new();
    let frame_pool: FramePool = Rc::new(RefCell::new(None));
    let mut end_reached = false;
    loop {
        if pending.is_empty() && clock_tracker.finished(frames + 1) {
            end_reached = true;
            break;
        }
        if start.elapsed() > Duration::from_secs(480) {
            return Err("OCR exceeded processing budget".into());
        }
        let verifying = selected.is_none();
        let (frame_index, frame) = if selected.is_some() && !pending.is_empty() {
            pending.pop_front().unwrap()
        } else {
            let reading_started = Instant::now();
            let mut bytes = frame_pool.borrow_mut().take().unwrap_or_else(|| {
                profile.frame_allocations += 1;
                vec![0u8; frame_bytes + 64]
            });
            bytes[frame_bytes..].fill(0);
            let mut offset = 0;
            while offset < frame_bytes {
                match stdout.read(&mut bytes[offset..frame_bytes]) {
                    Ok(0) if offset == 0 => break,
                    Ok(0) => return Err("Truncated decoder frame".into()),
                    Ok(n) => offset += n,
                    Err(_) => return Err("Decoder stream failed".into()),
                }
            }
            if offset == 0 {
                break;
            }
            profile.decoder_read_wait_ms += reading_started.elapsed().as_millis();
            frames += 1;
            (
                frames,
                FrameBuffer {
                    image: Some(
                        RgbImage::from_raw(WIDTH, decoded_height, bytes).ok_or("Invalid frame")?,
                    ),
                    pool: frame_pool.clone(),
                },
            )
        };
        if selected.is_none() && frames <= 20 {
            let identity_started = Instant::now();
            for (i, layout) in layouts.iter().enumerate() {
                if identity_matches(
                    &mut engine,
                    &frame,
                    layout,
                    &request.expected_teams,
                    &request.expected_match_label,
                ) {
                    confirmed[i] += 1;
                }
                if confirmed[i] >= 2 {
                    selected = Some(i);
                    break;
                }
            }
            profile.identity_ms += identity_started.elapsed().as_millis();
        }
        // Replay the bounded identity prefix so auto start is observed even if
        // the second identity confirmation arrives after the clock reaches 17.
        if verifying {
            // Move the verified source frame into the bounded prefix queue;
            // never clone its RGB allocation just to replay it later.
            pending.push_back((frame_index, frame));
            if selected.is_none() && frames >= 20 {
                return Err("Match and robot identities could not be validated".into());
            }
            continue;
        }
        let layout = layouts[selected.unwrap()];
        let clock_started = Instant::now();
        let clocks: Vec<_> = std::iter::once(&layout.clock)
            .chain(layout.clock_alternatives.iter())
            .map(|rect| engine.read(&frame, *rect, CropKind::Clock, 20))
            .collect();
        let plausible = clocks
            .into_iter()
            .filter(|(text, confidence)| {
                let mut candidate = clock_tracker.clone();
                clock(text).is_some_and(|seconds| {
                    candidate.time(seconds, *confidence, frame_index).is_some()
                })
            })
            .collect();
        let (c, cc) = choose_clock(plausible);
        profile.clock_ms += clock_started.elapsed().as_millis();
        let Some(seconds) = clock(&c) else {
            continue;
        };
        let Some(time) = clock_tracker.time(seconds, cc, frame_index) else {
            continue;
        };
        let counter_started = Instant::now();
        let (r, rc) = engine.read(&frame, layout.red_fuel, CropKind::Fuel, 0);
        let (b, bc) = engine.read(&frame, layout.blue_fuel, CropKind::Fuel, 0);
        profile.counter_ms += counter_started.elapsed().as_millis();
        let (red_points, blue_points, points_confidence) =
            if let (Some(red_box), Some(blue_box)) = (layout.red_points, layout.blue_points) {
                let points_started = Instant::now();
                let (red, red_conf) = engine.read(&frame, red_box, CropKind::Points, 0);
                let (blue, blue_conf) = engine.read(&frame, blue_box, CropKind::Points, 0);
                profile.counter_ms += points_started.elapsed().as_millis();
                let confidence = red_conf.min(blue_conf).min(cc);
                match (red.trim().parse::<u32>(), blue.trim().parse::<u32>()) {
                    (Ok(red), Ok(blue)) if confidence >= 85.0 && red <= 9999 && blue <= 9999 => {
                        (Some(red), Some(blue), Some(confidence))
                    }
                    _ => (None, None, None),
                }
            } else {
                (None, None, None)
            };
        retain_channel(
            &mut channels.red,
            time,
            &r,
            rc.min(cc),
            red_points.is_some(),
        );
        retain_channel(
            &mut channels.blue,
            time,
            &b,
            bc.min(cc),
            blue_points.is_some(),
        );
        let confidence = rc.min(bc).min(cc);
        if let (Some(red), Some(blue)) = (fuel(&r), fuel(&b))
            && confidence >= 85.0
            && observations.last().is_none_or(|s| time >= s.time)
        {
            if let Some(previous) = observations.last()
                && time == previous.time
            {
                // Preserve late score updates at 0:00 when a score channel exists.
                if red_points.is_none()
                    || red < previous.red
                    || blue < previous.blue
                    || previous
                        .red_points
                        .zip(red_points)
                        .is_some_and(|(a, b)| b < a)
                    || previous
                        .blue_points
                        .zip(blue_points)
                        .is_some_and(|(a, b)| b < a)
                {
                    continue;
                }
                observations.pop();
            }
            observations.push(Observation {
                time,
                red,
                blue,
                confidence,
                red_points,
                blue_points,
                points_confidence,
            });
        }
    }
    drop(stdout);
    if end_reached {
        drop(decoder);
    } else if !decoder.wait()?.success() {
        return Err("Incomplete decoder stream".into());
    }
    let index = selected.ok_or("Match and robot identities could not be validated")?;
    eprintln!("ocr_calls={} cache_hits={}", engine.calls, engine.hits);
    profile.recognition_ms = engine.recognition_time.as_millis();
    profile.recognition_calls = engine.calls;
    profile.cache_hits = engine.hits;
    for field in [
        CropKind::Text,
        CropKind::Fuel,
        CropKind::Points,
        CropKind::Clock,
    ] {
        for stage in [
            RecognitionStage::Primary,
            RecognitionStage::NormalizedGray,
            RecognitionStage::Binary,
            RecognitionStage::Glyph,
        ] {
            let stats = engine.field_stats[field as usize][stage as usize];
            if stats.calls > 0 {
                profile.fields.push(FieldRecognition {
                    field,
                    stage,
                    calls: stats.calls,
                    confident_syntax: stats.confident_syntax,
                    elapsed_micros: stats.elapsed_micros,
                });
            }
        }
    }
    Ok(Output {
        observations,
        channels,
        layout_version: layouts[index].version.clone(),
        elapsed_ms: start.elapsed().as_millis(),
        frames,
        profile,
        runtime: engine.runtime.clone(),
    })
}
fn authorized(actual: &str, expected: &str) -> bool {
    let mut difference = actual.len() ^ expected.len();
    for (index, byte) in expected.bytes().enumerate() {
        difference |= (byte ^ actual.as_bytes().get(index).copied().unwrap_or(0)) as usize;
    }
    difference == 0
}
async fn upload_inner(
    State(app): State<App>,
    headers: HeaderMap,
    mut multipart: Multipart,
) -> Result<Json<Output>, (StatusCode, &'static str)> {
    let expected = format!("Bearer {}", app.token);
    if !authorized(
        headers
            .get("authorization")
            .and_then(|h| h.to_str().ok())
            .unwrap_or(""),
        &expected,
    ) {
        return Err((StatusCode::UNAUTHORIZED, "Unauthorized"));
    }
    let permit = app
        .slots
        .clone()
        .try_acquire_owned()
        .map_err(|_| (StatusCode::SERVICE_UNAVAILABLE, "OCR busy"))?;
    let mut file = tempfile::NamedTempFile::new().map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Temporary storage unavailable",
        )
    })?;
    let mut size = 0;
    let mut request = None;
    let mut video_seen = false;
    while let Some(mut field) = multipart
        .next_field()
        .await
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid multipart body"))?
    {
        match field.name() {
            Some("metadata") => {
                let value = field
                    .bytes()
                    .await
                    .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid metadata"))?;
                if value.len() > 32768 || request.is_some() {
                    return Err((StatusCode::BAD_REQUEST, "Invalid metadata"));
                }
                request = Some(
                    serde_json::from_slice::<Request>(&value)
                        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid metadata"))?,
                );
            }
            Some("video") => {
                if video_seen {
                    return Err((StatusCode::BAD_REQUEST, "Duplicate video"));
                }
                video_seen = true;
                while let Some(chunk) = field
                    .chunk()
                    .await
                    .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid video"))?
                {
                    size += chunk.len();
                    if size > LIMIT {
                        return Err((StatusCode::PAYLOAD_TOO_LARGE, "Video too large"));
                    }
                    file.write_all(&chunk).map_err(|_| {
                        (
                            StatusCode::INTERNAL_SERVER_ERROR,
                            "Temporary storage unavailable",
                        )
                    })?;
                }
            }
            _ => return Err((StatusCode::BAD_REQUEST, "Unknown field")),
        }
    }
    let request = request.ok_or((StatusCode::BAD_REQUEST, "Missing metadata"))?;
    if size == 0
        || !valid_layout(&request.template)
        || request.expected_teams.len() != 6
        || request
            .expected_teams
            .iter()
            .collect::<std::collections::HashSet<_>>()
            .len()
            != 6
        || request.expected_match_label.trim().is_empty()
        || request.expected_match_label.len() > 80
    {
        return Err((StatusCode::BAD_REQUEST, "Invalid extraction request"));
    }
    tokio::task::spawn_blocking(move || {
        let _permit = permit;
        extract(file.path(), request)
    })
    .await
    .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "OCR process failed"))?
    .map(Json)
    .map_err(|reason| {
        let code = extraction_error_code(&reason);
        eprintln!("{code}");
        (
            if code == "ENGINE_UNAVAILABLE" {
                StatusCode::SERVICE_UNAVAILABLE
            } else {
                StatusCode::UNPROCESSABLE_ENTITY
            },
            code,
        )
    })
}
fn extraction_error_code(reason: &str) -> &'static str {
    match reason {
        "Match and robot identities could not be validated" => "IDENTITY_UNVERIFIED",
        "Video exceeds OCR budget" | "OCR exceeded processing budget" => "BUDGET_EXCEEDED",
        "Cannot allocate OCR engine" | "Cannot initialize OCR engine" => "ENGINE_UNAVAILABLE",
        "Invalid video" | "Missing video duration" => "INVALID_MEDIA",
        _ => "EXTRACTION_FAILED",
    }
}
async fn upload(
    state: State<App>,
    headers: HeaderMap,
    multipart: Multipart,
) -> Result<Json<Output>, (StatusCode, &'static str)> {
    tokio::time::timeout(
        Duration::from_secs(540),
        upload_inner(state, headers, multipart),
    )
    .await
    .map_err(|_| (StatusCode::REQUEST_TIMEOUT, "OCR request timed out"))?
}
fn router(app: App) -> Router {
    Router::new()
        .route("/health", get(|| async { "ok" }))
        .route("/extract", post(upload))
        .layer(DefaultBodyLimit::max(LIMIT + 65536))
        .with_state(app)
}
fn native_concurrency(value: Option<&str>) -> Result<usize, &'static str> {
    match value.unwrap_or("1") {
        "1" => Ok(1),
        "2" => Ok(2),
        _ => Err("OCR_CONCURRENCY must be 1 or 2"),
    }
}
#[tokio::main]
async fn main() {
    // This also bounds OpenMP threads used by native Tesseract.
    let token = std::env::var("OCR_SERVICE_TOKEN").expect("OCR_SERVICE_TOKEN required");
    assert!(
        token.len() >= 32,
        "Use a random token of at least 32 characters"
    );
    let probe =
        Engine::new().expect("OCR engine model must be readable and match its configured hash");
    eprintln!(
        "ocr_runtime={}",
        serde_json::to_string(&probe.runtime).expect("Runtime identity serializes")
    );
    drop(probe);
    let app = App {
        token: Arc::new(token),
        slots: Arc::new(Semaphore::new(
            native_concurrency(std::env::var("OCR_CONCURRENCY").ok().as_deref())
                .expect("OCR_CONCURRENCY must be 1 or 2"),
        )),
    };
    let router = router(app);
    let port = std::env::var("PORT").unwrap_or("8080".into());
    let host = std::env::var("OCR_BIND_HOST").unwrap_or("127.0.0.1".into());
    let listener =
        tokio::net::TcpListener::bind((host.as_str(), port.parse::<u16>().expect("Invalid PORT")))
            .await
            .unwrap();
    axum::serve(listener, router).await.unwrap();
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn model_fingerprints_are_exact_and_expected_hashes_fail_closed() {
        let hash = model_sha256(b"abc");
        assert_eq!(
            hash,
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
        assert!(expected_model_matches(&hash, None));
        assert!(expected_model_matches(&hash, Some(&hash.to_uppercase())));
        for bad in ["", "not-a-hash", &"0".repeat(64)] {
            assert!(!expected_model_matches(&hash, Some(bad)));
        }
        assert_ne!(hash, model_sha256(b"abd"));
    }
    #[test]
    fn field_profiling_counts_actual_stages_and_preserves_results() {
        let mut engine = Engine::new().unwrap();
        let frame = RgbImage::from_pixel(WIDTH, HEIGHT, image::Rgb([255, 255, 255]));
        let rect = [0.2, 0.1, 0.05, 0.05];
        let result = engine.read(&frame, rect, CropKind::Fuel, 0);
        assert_eq!(engine.read(&frame, rect, CropKind::Fuel, 0), result);
        assert_eq!(engine.calls, 3);
        assert_eq!(
            engine.field_stats[CropKind::Fuel as usize]
                .iter()
                .map(|s| s.calls)
                .sum::<usize>(),
            3
        );
        assert_eq!(
            engine.field_stats[CropKind::Fuel as usize][RecognitionStage::Primary as usize].calls,
            1
        );
        assert_eq!(
            engine.field_stats[CropKind::Fuel as usize][RecognitionStage::NormalizedGray as usize]
                .calls,
            1
        );
        assert_eq!(
            engine.field_stats[CropKind::Fuel as usize][RecognitionStage::Binary as usize].calls,
            1
        );
        assert!(
            engine.field_stats[CropKind::Clock as usize]
                .iter()
                .all(|s| s.calls == 0)
        );
        assert_eq!(engine.runtime.model_sha256.len(), 64);
        assert!(!engine.runtime.tesseract_version.is_empty());
    }
    #[test]
    fn prefix_frames_move_without_copying_and_return_only_one_spare() {
        let pool: FramePool = Rc::new(RefCell::new(None));
        let a = FrameBuffer {
            image: Some(RgbImage::new(WIDTH, 232)),
            pool: pool.clone(),
        };
        let pointer = a.as_raw().as_ptr();
        let b = FrameBuffer {
            image: Some(RgbImage::new(WIDTH, 232)),
            pool: pool.clone(),
        };
        let mut pending = std::collections::VecDeque::from([(1, a), (2, b)]);
        let (index, frame) = pending.pop_front().unwrap();
        assert_eq!(index, 1);
        assert_eq!(frame.as_raw().as_ptr(), pointer);
        drop(frame);
        drop(pending.pop_front());
        let bytes = pool.borrow_mut().take().unwrap();
        assert_eq!(bytes.as_ptr(), pointer);
        let reused = FrameBuffer {
            image: Some(RgbImage::from_raw(WIDTH, 232, bytes).unwrap()),
            pool: pool.clone(),
        };
        assert_eq!(reused.as_raw().as_ptr(), pointer);
        drop(reused);
        assert!(pool.borrow().is_some());
    }
    #[test]
    fn frame_buffer_returns_storage_on_early_exit() {
        let pool: FramePool = Rc::new(RefCell::new(None));
        let early = || -> Result<(), &str> {
            let _frame = FrameBuffer {
                image: Some(RgbImage::new(WIDTH, 232)),
                pool: pool.clone(),
            };
            Err("unreadable clock")
        };
        assert!(early().is_err());
        assert_eq!(
            pool.borrow().as_ref().unwrap().len(),
            (WIDTH * 232 * 3) as usize
        );
    }
    #[test]
    fn compact_bands_preserve_720p_crop_geometry_and_reject_unavailable_rows() {
        let full = RgbImage::from_fn(WIDTH, HEIGHT, |x, y| {
            image::Rgb([(x % 256) as u8, (y % 256) as u8, ((x + y) % 256) as u8])
        });
        let band = RgbImage::from_raw(
            WIDTH,
            232,
            full.as_raw()[..(WIDTH * 232 * 3) as usize].to_vec(),
        )
        .unwrap();
        let mut scalers = Scalers::new();
        for rect in [
            [0.2, 0.1, 0.05, 0.05],
            [0.4, 0.2, 0.1, 0.04],
            [0.5, 0.25, 0.1, 0.05],
        ] {
            for padding in [0, 10, 20] {
                let a = prepare_with(&full, rect, padding, &mut scalers).unwrap();
                let b = prepare_with(&band, rect, padding, &mut scalers).unwrap();
                assert_eq!((a.width, a.height, a.stride), (b.width, b.height, b.stride));
                assert_eq!(a.image, b.image);
            }
        }
        assert!(prepare(&band, [0.1, 0.4, 0.1, 0.1], 0).is_none());
        assert!(prepare(&RgbImage::new(WIDTH, HEIGHT + 1), [0.1, 0.1, 0.1, 0.1], 0).is_none());
        let mut engine = Engine::new().unwrap();
        assert_eq!(
            engine.read(&band, [0.1, 0.4, 0.1, 0.1], CropKind::Fuel, 0),
            ("".into(), 0.0)
        );
        assert_eq!(engine.calls, 0);
    }
    fn top_layout() -> Layout {
        serde_json::from_value(serde_json::json!({
            "season":2026,"version":"test","redFuel":[0.2,0.1,0.05,0.05],"blueFuel":[0.7,0.1,0.05,0.05],
            "clock":[0.45,0.2,0.1,0.04],"teams":vec![[0.2,0.1,0.05,0.05];6],"matchLabel":[0.5,0.25,0.1,0.05]
        })).unwrap()
    }
    #[test]
    fn a_failed_match_label_skips_all_six_team_crops() {
        let mut engine = Engine::new().unwrap();
        let frame = RgbImage::from_pixel(WIDTH, HEIGHT, image::Rgb([255, 255, 255]));
        assert!(!identity_matches(
            &mut engine,
            &frame,
            &top_layout(),
            &[1, 2, 3, 4, 5, 6],
            "Qualification 1"
        ));
        assert_eq!(engine.cache.len(), 1);
        assert_eq!(engine.calls, 3);
    }
    #[test]
    fn decoded_band_includes_alternate_fields_and_keeps_bottom_layouts_full_height() {
        let mut layout = top_layout();
        assert_eq!(decoded_height(&layout), 232);
        layout.clock_alternatives.push([0.4, 0.6, 0.1, 0.05]);
        assert_eq!(decoded_height(&layout), 484);
        let mut alternate = top_layout();
        alternate.blue_points = Some([0.6, 0.8, 0.1, 0.1]);
        alternate.red_points = Some([0.3, 0.8, 0.1, 0.1]);
        layout.alternatives.push(alternate);
        assert_eq!(decoded_height(&layout), 664);
        layout.match_label = [0.1, 0.95, 0.1, 0.05];
        assert_eq!(decoded_height(&layout), HEIGHT);
    }
    #[test]
    fn cropping_after_scaling_preserves_exact_source_pixels() {
        let mut input = tempfile::NamedTempFile::new().unwrap();
        let pixels: Vec<u8> = (0..1920 * 1080 * 3)
            .map(|n| ((n * 13 + n / 5760 * 7) % 256) as u8)
            .collect();
        input.write_all(&pixels).unwrap();
        let decode = |crop: bool| {
            let mut filters = "scale=1280:720,format=rgb24".to_owned();
            if crop {
                filters.push_str(",crop=1280:232:0:0");
            }
            let output = Command::new("ffmpeg")
                .args([
                    "-v",
                    "error",
                    "-threads",
                    "1",
                    "-filter_threads",
                    "1",
                    "-f",
                    "rawvideo",
                    "-pixel_format",
                    "rgb24",
                    "-video_size",
                    "1920x1080",
                    "-i",
                ])
                .arg(input.path())
                .args([
                    "-vf",
                    &filters,
                    "-frames:v",
                    "1",
                    "-f",
                    "rawvideo",
                    "-pix_fmt",
                    "rgb24",
                    "pipe:1",
                ])
                .output()
                .unwrap();
            assert!(output.status.success());
            output.stdout
        };
        let full = decode(false);
        let cropped = decode(true);
        assert_eq!(cropped.len(), (WIDTH * 232 * 3) as usize);
        assert_eq!(cropped, &full[..cropped.len()]);
    }
    #[test]
    fn crop_normalization_preserves_white_padding() {
        let mut p = Prepared {
            image: vec![255; 16 * 12],
            width: 12,
            height: 12,
            stride: 16,
        };
        for y in 2..10 {
            for x in 2..10 {
                p.image[y * 16 + x] = 30;
            }
        }
        p.image[5 * 16 + 5] = 220;
        normalize(&mut p, 2, false);
        assert_eq!(p.image[0], 255);
        assert_eq!(p.image[3 * 16 + 3], 255);
        assert_eq!(p.image[5 * 16 + 5], 39);
    }
    #[test]
    fn unchanged_crop_cache_avoids_recognition_without_ignoring_pixel_changes() {
        let mut engine = Engine::new().unwrap();
        let mut frame = RgbImage::from_pixel(WIDTH, HEIGHT, image::Rgb([255, 255, 255]));
        let rect = [0.1, 0.1, 0.05, 0.05];
        let first = engine.read(&frame, rect, CropKind::Fuel, 0);
        let calls = engine.calls;
        assert_eq!(engine.read(&frame, rect, CropKind::Fuel, 0), first);
        assert_eq!(engine.calls, calls);
        assert_eq!(engine.hits, 1);
        frame.put_pixel(130, 75, image::Rgb([0, 0, 0]));
        engine.read(&frame, rect, CropKind::Fuel, 0);
        assert!(engine.calls > calls);
    }
    #[test]
    fn reused_scalers_match_fresh_contexts_across_frames_and_padding() {
        let mut scalers = Scalers::new();
        for variant in 0..3 {
            let frame = RgbImage::from_fn(WIDTH, HEIGHT, |x, y| {
                image::Rgb([
                    ((x * 13 + y * 7 + variant) % 256) as u8,
                    ((x * 3 + y * 17 + variant * 11) % 256) as u8,
                    ((x + y + variant * 23) % 256) as u8,
                ])
            });
            for rect in [
                [0.1, 0.1, 0.04, 0.03],
                [0.6, 0.2, 0.04, 0.03],
                [0.2, 0.3, 0.05, 0.04],
            ] {
                for padding in [0, 10, 20] {
                    let reused = prepare_with(&frame, rect, padding, &mut scalers).unwrap();
                    let fresh = prepare(&frame, rect, padding).unwrap();
                    let mismatch = reused
                        .image
                        .iter()
                        .zip(&fresh.image)
                        .position(|(a, b)| a != b);
                    assert!(
                        mismatch.is_none(),
                        "variant={variant}, rect={rect:?}, padding={padding}, first mismatch={mismatch:?}, stride={}",
                        reused.stride
                    );
                }
            }
        }
        assert_eq!(scalers.len(), 2);
    }
    #[test]
    fn independent_channels_preserve_confident_evidence_and_real_corrections() {
        let mut samples = Vec::new();
        retain_channel(&mut samples, 10, "81 / 100", 90.0, false);
        retain_channel(&mut samples, 11, "82", 84.9, false);
        retain_channel(&mut samples, 11, "garbage", 100.0, false);
        retain_channel(&mut samples, 12, "79", 95.0, false);
        retain_channel(&mut samples, 11, "90", 99.0, false);
        retain_channel(&mut samples, 12, "80", 96.0, false);
        assert_eq!(samples.len(), 2);
        assert_eq!(samples[1].count, 79); // do not hide a retraction
        retain_channel(&mut samples, 12, "80", 96.0, true);
        assert_eq!(samples[1].count, 80);
        retain_channel(&mut samples, 12, "78", 96.0, true);
        assert_eq!(samples[1].count, 80);
    }
    #[test]
    fn narrow_one_requires_a_tall_continuous_stem() {
        let mut p = Prepared {
            image: vec![255; 64 * 50],
            width: 28,
            height: 50,
            stride: 64,
        };
        for y in 10..40 {
            p.image[y * 64 + 14] = 0;
        }
        assert!(narrow_one(&p));
        for y in 10..35 {
            p.image[y * 64 + 14] = 255;
        }
        assert!(!narrow_one(&p));
    }
    #[test]
    fn extraction_errors_do_not_publish_backend_diagnostics() {
        assert_eq!(
            extraction_error_code("Match and robot identities could not be validated"),
            "IDENTITY_UNVERIFIED"
        );
        assert_eq!(
            extraction_error_code("unexpected private backend text"),
            "EXTRACTION_FAILED"
        );
    }
    #[test]
    fn stray_early_clock_does_not_reanchor_the_match() {
        let mut t = ClockTracker::default();
        assert_eq!(t.time(20, 95.0, 7), Some(0));
        assert_eq!(t.time(1, 95.0, 8), None);
        assert_eq!(t.time(19, 95.0, 8), Some(1));
    }
    #[test]
    fn finished_clock_keeps_settling_frames_and_cannot_emit_later_observations() {
        let mut tracker = ClockTracker::default();
        tracker.time(20, 95.0, 7);
        tracker.time(140, 95.0, 30);
        assert!(!tracker.finished(173));
        assert_eq!(tracker.time(0, 95.0, 173), Some(163));
        assert!(tracker.finished(174));
        for seconds in 0..=140 {
            assert_eq!(tracker.clone().time(seconds, 100.0, 174), None);
        }
    }
    #[test]
    fn native_parallelism_is_explicitly_bounded() {
        assert_eq!(native_concurrency(None), Ok(1));
        assert_eq!(native_concurrency(Some("2")), Ok(2));
        for value in ["0", "3", "-1", "invalid"] {
            assert!(native_concurrency(Some(value)).is_err());
        }
    }
    #[test]
    fn counters() {
        assert_eq!(fuel("24 / 100"), Some(24));
        for s in ["-1", "1/2/3", "10000", "1x", "1/"] {
            assert_eq!(fuel(s), None);
        }
        assert_eq!(clock("2:20"), Some(140));
        assert_eq!(clock("junk"), None);
    }
    #[test]
    fn malformed_clock_fields_cannot_create_plausible_but_wrong_times() {
        for (text, seconds) in [
            ("2:20", 140),
            ("1:32", 92),
            ("0:59", 59),
            ("0:00", 0),
            ("20", 20),
            ("140", 140),
            (" 01 ", 1),
        ] {
            assert_eq!(clock(text), Some(seconds));
        }
        for text in [
            "0:90", "1:60", "1:032", "2:2", "3:00", "141", "-1", "+20", "1/20", "", "0:999",
            "1:00:00",
        ] {
            assert_eq!(clock(text), None);
        }
        assert_eq!(
            choose_clock(vec![("0:90".into(), 99.0), ("1:30".into(), 90.0)]),
            ("1:30".into(), 90.0)
        );
    }
    #[test]
    fn crop_recovery_requires_the_actual_field_grammar() {
        assert!(CropKind::Fuel.accepts("24/100"));
        assert!(!CropKind::Points.accepts("24/100"));
        assert!(!CropKind::Clock.accepts("24/100"));
        assert!(CropKind::Clock.accepts("2:20"));
        assert!(!CropKind::Fuel.accepts("2:20"));
        assert!(!CropKind::Points.accepts("2:20"));
        assert!(!CropKind::Clock.accepts("0:90"));
        assert!(CropKind::Points.accepts("624"));
        assert!(CropKind::Fuel.accepts("624"));
        assert!(!CropKind::Clock.accepts("624"));
    }
    #[test]
    fn rectangles() {
        assert!(valid_rect([0.2, 0.1, 0.1, 0.1]));
        assert!(!valid_rect([0.9, 0.0, 0.2, 0.1]));
        assert!(!valid_rect([f64::NAN, 0.0, 0.2, 0.1]));
        assert!(!valid_rect([0.0, 0.0, 0.00001, 0.1]));
    }
    #[test]
    fn tsv() {
        let text = "header\n5\t1\t1\t1\t1\t1\t0\t0\t1\t1\t92.5\t24\n5\t1\t1\t1\t1\t1\t0\t0\t1\t1\t88\t/100";
        assert_eq!(parse_tsv(text, true), ("24 /100".into(), 88.0));
        assert_eq!(parse_tsv("header\n", true), (String::new(), 0.0));
    }
    #[test]
    fn watchdog_stops_stalled_child() {
        let child = Command::new("sleep").arg("10").spawn().unwrap();
        let decoder = Decoder::new(child, Duration::from_millis(25));
        assert!(!decoder.wait().unwrap().success());
    }
    #[tokio::test]
    async fn endpoints_require_auth_and_refuse_concurrent_work() {
        use axum::{body::Body, http::Request};
        use tower::ServiceExt;
        let app = App {
            token: Arc::new("x".repeat(32)),
            slots: Arc::new(Semaphore::new(1)),
        };
        let routes = router(app.clone());
        assert_eq!(
            routes
                .clone()
                .oneshot(Request::get("/health").body(Body::empty()).unwrap())
                .await
                .unwrap()
                .status(),
            StatusCode::OK
        );
        let request = || {
            Request::post("/extract")
                .header("content-type", "multipart/form-data; boundary=x")
                .body(Body::from("--x--\r\n"))
                .unwrap()
        };
        assert_eq!(
            routes.clone().oneshot(request()).await.unwrap().status(),
            StatusCode::UNAUTHORIZED
        );
        let permit = app.slots.clone().acquire_owned().await.unwrap();
        let mut req = request();
        req.headers_mut().insert(
            "authorization",
            format!("Bearer {}", "x".repeat(32)).parse().unwrap(),
        );
        assert_eq!(
            routes.oneshot(req).await.unwrap().status(),
            StatusCode::SERVICE_UNAVAILABLE
        );
        drop(permit);
    }
    #[test]
    fn native_scaler_preserves_padding_and_bounds() {
        let frame = RgbImage::from_pixel(WIDTH, HEIGHT, image::Rgb([64, 64, 64]));
        let prepared = prepare(
            &frame,
            [
                0.47265625,
                0.10277777777777777,
                0.05390625,
                0.03888888888888889,
            ],
            20,
        )
        .unwrap();
        for y in 0..prepared.height {
            for x in 0..prepared.width {
                let pixel = prepared.image[(y * prepared.stride + x) as usize];
                if x < 20 || y < 20 || x >= prepared.width - 20 || y >= prepared.height - 20 {
                    assert_eq!(pixel, 255);
                } else {
                    assert!(pixel < 100);
                }
            }
        }
        assert!(prepare(&frame, [0.99, 0.0, 0.1, 0.1], 20).is_none());
    }
    #[test]
    fn clock_transition_survives_missing_auto_zero_without_accepting_late_starts() {
        let mut tracker = ClockTracker::default();
        assert_eq!(tracker.time(20, 95.0, 7), Some(0));
        assert_eq!(tracker.time(3, 95.0, 24), Some(17));
        assert_eq!(tracker.time(140, 95.0, 30), Some(23));
        assert_eq!(tracker.time(120, 95.0, 50), Some(43));
        assert_eq!(tracker.time(1, 95.0, 51), None);
        let mut late = ClockTracker::default();
        assert_eq!(late.time(20, 95.0, 150), None);
        let mut early = ClockTracker::default();
        early.time(20, 95.0, 7);
        assert_eq!(early.time(140, 95.0, 8), None);
        assert_eq!(early.time(0, 10.0, 9), None);
        let mut clipped = ClockTracker::default();
        assert_eq!(clipped.time(15, 95.0, 1), Some(5));
        assert_eq!(clipped.time(140, 95.0, 19), Some(23));
    }
    #[test]
    fn alternate_clocks_require_agreement() {
        assert_eq!(
            choose_clock(vec![("2:20".into(), 96.0), ("140".into(), 90.0)]).0,
            "2:20"
        );
        assert_eq!(
            choose_clock(vec![("2:20".into(), 96.0), ("1:20".into(), 90.0)]).1,
            0.0
        );
        assert_eq!(
            choose_clock(vec![("junk".into(), 99.0), ("2:20".into(), 90.0)]).0,
            "2:20"
        );
    }
    #[test]
    fn total_scores_are_optional_and_use_the_rpc_field_names() {
        let sample = Observation {
            time: 1,
            red: 3,
            blue: 4,
            confidence: 95.0,
            red_points: Some(8),
            blue_points: Some(4),
            points_confidence: Some(96.0),
        };
        let value = serde_json::to_value(sample).unwrap();
        assert_eq!(value["redPoints"], 8);
        assert_eq!(value["pointsConfidence"], 96.0);
        assert!(value.get("red_points").is_none());
        let mut layout: Layout =
            serde_json::from_str(include_str!("../../config/scoreboard-2026-calgames.json"))
                .unwrap();
        assert!(valid_layout(&layout));
        layout.blue_points = None;
        assert!(!valid_layout(&layout));
    }
}
