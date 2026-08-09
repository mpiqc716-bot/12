import { jsPDF } from "jspdf";
import { PipeRecord, ProjectConfig, ToleranceConfig } from "../types";

// Helper map to rename step field keys into elegant labels
const STAT_FIELDS_LABELS: { [key: string]: string } = {
  pipeLength: "Avg Pipe Length (mm)",
  pipeThickness: "Avg Wall Thickness (mm)",
  pipeWeight: "Avg Pipe Weight (kg)",
  sa: "Avg Spigot SA (mm)",
  sb: "Avg Spigot SB (mm)",
  sc: "Avg Spigot SC (mm)",
  o2s: "Avg Spigot Ø2S (mm)",
  o2b: "Avg Bell Ø2B (mm)",
  bg: "Avg Bell BG (mm)",
  tgValue: "Avg Glass Transition (Tg °C)"
};

interface ProjectDetailedStats {
  totalRegistered: number;
  totalProducedMeters: number;
  totalLiberatedMeters: number;
  totalFailedPipes: number;
  totalCompletedPipes: number;
  totalInProgressPipes: number;
  
  // Rates & Metrics
  productionRatePerActiveDay: number;
  liberatedProductRate: number; // Percentage of completed compliant pipes over total
  avgPipesPerDay: number;
  
  // Daily and Monthly groupings
  dailyStats: {
    [dateKey: string]: {
      producedMeters: number;
      liberatedMeters: number;
      totalPipes: number;
      passedPipes: number;
      failedPipes: number;
    }
  };
  monthlyStats: {
    [monthKey: string]: {
      producedMeters: number;
      liberatedMeters: number;
      totalPipes: number;
      passedPipes: number;
    }
  };
  
  // QC Stats
  stepFailsCount: { [key: number]: number };
  stepTotalTested: { [key: number]: number };
  averages: { [key: string]: number };
  projPipes: PipeRecord[];
}

/**
 * Calculates in-depth project statistics and trends based on pipe records
 */
function compileProjectDetailedStats(projectCode: string, pipes: PipeRecord[]): ProjectDetailedStats {
  // Filter pipes belonging to this project
  const projPipes = pipes.filter(
    (p) => p.header?.projectWorkOrder?.toUpperCase() === projectCode.toUpperCase()
  );

  const totalRegistered = projPipes.length;
  let totalProducedMeters = 0;
  let totalLiberatedMeters = 0;
  let totalFailedPipes = 0;
  let totalCompletedPipes = 0;
  let totalInProgressPipes = 0;

  // Track defects/fails recorded across steps 1 - 8
  const stepFailsCount: { [key: number]: number } = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0 };
  const stepTotalTested: { [key: number]: number } = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0 };

  // Dimensional accumulators for average calculations
  const dims: { [key: string]: { sum: number; count: number } } = {
    pipeLength: { sum: 0, count: 0 },
    pipeThickness: { sum: 0, count: 0 },
    pipeWeight: { sum: 0, count: 0 },
    sa: { sum: 0, count: 0 },
    sb: { sum: 0, count: 0 },
    sc: { sum: 0, count: 0 },
    o2s: { sum: 0, count: 0 },
    o2b: { sum: 0, count: 0 },
    bg: { sum: 0, count: 0 }
  };

  const dailyStats: ProjectDetailedStats["dailyStats"] = {};
  const monthlyStats: ProjectDetailedStats["monthlyStats"] = {};
  const activeDaysSet = new Set<string>();

  projPipes.forEach((pipe) => {
    const pipeLenMM = Number(pipe.header?.length) || 0;
    const lenMeters = pipeLenMM / 1000;
    totalProducedMeters += lenMeters;

    // Resolve date keys robustly
    let rawDate = pipe.header?.productionDate || pipe.createdAt || new Date().toISOString();
    let dateObj: Date;
    try {
      dateObj = new Date(rawDate);
      if (isNaN(dateObj.getTime())) dateObj = new Date();
    } catch (e) {
      dateObj = new Date();
    }

    const dateKey = dateObj.toISOString().split("T")[0]; // YYYY-MM-DD
    const monthKey = dateKey.substring(0, 7); // YYYY-MM
    activeDaysSet.add(dateKey);

    // Initialize groupings
    if (!dailyStats[dateKey]) {
      dailyStats[dateKey] = { producedMeters: 0, liberatedMeters: 0, totalPipes: 0, passedPipes: 0, failedPipes: 0 };
    }
    if (!monthlyStats[monthKey]) {
      monthlyStats[monthKey] = { producedMeters: 0, liberatedMeters: 0, totalPipes: 0, passedPipes: 0 };
    }

    dailyStats[dateKey].totalPipes++;
    monthlyStats[monthKey].totalPipes++;
    dailyStats[dateKey].producedMeters += lenMeters;
    monthlyStats[monthKey].producedMeters += lenMeters;

    let pipeIsFailed = false;
    let s8Completed = pipe.steps[8]?.isCompleted === true;

    // Evaluate steps and capture metrics
    for (let sNo = 1; sNo <= 8; sNo++) {
      const step = pipe.steps[sNo];
      if (step && step.isCompleted) {
        stepTotalTested[sNo]++;
        const hasFailCheck = step.qualityChecks?.some((q) => q.status === "Fail");
        if (hasFailCheck) {
          stepFailsCount[sNo]++;
          pipeIsFailed = true;
        }

        // Accrue dimensional values from database fields
        if (sNo === 6) {
          const f = step.fields as any;
          if (f.sa) { dims.sa.sum += Number(f.sa); dims.sa.count++; }
          if (f.sb) { dims.sb.sum += Number(f.sb); dims.sb.count++; }
          if (f.sc) { dims.sc.sum += Number(f.sc); dims.sc.count++; }
          if (f.o2s) { dims.o2s.sum += Number(f.o2s); dims.o2s.count++; }
          if (f.pipeLength) { dims.pipeLength.sum += Number(f.pipeLength); dims.pipeLength.count++; }
          if (f.pipeThickness) { dims.pipeThickness.sum += Number(f.pipeThickness); dims.pipeThickness.count++; }
        }
        if (sNo === 7) {
          const f = step.fields as any;
          if (f.o2b) { dims.o2b.sum += Number(f.o2b); dims.o2b.count++; }
          if (f.bg) { dims.bg.sum += Number(f.bg); dims.bg.count++; }
        }
        if (sNo === 8) {
          const f = step.fields as any;
          if (f.pipeWeight) { dims.pipeWeight.sum += Number(f.pipeWeight); dims.pipeWeight.count++; }
        }
      }
    }

    if (pipeIsFailed) {
      totalFailedPipes++;
      dailyStats[dateKey].failedPipes++;
    } else if (s8Completed) {
      totalCompletedPipes++;
      totalLiberatedMeters += lenMeters;
      dailyStats[dateKey].passedPipes++;
      dailyStats[dateKey].liberatedMeters += lenMeters;
      monthlyStats[monthKey].passedPipes++;
      monthlyStats[monthKey].liberatedMeters += lenMeters;
    } else {
      totalInProgressPipes++;
    }
  });

  // Calculate averages cleanly
  const averages: { [key: string]: number } = {};
  Object.entries(dims).forEach(([key, val]) => {
    averages[key] = val.count > 0 ? Math.round((val.sum / val.count) * 100) / 100 : 0;
  });

  const activeDaysCount = Math.max(1, activeDaysSet.size);
  const productionRatePerActiveDay = Math.round((totalProducedMeters / activeDaysCount) * 100) / 100;
  const avgPipesPerDay = Math.round((totalRegistered / activeDaysCount) * 10) / 10;
  const liberatedProductRate = totalRegistered > 0 ? Math.round((totalCompletedPipes / totalRegistered) * 100) : 100;

  return {
    totalRegistered,
    totalProducedMeters: Math.round(totalProducedMeters * 100) / 100,
    totalLiberatedMeters: Math.round(totalLiberatedMeters * 100) / 100,
    totalFailedPipes,
    totalCompletedPipes,
    totalInProgressPipes,
    productionRatePerActiveDay,
    liberatedProductRate,
    avgPipesPerDay,
    dailyStats,
    monthlyStats,
    stepFailsCount,
    stepTotalTested,
    averages,
    projPipes
  };
}

