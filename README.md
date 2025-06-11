# DICOM RT Plan Delivery Simulator - README

**Version:** 1.0.43
**Author:** Taoran Li, PhD  
**Date:** June 13, 2025

---

> © 2025 Taoran Li. All rights reserved. This software is provided "as is" for educational and research purposes only. It is not intended for clinical use, patient diagnosis, or treatment planning. The accuracy of simulations and any derived data is not guaranteed. The user assumes all responsibility for the use of this software.

---

## 1. Overview

The DICOM RT Plan Delivery Simulator is a web-based tool designed to visualize and analyze the delivery sequence of DICOM RT Plan files. It allows users to:

* Load DICOM RT Plan files (`.dcm`) or previously exported simulation data (`.json`).
* Visualize the Beam's Eye View (BEV) including MLC and jaw positions.
* Animate the plan delivery with multiple modes:
    * A fixed-speed animation for quick review.
    * A detailed **Simulate Delivery** mode based on configurable machine kinematics.
    * A **Simulate Full Plan** mode to estimate the total delivery time for all beams, including the transition time between them.
* View dynamic parameters such as gantry angle, collimator angle, and simulated time.
* Inspect various calculated metrics related to plan complexity and deliverability, including device speeds, accelerations, dose rate, MIsport, Local MIt, and MCSv.
* Examine these metrics through static radial plots and dynamic, interactive XY-time plots.
* **Export** the parsed DICOM data along with all calculated simulation results to a `.json` file for further analysis.

The tool runs entirely in the browser, ensuring patient data privacy. It aims to provide insights into the mechanical aspects of radiotherapy plan delivery for educational and research applications.

---

## 2. How to Use

### Load Plan File:

1.  Drag and drop your DICOM RT Plan (`.dcm`) or exported JSON (`.json`) file onto the "Drag & Drop" area.
2.  Alternatively, click the "Choose File" button to select your file.

Upon successful loading, overall plan information will be displayed. This includes an estimated total plan time if "Simulate Delivery" is active.

### Configure Simulation Parameters (Optional):

1.  Navigate to the **"Machine Speed & Acceleration Limits (for Simulation)"** section.
2.  Adjust the maximum speeds and accelerations for Gantry, MLC, Collimator, and Jaws.
3.  Default values may be set based on the `ManufacturerModelName` tag in the DICOM file (e.g., different defaults for "RDS" vs. "TDS" machines).
4.  Click **"Apply & Recalculate Simulation"** to apply changes. This will re-run all time calculations.

### Select Beam (if multiple exist):

1.  If the plan contains multiple beams, a **"Select Beam"** dropdown will appear.
2.  Choose the beam you wish to analyze. The visualization and metrics will update accordingly. This is disabled during a full plan simulation.

### Choose Playback Mode & Interact:

* **Toggle Mode**:
    * Click the **`Simulate Delivery`** / **`Use Fixed Speed Animation`** button to switch between modes for a single beam.
    * Click the **`Simulate Full Plan`** button to run a simulation of all beams consecutively. This automatically enables the "Simulate Delivery" logic. Clicking it again stops the full plan simulation.
* **BEV Controls**:
    * **Play/Pause**: Starts or stops the animation. The button label will update based on the current mode (e.g., "Play Simulation", "Play Full Plan").
    * **Reset**: Resets the animation for the current beam (or the entire plan) to the beginning.
* **Audible Feedback**:
    * Check **"Beep per MU (Sim Mode)"** to enable an audible beep for each (integer) MU delivered during a simulation.
* **Parameter Exploration**:
    * **Radial Plots / Slider**: Hover your mouse over the radial plots or use the slider below them to manually scrub through the control points of the *currently selected beam*.
    * **XY-Time Plots (Simulate Delivery Mode Only)**: These plots show device metrics versus simulated time.
        * **Zoom**: Use the mouse wheel (Shift+Wheel for X-axis, Ctrl/Cmd+Wheel for Y-axis).
        * **Pan**: Click and drag.
        * **Reset View**: Click the button below each plot to reset its view.

### Export and Clear Data:

* **`Export Parsed Data`**: Click this to save a `.json` file containing the parsed DICOM plan data and the associated simulation/calculation results.
* **`Clear All Data`**: Click this to remove the loaded plan and reset the entire interface.

---

## 3. Simulation and Calculation Details

### 3.1. Parsing and Initial Data Processing

The simulator parses standard DICOM RT Plan tags. For multi-layer MLC systems (e.g., Varian Halcyon/Ethos), effective MLC positions are determined for each control point by taking the most restrictive (inner-most) physical leaf position, creating a single effective aperture for calculations.

### 3.2. Delivery Time Calculation

The total estimated plan time is the sum of all intra-beam segment durations and all inter-beam transition durations.

#### 3.2.1. Inter-Beam Transition Time

When simulating a full plan, the time to move between beams is calculated. This is determined by the **rate-limiting component**—the part of the machine that takes the longest to move from its position at the end of one beam to its starting position for the next. The simulator calculates the realistic, acceleration-aware move time for the gantry, collimator, jaws, and all MLC leaves, and the transition time is the longest of these individual times. Dose is off during this transition.

#### 3.2.2. Intra-Beam Segment Time

This mode estimates the time for each step within a beam (from one control point to the next) based on which component is the slowest. It uses a **two-pass algorithm** for a realistic result.

* **Pass 1: Ideal Time & Average Speed:** The simulation first calculates an "ideal" time for each component (gantry, MLC, jaws, etc.) to complete its movement, assuming it could instantly reach its maximum speed. The longest of these ideal times, or the time required to deliver the radiation dose, gives a rough initial duration for the segment.

* **Pass 2: Realistic Time with Acceleration:** Real-world machines can't change speed instantly. The simulator refines the estimate by checking if any component would need to accelerate or decelerate faster than its physical limit to meet the "ideal" time. If a limit would be broken, the time for that component is recalculated using a more realistic model that includes the time it takes to speed up and slow down.

* **Final Segment Duration:** The final, estimated time for the segment is the longest of these more realistic, acceleration-aware component times and the dose delivery time. The total time for the beam is the sum of all these segment durations.

### 3.3. Calculated Complexity Metrics

#### 3.3.1. Overall MCSv (Modulation Complexity Score for VMAT)

This metric, adapted from the work of Masi et al., scores the complexity of the treatment beam's aperture shapes. It is an average over the entire beam, weighted by the amount of radiation (MU) delivered in each segment. A higher score means more complex. It combines:

* **Aperture Area Variability (AAV):** Measures how much the size of the beam opening changes throughout the treatment arc. A plan where the opening is consistently large is less complex than one where it varies dramatically.
* **Leaf Sequence Variability (LSV):** Measures the "jaggedness" or "smoothness" of the MLC-defined field edge. Smooth, straight edges are less complex than highly irregular, spiky shapes.
* **Collimator Factor:** The score is increased if the collimator has to rotate significantly during the beam, which adds mechanical complexity.

#### 3.3.2. MIsport (Modulation Index for SPORT)

Adapted from Li & Xing (2013), this metric quantifies how much the MLC leaves are moving while the gantry is rotating and delivering dose. It is calculated for each control point by looking at its neighbors. High values suggest intricate and rapid leaf motion during delivery, which can be challenging for the machine to perform accurately. This implementation also increases the complexity score if the collimator is rotating at the same time.

#### 3.3.3. Local MIt (Local Modulation Index total)

Inspired by Park et al. (2014), this metric is designed to pinpoint specific, highly dynamic, and challenging moments in the plan. It is only available in the time-based "Simulate Delivery" mode. It works by:

1.  **Flagging MLC Activity:** It "flags" any control points where the MLC leaves have to move or accelerate very quickly (based on the plan's overall motion characteristics).
2.  **Weighting by Other Dynamics:** These "flagged" points of high MLC activity are then assigned a higher complexity score if other machine parts—like the gantry, collimator, or even the dose rate—are also changing rapidly at the same time.

In short, a high Local MIt score identifies spots in the plan where many systems are being pushed toward their operational limits simultaneously, indicating a moment of high delivery complexity.

---

## 4. References

* Li, R., & Xing, L. (2013). An adaptive planning strategy for station parameter optimized radiation therapy (SPORT): segmentally boosted VMAT. *Medical Physics, 40*(5), 050701.
* Masi, L., Doro, R., Favuzza, V., Cipressi, S., & Livi, L. (2013). Impact of plan parameters on the dosimetric accuracy of volumetric modulated arc therapy. *Medical Physics, 40*(7), 071718.
* Park, J. M., Park, S. Y., Kim, H., Kim, J. H., Carlson, J., & Ye, S. J. (2014). Modulation indices for volumetric modulated arc therapy. *Physics in Medicine & Biology, 59*(23), 7315-7340.
