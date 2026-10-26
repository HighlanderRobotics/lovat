use axum::{
    Json, Router,
    extract::{DefaultBodyLimit, Multipart, State},
    http::{HeaderMap, StatusCode},
    routing::{get, post},
};
use image::RgbImage;
use serde::{Deserialize, Serialize};
use std::{
    ffi::{CStr, c_char, c_int, c_void},
    io::{Read, Write},
    process::{Command, Stdio},
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
    layout_version: String,
    elapsed_ms: u128,
    frames: usize,
}
#[derive(Clone)]
struct App {
    token: Arc<String>,
    slots: Arc<Semaphore>,
}

unsafe extern "C" {
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
struct Engine(*mut c_void);
impl Drop for Engine {
    fn drop(&mut self) {
        unsafe { TessBaseAPIDelete(self.0) }
    }
}
impl Engine {
    fn new() -> Result<Self, String> {
        unsafe {
            let engine = Self(TessBaseAPICreate());
            if engine.0.is_null() {
                return Err("Cannot allocate OCR engine".into());
            }
            if TessBaseAPIInit3(engine.0, std::ptr::null(), c"eng".as_ptr()) != 0 {
                return Err("Cannot initialize OCR engine".into());
            }
            TessBaseAPISetPageSegMode(engine.0, 7);
            Ok(engine)
        }
    }
    fn read(&mut self, frame: &RgbImage, rect: Rect, numeric: bool, padding: u32) -> (String, f64) {
        let Some(Prepared {
            image,
            width,
            height,
            stride,
        }) = prepare(frame, rect, padding)
        else {
            return (String::new(), 0.0);
        };
        unsafe {
            // Clear learned state between independent fields, preserving CLI semantics.
            TessBaseAPIClearAdaptiveClassifier(self.0);
            TessBaseAPISetImage(
                self.0,
                image.as_ptr(),
                width as i32,
                height as i32,
                1,
                stride as i32,
            );
            let ptr = TessBaseAPIGetTsvText(self.0, 0);
            if ptr.is_null() {
                return (String::new(), 0.0);
            }
            let result = parse_tsv(&CStr::from_ptr(ptr).to_string_lossy(), numeric);
            TessDeleteText(ptr);
            result
        }
    }
}
struct Prepared {
    image: Vec<u8>,
    width: u32,
    height: u32,
    stride: u32,
}
fn prepare(frame: &RgbImage, rect: Rect, padding: u32) -> Option<Prepared> {
    if !valid_rect(rect) || frame.width() != WIDTH || frame.height() != HEIGHT || padding > 20 {
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
        let context = sws_getContext(
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
        );
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
        sws_freeContext(context);
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
    Some(Prepared {
        image,
        width,
        height,
        stride,
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
    match p.as_slice() {
        [s] if s.len() <= 3 => s.parse().ok(),
        [m, s] if m.len() == 1 && s.len() <= 3 => {
            Some(m.parse::<u32>().ok()? * 60 + s.parse::<u32>().ok()?)
        }
        _ => None,
    }
}
fn choose_clock(readings: Vec<(String, f64)>) -> (String, f64) {
    let mut valid: Vec<_> = readings
        .into_iter()
        .filter(|(text, c)| *c >= 85.0 && clock(text).is_some_and(|s| s <= 140))
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
#[derive(Default)]
struct ClockTracker {
    origin: Option<i32>,
    teleop: bool,
}
impl ClockTracker {
    fn time(&mut self, seconds: u32, confidence: f64, frame: usize) -> Option<u32> {
        if !confidence.is_finite() || confidence < 85.0 || seconds > 140 {
            return None;
        }
        if !self.teleop && frame <= 30 && seconds <= 20 {
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
fn extract(path: &std::path::Path, request: Request) -> Result<Output, String> {
    let start = Instant::now();
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
            "fps=1,scale=1280:720,format=rgb24",
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
    let mut clock_tracker = ClockTracker::default();
    let mut frames = 0;
    let mut pending = std::collections::VecDeque::new();
    loop {
        if start.elapsed() > Duration::from_secs(480) {
            return Err("OCR exceeded processing budget".into());
        }
        let verifying = selected.is_none();
        let (frame_index, frame) = if selected.is_some() && !pending.is_empty() {
            pending.pop_front().unwrap()
        } else {
            let mut bytes = vec![0u8; (WIDTH * HEIGHT * 3) as usize];
            let mut offset = 0;
            while offset < bytes.len() {
                match stdout.read(&mut bytes[offset..]) {
                    Ok(0) if offset == 0 => break,
                    Ok(0) => return Err("Truncated decoder frame".into()),
                    Ok(n) => offset += n,
                    Err(_) => return Err("Decoder stream failed".into()),
                }
            }
            if offset == 0 {
                break;
            }
            frames += 1;
            bytes.extend_from_slice(&[0u8; 64]);
            (
                frames,
                RgbImage::from_raw(WIDTH, HEIGHT, bytes).ok_or("Invalid frame")?,
            )
        };
        if selected.is_none() {
            pending.push_back((frame_index, frame.clone()));
        }
        if selected.is_none() && frames <= 20 {
            for (i, layout) in layouts.iter().enumerate() {
                let mut teams = Vec::new();
                for rect in &layout.teams {
                    let (t, c) = engine.read(&frame, *rect, false, 0);
                    if c >= 85.0
                        && let Ok(n) = t.parse::<u32>()
                    {
                        teams.push(n);
                    }
                }
                let (t, c) = engine.read(&frame, layout.match_label, false, 0);
                if teams.len() == 6
                    && request.expected_teams.iter().all(|t| teams.contains(t))
                    && c >= 85.0
                    && canonical(&t) == canonical(&request.expected_match_label)
                {
                    confirmed[i] += 1;
                }
                if confirmed[i] >= 2 {
                    selected = Some(i);
                    break;
                }
            }
        }
        if selected.is_none() {
            if frames >= 20 {
                return Err("Match and robot identities could not be validated".into());
            }
            continue;
        }
        // Replay the bounded identity prefix so auto start is observed even if
        // the second identity confirmation arrives after the clock reaches 17.
        if verifying {
            continue;
        }
        let layout = layouts[selected.unwrap()];
        let (r, rc) = engine.read(&frame, layout.red_fuel, true, 0);
        let (b, bc) = engine.read(&frame, layout.blue_fuel, true, 0);
        let clocks: Vec<_> = std::iter::once(&layout.clock)
            .chain(layout.clock_alternatives.iter())
            .map(|rect| engine.read(&frame, *rect, true, 20))
            .collect();
        let (c, cc) = choose_clock(clocks);
        let Some(seconds) = clock(&c) else {
            continue;
        };
        let Some(time) = clock_tracker.time(seconds, cc, frame_index) else {
            continue;
        };
        let (red_points, blue_points, points_confidence) =
            if let (Some(red_box), Some(blue_box)) = (layout.red_points, layout.blue_points) {
                let (red, red_conf) = engine.read(&frame, red_box, true, 0);
                let (blue, blue_conf) = engine.read(&frame, blue_box, true, 0);
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
    if !decoder.wait()?.success() {
        return Err("Incomplete decoder stream".into());
    }
    let index = selected.ok_or("Match and robot identities could not be validated")?;
    Ok(Output {
        observations,
        layout_version: layouts[index].version.clone(),
        elapsed_ms: start.elapsed().as_millis(),
        frames,
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
    .map_err(|_| {
        (
            StatusCode::UNPROCESSABLE_ENTITY,
            "Video could not be validated",
        )
    })
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
#[tokio::main]
async fn main() {
    // This also bounds OpenMP threads used by native Tesseract.
    let token = std::env::var("OCR_SERVICE_TOKEN").expect("OCR_SERVICE_TOKEN required");
    assert!(
        token.len() >= 32,
        "Use a random token of at least 32 characters"
    );
    let app = App {
        token: Arc::new(token),
        slots: Arc::new(Semaphore::new(1)),
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
    fn counters() {
        assert_eq!(fuel("24 / 100"), Some(24));
        for s in ["-1", "1/2/3", "10000", "1x", "1/"] {
            assert_eq!(fuel(s), None);
        }
        assert_eq!(clock("2:20"), Some(140));
        assert_eq!(clock("junk"), None);
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