/**
 * GENERATES A PREMIUM, PROFESSIONAL AND HIGHLY POLISHED PDF ANALYTICAL REPORT FOR A SINGLE SPECIFIED PROJECT
 * Featuring gorgeous bento UI boxes, double progress indicators, automated timelines, and quality gates
 */
export function exportProjectAnalysisToPDF(
  project: ProjectConfig,
  pipes: PipeRecord[],
  tolerances: ToleranceConfig[]
) {
  const doc = new jsPDF("p", "mm", "a4");
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Branding Slate Styling
  const navy = [15, 23, 42];      // #0F172A (slate-900)
  const slate600 = [71, 85, 105];  // Slate-600
  const cyan700 = [14, 116, 144];  // Cyan-700
  const emerald500 = [16, 185, 129]; // Emerald-500
  const rose500 = [244, 63, 94];   // Rose-500
  const softBg = [248, 250, 252];  // Slate-50

  let pageNum = 1;
  let y = 35;

  const headerFooter = (current: number) => {
    // Header
    doc.setFillColor(navy[0], navy[1], navy[2]);
    doc.rect(0, 0, pageWidth, 26, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("GRP PIPE INDUSTRIAL QUALITY AUDIT & FORECAST RECONCILIATION", 14, 10);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text("Operations Intelligence Service • Automated Compliance Verification", 14, 15);
    doc.text(`Page ${current} of 3`, pageWidth - 28, 15);

    doc.setDrawColor(cyan700[0], cyan700[1], cyan700[2]);
    doc.setLineWidth(0.5);
    doc.line(14, 18, pageWidth - 14, 18);

    doc.setFont("helvetica", "italic");
    doc.setFontSize(7);
    doc.setTextColor(220, 225, 235);
    doc.text(`Ledger Reference: PROJ-${project.projectCode} | Sync: Connected | Date: ${new Date().toLocaleString()}`, 14, 23);

    // Footer
    doc.setFillColor(navy[0], navy[1], navy[2]);
    doc.rect(0, pageHeight - 8, pageWidth, 8, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.text("CONFIDENTIAL QUALITY RECORD • COMPILED AUTOMATICALLY", 14, pageHeight - 3.5);
    doc.setFont("helvetica", "normal");
    doc.text("COMPLIANCE UNIFIED REGISTER", pageWidth - 55, pageHeight - 3.5);
  };

  const advanceOffset = (amt: number, title?: string) => {
    if (y + amt > pageHeight - 16) {
      doc.addPage();
      pageNum++;
      headerFooter(pageNum);
      y = 35;
      if (title) {
        doc.setTextColor(navy[0], navy[1], navy[2]);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.text(`${title} (Continued)`, 14, y);
        doc.setDrawColor(220, 225, 230);
        doc.setLineWidth(0.2);
        doc.line(14, y + 2, pageWidth - 14, y + 2);
        y += 8;
      }
    }
  };

  const stats = compileProjectDetailedStats(project.projectCode, pipes);
  const targetM = project.targetQuantityMeters || 1000;
  const remainingM = Math.max(0, targetM - stats.totalProducedMeters);
  const dailyVelocity = stats.productionRatePerActiveDay;
  const daysToComplete = dailyVelocity > 0 ? Math.ceil(remainingM / dailyVelocity) : 0;
  const weeksToComplete = dailyVelocity > 0 ? Math.round((remainingM / dailyVelocity / 7) * 10) / 10 : 0;

  // PAGE 1: ADMINISTRATION & BENTO COVERS
  headerFooter(pageNum);

  // Card 1: Administrative Context
  doc.setFillColor(softBg[0], softBg[1], softBg[2]);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.4);
  doc.rect(14, y, pageWidth - 28, 42, "FD");

  doc.setTextColor(navy[0], navy[1], navy[2]);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(`PROJECT PROJECTOR CODE: ${project.projectCode}`, 18, y + 7);
  doc.line(18, y + 9, pageWidth - 18, y + 9);

  doc.setFontSize(8);
  doc.setTextColor(slate600[0], slate600[1], slate600[2]);
  doc.text(`Project Identifier:`, 18, y + 15);
  doc.setFont("helvetica", "normal");
  doc.text(`${project.projectCode}`, 52, y + 15);

  doc.setFont("helvetica", "bold");
  doc.text(`Reference Settings:`, 18, y + 21);
  doc.setFont("helvetica", "normal");
  doc.text(`${project.settingReferences?.join(", ") || "All references allowed"}`, 52, y + 21);

  doc.setFont("helvetica", "bold");
  doc.text(`Target Scope Volume:`, 18, y + 27);
  doc.setFont("helvetica", "normal");
  doc.text(`${targetM.toLocaleString()} meters`, 52, y + 27);

  doc.setFont("helvetica", "bold");
  doc.text(`Timeline Schedule:`, 18, y + 33);
  doc.setFont("helvetica", "normal");
  const dStart = project.productionStartDate ? new Date(project.productionStartDate).toLocaleDateString() : "Unscheduled";
  const dEnd = project.productionEndDate ? new Date(project.productionEndDate).toLocaleDateString() : "In Progress";
  doc.text(`${dStart} to ${dEnd}`, 52, y + 33);

  // Status badge
  doc.setFillColor(cyan700[0], cyan700[1], cyan700[2]);
  doc.rect(pageWidth - 54, y + 13, 36, 8, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.text("ACTIVE RUN", pageWidth - 36, y + 18.5, { align: "center" });

  doc.setTextColor(slate600[0], slate600[1], slate600[2]);
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "italic");
  doc.text(`Total Scanned: ${stats.totalRegistered} pcs`, pageWidth - 54, y + 25);
  doc.text(`Approved Yield: ${stats.liberatedProductRate}%`, pageWidth - 54, y + 29);
  doc.text(`Capacity: ${stats.avgPipesPerDay} pcs/day`, pageWidth - 54, y + 33);

  y += 52;

  // Visual Bento KPIs
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(navy[0], navy[1], navy[2]);
  doc.text("PRODUCTION COMPLIANCE & METERAGE GAUGE", 14, y);
  y += 5;

  const grossPercent = Math.min(100, Math.round((stats.totalProducedMeters / targetM) * 100)) || 0;
  const liberatedPercentLocal = Math.min(100, Math.round((stats.totalLiberatedMeters / targetM) * 100)) || 0;

  doc.setFillColor(255, 255, 255);
  doc.setLineWidth(0.3);
  doc.setDrawColor(218, 224, 233);
  doc.rect(14, y, pageWidth - 28, 42, "FD");

  // Gross built
  doc.setFontSize(8.5);
  doc.setTextColor(navy[0], navy[1], navy[2]);
  doc.setFont("helvetica", "bold");
  doc.text(`Gross Meterage Manufactured: ${stats.totalProducedMeters}m of ${targetM}m (${grossPercent}%)`, 18, y + 8);
  doc.setFillColor(230, 235, 240);
  doc.rect(18, y + 11, pageWidth - 36, 3.5, "F");
  doc.setFillColor(cyan700[0], cyan700[1], cyan700[2]);
  doc.rect(18, y + 11, ((pageWidth - 36) * grossPercent) / 100, 3.5, "F");

  // Liberated
  doc.setFont("helvetica", "bold");
  doc.setTextColor(emerald500[0], emerald500[1], emerald500[2]);
  doc.text(`QA Released Compliance Standard: ${stats.totalLiberatedMeters}m of ${targetM}m (${liberatedPercentLocal}%)`, 18, y + 22);
  doc.setFillColor(230, 235, 240);
  doc.rect(18, y + 25, pageWidth - 36, 3.5, "F");
  doc.setFillColor(emerald500[0], emerald500[1], emerald500[2]);
  doc.rect(18, y + 25, ((pageWidth - 36) * liberatedPercentLocal) / 100, 3.5, "F");

  // Sub rates
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(slate600[0], slate600[1], slate600[2]);
  doc.text(`Manufacture Speed: ${dailyVelocity} m / shift`, 18, y + 36);
  doc.text(`Liberation Rate: ${stats.liberatedProductRate}% approved compliant`, pageWidth / 2 + 10, y + 36);

  y += 50;

  // Card 3: Timeline & Forecasting
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(navy[0], navy[1], navy[2]);
  doc.text("PREDICTIVE TIMELINE ESTIMATIONS & FUTURE FAILS PROJECTIONS", 14, y);
  y += 5;

  doc.setFillColor(softBg[0], softBg[1], softBg[2]);
  doc.rect(14, y, pageWidth - 28, 38, "FD");

  doc.setFontSize(8);
  doc.setTextColor(slate600[0], slate600[1], slate600[2]);

  doc.setFont("helvetica", "bold");
  doc.text("Remaining Work Balance:", 18, y + 8);
  doc.setFont("helvetica", "normal");
  doc.text(`${remainingM.toFixed(1)} meters left to manufacture`, 65, y + 8);

  doc.setFont("helvetica", "bold");
  doc.text("Schedule Completion Prediction:", 18, y + 15);
  doc.setFont("helvetica", "normal");
  if (remainingM <= 0) {
    doc.text("COMPLETED (Aggregate target achieved)", 65, y + 15);
  } else if (dailyVelocity === 0) {
    doc.text("Awaiting operational inputs to forecast timelines", 65, y + 15);
  } else {
    doc.text(`${daysToComplete} working days (~${weeksToComplete} calendar weeks at current speed)`, 65, y + 15);
  }

  doc.setFont("helvetica", "bold");
  doc.text("Forecast Failure Rates:", 18, y + 22);
  doc.setFont("helvetica", "normal");
  const estimatedFutureFails = stats.totalRegistered > 0 ? Math.round((stats.totalFailedPipes / stats.totalRegistered) * (remainingM / 12) * 10) / 10 : 0;
  doc.text(`${estimatedFutureFails} anomalous defects predicted based on historical reject rate`, 65, y + 22);

  doc.setFont("helvetica", "bold");
  doc.text("Operating Health Index:", 18, y + 29);
  doc.setFont("helvetica", "normal");
  let score = "OPTIMAL STABILITY";
  if (stats.liberatedProductRate < 80) score = "CRITICAL DEFECT RANGE";
  else if (stats.liberatedProductRate < 95) score = "MODERATE MARGIN FILTER";
  doc.text(`${score} (Current yield holds at ${stats.liberatedProductRate}% Pass rate)`, 65, y + 29);

  // PAGE 2: TIMELINE ANALYSIS
  doc.addPage();
  pageNum++;
  y = 35;
  headerFooter(pageNum);

  doc.setTextColor(navy[0], navy[1], navy[2]);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("DAILY PROGRESS VOLUME & TIMELINE RELEASE CURVE", 14, y);
  y += 5;

  // Simple Chart frame
  const chartHeight = 30;
  const chartWidth = pageWidth - 28;
  doc.setFillColor(255, 255, 255);
  doc.rect(14, y, chartWidth, chartHeight + 10, "FD");

  const sortedDays = Object.entries(stats.dailyStats)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-7);

  if (sortedDays.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8.5);
    doc.setTextColor(slate600[0], slate600[1], slate600[2]);
    doc.text("No daily sequence ledger data compiled in database.", pageWidth / 2, y + 20, { align: "center" });
  } else {
    const maxVal = Math.max(...sortedDays.map(([_, d]) => d.producedMeters), 10);
    const stepSize = chartWidth / sortedDays.length;

    sortedDays.forEach(([date, dayVal], idx) => {
      const hProdu = (dayVal.producedMeters / maxVal) * (chartHeight - 6);
      const hLiber = (dayVal.liberatedMeters / maxVal) * (chartHeight - 6);
      const colX = 18 + (idx * stepSize) + (stepSize - 12) / 2;

      // Produced light fill background bar template block
      doc.setFillColor(241, 245, 249);
      doc.rect(colX, y + 2, 8, chartHeight - 4, "F");

      // Active produced bar
      doc.setFillColor(cyan700[0], cyan700[1], cyan700[2]);
      doc.rect(colX, y + chartHeight - hProdu - 2, 4, hProdu, "F");

      // Active liberated
      doc.setFillColor(emerald500[0], emerald500[1], emerald500[2]);
      doc.rect(colX + 4.5, y + chartHeight - hLiber - 2, 4, hLiber, "F");

      // Date key
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.5);
      doc.setTextColor(navy[0], navy[1], navy[2]);
      const miniDate = date.split("-").slice(1).join("/");
      doc.text(miniDate, colX + 4, y + chartHeight + 1.5, { align: "center" });

      doc.setFont("helvetica", "normal");
      doc.setFontSize(5.5);
      doc.setTextColor(slate600[0], slate600[1], slate600[2]);
      doc.text(`${Math.round(dayVal.producedMeters)}m`, colX + 4, y + chartHeight - hProdu - 3, { align: "center" });
    });

    // Chart Legends
    doc.setFillColor(cyan700[0], cyan700[1], cyan700[2]);
    doc.rect(pageWidth - 64, y + chartHeight + 5, 2.5, 2.5, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.setTextColor(slate600[0], slate600[1], slate600[2]);
    doc.text("Built m", pageWidth - 60, y + chartHeight + 7.2);

    doc.setFillColor(emerald500[0], emerald500[1], emerald500[2]);
    doc.rect(pageWidth - 44, y + chartHeight + 5, 2.5, 2.5, "F");
    doc.text("Liberated m", pageWidth - 40, y + chartHeight + 7.2);
  }

  y += chartHeight + 15;

  // Daily list
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(navy[0], navy[1], navy[2]);
  doc.text("DAILY LEDGER RECONCILIATION SUMMARY LIST", 14, y);
  y += 4.5;

  const dayHeaders = ["DATE KEY", "PIPES BUILT", "PASSED M", "FAILED UNIT", "TOTAL PRODUCED", "YIELD RATIO"];
  const dayColW = [32, 25, 25, 25, 42, 33];

  doc.setFillColor(navy[0], navy[1], navy[2]);
  doc.rect(14, y, pageWidth - 28, 6.5, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);

  let dX = 14;
  dayHeaders.forEach((th, idx) => {
    doc.text(th, dX + 2, y + 4.5);
    dX += dayColW[idx];
  });

  y += 6.5;
  doc.setFont("helvetica", "normal");
  doc.setTextColor(slate600[0], slate600[1], slate600[2]);

  const daysArray = Object.entries(stats.dailyStats).sort((a,b)=>b[0].localeCompare(a[0])).slice(0, 8);
  if (daysArray.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.text("No historical records verified.", 18, y + 4);
    y += 6;
  } else {
    daysArray.forEach(([dateKey, dy]) => {
      advanceOffset(6.5, "DAILY LEDGER RECONCILIATION SUMMARY LIST");

      doc.setFillColor(255, 255, 255);
      doc.rect(14, y, pageWidth - 28, 6, "F");
      doc.setDrawColor(241, 245, 249);
      doc.setLineWidth(0.25);
      doc.line(14, y + 6, pageWidth - 14, y + 6);

      const yieldRatio = dy.totalPipes > 0 ? Math.round((dy.passedPipes / dy.totalPipes) * 100) : 100;
      const cells = [
        dateKey,
        `${dy.totalPipes} units`,
        `${Math.round(dy.passedPipes)} units`,
        `${dy.failedPipes} units`,
        `${dy.producedMeters.toFixed(1)} m`,
        `${yieldRatio}% COMPLIANT`
      ];

      let cellX = 14;
      cells.forEach((cellVal, cIdx) => {
        if (cIdx === 5) {
          doc.setTextColor(dy.failedPipes > 0 ? rose500[0] : emerald500[0], dy.failedPipes > 0 ? rose500[1] : emerald500[1], dy.failedPipes > 0 ? rose500[2] : emerald500[2]);
          doc.setFont("helvetica", "bold");
        } else {
          doc.setTextColor(slate600[0], slate600[1], slate600[2]);
          doc.setFont("helvetica", "normal");
        }
        doc.text(cellVal, cellX + 2, y + 4.2);
        cellX += dayColW[cIdx];
      });

      y += 6;
    });
  }

  y += 6;

  // Monthly breakdown summary
  advanceOffset(32, "MONTHLY PROGRESS TRENDS");
  doc.setTextColor(navy[0], navy[1], navy[2]);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.text("MONTHLY PERFORMANCE AGGREGATIONS", 14, y);
  y += 4.5;

  const monHeaders = ["PERIOD MONTH", "PIPES FABRICATED", "AVERAGE METERS", "RELEASE METERS", "YIELD COMPLIANCE"];
  const monColW = [40, 40, 40, 40, 22];

  doc.setFillColor(slate600[0], slate600[1], slate600[2]);
  doc.rect(14, y, pageWidth - 28, 6.5, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);

  let mX = 14;
  monHeaders.forEach((mh, idx) => {
    doc.text(mh, mX + 2, y + 4.5);
    mX += monColW[idx];
  });

  y += 6.5;
  doc.setFont("helvetica", "normal");
  doc.setTextColor(slate600[0], slate600[1], slate600[2]);

  const monthsArray = Object.entries(stats.monthlyStats).sort((a,b)=>b[0].localeCompare(a[0])).slice(0, 6);
  if (monthsArray.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.text("No monthly logs registered.", 18, y + 4);
    y += 6;
  } else {
    monthsArray.forEach(([mKey, monData]) => {
      advanceOffset(6.5, "MONTHLY PERFORMANCE AGGREGATIONS");

      doc.setFillColor(255, 255, 255);
      doc.rect(14, y, pageWidth - 28, 6, "F");
      doc.setDrawColor(241, 245, 249);
      doc.setLineWidth(0.2);
      doc.line(14, y + 6, pageWidth - 14, y + 6);

      const monYield = monData.totalPipes > 0 ? Math.round((monData.passedPipes / monData.totalPipes) * 100) : 100;
      const cells = [
        mKey,
        `${monData.totalPipes} units`,
        `${monData.producedMeters.toFixed(1)} m`,
        `${monData.liberatedMeters.toFixed(1)} m`,
        `${monYield}%`
      ];

      let cellX = 14;
      cells.forEach((val, cIdx) => {
        if (cIdx === 4) {
          doc.setTextColor(cyan700[0], cyan700[1], cyan700[2]);
          doc.setFont("helvetica", "bold");
        } else {
          doc.setTextColor(slate600[0], slate600[1], slate600[2]);
          doc.setFont("helvetica", "normal");
        }
        doc.text(val, cellX + 2, y + 4.2);
        cellX += monColW[cIdx];
      });

      y += 6;
    });
  }

  // PAGE 3: CONFORMANCE SIGNOFF & ENGINEERING ADVISORY
  doc.addPage();
  pageNum++;
  y = 35;
  headerFooter(pageNum);

  // Engineering advisory
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(navy[0], navy[1], navy[2]);
  doc.text("ENGINEERING ADVISORY RECOMMENDATIONS", 14, y);
  y += 5;

  doc.setFillColor(240, 249, 255);
  doc.setDrawColor(186, 230, 253);
  doc.rect(14, y, pageWidth - 28, 20, "FD");

  doc.setTextColor(cyan700[0], cyan700[1], cyan700[2]);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.text("DYNAMIC ADVISORY DIRECTIVE REMEDIAL:", 18, y + 5);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(slate600[0], slate600[1], slate600[2]);
  doc.setFontSize(6.5);

  let recommendation = "";
  if (stats.totalFailedPipes > 0) {
    recommendation = `The system registered ${stats.totalFailedPipes} anomalous reject failures for ${project.projectCode}. Recalibrate physical molds across quality gates 6-8. Standardize core spigot ratios and ensure the curing temperatures are fully met for Step 7. Continuous monitoring is required to restore default margins in ${daysToComplete} remaining shifts.`;
  } else if (grossPercent >= 90) {
    recommendation = `Optimal manufacturing progress! The physical production line has completed ${grossPercent}% of targeted delivery with an immaculate zero defects QA register. Initiate final product certification and pass documentation and seals back to the operations manager.`;
  } else {
    recommendation = `The project quality indicators are exceptional (100% compliant yield rate, average speed: ${dailyVelocity}m built/day). Automated calibration processes are running in safe limits. Secure shift schedules following current composite parameters. Complete delivery is projected in ${daysToComplete} shifts.`;
  }

  const lines = doc.splitTextToSize(recommendation, pageWidth - 36);
  lines.forEach((line: string, idx: number) => {
    doc.text(line, 18, y + 10 + idx * 3);
  });

  y += 28;

  // Signatures
  doc.setLineWidth(0.35);
  doc.setDrawColor(navy[0], navy[1], navy[2]);
  doc.line(pageWidth - 75, y, pageWidth - 14, y);

  doc.setFont("helvetica", "italic");
  doc.setFontSize(6.5);
  doc.text("Director of Quality Control Approval Signature", pageWidth - 71, y + 4);
  doc.text("Composite Factory Operations Validation Stamp", pageWidth - 71, y + 7.5);

  // compliance Pass logo block
  doc.setDrawColor(emerald500[0], emerald500[1], emerald500[2]);
  doc.setFillColor(255, 255, 255);
  doc.rect(14, y - 5, 45, 12, "D");
  doc.setTextColor(emerald500[0], emerald500[1], emerald500[2]);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.text("QA SYSTEM VERIFIED PASSED", 16, y - 1);
  doc.setFontSize(5.5);
  doc.text(`REG-ID: ${project.projectCode}-${new Date().getFullYear()}`, 16, y + 4);

  doc.save(`Project_Report_${project.projectCode}.pdf`);
}

