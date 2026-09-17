# Preset axis limits

In simulation mode, open **Preset axis limits** under **Device Metrics vs. Time**.

1. Enter a minimum and maximum for each axis you want to fix. Leave both fields blank to keep that axis automatic.
2. Click **Apply limits** to update the plots, or **Save config…** to apply the limits and download `axis-limits.json`.
3. In a later session, click **Load config…** and select the saved file. Loading replaces the current presets and applies them immediately.
4. Click **Reset to automatic** to clear every preset.

The time range is shared by all five time plots. Speed and acceleration ranges are separate for gantry, MLC, and collimator. Dose rate and capacity utilization each have their own range. Presets remain active when switching beams or loading another plan in the same page session. Reloading the page restores automatic scaling; load the saved config to reuse your presets.

These settings change display ranges only, not machine operating limits or simulation results. Values outside a fixed range are clipped in the plots. Radial plots and the beam’s eye view keep their existing scales.

## Config format

Files are JSON with `version: 1` and an `axes` object. Omitted axes use automatic scaling. Each supplied axis requires two finite numbers with `min < max`. Invalid files leave the current presets intact.

Example:

```json
{
  "version": 1,
  "axes": {
    "time": { "min": 0, "max": 120 },
    "gantrySpeed": { "min": 0, "max": 6 },
    "gantryAccel": { "min": -2, "max": 2 },
    "mlcSpeed": { "min": 0, "max": 30 },
    "mlcAccel": { "min": -100, "max": 100 },
    "collimatorSpeed": { "min": 0, "max": 6 },
    "collimatorAccel": { "min": -2, "max": 2 },
    "doseRate": { "min": 0, "max": 2400 },
    "capability": { "min": 0, "max": 105 }
  }
}
```

Units match the UI: seconds, degrees/second, degrees/second², millimeters/second, millimeters/second², MU/minute, and percent. The example ranges are display choices, not recommended machine settings.

Run the checks with `node --test tests/axis-presets.test.cjs`.
