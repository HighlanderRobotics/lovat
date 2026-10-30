//! Numeric Linux counters only; no caller-supplied paths or environment values.
use super::*;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Resources {
    instance_id: String,
    cpu_quota_cores: Option<f64>,
    cpu_usage_micros: Option<u64>,
    memory_current_bytes: Option<u64>,
    memory_peak_bytes: Option<u64>,
    process_rss_bytes: Option<u64>,
    process_peak_rss_bytes: Option<u64>,
    decoder_threads: usize,
    configured_concurrency: usize,
    available_slots: usize,
}
fn small_file(path: &str, limit: u64) -> Option<String> {
    let mut bytes = Vec::new();
    std::fs::File::open(path)
        .ok()?
        .take(limit + 1)
        .read_to_end(&mut bytes)
        .ok()?;
    (bytes.len() as u64 <= limit)
        .then(|| String::from_utf8(bytes).ok())
        .flatten()
}
fn quota(value: &str) -> Option<f64> {
    let parts: Vec<_> = value.split_whitespace().collect();
    if parts.len() != 2 || parts[0] == "max" {
        return None;
    }
    let maximum = parts[0].parse::<u64>().ok()?;
    let period = parts[1].parse::<u64>().ok()?;
    if maximum == 0 || period == 0 {
        return None;
    }
    Some(maximum as f64 / period as f64)
}
fn number(path: &str) -> Option<u64> {
    small_file(path, 128)?.trim().parse().ok()
}
fn counter(text: &str, key: &str) -> Option<u64> {
    text.lines().find_map(|line| {
        let parts: Vec<_> = line.split_whitespace().collect();
        (parts.len() == 2 && parts[0] == key)
            .then(|| parts[1].parse().ok())
            .flatten()
    })
}
fn rss(text: &str, key: &str) -> Option<u64> {
    text.lines().find_map(|line| {
        let parts: Vec<_> = line.split_whitespace().collect();
        if parts.len() != 3 || parts[0] != key || parts[2] != "kB" {
            return None;
        }
        parts[1].parse::<u64>().ok()?.checked_mul(1024)
    })
}
pub(super) fn snapshot(available_slots: usize) -> Resources {
    static INSTANCE: std::sync::OnceLock<String> = std::sync::OnceLock::new();
    let instance_id = INSTANCE
        .get_or_init(|| {
            format!(
                "{}-{}",
                std::process::id(),
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_nanos()
            )
        })
        .clone();
    let cpu = small_file("/sys/fs/cgroup/cpu.stat", 4096).unwrap_or_default();
    let status = small_file("/proc/self/status", 65536).unwrap_or_default();
    Resources {
        instance_id,
        cpu_quota_cores: small_file("/sys/fs/cgroup/cpu.max", 128).and_then(|text| quota(&text)),
        cpu_usage_micros: counter(&cpu, "usage_usec"),
        memory_current_bytes: number("/sys/fs/cgroup/memory.current"),
        memory_peak_bytes: number("/sys/fs/cgroup/memory.peak"),
        process_rss_bytes: rss(&status, "VmRSS:"),
        process_peak_rss_bytes: rss(&status, "VmHWM:"),
        decoder_threads: decoder_threads(std::env::var("OCR_DECODER_THREADS").ok().as_deref())
            .unwrap_or(1),
        configured_concurrency: native_concurrency(
            std::env::var("OCR_CONCURRENCY").ok().as_deref(),
        )
        .unwrap_or(1),
        available_slots,
    }
}
pub(super) async fn read(
    State(app): State<App>,
    headers: HeaderMap,
) -> Result<Json<Resources>, StatusCode> {
    let actual = headers
        .get("authorization")
        .and_then(|h| h.to_str().ok())
        .unwrap_or("");
    if !authorized(actual, &format!("Bearer {}", app.token)) {
        return Err(StatusCode::UNAUTHORIZED);
    }
    Ok(Json(snapshot(app.slots.available_permits())))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn resource_parsers_do_not_invent_missing_or_unbounded_limits() {
        assert_eq!(quota("200000 100000\n"), Some(2.0));
        assert_eq!(quota("50000 100000"), Some(0.5));
        for invalid in [
            "max 100000",
            "0 100000",
            "200000 0",
            "-1 100000",
            "200000",
            "1 2 3",
            "NaN 1",
        ] {
            assert_eq!(quota(invalid), None);
        }
        assert_eq!(
            counter("usage_usec 123\nuser_usec 100\n", "usage_usec"),
            Some(123)
        );
        assert_eq!(counter("usage_usec nope", "usage_usec"), None);
        assert_eq!(rss("VmRSS:  400 kB\n", "VmRSS:"), Some(409600));
        assert_eq!(rss("VmRSS: 400 MB", "VmRSS:"), None);
    }
    #[tokio::test]
    async fn counters_require_the_existing_bearer_token() {
        use axum::{body::Body, http::Request};
        use tower::ServiceExt;
        let app = || {
            router(App {
                token: Arc::new("x".repeat(32)),
                slots: Arc::new(Semaphore::new(1)),
            })
        };
        let unauthorized = app()
            .oneshot(
                Request::builder()
                    .uri("/resources")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(unauthorized.status(), StatusCode::UNAUTHORIZED);
        let authorized = app()
            .oneshot(
                Request::builder()
                    .uri("/resources")
                    .header("authorization", format!("Bearer {}", "x".repeat(32)))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(authorized.status(), StatusCode::OK);
        let bytes = axum::body::to_bytes(authorized.into_body(), 4096)
            .await
            .unwrap();
        let data: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(data["availableSlots"], 1);
        assert!(data.get("cpuQuotaCores").is_some());
        assert!(data.get("token").is_none());
    }
}
