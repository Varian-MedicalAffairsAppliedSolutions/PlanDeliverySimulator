# DICOM RT Plan Delivery Simulator - README

**Version:** 3.9 (Metrics with Collimator)  
**Author:** Taoran Li, PhD  
**Date:** June 10, 2025

---

> © 2025 Taoran Li. All rights reserved. This software is provided "as is" for educational and research purposes only. It is not intended for clinical use, patient diagnosis, or treatment planning. The accuracy of simulations and any derived data is not guaranteed. The user assumes all responsibility for the use of this software.

---

## 1. Overview
The DICOM RT Plan Delivery Simulator is a web-based tool designed to visualize and analyze the delivery sequence of DICOM RT Plan files. It allows users to:

* Load DICOM RT Plan files (`.dcm`).
* Visualize the Beam's Eye View (BEV) including MLC and jaw positions.
* Animate the plan delivery either at a fixed speed or by simulating delivery based on configurable machine speed and acceleration limits.
* View dynamic parameters such as gantry angle, collimator angle, and simulated time.
* Inspect various calculated metrics related to plan complexity and deliverability, including:
    * Device speeds (gantry, MLC, collimator, jaws) and accelerations.
    * Dose rate.
    * MIsport (Modulation Index for SPORT, adapted from Li & Xing, 2013).
    * Local MIt (Local Modulation Index total, adapted from Park et al., 2014).
    * Overall MCSv (Modulation Complexity Score for VMAT, adapted from Masi et al., 2013).
* Examine these metrics through static radial plots and dynamic XY-time plots (in simulation mode).

The tool aims to provide insights into the mechanical aspects of VMAT plan delivery for educational and research applications.

---

## 2. How to Use

### Load DICOM RT Plan File:
1. Drag and drop your DICOM RT Plan (`.dcm`) file onto the designated "Drag & Drop" area.
2. Alternatively, click the "Choose File" button and select your `.dcm` file.

Upon successful loading, overall plan information (patient name, ID, plan label, total beams, total MU, primary dose rate) will be displayed. Individual beam details, including an overall MCSv (Modulation Complexity Score for VMAT, adjusted for collimator rotation), will also be shown.

### Configure Simulation Parameters (Optional):
1. Navigate to the "Machine Speed & Acceleration Limits (for Simulation)" section.
2. Adjust the maximum speeds and accelerations for Gantry, MLC, Collimator, and Jaws. These values are used when the "Simulate Delivery" mode is active.
3. Default values may be set based on the `ManufacturerModelName` tag in the DICOM file (e.g., different defaults for "RDS" vs. "TDS" machines).
4. Click "Apply & Recalculate Simulation" to apply changes. This will re-initialize the visualization and recalculate simulation-dependent metrics if a plan is loaded.

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
    * **Radial Plots**: Hover your mouse cursor over the static radial plots (Gantry Speed, Max MLC Speed, Collimator Speed, Dose Rate, MIsport, Local MIt) to scrub through control points. The BEV and parameter display will update. These plots visually exclude the first and last CPs for MIsport and Local MIt due to their rolling window calculation.
    * **Control Point Slider**: Use the slider below the radial plots to manually select a control point.
    * **Parameter Display**: Shows values for the currently selected/animated control point, including gantry/collimator angles, speeds, dose rate, MIsport, and Local MIt.
* **XY-Time Plots (Simulate Delivery Mode Only)**:
    * These plots show Gantry, MLC, Collimator metrics (speed and acceleration), and Dose Rate versus simulated time.
    * **Interaction**:
        * **Zoom**: Use the mouse wheel. (Shift + Wheel for X-axis zoom, Ctrl/Cmd + Wheel for Y-axis zoom).
        * **Pan**: Click and drag.
        * **Reset View**: Click the "Reset View" button below each plot to return to the default zoom/pan.

### Clear Data:
* Click "Clear All Data & Visuals" to remove the loaded plan, reset all visualizations, and clear input fields.

---

## 3. Simulation and Calculation Details

### 3.1. Parsing and Initial Data Processing
The simulator parses standard DICOM RT Plan tags, including `BeamSequence`, `ControlPointSequence`, `BeamLimitingDeviceSequence` (for MLCs and Jaws), and `FractionGroupSequence` (for beam meterset).
MLC leaf boundary positions are extracted from `LeafPositionBoundaries`.
Effective MLC positions are determined for multi-layer MLC systems by taking the most restrictive position for each leaf pair across layers.

### 3.2. Segment Time Calculation (`calculateSegmentTimes`)
The method for calculating the duration of each segment (time between two consecutive control points) depends on the active mode:

#### Fixed Speed Animation Mode:
* Animation proceeds at a fixed interval (`FIXED_ANIMATION_SPEED_MS`, e.g., 100ms) per control point.
* Device "speeds" are calculated as the change in parameter value per control point step (e.g., °/CP, mm/CP).
* Accelerations are not explicitly calculated in this mode for display but are implicitly zero if speed per CP is constant.
* Local MIt will show 0.000 as it relies on time-based speeds/accelerations.

