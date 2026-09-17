# Delivery-time calibration

Open **Delivery time calibration…** in the simulator's machine-limits panel. All parsing and fitting runs locally. The modal accepts complete Varian trajectory `.bin` logs (versions 2.1, 3.0, 4.0 and 5.0) and pylinac `.csv` exports. CSV requires named actual/expected leaf, gantry, collimator, jaw, MU, CP and beam-hold columns plus sampling metadata. Files can be selected together; do not select both BIN and CSV copies of the same delivery, which would count it twice. No Python installation, conversion step or companion TXT file is needed. Arbitrary CSV layouts, Dynalogs and newer/unknown binary formats are not supported.

## Binary reading

The browser reader follows the format described by pylinac's [`TrajectoryLogHeader`, `Subbeam`, and `TrajectoryLogAxisData`](https://pylinac.readthedocs.io/en/latest/_modules/pylinac/log_analyzer.html): little-endian header fields, version-dependent subbeam records and paired expected/actual float32 snapshots. Axis enums and samples-per-axis determine offsets; the two carriage samples are skipped before reading leaves. Leaf and jaw positions become millimetres, matching CSV import. Machine-scale angles use the same conversion as CSV; axis scales 1, 2 and 3 are supported. Scale 3 uses machine-scale head axes with isocentric couch coordinates; couch coordinates are not used by calibration. The v5 layout and scale-3 semantics were cross-checked against [TrajectoryLogReader](https://github.com/anmcgrath/TrajectoryLogReader/blob/main/TrajectoryLogReader/Log/AxisScale.cs) and its [native-scale converter](https://github.com/anmcgrath/TrajectoryLogReader/blob/main/TrajectoryLogReader/Util/VarianNativeScaleConverter.cs).

Only energy is read from text metadata; patient identifiers and beam names are not retained. Numeric BIN subbeam headers group internal holds into their original arc when boundaries are unambiguous. All snapshots are retained for elapsed timing, including beam-off samples. Missing payload, invalid axes, unknown versions/scales, truncated flags and CP/MU resets are rejected. A trailing two-byte CRC is skipped, not verified; this is layout/value validation, not checksum verification.

Local verification against the supplied 4.0 log and its CSV export compared 16,315 snapshots and 4,192,955 axis values. Differences were below 0.000001 in normalized units (CSV rounding); fitted correction factors differed by less than 0.000000001. A supplied version 5.0 / scale-3 log also passed decoding and the modal calibration path: 6,391 snapshots, 120 leaves, one delivery window of 127.54 s. Versions 2.1 and 3.0 have synthetic layout tests, not validation against supplied machine files. The v5 sample is a 6xFFF delivery; the modal detects its energy and fills 1400 MU/min.

## Calibration method

The tool reconstructs expected gantry, collimator, leaves, jaws and MU at integer CP starts, aligned by actual CP progression. It also interpolates measured arrival times at those same CP boundaries. The baseline remains the shared `lib/legacy-timing.js` calculation.

### Local axis response

`lib/axis-response-timing.js` first assigns each CP interval the maximum time required by its gantry, collimator, MLC and dose demands at the selected speed caps. It then compares signed CP-average velocities between adjacent intervals, including every individual leaf. The magnitude of that velocity change divided by the midpoint-to-midpoint time acts as an empirical response-demand estimate. Six simultaneous relaxation passes extend neighboring intervals when this estimate exceeds the response parameters.

This allows steady motion to retain the configured speed cap while adding time selectively around changing motion demands. A reversal is not treated as a complete system stop. Dose remains a simultaneous constraint, not an independent delay added to motion. Jaw speed, couch motion and exact servo dynamics are not modeled. These are CP-average timing estimates, not physically certified per-frame motor trajectories.

One leaf-response parameter is fitted over a 20–180 mm/s² search range in increments of 1 for TDS, or 20–1000 mm/s² in increments of 5 for RDS. The gantry/collimator acceleration settings and all speed caps remain fixed. The fitted leaf parameter is an empirical controller-response proxy, not a measured motor acceleration or proof of the machine's true limit. Manual startup and per-CP overheads are replaced in this mode, rather than added again; their saved values remain relevant to the Legacy comparison baseline.

The fit target is elapsed duration in non-overlapping windows ending at CP boundaries after approximately one second. The objective is mean absolute window error plus 0.04 times the mean absolute aggregate training-window bias per delivery. Total duration remains a reported outcome; traces are never warped to the observed timeline. The final few samples after the last CP arrival are included in total-time error but not used as a fabricated CP interval.

### Older profile compatibility and validation baseline

```
correction = median(measured whole-arc time / Legacy whole-arc time)
prediction = Legacy beam time × correction
```

This original method scales every segment equally, including configured startup/per-CP overheads. It is no longer selectable for new profiles. Its implementation remains for validation comparisons and importing existing profiles. It can fit totals while lowering predicted plateau speeds too much and leaving local slowdowns misplaced.

Both methods leave inter-beam transitions separate. Recalculation always starts with fresh uncorrected data, avoiding compounded corrections. Plot averaging never changes fitting targets or predictions.

## Comparison plots

The modal provides eight charts: CP progress, cumulative MU, unwrapped gantry/collimator angles, gantry/collimator speeds, fastest-leaf speed, and dose rate. Select a log/arc, set a centered moving-average window (default 0.4 s), hide traces with the legend, or Ctrl-wheel/pinch to zoom. Reset zoom restores all charts.

Gray traces contain actual snapshot positions or adjacent-sample rates. Fastest-leaf speed takes the largest absolute leaf displacement per sample interval. Angles are unwrapped before averaging/differentiation to avoid false spikes at 0/360. The blue trace averages the actual samples within the selected delivery, with clipped windows at its boundaries; it does not change fitted duration or profile parameters.

Orange traces simulate a reconstructed RP-like sequence using expected gantry, collimator, MLC, jaw and MU values interpolated at integer CP starts (aligned by actual CP progression). These use the exact Legacy engine and entered nominal dose rate. Position traces connect CP states; predicted speeds are segment averages, not predictions of individual logged frames. Measured and predicted traces use their own elapsed clocks, including initial simulator overhead. The final measured position is held through the last snapshot's coverage interval, consistent with fitted total duration.

The optional green trace recomputes each CP interval using the fitted local axis-response profile. Green predicted rates are time-averaged over the same window as blue measurements. The predicted average integrates the piecewise-constant rate over elapsed time, rather than giving unequal CP intervals equal weight. Preview visibility does not enable calibration in the simulator. Plots retain compact numeric traces in memory only; saved profiles still contain aggregate settings and fit diagnostics, not trajectories.

The standalone tool starts with TDS settings. Use **Load profile settings…** or edit machine settings to reproduce a specific baseline. Its downloadable profile is imported through the simulator modal. New inputs invalidate standalone results and downloads until analysis is rerun. Calibration may reject an implausible multiplier while still leaving the uncorrected comparison plots available for diagnosis.

## Scope and validation

Automatic reconstruction supports 80- and 120-leaf single-layer logs and RDS model-6 BIN logs with 114 physical leaves. RDS uses 28 distal and 29 proximal pairs, each 10 mm wide; timing considers every physical leaf, including motion hidden behind the other layer. The channel ordering follows [TrajectoryLog.NET](https://github.com/WUSTL-ClinicalDev/TrajectoryLog.NET); layer geometry follows [pylinac](https://github.com/jrkerns/pylinac/blob/master/pylinac/picketfence.py). Unavailable RDS jaw and couch channels are omitted, rather than interpreting their sentinel values as positions. Playback renders both layers.

BIN energy metadata automatically fills the workspace energy and maximum dose rate: conventional X energies use 600 MU/min; RDS FFF uses 800; TDS 6FFF uses 1400 and 10FFF uses 2400. Missing/unknown metadata and CSV require manual review. Mixed known energies or machine families are rejected. Profiles record energy and machine family; applying an RDS profile to TDS (or vice versa) is rejected. Users must still choose profiles for the correct energy and delivery mode.

The parser uses named columns, recorded sampling intervals, actual beam-hold state and machine-to-IEC angle conversion. Actual CP progression locates the commanded control points. A single-subbeam log includes internal holds within its elapsed delivery window. Multiple-subbeam BIN logs can group hold-separated runs using numeric subbeam CP markers; ambiguous mappings, truncated data and CP/MU resets are rejected. CSV still requires an unambiguous one-to-one mapping of delivery windows to declared subbeams. Time outside delivery windows is reported separately, not folded into the correction.

The supplied plan and log need not match for log-only fitting. Reconstructed log paths are proxies for planned paths; this does not prove accuracy on a new DICOM plan. Evaluate with independent matching plans and logs before relying on transfer across deliveries.

The modal reports every arc's baseline, corrected and measured duration, training mean absolute error, and held-out error. With multiple files it leaves out an entire file at a time. With multiple arcs in one file it leaves out one arc at a time. Local mode with one arc leaves out contiguous blocks of one-second windows; neither the held-out window targets nor their aggregate duration enter fitting. This cannot estimate independent-delivery generalization. Uniform mode with one arc has no holdout result. Local reports compare its held-out window error against a uniform factor fitted on the same training partition; multi-arc results also compare CP-arrival and whole-delivery errors.

## Profiles

JSON profiles use `legacy-calibrated-v1` (uniform) or `legacy-axis-response-v1` (local). They store the eight baseline settings, the fitted scalar parameter and aggregate diagnostics. Local profiles do not store measured CP arrival times or per-beam timing arrays. Raw trajectories, patient identifiers and source filenames are not exported. Multipliers outside 0.5–3 are rejected for review of input units and delivery boundaries.

Analysis prepares a profile for review. **Accept and apply to current session** restores its saved settings, enables it, recalculates the loaded plan and closes the modal. The **Calibration enabled** checkbox allows comparison with uncorrected timing. Import validates the profile before replacing the active one, restores its saved settings and enables it. Profiles survive plan loads within the page session; save/load JSON to reuse them later. Changing a baseline setting disables calibration and returns to Legacy with a visible status. Disabling or removing a profile keeps the current machine settings. Earlier throughput/experimental profiles are rejected: refit against Legacy instead of reusing their multipliers.

## Supplied-log investigation

The four-arc 6X log shows sustained CP-average gantry speeds near 6°/s and fastest-leaf speeds near 22.5 mm/s. The original whole-time factor lowered all predicted velocities, including these plateaus. Legacy also uses unsigned leaf-travel envelopes, so it misses some timing effects associated with signed velocity changes. The collimator is effectively stationary in this log; its tiny plotted motion is not useful evidence for fitting a collimator limit. The separate 6xFFF log contains substantial collimator motion and a higher dose rate, and is fitted separately.

Internal validation on the four-arc log, leaving one arc out each time:

| Metric | Uniform correction | Local response |
|---|---:|---:|
| ~1 s CP-window time MAE | 0.201 s | 0.121 s |
| CP-arrival time MAE | 1.535 s | 0.985 s |
| Whole-delivery time MAE | 1.510 s | 1.027 s |
| 0.4 s average gantry-speed MAE | 0.984°/s | 0.650°/s |
| 0.4 s average fastest-leaf-speed MAE | 3.601 mm/s | 2.437 mm/s |
| 0.4 s average dose-rate MAE | 63.79 MU/min | 46.35 MU/min |

Rate errors compare traces on their own predicted elapsed clocks against measured elapsed time, without CP/time warping. Predicted rates are treated as zero outside their delivery range. The four-arc fitted response parameter is 76 mm/s²; the separate 6xFFF fit gives 84 mm/s². On the latter, contiguous-window holdout MAE improves from 0.205 s to 0.150 s. Its rate-error improvements are in-sample, not independent holdout results.

The model was developed using these logs. Even the held-out partitions therefore provide internal development evidence rather than independent validation. Remaining discrepancies include CP interpolation, unmodeled sub-CP motion/servo response, start/end behavior and between-delivery variation. Test the profiles on new matching plans/logs, separately for 6X and 6xFFF.

The supplied RDS version-4 log contains 6,817 snapshots and three arcs. Its first arc includes internal holds; the reconstructed delivery durations are 32.66, 39.36 and 51.92 seconds. The two internal hold sections coincide with commanded zero-MU spans. The revised RDS model infers transition boundaries from cumulative MU weights, without using measured hold times. Unplanned interruptions still cannot be inferred from a new plan. Successful decoding and fitting do not establish independent prediction accuracy.

With the revised RDS model and tested settings, the fitted response parameter is 510 mm/s² and predicted arc durations are 32.25, 39.41 and 52.03 seconds. Mean training total-time error is 0.19 s, versus 0.99 s for the preceding response-only model. Leave-one-arc-out window MAE is 0.012 s (previously 0.091 s), CP-arrival MAE is 0.134 s, and whole-delivery MAE is 0.258 s. These are internal development results from one log, not independent validation.

### RDS planned transitions and plot geometry

New RDS fits save `parameters.rdsTransitionModel: "planned-zero-mu-v1"`. A forward/backward speed envelope anticipates beam start/end and entry/exit of contiguous zero-MU sections. The path distance is the largest axis displacement normalized by its speed cap; the acceleration envelope uses the configured gantry, MLC and collimator acceleration limits. Response-derived speed caps remain constraints. Zero-MU classification allows float32/interpolation residue up to max(0.0001 MU, total beam MU × 2⁻²²). The machine can accelerate through the inside of a multi-CP beam-off section: the model does not force a stop at every CP. This is an empirical coordinated-path approximation, not a vendor controller implementation.

Predicted ramps are integrated analytically to obtain interval duration and MU/position progress. Comparison plots sample those ramps, include their phase boundaries, and apply the same time-weighted averaging as other predictions. Plot smoothing does not change predicted duration. Older profiles retain their original behavior; re-analyze RDS logs and accept/save a new profile to enable the transition model. TDS fitting is unchanged.

The supplied Halcyon/Ethos trajectory specification (pages 8–10 and 13) confirms the axis enumeration and expected/actual float layout. It distinguishes the older 4.0 format from 5.1, which adds time axis 43 in the expected field. The supplied machine log is 4.0; this change does not claim 5.1 file validation or enable that unsupported version. The specification also notes that unrecorded beam pauses are omitted from the log, so snapshot elapsed time is not necessarily console wall-clock time.

Gantry and fastest-leaf speed are computed independently from axis 1 and all 114 physical leaves of axis 50, respectively. In the supplied RDS trajectory, maximum expected leaf travel is approximately 8.3 mm per 2 degrees of gantry rotation across many CP intervals. Their similarly shaped speed curves therefore reflect the commanded path. Leaf identity changes across samples; stationary leaves remain zero. The collimator deviations in this log are tiny and are not used to infer a motion limit.
