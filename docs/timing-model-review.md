# Delivery-time model review

Reviewed 2026-09-17 against local commit `9667764`. User observation: predictions are approximately 10–15% shorter than actual 6X VMAT delivery; trajectory logs are available but fitted calibration values fluctuate. Machine model and the exact measurement interval have not yet been established.

The review traced the timing calculation, direct DICOM parsing, both ESAPI exporters, comparator integration, CSV export, playback, and documented calibration workflow. No measured logs or patient plans were supplied. Numerical examples below execute functions extracted from the current simulator with synthetic inputs; they establish implementation defects, not the size of their contribution to the observed clinical discrepancy. No production algorithms were changed.

## Findings, in priority order

### 1. High: continuous motion solver is not a valid general minimum-time solver

Location: `RP_Delivery_Simulator.html:3318`, `calculateContinuousMoveTimesForDistances`.

It calculates feasible speeds at CP boundaries, then uses `2 * distance / (entrySpeed + exitSpeed)`. This assumes a particular within-segment velocity profile, omits an interior speed peak/cruise phase, and returns zero when both boundary speeds are zero.

Reproductions with maximum speed 10 and acceleration 10:

| Motion | Current result | Correct rest-to-rest minimum |
|---|---:|---:|
| Single segment of distance 100 | 0 s | 11 s |
| Same path divided into two distances of 50 | 20 s total | 11 s total |

Thus the error can have either sign and depends on CP subdivision. A global correction factor cannot repair it.

Recommended correction: calculate triangular/trapezoidal time using distance plus entry and exit velocities. For a monotonic segment with nonnegative boundary speeds, the unconstrained peak speed is `sqrt(a*d + (v0² + v1²)/2)`; cap at `vmax`, integrate acceleration/deceleration distances, and include any cruise distance. Enforce valid boundary conditions and check subdivision invariance.

### 2. High: leaf reversals and cross-axis synchronization are not enforced

Locations: `RP_Delivery_Simulator.html:3412` and `:3472`.

Leaf displacements are converted to absolute distances before solving. The model therefore treats a leaf moving `0 → 1 → 0` like one moving `0 → 1 → 2`, despite the former requiring a velocity reversal. The synthetic reversal at speed/acceleration limits 10/10 takes 0.8944 s in the current solver, versus at least 1.2649 s with rest at the beginning, reversal, and end.

Additionally, each axis is optimized independently, and the final segment duration is the maximum of the independent times. There is no subsequent check that the implied synchronized trajectory maintains continuous, bounded velocities/accelerations through CPs. Independent durations are useful constraints but are not a proof of a physically feasible joint trajectory.

Recommended correction: retain signed positions for every physical axis, enforce reversal/stationary constraints, and solve a common segment schedule. After extending a segment for dose delivery or another axis, recompute/check feasible boundary velocities. Explicitly model whether movement can continue through zero-MU intervals. This is a plausible contributor to underestimated modulated-arc time, but logs are needed to measure the effect.

### 3. High for dual-layer machines: aperture geometry is being used as a motor trajectory

Locations: `RP_Delivery_Simulator.html:3388`, `:3406`, `:3514`; ESAPI leaf exporters at `PlanDeliverySimulator-Launcher.cs:798` and `PlanDeliverySimulator-MultiPlanComparator-Launcher.cs:1350`.

`getEffectiveMLCPositionsForCP` merges layers into the most restrictive aperture. It is appropriate for aperture metrics but can hide real motor travel. A stationary layer with edges `[0,10]` combined with another whose left edge moves `-20 → -10 → -20` has an unchanged effective aperture; the timing calculation sees zero displacement although a physical leaf travels 20 mm.

Use every physical leaf in every layer for kinematics, matched by stable device/layer/bank/leaf identifiers. Keep effective aperture positions for geometry. This finding is conditional on the user's machine having multiple MLC layers.

### 4. High: DICOM interpretation has independent correctness defects

Locations: `RP_Delivery_Simulator.html:1628`, `:2872`, `:2907`, `:2956`, `:2965`, `:3436`, `:3460`, `:3796`.