#### Simulate Delivery Mode:
This mode estimates segment durations based on device kinematics and MU delivery requirements.
* **Ideal Component Times**: For each segment (between CP <img src="https://i.upmath.me/svg/k-1" alt="k-1" /> and CP <img src="https://i.upmath.me/svg/k" alt="k" />):
    * $\Delta \text{GantryAngle}$, $\Delta \text{MaxLeafTravel}$, $\Delta \text{CollAngle}$, $\Delta \text{MaxJawXTravel}$, $\Delta \text{MaxJawYTravel}$, $\Delta \text{MUWeight}$ are calculated.
    * <img src="https://i.upmath.me/svg/%5Ctext%7Btime%7D_%7B%5Ctext%7BGantry%7D_%7B%5Ctext%7Bsimple%7D%7D%7D%20%3D%20%5Cfrac%7B%5CDelta%20%5Ctext%7BGantryAngle%7D%7D%7B%5Ctext%7BcurrentMaxGantrySpeed%7D%7D" alt="\text{time}_{\text{Gantry}_{\text{simple}}} = \frac{\Delta \text{GantryAngle}}{\text{currentMaxGantrySpeed}}" />
    * <img src="https://i.upmath.me/svg/%5Ctext%7Btime%7D_%7B%5Ctext%7BMLC%7D_%7B%5Ctext%7Bideal%7D%7D%7D%20%3D%20%5Cfrac%7B%5CDelta%20%5Ctext%7BMaxLeafTravel%7D%7D%7B%5Ctext%7BcurrentMaxMlcSpeedMMPS%7D%7D" alt="\text{time}_{\text{MLC}_{\text{ideal}}} = \frac{\Delta \text{MaxLeafTravel}}{\text{currentMaxMlcSpeedMMPS}}" />
    * <img src="https://i.upmath.me/svg/%5Ctext%7Btime%7D_%7B%5Ctext%7BColl%7D_%7B%5Ctext%7Bideal%7D%7D%7D%20%3D%20%5Cfrac%7B%5CDelta%20%5Ctext%7BCollAngle%7D%7D%7B%5Ctext%7BcurrentMaxCollimatorSpeed%7D%7D" alt="\text{time}_{\text{Coll}_{\text{ideal}}} = \frac{\Delta \text{CollAngle}}{\text{currentMaxCollimatorSpeed}}" />
    * <img src="https://i.upmath.me/svg/%5Ctext%7Btime%7D_%7B%5Ctext%7BJawX%7D_%7B%5Ctext%7Bideal%7D%7D%7D%20%3D%20%5Cfrac%7B%5CDelta%20%5Ctext%7BMaxJawXTravel%7D%7D%7B%5Ctext%7BcurrentMaxJawSpeedMMPS%7D%7D" alt="\text{time}_{\text{JawX}_{\text{ideal}}} = \frac{\Delta \text{MaxJawXTravel}}{\text{currentMaxJawSpeedMMPS}}" />
    * <img src="https://i.upmath.me/svg/%5Ctext%7Btime%7D_%7B%5Ctext%7BJawY%7D_%7B%5Ctext%7Bideal%7D%7D%7D%20%3D%20%5Cfrac%7B%5CDelta%20%5Ctext%7BMaxJawYTravel%7D%7D%7B%5Ctext%7BcurrentMaxJawSpeedMMPS%7D%7D" alt="\text{time}_{\text{JawY}_{\text{ideal}}} = \frac{\Delta \text{MaxJawYTravel}}{\text{currentMaxJawSpeedMMPS}}" />
    * <img src="https://i.upmath.me/svg/%5Ctext%7Btime%7D_%7B%5Ctext%7BDose%7D_%7B%5Ctext%7Bideal%7D%7D%7D%20%3D%20%5Cfrac%7B(%5CDelta%20%5Ctext%7BMUWeight%7D%20%5Ccdot%20%5Ctext%7BBeamTotalMU%7D)%7D%7B(%5Ctext%7BDoseRateSet%7D_%7Bk-1%7D%2F60)%7D" alt="\text{time}_{\text{Dose}_{\text{ideal}}} = \frac{(\Delta \text{MUWeight} \cdot \text{BeamTotalMU})}{(\text{DoseRateSet}_{k-1}/60)}" />
    (If $\text{DoseRateSet}_{k-1}$ is 0 or $\Delta \text{MUWeight}$ is 0, $\text{time}_{\text{Dose}_{\text{ideal}}}$ is handled accordingly, potentially becoming Infinity if MU needs to be delivered with no dose rate).

* **Pass 1 - Initial Segment Duration & Average Speeds**:
    * <img src="https://i.upmath.me/svg/%5Ctext%7Bpass1%5C_segmentDuration%7D%20%3D%20%5Cmax(%5Ctext%7Btime%7D_%7B%5Ctext%7BMLC%7D_%7B%5Ctext%7Bideal%7D%7D%7D%2C%20%5Ctext%7Btime%7D_%7B%5Ctext%7BColl%7D_%7B%5Ctext%7Bideal%7D%7D%7D%2C%20%5Ctext%7Btime%7D_%7B%5Ctext%7BDose%7D_%7B%5Ctext%7Bideal%7D%7D%7D%2C%20%5Ctext%7Btime%7D_%7B%5Ctext%7BGantry%7D_%7B%5Ctext%7Bsimple%7D%7D%7D%2C%20%5Ctext%7Btime%7D_%7B%5Ctext%7BJawX%7D_%7B%5Ctext%7Bideal%7D%7D%7D%2C%20%5Ctext%7Btime%7D_%7B%5Ctext%7BJawY%7D_%7B%5Ctext%7Bideal%7D%7D%7D)" alt="\text{pass1\_segmentDuration} = \max(\text{time}_{\text{MLC}_{\text{ideal}}}, \text{time}_{\text{Coll}_{\text{ideal}}}, \text{time}_{\text{Dose}_{\text{ideal}}}, \text{time}_{\text{Gantry}_{\text{simple}}}, \text{time}_{\text{JawX}_{\text{ideal}}}, \text{time}_{\text{JawY}_{\text{ideal}}})" />
        If this is near zero or Infinity, a small default (e.g., 0.01s) is used.
    * Average speeds for gantry, MLC, collimator, jaws for this pass are calculated by dividing their respective deltas by $\text{pass1\_segmentDuration}$.