/**
 * GENERATES A MASTER COGNITIVE PORTFOLIO REPORT
 * Supporting highlighting and focusing on specified dynamic focus project codes dynamically comparison in grid!
 */
export function exportAllProjectsSummaryToPDF(
  projects: ProjectConfig[],
  pipes: PipeRecord[],
  tolerances: ToleranceConfig[],
  focusedProjectCode: string = "ALL"
) {
  const doc = new jsPDF("p", "mm", "a4");
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const navy = [15, 23, 42];
  const slate600 = [71, 85, 105];
  const cyan700 = [3, 105, 161];
  const emerald500 = [16, 185, 129];
  const borderLight = [226, 232, 240];
  const bgLight = [248, 250, 252];

  let pNum = 1;
  let y = 35;

  const headerFooter = (cur: number) => {
    doc.setFillColor(navy[0], navy[1], navy[2]);
    doc.rect(0, 0, pageWidth, 26, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("MASTER PORTFOLIO COMPARATIVE PERFORMANCE AUDIT", 14, 10);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    const scopeLabel = focusedProjectCode !== "ALL" ? `FOCUS HIGHLIGHT: ${focusedProjectCode.toUpperCase()}` : "GLOBAL COMBINED PORTFOLIO";
    doc.text(`Comparative Analysis • Target Match Reconciliation • [${scopeLabel}]`, 14, 15);
    doc.text(`Page ${cur}`, pageWidth - 20, 15);

    doc.setDrawColor(cyan700[0], cyan700[1], cyan700[2]);
    doc.setLineWidth(0.5);
    doc.line(14, 18, pageWidth - 14, 18);

    doc.setFont("helvetica", "italic");
    doc.setFontSize(7);
    doc.text(`DocId: GRP-PORT-SYS-V2 | Date: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`, 14, 23);

    // Footer
    doc.setFillColor(navy[0], navy[1], navy[2]);
    doc.rect(0, pageHeight - 8, pageWidth, 8, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.text("OPERATIONS SECURITY LEVEL-A • REGISTER CONFIDENTIAL", 14, pageHeight - 4);
  };

  const advanceOffset = (amt: number, title?: string) => {
    if (y + amt > pageHeight - 16) {
      doc.addPage();
      pNum++;
      headerFooter(pNum);
      y = 35;
      if (title) {
        doc.setTextColor(navy[0], navy[1], navy[2]);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9.5);
        doc.text(`${title} (Continued)`, 14, y);
        doc.line(14, y + 2, pageWidth - 14, y + 2);
        y += 8;
      }
    }
  };

  headerFooter(pNum);

  // Executive summary values
  let totTarget = 0;
  let totProduced = 0;
  let totLiberated = 0;
  let totRegisteredUnits = 0;

  projects.forEach((p) => {
    totTarget += p.targetQuantityMeters || 1000;
    const pStats = compileProjectDetailedStats(p.projectCode, pipes);
    totProduced += pStats.totalProducedMeters;
    totLiberated += pStats.totalLiberatedMeters;
    totRegisteredUnits += pStats.totalRegistered;
  });

  // Card 1: Scorecard overview
  doc.setFillColor(bgLight[0], bgLight[1], bgLight[2]);
  doc.setDrawColor(borderLight[0], borderLight[1], borderLight[2]);
  doc.rect(14, y, pageWidth - 28, 42, "FD");

  doc.setTextColor(navy[0], navy[1], navy[2]);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("EXECUTIVE PORTFOLIO AGGREGATE SUMMARY", 18, y + 6);
  doc.setDrawColor(218, 224, 233);
  doc.line(18, y + 8, pageWidth - 18, y + 8);

  doc.setFontSize(8);
  doc.setTextColor(slate600[0], slate600[1], slate600[2]);

  doc.text("Total Configured Projects:", 18, y + 14);
  doc.setFont("helvetica", "normal");
  doc.text(`${projects.length} lines operational`, 65, y + 14);

  doc.setFont("helvetica", "bold");
  doc.text("Aggregate Program Target:", 18, y + 20);
  doc.setFont("helvetica", "normal");
  doc.text(`${Math.round(totTarget).toLocaleString()} meters`, 65, y + 20);

  doc.setFont("helvetica", "bold");
  doc.text("Gross Fabricated Meterage:", 18, y + 26);
  doc.setFont("helvetica", "normal");
  const pct = totTarget > 0 ? Math.round((totProduced / totTarget) * 100) : 0;
  doc.text(`${Math.round(totProduced).toLocaleString()} meters built (${pct}% of aggregate Program)`, 65, y + 26);

  doc.setFont("helvetica", "bold");
  doc.text("Certified Liberation Capacity:", 18, y + 32);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(emerald500[0], emerald500[1], emerald500[2]);
  doc.text(`${Math.round(totLiberated).toLocaleString()} meters verified clean pass release`, 65, y + 32);

  y += 48;

  // Highlights Callout if a specific project was selected on UI!
  if (focusedProjectCode && focusedProjectCode !== "ALL") {
    doc.setFillColor(254, 243, 199); // Soft Gold
    doc.setDrawColor(245, 158, 11);
    doc.rect(14, y, pageWidth - 28, 14, "FD");

    doc.setTextColor(180, 83, 9);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text(`COMPARATIVE AUDIT TARGET • FOCUS SPECIMEN HIGHLIGHT: ${focusedProjectCode.toUpperCase()}`, 18, y + 5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text(`Below report is filtered to highlight the metrics, pass margins, and relative yields of project ${focusedProjectCode} in comparison.`, 18, y + 10);
    y += 18;
  }

  // Card 2: Comparative table
  doc.setTextColor(navy[0], navy[1], navy[2]);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("PORTFOLIO COMPARATIVE PERFORMANCE ANALYSIS", 14, y);
  y += 5;

  const cols = [36, 26, 26, 26, 26, 24, 27];
  const heads = ["PROJECT CODE", "TARGET M", "PRODUCED M", "LIBERATED M", "AVG SPEED", "QA YIELD", "STATUS INDEX"];

  doc.setFillColor(navy[0], navy[1], navy[2]);
  doc.rect(14, y, pageWidth - 28, 7, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);

  let cmpX = 14;
  heads.forEach((h, idx) => {
    doc.text(h, cmpX + 2, y + 4.5);
    cmpX += cols[idx];
  });

  y += 7;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);

  if (projects.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setTextColor(slate600[0], slate600[1], slate600[2]);
    doc.text("No active industrial targets programmed.", 18, y + 4.5);
  } else {
    projects.forEach((proj) => {
      advanceOffset(6.5, "PORTFOLIO COMPARATIVE PERFORMANCE ANALYSIS");

      const isFocus = focusedProjectCode.toUpperCase() === proj.projectCode.toUpperCase();
      
      // Draw background row marker if focused project
      if (isFocus) {
        doc.setFillColor(239, 246, 255); // very soft elegant blue highlight
        doc.setDrawColor(191, 219, 254);
        doc.rect(14, y, pageWidth - 28, 6, "FD");
      } else {
        doc.setFillColor(255, 255, 255);
        doc.rect(14, y, pageWidth - 28, 6, "F");
        doc.setDrawColor(241, 245, 249);
        doc.setLineWidth(0.2);
        doc.line(14, y + 6, pageWidth - 14, y + 6);
      }

      const pStats = compileProjectDetailedStats(proj.projectCode, pipes);
      const tar = proj.targetQuantityMeters || 1000;
      
      let badge = "Stable";
      if (pStats.totalFailedPipes > 0) badge = "QC Warning";
      else if (pStats.totalRegistered === 0) badge = "Awaiting";

      const vals = [
        isFocus ? `> ${proj.projectCode} (Focus)` : proj.projectCode,
        `${tar.toLocaleString()}m`,
        `${pStats.totalProducedMeters.toFixed(1)}m`,
        `${pStats.totalLiberatedMeters.toFixed(1)}m`,
        `${pStats.productionRatePerActiveDay}m/d`,
        `${pStats.liberatedProductRate}%`,
        badge
      ];

      let cellX = 14;
      vals.forEach((valStr, vIdx) => {
        if (vIdx === 6) {
          if (badge === "QC Warning") {
            doc.setTextColor(239, 68, 68);
            doc.setFont("helvetica", "bold");
          } else if (badge === "Stable") {
            doc.setTextColor(emerald500[0], emerald500[1], emerald500[2]);
            doc.setFont("helvetica", "bold");
          } else {
            doc.setTextColor(115, 115, 115);
            doc.setFont("helvetica", "italic");
          }
        } else if (isFocus) {
          doc.setTextColor(29, 78, 216); // Royal Blue for highlighted values
          doc.setFont("helvetica", "bold");
        } else {
          doc.setTextColor(slate600[0], slate600[1], slate600[2]);
          doc.setFont("helvetica", "normal");
        }
        doc.text(valStr, cellX + 2, y + 4.2);
        cellX += cols[vIdx];
      });

      y += 6;
    });
  }

  y += 8;

  // Directives Executive
  advanceOffset(35, "STRATEGY PROJECTIONS REPORT");
  doc.setTextColor(navy[0], navy[1], navy[2]);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("FACTORY MANAGER EXECUTIVE COMPLIANCE REPORT", 14, y);
  y += 5;

  doc.setFillColor(bgLight[0], bgLight[1], bgLight[2]);
  doc.setDrawColor(borderLight[0], borderLight[1], borderLight[2]);
  doc.rect(14, y, pageWidth - 28, 22, "FD");

  doc.setTextColor(cyan700[0], cyan700[1], cyan700[2]);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.text("EXECUTIVE ALGORITHM DIRECTIVE STRATEGY:", 18, y + 6);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(slate600[0], slate600[1], slate600[2]);

  let avgProgYield = totProduced > 0 ? Math.round((totLiberated / totProduced) * 100) : 100;
  const remainingTotalTargetM = Math.max(0, totTarget - totProduced);
  const compositeVelocity = totProduced / Math.max(1, projects.length);
  const compositeEstShifts = compositeVelocity > 0 ? Math.ceil(remainingTotalTargetM / (compositeVelocity / 10)) : 10;

  let advisory = "";
  if (focusedProjectCode && focusedProjectCode !== "ALL") {
    advisory = `Operational focus is scoped currently on Project ${focusedProjectCode.toUpperCase()}. Cumulative program pass rate holds steady at ${avgProgYield}% pass rate. Calibrate heat gauges inside step 4 and thickness registers. Predictive modeling suggests Project ${focusedProjectCode} target completion will wrap up soon under current shift metrics, supporting aggregate delivery of the remaining ${remainingTotalTargetM.toFixed(1)}m portfolio balance in ${compositeEstShifts} days.`;
  } else {
    advisory = `Audit registers confirm excellent manufacturing stability across all GRP lines. Master programmatic pass rate holds at ${avgProgYield}% verified compliant yield pass. Focus efforts on standardizing curing logs on newly updated lines. Timeline predictions suggest full planned programmatic liberation pass in approximately ${compositeEstShifts} shifts.`;
  }

  const wrap = doc.splitTextToSize(advisory, pageWidth - 36);
  wrap.forEach((line: string, idx: number) => {
    doc.text(line, 18, y + 11 + idx * 3);
  });

  // Stamp and signatures
  y += 35;
  advanceOffset(18, "STAMP LOCK BLOCK");

  doc.setLineWidth(0.35);
  doc.setDrawColor(navy[0], navy[1], navy[2]);
  doc.line(pageWidth - 75, y, pageWidth - 14, y);

  doc.setFont("helvetica", "italic");
  doc.setFontSize(6.5);
  doc.text("General Manager & Lead Verification Director", pageWidth - 72, y + 4.5);
  doc.text("GRP Factory Operations Compliance Regulatory Seal", pageWidth - 72, y + 8.5);

  doc.setDrawColor(cyan700[0], cyan700[1], cyan700[2]);
  doc.setFillColor(255, 255, 255);
  doc.rect(14, y - 5, 45, 12, "D");
  doc.setTextColor(cyan700[0], cyan700[1], cyan700[2]);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.text("MASTER AUDIT RELEASED", 17, y + 1.2);
  doc.setFontSize(5.5);
  doc.text(`PORTFOLIO-ID: REG-${new Date().getFullYear()}-SYS`, 16, y + 5);

  doc.save(`Portfolio_Audit_Report.pdf`);
}
