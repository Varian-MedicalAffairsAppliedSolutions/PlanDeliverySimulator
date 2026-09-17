// PlanDeliverySimulator-MultiPlanComparator-Launcher.cs - ESAPI Script for launching the multi-plan comparator
// Exports multiple plans from the current course and injects them into RP_MultiPlan_Comparator.html

using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Windows;
using System.Diagnostics;
using System.Runtime.CompilerServices;
using System.Globalization;
using System.Reflection;
using System.Net;
using System.Threading;
using System.Windows.Media;
using System.Windows.Media.Media3D;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using VMS.TPS.Common.Model.API;

namespace VMS.TPS
{
    public class Script
    {
        // Keep this modest to avoid huge JS payloads when a course has many plans.
        private const int MaxPlansToExport = 12;
        private const int LocalServerPort = 8087;

        public void Execute(ScriptContext context)
        {
            try
            {
                if (context.Patient == null)
                {
                    MessageBox.Show("Error: No patient is loaded.", "Patient Context Error", MessageBoxButton.OK, MessageBoxImage.Error);
                    return;
                }

                // Find comparator HTML
                string sourceFilePath = GetSourceFilePath();
                string launcherPath = !string.IsNullOrEmpty(sourceFilePath) ? Path.GetDirectoryName(sourceFilePath) : null;
                if (string.IsNullOrEmpty(launcherPath))
                {
                    launcherPath = AppDomain.CurrentDomain.BaseDirectory;
                }

                const string htmlFileName = "RP_MultiPlan_Comparator.html";
                string htmlFilePath = Path.Combine(launcherPath, "PlanDeliverySimulator", htmlFileName);
                if (!File.Exists(htmlFilePath))
                {
                    htmlFilePath = Path.Combine(launcherPath, htmlFileName);
                }

                if (!File.Exists(htmlFilePath))
                {
                    MessageBox.Show(
                        string.Format("Error: The HTML file '{0}' was not found. Searched in:\n- {1}\n- {2}",
                            htmlFileName,
                            Path.Combine(launcherPath, "PlanDeliverySimulator"),
                            launcherPath),
                        "HTML File Not Found",
                        MessageBoxButton.OK,
                        MessageBoxImage.Error);
                    return;
                }

                // Collect plans across ALL courses for the currently opened patient.
                // We export plans that have at least one non-setup beam.
                var allCoursePlanGroups = new List<CoursePlans>();

                var patientCourses = (context.Patient.Courses ?? Enumerable.Empty<Course>()).Where(c => c != null).ToList();
                if (patientCourses.Count == 0)
                {
                    MessageBox.Show("No courses found for this patient.", "No Courses", MessageBoxButton.OK, MessageBoxImage.Information);
                    return;
                }

                foreach (var course in patientCourses)
                {
                    var eligiblePlans = (course.PlanSetups ?? Enumerable.Empty<PlanSetup>())
                        .Where(p => p != null)
                        .Where(p => p.Beams != null && p.Beams.Any(b => b != null && !b.IsSetupField))
                        .ToList();

                    if (eligiblePlans.Count == 0) continue;

                    // Prefer the currently selected plan first within its course
                    if (context.PlanSetup != null)
                    {
                        var current = eligiblePlans.FirstOrDefault(p => p.Id == context.PlanSetup.Id);
                        if (current != null)
                        {
                            eligiblePlans.Remove(current);
                            eligiblePlans.Insert(0, current);
                        }
                    }

                    allCoursePlanGroups.Add(new CoursePlans { Course = course, Plans = eligiblePlans });
                }

                if (allCoursePlanGroups.Count == 0)
                {
                    MessageBox.Show("No eligible plans found for this patient (non-setup beams required).", "No Plans", MessageBoxButton.OK, MessageBoxImage.Information);
                    return;
                }

                // Put the currently selected course first (if available)
                if (context.Course != null)
                {
                    var idx = allCoursePlanGroups.FindIndex(g => g.Course != null && g.Course.Id == context.Course.Id);
                    if (idx > 0)
                    {
                        var g = allCoursePlanGroups[idx];
                        allCoursePlanGroups.RemoveAt(idx);
                        allCoursePlanGroups.Insert(0, g);
                    }
                }

                // Prompt user to select plans to export (across courses).
                var selectedPlans = PromptForPlanSelectionMultiCourse(allCoursePlanGroups, context.Course, context.PlanSetup, MaxPlansToExport);
                if (selectedPlans == null)
                {
                    // Cancelled
                    return;
                }
                if (selectedPlans.Count == 0)
                {
                    MessageBox.Show("No plans were selected.", "No Selection", MessageBoxButton.OK, MessageBoxImage.Information);
                    return;
                }

                var exporter = new ManualJsonExporterMulti();
                var structExporter = new ManualRtStructMeshJsonExporterMulti();
                var planEntries = new List<PlanEntry>();

                foreach (var plan in selectedPlans)
                {
                    string jsonOutput = exporter.ExportPlanToJson(plan);

                    string tempFileName = string.Format("eclipse-plan-{0}-{1}.json", plan.Id, DateTime.Now.ToString("yyyyMMdd-HHmmss"));
                    string tempFilePath = Path.Combine(Path.GetTempPath(), tempFileName);
                    File.WriteAllText(tempFilePath, jsonOutput);

                    // Embed plan JSON as Base64 to avoid issues with JS string escaping (e.g., literal "\\n" breaking JSON.parse).
                    // Comparator will decode via atob when planDataIsBase64=true.
                    string base64JsonOutput = Convert.ToBase64String(Encoding.UTF8.GetBytes(jsonOutput));

                    string structTempFilePath = null;
                    string base64StructJsonOutput = null;
                    try
                    {
                        string structJsonOutput = structExporter.ExportStructToJson(plan);
                        if (!string.IsNullOrWhiteSpace(structJsonOutput))
                        {
                            string structTempFileName = string.Format("eclipse-struct-{0}-{1}.json", plan.Id, DateTime.Now.ToString("yyyyMMdd-HHmmss"));
                            structTempFilePath = Path.Combine(Path.GetTempPath(), structTempFileName);
                            File.WriteAllText(structTempFilePath, structJsonOutput);
                            base64StructJsonOutput = Convert.ToBase64String(Encoding.UTF8.GetBytes(structJsonOutput));
                        }
                    }
                    catch
                    {
                        structTempFilePath = null;
                        base64StructJsonOutput = null;
                    }

                    planEntries.Add(new PlanEntry
                    {
                        PatientId = context.Patient.Id,
                        CourseId = (plan.Course != null ? plan.Course.Id : (context.Course != null ? context.Course.Id : string.Empty)),
                        PlanId = plan.Id,
                        Label = plan.Id,
                        PlanFile = tempFilePath,
                        PlanData = base64JsonOutput,

                        StructFile = structTempFilePath,
                        StructData = base64StructJsonOutput
                    });
                }

                string paramFileName = "eclipse-multiplan-launch-params.js";
                string paramFilePath = Path.Combine(Path.GetDirectoryName(htmlFilePath), paramFileName);

                var sb = new StringBuilder();
                sb.AppendLine("// Eclipse multi-plan launch parameters");
                sb.AppendLine("window.eclipseMultiPlanLaunchParams = {");
                sb.AppendLine("  mode: \"eclipse-multiplan\",");
                sb.AppendLine(string.Format("  timestamp: \"{0}\",", DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss")));
                sb.AppendLine("  plans: [");

                for (int i = 0; i < planEntries.Count; i++)
                {
                    var p = planEntries[i];
                    sb.AppendLine("    {");
                    sb.AppendLine(string.Format("      patientId: \"{0}\",", EscapeJs(p.PatientId)));
                    sb.AppendLine(string.Format("      courseId: \"{0}\",", EscapeJs(p.CourseId)));
                    sb.AppendLine(string.Format("      planId: \"{0}\",", EscapeJs(p.PlanId)));
                    sb.AppendLine(string.Format("      label: \"{0}\",", EscapeJs(p.Label)));
                    sb.AppendLine(string.Format("      planFile: \"{0}\",", EscapeJs(p.PlanFile)));
                    sb.AppendLine("      planDataIsBase64: true,");
                    bool hasStruct = !string.IsNullOrEmpty(p.StructData);
                    sb.AppendLine(string.Format("      planData: \"{0}\"{1}", p.PlanData, hasStruct ? "," : ""));

                    if (hasStruct)
                    {
                        sb.AppendLine("      structDataIsBase64: true,");
                        sb.AppendLine(string.Format("      structData: \"{0}\",", p.StructData));
                        sb.AppendLine(string.Format("      structFile: \"{0}\"", EscapeJs(p.StructFile ?? string.Empty)));
                    }
                    sb.Append("    }");
                    if (i < planEntries.Count - 1) sb.Append(",");
                    sb.AppendLine();
                }

                sb.AppendLine("  ]");
                sb.AppendLine("};");
                sb.AppendLine();
                sb.AppendLine("if (typeof window.loadEclipseMultiPlanComparator === 'function') {");
                sb.AppendLine("  console.log('DEBUG: Auto-triggering Eclipse multi-plan loading...');");
                sb.AppendLine("  window.loadEclipseMultiPlanComparator(window.eclipseMultiPlanLaunchParams);");
                sb.AppendLine("}");

                try
                {
                    File.WriteAllText(paramFilePath, sb.ToString());
                }
                catch (Exception ex)
                {
                    MessageBox.Show(
                        string.Format("Error: Failed to write '{0}'.\n\nPath:\n{1}\n\nDetails:\n{2}\n\nTip: Place the HTML comparator in a user-writable folder.",
                            paramFileName,
                            paramFilePath,
                            ex.Message),
                        "Write Error",
                        MessageBoxButton.OK,
                        MessageBoxImage.Error);
                    return;
                }

                // Pragmatic same-origin: serve the tool over http://localhost so the comparator and embedded pages
                // share an origin (avoids file:// opaque origin restrictions).
                string webRoot = Path.GetDirectoryName(htmlFilePath);
                EnsureLocalServerRunning(webRoot, LocalServerPort);

                // Launch comparator in default browser
                string htmlUrl = string.Format("http://localhost:{0}/{1}", LocalServerPort, Path.GetFileName(htmlFilePath));
                ProcessStartInfo startInfo = new ProcessStartInfo
                {
                    FileName = htmlUrl,
                    UseShellExecute = true
                };

                var process = Process.Start(startInfo);
                if (process == null)
                {
                    throw new ApplicationException("Failed to start the browser process.");
                }
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

        private static void EnsureLocalServerRunning(string webRoot, int port)
        {
            if (string.IsNullOrEmpty(webRoot)) return;

            string pingUrl = string.Format("http://localhost:{0}/__plandelivery_ping", port);
            if (CanHttpGet(pingUrl)) return;

            try
            {
                string serverScript = Path.Combine(webRoot, "tools", "PlanDeliverySimulatorServer.ps1");
                if (!File.Exists(serverScript))
                {
                    // If the script is missing, fall back to file:// launch behavior via user guidance.
                    MessageBox.Show(
                        string.Format(
                            "Local web server script was not found:\n\n{0}\n\n" +
                            "To use same-origin mode, run this PowerShell server script from the simulator folder, then re-run the launcher.",
                            serverScript),
                        "Local Server Not Found",
                        MessageBoxButton.OK,
                        MessageBoxImage.Warning);
                    return;
                }

                // Start PowerShell server hidden.
                var psi = new ProcessStartInfo
                {
                    FileName = "powershell.exe",
                    Arguments = string.Format(
                        "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \"{0}\" -Port {1} -Root \"{2}\"",
                        serverScript,
                        port,
                        webRoot),
                    UseShellExecute = false,
                    CreateNoWindow = true
                };

                Process.Start(psi);
            }
            catch
            {
                // We'll still try to proceed; user can run the server manually.
            }

            // Give the server a moment to start, then re-ping.
            for (int i = 0; i < 10; i++)
            {
                Thread.Sleep(150);
                if (CanHttpGet(pingUrl)) return;
            }

            MessageBox.Show(
                string.Format(
                    "Could not reach the local PlanDeliverySimulator web server at:\n{0}\n\n" +
                    "If you have script execution restrictions, run it manually:\n" +
                    "powershell -NoProfile -ExecutionPolicy Bypass -File \"{1}\" -Port {2} -Root \"{3}\"",
                    pingUrl,
                    Path.Combine(webRoot, "tools", "PlanDeliverySimulatorServer.ps1"),
                    port,
                    webRoot),
                "Local Server Not Running",
                MessageBoxButton.OK,
                MessageBoxImage.Warning);
        }

        private static bool CanHttpGet(string url)
        {
            try
            {
                var req = (HttpWebRequest)WebRequest.Create(url);
                req.Method = "GET";
                req.Timeout = 600;
                using (var resp = (HttpWebResponse)req.GetResponse())
                {
                    return resp.StatusCode == HttpStatusCode.OK;
                }
            }
            catch
            {
                return false;
            }
        }

        private class PlanEntry
        {
            public string PatientId;
            public string CourseId;
            public string PlanId;
            public string Label;
            public string PlanFile;
            public string PlanData;

            public string StructFile;
            public string StructData;
        }

        private static string EscapeJs(string s)
        {
            if (s == null) return string.Empty;
            return s.Replace("\\", "\\\\").Replace("\"", "\\\"");
        }

        public string GetSourceFilePath([CallerFilePath] string sourceFilePath = "")
        {
            return sourceFilePath;
        }

        private class CoursePlans
        {
            public Course Course;
            public List<PlanSetup> Plans;
        }

        private static List<PlanSetup> PromptForPlanSelectionMultiCourse(List<CoursePlans> courseGroups, Course preferredCourse, PlanSetup preferredPlan, int maxPlans)
        {
            if (courseGroups == null || courseGroups.Count == 0) return new List<PlanSetup>();

            var dialog = new Window
            {
                Title = "Select plans for Multi-Plan Comparator",
                Width = 680,
                Height = 780,
                WindowStartupLocation = WindowStartupLocation.CenterScreen,
                ResizeMode = ResizeMode.CanResize,
                Background = System.Windows.Media.Brushes.White
            };

            var root = new DockPanel { LastChildFill = true, Margin = new Thickness(12) };
            dialog.Content = root;

            var headerPanel = new StackPanel { Orientation = Orientation.Vertical, Margin = new Thickness(0, 0, 0, 10) };
            DockPanel.SetDock(headerPanel, Dock.Top);
            root.Children.Add(headerPanel);

            headerPanel.Children.Add(new TextBlock
            {
                Text = string.Format(
                    "Choose up to {0} plans across one or more courses to export into the Multi-Plan Comparator.",
                    maxPlans),
                TextWrapping = TextWrapping.Wrap
            });

            // Course multi-select "dropdown" (button + popup)
            var courseChooserRow = new DockPanel { LastChildFill = true, Margin = new Thickness(0, 8, 0, 0) };
            headerPanel.Children.Add(courseChooserRow);

            var courseLabel = new TextBlock
            {
                Text = "Courses:",
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 8, 0)
            };
            DockPanel.SetDock(courseLabel, Dock.Left);
            courseChooserRow.Children.Add(courseLabel);

            var courseButton = new Button
            {
                Content = "Select courses  \u25BE",
                HorizontalAlignment = HorizontalAlignment.Left,
                MinWidth = 340,
                Padding = new Thickness(10, 7, 10, 7),
                Background = new SolidColorBrush(Color.FromRgb(14, 165, 233)),
                Foreground = Brushes.White,
                BorderBrush = new SolidColorBrush(Color.FromRgb(2, 132, 199)),
                BorderThickness = new Thickness(1),
                FontWeight = FontWeights.SemiBold,
                Cursor = System.Windows.Input.Cursors.Hand,
                ToolTip = "Click to select one or more courses",
                HorizontalContentAlignment = HorizontalAlignment.Left
            };
            DockPanel.SetDock(courseButton, Dock.Left);
            courseChooserRow.Children.Add(courseButton);

            var coursePopup = new Popup
            {
                PlacementTarget = courseButton,
                Placement = PlacementMode.Bottom,
                StaysOpen = false
            };

            var coursePopupBorder = new Border
            {
                BorderBrush = new SolidColorBrush(Color.FromRgb(2, 132, 199)),
                BorderThickness = new Thickness(1),
                Background = System.Windows.Media.Brushes.White,
                Padding = new Thickness(8),
                Width = 420
            };
            coursePopup.Child = coursePopupBorder;

            var coursePopupPanel = new StackPanel { Orientation = Orientation.Vertical };
            coursePopupBorder.Child = coursePopupPanel;

            var coursePopupHeader = new TextBlock
            {
                Text = "Select courses (multi-select):",
                Margin = new Thickness(0, 0, 0, 6),
                FontWeight = FontWeights.SemiBold
            };
            coursePopupPanel.Children.Add(coursePopupHeader);

            var courseListScroll = new ScrollViewer { VerticalScrollBarVisibility = ScrollBarVisibility.Auto, Height = 180 };
            coursePopupPanel.Children.Add(courseListScroll);
            var courseListPanel = new StackPanel { Orientation = Orientation.Vertical };
            courseListScroll.Content = courseListPanel;

            headerPanel.Children.Add(new Border { Height = 1, Background = System.Windows.Media.Brushes.LightGray, Margin = new Thickness(0, 10, 0, 0) });

            // Footer
            var footer = new DockPanel { LastChildFill = false, Margin = new Thickness(0, 10, 0, 0) };
            DockPanel.SetDock(footer, Dock.Bottom);
            root.Children.Add(footer);

            var selectionStatus = new TextBlock
            {
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 10, 0)
            };
            DockPanel.SetDock(selectionStatus, Dock.Left);
            footer.Children.Add(selectionStatus);

            var buttonsPanel = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                HorizontalAlignment = HorizontalAlignment.Right
            };
            DockPanel.SetDock(buttonsPanel, Dock.Right);
            footer.Children.Add(buttonsPanel);

            var selectAllVisibleBtn = new Button { Content = "Select All (visible)", Margin = new Thickness(0, 0, 8, 0), MinWidth = 130 };
            var selectNoneVisibleBtn = new Button { Content = "Select None", Margin = new Thickness(0, 0, 18, 0), MinWidth = 100 };
            var okBtn = new Button { Content = "OK", IsDefault = true, Margin = new Thickness(0, 0, 8, 0), MinWidth = 90 };
            var cancelBtn = new Button { Content = "Cancel", IsCancel = true, MinWidth = 90 };
            buttonsPanel.Children.Add(selectAllVisibleBtn);
            buttonsPanel.Children.Add(selectNoneVisibleBtn);
            buttonsPanel.Children.Add(okBtn);
            buttonsPanel.Children.Add(cancelBtn);

            // Plans area
            var plansScroll = new ScrollViewer
            {
                VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
                HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled
            };
            root.Children.Add(plansScroll);
            var plansPanel = new StackPanel { Orientation = Orientation.Vertical };
            plansScroll.Content = plansPanel;

            // Selection state
            var selectedCourseIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var selectedPlanKeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var visiblePlanCheckboxes = new List<CheckBox>();
            var planByCheckbox = new Dictionary<CheckBox, PlanSetup>();

            Func<PlanSetup, string> planKey = (p) =>
            {
                string c = (p != null && p.Course != null) ? p.Course.Id : string.Empty;
                string id = (p != null) ? p.Id : string.Empty;
                return (c + "||" + id);
            };

            // Default selected courses: current course if present, otherwise first course.
            if (preferredCourse != null && !string.IsNullOrEmpty(preferredCourse.Id))
            {
                selectedCourseIds.Add(preferredCourse.Id);
            }
            else
            {
                var firstCourse = courseGroups.FirstOrDefault(g => g.Course != null);
                if (firstCourse != null && firstCourse.Course != null) selectedCourseIds.Add(firstCourse.Course.Id);
            }

            // Default selected plans: prefer current plan first, then fill up to max across selected courses.
            if (preferredPlan != null)
            {
                selectedPlanKeys.Add(planKey(preferredPlan));
            }
            foreach (var group in courseGroups)
            {
                if (group.Course == null || string.IsNullOrEmpty(group.Course.Id)) continue;
                if (!selectedCourseIds.Contains(group.Course.Id)) continue;
                foreach (var p in group.Plans)
                {
                    if (selectedPlanKeys.Count >= maxPlans) break;
                    selectedPlanKeys.Add(planKey(p));
                }
            }

            Action updateCourseButtonText = () =>
            {
                var selected = courseGroups
                    .Where(g => g.Course != null && selectedCourseIds.Contains(g.Course.Id))
                    .Select(g => g.Course.Id)
                    .ToList();
                if (selected.Count == 0)
                {
                    courseButton.Content = "No courses selected  \u25BE";
                }
                else
                {
                    courseButton.Content = string.Join(", ", selected) + "  \u25BE";
                }
            };

            Action updateStatus = () =>
            {
                int selectedPlansCount = selectedPlanKeys.Count;
                selectionStatus.Text = string.Format("Selected plans: {0} / {1}", selectedPlansCount, maxPlans);
                selectionStatus.Foreground = selectedPlansCount > maxPlans ? System.Windows.Media.Brushes.DarkRed : System.Windows.Media.Brushes.Black;
            };

            Action renderPlans = () =>
            {
                plansPanel.Children.Clear();
                visiblePlanCheckboxes.Clear();
                planByCheckbox.Clear();

                var visibleGroups = courseGroups
                    .Where(g => g.Course != null && !string.IsNullOrEmpty(g.Course.Id))
                    .Where(g => selectedCourseIds.Contains(g.Course.Id))
                    .ToList();

                if (visibleGroups.Count == 0)
                {
                    plansPanel.Children.Add(new TextBlock
                    {
                        Text = "Select at least one course to see its plans.",
                        Margin = new Thickness(0, 8, 0, 0),
                        Foreground = System.Windows.Media.Brushes.DimGray
                    });
                    updateStatus();
                    return;
                }

                foreach (var group in visibleGroups)
                {
                    var courseHeader = new TextBlock
                    {
                        Text = string.Format("Course: {0}", group.Course.Id),
                        Margin = new Thickness(0, 12, 0, 6),
                        FontWeight = FontWeights.SemiBold
                    };
                    plansPanel.Children.Add(courseHeader);

                    foreach (var plan in group.Plans)
                    {
                        int beamCount = 0;
                        double mu = 0;
                        try
                        {
                            beamCount = plan.Beams != null ? plan.Beams.Count(b => b != null && !b.IsSetupField) : 0;
                            mu = plan.Beams != null ? plan.Beams.Where(b => b != null && !b.IsSetupField).Sum(b => b.Meterset.Value) : 0;
                        }
                        catch { }

                        bool isPreferredPlan = (preferredPlan != null && plan.Id == preferredPlan.Id);

                        var cb = new CheckBox
                        {
                            Content = string.Format("{0}{1}  (Beams: {2}, MU: {3:F0})",
                                plan.Id,
                                isPreferredPlan ? "  [current]" : "",
                                beamCount,
                                mu),
                            Margin = new Thickness(18, 0, 0, 6),
                            IsChecked = selectedPlanKeys.Contains(planKey(plan))
                        };
                        if (isPreferredPlan)
                        {
                            cb.FontWeight = FontWeights.SemiBold;
                        }

                        cb.Checked += (s, e) =>
                        {
                            selectedPlanKeys.Add(planKey(plan));
                            if (selectedPlanKeys.Count > maxPlans)
                            {
                                selectedPlanKeys.Remove(planKey(plan));
                                cb.IsChecked = false;
                                MessageBox.Show(
                                    string.Format("You can select at most {0} plans.", maxPlans),
                                    "Selection limit",
                                    MessageBoxButton.OK,
                                    MessageBoxImage.Information);
                            }
                            updateStatus();
                        };
                        cb.Unchecked += (s, e) =>
                        {
                            selectedPlanKeys.Remove(planKey(plan));
                            updateStatus();
                        };

                        visiblePlanCheckboxes.Add(cb);
                        planByCheckbox[cb] = plan;
                        plansPanel.Children.Add(cb);
                    }
                }

                updateStatus();
            };

            // Build course popup items
            courseListPanel.Children.Clear();
            foreach (var group in courseGroups)
            {
                if (group.Course == null || string.IsNullOrEmpty(group.Course.Id)) continue;
                int planCount = group.Plans != null ? group.Plans.Count : 0;
                var cb = new CheckBox
                {
                    Content = string.Format("{0}  ({1} plans)", group.Course.Id, planCount),
                    Margin = new Thickness(0, 0, 0, 6),
                    IsChecked = selectedCourseIds.Contains(group.Course.Id)
                };
                cb.Checked += (s, e) =>
                {
                    selectedCourseIds.Add(group.Course.Id);
                    updateCourseButtonText();
                    renderPlans();
                };
                cb.Unchecked += (s, e) =>
                {
                    selectedCourseIds.Remove(group.Course.Id);
                    updateCourseButtonText();
                    renderPlans();
                };
                courseListPanel.Children.Add(cb);
            }

            courseButton.Click += (s, e) =>
            {
                coursePopup.IsOpen = true;
            };
            dialog.Loaded += (s, e) =>
            {
                // Attach popup to window after load so it behaves correctly.
                if (!root.Children.Contains(coursePopup))
                {
                    root.Children.Add(coursePopup);
                }
            };

            selectAllVisibleBtn.Click += (s, e) =>
            {
                foreach (var cb in visiblePlanCheckboxes)
                {
                    if (selectedPlanKeys.Count >= maxPlans) break;
                    cb.IsChecked = true;
                }
                updateStatus();
            };
            selectNoneVisibleBtn.Click += (s, e) =>
            {
                foreach (var cb in visiblePlanCheckboxes) cb.IsChecked = false;
                updateStatus();
            };

            List<PlanSetup> result = null;
            okBtn.Click += (s, e) =>
            {
                if (selectedPlanKeys.Count == 0)
                {
                    MessageBox.Show("Select at least one plan to continue.", "No plans selected", MessageBoxButton.OK, MessageBoxImage.Information);
                    return;
                }
                if (selectedPlanKeys.Count > maxPlans)
                {
                    MessageBox.Show(string.Format("Please select at most {0} plans.", maxPlans), "Too many plans", MessageBoxButton.OK, MessageBoxImage.Warning);
                    return;
                }

                // Flatten selected plans in a stable order: by courseGroups order then plan order.
                var selected = new List<PlanSetup>();
                foreach (var g in courseGroups)
                {
                    if (g.Course == null || g.Plans == null) continue;
                    foreach (var p in g.Plans)
                    {
                        if (selectedPlanKeys.Contains(planKey(p))) selected.Add(p);
                    }
                }

                result = selected;
                dialog.DialogResult = true;
                dialog.Close();
            };

            updateCourseButtonText();
            renderPlans();

            bool? dialogResult = dialog.ShowDialog();
            if (dialogResult == true)
            {
                return result ?? new List<PlanSetup>();
            }
            return null;
        }
    }