* **Pass 2 - Profiled Move Times & Acceleration Check**:
    * For each device (gantry, MLC, collimator, jaws), a profiled move time (<img src="https://i.upmath.me/svg/%5Ctext%7Btime%7D_%7B%5Ctext%7Bprofiled%7D%7D" alt="\text{time}_{\text{profiled}}" />) is calculated using `calculateProfiledMoveTime(distance, maxSpeed, maxAccelDecel)`. This function considers a trapezoidal velocity profile.
        * <img src="https://i.upmath.me/svg/t_%7B%5Ctext%7Baccel%7D%7D%20%3D%20%5Cfrac%7BV_%7B%5Ctext%7Bmax%7D%7D%7D%7BA_%7B%5Ctext%7Bmax%7D%7D%7D" alt="t_{\text{accel}} = \frac{V_{\text{max}}}{A_{\text{max}}}" />
        * <img src="https://i.upmath.me/svg/d_%7B%5Ctext%7Baccel%7D%7D%20%3D%20%5Cfrac%7B1%7D%7B2%7D%20A_%7B%5Ctext%7Bmax%7D%7D%20t_%7B%5Ctext%7Baccel%7D%7D%5E2%20%3D%20%5Cfrac%7BV_%7B%5Ctext%7Bmax%7D%7D%5E2%7D%7B2%20A_%7B%5Ctext%7Bmax%7D%7D%7D" alt="d_{\text{accel}} = \frac{1}{2} A_{\text{max}} t_{\text{accel}}^2 = \frac{V_{\text{max}}^2}{2 A_{\text{max}}}" />
        * Distance covered during full accel/decel: <img src="https://i.upmath.me/svg/d_%7B%5Ctext%7Bfull%5C_profile%7D%7D%20%3D%202%20%5Ccdot%20d_%7B%5Ctext%7Baccel%7D%7D%20%3D%20%5Cfrac%7BV_%7B%5Ctext%7Bmax%7D%7D%5E2%7D%7BA_%7B%5Ctext%7Bmax%7D%7D%7D" alt="d_{\text{full\_profile}} = 2 \cdot d_{\text{accel}} = \frac{V_{\text{max}}^2}{A_{\text{max}}}" />
        * If total distance $D \leq d_{\text{full\_profile}}$: <img src="https://i.upmath.me/svg/%5Ctext%7BTime%7D%20%3D%20%5Csqrt%7B%5Cfrac%7B2D%7D%7BA_%7B%5Ctext%7Bmax%7D%7D%7D%7D" alt="\text{Time} = \sqrt{\frac{2D}{A_{\text{max}}}}" /> (triangular profile)
        * If total distance $D > d_{\text{full\_profile}}$: <img src="https://i.upmath.me/svg/%5Ctext%7BTime%7D%20%3D%20%5Cfrac%7BD%7D%7BV_%7B%5Ctext%7Bmax%7D%7D%7D%20%2B%20t_%7B%5Ctext%7Baccel%7D%7D" alt="\text{Time} = \frac{D}{V_{\text{max}}} + t_{\text{accel}}" /> (trapezoidal profile)
    * The required acceleration for each device to achieve its $\text{pass1\_avgSpeed}$ from the previous segment's average speed over $\text{pass1\_segmentDuration}$ is checked against its `currentMaxAccelDecel`.
    * The $\text{chosen\_time}$ for the device is set to its $\text{time}_{\text{profiled}}$ if the required acceleration exceeds the limit (multiplied by `ACCEL_CHECK_FACTOR`), otherwise it's the ideal time.

* **Final Segment Duration**:
    * <img src="https://i.upmath.me/svg/%5Ctext%7BsegmentDuration%7D%20%3D%20%5Cmax(%5Ctext%7Bchosen%5C_time%7D_%7B%5Ctext%7BGantry%7D%7D%2C%20%5Ctext%7Bchosen%5C_time%7D_%7B%5Ctext%7BMLC%7D%7D%2C%20%5Ctext%7Bchosen%5C_time%7D_%7B%5Ctext%7BColl%7D%7D%2C%20%5Ctext%7Bchosen%5C_time%7D_%7B%5Ctext%7BJawX%7D%7D%2C%20%5Ctext%7Bchosen%5C_time%7D_%7B%5Ctext%7BJawY%7D%7D%2C%20%5Ctext%7Btime%7D_%7B%5Ctext%7BDose%7D_%7B%5Ctext%7Bideal%7D%7D%7D)" alt="\text{segmentDuration} = \max(\text{chosen\_time}_{\text{Gantry}}, \text{chosen\_time}_{\text{MLC}}, \text{chosen\_time}_{\text{Coll}}, \text{chosen\_time}_{\text{JawX}}, \text{chosen\_time}_{\text{JawY}}, \text{time}_{\text{Dose}_{\text{ideal}}})" />
    * A small minimum duration (e.g., 0.01s) is enforced.
    * `cumulativeSimTime` is summed up using these segment durations.

