# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2026-09-17
### Added
- Axis-limit display presets with JSON save/load.
- Integrated delivery-time calibration with BIN/CSV imports, local axis-response and uniform correction profiles, and measured/predicted comparison plots.
- Trajectory BIN support for versions 2.1, 3.0, 4.0 and 5.0.
- Recorded BIN playback with original snapshot timing, retained holds, seeking, and disabled simulation inputs during playback.
- Calibration and playback regression tests and method documentation.

### Changed
- Renamed the app to Plan Delivery Simulator. Enhanced Beam Limiting Device Sequence parsing is not supported.
- Updated timing labels, calibration chart sizing, and README equation formatting.
- Kept the standalone calibrator HTML local and excluded it from version control; calibration is accessed through the main app.

## [1.1.1] - 2026-01-29
### Added
- `CHANGELOG.md` to track changes by version.
- `THIRD_PARTY_NOTICES.md` to document bundled third-party components and their licenses.

### Changed
- Updated displayed version/date strings in the simulator UI and README.

## [1.1.0] - 2025-11-30
### Added
- Initial release of the Plan Delivery Simulator web UI (RT Plan visualization, simulation mode, and metrics plots).
- Multi-plan comparator page embedding multiple simulator instances for side-by-side review.