    // Best-effort RTSTRUCT-like exporter for the multi-plan comparator.
    // Uses Structure.MeshGeometry vertices (patient coordinates) and emits JSON compatible with the simulator's RS JSON loader.
    public class ManualRtStructMeshJsonExporterMulti
    {
        private const int MaxRoisToExport = 80;
        private const int MaxPointsPerRoi = 6000;

        public string ExportStructToJson(PlanSetup plan)
        {
            if (plan == null) return null;

            StructureSet ss = null;
            try { ss = plan.StructureSet; } catch { ss = null; }
            if (ss == null) return null;

            string frameOfReferenceUid = TryGetFrameOfReferenceUid(ss) ?? string.Empty;

            var structures = (ss.Structures ?? Enumerable.Empty<Structure>())
                .Where(s => s != null)
                .Where(s => !IsStructureEmpty(s))
                .ToList();

            if (structures.Count == 0) return null;

            var roisJson = new List<string>();
            int roiNumber = 0;

            foreach (var s in structures)
            {
                if (roisJson.Count >= MaxRoisToExport) break;

                MeshGeometry3D mesh = null;
                try { mesh = s.MeshGeometry; } catch { mesh = null; }
                if (mesh == null || mesh.Positions == null || mesh.Positions.Count < 3) continue;

                var positions = mesh.Positions;
                int step = 1;
                if (positions.Count > MaxPointsPerRoi)
                {
                    step = (int)Math.Ceiling((double)positions.Count / (double)MaxPointsPerRoi);
                    if (step < 1) step = 1;
                }

                var sampled = new List<Point3D>();
                for (int i = 0; i < positions.Count; i += step)
                {
                    sampled.Add(positions[i]);
                }
                if (sampled.Count < 3) continue;

                roiNumber += 1;

                string name = SafeString(s.Id);
                string type = SafeString(TryGetStructureDicomType(s));
                string roiFoR = SafeString(frameOfReferenceUid);
                var rgb = TryGetStructureColorRgb(s);

                var sb = new StringBuilder();
                sb.AppendLine("    {");
                sb.AppendLine(string.Format(CultureInfo.InvariantCulture, "      \"roiNumber\": {0},", roiNumber));
                sb.AppendLine(string.Format("      \"name\": \"{0}\",", JsonEscape(name)));
                if (!string.IsNullOrEmpty(type))
                {
                    sb.AppendLine(string.Format("      \"type\": \"{0}\",", JsonEscape(type)));
                }
                if (!string.IsNullOrEmpty(roiFoR))
                {
                    sb.AppendLine(string.Format("      \"frameOfReferenceUID\": \"{0}\",", JsonEscape(roiFoR)));
                }
                if (rgb != null && rgb.Length >= 3)
                {
                    sb.AppendLine(string.Format(CultureInfo.InvariantCulture, "      \"displayColor\": [{0}, {1}, {2}],", rgb[0], rgb[1], rgb[2]));
                }
                sb.AppendLine("      \"contours\": [");
                sb.AppendLine("        {");
                sb.AppendLine("          \"points\": [");
                for (int i = 0; i < sampled.Count; i++)
                {
                    var p = sampled[i];
                    sb.Append("            [");
                    sb.Append(FormatDouble(p.X));
                    sb.Append(", ");
                    sb.Append(FormatDouble(p.Y));
                    sb.Append(", ");
                    sb.Append(FormatDouble(p.Z));
                    sb.Append("]");
                    if (i < sampled.Count - 1) sb.Append(",");
                    sb.AppendLine();
                }
                sb.AppendLine("          ]");
                sb.AppendLine("        }");
                sb.AppendLine("      ]");
                sb.Append("    }");

                roisJson.Add(sb.ToString());
            }

            if (roisJson.Count == 0) return null;

            var outSb = new StringBuilder();
            outSb.AppendLine("{");
            outSb.AppendLine(string.Format("  \"frameOfReferenceUID\": \"{0}\",", JsonEscape(frameOfReferenceUid)));
            outSb.AppendLine("  \"rois\": [");
            for (int i = 0; i < roisJson.Count; i++)
            {
                outSb.Append(roisJson[i]);
                if (i < roisJson.Count - 1) outSb.Append(",");
                outSb.AppendLine();
            }
            outSb.AppendLine("  ]");
            outSb.AppendLine("}");
            return outSb.ToString();
        }

        private static string SafeString(string s)
        {
            return s ?? string.Empty;
        }

        private static string JsonEscape(string s)
        {
            if (s == null) return string.Empty;
            return s
                .Replace("\\", "\\\\")
                .Replace("\"", "\\\"")
                .Replace("\r", "\\r")
                .Replace("\n", "\\n");
        }

        private static string FormatDouble(double v)
        {
            if (double.IsNaN(v) || double.IsInfinity(v)) return "0";
            return v.ToString("0.###", CultureInfo.InvariantCulture);
        }

        private static bool IsStructureEmpty(Structure s)
        {
            if (s == null) return true;
            try
            {
                var prop = s.GetType().GetProperty("IsEmpty", BindingFlags.Instance | BindingFlags.Public);
                if (prop != null)
                {
                    var v = prop.GetValue(s, null);
                    if (v is bool) return (bool)v;
                }
            }
            catch { }
            return false;
        }

        private static string TryGetStructureDicomType(Structure s)
        {
            if (s == null) return string.Empty;
            try
            {
                var prop = s.GetType().GetProperty("DicomType", BindingFlags.Instance | BindingFlags.Public);
                if (prop != null)
                {
                    var v = prop.GetValue(s, null);
                    return v != null ? v.ToString() : string.Empty;
                }
            }
            catch { }
            return string.Empty;
        }

        private static int[] TryGetStructureColorRgb(Structure s)
        {
            if (s == null) return null;
            try
            {
                var prop = s.GetType().GetProperty("Color", BindingFlags.Instance | BindingFlags.Public);
                if (prop == null) return null;
                var v = prop.GetValue(s, null);
                if (v == null) return null;
                if (v is Color)
                {
                    var c = (Color)v;
                    return new int[] { c.R, c.G, c.B };
                }
            }
            catch { }
            return null;
        }

        private static string TryGetFrameOfReferenceUid(StructureSet ss)
        {
            if (ss == null) return string.Empty;
            try
            {
                var imgProp = ss.GetType().GetProperty("Image", BindingFlags.Instance | BindingFlags.Public);
                var img = imgProp != null ? imgProp.GetValue(ss, null) : null;
                if (img != null)
                {
                    var forProp = img.GetType().GetProperty("FrameOfReference", BindingFlags.Instance | BindingFlags.Public);
                    var fo = forProp != null ? forProp.GetValue(img, null) : null;
                    if (fo != null)
                    {
                        var uidProp = fo.GetType().GetProperty("UID", BindingFlags.Instance | BindingFlags.Public);
                        var uid = uidProp != null ? uidProp.GetValue(fo, null) : null;
                        if (uid != null) return uid.ToString();
                    }
                }
            }
            catch { }

            try
            {
                var forProp = ss.GetType().GetProperty("FrameOfReference", BindingFlags.Instance | BindingFlags.Public);
                var fo = forProp != null ? forProp.GetValue(ss, null) : null;
                if (fo != null)
                {
                    var uidProp = fo.GetType().GetProperty("UID", BindingFlags.Instance | BindingFlags.Public);
                    var uid = uidProp != null ? uidProp.GetValue(fo, null) : null;
                    if (uid != null) return uid.ToString();
                }
            }
            catch { }

            return string.Empty;
        }
    }

    // Full exporter (copied from PlanDeliverySimulator-Launcher.cs) under a distinct name to avoid collisions.
    public class ManualJsonExporterMulti
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

            string isoString = TryGetBeamIsocenterArrayLiteral(beam);
            if (!string.IsNullOrEmpty(isoString))
            {
                sb.AppendLine(FormatProperty("isocenterPosition", isoString, indentLevel + 1, false, false));
            }

            var mlcPosStrings = BuildMlcPositionData(cp.LeafPositions, beam.MLC, indentLevel + 2);
            sb.AppendLine(FormatArray("mlcPositionData", mlcPosStrings, indentLevel + 1, false));

            bool isRds = beam.MLC != null && !string.IsNullOrEmpty(beam.MLC.Model) && beam.MLC.Model.ToUpper().Contains("SX");
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

        private static string TryGetBeamIsocenterArrayLiteral(Beam beam)
        {
            if (beam == null) return null;
            try
            {
                object isoObj = null;
                try
                {
                    var prop = beam.GetType().GetProperty("IsocenterPosition", BindingFlags.Instance | BindingFlags.Public);
                    if (prop != null) isoObj = prop.GetValue(beam, null);
                }
                catch
                {
                    isoObj = null;
                }
                if (isoObj == null) return null;

                double x = GetDoubleMember(isoObj, "x", "X");
                double y = GetDoubleMember(isoObj, "y", "Y");
                double z = GetDoubleMember(isoObj, "z", "Z");
                if (double.IsNaN(x) || double.IsNaN(y) || double.IsNaN(z)) return null;

                return string.Format(CultureInfo.InvariantCulture, "[{0:F2}, {1:F2}, {2:F2}]", x, y, z);
            }
            catch
            {
                return null;
            }
        }

