import React, { useState } from "react";
import { 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  Info,
  Calendar,
  TrendingUp,
  FileText,
  Activity,
  Clock
} from "lucide-react";
import { PipeRecord, User, ProjectConfig, ToleranceConfig } from "../types";
import { exportProjectAnalysisToPDF, exportAllProjectsSummaryToPDF } from "../utils/projectPdfGenerator";
import { generateFailedNcrReportPDF } from "../utils/complianceReportGenerator";

interface PortfolioAnalyticsProps {
  records: PipeRecord[];
  currentUser: User | null;
  projects: ProjectConfig[];
  tolerances: ToleranceConfig[];
}

function PortfolioAnalytics({
  records,
  currentUser,
  projects,
  tolerances
}: PortfolioAnalyticsProps) {
  const [portfolioViewTab, setPortfolioViewTab] = useState<"analytics" | "projects">("analytics");
  const [selectedProjectCode, setSelectedProjectCode] = useState<string>("ALL");
  const [reportPeriod, setReportPeriod] = useState<"daily" | "weekly" | "monthly">("daily");
  const [reportDate, setReportDate] = useState<string>(new Date().toISOString().slice(0, 10));

  const stats = React.useMemo(() => {
    // Extract all unique project codes from setup table + live entries
    const uniqueProjectCodes = Array.from(new Set([
      ...projects.map(p => p.projectCode).filter(Boolean),
      ...records.map(r => r.header?.projectWorkOrder).filter(Boolean)
    ])).sort() as string[];

    // Filter dynamic datasets based on active insight scope (ALL vs selected project code)
    const filteredRecords = selectedProjectCode === "ALL" 
      ? records 
      : records.filter(p => p.header?.projectWorkOrder?.toUpperCase() === selectedProjectCode.toUpperCase());

    // Calculate stats across recorded GRP pipes for current scope
    const totalPipesProduced = filteredRecords.length;
    
    // Volume produced (convert mm to meters from header.length)
    const totalMetersProduced = filteredRecords.reduce((sum, r) => sum + (Number(r.header?.length) || 0), 0) / 1000;
    const totalMetersProducedRound = Math.round(totalMetersProduced * 100) / 100;

    // Identify compliant (liberated) pipes
    const liberatedPipes = filteredRecords.filter((p) => {
      let hasFail = false;
      let hasS8Completed = p.steps[8] && p.steps[8].isCompleted;
      for (let s = 1; s <= 8; s++) {
        const step = p.steps[s];
        if (step) {
          if (step.isNonConform) {
            hasFail = true;
          }
          if (step.qualityChecks?.some((q) => q.status === "Fail")) {
            hasFail = true;
          }
        }
      }
      return !hasFail && hasS8Completed;
    });

    const totalMetersLiberated = liberatedPipes.reduce((sum, r) => sum + (Number(r.header?.length) || 0), 0) / 1000;
    const totalMetersLiberatedRound = Math.round(totalMetersLiberated * 100) / 100;

    // Liberation rate
    const liberatedProductRate = totalPipesProduced > 0 ? Math.round((liberatedPipes.length / totalPipesProduced) * 100) : 100;

    // Group by date
    const rawDailyGroup: Record<string, { produced: number; liberated: number; total: number; failed: number }> = {};
    filteredRecords.forEach((p) => {
      const rawDate = p.header?.productionDate || p.createdAt || new Date().toISOString();
      const dateKey = rawDate.split("T")[0]; // YYYY-MM-DD
      if (!rawDailyGroup[dateKey]) {
        rawDailyGroup[dateKey] = { produced: 0, liberated: 0, total: 0, failed: 0 };
      }
      const lenM = (Number(p.header?.length) || 0) / 1000;
      rawDailyGroup[dateKey].produced += lenM;
      rawDailyGroup[dateKey].total++;

      let hasFail = false;
      let s8Completed = p.steps[8] && p.steps[8].isCompleted;
      for (let s = 1; s <= 8; s++) {
        const step = p.steps[s];
        if (step) {
          if (step.isNonConform) {
            hasFail = true;
          }
          if (step.qualityChecks?.some((q) => q.status === "Fail")) {
            hasFail = true;
          }
        }
      }
      if (hasFail) {
        rawDailyGroup[dateKey].failed++;
      } else if (s8Completed) {
        rawDailyGroup[dateKey].liberated += lenM;
      }
    });

    const activeDaysList = Object.keys(rawDailyGroup).sort();
    const totalActiveDays = Math.max(1, activeDaysList.length);
    const avgMetersPerDay = Math.round((totalMetersProduced / totalActiveDays) * 10) / 10;
    const avgPipesPerDay = Math.round((totalPipesProduced / totalActiveDays) * 10) / 10;

    // Selected last 7 active days for trend visualization
    const lastActiveDaysKeys = activeDaysList.slice(-7);

    // Group by Month (YYYY-MM)
    const rawMonthlyGroup: Record<string, { produced: number; liberated: number; total: number; failed: number }> = {};
    filteredRecords.forEach((p) => {
      const rawDate = p.header?.productionDate || p.createdAt || new Date().toISOString();
      const monthKey = rawDate.substring(0, 7); // YYYY-MM
      if (!rawMonthlyGroup[monthKey]) {
        rawMonthlyGroup[monthKey] = { produced: 0, liberated: 0, total: 0, failed: 0 };
      }
      const lenM = (Number(p.header?.length) || 0) / 1000;
      rawMonthlyGroup[monthKey].produced += lenM;
      rawMonthlyGroup[monthKey].total++;

      let hasFail = false;
      let s8Completed = p.steps[8] && p.steps[8].isCompleted;
      for (let s = 1; s <= 8; s++) {
        const step = p.steps[s];
        if (step) {
          if (step.isNonConform) {
            hasFail = true;
          }
          if (step.qualityChecks?.some((q) => q.status === "Fail")) {
            hasFail = true;
          }
        }
      }
      if (hasFail) {
        rawMonthlyGroup[monthKey].failed++;
      } else if (s8Completed) {
        rawMonthlyGroup[monthKey].liberated += lenM;
      }
    });

    // Step quality calculations (Failure bottle-necks)
    const gatesTested: Record<number, number> = {};
    const gatesFailed: Record<number, number> = {};
    for (let s = 1; s <= 8; s++) {
      gatesTested[s] = 0;
      gatesFailed[s] = 0;
    }
    filteredRecords.forEach((p) => {
      for (let s = 1; s <= 8; s++) {
        const step = p.steps[s];
        if (step && step.isCompleted) {
          gatesTested[s]++;
          if (step.qualityChecks?.some((q) => q.status === "Fail")) {
            gatesFailed[s]++;
          }
        }
      }
    });

    const stepPassRates = Object.keys(gatesTested).reduce((acc, stepNoStr) => {
      const stepNo = parseInt(stepNoStr, 10);
      const tested = gatesTested[stepNo] || 0;
      const failed = gatesFailed[stepNo] || 0;
      const rate = tested > 0 ? Math.round(((tested - failed) / tested) * 100) : 100;
      acc[stepNo] = rate;
      return acc;
    }, {} as Record<number, number>);

    // Find worst bottleneck step
    let bottleneckStep = 1;
    let lowestRate = 100;
    for (let s = 1; s <= 8; s++) {
      const rate = stepPassRates[s] ?? 100;
      if (gatesTested[s] && gatesTested[s] > 0 && rate < lowestRate) {
        lowestRate = rate;
        bottleneckStep = s;
      }
    }

    // Combined estimations & forecasts
    let totalPortfolioTarget = 1000;
    if (selectedProjectCode === "ALL") {
      totalPortfolioTarget = projects.reduce((sum, p) => sum + (p.targetQuantityMeters || 1000), 0);
    } else {
      const matchedProject = projects.find(p => p.projectCode?.toUpperCase() === selectedProjectCode.toUpperCase());
      totalPortfolioTarget = matchedProject?.targetQuantityMeters || 1000;
    }
    if (totalPortfolioTarget === 0) totalPortfolioTarget = 1000;

    const remainingTargetMeters = Math.max(0, totalPortfolioTarget - totalMetersProduced);
    const remainingTargetProducedPercent = Math.min(100, Math.round((totalMetersProduced / totalPortfolioTarget) * 100));

    // Velocity and Duration predictions
    const speedDailyMeters = avgMetersPerDay;
    const estimatedShiftsToFinish = speedDailyMeters > 0 ? Math.ceil(remainingTargetMeters / speedDailyMeters) : 0;
    const estimatedWeeksToFinish = speedDailyMeters > 0 ? Math.round((remainingTargetMeters / speedDailyMeters / 7) * 10) / 10 : 0;

    // Reject forecast
    const overallRejectCount = filteredRecords.filter(p => {
      for (let s = 1; s <= 8; s++) {
        if (p.steps[s]?.qualityChecks?.some(q => q.status === "Fail")) return true;
      }
      return false;
    }).length;
    const overallRejectRate = totalPipesProduced > 0 ? overallRejectCount / totalPipesProduced : 0;
    const forecastedFutureRejectPipes = Math.round(overallRejectRate * (remainingTargetMeters / (avgMetersPerDay || 10) * avgPipesPerDay));

    return {
      uniqueProjectCodes,
      filteredRecords,
      totalPipesProduced,
      totalMetersProducedRound,
      liberatedPipes,
      totalMetersLiberatedRound,
      liberatedProductRate,
      rawDailyGroup,
      activeDaysList,
      totalActiveDays,
      avgMetersPerDay,
      avgPipesPerDay,
      lastActiveDaysKeys,
      rawMonthlyGroup,
      gatesTested,
      gatesFailed,
      stepPassRates,
      bottleneckStep,
      lowestRate,
      totalPortfolioTarget,
      remainingTargetMeters,
      remainingTargetProducedPercent,
      estimatedShiftsToFinish,
      estimatedWeeksToFinish,
      overallRejectCount,
      overallRejectRate,
      forecastedFutureRejectPipes
    };
  }, [records, projects, selectedProjectCode]);

  const {
    uniqueProjectCodes,
    filteredRecords,
    totalPipesProduced,
    totalMetersProducedRound,
    liberatedPipes,
    totalMetersLiberatedRound,
    liberatedProductRate,
    rawDailyGroup,
    activeDaysList,
    totalActiveDays,
    avgMetersPerDay,
    avgPipesPerDay,
    lastActiveDaysKeys,
    rawMonthlyGroup,
    gatesTested,
    gatesFailed,
    stepPassRates,
    bottleneckStep,
    lowestRate,
    totalPortfolioTarget,
    remainingTargetMeters,
    remainingTargetProducedPercent,
    estimatedShiftsToFinish,
    estimatedWeeksToFinish,
    overallRejectCount,
    overallRejectRate,
    forecastedFutureRejectPipes
  } = stats;

  return (
    <div className="space-y-6 pb-24">
      
      {/* Dynamic Jumbotron Header with Advanced Analytics & Forecasting Title */}
      <div className="bg-gradient-to-r from-indigo-900 to-slate-900 p-6 rounded-3xl border border-indigo-950/20 text-white relative overflow-hidden shadow-lg">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-500/10 via-transparent to-transparent pointer-events-none"></div>
        
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 font-extrabold uppercase tracking-widest text-[9.5px] px-2.5 py-0.5 rounded-full">
                Advanced Modeling
              </span>
              <span className="bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 font-extrabold uppercase tracking-widest text-[9.5px] px-2.5 py-0.5 rounded-full">
                Full-Stack Synced
              </span>
            </div>
            
            <h1 className="text-2xl font-black tracking-tight flex items-center gap-2 text-white font-sans sm:text-3xl">
              <Activity className="w-7 h-7 text-indigo-400 animate-pulse" />
              Advanced Portfolio Analytics & Forecasting Hub
            </h1>
            <p className="text-sm text-indigo-200/80 mt-1 max-w-2xl">
              Automatic target matching, daily efficiency curves, quality gates drop-off analysis, and predictive timelines.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* View Tabs Selector */}
            <div className="bg-slate-950/50 p-1.5 rounded-2xl border border-white/10 flex items-center gap-1 active:scale-98 transition">
              <button
                onClick={() => setPortfolioViewTab("analytics")}
                className={`text-[11px] font-black uppercase tracking-wider px-4 py-2 rounded-xl cursor-pointer transition-all ${
                  portfolioViewTab === "analytics"
                    ? "bg-white text-indigo-950 shadow-md font-extrabold border border-white"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Analytics Insights
              </button>
              <button
                onClick={() => setPortfolioViewTab("projects")}
                className={`text-[11px] font-black uppercase tracking-wider px-4 py-2 rounded-xl cursor-pointer transition-all ${
                  portfolioViewTab === "projects"
                    ? "bg-white text-indigo-950 shadow-md font-extrabold border border-white"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Project Targets
              </button>
            </div>

            {/* Master Export Trigger */}
            <button
              onClick={() => {
                try {
                  exportAllProjectsSummaryToPDF(projects, records, tolerances, selectedProjectCode);
                } catch (e: any) {
                  alert("Failed to compile master portfolio PDF: " + e.message);
                }
              }}
              className="bg-indigo-600 hover:bg-indigo-500 cursor-pointer text-white text-xs font-black uppercase tracking-wider px-4 py-3 rounded-2xl flex items-center gap-2 shadow-md hover:shadow-lg transition active:scale-95"
              title="Download Master Projects Comparative Performance PDF Report"
            >
              <FileText className="w-4 h-4" />
              <span>Full PDF</span>
            </button>
          </div>
        </div>
      </div>

      {portfolioViewTab === "analytics" ? (
        <div className="space-y-6 animate-fade-in">
          
          {/* Project Focus Selector Bar */}
          <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="space-y-0.5">
              <span className="text-[10px] text-indigo-700 font-extrabold uppercase tracking-widest block font-mono">INSIGHT SCOPE FILTER</span>
              <h3 className="text-sm font-black text-gray-850 tracking-tight">
                {selectedProjectCode === "ALL" ? "Combined Active Portfolio Performance Metrics" : `Project Focus: ${selectedProjectCode}`}
              </h3>
            </div>
            
            <div className="flex items-center gap-2">
              <label htmlFor="project-filter-select" className="text-xs font-bold text-gray-405">Target Project:</label>
              <select
                id="project-filter-select"
                value={selectedProjectCode}
                onChange={(e) => setSelectedProjectCode(e.target.value)}
                className="bg-gray-50 border border-gray-200 text-xs font-extrabold text-gray-800 rounded-xl px-3 py-2 outline-none focus:border-indigo-500 transition shadow-3xs cursor-pointer focus:ring-1 focus:ring-indigo-100"
              >
                <option value="ALL">All Projects (Global Insights)</option>
                {uniqueProjectCodes.map(code => (
                  <option key={code} value={code}>
                    Project {code} Only
                  </option>
                ))}
              </select>
            </div>
          </div>
          
          {/* Dynamic Failed & NCR Exception PDF Report Section */}
          <div className="bg-gradient-to-r from-rose-50/50 to-amber-50/50 border border-rose-100 rounded-3xl p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-3 border-b border-rose-100/60">
              <div>
                <h3 className="font-extrabold text-rose-950 text-sm flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-rose-600" />
                  Automated Compliance & Exception Report Generator
                </h3>
                <p className="text-xs text-rose-700/80 mt-0.5">
                  Generate daily, weekly, or monthly PDF reports of all failed quality checks and non-conforming GRP pipes, including operator remarks and photo documentation.
                </p>
              </div>
              <span className="text-[9px] bg-rose-100 text-rose-800 border border-rose-200 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                QA Audit
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
              <div>
                <label className="block text-[10px] font-bold text-rose-900 uppercase mb-1.5">
                  Select Audit Interval
                </label>
                <div className="bg-white p-1 rounded-xl border border-rose-200/50 flex items-center gap-1">
                  {(["daily", "weekly", "monthly"] as const).map((period) => (
                    <button
                      key={period}
                      type="button"
                      onClick={() => setReportPeriod(period)}
                      className={`flex-1 text-[10.5px] font-black uppercase tracking-wider py-1.5 rounded-lg cursor-pointer transition ${
                        reportPeriod === period
                          ? "bg-rose-600 text-white shadow-xs"
                          : "text-rose-700 hover:text-rose-900 hover:bg-rose-50"
                      }`}
                    >
                      {period}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-rose-900 uppercase mb-1.5">
                  Audit Reference Date
                </label>
                <input
                  type="date"
                  value={reportDate}
                  onChange={(e) => setReportDate(e.target.value)}
                  className="w-full bg-white border border-rose-200 text-xs p-2 rounded-xl focus:outline-none focus:border-red-500 font-medium text-rose-900"
                />
              </div>

              <button
                type="button"
                onClick={() => {
                  try {
                    generateFailedNcrReportPDF(records, reportPeriod, reportDate);
                  } catch (err: any) {
                    alert("Failed to generate PDF Exception Report: " + err.message);
                  }
                }}
                className="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs py-3 px-4 rounded-xl flex items-center justify-center gap-2 active:scale-95 transition cursor-pointer shadow-sm shadow-rose-100"
              >
                <FileText className="w-4 h-4" />
                Compile Exception PDF
              </button>
            </div>
          </div>
          
          {/* 3 Premium KPI Scorecards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            
            {/* KPI 1: Production Volumetric Rate & Speed */}
            <div className="bg-indigo-50/40 p-5 rounded-2xl border border-indigo-100 flex flex-col justify-between relative overflow-hidden group hover:shadow-md transition">
              <div className="absolute top-0 right-0 p-3 text-indigo-200 group-hover:text-indigo-300 transition-colors">
                <TrendingUp className="w-10 h-10 stroke-1" />
              </div>
              <div>
                <span className="text-[10px] text-indigo-700 font-extrabold uppercase tracking-widest block leading-none">Gross Fab Rate</span>
                <strong className="text-3xl font-extrabold text-indigo-950 font-sans tracking-tight block mt-2">{totalMetersProducedRound}m</strong>
              </div>
              <div className="border-t border-indigo-100 pt-3 mt-4 flex items-center justify-between">
                <span className="text-[10.5px] font-semibold text-indigo-700/80">Avg speed: <strong className="font-extrabold">{avgMetersPerDay}m / day</strong></span>
                <span className="text-[10px] text-gray-400 bg-white/70 px-1.5 py-0.5 rounded border border-indigo-50 font-mono">
                  {totalActiveDays} shifts logged
                </span>
              </div>
            </div>

            {/* KPI 2: Quality Liberation Yield Rate */}
            <div className="bg-emerald-50/40 p-5 rounded-2xl border border-emerald-100 flex flex-col justify-between relative overflow-hidden group hover:shadow-md transition">
              <div className="absolute top-0 right-0 p-3 text-emerald-200 group-hover:text-emerald-300 transition-colors">
                <CheckCircle className="w-10 h-10 stroke-1" />
              </div>
              <div>
                <span className="text-[10px] text-emerald-700 font-extrabold uppercase tracking-widest block leading-none">Liberated Product Yield</span>
                <strong className="text-3xl font-extrabold text-emerald-950 font-sans tracking-tight block mt-2">{liberatedProductRate}%</strong>
              </div>
              <div className="border-t border-emerald-100 pt-3 mt-4 flex items-center justify-between">
                <span className="text-[10.5px] font-semibold text-emerald-700/80">Safe volume: <strong className="font-extrabold">{totalMetersLiberatedRound}m</strong></span>
                <span className="text-[10px] text-gray-400 bg-white/70 px-1.5 py-0.5 rounded border border-emerald-50 font-mono">
                  {liberatedPipes.length} of {totalPipesProduced} units
                </span>
              </div>
            </div>

            {/* KPI 3: Operational Capacity Speed */}
            <div className="bg-slate-50 p-5 rounded-2xl border border-slate-250 flex flex-col justify-between relative overflow-hidden group hover:shadow-md transition">
              <div className="absolute top-0 right-0 p-3 text-slate-300 group-hover:text-slate-450 transition-colors">
                <Clock className="w-10 h-10 stroke-1" />
              </div>
              <div>
                <span className="text-[10px] text-slate-500 font-extrabold uppercase tracking-widest block leading-none">Operational Capacity</span>
                <strong className="text-3xl font-extrabold text-slate-900 font-sans tracking-tight block mt-2">{avgPipesPerDay} pcs</strong>
              </div>
              <div className="border-t border-slate-200 pt-3 mt-4 flex items-center justify-between">
                <span className="text-[10.5px] font-semibold text-slate-600">Rejection rate: <strong className="font-extrabold">{(overallRejectRate * 100).toFixed(1)}%</strong></span>
                <span className="text-[10px] text-gray-400 bg-white px-1.5 py-0.5 rounded border border-slate-200 font-mono">
                  Current shift: ACTIVE
                </span>
              </div>
            </div>

          </div>

          {/* Left & Right Graphical Grid Panel */}
          <div className="grid grid-cols-1 gap-6">

            {/* Daily Volumetric Bar Chart (SVG) */}
            <div className="bg-white p-5 rounded-2xl border border-gray-155 space-y-4 shadow-xs">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-extrabold text-gray-950 uppercase tracking-widest">Daily Performance Trend</h4>
                  <p className="text-[10.5px] text-gray-400">Manufactured vs. Compliant volume (meters) over last 7 active shifts</p>
                </div>
                <span className="text-[9.5px] bg-indigo-50 text-indigo-700 px-2.5 py-0.5 rounded-md font-bold border border-indigo-120">
                  Past 7 shifts
                </span>
              </div>

              <div className="h-56 bg-gray-50/45 rounded-xl border border-gray-100/90 p-3 flex flex-col justify-between">
                {lastActiveDaysKeys.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center text-gray-400 text-xs gap-1">
                    <Info className="w-5 h-5 text-gray-300" />
                    <span>No manufactured days recorded inside the system ledger.</span>
                  </div>
                ) : (
                  <div className="w-full h-full relative flex flex-col justify-between">
                    {/* Y Axis Grid Lines & Background */}
                    <div className="absolute inset-0 flex flex-col justify-between pointer-events-none py-2 pr-6">
                      {[0, 1, 2, 3, 4].map((gridLineIdx) => (
                        <div key={gridLineIdx} className="w-full flex items-center gap-2">
                          <span className="text-[8px] font-mono text-gray-400 bg-white px-1 rounded shadow-3xs">
                            {gridLineIdx === 4 ? "0m" : gridLineIdx === 3 ? "25m" : gridLineIdx === 2 ? "50m" : gridLineIdx === 1 ? "100m" : "200m"}
                          </span>
                          <div className="grow border-t border-dashed border-gray-200"></div>
                        </div>
                      ))}
                    </div>

                    {/* Graphical Bars */}
                    <div className="grow flex items-end justify-around pl-10 pr-4 pb-2 pt-4 relative z-10">
                      {lastActiveDaysKeys.map((dayKey) => {
                        const dayVal = rawDailyGroup[dayKey] || { produced: 0, liberated: 0 };
                        const maxMeterCap = Math.max(...lastActiveDaysKeys.map(k => rawDailyGroup[k]?.produced || 15), 40);
                        
                        // Calculate exact percentage heights
                        const prodHeightPercent = Math.min(100, (dayVal.produced / maxMeterCap) * 100);
                        const libHeightPercent = Math.min(100, (dayVal.liberated / maxMeterCap) * 100);

                        const dateObjSplit = dayKey.split("-");
                        const shortDateStr = dateObjSplit.length >= 3 ? `${dateObjSplit[1]}/${dateObjSplit[2]}` : dayKey;

                        return (
                          <div key={dayKey} className="group relative flex flex-col items-center gap-1.5 h-full justify-end">
                            
                            {/* Tooltip on hovering specific column */}
                            <div className="absolute -top-10 scale-0 group-hover:scale-100 transition-all origin-bottom bg-slate-950 text-white text-[9px] p-2 rounded-lg shadow-md z-30 pointer-events-none w-28 text-center">
                              <strong className="block text-indigo-200">{dayKey}</strong>
                              Created: {dayVal.produced.toFixed(1)}m
                              <br />
                              Liberated: {dayVal.liberated.toFixed(1)}m
                            </div>

                            {/* Side by side dual bar capsules */}
                            <div className="flex items-end gap-1 px-1 h-full">
                              {/* Produced bar */}
                              <div className="w-2.5 bg-gray-200 rounded-t-sm h-full flex items-end">
                                <div 
                                  className="bg-indigo-600 rounded-t-sm w-full group-hover:bg-indigo-500 transition-all duration-300 shadow-2xs"
                                  style={{ height: `${prodHeightPercent}%` }}
                                ></div>
                              </div>
                              {/* Liberated bar */}
                              <div className="w-2.5 bg-gray-200 rounded-t-sm h-full flex items-end">
                                <div 
                                  className="bg-emerald-500 rounded-t-sm w-full group-hover:bg-emerald-400 transition-all duration-300 shadow-2xs"
                                  style={{ height: `${libHeightPercent}%` }}
                                ></div>
                              </div>
                            </div>

                            <span className="text-[8px] font-bold text-gray-500 font-mono tracking-tight leading-none">{shortDateStr}</span>
                          </div>
                        );
                      })}
                    </div>

                  </div>
                )}
              </div>

              {/* Chart Legends */}
              <div className="flex justify-between items-center text-[10.5px] border-t border-gray-100 pt-3 pb-0.5 px-1">
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 bg-indigo-600 rounded-xs inline-block text-indigo-600"></span>
                    <strong className="text-gray-600 font-semibold">Volume Manufactured (M)</strong>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 bg-emerald-500 rounded-xs inline-block text-emerald-500"></span>
                    <strong className="text-gray-600 font-semibold">Volume Liberated pass (M)</strong>
                  </span>
                </div>
                <span className="text-[9.5px] text-gray-400 italic font-medium">Auto-scaling active</span>
              </div>

            </div>

          </div>

          {/* Estimation and Predictive Time of Completion Segment */}
          <div className="bg-gradient-to-br from-indigo-950 to-slate-950 p-6 rounded-2xl border border-slate-900 text-white space-y-4 shadow-md relative overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,_var(--tw-gradient-stops))] from-indigo-500/10 via-transparent to-transparent pointer-events-none"></div>
            
            <div className="flex items-start justify-between relative z-10">
              <div>
                <span className="text-[9.5px] bg-indigo-500/25 border border-indigo-400/20 text-indigo-300 font-black tracking-widest uppercase px-2 py-0.5 rounded">
                  COGNITIVE ESTIMATION ALGORITHM
                </span>
                <h4 className="font-extrabold text-base tracking-tight font-sans mt-1">Linear Timeline Forecasts & Target Milestones</h4>
              </div>
              <Clock className="w-5 h-5 text-indigo-400" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-1 relative z-10">
              
              <div className="bg-white/5 p-3.5 rounded-xl border border-white/10 space-y-1">
                <span className="text-[10.5px] text-indigo-200/70 font-bold block uppercase tracking-wider">Target manufactured scope</span>
                <strong className="text-xl font-bold font-sans block text-white">{totalPortfolioTarget.toLocaleString()}m</strong>
                <span className="text-[10px] text-indigo-300 font-semibold block">{remainingTargetProducedPercent}% of target delivered</span>
              </div>

              <div className="bg-white/5 p-3.5 rounded-xl border border-white/10 space-y-1">
                <span className="text-[10.5px] text-indigo-200/70 font-bold block uppercase tracking-wider">Remaining meters balance</span>
                <strong className="text-xl font-bold font-sans block text-white">{remainingTargetMeters.toLocaleString()}m</strong>
                <span className="text-[10px] text-rose-300 font-semibold block">{totalPortfolioTarget > 0 ? Math.round((remainingTargetMeters/totalPortfolioTarget)*100) : 0}% balance to manufacture</span>
              </div>

              <div className="bg-white/5 p-3.5 rounded-xl border border-white/10 space-y-1">
                <span className="text-[10.5px] text-indigo-200/70 font-bold block uppercase tracking-wider">Est. finished days</span>
                <strong className="text-xl font-bold font-sans block text-white">{estimatedShiftsToFinish} days</strong>
                <span className="text-[10px] text-indigo-300 font-semibold block">Based on avg {avgMetersPerDay}m / shift</span>
              </div>

              <div className="bg-white/5 p-3.5 rounded-xl border border-white/10 space-y-1">
                <span className="text-[10.5px] text-indigo-200/70 font-bold block uppercase tracking-wider">Forecast rejection rate</span>
                <strong className="text-xl font-bold font-sans block text-white">+{forecastedFutureRejectPipes} units</strong>
                <span className="text-[10px] text-amber-300 font-semibold block">Estimated future defects to reject</span>
              </div>

            </div>

            <div className="pt-2 text-[10.5px] text-indigo-200/60 border-t border-white/5 flex flex-wrap items-center justify-between gap-1.5 relative z-10">
              <span>Calculators utilize actual dynamic parameters collected from live operator entries</span>
              <span className="font-mono text-[9px] text-white/40">ENGINE SHIFT PREDICTION CURVE • AUTO ACTIVE</span>
            </div>
          </div>

        </div>
      ) : (
        <div className="space-y-6 animate-fade-in">
          {/* Active Projects view tab */}
          {projects.length === 0 ? (
            <div className="py-16 text-center text-gray-400 text-xs flex flex-col items-center justify-center gap-1.5 bg-white rounded-3xl border border-gray-150">
              <Info className="w-8 h-8 text-gray-300" />
              <span className="font-bold text-gray-600 text-sm">No administrative project volumetric targets configured.</span>
              <p className="text-[11px] text-gray-400">Add targets & timelines in "Admin Account Panel → Project & Setting Reference Lists".</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {projects.map((project) => {
                // Get all recorded pipe runs for this project code
                const projPipes = records.filter(p => p.header?.projectWorkOrder?.toUpperCase() === project.projectCode?.toUpperCase());
                
                // Produced lengths (sum header.length, convert mm to meters)
                const totalMetersProducedProj = projPipes.reduce((sum, p) => sum + (Number(p.header?.length) || 0), 0) / 1000;
                
                // Liberated lengths (Passed all QA, completed step 8, convert mm to meters)
                const totalMetersLiberatedProj = projPipes.reduce((sum, p) => {
                  let hasFail = false;
                  let hasS8Completed = p.steps[8] && p.steps[8].isCompleted;
                  for (let s = 1; s <= 8; s++) {
                    const step = p.steps[s];
                    if (step) {
                      if (step.isNonConform) {
                        hasFail = true;
                      }
                      if (step.qualityChecks?.some(qc => qc.status === "Fail")) {
                        hasFail = true;
                      }
                    }
                  }
                  const isLiberated = !hasFail && hasS8Completed;
                  return sum + (isLiberated ? (Number(p.header?.length) || 0) : 0);
                }, 0) / 1000;

                const targetMeters = project.targetQuantityMeters || 1000;
                const producedRounded = Math.round(totalMetersProducedProj * 100) / 100;
                const liberatedRounded = Math.round(totalMetersLiberatedProj * 100) / 100;

                const producedPercent = Math.min(100, Math.round((producedRounded / targetMeters) * 100)) || 0;
                const liberatedPercentFixed = Math.min(100, Math.round((liberatedRounded / targetMeters) * 100)) || 0;

                // Total Non-Conforming: Any step flagged isNonConform
                const nonConformPipes = projPipes.filter(p => {
                  return Object.values(p.steps).some(step => step.isNonConform);
                });
                const totalMetersNonConformProj = nonConformPipes.reduce((sum, p) => sum + (Number(p.header?.length) || 0), 0) / 1000;
                const nonConformRounded = Math.round(totalMetersNonConformProj * 100) / 100;

                // Destination/Dispatch Breakdown (disjoint to guarantee mathematical alignment to total produced)
                const dpCommercialPipes = projPipes.filter(p => {
                  const isS8Completed = p.steps[8] && p.steps[8].isCompleted;
                  if (!isS8Completed) return false;
                  const dest = ((p.steps[8]?.fields as any)?.pipeDestination || "").toUpperCase().replace(/\s+/g, " ");
                  if (dest) {
                    return dest.includes("DP-COMMERCIAL");
                  }
                  const hasFail = Object.values(p.steps).some(step => 
                    step.isNonConform || step.qualityChecks?.some(q => q.status === "Fail")
                  );
                  return !hasFail;
                });

                const rpsCommercialPipes = projPipes.filter(p => {
                  const isS8Completed = p.steps[8] && p.steps[8].isCompleted;
                  if (!isS8Completed) return false;
                  const dest = ((p.steps[8]?.fields as any)?.pipeDestination || "").toUpperCase().replace(/\s+/g, " ");
                  if (dest) {
                    return dest.includes("RPS-COMMERCIAL");
                  }
                  return false;
                });

                const rejectedPipes = projPipes.filter(p => {
                  const isS8Completed = p.steps[8] && p.steps[8].isCompleted;
                  if (!isS8Completed) return false;
                  const dest = ((p.steps[8]?.fields as any)?.pipeDestination || "").toUpperCase().replace(/\s+/g, " ");
                  if (dest) {
                    return dest.includes("REJECTED");
                  }
                  const hasFail = Object.values(p.steps).some(step => 
                    step.isNonConform || step.qualityChecks?.some(q => q.status === "Fail")
                  );
                  return hasFail;
                });

                const inProcessPipes = projPipes.filter(p => {
                  const isS8Completed = p.steps[8] && p.steps[8].isCompleted;
                  return !isS8Completed;
                });

                const mDpCommercial = Math.round((dpCommercialPipes.reduce((sum, p) => sum + (Number(p.header?.length) || 0), 0) / 1000) * 100) / 100;
                const mRpsCommercial = Math.round((rpsCommercialPipes.reduce((sum, p) => sum + (Number(p.header?.length) || 0), 0) / 1000) * 100) / 100;
                const mRejected = Math.round((rejectedPipes.reduce((sum, p) => sum + (Number(p.header?.length) || 0), 0) / 1000) * 100) / 100;
                const mInProcess = Math.round((inProcessPipes.reduce((sum, p) => sum + (Number(p.header?.length) || 0), 0) / 1000) * 100) / 100;

                // Timeline calculation
                let timelineStatus = "Not Scheduled";
                let elapsedPercent = 0;
                let remainingDaysStr = "Unscheduled";
                let isExpired = false;
                let statusBadgeBg = "bg-gray-150 text-gray-700 border-gray-250";

                if (project.productionStartDate && project.productionEndDate) {
                  const start = new Date(project.productionStartDate).getTime();
                  const end = new Date(project.productionEndDate).getTime();
                  const now = Date.now();

                  if (now < start) {
                    timelineStatus = "Upcoming";
                    const diffMs = start - now;
                    const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
                    remainingDaysStr = `Starts in ${days}d`;
                    statusBadgeBg = "bg-blue-50 text-blue-700 border-blue-200";
                  } else if (now > end) {
                    timelineStatus = "Timeline Ended";
                    isExpired = true;
                    elapsedPercent = 100;
                    const diffMs = now - end;
                    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                    remainingDaysStr = `${days}d overdue`;
                    statusBadgeBg = "bg-rose-50 text-rose-700 border-rose-200/85";
                  } else {
                    const duration = end - start;
                    const elapsed = now - start;
                    elapsedPercent = Math.min(100, Math.round((elapsed / duration) * 100));
                    
                    const diffMs = end - now;
                    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                    remainingDaysStr = days > 0 ? `${days}d ${hours}h left` : `${hours}h left`;

                    // Compare progress
                    if (liberatedPercentFixed >= elapsedPercent) {
                      timelineStatus = "Ahead of Schedule";
                      statusBadgeBg = "bg-emerald-50 text-emerald-700 border-emerald-150";
                    } else if (elapsedPercent - liberatedPercentFixed < 15) {
                      timelineStatus = "On Track";
                      statusBadgeBg = "bg-indigo-50 text-indigo-700 border-indigo-150";
                    } else {
                      timelineStatus = "Behind Schedule";
                      statusBadgeBg = "bg-amber-50 text-amber-700 border-amber-250 animate-pulse";
                    }
                  }
                }

                return (
                  <div key={project.id} className="p-5 rounded-2xl border border-gray-200 bg-white hover:border-indigo-200/80 hover:shadow-md transition space-y-4">
                    {/* Card Header */}
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-extrabold text-gray-900 text-lg font-sans tracking-tight">
                            {project.projectCode}
                          </h4>
                          <button
                            onClick={() => {
                              try {
                                exportProjectAnalysisToPDF(project, records, tolerances);
                              } catch (e: any) {
                                alert("Failed to compile project analysis PDF: " + e.message);
                              }
                            }}
                            className="text-[10.5px] font-black uppercase text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-2 py-0.5 rounded flex items-center gap-1 cursor-pointer transition-transform active:scale-95"
                            title="Generate Detailed Analysis & Diagnostics PDF Report"
                          >
                            <FileText className="w-3 h-3 text-indigo-600" />
                            detailed report
                          </button>
                        </div>
                        <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mt-0.5">
                          Aggregate Target Volume: <strong className="text-gray-700">{targetMeters} meters</strong>
                        </p>
                      </div>

                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${statusBadgeBg}`}>
                        {timelineStatus}
                      </span>
                    </div>

                    {/* Aggregate Progress Stats */}
                    <div className="grid grid-cols-3 gap-3 bg-gray-50/50 p-3 rounded-xl border border-gray-150">
                      <div className="space-y-0.5">
                        <span className="text-[9.5px] text-gray-400 font-bold uppercase tracking-wider block">Total Produced</span>
                        <strong className="text-gray-850 text-sm font-sans block">{producedRounded}m</strong>
                        <span className="text-[9px] font-semibold text-indigo-600 block">{producedPercent}% of target</span>
                      </div>

                      <div className="space-y-0.5 border-l border-gray-150 pl-2">
                        <span className="text-[9.5px] text-emerald-500 font-bold uppercase tracking-wider block">Total Liberated</span>
                        <strong className="text-emerald-700 text-sm font-sans block">{liberatedRounded}m</strong>
                        <span className="text-[9px] font-semibold text-emerald-600 block">{liberatedPercentFixed}% of target</span>
                      </div>

                      <div className="space-y-0.5 border-l border-gray-150 pl-2">
                        <span className="text-[9.5px] text-red-500 font-bold uppercase tracking-wider block">Total Non-Conform</span>
                        <strong className="text-red-700 text-sm font-sans block">{nonConformRounded}m</strong>
                        <span className="text-[9px] font-bold text-red-600 block">{nonConformPipes.length} pipe(s)</span>
                      </div>
                    </div>

                    {/* Destination & Dispatch Process Status */}
                    <div className="bg-gray-50/30 rounded-xl p-3 border border-gray-150/80 space-y-1.5">
                      <span className="text-[9.5px] font-extrabold text-gray-450 uppercase tracking-wider block">
                        Dispatch & Process Allocation Summary
                      </span>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div className="bg-white p-2 rounded-lg border border-gray-150 space-y-0.5">
                          <span className="text-[8.5px] text-gray-400 font-bold uppercase tracking-wider block leading-tight">Total DP-Commercial</span>
                          <strong className="text-gray-850 text-xs block font-sans">{mDpCommercial}m</strong>
                          <span className="text-[8.5px] font-bold text-emerald-600 block">{dpCommercialPipes.length} unit(s)</span>
                        </div>
                        <div className="bg-white p-2 rounded-lg border border-gray-150 space-y-0.5">
                          <span className="text-[8.5px] text-gray-400 font-bold uppercase tracking-wider block leading-tight">Total RPS-Commercial</span>
                          <strong className="text-gray-850 text-xs block font-sans">{mRpsCommercial}m</strong>
                          <span className="text-[8.5px] font-bold text-blue-600 block">{rpsCommercialPipes.length} unit(s)</span>
                        </div>
                        <div className="bg-white p-2 rounded-lg border border-gray-150 space-y-0.5">
                          <span className="text-[8.5px] text-red-500 font-bold uppercase tracking-wider block leading-tight">Total Rejected</span>
                           <strong className="text-red-700 text-xs block font-sans">{mRejected}m</strong>
                          <span className="text-[8.5px] font-bold text-red-600 block">{rejectedPipes.length} unit(s)</span>
                        </div>
                        <div className="bg-white p-2 rounded-lg border border-gray-150 space-y-0.5">
                          <span className="text-[8.5px] text-amber-500 font-bold uppercase tracking-wider block leading-tight">Total In Process</span>
                          <strong className="text-amber-700 text-xs block font-sans">{mInProcess}m</strong>
                          <span className="text-[8.5px] font-bold text-amber-600 block">{inProcessPipes.length} unit(s)</span>
                        </div>
                      </div>
                    </div>

                    {/* Aggregate Visual Bars */}
                    <div className="space-y-2 pt-1">
                      <div className="w-full bg-gray-150 h-2 rounded-lg overflow-hidden relative">
                        <div 
                          className="bg-indigo-600 h-full rounded-lg transition-all duration-500 absolute top-0 left-0" 
                          style={{ width: `${producedPercent}%` }}
                        />
                        <div 
                          className="bg-emerald-500 h-full rounded-lg transition-all duration-500 absolute top-0 left-0 mix-blend-overlay opacity-90" 
                          style={{ width: `${liberatedPercentFixed}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[10px] text-gray-400 font-bold">
                        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-indigo-600"></span> Produced</span>
                        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Liberated (QA Passed & Completed)</span>
                      </div>
                    </div>

                    {/* Dynamic Multi-Reference Breakdown Nested Allocation List */}
                    <div className="space-y-2 pt-2">
                      <span className="text-[10px] font-extrabold text-gray-450 uppercase tracking-wider block border-t border-gray-150 pt-3">
                        Per-Reference allocations & progress
                      </span>

                      <div className="space-y-2">
                        {project.settingReferences?.map((ref) => {
                          const refObj = project.settingRefDetails?.find(d => d.settingReference.toUpperCase() === ref.toUpperCase());
                          const refTarget = refObj?.targetQuantityMeters || Math.round((targetMeters / project.settingReferences.length) * 10) / 10;
                          const refStart = refObj?.productionStartDate || project.productionStartDate;
                          const refEnd = refObj?.productionEndDate || project.productionEndDate;

                          // Filter project pipes matching this setting reference key
                          const refPipes = projPipes.filter(p => p.header?.settingReference?.toUpperCase() === ref.toUpperCase());
                          
                          // Produced for this specific reference
                          const refProduced = refPipes.reduce((sum, p) => sum + (Number(p.header?.length) || 0), 0) / 1000;
                          
                          // Liberated for this specific reference (Completed steps with no fails)
                          const refLiberated = refPipes.reduce((sum, p) => {
                            let hasFail = false;
                            let hasS8Completed = p.steps[8] && p.steps[8].isCompleted;
                            for (let s = 1; s <= 8; s++) {
                              if (p.steps[s]?.qualityChecks?.some(qc => qc.status === "Fail")) {
                                  hasFail = true;
                              }
                            }
                            const isLiberated = !hasFail && hasS8Completed;
                            return sum + (isLiberated ? (Number(p.header?.length) || 0) : 0);
                          }, 0) / 1000;

                          const refProducedRound = Math.round(refProduced * 100) / 100;
                          const refLiberatedRound = Math.round(refLiberated * 100) / 100;

                          const refProdPercent = Math.min(100, Math.round((refProducedRound / refTarget) * 100)) || 0;
                          const refLibPercent = Math.min(100, Math.round((refLiberatedRound / refTarget) * 100)) || 0;

                          // Individual Timeline calculations
                          let refTimelineStatus = "Unscheduled";
                          let refElapsed = 0;
                          let refRemainingStr = "";
                          let refStatusBadgeBg = "bg-gray-100 text-gray-500 border-gray-200/50";

                          if (refStart && refEnd) {
                            const start = new Date(refStart).getTime();
                            const end = new Date(refEnd).getTime();
                            const now = Date.now();

                            if (now < start) {
                              refTimelineStatus = "Upcoming";
                              const diff = start - now;
                              const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
                              refRemainingStr = `In ${days}d`;
                              refStatusBadgeBg = "bg-blue-50 text-blue-600 border-blue-100";
                            } else if (now > end) {
                              refTimelineStatus = "Overdue";
                              refElapsed = 100;
                              const diff = now - end;
                              const days = Math.floor(diff / (1000 * 60 * 60 * 24));
                              refRemainingStr = `${days}d overdue`;
                              refStatusBadgeBg = "bg-rose-50 text-rose-600 border-rose-100";
                            } else {
                              const dur = end - start;
                              const elap = now - start;
                              refElapsed = Math.min(100, Math.round((elap / dur) * 100));

                              const diff = end - now;
                              const days = Math.floor(diff / (1000 * 60 * 60 * 24));
                              const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                              refRemainingStr = days > 0 ? `${days}d left` : `${hours}h left`;

                              if (refLibPercent >= refElapsed) {
                                refTimelineStatus = "Ahead";
                                refStatusBadgeBg = "bg-emerald-50 text-emerald-600 border-emerald-100";
                              } else if (refElapsed - refLibPercent < 15) {
                                refTimelineStatus = "On Track";
                                refStatusBadgeBg = "bg-indigo-50 text-indigo-650 border-indigo-150/70";
                              } else {
                                refTimelineStatus = "Behind";
                                refStatusBadgeBg = "bg-amber-50 text-amber-600 border-amber-150 animate-pulse";
                              }
                            }
                          }

                          return (
                            <div key={ref} className="bg-gray-50 rounded-xl p-3.5 border border-gray-200 hover:border-indigo-200 hover:shadow-2xs transition space-y-2">
                              {/* Ref Meta Line */}
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5 font-sans">
                                  <span className="font-mono text-[10.5px] font-black text-indigo-950 bg-indigo-50/80 px-2 py-0.5 rounded border border-indigo-100">
                                    {ref}
                                  </span>
                                  <span className="text-[10px] text-gray-400 font-bold">Alloc: {refTarget}m</span>
                                </div>

                                <span className={`px-2 py-0.5 rounded text-[8.5px] font-black uppercase tracking-wider border ${refStatusBadgeBg}`}>
                                  {refTimelineStatus} {refRemainingStr ? `• ${refRemainingStr}` : ""}
                                </span>
                              </div>

                              {/* Reference Specific Progress Bars */}
                              <div className="grid grid-cols-2 gap-4 text-[10px] font-semibold">
                                <div className="space-y-1">
                                  <div className="flex justify-between">
                                    <span className="text-gray-400 font-medium">Produced:</span>
                                    <span className="text-gray-850 font-bold">{refProducedRound}m / {refTarget}m ({refProdPercent}%)</span>
                                  </div>
                                  <div className="w-full bg-gray-150 h-1.5 rounded overflow-hidden">
                                    <div 
                                      className="bg-indigo-600 h-full rounded transition-all duration-350"
                                      style={{ width: `${refProdPercent}%` }}
                                    />
                                  </div>
                                </div>

                                <div className="space-y-1">
                                  <div className="flex justify-between">
                                    <span className="text-emerald-500 font-medium">Liberated:</span>
                                    <span className="text-emerald-700 font-extrabold">{refLiberatedRound}m / {refTarget}m ({refLibPercent}%)</span>
                                  </div>
                                  <div className="w-full bg-gray-155 h-1.5 rounded overflow-hidden">
                                    <div 
                                      className="bg-emerald-500 h-full rounded transition-all duration-350"
                                      style={{ width: `${refLibPercent}%` }}
                                    />
                                  </div>
                                </div>
                              </div>

                              {refStart && refEnd && (
                                <div className="flex items-center justify-between text-[8.5px] text-gray-400 font-medium font-mono pt-1">
                                  <span>Start: {new Date(refStart).toLocaleDateString()}</span>
                                  <span>Elapsed: {refElapsed}%</span>
                                  <span>End: {new Date(refEnd).toLocaleDateString()}</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Aggregate Schedule timeline status */}
                    {project.productionStartDate && (
                      <div className="p-3 rounded-xl border border-dotted border-gray-200 bg-gray-50/50 text-xs space-y-2 mt-2">
                        <div className="flex justify-between text-gray-500 text-[10px] font-bold uppercase tracking-wide">
                          <span className="flex items-center gap-1 text-slate-500 font-extrabold">
                            <Calendar className="w-3.5 h-3.5 text-gray-400" />
                            Overall Elapsed: {elapsedPercent}%
                          </span>
                          <span className="flex items-center gap-1 text-slate-800">
                            <Clock className="w-3.5 h-3.5 text-indigo-500" />
                            {remainingDaysStr}
                          </span>
                        </div>
                        
                        <div className="w-full bg-gray-150 h-1 rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all ${isExpired ? 'bg-rose-500' : 'bg-slate-500'}`} 
                            style={{ width: `${elapsedPercent}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

    </div>
  );
}

export default React.memo(PortfolioAnalytics);
