import React, { useState, useEffect } from "react";
import {
  Calendar,
  Users,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Eye,
  EyeOff,
  Upload,
  FileSpreadsheet,
  AlertCircle,
} from "lucide-react";
import * as XLSX from "xlsx";

const EmployeeAvailabilityDashboard = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fileUploaded, setFileUploaded] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [fileName, setFileName] = useState("");
  const [expandedEmployees, setExpandedEmployees] = useState(new Set());
  const [ganttTimeframe, setGanttTimeframe] = useState("month");
  const [showUtilization, setShowUtilization] = useState(true);

  const isPublicHoliday = (dateStr) => {
    // French public holidays (format: MM-DD)
    const publicHolidays = [
      "04-21", // 21-avr (Easter Monday - varies by year, using 2025 date)
      "05-01", // 01-mai (Labor Day)
      "05-08", // 08-mai (Victory in Europe Day)
      "05-29", // 29-mai (Ascension Day - varies by year, using 2025 date)
      "06-09", // 09-juin (Whit Monday - varies by year, using 2025 date)
      "07-14", // 14-juil (Bastille Day)
      "08-15", // 15-août (Assumption of Mary)
      "11-11", // 11-nov (Armistice Day)
      "12-25", // 25-déc (Christmas Day)
    ];

    const date = new Date(dateStr);
    const monthDay = `${(date.getMonth() + 1)
      .toString()
      .padStart(2, "0")}-${date.getDate().toString().padStart(2, "0")}`;
    return publicHolidays.includes(monthDay);
  };

  const categorizeJob = (jobNo) => {
    if (!jobNo) return "unknown";
    const jobNoStr = jobNo.toString();
    if (jobNoStr.length === 4) return "absence";
    switch (jobNoStr) {
      case "9999999996":
        return "reservation";
      case "9999999980":
        return "training";
      case "9999999910":
      case "9999999911":
        return "loa";
      case "7777777777":
        return "pending";
      default:
        return jobNoStr.startsWith("2") ? "chargeable" : "other";
    }
  };

  const getCategoryLabel = (category) => {
    const labels = {
      absence: "Absence/Holidays",
      reservation: "Reservation w/o jobcode",
      training: "Training",
      loa: "LOA (Leave of Absence)",
      pending: "Pending jobcode",
      chargeable: "Chargeable",
      other: "Other",
      unknown: "Unknown",
    };
    return labels[category] || "Unknown";
  };

  const getCategoryColor = (category) => {
    const colors = {
      absence: "bg-red-100 text-red-800",
      reservation: "bg-gray-100 text-gray-800",
      training: "bg-green-100 text-green-800",
      loa: "bg-purple-100 text-purple-800",
      pending: "bg-yellow-100 text-yellow-800",
      chargeable: "bg-blue-100 text-blue-800",
      other: "bg-orange-100 text-orange-800",
      unknown: "bg-gray-100 text-gray-800",
    };
    return colors[category] || "bg-gray-100 text-gray-800";
  };

  const getAssignmentColorByCategory = (category, utilization) => {
    const colors = {
      absence: "bg-red-500",
      reservation: "bg-gray-500",
      training: "bg-green-500",
      loa: "bg-purple-500",
      pending: "bg-yellow-500",
      other: "bg-orange-500",
    };
    if (category === "chargeable") {
      if (utilization >= 100) return "bg-blue-600";
      if (utilization >= 75) return "bg-blue-500";
      if (utilization >= 50) return "bg-blue-400";
      return "bg-blue-300";
    }
    return colors[category] || "bg-gray-400";
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // Vérifier le type de fichier
    const allowedTypes = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
      "application/vnd.ms-excel", // .xls
      "text/csv", // .csv
    ];

    if (
      !allowedTypes.includes(file.type) &&
      !file.name.match(/\.(xlsx|xls|csv)$/i)
    ) {
      setUploadError(
        "Veuillez sélectionner un fichier Excel (.xlsx, .xls) ou CSV (.csv)"
      );
      return;
    }

    setLoading(true);
    setUploadError(null);
    setFileName(file.name);

    try {
      const arrayBuffer = await file.arrayBuffer();

      let processedData = [];

      if (file.name.toLowerCase().endsWith(".csv")) {
        // Traitement CSV
        const text = new TextDecoder().decode(arrayBuffer);
        const lines = text.split("\n");

        processedData = lines
          .slice(1)
          .filter((line) => line.trim())
          .map((line) => {
            const values = line.split(",");
            return {
              empId: values[0]?.trim() || "",
              lastName: values[1]?.trim() || "",
              firstName: values[2]?.trim() || "",
              jobNo: values[3]?.trim() || "",
              jobName: values[4]?.trim() || "",
              startDate: values[5]?.trim() || "",
              endDate: values[6]?.trim() || "",
              utilization: parseFloat(values[7]) || 0,
              status: values[8]?.trim() || "",
              hours: parseFloat(values[9]) || 0,
              startDateParsed: values[10]?.trim() || "",
              endDateParsed: values[11]?.trim() || "",
              utilPercent: values[12]?.trim() || "",
              workingDays: parseFloat(values[13]) || 0,
              hoursTotal: parseFloat(values[14]) || 0,
              hoursPerDay: parseFloat(values[15]) || 0,
              category: categorizeJob(values[3]?.trim()),
            };
          });
      } else {
        // Traitement Excel
        const workbook = XLSX.read(arrayBuffer, {
          cellStyles: true,
          cellFormulas: true,
          cellDates: true,
          cellNF: true,
          sheetStubs: true,
        });

        // Prendre la première feuille ou chercher une feuille spécifique
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, {
          header: 1,
          raw: false,
        });

        if (jsonData.length < 2) {
          throw new Error(
            "Le fichier semble vide ou ne contient pas assez de données"
          );
        }

        processedData = jsonData
          .slice(1)
          .filter((row) => row.length > 0)
          .map((row) => ({
            empId: row[0] || "",
            lastName: row[1] || "",
            firstName: row[2] || "",
            jobNo: row[3] || "",
            jobName: row[4] || "",
            startDate: row[5] || "",
            endDate: row[6] || "",
            utilization: parseFloat(row[7]) || 0,
            status: row[8] || "",
            hours: parseFloat(row[9]) || 0,
            startDateParsed: row[10] || "",
            endDateParsed: row[11] || "",
            utilPercent: row[12] || "",
            workingDays: parseFloat(row[13]) || 0,
            hoursTotal: parseFloat(row[14]) || 0,
            hoursPerDay: parseFloat(row[15]) || 0,
            category: categorizeJob(row[3]),
          }));
      }

      if (processedData.length === 0) {
        throw new Error("Aucune donnée valide trouvée dans le fichier");
      }

      setData(processedData);
      setFileUploaded(true);
      console.log(`Données chargées: ${processedData.length} enregistrements`);
    } catch (error) {
      console.error("Erreur lors du traitement du fichier:", error);
      setUploadError(`Erreur lors du traitement du fichier: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const resetDashboard = () => {
    setData([]);
    setFileUploaded(false);
    setUploadError(null);
    setFileName("");
    setExpandedEmployees(new Set());
  };

  const parseDate = (dateStr) => {
    if (!dateStr) return null;
    if (dateStr.includes("/")) {
      const parts = dateStr.split("/");
      if (parts.length === 3) {
        const month = parts[0].padStart(2, "0");
        const day = parts[1].padStart(2, "0");
        const year = parts[2].length === 2 ? "20" + parts[2] : parts[2];
        return `${year}-${month}-${day}`;
      }
    } else if (dateStr.includes(".")) {
      const parts = dateStr.split(".");
      if (parts.length === 3) {
        const day = parts[0].padStart(2, "0");
        const month = parts[1].padStart(2, "0");
        const year = parts[2];
        return `${year}-${month}-${day}`;
      }
    }
    return dateStr;
  };

  const getEnhancedGanttData = () => {
    const employees = {};

    data.forEach((record) => {
      const empKey = `${record.empId}`;
      if (!employees[empKey]) {
        employees[empKey] = {
          empId: record.empId,
          name: `${record.firstName} ${record.lastName}`,
          assignments: [],
          totalUtilization: 0,
          projectCount: 0,
          projects: new Set(),
          chargeableHours: 0,
          absenceHours: 0,
          otherHours: 0,
          totalHours: 0,
          netAvailableHours: 0,
          trueUtilizationRate: 0,
          availableCapacityHours: 0,
        };
      }

      const startDate = parseDate(record.startDate);
      const endDate = parseDate(record.endDate);

      if (startDate && endDate) {
        employees[empKey].assignments.push({
          jobName: record.jobName,
          startDate,
          endDate,
          utilization: record.utilization || 0,
          status: record.status,
          jobNo: record.jobNo,
          hoursPerDay: record.hoursPerDay,
          category: record.category,
        });

        if (record.category === "chargeable")
          employees[empKey].chargeableHours += record.hoursPerDay;
        else if (record.category === "absence" || record.category === "loa")
          employees[empKey].absenceHours += record.hoursPerDay;
        else employees[empKey].otherHours += record.hoursPerDay;

        employees[empKey].totalHours += record.hoursPerDay;
        employees[empKey].totalUtilization += record.utilization || 0;
        employees[empKey].projects.add(record.jobName);
      }
    });

    Object.values(employees).forEach((emp) => {
      emp.projectCount = emp.projects.size;
      emp.assignments.sort(
        (a, b) => new Date(a.startDate) - new Date(b.startDate)
      );

      const totalAssignmentDays = emp.assignments.reduce(
        (total, assignment) => {
          const start = new Date(assignment.startDate);
          const end = new Date(assignment.endDate);
          const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
          return total + days;
        },
        0
      );

      const avgDailyChargeableHours =
        emp.chargeableHours / Math.max(totalAssignmentDays, 1);
      const avgDailyAbsenceHours =
        emp.absenceHours / Math.max(totalAssignmentDays, 1);

      emp.netAvailableHours = Math.max(0, 8 - avgDailyAbsenceHours);
      emp.availableCapacityHours = Math.max(
        0,
        emp.netAvailableHours - avgDailyChargeableHours
      );
      emp.trueUtilizationRate =
        emp.netAvailableHours > 0
          ? (avgDailyChargeableHours / emp.netAvailableHours) * 100
          : 0;
    });

    return Object.values(employees).sort(
      (a, b) => b.trueUtilizationRate - a.trueUtilizationRate
    );
  };

  const getTimelineRange = () => {
    const today = new Date();
    const startDate = new Date(today);
    const endDate = new Date(today);

    switch (ganttTimeframe) {
      case "week":
        startDate.setDate(today.getDate() - 7);
        endDate.setDate(today.getDate() + 21);
        break;
      case "month":
        startDate.setMonth(today.getMonth() - 1);
        endDate.setMonth(today.getMonth() + 2);
        break;
      case "quarter":
        startDate.setMonth(today.getMonth() - 3);
        endDate.setMonth(today.getMonth() + 6);
        break;
    }
    return { startDate, endDate };
  };

  const getPositionFromDate = (date, timelineStart, timelineEnd) => {
    const totalDays = (timelineEnd - timelineStart) / (1000 * 60 * 60 * 24);
    const daysSinceStart =
      (new Date(date) - timelineStart) / (1000 * 60 * 60 * 24);
    return Math.max(0, Math.min(100, (daysSinceStart / totalDays) * 100));
  };

  const getTimelineLabels = () => {
    const { startDate, endDate } = getTimelineRange();
    const labels = [];
    const current = new Date(startDate);

    while (current <= endDate) {
      labels.push({
        date: new Date(current),
        position: getPositionFromDate(current, startDate, endDate),
      });

      if (ganttTimeframe === "week") current.setDate(current.getDate() + 1);
      else if (ganttTimeframe === "month")
        current.setDate(current.getDate() + 7);
      else current.setMonth(current.getMonth() + 1);
    }
    return labels;
  };

  const toggleEmployeeExpansion = (empId) => {
    const newExpanded = new Set(expandedEmployees);
    if (newExpanded.has(empId)) newExpanded.delete(empId);
    else newExpanded.add(empId);
    setExpandedEmployees(newExpanded);
  };

  const calculateTimelineUtilization = (
    employee,
    timelineStart,
    timelineEnd
  ) => {
    let chargeableHours = 0,
      absenceHours = 0,
      totalWorkingDays = 0;
    const dailyUtilization = [];

    const workingDate = new Date(timelineStart);
    while (workingDate <= timelineEnd) {
      // Exclude weekends AND public holidays from working days
      if (
        workingDate.getDay() !== 0 &&
        workingDate.getDay() !== 6 &&
        !isPublicHoliday(workingDate.toISOString().split("T")[0])
      ) {
        totalWorkingDays++;
        const dateStr = workingDate.toISOString().split("T")[0];
        let dayChargeableHours = 0,
          dayAbsenceHours = 0;

        employee.assignments.forEach((assignment) => {
          const startDate = new Date(assignment.startDate);
          const endDate = new Date(assignment.endDate);
          const currentDay = new Date(dateStr);

          // Fixed: Include end date properly
          if (currentDay >= startDate && currentDay <= endDate) {
            const hoursForThisDay = assignment.hoursPerDay || 0;
            if (assignment.category === "chargeable")
              dayChargeableHours += hoursForThisDay;
            else if (
              assignment.category === "absence" ||
              assignment.category === "loa"
            )
              dayAbsenceHours += hoursForThisDay;
          }
        });

        const dayNetAvailableHours = Math.max(0, 8 - dayAbsenceHours);
        const dayUtilizationRate =
          dayNetAvailableHours > 0
            ? (dayChargeableHours / dayNetAvailableHours) * 100
            : 0;
        const dayAvailableCapacity = Math.max(
          0,
          dayNetAvailableHours - dayChargeableHours
        );

        dailyUtilization.push({
          date: dateStr,
          chargeableHours: dayChargeableHours,
          absenceHours: dayAbsenceHours,
          netAvailableHours: dayNetAvailableHours,
          utilizationRate: dayUtilizationRate,
          availableCapacityHours: dayAvailableCapacity,
          position: getPositionFromDate(
            workingDate,
            timelineStart,
            timelineEnd
          ),
        });

        chargeableHours += dayChargeableHours;
        absenceHours += dayAbsenceHours;
      }
      workingDate.setDate(workingDate.getDate() + 1);
    }

    const totalAvailableHours = totalWorkingDays * 8;
    const netAvailableHours = Math.max(0, totalAvailableHours - absenceHours);
    const utilizationRate =
      netAvailableHours > 0 ? (chargeableHours / netAvailableHours) * 100 : 0;

    return {
      chargeableHours,
      absenceHours,
      netAvailableHours,
      utilizationRate,
      availableCapacityHours: Math.max(0, netAvailableHours - chargeableHours),
      dailyUtilization,
    };
  };

  const consolidateAssignments = (assignments) => {
    const consolidated = {};

    assignments.forEach((assignment) => {
      const jobKey = assignment.jobName;
      if (!consolidated[jobKey]) {
        consolidated[jobKey] = {
          jobName: assignment.jobName,
          jobNo: assignment.jobNo,
          periods: [],
          totalUtilization: 0,
          totalHours: 0,
          status: assignment.status,
          hasProvisional: false,
          category: assignment.category,
        };
      }

      consolidated[jobKey].periods.push({
        startDate: assignment.startDate,
        endDate: assignment.endDate,
        utilization: assignment.utilization,
        hoursPerDay: assignment.hoursPerDay,
        status: assignment.status,
        category: assignment.category,
      });

      consolidated[jobKey].totalUtilization += assignment.utilization;
      consolidated[jobKey].totalHours += assignment.hoursPerDay;
      if (assignment.status === "P") consolidated[jobKey].hasProvisional = true;
    });

    // Merge consecutive periods for each job
    Object.values(consolidated).forEach((job) => {
      job.periods.sort((a, b) => new Date(a.startDate) - new Date(b.startDate));

      const mergedPeriods = [];
      let currentPeriod = null;

      job.periods.forEach((period) => {
        if (!currentPeriod) {
          currentPeriod = { ...period };
        } else {
          const currentEnd = new Date(currentPeriod.endDate);
          const periodStart = new Date(period.startDate);

          // Check if periods are consecutive (next day or same day)
          const dayAfterCurrentEnd = new Date(currentEnd);
          dayAfterCurrentEnd.setDate(dayAfterCurrentEnd.getDate() + 1);

          if (
            periodStart <= dayAfterCurrentEnd &&
            currentPeriod.utilization === period.utilization &&
            currentPeriod.hoursPerDay === period.hoursPerDay &&
            currentPeriod.status === period.status
          ) {
            // Merge periods - extend the end date
            currentPeriod.endDate = period.endDate;
          } else {
            // Periods are not consecutive or different, save current and start new
            mergedPeriods.push(currentPeriod);
            currentPeriod = { ...period };
          }
        }
      });

      // Don't forget to add the last period
      if (currentPeriod) {
        mergedPeriods.push(currentPeriod);
      }

      job.periods = mergedPeriods;
    });

    return Object.values(consolidated);
  };

  const renderExpandedEmployeeView = (employee) => {
    const { startDate: timelineStart, endDate: timelineEnd } =
      getTimelineRange();
    const timelineData = calculateTimelineUtilization(
      employee,
      timelineStart,
      timelineEnd
    );
    const isOverAllocated = timelineData.utilizationRate > 100;

    const groupedAssignments = {
      chargeable: [],
      pending: [],
      reservation: [],
      training: [],
      absence: [],
      loa: [],
      other: [],
    };

    consolidateAssignments(employee.assignments).forEach((assignment) => {
      const category = assignment.category;
      if (groupedAssignments[category])
        groupedAssignments[category].push(assignment);
      else groupedAssignments.other.push(assignment);
    });

    const renderAssignmentSection = (title, assignments, sectionColor) => {
      if (assignments.length === 0) return null;

      return (
        <div className="mb-4">
          <div
            className={`text-sm font-medium mb-2 px-3 py-1 rounded ${sectionColor}`}
          >
            {title} ({assignments.length})
          </div>
          {assignments.map((consolidatedJob, idx) => (
            <div key={idx} className="flex items-center ml-2 mb-1">
              <div className="w-60 flex-shrink-0 pr-4">
                <div className="text-sm">
                  <div className="font-medium text-gray-900 truncate">
                    {consolidatedJob.jobName}
                  </div>
                  <div className="text-xs text-gray-500 flex items-center gap-2 flex-wrap">
                    <span>Job: {consolidatedJob.jobNo}</span>
                    {consolidatedJob.periods.length > 1 && (
                      <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded">
                        {consolidatedJob.periods.length} periods
                      </span>
                    )}
                    {consolidatedJob.hasProvisional && (
                      <span className="bg-orange-100 text-orange-800 px-2 py-1 rounded">
                        Provisional
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex-1 relative h-6 bg-gray-100 rounded">
                {/* Vertical grid lines for job timeline alignment */}
                {getTimelineLabels().map((label, index) => (
                  <div
                    key={`job-grid-${idx}-${index}`}
                    className="absolute w-px bg-gray-300 opacity-40"
                    style={{
                      left: `${label.position}%`,
                      top: "0",
                      height: "100%",
                      zIndex: 1,
                    }}
                  />
                ))}

                {consolidatedJob.periods.map((period, periodIdx) => {
                  const startPos = getPositionFromDate(
                    period.startDate,
                    timelineStart,
                    timelineEnd
                  );
                  const endPos = getPositionFromDate(
                    period.endDate,
                    timelineStart,
                    timelineEnd
                  );
                  const width = Math.max(1, endPos - startPos);

                  return (
                    <div
                      key={periodIdx}
                      className={`absolute h-6 rounded text-xs text-white flex items-center justify-center ${getAssignmentColorByCategory(
                        consolidatedJob.category,
                        period.utilization
                      )}`}
                      style={{
                        left: `${startPos}%`,
                        width: `${width}%`,
                        opacity: period.status === "P" ? 0.7 : 0.9,
                        zIndex: periodIdx + 1,
                      }}
                      title={`${period.startDate} to ${period.endDate} (${
                        period.hoursPerDay
                      }h/day) - ${getCategoryLabel(period.category)}`}
                    >
                      {width > 8 && (
                        <span className="truncate px-1 text-xs">
                          {showUtilization
                            ? `${period.hoursPerDay.toFixed(
                                1
                              )}h (${period.utilization.toFixed(1)}%)`
                            : ""}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      );
    };

    return (
      <div className="p-3 space-y-3">
        {/* Timeline Reference Grid - spans across all charts */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ left: "16rem" }}
        >
          {getTimelineLabels().map((label, index) => (
            <div
              key={`grid-${index}`}
              className="absolute w-px bg-gray-200 opacity-40"
              style={{
                left: `${label.position}%`,
                top: "0",
                height: "100%",
                zIndex: 1,
              }}
            />
          ))}
        </div>

        {/* Available Capacity Summary */}
        <div className="bg-green-50 p-3 rounded-lg relative">
          <div className="flex items-center">
            <div className="w-64 flex-shrink-0 pr-4">
              <div className="text-sm">
                <div className="font-medium text-green-800">
                  Available Capacity
                </div>
                <div className="text-xs text-green-600 flex items-center gap-2 flex-wrap">
                  <span>
                    {timelineData.availableCapacityHours.toFixed(1)}h remaining
                  </span>
                  <span className="bg-green-100 text-green-800 px-2 py-1 rounded font-medium">
                    {(100 - timelineData.utilizationRate).toFixed(1)}% free
                  </span>
                  <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded font-medium">
                    {timelineData.utilizationRate.toFixed(1)}% avg utilized
                  </span>
                </div>
              </div>
            </div>
            <div className="flex-1 relative h-8 bg-green-100 rounded border-2 border-green-200">
              {/* Vertical grid lines */}
              {getTimelineLabels().map((label, index) => (
                <div
                  key={`capacity-grid-${index}`}
                  className="absolute w-px bg-white opacity-30"
                  style={{
                    left: `${label.position}%`,
                    top: "0",
                    height: "100%",
                  }}
                />
              ))}

              <div className="absolute inset-0 bg-green-200 rounded"></div>
              <div
                className="absolute h-8 rounded bg-blue-500 flex items-center justify-center"
                style={{
                  left: "0%",
                  width: `${Math.min(
                    (timelineData.chargeableHours /
                      timelineData.netAvailableHours) *
                      100,
                    100
                  )}%`,
                }}
              >
                {timelineData.chargeableHours > 0 && (
                  <span className="text-xs text-white font-medium">
                    {timelineData.chargeableHours.toFixed(1)}h Chargeable
                  </span>
                )}
              </div>
              <div
                className="absolute h-8 rounded bg-green-400 flex items-center justify-center"
                style={{
                  left: `${Math.min(
                    (timelineData.chargeableHours /
                      timelineData.netAvailableHours) *
                      100,
                    100
                  )}%`,
                  width: `${Math.max(
                    0,
                    (timelineData.availableCapacityHours /
                      timelineData.netAvailableHours) *
                      100
                  )}%`,
                }}
              >
                {timelineData.availableCapacityHours > 2 && (
                  <span className="text-xs text-white font-medium">
                    {(100 - timelineData.utilizationRate).toFixed(1)}% Free
                  </span>
                )}
              </div>
              {isOverAllocated && (
                <div className="absolute -top-1 -right-1 bg-red-500 text-white text-xs px-1 py-0.5 rounded">
                  Over-allocated ({timelineData.utilizationRate.toFixed(1)}%)
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Daily Utilization Variation Chart */}
        <div className="bg-gray-50 p-3 rounded-lg relative">
          <div className="flex items-center mb-3">
            <div className="w-64 flex-shrink-0 pr-4">
              <div className="text-sm font-medium text-gray-900">
                Daily Utilization Variation
              </div>
              <div className="text-xs text-gray-600">
                Day-by-day utilization rate
              </div>
            </div>
            <div className="flex-1 relative h-16 bg-white rounded border border-gray-200">
              {/* Vertical grid lines */}
              {getTimelineLabels().map((label, index) => (
                <div
                  key={`util-grid-${index}`}
                  className="absolute w-px bg-gray-200 opacity-50"
                  style={{
                    left: `${label.position}%`,
                    top: "0",
                    height: "100%",
                    zIndex: 2,
                  }}
                />
              ))}

              {/* Grid lines */}
              <div
                className="absolute w-full border-t border-red-300 opacity-30"
                style={{ top: "0%" }}
              ></div>
              <div
                className="absolute w-full border-t border-yellow-300 opacity-30"
                style={{ top: "50%" }}
              ></div>
              <div
                className="absolute w-full border-t border-gray-300 opacity-30"
                style={{ top: "100%" }}
              ></div>

              {/* Y-axis labels */}
              <div
                className="absolute -left-8 text-xs text-gray-500"
                style={{ top: "-2px" }}
              >
                100%
              </div>
              <div
                className="absolute -left-6 text-xs text-gray-500"
                style={{ top: "50%", transform: "translateY(-50%)" }}
              >
                50%
              </div>
              <div
                className="absolute -left-4 text-xs text-gray-500"
                style={{ bottom: "-2px" }}
              >
                0%
              </div>

              {/* Public holidays background - similar to weekends but different color */}
              {(() => {
                const holidayAreas = [];
                const { startDate, endDate } = getTimelineRange();
                const currentDate = new Date(startDate);

                while (currentDate <= endDate) {
                  if (
                    isPublicHoliday(currentDate.toISOString().split("T")[0])
                  ) {
                    const centerX = getPositionFromDate(
                      currentDate.toISOString().split("T")[0],
                      timelineStart,
                      timelineEnd
                    );
                    const totalDays =
                      (timelineEnd - timelineStart) / (1000 * 60 * 60 * 24);
                    const dayWidth = 100 / totalDays;

                    holidayAreas.push(
                      <div
                        key={`holiday-${
                          currentDate.toISOString().split("T")[0]
                        }`}
                        className="absolute bg-blue-200 opacity-60"
                        style={{
                          left: `${centerX - dayWidth / 2}%`,
                          top: "0%",
                          width: `${dayWidth}%`,
                          height: "100%",
                          zIndex: 2,
                        }}
                        title={`Public Holiday: ${currentDate.toLocaleDateString(
                          "en-US",
                          { weekday: "long", month: "short", day: "numeric" }
                        )}`}
                      />
                    );
                  }
                  currentDate.setDate(currentDate.getDate() + 1);
                }
                return holidayAreas;
              })()}

              {/* Weekend background - subtle */}
              {(() => {
                const weekendAreas = [];
                const { startDate, endDate } = getTimelineRange();
                const currentDate = new Date(startDate);

                while (currentDate <= endDate) {
                  const dayOfWeek = currentDate.getDay();
                  if (dayOfWeek === 0 || dayOfWeek === 6) {
                    // Sunday or Saturday
                    const centerX = getPositionFromDate(
                      currentDate.toISOString().split("T")[0],
                      timelineStart,
                      timelineEnd
                    );
                    // Calculate approximate day width (assuming roughly equal spacing)
                    const totalDays =
                      (timelineEnd - timelineStart) / (1000 * 60 * 60 * 24);
                    const dayWidth = 100 / totalDays;

                    weekendAreas.push(
                      <div
                        key={`weekend-${
                          currentDate.toISOString().split("T")[0]
                        }`}
                        className="absolute bg-gray-200 opacity-50"
                        style={{
                          left: `${centerX - dayWidth / 2}%`,
                          top: "0%",
                          width: `${dayWidth}%`,
                          height: "100%",
                          zIndex: 1,
                        }}
                        title={`Weekend: ${currentDate.toLocaleDateString(
                          "en-US",
                          { weekday: "long", month: "short", day: "numeric" }
                        )}`}
                      />
                    );
                  }
                  currentDate.setDate(currentDate.getDate() + 1);
                }
                return weekendAreas;
              })()}

              {/* Days off (holidays/absence) - simple orange */}
              {timelineData.dailyUtilization &&
                timelineData.dailyUtilization.map((day, index) => {
                  if (day.netAvailableHours === 0) {
                    const centerX = getPositionFromDate(
                      day.date,
                      timelineStart,
                      timelineEnd
                    );
                    // Calculate approximate day width
                    const totalDays =
                      (timelineEnd - timelineStart) / (1000 * 60 * 60 * 24);
                    const dayWidth = 100 / totalDays;

                    return (
                      <div
                        key={`dayoff-${index}`}
                        className="absolute bg-orange-200"
                        style={{
                          left: `${centerX - dayWidth / 2}%`,
                          top: "0%",
                          width: `${dayWidth}%`,
                          height: "100%",
                          zIndex: 4,
                          opacity: 0.8,
                        }}
                        title={`${day.date}: Day Off - ${day.absenceHours}h absence`}
                      />
                    );
                  }
                  return null;
                })}

              {/* Curve using SVG */}
              {timelineData.dailyUtilization &&
                timelineData.dailyUtilization.length > 1 && (
                  <svg
                    className="absolute inset-0 w-full h-full"
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    style={{ zIndex: 4 }}
                  >
                    <defs>
                      <linearGradient
                        id={`curveGradient-${employee.empId}`}
                        x1="0%"
                        y1="0%"
                        x2="0%"
                        y2="100%"
                      >
                        <stop
                          offset="0%"
                          stopColor="#3b82f6"
                          stopOpacity="0.2"
                        />
                        <stop
                          offset="100%"
                          stopColor="#3b82f6"
                          stopOpacity="0.05"
                        />
                      </linearGradient>
                    </defs>

                    {/* Create step curve path only for available periods */}
                    <path
                      d={(() => {
                        const availablePoints = timelineData.dailyUtilization
                          .filter((day) => day.netAvailableHours > 0)
                          .map((day) => {
                            const x = getPositionFromDate(
                              day.date,
                              timelineStart,
                              timelineEnd
                            );
                            const y = 100 - Math.min(day.utilizationRate, 100);
                            return { x, y, date: day.date };
                          });

                        if (availablePoints.length < 1) return "";

                        const dayWidth =
                          100 /
                          ((timelineEnd - timelineStart) /
                            (1000 * 60 * 60 * 24));

                        // Helper function to find the transition point between two working days
                        const findTransitionPoint = (prevDate, nextDate) => {
                          const prev = new Date(prevDate);
                          const next = new Date(nextDate);
                          let transitionDate = new Date(prev);
                          transitionDate.setDate(prev.getDate() + 1);

                          let lastNonWorkingDay = null;

                          // Find all non-working days between the two dates
                          while (transitionDate < next) {
                            const dateStr = transitionDate
                              .toISOString()
                              .split("T")[0];
                            const isWeekend =
                              transitionDate.getDay() === 0 ||
                              transitionDate.getDay() === 6;
                            const isHoliday = isPublicHoliday(dateStr);

                            // Check if this day is a personal day off (absence) for this employee
                            const isDayOff = timelineData.dailyUtilization.some(
                              (day) =>
                                day.date === dateStr &&
                                day.netAvailableHours === 0
                            );

                            // Only include weekends if there are also personal days off or holidays
                            // Otherwise, skip weekends for transition calculation
                            if (isDayOff || isHoliday) {
                              lastNonWorkingDay = dateStr;
                            } else if (isWeekend && lastNonWorkingDay) {
                              // Include weekend only if we already have other non-working days
                              lastNonWorkingDay = dateStr;
                            }

                            transitionDate.setDate(
                              transitionDate.getDate() + 1
                            );
                          }

                          // If we found non-working days, transition after the last one
                          if (lastNonWorkingDay) {
                            const lastNonWorkingDate = new Date(
                              lastNonWorkingDay
                            );
                            const afterLastNonWorking = new Date(
                              lastNonWorkingDate
                            );
                            afterLastNonWorking.setDate(
                              lastNonWorkingDate.getDate() + 1
                            );

                            // Transition at the boundary between last non-working day and next working day
                            return (
                              (getPositionFromDate(
                                lastNonWorkingDay,
                                timelineStart,
                                timelineEnd
                              ) +
                                getPositionFromDate(
                                  afterLastNonWorking
                                    .toISOString()
                                    .split("T")[0],
                                  timelineStart,
                                  timelineEnd
                                )) /
                              2
                            );
                          }

                          // If no non-working day found, transition in the middle between the two dates
                          const prevX = getPositionFromDate(
                            prevDate,
                            timelineStart,
                            timelineEnd
                          );
                          const nextX = getPositionFromDate(
                            nextDate,
                            timelineStart,
                            timelineEnd
                          );
                          return (prevX + nextX) / 2;
                        };

                        let path = "";

                        // Start from before first point at 0%
                        const firstPoint = availablePoints[0];

                        // Find transition point before first working day
                        const beforeFirstDate = new Date(firstPoint.date);
                        beforeFirstDate.setDate(beforeFirstDate.getDate() - 1);
                        let transitionX = firstPoint.x - dayWidth / 2;

                        // Check if the day before is a non-working day
                        const beforeDateStr = beforeFirstDate
                          .toISOString()
                          .split("T")[0];
                        const isBeforeWeekend =
                          beforeFirstDate.getDay() === 0 ||
                          beforeFirstDate.getDay() === 6;
                        const isBeforeHoliday = isPublicHoliday(beforeDateStr);
                        const isBeforeDayOff =
                          timelineData.dailyUtilization.some(
                            (day) =>
                              day.date === beforeDateStr &&
                              day.netAvailableHours === 0
                          );

                        if (
                          isBeforeWeekend ||
                          isBeforeHoliday ||
                          isBeforeDayOff
                        ) {
                          transitionX = getPositionFromDate(
                            beforeDateStr,
                            timelineStart,
                            timelineEnd
                          );
                        }

                        path = `M ${Math.max(
                          0,
                          transitionX - dayWidth / 2
                        )} 100`; // Start at 0%
                        path += ` H ${transitionX}`; // Horizontal to transition point
                        path += ` V ${firstPoint.y}`; // Vertical up to first value

                        // Horizontal line through first point
                        path += ` H ${firstPoint.x + dayWidth / 2}`; // Horizontal through first point

                        for (let i = 1; i < availablePoints.length; i++) {
                          const curr = availablePoints[i];
                          const prev = availablePoints[i - 1];

                          // Find appropriate transition point considering non-working days
                          const transitionX = findTransitionPoint(
                            prev.date,
                            curr.date
                          );

                          path += ` H ${transitionX}`; // Horizontal to transition point

                          // If utilization changes, go vertical at the transition point
                          if (curr.y !== prev.y) {
                            path += ` V ${curr.y}`; // Vertical to new level
                          }

                          // Continue horizontal through current point
                          path += ` H ${curr.x + dayWidth / 2}`; // Horizontal through current point
                        }

                        // End: find transition point after last working day
                        const lastPoint =
                          availablePoints[availablePoints.length - 1];
                        const afterLastDate = new Date(lastPoint.date);
                        afterLastDate.setDate(afterLastDate.getDate() + 1);

                        let endTransitionX = lastPoint.x + dayWidth / 2;
                        const afterDateStr = afterLastDate
                          .toISOString()
                          .split("T")[0];
                        const isAfterWeekend =
                          afterLastDate.getDay() === 0 ||
                          afterLastDate.getDay() === 6;
                        const isAfterHoliday = isPublicHoliday(afterDateStr);
                        const isAfterDayOff =
                          timelineData.dailyUtilization.some(
                            (day) =>
                              day.date === afterDateStr &&
                              day.netAvailableHours === 0
                          );

                        if (isAfterWeekend || isAfterHoliday || isAfterDayOff) {
                          endTransitionX = getPositionFromDate(
                            afterDateStr,
                            timelineStart,
                            timelineEnd
                          );
                        }

                        path += ` H ${endTransitionX}`; // Horizontal to end transition point
                        path += ` V 100`; // Drop to 0% at the transition point

                        return path;
                      })()}
                      fill="none"
                      stroke="#3b82f6"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      vectorEffect="non-scaling-stroke"
                    />

                    {/* Area under step curve */}
                    <path
                      d={(() => {
                        const availablePoints = timelineData.dailyUtilization
                          .filter((day) => day.netAvailableHours > 0)
                          .map((day) => {
                            const x = getPositionFromDate(
                              day.date,
                              timelineStart,
                              timelineEnd
                            );
                            const y = 100 - Math.min(day.utilizationRate, 100);
                            return { x, y, date: day.date };
                          });

                        if (availablePoints.length < 1) return "";

                        const dayWidth =
                          100 /
                          ((timelineEnd - timelineStart) /
                            (1000 * 60 * 60 * 24));

                        // Same transition logic as the line
                        const findTransitionPoint = (prevDate, nextDate) => {
                          const prev = new Date(prevDate);
                          const next = new Date(nextDate);
                          let transitionDate = new Date(prev);
                          transitionDate.setDate(prev.getDate() + 1);

                          while (transitionDate < next) {
                            const dateStr = transitionDate
                              .toISOString()
                              .split("T")[0];
                            const isWeekend =
                              transitionDate.getDay() === 0 ||
                              transitionDate.getDay() === 6;
                            const isHoliday = isPublicHoliday(dateStr);

                            if (isWeekend || isHoliday) {
                              return getPositionFromDate(
                                dateStr,
                                timelineStart,
                                timelineEnd
                              );
                            }
                            transitionDate.setDate(
                              transitionDate.getDate() + 1
                            );
                          }

                          const prevX = getPositionFromDate(
                            prevDate,
                            timelineStart,
                            timelineEnd
                          );
                          const nextX = getPositionFromDate(
                            nextDate,
                            timelineStart,
                            timelineEnd
                          );
                          return (prevX + nextX) / 2;
                        };

                        let path = "";

                        const firstPoint = availablePoints[0];
                        const beforeFirstDate = new Date(firstPoint.date);
                        beforeFirstDate.setDate(beforeFirstDate.getDate() - 1);
                        let transitionX = firstPoint.x - dayWidth / 2;

                        const beforeDateStr = beforeFirstDate
                          .toISOString()
                          .split("T")[0];
                        const isBeforeWeekend =
                          beforeFirstDate.getDay() === 0 ||
                          beforeFirstDate.getDay() === 6;
                        const isBeforeHoliday = isPublicHoliday(beforeDateStr);

                        if (isBeforeWeekend || isBeforeHoliday) {
                          transitionX = getPositionFromDate(
                            beforeDateStr,
                            timelineStart,
                            timelineEnd
                          );
                        }

                        path = `M ${Math.max(
                          0,
                          transitionX - dayWidth / 2
                        )} 100`; // Start at bottom
                        path += ` H ${transitionX}`; // Horizontal to transition point
                        path += ` V ${firstPoint.y}`; // Up to first value
                        path += ` H ${firstPoint.x + dayWidth / 2}`; // Horizontal through first point

                        for (let i = 1; i < availablePoints.length; i++) {
                          const curr = availablePoints[i];
                          const prev = availablePoints[i - 1];

                          const transitionX = findTransitionPoint(
                            prev.date,
                            curr.date
                          );
                          path += ` H ${transitionX}`; // Horizontal to transition point

                          if (curr.y !== prev.y) {
                            path += ` V ${curr.y}`; // Vertical to new level
                          }

                          path += ` H ${curr.x + dayWidth / 2}`; // Horizontal through current point
                        }

                        // End transition
                        const lastPoint =
                          availablePoints[availablePoints.length - 1];
                        const afterLastDate = new Date(lastPoint.date);
                        afterLastDate.setDate(afterLastDate.getDate() + 1);

                        let endTransitionX = lastPoint.x + dayWidth / 2;
                        const afterDateStr = afterLastDate
                          .toISOString()
                          .split("T")[0];
                        const isAfterWeekend =
                          afterLastDate.getDay() === 0 ||
                          afterLastDate.getDay() === 6;
                        const isAfterHoliday = isPublicHoliday(afterDateStr);

                        if (isAfterWeekend || isAfterHoliday) {
                          endTransitionX = getPositionFromDate(
                            afterDateStr,
                            timelineStart,
                            timelineEnd
                          );
                        }

                        path += ` H ${endTransitionX}`; // Horizontal to end transition point
                        path += ` V 100`; // Down to bottom
                        path += ` Z`; // Close area

                        return path;
                      })()}
                      fill={`url(#curveGradient-${employee.empId})`}
                    />
                  </svg>
                )}

              {/* Data points overlay */}
              {timelineData.dailyUtilization &&
                timelineData.dailyUtilization.length > 0 && (
                  <div className="absolute inset-0" style={{ zIndex: 5 }}>
                    {timelineData.dailyUtilization.map((day, index) => {
                      // Use the actual date from the day object to get precise positioning
                      const dayPosition = getPositionFromDate(
                        day.date,
                        timelineStart,
                        timelineEnd
                      );
                      const y =
                        day.netAvailableHours === 0
                          ? 50
                          : 100 - Math.min(day.utilizationRate, 100);

                      let pointColor = "#6b7280"; // gray for unavailable
                      if (day.netAvailableHours > 0) {
                        if (day.utilizationRate >= 100)
                          pointColor = "#ef4444"; // red
                        else if (day.utilizationRate >= 75)
                          pointColor = "#f97316"; // orange
                        else if (day.utilizationRate >= 50)
                          pointColor = "#eab308"; // yellow
                        else if (day.utilizationRate > 0)
                          pointColor = "#3b82f6"; // blue
                        else pointColor = "#10b981"; // green
                      }

                      const tooltipText =
                        day.netAvailableHours === 0
                          ? `${day.date}: Unavailable (${day.absenceHours}h absence)`
                          : `${day.date}: ${day.utilizationRate.toFixed(
                              1
                            )}% utilized (${day.chargeableHours.toFixed(
                              1
                            )}h/${day.netAvailableHours.toFixed(1)}h)`;

                      return (
                        <div
                          key={index}
                          className={`absolute w-2 h-2 rounded-full border border-white cursor-pointer hover:scale-125 transition-transform ${
                            day.netAvailableHours === 0 ? "opacity-80" : ""
                          }`}
                          style={{
                            left: `${dayPosition}%`,
                            top: `${y}%`,
                            backgroundColor: pointColor,
                            transform: "translate(-50%, -50%)",
                          }}
                          title={tooltipText}
                        />
                      );
                    })}
                  </div>
                )}

              <div className="absolute top-0 right-0 text-xs text-gray-400 p-1">
                {timelineData.dailyUtilization
                  ? timelineData.dailyUtilization.length
                  : 0}{" "}
                days
              </div>
            </div>
          </div>

          {/* Legend for curve */}
          <div className="flex items-center gap-4 text-xs text-gray-600 ml-64">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-gray-400 rounded-full"></div>
              <span>Unavailable</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-green-500 rounded-full"></div>
              <span>0%</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
              <span>1-49%</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
              <span>50-74%</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
              <span>75-99%</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-red-500 rounded-full"></div>
              <span>100%+</span>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-200"></div>

        <div className="space-y-2 relative">
          {renderAssignmentSection(
            "💼 Chargeable Work",
            groupedAssignments.chargeable,
            "bg-blue-100 text-blue-800"
          )}
          {renderAssignmentSection(
            "⏳ Pending & Reservations",
            [...groupedAssignments.pending, ...groupedAssignments.reservation],
            "bg-yellow-100 text-yellow-800"
          )}
          {renderAssignmentSection(
            "📚 Training & Education",
            groupedAssignments.training,
            "bg-green-100 text-green-800"
          )}
          {renderAssignmentSection(
            "🏖️ Absence & Leave",
            [...groupedAssignments.absence, ...groupedAssignments.loa],
            "bg-red-100 text-red-800"
          )}
          {renderAssignmentSection(
            "📋 Other",
            groupedAssignments.other,
            "bg-gray-100 text-gray-800"
          )}
        </div>
      </div>
    );
  };

  // Upload Screen Component
  if (!fileUploaded) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full">
          <div className="bg-white rounded-lg shadow-lg p-8 text-center">
            <div className="mb-6">
              <FileSpreadsheet className="h-16 w-16 text-blue-600 mx-auto mb-4" />
              <h1 className="text-2xl font-bold text-gray-900 mb-2">
                Employee Availability Dashboard
              </h1>
              <p className="text-gray-600">
                Uploadez votre fichier Excel ou CSV pour commencer l'analyse
              </p>
            </div>

            {uploadError && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center">
                  <AlertCircle className="h-5 w-5 text-red-600 mr-2" />
                  <span className="text-red-800 text-sm">{uploadError}</span>
                </div>
              </div>
            )}

            <div className="space-y-4">
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 hover:border-blue-400 transition-colors">
                <input
                  type="file"
                  id="file-upload"
                  className="hidden"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileUpload}
                  disabled={loading}
                />
                <label
                  htmlFor="file-upload"
                  className="cursor-pointer flex flex-col items-center"
                >
                  {loading ? (
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-2"></div>
                  ) : (
                    <Upload className="h-8 w-8 text-gray-400 mb-2" />
                  )}
                  <span className="text-sm font-medium text-gray-900">
                    {loading
                      ? "Traitement en cours..."
                      : "Cliquez pour sélectionner un fichier"}
                  </span>
                  <span className="text-xs text-gray-500 mt-1">
                    Formats supportés: .xlsx, .xls, .csv
                  </span>
                </label>
              </div>
            </div>

            <div className="mt-6 text-xs text-gray-500">
              <p className="mb-2">Format attendu du fichier Excel/CSV :</p>
              <p>
                Colonnes : EmpID, LastName, FirstName, JobNo, JobName,
                StartDate, EndDate, Utilization, Status, Hours, ...
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Loading Screen
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Traitement des données...</p>
          <p className="text-sm text-gray-500 mt-2">{fileName}</p>
        </div>
      </div>
    );
  }

  // Main Dashboard - ONLY GANTT CHART
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Employee Availability Dashboard
            </h1>
            <p className="text-gray-600">
              Track employee availability and utilization in Gantt chart format
              • {fileName}
            </p>
          </div>
          <button
            onClick={resetDashboard}
            className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
          >
            Nouveau fichier
          </button>
        </div>

        {/* Gantt Chart */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-blue-600" />
              <h2 className="text-lg font-semibold text-gray-900">
                Employee Gantt Chart
              </h2>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Timeframe:</span>
                <select
                  value={ganttTimeframe}
                  onChange={(e) => setGanttTimeframe(e.target.value)}
                  className="px-3 py-1 border border-gray-300 rounded-md text-sm"
                >
                  <option value="week">4 Weeks</option>
                  <option value="month">3 Months</option>
                  <option value="quarter">9 Months</option>
                </select>
              </div>

              <button
                onClick={() => setShowUtilization(!showUtilization)}
                className="flex items-center gap-2 px-3 py-1 border border-gray-300 rounded-md text-sm hover:bg-gray-50"
              >
                {showUtilization ? (
                  <Eye className="h-4 w-4" />
                ) : (
                  <EyeOff className="h-4 w-4" />
                )}
                {showUtilization ? "Hide" : "Show"} Utilization
              </button>

              <button
                onClick={() => {
                  const ganttData = getEnhancedGanttData();
                  if (expandedEmployees.size === ganttData.length) {
                    setExpandedEmployees(new Set());
                  } else {
                    setExpandedEmployees(
                      new Set(ganttData.map((emp) => emp.empId))
                    );
                  }
                }}
                className="px-3 py-1 bg-blue-100 text-blue-700 rounded-md text-sm hover:bg-blue-200"
              >
                {expandedEmployees.size === getEnhancedGanttData().length
                  ? "Collapse All"
                  : "Expand All"}
              </button>
            </div>
          </div>

          {/* Timeline Header */}
          <div className="mb-4">
            <div className="flex">
              <div className="w-64 flex-shrink-0"></div>
              <div className="flex-1 relative h-8 bg-gray-50 rounded">
                {getTimelineLabels().map((label, index) => (
                  <div
                    key={index}
                    className="absolute transform -translate-x-1/2 text-xs text-gray-500"
                    style={{ left: `${label.position}%` }}
                  >
                    <div className="w-px h-4 bg-gray-300 mx-auto mb-1"></div>
                    {ganttTimeframe === "week"
                      ? label.date.toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })
                      : ganttTimeframe === "month"
                      ? label.date.toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })
                      : label.date.toLocaleDateString("en-US", {
                          month: "short",
                          year: "2-digit",
                        })}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Employee Rows */}
          <div className="space-y-1">
            {getEnhancedGanttData()
              .slice(0, 25)
              .map((employee) => {
                const isExpanded = expandedEmployees.has(employee.empId);
                const { startDate: timelineStart, endDate: timelineEnd } =
                  getTimelineRange();

                return (
                  <div
                    key={employee.empId}
                    className="border border-gray-200 rounded-lg"
                  >
                    {/* Employee Header */}
                    <div className="flex items-center p-3 bg-gray-50 rounded-t-lg">
                      <button
                        onClick={() => toggleEmployeeExpansion(employee.empId)}
                        className="flex items-center gap-2 flex-1 text-left hover:bg-gray-100 p-2 rounded"
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-gray-500" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-gray-500" />
                        )}
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="font-medium text-gray-900">
                                {employee.name}
                              </span>
                              <span className="text-sm text-gray-500 ml-2">
                                ID: {employee.empId}
                              </span>
                            </div>
                            <div className="flex items-center gap-4">
                              <div className="text-sm text-gray-600">
                                <span className="font-medium">
                                  {employee.projectCount}
                                </span>{" "}
                                projects
                              </div>
                              {showUtilization && (
                                <div className="text-sm text-gray-600">
                                  <span className="font-medium">
                                    {employee.trueUtilizationRate.toFixed(1)}%
                                  </span>{" "}
                                  utilized
                                </div>
                              )}
                              <div className="text-sm text-green-600">
                                <span className="font-medium">
                                  {employee.availableCapacityHours.toFixed(1)}h
                                </span>{" "}
                                available
                              </div>
                            </div>
                          </div>
                        </div>
                      </button>
                    </div>

                    {/* Collapsed View */}
                    {!isExpanded && (
                      <div className="p-3">
                        <div className="flex">
                          <div className="w-64 flex-shrink-0"></div>
                          <div className="flex-1 relative h-8 bg-gray-100 rounded">
                            {employee.assignments.map((assignment, idx) => {
                              const startPos = getPositionFromDate(
                                assignment.startDate,
                                timelineStart,
                                timelineEnd
                              );
                              const endPos = getPositionFromDate(
                                assignment.endDate,
                                timelineStart,
                                timelineEnd
                              );
                              const width = Math.max(1, endPos - startPos);

                              return (
                                <div
                                  key={idx}
                                  className={`absolute h-6 top-1 rounded text-xs text-white flex items-center justify-center ${getAssignmentColorByCategory(
                                    assignment.category,
                                    assignment.utilization
                                  )}`}
                                  style={{
                                    left: `${startPos}%`,
                                    width: `${width}%`,
                                    opacity:
                                      assignment.status === "P" ? 0.7 : 0.9,
                                  }}
                                  title={`${
                                    assignment.jobName
                                  } (${assignment.hoursPerDay.toFixed(
                                    1
                                  )}h/day) - ${getCategoryLabel(
                                    assignment.category
                                  )}`}
                                >
                                  {width > 5 && (
                                    <span className="truncate px-1">
                                      {assignment.jobName.substring(
                                        0,
                                        Math.floor(width / 2)
                                      )}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Expanded View */}
                    {isExpanded && renderExpandedEmployeeView(employee)}
                  </div>
                );
              })}
          </div>

          {/* Legend */}
          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <h4 className="text-sm font-medium text-gray-900 mb-3">
              Legend by Category
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-blue-500 rounded"></div>
                <span>Chargeable</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-red-500 rounded"></div>
                <span>Absence/Holidays</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-green-500 rounded"></div>
                <span>Training</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-purple-500 rounded"></div>
                <span>LOA</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-yellow-500 rounded"></div>
                <span>Pending jobcode</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-gray-500 rounded"></div>
                <span>Reservation w/o jobcode</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-orange-500 rounded"></div>
                <span>Other</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-gray-400 rounded opacity-70"></div>
                <span>Provisional</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmployeeAvailabilityDashboard;
