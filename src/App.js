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
  PieChart,
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

      const startDate = parseDate(record.startDateParsed || record.startDate);
      const endDate = parseDate(record.endDateParsed || record.endDate);

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

        // CRITICAL: Categorize hours correctly
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

    // CRITICAL: Calculate true utilization rates correctly
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

      // Net available hours = 8 hours per day minus absence hours
      emp.netAvailableHours = Math.max(0, 8 - avgDailyAbsenceHours);
      
      // Available capacity = net available minus chargeable
      emp.availableCapacityHours = Math.max(
        0,
        emp.netAvailableHours - avgDailyChargeableHours
      );
      
      // True utilization = chargeable hours / net available hours
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
      const dateStr = workingDate.toISOString().split("T")[0];
      const dayOfWeek = workingDate.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const isPublicHolidayDay = isPublicHoliday(dateStr);
      const isWorkingDay = !isWeekend && !isPublicHolidayDay;

      let dayChargeableHours = 0,
        dayAbsenceHours = 0,
        dayOtherHours = 0;

      // Process assignments for this day regardless of whether it's a working day
      employee.assignments.forEach((assignment) => {
        const startDate = new Date(assignment.startDate);
        const endDate = new Date(assignment.endDate);
        const currentDay = new Date(dateStr);

        // CRITICAL: Include end date properly (<=)
        if (currentDay >= startDate && currentDay <= endDate) {
          const hoursForThisDay = assignment.hoursPerDay || 0;
          if (assignment.category === "chargeable") {
            dayChargeableHours += hoursForThisDay;
          } else if (
            assignment.category === "absence" ||
            assignment.category === "loa"
          ) {
            dayAbsenceHours += hoursForThisDay;
          } else {
            dayOtherHours += hoursForThisDay;
          }
        }
      });

      // Calculate daily metrics
      let dayNetAvailableHours, dayUtilizationRate, dayAvailableCapacity;
      
      if (!isWorkingDay) {
        // Weekend or public holiday - no availability expected
        dayNetAvailableHours = 0;
        dayUtilizationRate = 0;
        dayAvailableCapacity = 0;
      } else {
        // Working day
        totalWorkingDays++;
        dayNetAvailableHours = Math.max(0, 8 - dayAbsenceHours);
        dayUtilizationRate =
          dayNetAvailableHours > 0
            ? (dayChargeableHours / dayNetAvailableHours) * 100
            : 0;
        dayAvailableCapacity = Math.max(
          0,
          dayNetAvailableHours - dayChargeableHours
        );

        chargeableHours += dayChargeableHours;
        absenceHours += dayAbsenceHours;
      }

      dailyUtilization.push({
        date: dateStr,
        chargeableHours: dayChargeableHours,
        absenceHours: dayAbsenceHours,
        otherHours: dayOtherHours,
        netAvailableHours: dayNetAvailableHours,
        utilizationRate: dayUtilizationRate,
        availableCapacityHours: dayAvailableCapacity,
        isWorkingDay,
        isWeekend,
        isPublicHoliday: isPublicHolidayDay,
        position: getPositionFromDate(
          workingDate,
          timelineStart,
          timelineEnd
        ),
      });

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
              <div className="flex-1 relative h-6 bg-gray-100 rounded" style={{ marginRight: '24px' }}>                {/* Vertical grid lines for job timeline alignment */}
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
        
