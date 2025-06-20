# DICOM RT Plan Delivery Simulator - README

**Version:** 1.0.43
**Author:** Taoran Li, PhD  
**Date:** June 13, 2025

## 1. Overview

The DICOM RT Plan Delivery Simulator is a web-based tool designed to visualize and analyze the delivery sequence of radiotherapy plans. It allows users to:

* Load plan data via DICOM RT Plan files (`.dcm`) or a compatible `.json` format.
* Visualize the Beam's Eye View (BEV) including MLC and jaw positions.
* Animate the plan delivery with multiple modes:
    * A fixed-speed animation for quick review.
    * A detailed **Simulate Delivery** mode based on configurable machine kinematics.
    * A **Simulate Full Plan** mode to estimate the total delivery time for all beams, including the transition time between them.
* View dynamic parameters such as gantry angle, collimator angle, and simulated time.
* Inspect various calculated metrics related to plan complexity and deliverability.
* Examine these metrics through static radial plots and dynamic, interactive XY-time plots.
* **Export** the parsed plan and simulation results to a `.json` file for further analysis.

The tool runs entirely in the browser, ensuring patient data privacy. It aims to provide insights into the mechanical aspects of radiotherapy plan delivery for educational and research applications.

---

## 2. System Requirements

This tool is designed to run in a modern web browser and has no other software dependencies.