- `FinalCumulativeMetersetWeight` maps to `300A,0084`; its correct tag is `300A,010E`. The model also multiplies beam MU by raw weight changes without dividing by the final weight. A 100-MU static beam at 600 MU/min takes 10 s with weights 0–1 but 1000 s with weights 0–100. These encodings should give the same result. Final weight is not a valid replacement for missing absolute beam meterset.
- `GantryRotationDirection` maps to `300A,0118` (wedge position), rather than `300A,011F`, and is read at beam level rather than from CPs. The direction helper recognizes `CW`/`CCW`, while DICOM uses `CW`/`CC` and ESAPI exports enum names via `ToString()`. Inference can mask this for dense monotonic arcs, but cannot reliably handle all sparse arcs, reversals, or full turns. Equal angles with explicit rotation can represent 360°, whereas the modulo calculation returns zero. Normalize the input conventions before calculating signed travel.
- Dose rate for segment `i−1 → i` prefers CP `i`. DICOM specifies Dose Rate Set for the segment beginning at that CP; use CP `i−1`. A synthetic 100-MU segment with CP0=600 and CP1=100 currently returns 60 s instead of 10 s. This does not affect beams with a constant setting.
- MLC positions are initialized empty at each CP without retaining unchanged device state. A valid static-aperture beam with MLC positions only at CP0 loses those positions afterward. Preserve permitted unchanged state, and flag missing changing-device data rather than treating it as no motion. Typical VMAT exports that explicitly specify moving leaves at all CPs are less affected.

The meterset, rotation, and dose-rate requirements come from the [DICOM RT Beams module](https://dicom.nema.org/medical/dicom/current/output/chtml/part03/sect_c.8.8.14.html). Unchanged parameter examples are in the [Control Point Sequence specification](https://dicom.nema.org/medical/dicom/current/output/chtml/part03/sect_C.8.8.14.5.html); full-turn semantics are in [Machine Rotations](https://dicom.nema.org/medical/dicom/current/output/chtml/part03/sect_C.8.8.14.8.html).

Normalize meterset once on ingestion and use the normalized representation in timing, CSV export, delivered MU, and plots. Test equivalent DICOM and ESAPI inputs against one canonical beam representation.

### 5. Medium: fixed overhead per CP creates artificial CP-count dependence

Locations: `RP_Delivery_Simulator.html:3147`, `:3473`.

The default adds 20 ms to every segment. A static 100-MU beam at 600 MU/min changes from 10.02 s with 2 CPs to 12.00 s with 101 equivalent CPs. This is not evidence of a real controller delay. A log sampling interval is not itself an overhead per planned CP.

Replace this with separately identified beam-start, restart, planned beam-off, and controller effects. If controller timing quantization is confirmed, represent quantization explicitly instead of adding an unconditional delay. Retain a per-CP empirical term only if it survives validation across different CP spacings. This term currently increases predicted time, so it cannot by itself explain the reported underprediction.

### 6. Medium: missing jaw constraints and incomplete total-plan timing

Locations: `RP_Delivery_Simulator.html:3362`, `:3968`, `:4006`.

Jaws are parsed/exported but omitted from the duration constraints. Moving jaws can therefore never limit delivery. Add jaw speed/acceleration constraints when jaw tracking is used, then validate their importance from logs.

Inter-beam timing includes only gantry/collimator/effective-MLC travel. It omits couch repositioning and workflow delays. Its triangular move formula is also wrong: `2*sqrt(d/(2*a))` should be `2*sqrt(d/a)`. At distance 1 and acceleration 10 it returns 0.4472 s instead of 0.6325 s, about 29.3% low. This affects inter-beam moves, not the main per-arc solver.

Expose separate quantities: individual arc elapsed delivery time, summed arc delivery times, mechanical transitions, and additional workflow time. Compare like with like.

### 7. Medium: calibration cannot currently be reproduced from this checkout

Locations: `README.md:142`, `RP_Delivery_Simulator.html:2704`, `:3123`, `:3260`, `:2774`.

The README references `RP_Trajectory_Timing_Calibrator.html`, but that file is absent. The only checked-in tests cover axis presets. New plan loading resets the speed/acceleration and overhead settings, so a manual calibration can silently disappear. RDS/TDS defaults are broad categories, selected from the first beam, rather than versioned per-machine calibration profiles. The comparator uses embedded simulator pages, so these limitations carry through to comparisons.

Persist machine/energy/delivery-mode calibration independently of plot-axis presets, with model version, units, data provenance, and fitted uncertainty. Export the active profile with predictions. Validate positive finite machine limits; `parseFloat(...) || default` currently accepts negative values.

CSV export writes the initial timestamp as zero even when beam-start overhead is nonzero. Align export timestamps with the documented time origin. Playback also adds browser scheduling effects and does not consistently account for start overhead; animation wall time should not serve as the calibration measurement.

## A more stable calibration workflow for the reported 6X discrepancy

### Define and audit the measurement before fitting

1. Group by actual treatment unit, energy/mode (6X separately from FFF), delivery technique, and relevant controller/model version. Machine identity is not adequately represented by an MLC model substring.
2. Match each log to its beam and planned MU. Verify completion, units, actual versus expected channels, sampling interval from metadata, subbeam boundaries, and clock/counter resets. Identify interrupted or resumed deliveries explicitly.
3. Record elapsed delivery from a consistent first-delivery boundary to completion, including planned zero-MU motion and internal pauses. Record irradiation-active time and hold time separately when state channels permit. Do not count only samples with positive MU increments: cumulative MU may have plateaus, and zero-MU motion is still delivery time.
4. For a predictor of routine uninterrupted delivery, separate unplanned holds rather than absorbing them into motor parameters. Keep those holds for a separate wall-time/workflow model.
5. Compare repeated deliveries of the same beam. Report median and interquartile range per beam before looking across different plans. Variation within the same beam and variation between different plans imply different problems.

### Use stable observations rather than noisy per-sample derivatives

Compare cumulative time at matched planned/actual MU landmarks, with CP/gantry information to disambiguate repeated MU values. Flat-MU intervals must remain represented. Inspect timing residuals over the arc: a steadily growing residual suggests a scale/rate discrepancy; a start offset suggests startup delay; localized increases suggest modulation, synchronization, or holds. These are diagnostic hypotheses, not unique diagnoses.

For motion diagnostics, unwrap gantry angles and estimate slopes over finite windows or local fits. Sweep reasonable window sizes instead of differentiating adjacent samples twice. Do not smooth across reversals or hold boundaries. Fit signed, identified leaf traces: the derivative of the maximum displacement across different leaves is not one leaf's acceleration.

A published TrueBeam log study reports 20-ms sampling and measures speeds over selected motion intervals, which supports interval-based diagnostics; use each file's metadata rather than hardcoding that period. [Able et al., 2016](https://link.springer.com/article/10.1186/s13014-016-0602-1).

### Fit few identifiable parameters, then validate on unseen plans

- Fix the deterministic defects first. Otherwise calibration parameters compensate for bugs and depend on the calibration plan mix.
- Start with a robust baseline `T_measured = startup + scale * T_physics`, fitted across beams rather than independently to each log. Use a robust loss, nonnegative startup, plausible bounds, and equalized plan/beam weighting. Compare against an offset-only and a scale-only model; offset and scale themselves can be difficult to distinguish if all arcs have similar durations.
- Estimate speed/acceleration limits from trajectories and dedicated motion tests, not solely total beam times. Ordinary dose-limited arcs cannot reliably identify MLC maximum acceleration; a limit that never binds has little information in the objective. Keep unsupported parameters fixed.
- Add further terms only if residuals justify them: dose-rate response, jaw tracking, reversal/synchronization cost, planned restart latency. Avoid simultaneously fitting every limit plus per-CP and per-beam overhead from total time alone.
- Split validation by patient/plan, keeping repeated fractions of a beam together. Also test a later-date holdout. Report signed bias, MAE in seconds and percent, and 95th-percentile absolute error, stratified by dominant timing constraint.
- Bootstrap at patient/plan level to assess parameter and prediction uncertainty. If parameters change widely but held-out predictions remain stable, the parameters are not uniquely identified; report the prediction interval rather than claiming measured machine constants. If predictions also fluctuate, inspect endpoint definitions, hold handling, and missing model structure.

If “10–15% short” means `prediction/actual = 0.85–0.90`, the corresponding multiplier is approximately **1.11–1.18**, not necessarily 1.10–1.15. This is only a provisional bias estimate. Derive any correction from consistently defined local measurements and held-out validation.

A recent constraint-based study validated against 26 TrueBeam STx VMAT arcs and reported a mean delivery-time error of −0.8 ± 0.8 s. It supports investigating physics plus log validation, but its result does not establish achievable accuracy on this machine or with this implementation. Only the abstract was reviewed. [Miura et al., 2026](https://pubmed.ncbi.nlm.nih.gov/42645749/).

## Recommended implementation sequence

1. Extract one pure timing module shared by the simulator and a restored calibration tool. Add analytic motion tests, signed reversal/stationary tests, CP subdivision invariance, DICOM normalization tests, and equivalent-import tests.
2. Correct the solver and import semantics; use physical leaves and include relevant jaws. Export per-segment component constraints and timing residuals for diagnosis.
3. Build deterministic log ingestion, endpoint/hold classification, and repeat-delivery summaries.
4. Fit a small versioned per-machine/energy calibration profile and evaluate on held-out plans. Expand the controller model only where the remaining residuals support it.

Without actual paired plans/logs, this review cannot attribute the reported 10–15% bias to a particular finding or promise a percentage improvement.