        private static double GetDoubleMember(object obj, params string[] names)
        {
            if (obj == null || names == null) return double.NaN;
            var t = obj.GetType();
            foreach (var name in names)
            {
                try
                {
                    var prop = t.GetProperty(name, BindingFlags.Instance | BindingFlags.Public);
                    if (prop != null)
                    {
                        var v = prop.GetValue(obj, null);
                        if (v == null) continue;
                        return Convert.ToDouble(v, CultureInfo.InvariantCulture);
                    }
                }
                catch { }
                try
                {
                    var field = t.GetField(name, BindingFlags.Instance | BindingFlags.Public);
                    if (field != null)
                    {
                        var v = field.GetValue(obj);
                        if (v == null) continue;
                        return Convert.ToDouble(v, CultureInfo.InvariantCulture);
                    }
                }
                catch { }
            }
            return double.NaN;
        }

        private double ComputeOverallMcsvForBeam(Beam beam)
        {
            try
            {
                if (beam == null || beam.ControlPoints == null || beam.ControlPoints.Count < 2)
                {
                    return 1.0;
                }

                bool isRds = beam.MLC != null && !string.IsNullOrEmpty(beam.MLC.Model) && beam.MLC.Model.ToUpper().Contains("SX");
                double[] boundariesAll = beam.MLC != null && beam.MLC.Model != null ? GetBoundariesArray(beam.MLC.Model) : null;

                List<double> boundariesX1 = null;
                List<double> boundariesX2 = null;
                if (isRds && boundariesAll != null && boundariesAll.Length >= 58)
                {
                    boundariesX1 = boundariesAll.Take(29).ToList();
                    boundariesX2 = boundariesAll.Skip(29).ToList();
                }

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
                            var aCombined = layer1_A.Concat(layer2_A).ToArray();
                            var bCombined = layer1_B.Concat(layer2_B).ToArray();
                            effectivePositionsPerCp.Add(aCombined.Concat(bCombined).ToArray());
                        }
                        else
                        {
                            var virtualBoundaries = new SortedSet<double>(boundariesX1.Concat(boundariesX2));
                            var vb = virtualBoundaries.ToList();
                            var vA = new List<double>();
                            var vB = new List<double>();

                            for (int vi = 0; vi < vb.Count - 1; vi++)
                            {
                                double center = (vb[vi] + vb[vi + 1]) / 2.0;

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

                var validEffective = effectivePositionsPerCp.Where(p => p != null && p.Length > 1).ToList();
                if (validEffective.Count == 0) return 1.0;

                int nPairsVirtual = validEffective[0].Length / 2;
                if (nPairsVirtual <= 0) return 1.0;

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

                    var bankA_i = eff_i.Take(nPairsVirtual).ToArray();
                    var bankB_i = eff_i.Skip(nPairsVirtual).ToArray();
                    var bankA_i1 = eff_i1.Take(nPairsVirtual).ToArray();
                    var bankB_i1 = eff_i1.Skip(nPairsVirtual).ToArray();

                    double lsv_i = 0.5 * (calcLsvForBank(bankA_i) + calcLsvForBank(bankB_i));
                    double lsv_i1 = 0.5 * (calcLsvForBank(bankA_i1) + calcLsvForBank(bankB_i1));

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

                    double deltaColl = Math.Abs(beam.ControlPoints[seg + 1].CollimatorAngle - beam.ControlPoints[seg].CollimatorAngle);
                    if (deltaColl > 180) deltaColl = 360 - deltaColl;
                    double collFactor = 1 + K_MCS_COLL * deltaColl;

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
            return null;
        }
    }
}
