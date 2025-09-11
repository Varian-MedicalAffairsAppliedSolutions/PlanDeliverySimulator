// PlanDeliverySimulator-Launcher.cs - ESAPI Script for launching HTML simulator
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
using System.Runtime.CompilerServices; // Required for CallerFilePath
// Note: Using Uri.EscapeDataString instead of HttpUtility for ESAPI compatibility

namespace VMS.TPS
{
    public class Script
    {
        public void Execute(ScriptContext context)
        {
            try
            {
                // ====================================================================================
                // STEP 1: CONTEXT VALIDATION CHECKS
                // ====================================================================================
                if (context.Patient == null)
                {
                    MessageBox.Show("Error: No patient is loaded. Please open a patient before running this script.",
                                    "Patient Context Error", MessageBoxButton.OK, MessageBoxImage.Error);
                    return;
                }

                if (context.Course == null)
                {
                    MessageBox.Show("Error: No course is loaded. Please open a course before running this script.",
                                    "Course Context Error", MessageBoxButton.OK, MessageBoxImage.Error);
                    return;
                }

                if (context.PlanSetup == null)
                {
                    MessageBox.Show("Error: No plan is loaded. Please open a plan before running this script.",
                                    "Plan Context Error", MessageBoxButton.OK, MessageBoxImage.Error);
                    return;
                }

                // ====================================================================================
                // STEP 2: PREPARE AND VALIDATE HTML FILE PATH
                // ====================================================================================
                // Get the launcher path using the source file method
                string launcherPath = Path.GetDirectoryName(GetSourceFilePath());
                string htmlFileName = "RP_Delivery_Simulator.html";
                
                // Uncomment and modify the line below to specify a custom path to the HTML file
                //string htmlFilePath = @"C:\CustomPath\PlanDeliverySimulator\RP_Delivery_Simulator.html";
                
                // Look for HTML file in the PlanDeliverySimulator subdirectory relative to launcher
                string htmlFilePath = Path.Combine(launcherPath, "PlanDeliverySimulator", htmlFileName);
                
                // If not found in subdirectory, try same directory as launcher (backward compatibility)
                if (!File.Exists(htmlFilePath))
                {
                    htmlFilePath = Path.Combine(launcherPath, htmlFileName);
                }
                
                // Final validation
                if (!File.Exists(htmlFilePath))
                {
                    MessageBox.Show(string.Format("Error: The HTML file '{0}' was not found. Searched in:\n- {1}\n- {2}", 
                                    htmlFileName, 
                                    Path.Combine(launcherPath, "PlanDeliverySimulator"),
                                    launcherPath),
                                    "HTML File Not Found", MessageBoxButton.OK, MessageBoxImage.Error);
                    return;
                }

                // ====================================================================================
                // STEP 3: GENERATE THE PLAN DATA AS A JSON STRING
                // ====================================================================================
                var beamDataExporter = new ManualJsonExporter();
                string jsonOutput = beamDataExporter.ExportPlanToJson(context.PlanSetup);

                // ====================================================================================
                // STEP 4: SAVE JSON DATA AND PARAMETER FILE FOR BROWSER LAUNCH
                // ====================================================================================
                // Save plan data to temp file
                string tempFileName = string.Format("eclipse-plan-{0}.json", DateTime.Now.ToString("yyyyMMdd-HHmmss"));
                string tempFilePath = Path.Combine(Path.GetTempPath(), tempFileName);
                File.WriteAllText(tempFilePath, jsonOutput);

                // Create parameter JavaScript file (bypasses CORS restrictions)
                string paramFileName = "eclipse-launch-params.js";
                string paramFilePath = Path.Combine(Path.GetDirectoryName(htmlFilePath), paramFileName);
                
                // Create parameter JavaScript file (compatible with older .NET versions)
                // Properly escape the JSON string for JavaScript embedding
                string escapedJsonOutput = jsonOutput.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\r", "").Replace("\n", "\\n");
                
                var paramJs = string.Format(@"// Eclipse launch parameters
window.eclipseLaunchParams = {{
  mode: ""eclipse"",
  planFile: ""{0}"",
  patientId: ""{1}"",
  courseId: ""{2}"",
  planId: ""{3}"",
  timestamp: ""{4}"",
  planData: ""{5}""
}};

// Auto-trigger loading if function exists
if (typeof window.loadEclipsePlan === 'function') {{
  console.log('DEBUG: Auto-triggering Eclipse plan loading...');
  window.loadEclipsePlan(window.eclipseLaunchParams);
}}", 
                    tempFilePath.Replace("\\", "\\\\").Replace("\"", "\\\""),
                    context.Patient.Id.Replace("\"", "\\\""),
                    context.Course.Id.Replace("\"", "\\\""),
                    context.PlanSetup.Id.Replace("\"", "\\\""),
                    DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"),
                    escapedJsonOutput);
                
                File.WriteAllText(paramFilePath, paramJs);

                // ====================================================================================
                // STEP 5: LAUNCH THE HTML APP IN DEFAULT BROWSER
                // ====================================================================================
                // Create the file:// URL for the HTML file (without parameters due to browser restrictions)
                string htmlUrl = new Uri(htmlFilePath).ToString();
                string urlWithParams = htmlUrl;

                ProcessStartInfo startInfo = new ProcessStartInfo
                {
                    FileName = urlWithParams,
                    UseShellExecute = true // This will open the URL in the default browser
                };

                Process process = Process.Start(startInfo);
                if (process == null)
                {
                    throw new ApplicationException("Failed to start the browser process.");
                }

                // Launch successful - browser will open automatically with auto-loaded plan
                // No message box needed as the plan will load automatically in the browser
            }
            catch (ApplicationException appEx)
            {
                MessageBox.Show(string.Format("Application Error: {0}", appEx.Message), "Application Error", MessageBoxButton.OK, MessageBoxImage.Error);
            }
            catch (Exception ex)
            {
                string errorMessage = string.Format("An unexpected error occurred:\n\n{0}\n\n{1}", ex.Message, ex.StackTrace);
                MessageBox.Show(errorMessage, "Critical Error", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        /// <summary>
        /// Gets the source file path of the calling method (used to determine launcher directory)
        /// </summary>
        /// <param name="sourceFilePath">Automatically filled by compiler with the source file path</param>
        /// <returns>The full path to the source file</returns>
        public string GetSourceFilePath([CallerFilePath] string sourceFilePath = "")
        {
            return sourceFilePath;
        }
    }

    public class ManualJsonExporter
    {
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

            // Add top-level machine identification so the simulator can set defaults (RDS vs TDS)
            string topLevelModelName = (firstBeam != null && firstBeam.MLC != null && !string.IsNullOrEmpty(firstBeam.MLC.Model)) ? firstBeam.MLC.Model : string.Empty;
            bool isRdsTop = !string.IsNullOrEmpty(topLevelModelName) && topLevelModelName.ToUpper().Contains("SX");
            string topLevelIdentifier = isRdsTop ? "RDS" : "TDS";
            sb.AppendLine(FormatProperty("manufacturerModelName", string.IsNullOrWhiteSpace(topLevelModelName) ? topLevelIdentifier : topLevelModelName, 2, false));
            sb.AppendLine(FormatProperty("machineIdentifierForSpeeds", topLevelIdentifier, 2, false));

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
            sb.AppendLine(FormatProperty("gantryEndAngle", beam.ControlPoints.Last().GantryAngle, indentLevel + 1, false));

            // Compute and include Overall MCSv (collimator-adjusted) to avoid N/A in HTML display
            double mcsValue = ComputeOverallMcsvForBeam(beam);
            sb.AppendLine(FormatProperty("mcsValue", mcsValue, indentLevel + 1, true));

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

            // For Halcyon/Ethos (RDS), emit null for jaws so the simulator skips jaw math cleanly
            if (isRds)
            {
                sb.AppendLine(FormatProperty("asymx", null, indentLevel + 1, false, false));
                sb.AppendLine(FormatProperty("asymy", null, indentLevel + 1, true, false));
            }
            else
            {
                string asymxString = string.Format(CultureInfo.InvariantCulture, "[{0:F2}, {1:F2}]", cp.JawPositions.X1, cp.JawPositions.X2);
                string asymyString = string.Format(CultureInfo.InvariantCulture, "[{0:F2}, {1:F2}]", cp.JawPositions.Y1, cp.JawPositions.Y2);
                sb.AppendLine(FormatProperty("asymx", asymxString, indentLevel + 1, false, false));
                sb.AppendLine(FormatProperty("asymy", asymyString, indentLevel + 1, true, false));
            }

            sb.Append(Indent(indentLevel) + "}");
            return sb.ToString();
        }
        
        #region Manual JSON Building Helpers
        private double ComputeOverallMcsvForBeam(Beam beam)
        {
            try
            {
                if (beam == null || beam.ControlPoints == null || beam.ControlPoints.Count < 2)
                {
                    return 1.0;
                }

                bool isRds = beam.MLC != null && !string.IsNullOrEmpty(beam.MLC.Model) && beam.MLC.Model.ToUpper().Contains("SX");
                // Build boundaries for effective leaf calculation
                double[] boundariesAll = beam.MLC != null && beam.MLC.Model != null ? GetBoundariesArray(beam.MLC.Model) : null;

                List<double> boundariesX1 = null;
                List<double> boundariesX2 = null;
                if (isRds && boundariesAll != null && boundariesAll.Length >= 58)
                {
                    // First 29 belong to MLCX1, remaining to MLCX2 (29 each)
                    boundariesX1 = boundariesAll.Take(29).ToList();
                    boundariesX2 = boundariesAll.Skip(29).ToList();
                }

                // Precompute effective MLC positions for each control point
                List<double[]> effectivePositionsPerCp = new List<double[]>();

                foreach (var cp in beam.ControlPoints)
                {
                    if (cp.LeafPositions == null)
                    {
                        effectivePositionsPerCp.Add(null);
                        continue;
                    }

                    if (!isRds)
                    {
                        int numPairs = cp.LeafPositions.GetLength(1);
                        var a = new double[numPairs];
                        var b = new double[numPairs];
                        for (int i = 0; i < numPairs; i++)
                        {
                            a[i] = cp.LeafPositions[0, i];
                            b[i] = cp.LeafPositions[1, i];
                        }
                        effectivePositionsPerCp.Add(a.Concat(b).ToArray());
                    }
                    else
                    {
                        // Halcyon/Ethos dual-layer: split positions into two layers following exporter logic
                        // Layer1: indices 0..27, Layer2: 28..56
                        int total = cp.LeafPositions.GetLength(1);
                        int layer1Pairs = Math.Min(28, total);
                        int layer2Pairs = Math.Max(0, total - 28);

                        var layer1_A = new double[layer1Pairs];
                        var layer1_B = new double[layer1Pairs];
                        for (int i = 0; i < layer1Pairs; i++) { layer1_A[i] = cp.LeafPositions[0, i]; layer1_B[i] = cp.LeafPositions[1, i]; }

                        var layer2_A = new double[layer2Pairs];
                        var layer2_B = new double[layer2Pairs];
                        for (int i = 0; i < layer2Pairs; i++) { layer2_A[i] = cp.LeafPositions[0, 28 + i]; layer2_B[i] = cp.LeafPositions[1, 28 + i]; }

                        if (boundariesX1 == null || boundariesX2 == null || boundariesX1.Count < 2 || boundariesX2.Count < 2)
                        {
                            // Fallback: concatenate layers without virtual refinement
                            var aCombined = layer1_A.Concat(layer2_A).ToArray();
                            var bCombined = layer1_B.Concat(layer2_B).ToArray();
                            effectivePositionsPerCp.Add(aCombined.Concat(bCombined).ToArray());
                        }
                        else
                        {
                            // Build union of boundaries
                            var virtualBoundaries = new SortedSet<double>(boundariesX1.Concat(boundariesX2));
                            var vb = virtualBoundaries.ToList();
                            var vA = new List<double>();
                            var vB = new List<double>();

                            for (int vi = 0; vi < vb.Count - 1; vi++)
                            {
                                double center = (vb[vi] + vb[vi + 1]) / 2.0;

                                // Find containing indices in each layer's boundaries
                                int idx1 = -1; for (int j = 0; j < boundariesX1.Count - 1; j++) { if (center >= boundariesX1[j] && center < boundariesX1[j + 1]) { idx1 = j; break; } }
                                int idx2 = -1; for (int k = 0; k < boundariesX2.Count - 1; k++) { if (center >= boundariesX2[k] && center < boundariesX2[k + 1]) { idx2 = k; break; } }

                                double pos1_A = (idx1 >= 0 && idx1 < layer1_A.Length) ? layer1_A[idx1] : double.NegativeInfinity;
                                double pos1_B = (idx1 >= 0 && idx1 < layer1_B.Length) ? layer1_B[idx1] : double.PositiveInfinity;
                                double pos2_A = (idx2 >= 0 && idx2 < layer2_A.Length) ? layer2_A[idx2] : double.NegativeInfinity;
                                double pos2_B = (idx2 >= 0 && idx2 < layer2_B.Length) ? layer2_B[idx2] : double.PositiveInfinity;

                                vA.Add(Math.Max(pos1_A, pos2_A));
                                vB.Add(Math.Min(pos1_B, pos2_B));
                            }
                            effectivePositionsPerCp.Add(vA.Concat(vB).ToArray());
                        }
                    }
                }

                // Remove nulls if any
                var validEffective = effectivePositionsPerCp.Where(p => p != null && p.Length > 1).ToList();
                if (validEffective.Count == 0) return 1.0;

                int nPairsVirtual = validEffective[0].Length / 2;
                if (nPairsVirtual <= 0) return 1.0;

                // Precompute max opening over arc
                double[] maxPairOpening = Enumerable.Repeat(double.NegativeInfinity, nPairsVirtual).ToArray();
                foreach (var eff in validEffective)
                {
                    for (int i = 0; i < nPairsVirtual; i++)
                    {
                        double opening = eff[i + nPairsVirtual] - eff[i];
                        if (opening > maxPairOpening[i]) maxPairOpening[i] = opening;
                    }
                }

                Func<double[], double> calcLsvForBank = (bank) =>
                {
                    if (bank == null || bank.Length < 2) return 1.0;
                    int N = bank.Length;
                    double minPos = bank.Min();
                    double maxPos = bank.Max();
                    double posMax = maxPos - minPos;
                    if (posMax < 0.001 || (N - 1) == 0) return 1.0;
                    double sumVar = 0;
                    for (int i = 0; i < N - 1; i++) sumVar += (posMax - Math.Abs(bank[i] - bank[i + 1]));
                    double lsv = sumVar / ((N - 1) * posMax);
                    return double.IsNaN(lsv) ? 1.0 : lsv;
                };

                double K_MCS_COLL = 0.002;
                double mcsSum = 0.0;
                double totalMuW = 0.0;

                for (int seg = 0; seg < beam.ControlPoints.Count - 1; seg++)
                {
                    var eff_i = effectivePositionsPerCp[seg];
                    var eff_i1 = effectivePositionsPerCp[seg + 1];
                    if (eff_i == null || eff_i1 == null || eff_i.Length != eff_i1.Length) continue;

                    // LSV for cp_i and cp_i1
                    var bankA_i = eff_i.Take(nPairsVirtual).ToArray();
                    var bankB_i = eff_i.Skip(nPairsVirtual).ToArray();
                    var bankA_i1 = eff_i1.Take(nPairsVirtual).ToArray();
                    var bankB_i1 = eff_i1.Skip(nPairsVirtual).ToArray();

                    double lsv_i = 0.5 * (calcLsvForBank(bankA_i) + calcLsvForBank(bankB_i));
                    double lsv_i1 = 0.5 * (calcLsvForBank(bankA_i1) + calcLsvForBank(bankB_i1));

                    // AAV for cp_i and cp_i1
                    Func<double[], double> calcAav = (eff) =>
                    {
                        double currentOpening = 0;
                        for (int i = 0; i < nPairsVirtual; i++)
                        {
                            double opening = eff[i + nPairsVirtual] - eff[i];
                            if (opening > 0) currentOpening += opening;
                        }
                        double maxArcTotal = 0;
                        for (int i = 0; i < nPairsVirtual; i++)
                        {
                            double mo = maxPairOpening[i];
                            if (mo > 0 && mo > double.NegativeInfinity) maxArcTotal += mo;
                        }
                        if (maxArcTotal < 0.001) return (currentOpening < 0.001 ? 1.0 : 0.0);
                        double aav = currentOpening / maxArcTotal;
                        return double.IsNaN(aav) ? 1.0 : Math.Max(0, Math.Min(1, aav));
                    };

                    double aav_i = calcAav(eff_i);
                    double aav_i1 = calcAav(eff_i1);

                    double meanAAV = 0.5 * (aav_i + aav_i1);
                    double meanLSV = 0.5 * (lsv_i + lsv_i1);

                    // Collimator delta
                    double deltaColl = Math.Abs(beam.ControlPoints[seg + 1].CollimatorAngle - beam.ControlPoints[seg].CollimatorAngle);
                    if (deltaColl > 180) deltaColl = 360 - deltaColl;
                    double collFactor = 1 + K_MCS_COLL * deltaColl;

                    // MU weight for segment
                    double muW = beam.ControlPoints[seg + 1].MetersetWeight - beam.ControlPoints[seg].MetersetWeight;
                    if (muW > 1e-6)
                    {
                        mcsSum += (meanAAV * meanLSV * collFactor * muW);
                        totalMuW += muW;
                    }
                }

                if (totalMuW < 1e-5) return 1.0;
                return mcsSum / totalMuW;
            }
            catch
            {
                return 1.0;
            }
        }
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