* **Final Speeds and Accelerations (per second)**:
    * For each CP $k$ (representing the state after the segment from $k-1$ to $k$):
        * <img src="https://i.upmath.me/svg/%5Ctext%7BSpeed%7D_k%20%3D%20%5Cfrac%7B%5CDelta%20%5Ctext%7BParameter%7D_%7Bk-1%20%5Cto%20k%7D%7D%7B%5Ctext%7BsegmentDuration%7D_%7Bk-1%20%5Cto%20k%7D%7D%20%5Cquad%20%5Ctext%7B(e.g.%2C%20%C2%B0%2Fs%2C%20mm%2Fs)%7D" alt="\text{Speed}_k = \frac{\Delta \text{Parameter}_{k-1 \to k}}{\text{segmentDuration}_{k-1 \to k}} \quad \text{(e.g., °/s, mm/s)}" />
        * <img src="https://i.upmath.me/svg/%5Ctext%7BAcceleration%7D_k%20%3D%20%5Cfrac%7B(%5Ctext%7BSpeed%7D_k%20-%20%5Ctext%7BSpeed%7D_%7Bk-1%7D)%7D%7B%5Ctext%7BsegmentDuration%7D_%7Bk-1%20%5Cto%20k%7D%7D%20%5Cquad%20%5Ctext%7B(e.g.%2C%20%C2%B0%2Fs%C2%B2%2C%20mm%2Fs%C2%B2)%7D" alt="\text{Acceleration}_k = \frac{(\text{Speed}_k - \text{Speed}_{k-1})}{\text{segmentDuration}_{k-1 \to k}} \quad \text{(e.g., °/s², mm/s²)}" />

This two-pass approach attempts to model a more realistic delivery time.

### 3.3. Calculated Quantities and Metrics

#### 3.3.1. Basic Parameters
* **Gantry Angle, Collimator Angle, MLC Positions, Jaw Positions, Cumulative MU Weight**: Directly from DICOM.
* **Dose Rate (Estimated)**:
    * If "Simulate Delivery" mode is active and segment duration > 0:
        <img src="https://i.upmath.me/svg/%5Ctext%7BDoseRate%20(MU%2Fmin)%7D%20%3D%20%5Cfrac%7B(%5CDelta%20%5Ctext%7BMUWeight%7D%20%5Ccdot%20%5Ctext%7BBeamTotalMU%7D)%7D%7B%5Ctext%7BsegmentDuration%7D%7D%20%5Ccdot%2060" alt="\text{DoseRate (MU/min)} = \frac{(\Delta \text{MUWeight} \cdot \text{BeamTotalMU})}{\text{segmentDuration}} \cdot 60" />
    * If "Fixed Speed Animation" mode or segment duration is 0:
        <img src="https://i.upmath.me/svg/%5Ctext%7BDoseRate%20(MU%2FCP)%7D%20%3D%20%5CDelta%20%5Ctext%7BMUWeight%7D%20%5Ccdot%20%5Ctext%7BBeamTotalMU%7D" alt="\text{DoseRate (MU/CP)} = \Delta \text{MUWeight} \cdot \text{BeamTotalMU}" />
    * Displayed with "MUwt" if total beam MU is 0.

#### 3.3.2. Device Speeds and Accelerations
* Calculated as described in Section 3.2. Units change based on mode (/CP vs. /s, /s²).
* Displayed in the "Calculated Values (Current CP)" section and plotted in radial/XY-time plots.

#### 3.3.3. Overall MCSv (Modulation Complexity Score for VMAT)
Adapted from Masi et al. (2013), which itself was a modification of McNiven et al. (2010).
Calculated per beam (`calculateMCSForScope`) and displayed in the "Overall Plan Information".
The calculation involves:
* **Effective MLC Positions**: For each CP, effective MLC positions are determined.
* **LSV (Leaf Sequence Variability)**: Calculated for each MLC bank at each CP.
    <img src="https://i.upmath.me/svg/%5Ctext%7BLSV%7D_%7B%5Ctext%7Bbank%7D%7D%20%3D%20%5Cfrac%7B(N-1)%20%5Ccdot%20%5Ctext%7Bpos%7D_%7B%5Ctext%7Bmax%2Cbank%7D%7D%7D%7B%5Csum_%7Bj%3D0%7D%5E%7BN-2%7D(%5Ctext%7Bpos%7D_%7B%5Ctext%7Bmax%2Cbank%7D%7D%20-%20%7C%5Ctext%7Bpos%7D_%7B%5Ctext%7Bbank%7D%2Cj%7D%20-%20%5Ctext%7Bpos%7D_%7B%5Ctext%7Bbank%7D%2Cj%2B1%7D%7C)%7D" alt="\text{LSV}_{\text{bank}} = \frac{(N-1) \cdot \text{pos}_{\text{max,bank}}}{\sum_{j=0}^{N-2}(\text{pos}_{\text{max,bank}} - |\text{pos}_{\text{bank},j} - \text{pos}_{\text{bank},j+1}|)}" />
    where $\text{pos}_{\text{max,bank}}$ is the range of leaf positions in that bank for that CP.
    <img src="https://i.upmath.me/svg/%5Ctext%7BLSV%7D_%7B%5Ctext%7BCP%7D%7D%20%3D%20%5Cfrac%7B%5Ctext%7BLSV%7D_%7B%5Ctext%7BbankA%7D%7D%20%2B%20%5Ctext%7BLSV%7D_%7B%5Ctext%7BbankB%7D%7D%7D%7B2%7D" alt="\text{LSV}_{\text{CP}} = \frac{\text{LSV}_{\text{bankA}} + \text{LSV}_{\text{bankB}}}{2}" />
* **AAV (Aperture Area Variability)**: Calculated for each CP.
    <img src="https://i.upmath.me/svg/%5Ctext%7BAAV%7D_%7B%5Ctext%7BCP%7D%7D%20%3D%20%5Cfrac%7B%5Ctext%7BMaxArcTotalOpening%7D%7D%7B%5Ctext%7BTotalOpening%7D_%7B%5Ctext%7BCP%7D%7D%7D" alt="\text{AAV}_{\text{CP}} = \frac{\text{MaxArcTotalOpening}}{\text{TotalOpening}_{\text{CP}}}" />
    where $\text{TotalOpening}_{\text{CP}}$ is the sum of individual leaf pair openings at that CP, and $\text{MaxArcTotalOpening}$ is the sum of the maximum openings achieved by each leaf pair across the entire beam/arc.
* **Segmental MCS Contribution**: For each segment between <img src="https://i.upmath.me/svg/%5Ctext%7BCP%7D_i" alt="\text{CP}_i" /> and <img src="https://i.upmath.me/svg/%5Ctext%7BCP%7D_%7Bi%2B1%7D" alt="\text{CP}_{i+1}" />:
    * <img src="https://i.upmath.me/svg/%5Ctext%7BmeanAAV%7D%20%3D%20%5Cfrac%7B%5Ctext%7BAAV%7D_%7B%5Ctext%7BCP%7D_i%7D%20%2B%20%5Ctext%7BAAV%7D_%7B%5Ctext%7BCP%7D_%7Bi%2B1%7D%7D%7D%7B2%7D" alt="\text{meanAAV} = \frac{\text{AAV}_{\text{CP}_i} + \text{AAV}_{\text{CP}_{i+1}}}{2}" />
    * <img src="https://i.upmath.me/svg/%5Ctext%7BmeanLSV%7D%20%3D%20%5Cfrac%7B%5Ctext%7BLSV%7D_%7B%5Ctext%7BCP%7D_i%7D%20%2B%20%5Ctext%7BLSV%7D_%7B%5Ctext%7BCP%7D_%7Bi%2B1%7D%7D%7D%7B2%7D" alt="\text{meanLSV} = \frac{\text{LSV}_{\text{CP}_i} + \text{LSV}_{\text{CP}_{i+1}}}{2}" />
    * <img src="https://i.upmath.me/svg/%5CDelta%20%5Ctext%7BCollAngle%7D_%7B%5Ctext%7Bsegment%7D%7D%20%3D%20%7C%5Ctext%7BCollAngle%7D_%7B%5Ctext%7BCP%7D_%7Bi%2B1%7D%7D%20-%20%5Ctext%7BCollAngle%7D_%7B%5Ctext%7BCP%7D_i%7D%7C" alt="\Delta \text{CollAngle}_{\text{segment}} = |\text{CollAngle}_{\text{CP}_{i+1}} - \text{CollAngle}_{\text{CP}_i}|" /> (normalized <img src="https://i.upmath.me/svg/%5Cleq%20180%C2%B0" alt="\leq 180°" />)
    * <img src="https://i.upmath.me/svg/%5Ctext%7BCollFactor%7D%20%3D%20(1%20%2B%20K_%7B%5Ctext%7BMCS%5C_COLL%7D%7D%20%5Ccdot%20%5CDelta%20%5Ctext%7BCollAngle%7D_%7B%5Ctext%7Bsegment%7D%7D)" alt="\text{CollFactor} = (1 + K_{\text{MCS\_COLL}} \cdot \Delta \text{CollAngle}_{\text{segment}})" />
    * <img src="https://i.upmath.me/svg/%5Ctext%7BSegmentContribution%7D%20%3D%20%5Ctext%7BmeanAAV%7D%20%5Ccdot%20%5Ctext%7BmeanLSV%7D%20%5Ccdot%20%5Ctext%7BCollFactor%7D%20%5Ccdot%20%5CDelta%20%5Ctext%7BMUWeight%7D_%7B%5Ctext%7Bsegment%7D%7D" alt="\text{SegmentContribution} = \text{meanAAV} \cdot \text{meanLSV} \cdot \text{CollFactor} \cdot \Delta \text{MUWeight}_{\text{segment}}" />
* **Overall MCSv**: Sum of segmental contributions divided by the total MU weight of the beam.
    <img src="https://i.upmath.me/svg/%5Ctext%7BOverall%20MCSv%7D%20%3D%20%5Cfrac%7B%5Csum%20%5Ctext%7BSegmentContribution%7D%7D%7B%5Csum%20%5CDelta%20%5Ctext%7BMUWeight%7D_%7B%5Ctext%7Bsegment%7D%7D%7D" alt="\text{Overall MCSv} = \frac{\sum \text{SegmentContribution}}{\sum \Delta \text{MUWeight}_{\text{segment}}}" />

#### 3.3.4. MIsport (Modulation Index for SPORT)
Adapted from Li & Xing (2013). Calculated per CP (`calculateModulationIndex`).
Evaluates modulation by considering MLC leaf travel relative to neighboring CPs, weighted by MU per degree of gantry rotation, and now includes a collimator rotation factor.
<img src="https://i.upmath.me/svg/%5Ctext%7BMIsport%7D_%7B%5Ctext%7BcpS%7D%7D%20%3D%20%5Csum_%7Bk%3D-K%2C%20k%20%5Cneq%200%7D%5E%7BK%7D%20%5Cleft(%20%5Ctext%7BsumLeafDiff%7D_%7BS%2CSK%7D%20%5Ccdot%20(1%20%2B%20K_%7B%5Ctext%7BMISPORT%5C_COLL%7D%7D%20%5Ccdot%20%5CDelta%20%5Ctext%7BCollAngle%7D_%7BS%2CSK%7D)%20%5Ccdot%20%5Cfrac%7B%5CDelta%20%5Ctext%7BMU%7D_%7BS%2CSK%7D%7D%7B%5CDelta%20%5Ctext%7BGantryAngle%7D_%7BS%2CSK%7D%7D%20%5Cright)" alt="\text{MIsport}_{\text{cpS}} = \sum_{k=-K, k \neq 0}^{K} \left( \text{sumLeafDiff}_{S,SK} \cdot (1 + K_{\text{MISPORT\_COLL}} \cdot \Delta \text{CollAngle}_{S,SK}) \cdot \frac{\Delta \text{MU}_{S,SK}}{\Delta \text{GantryAngle}_{S,SK}} \right)" />
* <img src="https://i.upmath.me/svg/K" alt="K" />: `MI_SPORT_K_NEIGHBORS` (window size)$.
* <img src="https://i.upmath.me/svg/%5Ctext%7BsumLeafDiff%7D_%7BS%2CSK%7D%24%3A%20Sum%20of%20absolute%20travel%20for%20all%20MLC%20leaves%20between%20central%20CP%20%24S%24%20and%20neighbor%20%24S_K" alt="\text{sumLeafDiff}_{S,SK}$: Sum of absolute travel for all MLC leaves between central CP $S$ and neighbor $S_K" />.
* <img src="https://i.upmath.me/svg/%5CDelta%20%5Ctext%7BCollAngle%7D_%7BS%2CSK%7D" alt="\Delta \text{CollAngle}_{S,SK}" />: Absolute collimator angle difference between <img src="https://i.upmath.me/svg/S" alt="S" /> and <img src="https://i.upmath.me/svg/S_K" alt="S_K" /> (normalized <img src="https://i.upmath.me/svg/%5Cleq%20180%C2%B0" alt="\leq 180°" />).
* <img src="https://i.upmath.me/svg/K_%7B%5Ctext%7BMISPORT%5C_COLL%7D%7D" alt="K_{\text{MISPORT\_COLL}}" />: Weighting constant for collimator impact.
* <img src="https://i.upmath.me/svg/%5CDelta%20%5Ctext%7BMU%7D_%7BS%2CSK%7D" alt="\Delta \text{MU}_{S,SK}" />: Absolute MU weight difference between <img src="https://i.upmath.me/svg/S" alt="S" /> and <img src="https://i.upmath.me/svg/S_K" alt="S_K" />.
* <img src="https://i.upmath.me/svg/%5CDelta%20%5Ctext%7BGantryAngle%7D_%7BS%2CSK%7D" alt="\Delta \text{GantryAngle}_{S,SK}" />: Absolute gantry angle difference between <img src="https://i.upmath.me/svg/S" alt="S" /> and <img src="https://i.upmath.me/svg/S_K" alt="S_K" />.

The MU/GantryAngle term is handled to prevent division by zero if gantry angle change is minimal (`MI_GANTRY_DIFF_EPSILON`).
Displayed in radial plots (excluding first/last $K$ CPs) and the parameter display.

#### 3.3.5. Local MIt (Local Modulation Index total)
Inspired by $\text{MI}_t$ from Park et al. (2014), adapted and extended. Calculated per CP (`localMItFactor`) when "Simulate Delivery" mode is active.
Assesses complexity based on MLC activity, weighted by gantry, MU, and collimator dynamics within a rolling window.
* **Calculation for a central CP (<img src="https://i.upmath.me/svg/s_%7B%5Ctext%7Bidx%7D%7D" alt="s_{\text{idx}}" />)**:
    * Window: Considers CPs from <img src="https://i.upmath.me/svg/s_%7B%5Ctext%7Bidx%7D%7D%20-%20%5Ctext%7BLOCAL%5C_MIT%5C_K%5C_NEIGHBORS%7D%24%20to%20%24s_%7B%5Ctext%7Bidx%7D%7D%20%2B%20%5Ctext%7BLOCAL%5C_MIT%5C_K%5C_NEIGHBORS%7D" alt="s_{\text{idx}} - \text{LOCAL\_MIT\_K\_NEIGHBORS}$ to $s_{\text{idx}} + \text{LOCAL\_MIT\_K\_NEIGHBORS}" />.
    * For each CP ($i$) in this window:
        * **MLC Activity (<img src="https://i.upmath.me/svg/N_i" alt="N_i" />)**:
            * Thresholds: <img src="https://i.upmath.me/svg/T_%7B%5Ctext%7Bspeed%7D%7D%20%3D%20%5Csigma_%7B%5Ctext%7BMLC%5C_speed%7D%7D%24%2C%20%24T_%7B%5Ctext%7Baccel%7D%7D%20%3D%20%5Calpha_%7B%5Ctext%7BMIT%7D%7D%20%5Ccdot%20%5Csigma_%7B%5Ctext%7BMLC%5C_accel%7D%7D" alt="T_{\text{speed}} = \sigma_{\text{MLC\_speed}}$, $T_{\text{accel}} = \alpha_{\text{MIT}} \cdot \sigma_{\text{MLC\_accel}}" />.
            * <img src="https://i.upmath.me/svg/N_i%20%3D%201%24%20if%20(%24%5Ctext%7BMLC%5C_speed%7D_i%20%3E%20T_%7B%5Ctext%7Bspeed%7D%7D%24%20and%20%24%5Csigma_%7B%5Ctext%7BMLC%5C_speed%7D%7D%20%3E%20%5Cepsilon%24)%20OR%20(%24%7C%5Ctext%7BMLC%5C_accel%7D_i%7C%20%3E%20T_%7B%5Ctext%7Baccel%7D%7D%24%20and%20%24%5Csigma_%7B%5Ctext%7BMLC%5C_accel%7D%7D%20%3E%20%5Cepsilon%24).%20Else%20%24N_i%20%3D%200" alt="N_i = 1$ if ($\text{MLC\_speed}_i &gt; T_{\text{speed}}$ and $\sigma_{\text{MLC\_speed}} &gt; \epsilon$) OR ($|\text{MLC\_accel}_i| &gt; T_{\text{accel}}$ and $\sigma_{\text{MLC\_accel}} &gt; \epsilon$). Else $N_i = 0" />.
            * <img src="https://i.upmath.me/svg/%5Csigma_%7B%5Ctext%7BMLC%5C_speed%7D%7D%24%20and%20%24%5Csigma_%7B%5Ctext%7BMLC%5C_accel%7D%7D" alt="\sigma_{\text{MLC\_speed}}$ and $\sigma_{\text{MLC\_accel}}" /> are global standard deviations of simulated MLC speeds and accelerations (in /s and /s²).
        * **Weighting Factors (<img src="https://i.upmath.me/svg/W_%7B%5Ctext%7BGA%7D%2Ci%2B1%7D" alt="W_{\text{GA},i+1}" />, <img src="https://i.upmath.me/svg/W_%7B%5Ctext%7BMU%7D%2Ci%2B1%7D" alt="W_{\text{MU},i+1}" />, <img src="https://i.upmath.me/svg/W_%7B%5Ctext%7BCA%7D%2Ci%2B1%7D" alt="W_{\text{CA},i+1}" />)**: If <img src="https://i.upmath.me/svg/N_i%20%3D%201" alt="N_i = 1" />:
            * These are calculated based on the acceleration/variation of gantry, MU (dose rate), and collimator in the subsequent segment (between <img src="https://i.upmath.me/svg/%5Ctext%7BCP%7D_%7Bi%2B1%7D" alt="\text{CP}_{i+1}" /> and <img src="https://i.upmath.me/svg/%5Ctext%7BCP%7D_%7Bi%2B2%7D" alt="\text{CP}_{i+2}" />).
            * <img src="https://i.upmath.me/svg/W_X%20%3D%201%20%2B%20(%5Cbeta_%7B%5Ctext%7BMIT%7D%7D%20-%201)%20%5Ccdot%20(1%20-%20e%5E%7B-%5Cgamma_%7B%5Ctext%7BMIT%7D%7D%20%5Ccdot%20%7C%5Ctext%7BDynamicParameter%7D_%7Bi%2B1%20%5Cto%20i%2B2%7D%7C%7D)" alt="W_X = 1 + (\beta_{\text{MIT}} - 1) \cdot (1 - e^{-\gamma_{\text{MIT}} \cdot |\text{DynamicParameter}_{i+1 \to i+2}|})" />
            (Applies if units are time-based, e.g., °/s², MU/min change, °/s²). Defaults to 1.0 if not.
    * **Local MIt Factor**:
        <img src="https://i.upmath.me/svg/%5Ctext%7BlocalMItFactor%7D_%7Bs_%7B%5Ctext%7Bidx%7D%7D%7D%20%3D%20%5Cfrac%7B%5Csum_%7Bi%3D%5Ctext%7BwindowStart%7D%7D%5E%7B%5Ctext%7BwindowEnd%7D%7D%20(N_i%20%5Ccdot%20W_%7B%5Ctext%7BGA%7D%2Ci%2B1%7D%20%5Ccdot%20W_%7B%5Ctext%7BMU%7D%2Ci%2B1%7D%20%5Ccdot%20W_%7B%5Ctext%7BCA%7D%2Ci%2B1%7D)%7D%7B%5Ctext%7BCount%20of%20CPs%20in%20window%7D%7D" alt="\text{localMItFactor}_{s_{\text{idx}}} = \frac{\sum_{i=\text{windowStart}}^{\text{windowEnd}} (N_i \cdot W_{\text{GA},i+1} \cdot W_{\text{MU},i+1} \cdot W_{\text{CA},i+1})}{\text{Count of CPs in window}}" />

Displayed in radial plots (excluding first/last <img src="https://i.upmath.me/svg/K" alt="K" /> CPs) and the parameter display.

---

## 4. User Customizable Parameters (Speed & Acceleration Limits)
These parameters are found under "Machine Speed & Acceleration Limits (for Simulation)" and affect calculations only when "Simulate Delivery" mode is active.

