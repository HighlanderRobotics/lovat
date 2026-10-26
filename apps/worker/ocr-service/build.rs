fn main() {
    pkg_config::probe_library("libswscale").expect("Install FFmpeg development headers");
    pkg_config::probe_library("tesseract").expect("Install Tesseract development headers");
}
