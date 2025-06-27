// SimLauncher_planToJSON.cs - Corrected for ESAPI Compatibility with Electron Launcher
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Windows;
using VMS.TPS.Common.Model.API;
using VMS.TPS.Common.Model.Types;
using System.Globalization; // Required for culture-invariant formatting
using System.Diagnostics;   // Required for Process.Start

namespace VMS.TPS
{
    public class Script
    {
        public void Execute(ScriptContext context)
        {
            if (context.PlanSetup == null)
            {
                MessageBox.Show("No treatment plan is currently loaded. Please open a plan and try again.", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
                return;
            }

            try
            {
                // ====================================================================================
                // STEP 1: DEFINE THE PATH TO YOUR ELECTRON APP
                // IMPORTANT: You MUST change this path to the correct location of your application.
                // ====================================================================================
                string electronAppPath = @"U:\Script\TDS-RDS-Simulator-1.1.0-portable.exe"; // Make sure to include the .exe

                if (!File.Exists(electronAppPath))
                {
                    // FIXED: Replaced string interpolation with string.Format
                    string errorMsg = string.Format("Simulator executable not found at:\n{0}\n\nPlease correct the path in the script.", electronAppPath);
                    MessageBox.Show(errorMsg, "Launcher Error", MessageBoxButton.OK, MessageBoxImage.Error);
                    return;
                }

                // ====================================================================================
                // STEP 2: GENERATE THE PLAN DATA AS A JSON STRING
                // ====================================================================================
                var beamDataExporter = new ManualJsonExporter();
                string jsonOutput = beamDataExporter.ExportPlanToJson(context.PlanSetup);

                // ====================================================================================
                // STEP 3: SAVE THE JSON TO A TEMPORARY FILE
                // ====================================================================================
                // FIXED: Replaced string interpolation with string.Format
                string tempFileName = string.Format("plan-data-{0}.json", Guid.NewGuid());
                string tempFilePath = Path.Combine(Path.GetTempPath(), tempFileName);
                File.WriteAllText(tempFilePath, jsonOutput);

                // ====================================================================================
                // STEP 4: LAUNCH THE ELECTRON APP WITH THE FILE PATH AS AN ARGUMENT
                // ====================================================================================
                ProcessStartInfo startInfo = new ProcessStartInfo
                {
                    FileName = electronAppPath,
                    // FIXED: Replaced string interpolation with string.Format
                    Arguments = string.Format("--plan-file=\"{0}\"", tempFilePath),
                    UseShellExecute = true
                };

                Process.Start(startInfo);

                // FIXED: Replaced string interpolation with string.Format
                string successMsg = string.Format("Successfully launched the simulator with plan: {0}", context.PlanSetup.Id);
                MessageBox.Show(successMsg, "Launch Successful", MessageBoxButton.OK, MessageBoxImage.Information);
            }
            catch (Exception ex)
            {
                string errorMessage = string.Format("An unexpected error occurred:\n\n{0}\n\n{1}", ex.Message, ex.StackTrace);
                MessageBox.Show(errorMessage, "Critical Error", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }
    }

    public class ManualJsonExporter
    {
        // ... No changes needed in this class. It remains the same as the previous correct version.
        // The full implementation is included below for completeness.
        
        private const int IndentSize = 2;

        public string ExportPlanToJson(PlanSetup plan)
        {
            var sb = new StringBuilder();
            sb.AppendLine("{");
            sb.AppendLine(Indent(1) + "\"parsedDicomPlan\": {");

            var patientNameBuilder = new StringBuilder();
            patientNameBuilder.AppendLine(Indent(3) + "{");
            patientNameBuilder.AppendLine(FormatProperty("Alphabetic", plan.Course.Patient.Name, 4, true));
            patientNameBuilder.Append(Indent(3) + "}");
            sb.AppendLine(FormatArray("patientName", new List<string> { patientNameBuilder.ToString() }, 2, false));

            sb.AppendLine(FormatProperty("patientID", plan.Course.Patient.Id, 2, false));
            sb.AppendLine(FormatProperty("rtPlanLabel", plan.Id, 2, false));

            double totalPlanMU = plan.Beams.Where(b => !b.IsSetupField).Sum(b => b.Meterset.Value);
            sb.AppendLine(FormatProperty("totalPlanMU", totalPlanMU, 2, false));

            Beam firstBeam = plan.Beams.FirstOrDefault(b => !b.IsSetupField);
            sb.AppendLine(FormatProperty("primaryDoseRate", firstBeam != null ? firstBeam.DoseRate : 0, 2, false));

            var beamStrings = plan.Beams.Where(b => !b.IsSetupField)
                .Select(b => BuildBeamJson(b, 3))
                .ToList();
            sb.AppendLine(FormatArray("beams", beamStrings, 2, true));

            sb.AppendLine(Indent(1) + "}");
            sb.AppendLine("}");
            return sb.ToString();
        }

        private string BuildBeamJson(Beam beam, int indentLevel)
        {
            var sb = new StringBuilder();
            sb.AppendLine(Indent(indentLevel) + "{");

            var cpStrings = beam.ControlPoints.Select((cp, i) => BuildControlPointJson(cp, beam, i, indentLevel + 2)).ToList();
            sb.AppendLine(FormatArray("controlPoints", cpStrings, indentLevel + 1, false));

            var mlcDefStrings = BuildMlcDefinitions(beam.MLC, indentLevel + 2);
            sb.AppendLine(FormatArray("mlcDefinitions", mlcDefStrings, indentLevel + 1, false));
            
            string mlcModel = beam.MLC != null ? beam.MLC.Model : "";
            bool isRds = !string.IsNullOrEmpty(mlcModel) && mlcModel.ToUpper().Contains("SX");
            sb.AppendLine(FormatProperty("isRDSMachine", isRds, indentLevel + 1, false));
            
            string machineIdentifier = isRds ? "RDS" : "TDS";
            sb.AppendLine(FormatProperty("machineIdentifierForSpeeds", machineIdentifier, indentLevel + 1, false));
            
            sb.AppendLine(FormatProperty("beamNumber", beam.BeamNumber, indentLevel + 1, false));
            sb.AppendLine(FormatProperty("beamName", beam.Id, indentLevel + 1, false));
            sb.AppendLine(FormatProperty("totalMeterset", beam.Meterset.Value, indentLevel + 1, false));
            sb.AppendLine(FormatProperty("gantryRotationDirection", beam.GantryDirection.ToString(), indentLevel + 1, false));
            sb.AppendLine(FormatProperty("gantryStartAngle", beam.ControlPoints.First().GantryAngle, indentLevel + 1, false));
            sb.AppendLine(FormatProperty("gantryEndAngle", beam.ControlPoints.Last().GantryAngle, indentLevel + 1, true));

            sb.Append(Indent(indentLevel) + "}");
            return sb.ToString();
        }

        private string BuildControlPointJson(ControlPoint cp, Beam beam, int index, int indentLevel)
        {
            var sb = new StringBuilder();
            sb.AppendLine(Indent(indentLevel) + "{");
            sb.AppendLine(FormatProperty("controlPointIndex", index, indentLevel + 1, false));
            sb.AppendLine(FormatProperty("gantryAngle", cp.GantryAngle, indentLevel + 1, false));
            sb.AppendLine(FormatProperty("collimatorAngle", cp.CollimatorAngle, indentLevel + 1, false));
            sb.AppendLine(FormatProperty("cumulativeMetersetWeight", cp.MetersetWeight, indentLevel + 1, false));
            sb.AppendLine(FormatProperty("doseRateSet", beam.DoseRate, indentLevel + 1, false));

            var mlcPosStrings = BuildMlcPositionData(cp.LeafPositions, beam.MLC, indentLevel + 2);
            sb.AppendLine(FormatArray("mlcPositionData", mlcPosStrings, indentLevel + 1, false));

            bool isRds = beam.MLC != null && !string.IsNullOrEmpty(beam.MLC.Model) && beam.MLC.Model.ToUpper().Contains("SX");
            
            string asymxString = isRds ? "[]" : string.Format(CultureInfo.InvariantCulture, "[{0:F2}, {1:F2}]", cp.JawPositions.X1, cp.JawPositions.X2);
            string asymyString = isRds ? "[]" : string.Format(CultureInfo.InvariantCulture, "[{0:F2}, {1:F2}]", cp.JawPositions.Y1, cp.JawPositions.Y2);

            sb.AppendLine(FormatProperty("asymx", asymxString, indentLevel + 1, false, false));
            sb.AppendLine(FormatProperty("asymy", asymyString, indentLevel + 1, true, false));

            sb.Append(Indent(indentLevel) + "}");
            return sb.ToString();
        }
        
        #region Manual JSON Building Helpers
        private List<string> BuildMlcPositionData(float[,] leafPositions, MLC mlc, int indentLevel)
        {
            var mlcDataStrings = new List<string>();
            if (leafPositions == null) return mlcDataStrings;

            string mlcModel = mlc != null ? mlc.Model : "";
            bool isHalcyon = !string.IsNullOrEmpty(mlcModel) && mlcModel.ToUpper().Contains("SX");

            if (isHalcyon)
            {
                var bank1Positions = new List<string>();
                for (int i = 0; i < 28; i++) bank1Positions.Add(leafPositions[0, i].ToString("F2", CultureInfo.InvariantCulture));
                for (int i = 0; i < 28; i++) bank1Positions.Add(leafPositions[1, i].ToString("F2", CultureInfo.InvariantCulture));

                var bank1Builder = new StringBuilder();
                bank1Builder.AppendLine(Indent(indentLevel) + "{");
                bank1Builder.AppendLine(FormatProperty("type", "MLCX1", indentLevel + 1, false));
                bank1Builder.AppendLine(FormatArray("positions", bank1Positions, indentLevel + 1, true, false));
                bank1Builder.Append(Indent(indentLevel) + "}");
                mlcDataStrings.Add(bank1Builder.ToString());

                var bank2Positions = new List<string>();
                for (int i = 28; i < 57; i++) bank2Positions.Add(leafPositions[0, i].ToString("F2", CultureInfo.InvariantCulture));
                for (int i = 28; i < 57; i++) bank2Positions.Add(leafPositions[1, i].ToString("F2", CultureInfo.InvariantCulture));

                var bank2Builder = new StringBuilder();
                bank2Builder.AppendLine(Indent(indentLevel) + "{");
                bank2Builder.AppendLine(FormatProperty("type", "MLCX2", indentLevel + 1, false));
                bank2Builder.AppendLine(FormatArray("positions", bank2Positions, indentLevel + 1, true, false));
                bank2Builder.Append(Indent(indentLevel) + "}");
                mlcDataStrings.Add(bank2Builder.ToString());
            }
            else
            {
                var bank1Positions = new List<string>();
                for (int i = 0; i < leafPositions.GetLength(1); i++) bank1Positions.Add(leafPositions[0, i].ToString("F2", CultureInfo.InvariantCulture));
                for (int i = 0; i < leafPositions.GetLength(1); i++) bank1Positions.Add(leafPositions[1, i].ToString("F2", CultureInfo.InvariantCulture));

                var bank1Builder = new StringBuilder();
                bank1Builder.AppendLine(Indent(indentLevel) + "{");
                bank1Builder.AppendLine(FormatProperty("type", "MLCX1", indentLevel + 1, false));
                bank1Builder.AppendLine(FormatArray("positions", bank1Positions, indentLevel + 1, true, false));
                bank1Builder.Append(Indent(indentLevel) + "}");
                mlcDataStrings.Add(bank1Builder.ToString());
            }
            return mlcDataStrings;
        }

        private List<string> BuildMlcDefinitions(MLC mlc, int indentLevel)
        {
            var definitions = new List<string>();
            if (mlc == null || string.IsNullOrEmpty(mlc.Model)) return definitions;

            double[] boundaries = GetBoundariesArray(mlc.Model);
            if (boundaries == null) return definitions;

            bool isHalcyon = !string.IsNullOrEmpty(mlc.Model) && mlc.Model.ToUpper().Contains("SX");

            if (isHalcyon)
            {
                var mlcx1_boundaries = boundaries.Take(29).Select(b => b.ToString("F2", CultureInfo.InvariantCulture)).ToList();
                var mlcx2_boundaries = boundaries.Skip(29).Select(b => b.ToString("F2", CultureInfo.InvariantCulture)).ToList();

                var mlc1Builder = new StringBuilder();
                mlc1Builder.AppendLine(Indent(indentLevel) + "{");
                mlc1Builder.AppendLine(FormatProperty("type", "MLCX1", indentLevel + 1, false));
                mlc1Builder.AppendLine(FormatArray("boundaries", mlcx1_boundaries, indentLevel + 1, true, false));
                mlc1Builder.Append(Indent(indentLevel) + "}");
                definitions.Add(mlc1Builder.ToString());

                var mlc2Builder = new StringBuilder();
                mlc2Builder.AppendLine(Indent(indentLevel) + "{");
                mlc2Builder.AppendLine(FormatProperty("type", "MLCX2", indentLevel + 1, false));
                mlc2Builder.AppendLine(FormatArray("boundaries", mlcx2_boundaries, indentLevel + 1, true, false));
                mlc2Builder.Append(Indent(indentLevel) + "}");
                definitions.Add(mlc2Builder.ToString());
            }
            else
            {
                var all_boundaries = boundaries.Select(b => b.ToString("F2", CultureInfo.InvariantCulture)).ToList();
                var mlc1Builder = new StringBuilder();
                mlc1Builder.AppendLine(Indent(indentLevel) + "{");
                mlc1Builder.AppendLine(FormatProperty("type", "MLCX1", indentLevel + 1, false));
                mlc1Builder.AppendLine(FormatArray("boundaries", all_boundaries, indentLevel + 1, true, false));
                mlc1Builder.Append(Indent(indentLevel) + "}");
                definitions.Add(mlc1Builder.ToString());
            }
            return definitions;
        }

        private string Indent(int level) { return new string(' ', level * IndentSize); }
        private string EscapeString(string s) { return s.Replace("\\", "\\\\").Replace("\"", "\\\""); }

        private string FormatProperty(string key, object value, int indentLevel, bool isLast, bool quoteValue = true)
        {
            string formattedValue;
            if (value is bool)
            {
                formattedValue = ((bool)value) ? "true" : "false";
            }
            else if (value is string && quoteValue)
            {
                formattedValue = "\"" + EscapeString((string)value) + "\"";
            }
            else if (value is double || value is float || value is decimal)
            {
                formattedValue = string.Format(CultureInfo.InvariantCulture, "{0:F4}", value);
            }
            else
            {
                formattedValue = (value ?? "null").ToString();
            }
            return string.Format("{0}\"{1}\": {2}{3}", Indent(indentLevel), key, formattedValue, isLast ? "" : ",");
        }

        private string FormatArray(string key, List<string> items, int indentLevel, bool isLast, bool formatAsObjects = true)
        {
            var sb = new StringBuilder();
            sb.Append(string.Format("{0}\"{1}\": [", Indent(indentLevel), key));
            if (items.Any())
            {
                if (formatAsObjects)
                {
                    sb.AppendLine();
                    sb.Append(string.Join(",\n", items.ToArray()));
                    sb.AppendLine();
                    sb.Append(Indent(indentLevel));
                }
                else
                {
                    sb.Append(string.Join(", ", items.ToArray()));
                }
            }
            sb.Append(string.Format("]{0}", isLast ? "" : ","));
            return sb.ToString();
        }

        private double[] GetBoundariesArray(string mlcModel)
        {
            if (mlcModel.Contains("Millennium 120")) return new double[] { -200, -190, -180, -170, -160, -150, -140, -130, -120, -110, -100, -95, -90, -85, -80, -75, -70, -65, -60, -55, -50, -45, -40, -35, -30, -25, -20, -15, -10, -5, 0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200 };
            if (mlcModel.Contains("High Definition 120")) return new double[] { -110, -105, -100, -95, -90, -85, -80, -75, -70, -65, -60, -55, -50, -45, -40, -37.5, -35, -32.5, -30, -27.5, -25, -22.5, -20, -17.5, -15, -12.5, -10, -7.5, -5, -2.5, 0, 2.5, 5, 7.5, 10, 12.5, 15, 17.5, 20, 22.5, 25, 27.5, 30, 32.5, 35, 37.5, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100, 105, 110 };
            if (mlcModel.Contains("SX")) return new double[] { -140, -130, -120, -110, -100, -90, -80, -70, -60, -50, -40, -30, -20, -10, 0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, -145, -135, -125, -115, -105, -95, -85, -75, -65, -55, -45, -35, -25, -15, -5, 5, 15, 25, 35, 45, 55, 65, 75, 85, 95, 105, 115, 125, 135, 145 };
            return null; // Default case
        }
        #endregion
    }
}