* **Max Gantry Speed (°/s)**: `maxGantrySpeedInput` (Default: 6 or 12, machine-dependent)
* **Max Gantry Accel/Decel (°/s²)**: `maxGantryAccelDecelInput` (Default: 12)
* **Max MLC Speed (cm/s)**: `maxMlcSpeedInput` (Default: 2.25 or 5.0, machine-dependent) - internally converted to mm/s.
* **Max MLC Accel/Decel (cm/s²)**: `maxMlcAccelDecelInput` (Default: 10) - internally converted to mm/s².
* **Max Coll Speed (°/s)**: `maxCollimatorSpeedInput` (Default: 9)
* **Max Coll Accel/Decel (°/s²)**: `maxCollimatorAccelDecelInput` (Default: 10)
* **Max Jaw Speed (cm/s)**: `maxJawSpeedInput` (Default: 2.0 or 2.5) - internally converted to mm/s.
* **Max Jaw Accel/Decel (cm/s²)**: `maxJawAccelDecelInput` (Default: 8.0) - internally converted to mm/s².

Clicking "Apply & Recalculate Simulation" updates these limits and re-runs `initVisualization()`.

---

## 5. Key Internal Constants
* `FIXED_ANIMATION_SPEED_MS`: (e.g., 100) Milliseconds per CP in fixed speed animation mode.
* `MAX_BEEPS_PER_SECOND`: (e.g., 20) Limits MU beeps in simulation mode.
* `ACCEL_CHECK_FACTOR`: (e.g., 1.0) Factor used in `calculateSegmentTimes` to check if profiled move time is needed due to acceleration limits.
* `MI_SPORT_K_NEIGHBORS`: (e.g., 5) Window size (+/- <img src="https://i.upmath.me/svg/K" alt="K" /> CPs) for MIsport calculation.
* `MI_GANTRY_DIFF_EPSILON`: (e.g., 0.001) Small gantry angle difference threshold for MIsport.
* `K_MCS_COLL`: (e.g., 0.002) Constant for collimator rotation factor in Overall MCSv (represented as <img src="https://i.upmath.me/svg/K_%7B%5Ctext%7BMCS%5C_COLL%7D%7D" alt="K_{\text{MCS\_COLL}}" /> in formulas).
* `K_MISPORT_COLL`: (e.g., 0.001) Constant for collimator rotation factor in MIsport (represented as <img src="https://i.upmath.me/svg/K_%7B%5Ctext%7BMISPORT%5C_COLL%7D%7D" alt="K_{\text{MISPORT\_COLL}}" /> in formulas).
* `LOCAL_MIT_K_NEIGHBORS`: (e.g., 5) Window size (+/- <img src="https://i.upmath.me/svg/K" alt="K" /> CPs) for Local MIt calculation.
* `MIT_ALPHA`: (e.g., 1.5) Sensitivity factor for MLC acceleration in Local MIt's $N_i$ condition (represented as $\alpha_{\text{MIT}}$ in formulas).
* `MIT_BETA`: (e.g., 1.5) Base for weighting factors (<img src="https://i.upmath.me/svg/W_%7B%5Ctext%7BGA%7D%7D" alt="W_{\text{GA}}" />, <img src="https://i.upmath.me/svg/W_%7B%5Ctext%7BMU%7D%7D" alt="W_{\text{MU}}" />, <img src="https://i.upmath.me/svg/W_%7B%5Ctext%7BCA%7D%7D" alt="W_{\text{CA}}" />) in Local MIt. Determines max weight (represented as <img src="https://i.upmath.me/svg/%5Cbeta_%7B%5Ctext%7BMIT%7D%7D" alt="\beta_{\text{MIT}}" /> in formulas).
* `MIT_GAMMA`: (e.g., 0.1) Decay factor for weighting factors in Local MIt. Determines convergence speed (represented as <img src="https://i.upmath.me/svg/%5Cgamma_%7B%5Ctext%7BMIT%7D%7D" alt="\gamma_{\text{MIT}}" /> in formulas).

---

## 6. References
* Li, R., & Xing, L. (2013). An adaptive planning strategy for station parameter optimized radiation therapy (SPORT): segmentally boosted VMAT. *Medical Physics, 40*(5), 050701. doi: 10.1118/1.4802748
* Masi, L., Doro, R., Favuzza, V., Cipressi, S., & Livi, L. (2013). Impact of plan parameters on the dosimetric accuracy of volumetric modulated arc therapy. *Medical Physics, 40*(7), 071718. doi: 10.1118/1.4810960 (Note: The MCSv is adapted from this, which adapted from McNiven et al.)
* McNiven, A. L., Sharpe, M. B., & Purdie, T. G. (2010). A new metric for assessing IMRT modulation complexity and plan deliverability. *Medical Physics, 37*(2), 505-515. doi: 10.1118/1.3276772
* Park, J. M., Park, S. Y., Kim, H., Kim, J. H., Carlson, J., & Ye, S. J. (2014). Modulation indices for volumetric modulated arc therapy. *Physics in Medicine & Biology, 59*(23), 7315-7340. doi: 10.1088/0031-9155/59/23/7315
* Webb, S. (2003). Use of a quantitative index of beam modulation to characterize dose conformality: illustration by a comparison of full beamlet IMRT, few-segment IMRT (fsIMRT) and conformal unmodulated radiotherapy. *Physics in Medicine & Biology, 48*(14), 2051-2062. doi: 10.1088/0031-9155/48/14/305