*   **Recommended Browsers:** For the best performance and compatibility, please use the latest version of:
    *   **Google Chrome** ([Download](https://www.google.com/chrome/))
    *   **Mozilla Firefox** ([Download](https://www.mozilla.org/firefox/new/))

*   **Other Supported Browsers:** The simulator is also compatible with:
    *   Microsoft Edge (latest version)
    *   Safari (version 14 or newer)

*   **Unsupported:** Internet Explorer is not supported.

For users in environments with software installation restrictions, please contact your IT department to request that a supported browser be installed.

---

## 3. How to Use

### Step 1: Get Plan Data

You can load plan data in two ways:

1.  **Standard Method (DICOM File):**
    * Drag and drop your DICOM RT Plan (`.dcm`) file onto the "Drag & Drop" area.
    * Alternatively, click the "Choose File" button to select your `.dcm` file.

2.  **Eclipse TPS Method (Direct JSON Export):**
    * Use the provided ESAPI script in Varian Eclipse to export the plan directly to the required `.json` format, bypassing the need for a DICOM export. (See Section 4 below for details).
    * Load the resulting `.json` file using the "Drag & Drop" or "Choose File" function.

### Step 2: Configure and Interact

* **Configure Simulation (Optional):** Adjust machine speed and acceleration limits and click **"Apply & Recalculate Simulation"**.
* **Select Beam:** If the plan has multiple beams, use the dropdown menu to select one for individual analysis.
* **Choose Playback Mode:**
    * **`Simulate Delivery`**: Toggles the time-based simulation for a single beam.
    * **`Simulate Full Plan`**: Simulates the entire plan from start to finish.
    * **`Use Fixed Speed Animation`**: If simulation is off, animates at a constant rate.
* **Control and Explore:**
    * Use the **Play/Pause/Reset** buttons to control the animation.
    * Hover over the **Radial Plots** or use the **slider** to scrub through control points.
    * In the **Time Plots**, zoom with the mouse wheel and pan by clicking and dragging.
* **Export and Clear:**
    * **`Export Parsed Data`**: Saves the currently loaded plan and its simulation data to a `.json` file.
    * **`Clear All Data`**: Resets the application.

---

## 4. Varian Eclipse Integration (ESAPI Script)

For users of the Varian Eclipse™ Treatment Planning System, the included C# script (`planToJSON_ExactFormat_Enhanced_NoDeps.cs`) provides a direct pathway to get plan data into the simulator without the intermediate step of exporting a DICOM file.

### 4.1. Script Purpose and Features

The script runs inside Eclipse and exports the currently loaded treatment plan into a `.json` file that is perfectly formatted for this simulator.

* **Direct Export:** Creates a simulator-compatible JSON file from the active plan.
* **Streamlined Workflow:**
    * Saves the exported file to `C:\Temp\`.
    * Automatically copies the entire JSON content to your clipboard.
    * Attempts to automatically open the simulator's HTML file in your default web browser.
* **Advanced MLC Handling:** Correctly processes and formats data for various Varian MLCs, including the dual-layer MLCs found on Halcyon™ and Ethos™ systems.

### 4.2. Prerequisites

* Varian Eclipse Treatment Planning System with a license that allows for ESAPI scripting.
* The `planToJSON_ExactFormat_Enhanced_NoDeps.cs` script file.
* Appropriate user permissions to run scripts in Eclipse.

### 4.3. How to Use the Script

1.  **Setup:**
    * Place the `planToJSON_ExactFormat_Enhanced_NoDeps.cs` file into your Eclipse ESAPI scripts directory.
    * For the auto-launch feature, place the simulator's HTML file in `C:\Temp\` and ensure it is named `RP_Delivery_Simulator_v4.1-ESAPI.html`.
2.  **In Eclipse:**
    * Open the patient and the specific treatment plan you wish to analyze.
    * Navigate to **Tools > Scripts** in the top menu.
    * Run the `planToJSON_ExactFormat_Enhanced_NoDeps` script.
3.  **Execution:**
    * The script will run and, upon completion, show a success message. This message will confirm that the file has been saved to `C:\Temp` and its content copied to your clipboard.
    * If the HTML file was found, your browser will open the simulator.
4.  **In the Simulator:**
    * Click the **"Choose File"** button (or drag and drop) and select the `.json` file that was just created in your `C:\Temp` folder.
    * The plan will load, and you can proceed with your analysis.

---

## 5. Simulation and Calculation Details

### 5.1. Delivery Time Calculation

The total estimated plan time is the sum of all intra-beam segment durations and all inter-beam transition durations.

#### 5.1.1. Inter-Beam Transition Time

When simulating a full plan, the time to move between beams is determined by the **rate-limiting component**—the part of the machine that takes the longest to move from its position at the end of one beam to its starting position for the next. The simulator calculates the realistic, acceleration-aware move time for the gantry, collimator, jaws, and all MLC leaves, and the transition time is the longest of these individual times. Dose is off during this transition.

#### 5.1.2. Intra-Beam Segment Time

This mode estimates the time for each step within a beam (from one control point to the next) based on which component is the slowest. It uses a **two-pass algorithm** for a realistic result.

* **Pass 1: Ideal Time & Average Speed:** The simulation first calculates an "ideal" time for each component (gantry, MLC, jaws, etc.) to complete its movement, assuming it could instantly reach its maximum speed. The longest of these ideal times, or the time required to deliver the radiation dose, gives a rough initial duration for the segment.

* **Pass 2: Realistic Time with Acceleration:** Real-world machines can't change speed instantly. The simulator refines the estimate by checking if any component would need to accelerate or decelerate faster than its physical limit to meet the "ideal" time. If a limit would be broken, the time for that component is recalculated using a more realistic model that includes the time it takes to speed up and slow down.

* **Final Segment Duration:** The final, estimated time for the segment is the longest of these more realistic, acceleration-aware component times and the dose delivery time. The total time for the beam is the sum of all these segment durations.

### 5.2. Calculated Complexity Metrics

#### 5.2.1. Overall MCSv (Modulation Complexity Score for VMAT)

This metric, adapted from the work of Masi et al., scores the complexity of the treatment beam's aperture shapes. It is an average over the entire beam, weighted by the amount of radiation (MU) delivered in each segment. A higher score means more complex. It combines:

* **Aperture Area Variability (AAV):** Measures how much the size of the beam opening changes throughout the treatment arc. A plan where the opening is consistently large is less complex than one where it varies dramatically.
* **Leaf Sequence Variability (LSV):** Measures the "jaggedness" or "smoothness" of the MLC-defined field edge. Smooth, straight edges are less complex than highly irregular, spiky shapes.
* **Collimator Factor:** The score is increased if the collimator has to rotate significantly during the beam, which adds mechanical complexity.

#### 5.2.2. MIsport (Modulation Index for SPORT)

Adapted from Li & Xing (2013), this metric quantifies how much the MLC leaves are moving while the gantry is rotating and delivering dose. It is calculated for each control point by looking at its neighbors. High values suggest intricate and rapid leaf motion during delivery, which can be challenging for the machine to perform accurately. This implementation also increases the complexity score if the collimator is rotating at the same time.

#### 5.2.3. Local MIt (Local Modulation Index total)

Inspired by Park et al. (2014), this metric is designed to pinpoint specific, highly dynamic, and challenging moments in the plan. It is only available in the time-based "Simulate Delivery" mode. It works by:

1.  **Flagging MLC Activity:** It "flags" any control points where the MLC leaves have to move or accelerate very quickly (based on the plan's overall motion characteristics).
2.  **Weighting by Other Dynamics:** These "flagged" points of high MLC activity are then assigned a higher complexity score if other machine parts—like the gantry, collimator, or even the dose rate—are also changing rapidly at the same time.

In short, a high Local MIt score identifies spots in the plan where many systems are being pushed toward their operational limits simultaneously, indicating a moment of high delivery complexity.

---

## 6. References

* Li, R., & Xing, L. (2013). An adaptive planning strategy for station parameter optimized radiation therapy (SPORT): segmentally boosted VMAT. *Medical Physics, 40*(5), 050701.
* Masi, L., Doro, R., Favuzza, V., Cipressi, S., & Livi, L. (2013). Impact of plan parameters on the dosimetric accuracy of volumetric modulated arc therapy. *Medical Physics, 40*(7), 071718.
* Park, J. M., Park, S. Y., Kim, H., Kim, J. H., Carlson, J., & Ye, S. J. (2014). Modulation indices for volumetric modulated arc therapy. *Physics in Medicine & Biology, 59*(23), 7315-7340.