{/* Daily Hours Detail Table */}
<div className="bg-white border rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-sm font-medium text-gray-900">
                Daily Hours Detail
              </div>
              <div className="text-xs text-gray-600">
                Day-by-day breakdown of hours
              </div>
            </div>
            <div className="text-xs text-gray-500">
              Working days only (excluding weekends and holidays)
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-3 font-medium text-gray-700">Date</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-700">Day</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-700">Available</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-700">Absence</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-700">Chargeable</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-700">Net Available</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-700">Remaining</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-700">Utilization</th>
                </tr>
              </thead>
              <tbody>
                {timelineData.dailyUtilization && timelineData.dailyUtilization.map((day, index) => {
                  const date = new Date(day.date);
                  const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                  const isHoliday = isPublicHoliday(day.date);
                  
                  // Skip weekends and holidays
                  if (isWeekend || isHoliday) return null;
                  
                  const baseAvailable = 8; // 8 hours per working day
                  const remaining = day.availableCapacityHours;
                  
                  return (
                    <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-2 px-3 text-gray-900 font-medium">
                        {date.toLocaleDateString('fr-FR', { 
                          day: '2-digit', 
                          month: '2-digit' 
                        })}
                      </td>
                      <td className="py-2 px-3 text-gray-600">
                        {date.toLocaleDateString('fr-FR', { 
                          weekday: 'short' 
                        })}
                      </td>
                      <td className="py-2 px-3 text-right text-gray-700">
                        {baseAvailable.toFixed(1)}h
                      </td>
                      <td className="py-2 px-3 text-right text-red-600">
                        {day.absenceHours.toFixed(1)}h
                      </td>
                      <td className="py-2 px-3 text-right text-blue-600">
                        {day.chargeableHours.toFixed(1)}h
                      </td>
                      <td className="py-2 px-3 text-right text-gray-700 font-medium">
                        {day.netAvailableHours.toFixed(1)}h
                      </td>
                      <td className={`py-2 px-3 text-right font-medium ${
                        remaining > 0 ? 'text-green-600' : 
                        remaining === 0 ? 'text-gray-600' : 'text-red-600'
                      }`}>
                        {remaining.toFixed(1)}h
                      </td>
                      <td className={`py-2 px-3 text-right font-medium ${
                        day.utilizationRate > 100 ? 'text-red-600' :
                        day.utilizationRate > 75 ? 'text-orange-600' :
                        day.utilizationRate > 50 ? 'text-yellow-600' :
                        day.utilizationRate > 0 ? 'text-blue-600' : 'text-green-600'
                      }`}>
                        {day.utilizationRate.toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          
          {/* Summary row */}
          <div className="mt-3 pt-3 border-t border-gray-200">
            <div className="flex justify-between items-center text-sm">
              <div className="text-gray-700">
                <span className="font-medium">Period Summary:</span> 
                <span className="ml-2">
                  {timelineData.dailyUtilization ? 
                    timelineData.dailyUtilization.filter(day => {
                      const date = new Date(day.date);
                      const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                      const isHoliday = isPublicHoliday(day.date);
                      return !isWeekend && !isHoliday;
                    }).length : 0
                  } working days
                </span>
              </div>
              <div className="flex items-center gap-6">
                <div className="text-blue-600">
                  <span className="font-medium">
                    {timelineData.chargeableHours.toFixed(1)}h
                  </span>
                  <span className="text-gray-600 ml-1">chargeable</span>
                </div>
                <div className="text-red-600">
                  <span className="font-medium">
                    {timelineData.absenceHours.toFixed(1)}h
                  </span>
                  <span className="text-gray-600 ml-1">absence</span>
                </div>
                <div className="text-green-600">
                  <span className="font-medium">
                    {timelineData.availableCapacityHours.toFixed(1)}h
                  </span>
                  <span className="text-gray-600 ml-1">available</span>
                </div>
                <div className={`font-medium ${
                  timelineData.utilizationRate > 100 ? 'text-red-600' :
                  timelineData.utilizationRate > 75 ? 'text-orange-600' :
                  'text-blue-600'
                }`}>
                  {timelineData.utilizationRate.toFixed(1)}% avg utilization
                </div>
              </div>
            </div>
          </div>
        </div>


 {/* Daily Utilization Variation Chart */}
 <div className="bg-gray-50 p-6 rounded-lg relative mb-6">
          <div className="flex items-start mb-6">
          <div className="w-56 flex-shrink-0 pr-4">
              <div className="text-lg font-medium text-gray-900 mb-2">
                Utilization
              </div>

            </div>
            
            {/* Timeline above the chart */}
            <div className="flex-1 relative">
              {/* Month references */}
              <div className="relative h-8 mb-3">
                {(() => {
                  const { startDate, endDate } = getTimelineRange();
                  const monthLabels = [];
                  
                  // Generate month labels
                  const currentMonth = new Date(startDate);
                  currentMonth.setDate(1); // Start of month
                  
                  while (currentMonth <= endDate) {
                    const monthStart = new Date(currentMonth);
                    const monthEnd = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
                    const displayEnd = monthEnd > endDate ? endDate : monthEnd;
                    
                    const startPos = getPositionFromDate(monthStart, startDate, endDate);
                    const endPos = getPositionFromDate(displayEnd, startDate, endDate);
                    const width = endPos - startPos;
                    
                    if (width > 8) { // Only show if month section is wide enough
                      monthLabels.push(
                        <div
                          key={`month-${currentMonth.getTime()}`}
                          className="absolute bg-blue-50 text-blue-700 text-base font-medium border-l border-blue-300"
                          style={{
                            left: `${startPos}%`,
                            width: `${width}%`,
                            top: '0px',
                            height: '32px',
                            fontSize: '14px',
                            paddingLeft: '8px',
                            paddingTop: '4px'
                          }}
                        >
                          {currentMonth.toLocaleDateString('fr-FR', { 
                            month: 'short', 
                            year: ganttTimeframe === 'quarter' ? '2-digit' : undefined 
                          })}
                        </div>
                      );
                    }
                    
                    currentMonth.setMonth(currentMonth.getMonth() + 1);
                  }
                  
                  return monthLabels;
                })()}
              </div>
              
              {/* Utilization chart */}
              <div className="h-32 bg-white rounded border border-gray-200 relative">
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
                className="absolute -left-12 text-sm text-gray-500 font-medium"
                style={{ top: "-4px" }}
              >
                100%
              </div>
              <div
                className="absolute -left-10 text-sm text-gray-500 font-medium"
                style={{ top: "50%", transform: "translateY(-50%)" }}
              >
                50%
              </div>
              <div
                className="absolute -left-6 text-sm text-gray-500 font-medium"
                style={{ bottom: "-4px" }}
              >
                0%
              </div>

              {/* Weekend background */}
              {timelineData.dailyUtilization &&
                timelineData.dailyUtilization.map((day, index) => {
                  if (day.isWeekend) {
                    const centerX = getPositionFromDate(
                      day.date,
                      timelineStart,
                      timelineEnd
                    );
                    const totalDays =
                      (timelineEnd - timelineStart) / (1000 * 60 * 60 * 24);
                    const dayWidth = 100 / totalDays;

                    return (
                      <div
                        key={`weekend-${index}`}
                        className="absolute bg-gray-200 opacity-50"
                        style={{
                          left: `${centerX - dayWidth / 2}%`,
                          top: "0%",
                          width: `${dayWidth}%`,
                          height: "100%",
                          zIndex: 1,
                        }}
                        title={`Weekend: ${day.date}`}
                      />
                    );
                  }
                  return null;
                })}

              {/* Public holidays background */}
              {timelineData.dailyUtilization &&
                timelineData.dailyUtilization.map((day, index) => {
                  if (day.isPublicHoliday) {
                    const centerX = getPositionFromDate(
                      day.date,
                      timelineStart,
                      timelineEnd
                    );
                    const totalDays =
                      (timelineEnd - timelineStart) / (1000 * 60 * 60 * 24);
                    const dayWidth = 100 / totalDays;

                    return (
                      <div
                        key={`holiday-${index}`}
                        className="absolute bg-blue-200 opacity-60"
                        style={{
                          left: `${centerX - dayWidth / 2}%`,
                          top: "0%",
                          width: `${dayWidth}%`,
                          height: "100%",
                          zIndex: 2,
                        }}
                        title={`Public Holiday: ${day.date}`}
                      />
                    );
                  }
                  return null;
                })}

              {/* Days off (absence on working days) */}
              {timelineData.dailyUtilization &&
                timelineData.dailyUtilization.map((day, index) => {
                  const isUnavailable = !day.isWorkingDay || (day.isWorkingDay && day.absenceHours >= 8);
                  
                  if (isUnavailable && day.isWorkingDay && day.absenceHours > 0) {
                    const centerX = getPositionFromDate(
                      day.date,
                      timelineStart,
                      timelineEnd
                    );
                    const totalDays =
                      (timelineEnd - timelineStart) / (1000 * 60 * 60 * 24);
                    const dayWidth = 100 / totalDays;

                    return (
                      <div
                        key={`absence-${index}`}
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

             {/* SVG curve for utilization */}
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

                          {/* Utilization curve path */}
                          <path
                            d={(() => {
                              const availablePoints = timelineData.dailyUtilization
                                .map((day, index) => {
                                  const dayDate = new Date(day.date);
                                  const isWeekend = dayDate.getDay() === 0 || dayDate.getDay() === 6;
                                  const isHoliday = isPublicHoliday(day.date);
                                  
                                  const x = getPositionFromDate(
                                    day.date,
                                    timelineStart,
                                    timelineEnd
                                  );
                                  const y = 100 - Math.min(day.utilizationRate, 100);
                                  
                                  return { 
                                    x, 
                                    y, 
                                    date: day.date,
                                    isWeekend,
                                    isHoliday,
                                    isAvailable: !isWeekend && day.netAvailableHours > 0,
                                    utilizationRate: day.utilizationRate,
                                    netAvailableHours: day.netAvailableHours
                                  };
                                })
                                .filter(point => !point.isWeekend); // Remove weekends entirely

                              if (availablePoints.length < 1) return "";

                              const totalDays = (timelineEnd - timelineStart) / (1000 * 60 * 60 * 24);
                              const dayWidth = 100 / totalDays;

                              let path = "";
                              let lastWorkingPoint = null;
                              
                              // Start from bottom left
                              path = `M 0 100`;

                              for (let i = 0; i < availablePoints.length; i++) {
                                const currentPoint = availablePoints[i];
                                
                                // If this is an available working day
                                if (currentPoint.isAvailable) {
                                  if (lastWorkingPoint === null) {
                                    // First working day - go to it
                                    path += ` L ${currentPoint.x - dayWidth / 2} 100`;
                                    path += ` L ${currentPoint.x - dayWidth / 2} ${currentPoint.y}`;
                                  } else {
                                    // Coming from another working day
                                    if (currentPoint.y !== lastWorkingPoint.y) {
                                      // Different utilization - create step
                                      path += ` L ${currentPoint.x - dayWidth / 2} ${lastWorkingPoint.y}`;
                                      path += ` L ${currentPoint.x - dayWidth / 2} ${currentPoint.y}`;
                                    } else {
                                      // Same utilization - just extend
                                      path += ` L ${currentPoint.x - dayWidth / 2} ${currentPoint.y}`;
                                    }
                                  }
                                  
                                  // Extend to the end of this working day
                                  path += ` L ${currentPoint.x + dayWidth / 2} ${currentPoint.y}`;
                                  
                                  // Check if next available working day exists and is not consecutive
                                  let nextWorkingIndex = i + 1;
                                  while (nextWorkingIndex < availablePoints.length && !availablePoints[nextWorkingIndex].isAvailable) {
                                    nextWorkingIndex++;
                                  }
                                  
                                  if (nextWorkingIndex < availablePoints.length) {
                                    const nextWorkingPoint = availablePoints[nextWorkingIndex];
                                    const currentDate = new Date(currentPoint.date);
                                    const nextDate = new Date(nextWorkingPoint.date);
                                    
                                    // Find the last day we should extend to (could be weekend or holiday)
                                    let extendToDate = new Date(currentDate);
                                    extendToDate.setDate(extendToDate.getDate() + 1);
                                    
                                    // Keep extending until we hit the next working day or run out of days
                                    let lastExtendDate = currentDate;
                                    while (extendToDate < nextDate) {
                                      lastExtendDate = new Date(extendToDate);
                                      extendToDate.setDate(extendToDate.getDate() + 1);
                                    }
                                    
                                    // If we can extend beyond the current working day
                                    if (lastExtendDate > currentDate) {
                                      const extendToX = getPositionFromDate(
                                        lastExtendDate.toISOString().split('T')[0],
                                        timelineStart,
                                        timelineEnd
                                      );
                                      path += ` L ${extendToX + dayWidth / 2} ${currentPoint.y}`;
                                    }
                                  } else {
                                    // This is the last working day - extend to the end
                                    path += ` L 100 ${currentPoint.y}`;
                                  }
                                  
                                  lastWorkingPoint = currentPoint;
                                }
                              }

                              // Close the path
                              path += ` L 100 100 Z`;
                              
                              return path;
                            })()}
                            fill="none"
                            stroke="#3b82f6"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            vectorEffect="non-scaling-stroke"
                          />

                          {/* Area under curve */}
                          <path
                            d={(() => {
                              const availablePoints = timelineData.dailyUtilization
                                .map((day, index) => {
                                  const dayDate = new Date(day.date);
                                  const isWeekend = dayDate.getDay() === 0 || dayDate.getDay() === 6;
                                  const isHoliday = isPublicHoliday(day.date);
                                  
                                  const x = getPositionFromDate(
                                    day.date,
                                    timelineStart,
                                    timelineEnd
                                  );
                                  const y = 100 - Math.min(day.utilizationRate, 100);
                                  
                                  return { 
                                    x, 
                                    y, 
                                    date: day.date,
                                    isWeekend,
                                    isHoliday,
                                    isAvailable: !isWeekend && day.netAvailableHours > 0,
                                    utilizationRate: day.utilizationRate,
                                    netAvailableHours: day.netAvailableHours
                                  };
                                })
                                .filter(point => !point.isWeekend); // Remove weekends entirely

                              if (availablePoints.length < 1) return "";

                              const totalDays = (timelineEnd - timelineStart) / (1000 * 60 * 60 * 24);
                              const dayWidth = 100 / totalDays;

                              let path = "";
                              let lastWorkingPoint = null;
                              
                              // Start from bottom left
                              path = `M 0 100`;

                              for (let i = 0; i < availablePoints.length; i++) {
                                const currentPoint = availablePoints[i];
                                
                                // If this is an available working day
                                if (currentPoint.isAvailable) {
                                  if (lastWorkingPoint === null) {
                                    // First working day - go to it
                                    path += ` L ${currentPoint.x - dayWidth / 2} 100`;
                                    path += ` L ${currentPoint.x - dayWidth / 2} ${currentPoint.y}`;
                                  } else {
                                    // Coming from another working day
                                    if (currentPoint.y !== lastWorkingPoint.y) {
                                      // Different utilization - create step
                                      path += ` L ${currentPoint.x - dayWidth / 2} ${lastWorkingPoint.y}`;
                                      path += ` L ${currentPoint.x - dayWidth / 2} ${currentPoint.y}`;
                                    } else {
                                      // Same utilization - just extend
                                      path += ` L ${currentPoint.x - dayWidth / 2} ${currentPoint.y}`;
                                    }
                                  }
                                  
                                  // Extend to the end of this working day
                                  path += ` L ${currentPoint.x + dayWidth / 2} ${currentPoint.y}`;
                                  
                                  // Check if next available working day exists and is not consecutive
                                  let nextWorkingIndex = i + 1;
                                  while (nextWorkingIndex < availablePoints.length && !availablePoints[nextWorkingIndex].isAvailable) {
                                    nextWorkingIndex++;
                                  }
                                  
                                  if (nextWorkingIndex < availablePoints.length) {
                                    const nextWorkingPoint = availablePoints[nextWorkingIndex];
                                    const currentDate = new Date(currentPoint.date);
                                    const nextDate = new Date(nextWorkingPoint.date);
                                    
                                    // Find the last day we should extend to (could be weekend or holiday)
                                    let extendToDate = new Date(currentDate);
                                    extendToDate.setDate(extendToDate.getDate() + 1);
                                    
                                    // Keep extending until we hit the next working day or run out of days
                                    let lastExtendDate = currentDate;
                                    while (extendToDate < nextDate) {
                                      lastExtendDate = new Date(extendToDate);
                                      extendToDate.setDate(extendToDate.getDate() + 1);
                                    }
                                    
                                    // If we can extend beyond the current working day
                                    if (lastExtendDate > currentDate) {
                                      const extendToX = getPositionFromDate(
                                        lastExtendDate.toISOString().split('T')[0],
                                        timelineStart,
                                        timelineEnd
                                      );
                                      path += ` L ${extendToX + dayWidth / 2} ${currentPoint.y}`;
                                    }
                                  } else {
                                    // This is the last working day - extend to the end
                                    path += ` L 100 ${currentPoint.y}`;
                                  }
                                  
                                  lastWorkingPoint = currentPoint;
                                }
                              }

                              // Close the path
                              path += ` L 100 100 Z`;
                              
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
                      const dayDate = new Date(day.date);
                      const isWeekend = dayDate.getDay() === 0 || dayDate.getDay() === 6;
                      const isHoliday = isPublicHoliday(day.date);
                      
                      // Skip weekends entirely
                      if (isWeekend) return null;
                      
                      const dayPosition = getPositionFromDate(
                        day.date,
                        timelineStart,
                        timelineEnd
                      );
                      const y =
                        day.netAvailableHours === 0
                          ? 50
                          : 100 - Math.min(day.utilizationRate, 100);

                      let pointColor = "#6b7280";
                      let isEmptyCircle = false;
                      
                      // Check if it's a holiday or absence day
                      if (isHoliday) {
                        isEmptyCircle = true;
                        pointColor = "#3b82f6"; // Orange pour les jours fériés
                      } else if (day.netAvailableHours === 0) {
                        isEmptyCircle = true;
                        pointColor = "#f97316"; // Bleu pour les absences
                      } else if (day.netAvailableHours > 0) {
                        if (day.utilizationRate >= 100)
                          pointColor = "#ef4444";
                        else if (day.utilizationRate >= 75)
                          pointColor = "#f97316";
                        else if (day.utilizationRate >= 50)
                          pointColor = "#eab308";
                        else if (day.utilizationRate > 0)
                          pointColor = "#3b82f6";
                        else pointColor = "#10b981";
                      }

                      const tooltipText = isHoliday 
                        ? `${day.date}: Public Holiday`
                        : day.netAvailableHours === 0
                        ? `${day.date}: Unavailable (${day.absenceHours}h absence)`
                        : `${day.date}: ${day.utilizationRate.toFixed(
                            1
                          )}% utilized (${day.chargeableHours.toFixed(
                            1
                          )}h/${day.netAvailableHours.toFixed(1)}h)`;

                      return (
                        <div
                          key={index}
                          className={`absolute w-2 h-2 rounded-full border-2 cursor-pointer hover:scale-125 transition-transform ${
                            isEmptyCircle ? "bg-white" : ""
                          }`}
                          style={{
                            left: `${dayPosition}%`,
                            top: `${y}%`,
                            backgroundColor: isEmptyCircle ? "white" : pointColor,
                            borderColor: pointColor,
                            transform: "translate(-50%, -50%)",
                          }}
                          title={tooltipText}
                        />
                      );
                    })}
                  </div>
                )}

<div className="absolute top-0 right-0 text-sm text-gray-400 p-2">
                {timelineData.dailyUtilization
                  ? timelineData.dailyUtilization.length
                  : 0}{" "}
                days
              </div>
            </div>
          </div>
          </div>

         {/* Legend for curve */}
         <div className="flex items-center gap-6 text-sm text-gray-600 ml-72">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-gray-400 rounded-full"></div>
              <span>Unavailable</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-green-500 rounded-full"></div>
              <span>0%</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-blue-500 rounded-full"></div>
              <span>1-49%</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-yellow-500 rounded-full"></div>
              <span>50-74%</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-orange-500 rounded-full"></div>
              <span>75-99%</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-red-500 rounded-full"></div>
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

  const getOverallStats = () => {
    const ganttData = getEnhancedGanttData();
    let totalChargeableHours = 0, totalNetAvailableHours = 0;
    const categoryBreakdown = {};
    const statusCounts = { available: 0, partiallyBooked: 0, fullyBooked: 0, unavailable: 0 };
    
    ganttData.forEach(emp => {
      totalChargeableHours += emp.chargeableHours || 0;
      totalNetAvailableHours += emp.netAvailableHours || 0;
      
      if (emp.trueUtilizationRate === 0) statusCounts.available++;
      else if (emp.trueUtilizationRate < 100) statusCounts.partiallyBooked++;
      else statusCounts.fullyBooked++;
      
      emp.assignments.forEach(assignment => {
        const category = assignment.category;
        if (!categoryBreakdown[category]) {
          categoryBreakdown[category] = { count: 0, totalHours: 0 };
        }
        categoryBreakdown[category].count++;
        categoryBreakdown[category].totalHours += assignment.hoursPerDay || 0;
      });
    });
    
    const overallUtilizationRate = totalNetAvailableHours > 0 ? (totalChargeableHours / totalNetAvailableHours) * 100 : 0;
    
    return {
      total: ganttData.length, ...statusCounts, overallUtilizationRate,
      totalChargeableHours, totalNetAvailableHours, categoryBreakdown
    };
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

  // Main Dashboard with Statistics
  const stats = getOverallStats();

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
                      ? label.date.toLocaleDateString("fr-FR", {
                          day: "numeric",
                          weekday: "short",
                        })
                      : ganttTimeframe === "month"
                      ? label.date.toLocaleDateString("fr-FR", {
                          day: "numeric",
                        })
                      : label.date.toLocaleDateString("fr-FR", {
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

        {/* Statistics Panel */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-4 rounded-lg shadow-sm">
            <div className="flex items-center">
              <Users className="h-8 w-8 text-blue-500 mr-3" />
              <div>
                <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
                <div className="text-sm text-gray-600">Total Employees</div>
              </div>
            </div>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow-sm">
            <div className="flex items-center">
              <Calendar className="h-8 w-8 text-green-500 mr-3" />
              <div>
                <div className="text-2xl font-bold text-gray-900">{stats.available}</div>
                <div className="text-sm text-gray-600">Available</div>
              </div>
            </div>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow-sm">
            <div className="flex items-center">
              <BarChart3 className="h-8 w-8 text-yellow-500 mr-3" />
              <div>
                <div className="text-2xl font-bold text-gray-900">{stats.partiallyBooked}</div>
                <div className="text-sm text-gray-600">Partially Booked</div>
              </div>
            </div>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow-sm">
            <div className="flex items-center">
              <PieChart className="h-8 w-8 text-red-500 mr-3" />
              <div>
                <div className="text-2xl font-bold text-gray-900">{stats.fullyBooked}</div>
                <div className="text-sm text-gray-600">Fully Booked</div>
              </div>
            </div>
          </div>
        </div>

        {/* Overall Utilization Summary */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Overall Team Utilization</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-600 mb-2">
                {stats.overallUtilizationRate.toFixed(1)}%
              </div>
              <div className="text-sm text-gray-600">Average Utilization Rate</div>
            </div>
            
            <div className="text-center">
              <div className="text-3xl font-bold text-green-600 mb-2">
                {stats.totalChargeableHours.toFixed(0)}h
              </div>
              <div className="text-sm text-gray-600">Total Chargeable Hours</div>
            </div>
            
            <div className="text-center">
              <div className="text-3xl font-bold text-orange-600 mb-2">
                {(stats.totalNetAvailableHours - stats.totalChargeableHours).toFixed(0)}h
              </div>
              <div className="text-sm text-gray-600">Available Capacity</div>
            </div>
          </div>
          
          {/* Utilization Progress Bar */}
          <div className="mt-6">
            <div className="flex justify-between text-sm text-gray-600 mb-2">
              <span>Team Capacity Utilization</span>
              <span>{stats.overallUtilizationRate.toFixed(1)}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-4">
              <div
                className="bg-gradient-to-r from-blue-500 to-blue-600 h-4 rounded-full transition-all duration-300"
                style={{ width: `${Math.min(stats.overallUtilizationRate, 100)}%` }}
              ></div>
            </div>
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>0%</span>
              <span>50%</span>
              <span>100%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmployeeAvailabilityDashboard;
