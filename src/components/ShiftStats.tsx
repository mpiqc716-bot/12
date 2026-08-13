import React, { useState, useMemo } from "react";
import {
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  FileText,
  Search,
  ChevronDown,
  Download,
  Layers,
  ShieldAlert,
  Package,
  Award,
  Sun,
  Sunset,
  Moon,
  Calendar
} from "lucide-react";
import { PipeRecord, User as UserType } from "../types";
import { generateShiftReportPDF, getShiftInfo, SHIFT_NAMES } from "../utils/shiftPdfGenerator";

interface ShiftStatsProps {
  records: PipeRecord[];
  currentUser: UserType | null;
}

const STEP_TITLES: { [key: number]: string } = {
  1: "Step 1: Mold Prep & Header Registration",
  2: "Step 2: Liner Construction",
  3: "Step 3: Structural Filament Winding",
  4: "Step 4: Cure Cycle & Barcol Hardness",
  5: "Step 5: Structural Core Demolding",
  6: "Step 6: Spigot Dimensional Inspection",
  7: "Step 7: Bell Socket Dimensional Inspection",
  8: "Step 8: Final Quality Inspection Clearance"
};

export function ShiftStats({ records, currentUser }: ShiftStatsProps) {
  const [selectedShift, setSelectedShift] = useState<"ALL" | "SHIFT_1" | "SHIFT_2" | "SHIFT_3">("ALL");
  const [selectedDate, setSelectedDate] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "NON CONFORM" | "ON HOLD" | "LIBERATED">("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [expandedPipeId, setExpandedPipeId] = useState<string | null>(null);

  // Extract all unique dates present in the pipe records and their saved steps for quick selection
  const availableDates = useMemo(() => {
    const dates = new Set<string>();
    records.forEach(r => {
      if (r.createdAt) {
        const { shiftDate } = getShiftInfo(r.createdAt);
        dates.add(shiftDate);
      }
      if (r.steps) {
        Object.values(r.steps).forEach((s: any) => {
          const stepTs = s?.savedAt || r.createdAt;
          if (stepTs) {
            const { shiftDate } = getShiftInfo(stepTs);
            dates.add(shiftDate);
          }
        });
      }
    });
    return Array.from(dates).sort().reverse();
  }, [records]);

  // Compute shift statistics for each pipe record - strictly picking steps saved on the selected shift
  const shiftStatistics = useMemo(() => {
    return records.map(pipe => {
      const stepsControlledSet = new Set<number>();
      const stepsFailedList: Array<{ stepNo: number; label: string; reason?: string }> = [];
      let pipeHasNonConformity = false;

      const pipeCreationShiftInfo = pipe.createdAt ? getShiftInfo(pipe.createdAt) : null;

      Object.entries(pipe.steps || {}).forEach(([stepNoStr, step]: [string, any]) => {
        const stepNo = Number(stepNoStr);
        if (!step) return;

        const stepTimestamp = step.savedAt || pipe.createdAt || pipe.header?.productionDate;
        const stepShiftInfo = stepTimestamp ? getShiftInfo(stepTimestamp) : pipeCreationShiftInfo;

        const matchesShift = selectedShift === "ALL" || (stepShiftInfo && stepShiftInfo.shift === selectedShift);
        const matchesDate = selectedDate === "ALL" || (stepShiftInfo && stepShiftInfo.shiftDate === selectedDate);

        if (matchesShift && matchesDate) {
          stepsControlledSet.add(stepNo);

          const failingQCs = (step.qualityChecks || [])
            .filter((qc: any) => qc.status === "Fail")
            .map((qc: any) => qc.label);

          const stepFailed = step.isNonConform || failingQCs.length > 0;

          if (stepFailed) {
            pipeHasNonConformity = true;
            stepsFailedList.push({
              stepNo,
              label: `Step ${stepNo}`,
              reason: step.ncrReason || failingQCs.join(", ") || step.additionalObs || "Defect Flagged"
            });
          }
        } else {
          // Even if step was saved outside selected shift, check if pipe itself has non-conformity
          const failingQCs = (step.qualityChecks || [])
            .filter((qc: any) => qc.status === "Fail")
            .map((qc: any) => qc.label);
          if (step.isNonConform || failingQCs.length > 0) {
            pipeHasNonConformity = true;
          }
        }
      });

      let computedStatus: "NON CONFORM" | "ON HOLD" | "LIBERATED" = "ON HOLD";

      if (pipeHasNonConformity) {
        computedStatus = "NON CONFORM";
      } else if (pipe.isDispatched || (pipe.steps?.[8]?.isCompleted && !pipeHasNonConformity)) {
        computedStatus = "LIBERATED";
      } else {
        computedStatus = "ON HOLD";
      }

      const matchesFilterScope = (selectedShift === "ALL" && selectedDate === "ALL")
        ? true
        : stepsControlledSet.size > 0;

      return {
        pipe,
        pipeId: pipe.pipeId,
        projectWorkOrder: pipe.header?.projectWorkOrder || "N/A",
        pipeType: pipe.header?.pipeType || "GRP Composite",
        diameter: pipe.header?.diameter,
        pressure: pipe.header?.pressure,
        length: pipe.header?.length,
        createdBy: pipe.operatorUsername || "System",
        createdAt: pipe.createdAt,
        stepsControlled: Array.from(stepsControlledSet).sort((a, b) => a - b),
        stepsFailed: stepsFailedList,
        status: computedStatus,
        matchesFilterScope,
        creationShiftInfo: pipeCreationShiftInfo
      };
    }).filter(p => p.matchesFilterScope);
  }, [records, selectedShift, selectedDate]);

  // Apply status and search query filter (ordered by Pipe N° from low to high)
  const filteredShiftStats = useMemo(() => {
    const searchLower = searchQuery.toLowerCase().trim();

    return shiftStatistics
      .filter(item => {
        if (statusFilter !== "ALL" && item.status !== statusFilter) {
          return false;
        }

        if (searchLower) {
          const matchesPipeId = item.pipeId.toLowerCase().includes(searchLower);
          const matchesWO = item.projectWorkOrder.toLowerCase().includes(searchLower);
          const matchesType = item.pipeType.toLowerCase().includes(searchLower);
          const matchesCreator = item.createdBy.toLowerCase().includes(searchLower);
          return matchesPipeId || matchesWO || matchesType || matchesCreator;
        }

        return true;
      })
      .sort((a, b) => (a.pipeId || "").localeCompare(b.pipeId || "", undefined, { numeric: true, sensitivity: "base" }));
  }, [shiftStatistics, statusFilter, searchQuery]);

  // KPI Metrics
  const totalCount = shiftStatistics.length;
  const nonConformCount = shiftStatistics.filter(p => p.status === "NON CONFORM").length;
  const onHoldCount = shiftStatistics.filter(p => p.status === "ON HOLD").length;
  const liberatedCount = shiftStatistics.filter(p => p.status === "LIBERATED").length;

  // Handle Export CSV
  const exportToCSV = () => {
    const rows = [
      ["24-Hour Production Shift Quality Statistics Export"],
      ["Shift Filter", SHIFT_NAMES[selectedShift]],
      ["Shift Date", selectedDate],
      ["Export Date", new Date().toLocaleString()],
      [""],
      ["PIPE N°", "Project Work Order", "Pipe Type", "Created By", "STEPS CONTROLLED", "STEPS FAILED", "STATUS"],
    ];

    filteredShiftStats.forEach(item => {
      rows.push([
        item.pipeId,
        item.projectWorkOrder,
        item.pipeType,
        item.createdBy,
        item.stepsControlled.map(s => `Step ${s}`).join(", ") || "None",
        item.stepsFailed.map(s => `Step ${s.stepNo} (${s.reason})`).join("; ") || "None",
        item.status
      ]);
    });

    const csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Shift_Statistics_${selectedShift}_${selectedDate}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 animate-fade-in font-sans">
      
      {/* Jumbotron Banner Header */}
      <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 p-6 rounded-3xl border border-blue-900/40 text-white shadow-xl relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-500/10 via-transparent to-transparent pointer-events-none"></div>

        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="bg-blue-500/20 border border-blue-400/30 text-blue-300 font-extrabold uppercase tracking-widest text-[9.5px] px-2.5 py-0.5 rounded-full flex items-center gap-1">
                <Clock className="w-3 h-3 text-blue-400" />
                24-Hour Production Cycle
              </span>
              <span className="bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 font-extrabold uppercase tracking-widest text-[9.5px] px-2.5 py-0.5 rounded-full">
                3-Shift Rotation Quality Traceability
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-2">
              <Clock className="w-7 h-7 text-blue-400" />
              Shift Statistics & 24H Quality Ledger
            </h1>
            <p className="text-xs sm:text-sm text-blue-200/80 mt-1 max-w-2xl">
              Quality control metrics categorized by 8-hour production shifts: <strong>Shift 1 (06:00 - 14:00)</strong>, <strong>Shift 2 (14:00 - 22:00)</strong>, and <strong>Shift 3 (22:00 - 06:00)</strong>.
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              onClick={() => {
                try {
                  generateShiftReportPDF(records, currentUser?.username || "admin", {
                    selectedShift,
                    selectedDate,
                    statusFilter,
                    searchQuery
                  });
                } catch (err: any) {
                  alert("Failed to generate Shift PDF Report: " + err.message);
                }
              }}
              className="bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-xs px-4 py-2.5 rounded-2xl flex items-center gap-2 shadow-md hover:shadow-lg transition active:scale-95 cursor-pointer uppercase tracking-wider"
            >
              <FileText className="w-4 h-4 text-blue-200" />
              <span>Download PDF Audit</span>
            </button>

            <button
              onClick={exportToCSV}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-extrabold text-xs px-3.5 py-2.5 rounded-2xl flex items-center gap-2 transition active:scale-95 cursor-pointer uppercase tracking-wider"
            >
              <Download className="w-4 h-4 text-slate-300" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Shift & Date Controls Bar */}
        <div className="mt-6 pt-5 border-t border-blue-900/50 grid grid-cols-1 md:grid-cols-4 gap-3 items-center">
          
          <div className="md:col-span-2">
            <label htmlFor="shift-select-dropdown" className="text-[10px] font-extrabold uppercase tracking-widest text-blue-300 block mb-1">
              Select Production Shift
            </label>
            <div className="relative">
              <select
                id="shift-select-dropdown"
                value={selectedShift}
                onChange={(e: any) => setSelectedShift(e.target.value)}
                className="w-full bg-slate-950 border border-blue-500/30 text-xs sm:text-sm font-black text-white rounded-xl px-3.5 py-2.5 outline-none focus:border-blue-400 transition cursor-pointer shadow-inner appearance-none pr-8"
              >
                <option value="ALL">🌟 All Shifts (24 Hours Combined)</option>
                <option value="SHIFT_1">🌅 Shift 1 (Morning: 06:00 AM - 14:00 PM)</option>
                <option value="SHIFT_2">🌆 Shift 2 (Afternoon: 14:00 PM - 22:00 PM)</option>
                <option value="SHIFT_3">🌙 Shift 3 (Night: 22:00 PM - 06:00 AM)</option>
              </select>
              <ChevronDown className="w-4 h-4 text-blue-400 absolute right-3 top-3 pointer-events-none" />
            </div>
          </div>

          <div>
            <label htmlFor="shift-date-select" className="text-[10px] font-extrabold uppercase tracking-widest text-blue-300 block mb-1">
              Shift Date
            </label>
            <div className="relative">
              <select
                id="shift-date-select"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full bg-slate-950 border border-blue-500/30 text-xs font-bold text-slate-200 rounded-xl px-3 py-2.5 outline-none focus:border-blue-400 transition cursor-pointer appearance-none pr-8"
              >
                <option value="ALL">All Recorded Dates</option>
                {availableDates.map(d => (
                  <option key={d} value={d}>📅 {d}</option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-blue-400 absolute right-3 top-3 pointer-events-none" />
            </div>
          </div>

          <div>
            <label htmlFor="search-input-shift-stats" className="text-[10px] font-extrabold uppercase tracking-widest text-blue-300 block mb-1">
              Search Pipe N°
            </label>
            <div className="relative">
              <input
                id="search-input-shift-stats"
                type="text"
                placeholder="Search Pipe ID / WO..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950 border border-blue-500/30 text-xs text-white rounded-xl pl-8 pr-3 py-2.5 outline-none focus:border-blue-400 transition placeholder-slate-500"
              />
              <Search className="w-3.5 h-3.5 text-blue-400 absolute left-2.5 top-3" />
            </div>
          </div>

        </div>
      </div>

      {/* 3 Shift Badges Information Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-semibold">
        <div className={`p-3.5 rounded-2xl border flex items-center gap-3 transition ${selectedShift === "SHIFT_1" ? "bg-amber-500/10 border-amber-400 text-amber-900" : "bg-white border-slate-200 text-slate-700"}`}>
          <div className="p-2.5 rounded-xl bg-amber-100 text-amber-700">
            <Sun className="w-5 h-5" />
          </div>
          <div>
            <strong className="block text-slate-900 font-extrabold text-sm">Shift 1 (Morning)</strong>
            <span className="text-[11px] text-slate-500">06:00 AM – 14:00 PM (8 Hours)</span>
          </div>
        </div>

        <div className={`p-3.5 rounded-2xl border flex items-center gap-3 transition ${selectedShift === "SHIFT_2" ? "bg-orange-500/10 border-orange-400 text-orange-900" : "bg-white border-slate-200 text-slate-700"}`}>
          <div className="p-2.5 rounded-xl bg-orange-100 text-orange-700">
            <Sunset className="w-5 h-5" />
          </div>
          <div>
            <strong className="block text-slate-900 font-extrabold text-sm">Shift 2 (Afternoon)</strong>
            <span className="text-[11px] text-slate-500">14:00 PM – 22:00 PM (8 Hours)</span>
          </div>
        </div>

        <div className={`p-3.5 rounded-2xl border flex items-center gap-3 transition ${selectedShift === "SHIFT_3" ? "bg-indigo-500/10 border-indigo-400 text-indigo-900" : "bg-white border-slate-200 text-slate-700"}`}>
          <div className="p-2.5 rounded-xl bg-indigo-100 text-indigo-700">
            <Moon className="w-5 h-5" />
          </div>
          <div>
            <strong className="block text-slate-900 font-extrabold text-sm">Shift 3 (Night)</strong>
            <span className="text-[11px] text-slate-500">22:00 PM – 06:00 AM (8 Hours)</span>
          </div>
        </div>
      </div>

      {/* 4 Summary KPI Filter Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Card 1: ALL PIPES */}
        <div 
          onClick={() => setStatusFilter("ALL")}
          className={`p-5 rounded-2xl border transition cursor-pointer flex flex-col justify-between relative overflow-hidden ${
            statusFilter === "ALL" 
              ? "bg-slate-900 text-white border-slate-700 shadow-lg ring-2 ring-blue-400" 
              : "bg-white text-slate-800 border-slate-200 hover:border-blue-300 hover:shadow-md"
          }`}
        >
          <div className="flex items-start justify-between">
            <div>
              <span className={`text-[10px] font-black uppercase tracking-widest block ${statusFilter === "ALL" ? "text-slate-300" : "text-slate-500"}`}>
                Shift Pipes
              </span>
              <strong className="text-3xl font-black tracking-tight block mt-1 font-sans">
                {totalCount}
              </strong>
            </div>
            <Package className={`w-8 h-8 ${statusFilter === "ALL" ? "text-blue-300" : "text-blue-500"}`} />
          </div>
          <p className={`text-[10.5px] mt-3 pt-2 border-t ${statusFilter === "ALL" ? "border-slate-800 text-slate-300" : "border-slate-100 text-slate-500"}`}>
            Pipes controlled in {selectedShift === "ALL" ? "24H shift cycle" : SHIFT_NAMES[selectedShift]}
          </p>
        </div>

        {/* Card 2: NON CONFORM */}
        <div 
          onClick={() => setStatusFilter("NON CONFORM")}
          className={`p-5 rounded-2xl border transition cursor-pointer flex flex-col justify-between relative overflow-hidden ${
            statusFilter === "NON CONFORM" 
              ? "bg-rose-900 text-white border-rose-700 shadow-lg ring-2 ring-rose-400" 
              : "bg-white text-slate-800 border-slate-200 hover:border-rose-300 hover:shadow-md"
          }`}
        >
          <div className="flex items-start justify-between">
            <div>
              <span className={`text-[10px] font-black uppercase tracking-widest block ${statusFilter === "NON CONFORM" ? "text-rose-200" : "text-rose-600"}`}>
                NON CONFORM
              </span>
              <strong className="text-3xl font-black tracking-tight block mt-1 font-sans">
                {nonConformCount}
              </strong>
            </div>
            <ShieldAlert className={`w-8 h-8 ${statusFilter === "NON CONFORM" ? "text-rose-300" : "text-rose-500"}`} />
          </div>
          <p className={`text-[10.5px] mt-3 pt-2 border-t ${statusFilter === "NON CONFORM" ? "border-rose-800 text-rose-200" : "border-slate-100 text-slate-500"}`}>
            Defects or NCR flags in active shift
          </p>
        </div>

        {/* Card 3: ON HOLD */}
        <div 
          onClick={() => setStatusFilter("ON HOLD")}
          className={`p-5 rounded-2xl border transition cursor-pointer flex flex-col justify-between relative overflow-hidden ${
            statusFilter === "ON HOLD" 
              ? "bg-amber-900 text-white border-amber-700 shadow-lg ring-2 ring-amber-400" 
              : "bg-white text-slate-800 border-slate-200 hover:border-amber-300 hover:shadow-md"
          }`}
        >
          <div className="flex items-start justify-between">
            <div>
              <span className={`text-[10px] font-black uppercase tracking-widest block ${statusFilter === "ON HOLD" ? "text-amber-200" : "text-amber-600"}`}>
                ON HOLD
              </span>
              <strong className="text-3xl font-black tracking-tight block mt-1 font-sans">
                {onHoldCount}
              </strong>
            </div>
            <Clock className={`w-8 h-8 ${statusFilter === "ON HOLD" ? "text-amber-300" : "text-amber-500"}`} />
          </div>
          <p className={`text-[10.5px] mt-3 pt-2 border-t ${statusFilter === "ON HOLD" ? "border-amber-800 text-amber-200" : "border-slate-100 text-slate-500"}`}>
            Inspection steps in progress
          </p>
        </div>

        {/* Card 4: LIBERATED */}
        <div 
          onClick={() => setStatusFilter("LIBERATED")}
          className={`p-5 rounded-2xl border transition cursor-pointer flex flex-col justify-between relative overflow-hidden ${
            statusFilter === "LIBERATED" 
              ? "bg-emerald-900 text-white border-emerald-700 shadow-lg ring-2 ring-emerald-400" 
              : "bg-white text-slate-800 border-slate-200 hover:border-emerald-300 hover:shadow-md"
          }`}
        >
          <div className="flex items-start justify-between">
            <div>
              <span className={`text-[10px] font-black uppercase tracking-widest block ${statusFilter === "LIBERATED" ? "text-emerald-200" : "text-emerald-600"}`}>
                LIBERATED
              </span>
              <strong className="text-3xl font-black tracking-tight block mt-1 font-sans">
                {liberatedCount}
              </strong>
            </div>
            <Award className={`w-8 h-8 ${statusFilter === "LIBERATED" ? "text-emerald-300" : "text-emerald-500"}`} />
          </div>
          <p className={`text-[10.5px] mt-3 pt-2 border-t ${statusFilter === "LIBERATED" ? "border-emerald-800 text-emerald-200" : "border-slate-100 text-slate-500"}`}>
            Officially cleared & dispatched
          </p>
        </div>

      </div>

      {/* Filter Tabs Bar */}
      <div className="bg-white p-2 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between gap-2 overflow-x-auto">
        <div className="flex items-center gap-1.5 min-w-max">
          <button
            onClick={() => setStatusFilter("ALL")}
            className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition cursor-pointer ${
              statusFilter === "ALL"
                ? "bg-slate-900 text-white shadow-md"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <Package className="w-4 h-4" />
            <span>ALL PIPES ({totalCount})</span>
          </button>

          <button
            onClick={() => setStatusFilter("NON CONFORM")}
            className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition cursor-pointer ${
              statusFilter === "NON CONFORM"
                ? "bg-rose-600 text-white shadow-md"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <ShieldAlert className="w-4 h-4" />
            <span>NON CONFORM ({nonConformCount})</span>
          </button>

          <button
            onClick={() => setStatusFilter("ON HOLD")}
            className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition cursor-pointer ${
              statusFilter === "ON HOLD"
                ? "bg-amber-600 text-white shadow-md"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>ON HOLD ({onHoldCount})</span>
          </button>

          <button
            onClick={() => setStatusFilter("LIBERATED")}
            className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition cursor-pointer ${
              statusFilter === "LIBERATED"
                ? "bg-emerald-600 text-white shadow-md"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <Award className="w-4 h-4" />
            <span>LIBERATED ({liberatedCount})</span>
          </button>
        </div>
      </div>

      {/* MASTER SHIFT STATISTICS TABLE */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden animate-fade-in">
        <div className="p-5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="font-black text-slate-900 text-base flex items-center gap-2">
              <Layers className="w-5 h-5 text-blue-600" />
              24H Shift Control Audit Table
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Showing PIPE N°, STEPS CONTROLLED, STEPS FAILED, and STATUS for {SHIFT_NAMES[selectedShift]} (Date: {selectedDate}).
            </p>
          </div>
          <span className="text-xs bg-blue-100 text-blue-800 font-bold px-3 py-1 rounded-full border border-blue-200">
            {filteredShiftStats.length} Pipe Items
          </span>
        </div>

        {filteredShiftStats.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-2">
            <Package className="w-10 h-10 mx-auto text-slate-300" />
            <p className="font-bold text-slate-600 text-sm">No pipe records match the criteria for {selectedShift}.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-900 text-white uppercase font-black tracking-wider text-[11px]">
                <tr>
                  <th className="p-4 pl-6 w-1/4">PIPE N°</th>
                  <th className="p-4 w-1/3">STEPS CONTROLLED</th>
                  <th className="p-4 w-1/4">STEPS FAILED</th>
                  <th className="p-4 pr-6 text-right w-1/6">STATUS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredShiftStats.map((item) => {
                  const isExpanded = expandedPipeId === item.pipeId;

                  return (
                    <React.Fragment key={item.pipeId}>
                      <tr 
                        onClick={() => setExpandedPipeId(isExpanded ? null : item.pipeId)}
                        className={`hover:bg-blue-50/50 transition cursor-pointer ${isExpanded ? "bg-blue-50/70" : ""}`}
                      >
                        {/* 1. PIPE N° */}
                        <td className="p-4 pl-6">
                          <div className="flex items-center gap-2">
                            <strong className="text-base font-black text-blue-950 font-mono tracking-tight">
                              {item.pipeId}
                            </strong>
                            <span className="text-[10px] bg-slate-100 text-slate-700 font-extrabold px-2 py-0.5 rounded border border-slate-200">
                              {item.projectWorkOrder}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                            {item.pipeType} {item.diameter ? `• DN${item.diameter}` : ""} {item.pressure ? `• PN${item.pressure}` : ""}
                          </div>
                        </td>

                        {/* 2. STEPS CONTROLLED */}
                        <td className="p-4">
                          {item.stepsControlled.length === 0 ? (
                            <span className="text-slate-400 italic">None recorded</span>
                          ) : (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {item.stepsControlled.map((stepNo) => {
                                const stepRec = item.pipe.steps?.[stepNo];
                                const hasFail = stepRec?.isNonConform || stepRec?.qualityChecks?.some((q: any) => q.status === "Fail");

                                return (
                                  <span
                                    key={stepNo}
                                    className={`px-2.5 py-1 rounded-lg text-xs font-black inline-flex items-center gap-1 border ${
                                      hasFail
                                        ? "bg-rose-100 text-rose-800 border-rose-300"
                                        : "bg-blue-50 text-blue-900 border-blue-200"
                                    }`}
                                  >
                                    <span>Step {stepNo}</span>
                                    {hasFail ? <XCircle className="w-3.5 h-3.5 text-rose-600" /> : <CheckCircle className="w-3.5 h-3.5 text-blue-600" />}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </td>

                        {/* 3. STEPS FAILED */}
                        <td className="p-4">
                          {item.stepsFailed.length === 0 ? (
                            <span className="text-emerald-700 font-bold bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200 text-[11px] inline-flex items-center gap-1">
                              <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                              None (0 Defects)
                            </span>
                          ) : (
                            <div className="space-y-1">
                              {item.stepsFailed.map((failedItem, fIdx) => (
                                <div key={fIdx} className="bg-rose-50 border border-rose-200 p-1.5 rounded-lg text-[11px] text-rose-900 font-semibold flex items-start gap-1">
                                  <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
                                  <div>
                                    <strong className="font-extrabold text-rose-950">Step {failedItem.stepNo}:</strong> {failedItem.reason}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>

                        {/* 4. STATUS */}
                        <td className="p-4 pr-6 text-right">
                          {item.status === "NON CONFORM" && (
                            <span className="bg-rose-600 text-white font-black px-3 py-1.5 rounded-xl text-[10.5px] uppercase tracking-wider shadow-sm inline-flex items-center gap-1">
                              <XCircle className="w-3.5 h-3.5 text-rose-200" />
                              NON CONFORM
                            </span>
                          )}

                          {item.status === "ON HOLD" && (
                            <span className="bg-amber-500 text-white font-black px-3 py-1.5 rounded-xl text-[10.5px] uppercase tracking-wider shadow-sm inline-flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5 text-amber-100" />
                              ON HOLD
                            </span>
                          )}

                          {item.status === "LIBERATED" && (
                            <span className="bg-emerald-600 text-white font-black px-3 py-1.5 rounded-xl text-[10.5px] uppercase tracking-wider shadow-sm inline-flex items-center gap-1">
                              <CheckCircle className="w-3.5 h-3.5 text-emerald-200" />
                              LIBERATED
                            </span>
                          )}
                        </td>
                      </tr>

                      {/* Expandable Step Drawer for Telemetry Details */}
                      {isExpanded && (
                        <tr className="bg-slate-900 text-white">
                          <td colSpan={4} className="p-4 sm:p-5 border-t border-slate-800">
                            <div className="space-y-3">
                              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                                <h4 className="text-xs font-extrabold text-blue-300 uppercase tracking-wider flex items-center gap-1.5">
                                  <Layers className="w-4 h-4 text-blue-400" />
                                  Pipe N° {item.pipeId} — Shift Telemetry & Inspection Logs
                                </h4>
                                <span className="text-[11px] text-slate-400 font-mono">
                                  Created by {item.createdBy} ({item.createdAt ? new Date(item.createdAt).toLocaleString() : "---"})
                                </span>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {Object.entries(item.pipe.steps || {}).map(([sNoStr, step]: [string, any]) => {
                                  const stepNo = Number(sNoStr);
                                  const fields = step?.fields || {};
                                  const sInfo = step.savedAt ? getShiftInfo(step.savedAt) : null;

                                  return (
                                    <div key={stepNo} className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs space-y-1">
                                      <div className="flex items-center justify-between border-b border-slate-800 pb-1">
                                        <strong className="text-blue-300 font-bold">
                                          {STEP_TITLES[stepNo] || `Step ${stepNo}`}
                                        </strong>
                                        <span className="text-[10px] text-slate-400 font-mono">
                                          {sInfo ? `${sInfo.shift.replace("_", " ")} (${sInfo.shiftDate})` : ""} • By {step.savedBy || "System"}
                                        </span>
                                      </div>

                                      {stepNo === 1 && (
                                        <p className="text-slate-300">Mold Serial: <strong className="text-white">{fields.moldSerial || "---"}</strong> | Condition: {fields.moldCondition || "OK"}</p>
                                      )}
                                      {stepNo === 2 && (
                                        <p className="text-slate-300">Resin: <strong className="text-white">{fields.resinType} ({fields.resinBatch})</strong> | Glass: {fields.cGlassType}</p>
                                      )}
                                      {stepNo === 3 && (
                                        <p className="text-slate-300">Winding Angle: <strong className="text-white">{fields.windingAngle}°</strong> | Layers: {fields.layersCount}</p>
                                      )}
                                      {stepNo === 4 && (
                                        <p className="text-slate-300">Barcol Hardness: <strong className="text-emerald-400 font-bold">{fields.barcolValue || "42 HBa"}</strong> (Min req: {fields.barcolMinReq || "40 HBa"})</p>
                                      )}
                                      {stepNo === 6 && (
                                        <p className="text-slate-300 font-mono">Spigot SA: {fields.sa}mm | SB: {fields.sb}mm | Ø2S: {fields.o2s}mm | Ø3S: {fields.o3s}mm</p>
                                      )}
                                      {stepNo === 7 && (
                                        <p className="text-slate-300 font-mono">Bell Internal Ø2B: {fields.o2b}mm | BA: {fields.ba}mm | BB: {fields.bb}mm</p>
                                      )}
                                      {stepNo === 8 && (
                                        <p className="text-slate-300">Destination: <strong className="text-emerald-300">{fields.pipeDestination || "DP-COMMERCIAL"}</strong> | Inspector: {fields.inspectorName || "Operator"}</p>
                                      )}

                                      {step.additionalObs && (
                                        <p className="text-[11px] text-amber-300 italic pt-1">
                                          Obs: "{step.additionalObs}"
                                        </p>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}
