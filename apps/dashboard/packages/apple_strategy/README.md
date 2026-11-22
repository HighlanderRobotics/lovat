# Apple strategy bridge

Private app-local Flutter plugin for Apple's on-device Foundation Models API.
Supports iOS 26+ and macOS 26+ at runtime, with deployment minimums of iOS 15
and macOS 12. The native framework is weak-linked. Unsupported OS versions and
devices return an unavailable status rather than calling cloud inference.

The method channel exposes `availability`, `generate` and `cancel`. Generation
uses `SystemLanguageModel.default`, a fresh session, bounded evidence and a
short response. Native errors are sanitized to avoid exposing scouting notes.
No model weights, training assets, credentials, or cloud networking are included.

The application owns data loading, source authorization, snapshot freshness,
example labels and explicit cloud selection. It cancels native work on page
exit or tournament changes. Siri integration and custom training are separate
future work.
