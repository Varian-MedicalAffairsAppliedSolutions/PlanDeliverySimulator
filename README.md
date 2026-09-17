# DICOM RT Plan Delivery Simulator - README

<p align="center">
  <img src="docs/images/simulator-screenshot-2.png" alt="Simulator screenshot" width="980" />
</p>

**Version:** 1.2.0<br>
**Author:** Taoran Li, PhD  
**Date:** Sep 17, 2026<br>
**Changelog:** `CHANGELOG.md`  
**Third-Party Notices:** `THIRD_PARTY_NOTICES.md`  
**License:** `License`

## How to Cite
Use GitHub's "Cite this repository" button or the citation below.

Li, T. (2026). DICOM RT Plan Delivery Simulator (Non-Clinical/Research-Only) (v1.2.0) [Software]. Varian Medical Affairs Applied Solutions. https://github.com/Varian-MedicalAffairsAppliedSolutions/PlanDeliverySimulator

---

> © 2025–2026 Taoran Li. All rights reserved. This software is provided "as is" for educational and research purposes only. It is not intended for clinical use, patient diagnosis, or treatment planning. The accuracy of simulations and any derived data is not guaranteed. The user assumes all responsibility for the use of this software.

> This project is licensed under the Varian Limited Use Software License Agreement (`License`). It is **not** an open-source project. Third-party open-source components (if any) retain their original licenses; see `THIRD_PARTY_NOTICES.md`.

---

## 0. Versioning & Release Notes
* Update release notes in `CHANGELOG.md`.
* Keep displayed version strings in sync across:
  * `README.md`
  * `RP_Delivery_Simulator.html`
  * `RP_MultiPlan_Comparator.html`
  * `gate/index.html`
* If bundled libraries or remote resources change, update `THIRD_PARTY_NOTICES.md`.

## 1. Overview
The DICOM RT Plan Delivery Simulator is a web-based tool designed to visualize and analyze the delivery sequence of DICOM RT Plan files. It allows users to:

### Additional Screenshot
<p>
  <img src="docs/images/simulator-screenshot-1.png" alt="Simulator screenshot (additional view)" width="980" />
</p>

* Load DICOM RT Plan files (`.dcm`).
* Load and overlay RT Structure Sets (RTSTRUCT) in the BEV as an anisotropic Gaussian point cloud.
* Visualize the Beam's Eye View (BEV) including MLC and jaw positions.
* Animate the plan delivery either at a fixed speed or by simulating delivery based on configurable machine speed and acceleration limits.
* View dynamic parameters such as gantry angle, collimator angle, and simulated time.
* Inspect various calculated metrics related to plan complexity and deliverability, including:
    * Device speeds (gantry, MLC, collimator, jaws) and accelerations.
    * Dose rate.
    * MIsport (Modulation Index for SPORT, adapted from Li & Xing, 2013).
    * Local MIt (Local Modulation Index total, adapted from Park et al., 2014).
    * Overall MCSv (Modulation Complexity Score for VMAT, adapted from Masi et al., 2013).
    * Avg Leaf Gap (average leaf opening, mm).
    * Plan Complexity (Younge et al. aperture complexity metric, mm⁻¹).
* Examine these metrics through static radial plots and dynamic XY-time plots (in simulation mode).

The tool aims to provide insights into the mechanical aspects of VMAT plan delivery for educational and research applications.

---

## 2. System Requirements

This tool is designed to run in a modern web browser and has no other software dependencies.

*   **Recommended Browsers:** For the best performance and compatibility, please use the latest version of:
    *   **Google Chrome** ([Download](https://www.google.com/chrome/))
    *   **Mozilla Firefox** ([Download](https://www.mozilla.org/firefox/new/))

*   **Other Supported Browsers:** The tool is also compatible with:
    *   Microsoft Edge (latest version)
    *   Safari (version 14 or newer)

*   **Unsupported:** Internet Explorer is not supported.

*   **Hardware Requirements:**
    *   Minimum 4GB RAM (8GB+ recommended for complex cases)
    *   Modern graphics card supporting HTML5 Canvas
    *   Sufficient storage for DICOM files (typically 50-500MB per plan)

For users in environments with software installation restrictions, please contact your IT department to request that a supported browser be installed.

---

## 3. How to Use

### Load DICOM RT Plan File:
1. Drag and drop your DICOM RT Plan (`.dcm`) file onto the designated "Drag & Drop" area.
2. Alternatively, click the "Choose File" button and select your `.dcm` file.

Upon successful loading, overall plan information (patient name, ID, plan label, total beams, total MU, primary dose rate) will be displayed. Individual beam details, including an overall MCSv (Modulation Complexity Score for VMAT, adjusted for collimator rotation), will also be shown.

### Load RT Structure Set (optional):
1. Drag and drop an RTSTRUCT (`.dcm`) file onto the same drop zone or use the file chooser.
2. Structures render in the BEV as an anisotropic Gaussian point cloud: X/Y sized by in-plane spacing, Z elongated by slice thickness. X is mirrored on parse (LPS +X → RAS –X) so left/right align with BEV.
3. Use the structure list to show/hide items; targets (PTV/CTV/GTV/ITV/TARGET) are surfaced at the top of the list. The list now shows up to 200 entries.
4. Fine-tune visuals in the **Fine Tune Visualization** block (below the BEV): Structure transparency, MLC transparency, and point blur (sigma) for structures.

### Configure Simulation Parameters (Optional):
1. Navigate to the "Machine Speed & Acceleration Limits (for Simulation)" section.
2. Adjust the maximum speeds and accelerations for Gantry, MLC, and Collimator. These values are used when the "Simulate Delivery" mode is active.
3. Optional timing knobs:
   * **Beam Start Overhead (ms)**: adds a fixed delay at beam start in simulated time.
   * **Per-CP Overhead (ms)**: adds a fixed overhead to each control point-to-control point segment in the standard model. A log sampling interval is not evidence of a delay per planned CP.
4. Default values may be set based on the `ManufacturerModelName` tag in the DICOM file (e.g., different defaults for "RDS" vs. "TDS" machines).
5. Click "Apply & Recalculate Simulation" to apply changes. This will re-initialize the visualization and recalculate simulation-dependent metrics if a plan is loaded.

### Select Beam (if multiple exist):
1. If the loaded plan contains multiple beams, a "Select Beam" dropdown menu will appear above the BEV visualization.
2. Choose the beam you wish to analyze. The visualization and metrics will update accordingly.

### Choose Playback Mode & Interact:
* **Toggle Mode**:
    * Click the "Simulate Delivery" / "Use Fixed Speed Animation" button to switch between modes.
    * **Fixed Speed Animation**: Animates through control points at a constant rate (`FIXED_ANIMATION_SPEED_MS`). Device speeds are calculated per control point step.
    * **Simulate Delivery**: Animates based on calculated segment delivery times, considering machine limits. Device speeds are calculated in units per second (°/s, mm/s). XY-time plots become active in this mode.
* **BEV Controls**:
    * **Play/Pause** (or **Play Simulation/Pause Simulation**): Start or stop the animation.
    * **Reset**: Resets the animation for the current beam to the first control point.
* **Audible Feedback**:
    * Check "Beep per MU (Sim Mode)" to enable an audible beep for each (integer) MU delivered during "Simulate Delivery" mode (max 20 beeps/sec, requires Tone.js).
* **Parameter Exploration**:
    * **Radial Plots**: Hover your mouse cursor over the static radial plots (Gantry Speed, Max MLC Speed, Collimator Speed, Dose Rate, Avg Leaf Gap, Plan Complexity (Younge), MIsport, Local MIt) to scrub through control points. The BEV and parameter display will update. These plots visually exclude the first and last CPs for MIsport and Local MIt due to their rolling window calculation.
    * **Control Point Slider**: Use the slider below the radial plots to manually select a control point.
    * **Parameter Display**: Shows values for the currently selected/animated control point, including gantry/collimator angles, speeds, dose rate, MIsport, and Local MIt.
* **Fine Tune Visualization**: Adjust structure transparency, MLC transparency, and point blur (sigma) in the block directly under the BEV.

### Registration / Launcher Compatibility
* If you deploy behind a registration gate, keep the gate HTML in front of the simulator so users must acknowledge terms.
* ESAPI launcher compatibility: point your launcher to the packaged HTML (e.g., `/opt/taoran/downloads/RP_Delivery_Simulator.html`) so it opens cleanly after export; adjust the path if you relocate the file.
* **XY-Time Plots (Simulate Delivery Mode Only)**:
    * These plots show Gantry, MLC, Collimator metrics (speed and acceleration), and Dose Rate versus simulated time.
    * **Interaction**:
        * **Zoom**: Use the mouse wheel. (Shift + Wheel for X-axis zoom, Ctrl/Cmd + Wheel for Y-axis zoom).
        * **Pan**: Click and drag.
        * **Reset View**: Click the "Reset View" button below each plot to return to the default zoom/pan.

### Clear Data:
* Click "Clear All Data & Visuals" to remove the loaded plan, reset all visualizations, and clear input fields.

### Recorded BIN Playback

Click **Load trajectory log for playback…** under the machine controls and select a trajectory `.bin` file. The **existing simulator BEV** displays recorded leaves, jaws, gantry and collimator positions. The normal **Play/Pause**, **Reset**, and slider controls operate the recorded timeline at 1× real time. A 20 ms log advances one recorded snapshot per 20 ms of elapsed time; slower browser redraws catch up to the clock rather than extending delivery time. Holds and recorded between-arc intervals are retained.

Machine settings, calibration and other inputs are grayed out and disabled during playback. **Exit playback** restores the previous simulation controls and loaded plan. Patient structures are hidden because a BIN file does not establish a matching plan or patient coordinate frame.

Playback uses actual snapshots without CP reconstruction, smoothing or simulated timing. Display coordinates are converted to the simulator's IEC convention, and leaf/jaw positions to mm. Millennium 120 and HD120 MLC geometry is selected from the BIN's model identifier; other models are rejected. Dials and radial plots show rates calculated from adjacent actual snapshots, with scales based on recorded maxima. Playback stops at the last recorded timestamp. Flagged partial logs and CP/MU resets can be replayed, but incomplete binary payloads are rejected. Calibration continues to require complete monotonic deliveries.

Coordinate conversion follows [TrajectoryLogReader's native-scale converter](https://github.com/anmcgrath/TrajectoryLogReader/blob/main/TrajectoryLogReader/Util/VarianNativeScaleConverter.cs); MLC identifiers follow [pylinac's trajectory header documentation](https://pylinac.readthedocs.io/en/latest/log_analyzer.html#pylinac.log_analyzer.TrajectoryLogHeader).

### Delivery Time Calibration (Optional)

The simulator uses the standard timing model by default. Log profiles can apply local axis-response timing or a uniform whole-delivery correction.

1. Set the intended machine speed, acceleration and overhead settings.
2. Click **Delivery time calibration…** under the simulator machine limits.
3. Select complete **Varian trajectory `.bin` logs or pylinac `.csv` exports** from the same machine, energy and mode, enter the nominal log dose rate, choose **Local axis response (~1 s windows)** or **Uniform whole-delivery correction**, and analyze. Automatic log calibration supports single-layer 80- or 120-leaf MLCs.
4. Review arc totals, fit errors and raw/averaged/predicted comparison plots. Select a delivery and an averaging window; the window affects plots only. In the modal, check **Apply calibration** to enable the correction.
5. **Save profile…** in the modal exports a JSON file. **Load profile…** restores its baseline machine settings and enables the correction. Disable the checkbox to compare with the uncorrected standard model.

Direct BIN reading supports trajectory versions **2.1, 3.0, 4.0 and 5.0**, including machine/isocentric-couch scale 3. The reader uses the header/subbeam/snapshot layout documented by [pylinac](https://pylinac.readthedocs.io/en/latest/_modules/pylinac/log_analyzer.html). No Python installation or CSV conversion is required.

Local calibration fits CP-window timing using competing speed/dose demands and neighboring signed axis-velocity changes. It preserves machine speed caps and replaces manual overheads. Uniform mode retains the median whole-delivery time-ratio fit. It keeps inter-beam transitions separate and requires no matching plan for log-only fitting. Changed machine settings disable an incompatible correction. Profiles from the removed experimental models must be refitted against the standard model. See [method and limitations](docs/log-calibration.md).

---

## 4. Simulation and Calculation Details

### 4.1. Parsing and Initial Data Processing
The simulator parses standard DICOM RT Plan tags, including `BeamSequence`, `ControlPointSequence`, `BeamLimitingDeviceSequence` (for MLCs and Jaws), and `FractionGroupSequence` (for beam meterset).
MLC leaf boundary positions are extracted from `LeafPositionBoundaries`.
Effective MLC positions are determined for multi-layer MLC systems by taking the most restrictive position for each leaf pair across layers.

### 4.2. Segment Time Calculation (`calculateSegmentTimes`)
The method for calculating the duration of each segment (time between two consecutive control points) depends on the active mode:

#### Fixed Speed Animation Mode:
* Animation proceeds at a fixed interval (`FIXED_ANIMATION_SPEED_MS`, e.g., 100ms) per control point.
* Device "speeds" are calculated as the change in parameter value per control point step (e.g., °/CP, mm/CP).
* Accelerations are not explicitly calculated in this mode for display but are implicitly zero if speed per CP is constant.
* Local MIt will show 0.000 as it relies on time-based speeds/accelerations.

#### Simulate Delivery Mode:
This mode estimates segment durations based on device kinematics and MU delivery requirements (see `calculateSegmentTimes` in `RP_Delivery_Simulator.html`).

* **Inputs / limits**
  * Max speeds/accels are taken from the UI if set (e.g., `currentMaxGantrySpeed`), otherwise from machine defaults.
  * Dose delivery is limited by `DoseRateSet` (when available) and/or the plan’s `primaryDoseRate`.
  * Optional overheads:
    * `currentBeamStartOverheadSec` is added once per beam.
    * `currentSegmentOverheadSec` is added to every segment.

* **Per-segment deltas (CP i-1 → CP i)**
  * `deltaGantryAngle`: normalized via `normalizeGantryAngleDiff`.
  * `deltaCollAngle`: absolute collimator delta wrapped to ≤ 180°.
  * `maxLeafTravel`: max absolute effective leaf travel (using `getEffectiveMLCPositionsForCP` so RDS dual-layer is handled).
  * `deltaDose`: `(beam.totalMeterset * deltaMetersetWeight)` where `deltaMetersetWeight` is `Δ cumulativeMetersetWeight`.
  * `doseRateSet`: from CP tags (fallbacks applied).

* **Minimum motion times (trapezoidal/triangular profile)**
  * Gantry and collimator times are computed with `calculateContinuousMoveTimesForDistances(distances, maxSpeed, maxAccelDecel)`.
  * MLC time is computed similarly; when per-leaf distances are available, the segment MLC time is the max over all leaves.

* **Dose time**
  * `timeDose = deltaDose / (doseRateSet / 60)` (seconds). If `doseRateSet` is 0 or `deltaDose` is 0, `timeDose` becomes 0.

* **Segment duration & cumulative time**
  * `baseSegmentDuration = max(timeGantry, timeMlc, timeColl, timeDose)`
  * `segmentDuration = baseSegmentDuration + currentSegmentOverheadSec`
  * `cumulativeSimTime` starts at `currentBeamStartOverheadSec` and sums `segmentDuration` over all segments.
  * The simulator also records a `limitingComponent` label for which component dominated `baseSegmentDuration`.

* **Displayed averages/capabilities**
  * `motionDuration = max(1e-9, segmentDuration - currentSegmentOverheadSec)`
  * `avgGantrySpeed = deltaGantryAngle / motionDuration`
  * `avgMlcSpeed = maxLeafTravel / motionDuration`
  * `avgCollSpeed = deltaCollAngle / motionDuration`
  * `avgDoseRate = (deltaDose / segmentDuration) * 60` (MU/min)
  * Capability (%) shown in the UI is `avg / max * 100` for each component.

### 4.2.1. RT Structure display (RS)
* **Parsing & mirroring**: RTSTRUCT contours are read in LPS, then converted to RAS with X negated (LPS +X → RAS –X) so BEV left/right align with labels.
* **Projection & frame**: RS uses the same beam frame and projection as MLCs/jaws; WebGL flips Y to match the 2D canvas.
* **Point cloud model**: Structures render as anisotropic Gaussian points. X/Y scale with in-plane spacing; Z elongates with slice thickness. The “Point blur (sigma)” slider scales the Gaussian footprint size; structure transparency sets the alpha (up to ~60% of legacy max).
* **Visibility controls**: The structure list shows up to 200 entries and prioritizes PTV/CTV/GTV/ITV/TARGET names at the top.

### 4.3. Calculated Quantities and Metrics

#### 4.3.1. Basic Parameters
* **Gantry Angle, Collimator Angle, MLC Positions, Jaw Positions, Cumulative MU Weight**: Directly from DICOM.
* **Dose Rate (Estimated)**:
    * In **Simulate Delivery** mode: `doseRate = (deltaMU / segmentDuration) * 60` (MU/min), where `deltaMU = beam.totalMeterset * deltaMetersetWeight`.
    * If the plan total MU is 0, the UI displays "MUwt" (meterset weight) for consistency.

#### 4.3.2. Device Speeds and Accelerations
* Calculated as described in Section 4.2. Units change based on mode (/CP vs. /s, /s²).
* Displayed in the "Calculated Values (Current CP)" section and plotted in radial/XY-time plots.

#### 4.3.3. Overall MCSv (Modulation Complexity Score for VMAT)

The simulator computes an **MCSv-like** score per beam in `calculateMCSForScope`. The following describes the implemented formulation.

For each segment, `meanAAV` is the mean of its endpoint AAV values. Each endpoint AAV compares aperture area with the maximum aperture area seen in the beam. The segment's `normalizedLSV` uses its maximum leaf travel, **d**, in mm:

```math
L = \frac{1}{1 + d/10.0}
```

The collimator rotation factor uses the segment's angular travel **Δθ** and constant **c**, corresponding to `COLLIMATOR_WEIGHTING_FACTOR`:

```math
R = 1 + c\,\Delta\theta
```

The final MU-weighted score is:

```math
\mathrm{MCSv} = \frac{\sum_{j} A_{j}\,L_{j}\,R_{j}\,w_{j}}{\sum_{j} w_{j}}
```

Here, **j** indexes segments; **A** is `meanAAV`, **L** is `normalizedLSV`, **R** is `collimatorRotationFactor`, and **w** is `muWeightSegment`.

#### 4.3.4. MIsport (Modulation Index for SPORT)

Calculated per CP in `calculateModulationIndex(beamData, cpIndexS, K)`. For a center CP **s**, let **W(s)** be its neighboring CPs, excluding **s** itself. The UI uses `K_3_PERCENT = max(1, ceil(numControlPoints * 0.03))` to set the neighborhood size.

```math
\mathrm{MI}(s) = \sum_{k \in W(s)} D(s,k)\,\bigl(1 + c\,C(s,k)\bigr)\,Q(s,k)
```

Here, **D** is the sum of absolute leaf travel between CPs **s** and **k**, **C** is their collimator angular travel, and **c** is `K_MISPORT_COLL`. The MU-per-degree factor **Q** uses gantry angular travel **G** and MU difference **ΔM**:

```math
Q(s,k) = \begin{cases}
0, & G(s,k) \leq \varepsilon, \\
\dfrac{\Delta M(s,k)}{G(s,k)}, & G(s,k) > \varepsilon.
\end{cases}
```

The threshold **ε** is `MI_GANTRY_DIFF_EPSILON`. If **m** is `cumulativeMetersetWeight` and **M** is `beam.totalMeterset` (the implementation falls back to 1 when it is missing or zero), then:

```math
\Delta M(s,k) = \left|m(k)-m(s)\right|\,M
```

Displayed in the modulation radial plot, excluding the first/last `K` CPs because the window is truncated near the boundaries.

#### 4.3.5. Local MIt (Local Modulation Index total)

Calculated per CP as `localMItFactor` in the derived-metrics code.

The implementation defines a symmetric window **W(s)** around CP **s**, using `K_3_PERCENT = max(1, ceil(numControlPoints * 0.03))`. It computes the global standard deviations of MLC speed and acceleration as `sigmaMlcSpeed` and `sigmaMlcAccel`.

For each CP **i**, the activity flag **N** is 1 when either condition holds:

- `mlcSpeed > sigmaMlcSpeed`, with `sigmaMlcSpeed > 0.001`.
- `abs(mlcAcceleration) > MIT_ALPHA * sigmaMlcAccel`, with `sigmaMlcAccel > 0.001`.

Otherwise, **N** is 0. Active CPs use the following weighting function for subsequent dynamics, when available:

```math
F(x) = 1 + (\beta-1)\bigl(1-\exp(-\gamma |x|)\bigr)
```

Here, **β** is `MIT_BETA` and **γ** is `MIT_GAMMA`. The gantry-acceleration weight **g**, dose-rate-change weight **u**, and collimator-acceleration weight **c** correspond to `WGA`, `WMU`, and `WCA`. Unavailable weights default to 1.

```math
\mathrm{MIt}(s) = \frac{1}{|W(s)|}\sum_{i \in W(s)} N_{i}\,g_{i}\,u_{i}\,c_{i}
```

The denominator is the number of CPs in the window. The window is truncated near the start/end of the CP list. Results are displayed in the radial plots.

#### 4.3.6. Avg Leaf Gap (Average Leaf Opening)

Calculated as `avgLeafGap` by `calculateAverageLeafGap`, using the effective MLC aperture at each CP.

For every open leaf pair, multiply its opening (`bankB - bankA`) by its leaf width and sum these contributions into aperture area **A**. Sum the same leaf widths into open height **H**. The average opening, in mm, is:

```math
\mathrm{gap} = \begin{cases}
A/H, & H > 0, \\
0, & H = 0.
\end{cases}
```

Beam-level and plan-level summaries are MU-weighted averages across control-point segments; see `computeBeamApertureSummaryMetricsFromControlPoints` and `updateOverallPlanInfoDisplay`.

#### 4.3.7. Plan Complexity (Younge et al. Aperture Complexity)

Calculated as `edgeComplexity`, displayed as **Plan Complexity (Younge)**. The implementation uses leaf-side perimeter **P** (excluding leaf-end perimeter), aperture area **A**, and constant **c** (`EDGE_COMPLEXITY_C2`):

```math
E = \frac{c\,P}{A}
```

Units are inverse millimetres. The value is 0 when the aperture area is approximately 0. Beam-level and plan-level summaries are MU-weighted averages across control-point segments.

---

## 5. User Customizable Parameters (Speed & Acceleration Limits)
These parameters are found under "Machine Speed & Acceleration Limits (for Simulation)" and affect calculations only when "Simulate Delivery" mode is active.

* **Max Gantry Speed (°/s)**: `maxGantrySpeedInput` (Default: 6 or 12, machine-dependent)
* **Max Gantry Accel/Decel (°/s²)**: `maxGantryAccelDecelInput` (Default: 12)
* **Max MLC Speed (cm/s)**: `maxMlcSpeedInput` (Default: 2.25 or 5.0, machine-dependent) - internally converted to mm/s.
* **Max MLC Accel/Decel (cm/s²)**: `maxMlcAccelDecelInput` (Default: 10) - internally converted to mm/s².
* **Max Coll Speed (°/s)**: `maxCollimatorSpeedInput` (Default: 9)
* **Max Coll Accel/Decel (°/s²)**: `maxCollimatorAccelDecelInput` (Default: 10)
* **Beam Start Overhead (ms)**: `beamStartOverheadMsInput` (Default: 0) - added once per beam.
* **Per-CP Overhead (ms)**: `segmentOverheadMsInput` (Default: 20) - added once per CP-to-CP segment.

Clicking "Apply & Recalculate Simulation" updates these limits and re-runs `initVisualization()`.

---

## 6. Key Internal Constants
* `FIXED_ANIMATION_SPEED_MS`: (e.g., 100) Milliseconds per CP in fixed speed animation mode.
* `MAX_BEEPS_PER_SECOND`: (e.g., 20) Limits MU beeps in simulation mode.
* `ACCEL_CHECK_FACTOR`: (Unused) Present in code but not currently used by `calculateSegmentTimes`.
* `MI_SPORT_K_NEIGHBORS`: (Unused) Present in code; current UI uses `K_3_PERCENT = max(1, ceil(numControlPoints * 0.03))`.
* `MI_GANTRY_DIFF_EPSILON`: (e.g., 0.001) Small gantry angle difference threshold for MIsport.
* `K_MCS_COLL`: (e.g., 0.002) Constant for collimator rotation factor in overall MCSv-like score.
* `K_MISPORT_COLL`: (e.g., 0.001) Constant for collimator rotation factor in MIsport.
* `LOCAL_MIT_K_NEIGHBORS`: (Unused) Present in code; current UI uses `K_3_PERCENT = max(1, ceil(numControlPoints * 0.03))`.
* `MIT_ALPHA`: (e.g., 1.5) Sensitivity factor for MLC acceleration threshold in Local MIt.
* `MIT_BETA`: (e.g., 1.5) Base for Local MIt weighting factors (max weight).
* `MIT_GAMMA`: (e.g., 0.1) Decay factor for Local MIt weighting factors.

---

## 7. References
* Li, R., & Xing, L. (2013). An adaptive planning strategy for station parameter optimized radiation therapy (SPORT): segmentally boosted VMAT. *Medical Physics, 40*(5), 050701. doi: 10.1118/1.4802748
* Kessler, M. L., McShan, D. L., & Fraass, B. A. (1995). A computer-controlled conformal radiotherapy system. III: Graphical simulation and monitoring of treatment delivery. International Journal of Radiation Oncology, Biology, Physics, 33*(5), 1159-1172. doi: 10.1016/0360-3016(95)02045-4
* Masi, L., Doro, R., Favuzza, V., Cipressi, S., & Livi, L. (2013). Impact of plan parameters on the dosimetric accuracy of volumetric modulated arc therapy. *Medical Physics, 40*(7), 071718. doi: 10.1118/1.4810960 (Note: The MCSv is adapted from this, which adapted from McNiven et al.)
* McNiven, A. L., Sharpe, M. B., & Purdie, T. G. (2010). A new metric for assessing IMRT modulation complexity and plan deliverability. *Medical Physics, 37*(2), 505-515. doi: 10.1118/1.3276772
* Park, J. M., Park, S. Y., Kim, H., Kim, J. H., Carlson, J., & Ye, S. J. (2014). Modulation indices for volumetric modulated arc therapy. *Physics in Medicine & Biology, 59*(23), 7315-7340. doi: 10.1088/0031-9155/59/23/7315
* Webb, S. (2003). Use of a quantitative index of beam modulation to characterize dose conformality: illustration by a comparison of full beamlet IMRT, few-segment IMRT (fsIMRT) and conformal unmodulated radiotherapy. *Physics in Medicine & Biology, 48*(14), 2051-2062. doi: 10.1088/0031-9155/48/14/305
* Younge, K. C., Roberts, D., Janes, L. A., Anderson, C., Moran, J. M., & Matuszak, M. M. (2016). Predicting deliverability of volumetric-modulated arc therapy (VMAT) plans using aperture complexity analysis. *Journal of Applied Clinical Medical Physics, 17*(4), 124-131. doi: 10.1120/jacmp.v17i4.6241
