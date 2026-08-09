import { jsPDF } from "jspdf";
import { PipeRecord } from "../types";

interface OperatorStats {
  name: string;
  role: string;
  daily: {
    created: number;
    controlled: number;
    liberated: number;
    ncrs: number;
    failedRemarks: number;
  };
  weekly: {
    created: number;
    controlled: number;
    liberated: number;
    ncrs: number;
    failedRemarks: number;
  };
  monthly: {
    created: number;
    controlled: number;
    liberated: number;
    ncrs: number;
    failedRemarks: number;
  };
  remarks: Array<{
    horizon: string;
    pipeId: string;
    stepNo: number;
    stepName: string;
    reason: string;
    date: string;
  }>;
}

const STEP_TITLES: { [key: number]: string } = {
  1: "Mold Prep & Release Agent",
  2: "Liner Construction",
  3: "Structural Filament Winding",
  4: "Cure Cycle & Heat Control",
  5: "Structural Core Demolding",
  6: "Spigot Calibration",
  7: "Bell Joint Milling",
  8: "Final Inspection Clearance"
};

// Main function to generate the PDF Report
export function generateOperatorShiftReport(
  pipeRecords: PipeRecord[],
  currentUsername: string,
  allUsers: any[] = [],
  filters?: {
    day?: string;    // "All" or "Monday", "Tuesday", etc.
    week?: string;   // "All" or "Week 1", "Week 2", "Week 3", "Week 4"
    month?: string;  // "All" or "January", "February", etc.
  }
) {
  const doc = new jsPDF("p", "mm", "a4");
  const todayStr = new Date().toISOString().split("T")[0];

  const dayFilter = filters?.day || "All";
  const weekFilter = filters?.week || "All";
  const monthFilter = filters?.month || "All";

  // Helper date matching checker
  const matchesDateFilters = (dateValue: Date | string | undefined): boolean => {
    if (!dateValue) return false;
    const d = dateValue instanceof Date ? dateValue : new Date(dateValue);
    if (isNaN(d.getTime())) return false;

    // Month filter check
    if (monthFilter !== "All") {
      const months = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
      ];
      const monthName = months[d.getMonth()];
      if (monthName !== monthFilter) return false;
    }

    // Week filter check (Week 1: days 1-7, Week 2: days 8-14, Week 3: days 15-21, Week 4: days 22-31)
    if (weekFilter !== "All") {
      const dayOfMonth = d.getDate();
      let computedWeek = "Week 4";
      if (dayOfMonth <= 7) computedWeek = "Week 1";
      else if (dayOfMonth <= 14) computedWeek = "Week 2";
      else if (dayOfMonth <= 21) computedWeek = "Week 3";

      if (computedWeek !== weekFilter) return false;
    }

    // Day filter check
    if (dayFilter !== "All") {
      const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const dayName = days[d.getDay()];
      if (dayName !== dayFilter) return false;
    }

    return true;
  };

  // 1. Build list of unique GRP operators (Real users only)
  const operatorsListSet = new Set<string>();

  // Incorporate users registered dynamically in the app (database)
  if (allUsers && allUsers.length > 0) {
    allUsers.forEach((u) => {
      if (u.username && u.username.trim() !== "") {
        const nameUpper = u.username.toUpperCase().trim();
        // Skip administrative placeholders or system tags
        if (nameUpper !== "ADMIN" && nameUpper !== "SYSTEM" && nameUpper !== "OPERATOR" && nameUpper !== "SYSTEM_TOLERANCES") {
          operatorsListSet.add(nameUpper);
        }
      }
    });
  }

  // Incorporate operators that actually saved steps or created pipes in the active database
  if (pipeRecords && pipeRecords.length > 0) {
    pipeRecords.forEach((pipe) => {
      if (pipe.operatorUsername) {
        const opUpper = pipe.operatorUsername.toUpperCase().trim();
        if (opUpper !== "ADMIN" && opUpper !== "SYSTEM" && opUpper !== "OPERATOR" && opUpper !== "SYSTEM_TOLERANCES") {
          operatorsListSet.add(opUpper);
        }
      }
      if (pipe.steps) {
        Object.keys(pipe.steps).forEach((stepKey) => {
          const step = pipe.steps[Number(stepKey)];
          if (step && step.savedBy) {
            const stepOpUpper = step.savedBy.toUpperCase().trim();
            if (stepOpUpper !== "ADMIN" && stepOpUpper !== "SYSTEM" && stepOpUpper !== "OPERATOR" && stepOpUpper !== "SYSTEM_TOLERANCES") {
              operatorsListSet.add(stepOpUpper);
            }
          }
        });
      }
    });
  }

  // Include current active inspector
  if (currentUsername) {
    const currentUpper = currentUsername.toUpperCase().trim();
    if (currentUpper !== "ADMIN" && currentUpper !== "SYSTEM" && currentUpper !== "OPERATOR" && currentUpper !== "SYSTEM_TOLERANCES") {
      operatorsListSet.add(currentUpper);
    }
  }

  const uniqueOperators = Array.from(operatorsListSet);

  // 2. Compute dynamic stats solely using real, filtered database records
  const operatorsData: OperatorStats[] = uniqueOperators.map((opName) => {
    const formattedName = opName.toUpperCase();
    
    // Default roles lookup
    let role = "Shift Operator";
    const foundUser = allUsers.find(u => u.username?.toUpperCase() === formattedName);
    if (foundUser) {
      role = foundUser.role === "admin" ? "Quality Director (Admin)" : "Shift Operator";
    } else if (formattedName === currentUsername.toUpperCase()) {
      role = "Quality Inspector";
    } else if (formattedName === "KHELIFI RIAD") {
      role = "GRP Master Weaver";
    } else if (formattedName === "BELHADJ AMINE") {
      role = "Cure Process Auditor";
    } else if (formattedName === "SAIDI SAMIR") {
      role = "Milling & Spigot calibrator";
    } else if (formattedName === "HERIZI ABDESSAMED") {
      role = "Final QC inspector";
    }

    const stats: OperatorStats = {
      name: formattedName,
      role,
      daily: { created: 0, controlled: 0, liberated: 0, ncrs: 0, failedRemarks: 0 },
      weekly: { created: 0, controlled: 0, liberated: 0, ncrs: 0, failedRemarks: 0 },
      monthly: { created: 0, controlled: 0, liberated: 0, ncrs: 0, failedRemarks: 0 },
      remarks: []
    };

    // Process Dynamic Live PipeRecords from the Application
    if (pipeRecords && pipeRecords.length > 0) {
      pipeRecords.forEach((pipe) => {
        if (!pipe.createdAt) return;

        // Dynamic date checks
        const pipeCreatedDate = new Date(pipe.createdAt);
        if (!matchesDateFilters(pipeCreatedDate)) return;

        const createdAtDateStr = pipe.createdAt.split("T")[0];
        const isCreatedToday = createdAtDateStr === todayStr;
        
        const diffMs = Math.abs(Date.now() - pipeCreatedDate.getTime());
        const isCreatedWeekly = diffMs <= 7 * 24 * 60 * 60 * 1000;
        const isCreatedMonthly = diffMs <= 30 * 24 * 60 * 60 * 1000;

        // Dynamic Pipe Creation Metric
        if (pipe.operatorUsername && pipe.operatorUsername.toUpperCase() === formattedName) {
          if (isCreatedToday) stats.daily.created++;
          if (isCreatedWeekly) stats.weekly.created++;
          if (isCreatedMonthly) stats.monthly.created++;
        }

        if (!pipe.steps) return;

        // Dynamic Pipe Liberation Metric (Step 8 completed by this operator, with zero pipe-wide NCRs)
        const step8 = pipe.steps[8] || pipe.steps["8"];
        if (step8 && step8.isCompleted && step8.savedBy && step8.savedBy.toUpperCase() === formattedName) {
          let hasAnyFailOnPipe = false;
          for (let s = 1; s <= 8; s++) {
            const stepRec = pipe.steps[s] || pipe.steps[String(s)];
            if (stepRec) {
              if (stepRec.isNonConform) hasAnyFailOnPipe = true;
              const hasFChecks = stepRec.qualityChecks?.some((qc: any) => qc.status === "Fail");
              if (hasFChecks) hasAnyFailOnPipe = true;
            }
          }

          if (!hasAnyFailOnPipe) {
            const step8Date = step8.savedAt ? new Date(step8.savedAt) : new Date();
            if (matchesDateFilters(step8Date)) {
              const step8DateStr = step8.savedAt ? step8.savedAt.split("T")[0] : todayStr;
              const isLibToday = step8DateStr === todayStr;

              const libDiffMs = Math.abs(Date.now() - step8Date.getTime());
              const isLibWeekly = libDiffMs <= 7 * 24 * 60 * 60 * 1000;
              const isLibMonthly = libDiffMs <= 30 * 24 * 60 * 60 * 1000;

              if (isLibToday) stats.daily.liberated++;
              if (isLibWeekly) stats.weekly.liberated++;
              if (isLibMonthly) stats.monthly.liberated++;
            }
          }
        }

        // Dynamic Steps Controlled, Non-Conformities & Failed Checks with Remarks
        Object.keys(pipe.steps).forEach((stepKey) => {
          const stepNum = Number(stepKey);
          const step = pipe.steps[stepNum];
          if (!step || !step.isCompleted || !step.savedBy || step.savedBy.toUpperCase() !== formattedName) return;

          const stepDate = step.savedAt ? new Date(step.savedAt) : new Date();
          if (!matchesDateFilters(stepDate)) return;

          const stepDateStr = step.savedAt ? step.savedAt.split("T")[0] : todayStr;
          const isStepToday = stepDateStr === todayStr;

          const stepDiffMs = Math.abs(Date.now() - stepDate.getTime());
          const isStepWeekly = stepDiffMs <= 7 * 24 * 60 * 60 * 1000;
          const isStepMonthly = stepDiffMs <= 30 * 24 * 60 * 60 * 1000;

          // Controlled count
          if (isStepToday) stats.daily.controlled++;
          if (isStepWeekly) stats.weekly.controlled++;
          if (isStepMonthly) stats.monthly.controlled++;

          // Non-Conformities Found
          if (step.isNonConform) {
            if (isStepToday) stats.daily.ncrs++;
            if (isStepWeekly) stats.weekly.ncrs++;
            if (isStepMonthly) stats.monthly.ncrs++;
          }

          // Failed check observations
          const hasFailedCheck = step.qualityChecks?.some((qc: any) => qc.status === "Fail");
          if (hasFailedCheck) {
            const observations = step.additionalObs || step.ncrReason || "";
            if (observations.trim().length > 0) {
              if (isStepToday) stats.daily.failedRemarks++;
              if (isStepWeekly) stats.weekly.failedRemarks++;
              if (isStepMonthly) stats.monthly.failedRemarks++;

              const horizonStr = isStepToday ? "Daily" : isStepWeekly ? "Weekly" : "Monthly";
              stats.remarks.push({
                horizon: horizonStr,
                pipeId: pipe.pipeId,
                stepNo: stepNum,
                stepName: STEP_TITLES[stepNum] || `Step ${stepNum}`,
                reason: observations,
                date: stepDate.toLocaleDateString()
              });
            }
          }
        });
      });
    }

    return stats;
  });

  // 3. Draw Document
  const pageWidth = 210;
  const pageHeight = 297;
  let y = 14;

  const navy = [17, 24, 39]; // #111827
  const indigo = [79, 70, 229]; // #4F46E5
  const emerald = [16, 185, 129]; // #10B981
  const rose = [244, 63, 94]; // #F43F5E
  const grayLight = [248, 250, 252]; // #F8FAFC
  const slate600 = [71, 85, 105]; // #475569

  // Helper: Page Setup
  const setupPageHeader = (pNum: number) => {
    // Top border colored line
    doc.setFillColor(indigo[0], indigo[1], indigo[2]);
    doc.rect(15, 10, pageWidth - 30, 2.5, "F");

    // Header title block
    doc.setFillColor(navy[0], navy[1], navy[2]);
    doc.rect(15, 12.5, pageWidth - 30, 24, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("AWWA C950 / GRP QUALITY COMPLIANCE GENERAL LEDGER", 20, 21.5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(200, 205, 215);
    doc.text("OPERATORS PRODUCTION HISTORY & INTERACTIVE ACTIONS LOGS", 20, 28);

    // Decorative right stamp info
    doc.setFillColor(emerald[0], emerald[1], emerald[2]);
    doc.rect(pageWidth - 45, 12.5, 30, 4, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "bold");
    doc.text("VERIFIED COMPLIANT", pageWidth - 30, 15.5, { align: "center" });

    // Date & Page details
    doc.setTextColor(slate600[0], slate600[1], slate600[2]);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.text(`Generated Date: ${new Date().toLocaleString()}`, 15, 41.5);
    doc.text(`Page ${pNum}`, pageWidth - 15, 41.5, { align: "right" });

    // Line separator
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.line(15, 44, pageWidth - 15, 44);
  };

  let pageNum = 1;
  setupPageHeader(pageNum);
  y = 50;

  // Executive summary
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(navy[0], navy[1], navy[2]);
  doc.text("EXECUTIVE AUDIT SUMMARY", 15, y);
  y += 5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);

  const filtersString = `Date Range Scope Filters Applied — Month: ${monthFilter} | Week: ${weekFilter} | Day: ${dayFilter}`;
  const summaryText = 
    `This programmatic documentation compiles the GRP Pipe winding performance trackers, operator controls, and non-conformities ledger. Only active registered system personnel are included, tracking real floor actions with complete transparency. \n\n${filtersString}.`;
  
  const splitText = doc.splitTextToSize(summaryText, pageWidth - 30);
  doc.text(splitText, 15, y);
  y += splitText.length * 4 + 6;

  // Loop through each operator and draw their record card
  operatorsData.forEach((op, index) => {
    // Check if we need to add a page before starting the card
    if (y > pageHeight - 85) {
      doc.addPage();
      pageNum++;
      setupPageHeader(pageNum);
      y = 50;
    }

    // Section header for this Operator
    doc.setFillColor(grayLight[0], grayLight[1], grayLight[2]);
    doc.rect(15, y, pageWidth - 30, 10, "F");
    doc.setDrawColor(218, 224, 233);
    doc.rect(15, y, pageWidth - 30, 10, "D");
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(indigo[0], indigo[1], indigo[2]);
    doc.text(`${index + 1}. OPERATOR: ${op.name}`, 20, y + 6.5);
    
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7);
    doc.setTextColor(slate600[0], slate600[1], slate600[2]);
    doc.text(`Designated Role: ${op.role}`, pageWidth - 20, y + 6.5, { align: "right" });
    y += 13;

    // Draw table grid for metrics across Horizons
    const headers = ["HORIZON TIMER", "PIPES CREATED", "STEPS CONTROLLED", "PIPES LIBERATED", "NON-CONFORMITIES", "FAILURES W/ REMARK"];
    const colWidths = [35, 29, 29, 29, 29, 29];
    const startX = 15;

    // Header row
    doc.setFillColor(31, 41, 55);
    doc.rect(startX, y, pageWidth - 30, 6, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);
    
    let xOffset = startX;
    headers.forEach((h, i) => {
      doc.text(h, xOffset + colWidths[i] / 2, y + 4.2, { align: "center" });
      xOffset += colWidths[i];
    });
    y += 6;

    // Rows values
    const horizons = [
      { label: "Daily Shift (Today)", data: op.daily },
      { label: "Weekly Horizon", data: op.weekly },
      { label: "Monthly Horizon", data: op.monthly }
    ];

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(51, 65, 85);

    horizons.forEach((hor, horIdx) => {
      // Alternating backgrounds
      if (horIdx % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(startX, y, pageWidth - 30, 6.5, "F");
      }
      doc.setDrawColor(226, 232, 240);
      doc.rect(startX, y, pageWidth - 30, 6.5, "D");

      // Set bold for label
      doc.setFont("helvetica", "bold");
      doc.text(hor.label, startX + 2, y + 4.5);

      doc.setFont("helvetica", "normal");
      doc.text(String(hor.data.created), startX + colWidths[0] + colWidths[1]/2, y + 4.5, { align: "center" });
      doc.text(String(hor.data.controlled), startX + colWidths[0] + colWidths[1] + colWidths[2]/2, y + 4.5, { align: "center" });
      
      // Highlight liberated in emerald green if > 0
      if (hor.data.liberated > 0) {
        doc.setFont("helvetica", "bold");
        doc.setTextColor(emerald[0], emerald[1], emerald[2]);
      }
      doc.text(String(hor.data.liberated), startX + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3]/2, y + 4.5, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.setTextColor(51, 65, 85);

      // Highlight NCR in rose red if > 0
      if (hor.data.ncrs > 0) {
        doc.setFont("helvetica", "bold");
        doc.setTextColor(rose[0], rose[1], rose[2]);
      }
      doc.text(String(hor.data.ncrs), startX + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4]/2, y + 4.5, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.setTextColor(51, 65, 85);

      doc.text(String(hor.data.failedRemarks), startX + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4] + colWidths[5]/2, y + 4.5, { align: "center" });

      y += 6.5;
    });

    y += 2.5;

    // Draw remarks list if any
    if (op.remarks && op.remarks.length > 0) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(navy[0], navy[1], navy[2]);
      doc.text(`QUALITY CHECK FAILURE REMARKS FOR ${op.name}:`, 16, y + 2.5);
      y += 4.5;

      op.remarks.forEach((rem) => {
        // Estimate remark line space
        const textToDraw = `[${rem.horizon} • ${rem.date}] Pipe ${rem.pipeId} - ${rem.stepName}: "${rem.reason}"`;
        const lines = doc.splitTextToSize(textToDraw, pageWidth - 36);

        if (y + lines.length * 3.5 > pageHeight - 20) {
          doc.addPage();
          pageNum++;
          setupPageHeader(pageNum);
          y = 50;
          doc.setFont("helvetica", "bold");
          doc.setFontSize(7.5);
          doc.setTextColor(navy[0], navy[1], navy[2]);
          doc.text(`REMARKS FOR ${op.name} (CONTINUED):`, 16, y + 2.5);
          y += 4.5;
        }

        doc.setFillColor(254, 242, 242); // Soft pink bg
        doc.rect(17, y, pageWidth - 34, lines.length * 3.8 + 2.5, "F");
        doc.setDrawColor(254, 226, 226);
        doc.rect(17, y, pageWidth - 34, lines.length * 3.8 + 2.5, "D");

        // Small indicator red bar
        doc.setFillColor(rose[0], rose[1], rose[2]);
        doc.rect(17, y, 1.2, lines.length * 3.8 + 2.5, "F");

        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.0);
        doc.setTextColor(153, 27, 27); // Dark red
        doc.text(lines, 20, y + 3.2);

        y += lines.length * 3.8 + 4.2;
      });
    } else {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(7);
      doc.setTextColor(slate600[0], slate600[1], slate600[2]);
      doc.text("No active quality infractions or failure remarks recorded on this operator.", 17, y + 2.5);
      y += 6.5;
    }

    y += 5.5; // Spacer between operator cards
  });

  // Stamp / Signatures block
  if (y > pageHeight - 55) {
    doc.addPage();
    pageNum++;
    setupPageHeader(pageNum);
    y = 50;
  }

  y += 6;
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.line(15, y, pageWidth - 15, y);
  y += 7;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(navy[0], navy[1], navy[2]);
  doc.text("REGULATORY AUTHENTICATION STAMP", 15, y);
  doc.text("AUTHORIZED AUDITOR SIGNATURE", pageWidth - 15, y, { align: "right" });
  y += 5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text("AWWA C950 GRP Quality Auditor Seal", 15, y);
  doc.text("Plant Quality Manager Validation Sign-off", pageWidth - 15, y, { align: "right" });

  // Draw sign lines
  y += 18;
  doc.setDrawColor(203, 213, 225);
  doc.line(15, y, 65, y);
  doc.line(pageWidth - 65, y, pageWidth - 15, y);

  doc.setFontSize(6.5);
  doc.text("System timestamp automated signature", 15, y + 4.5);
  doc.text("Manual verification ink stamp space", pageWidth - 15, y + 4.5, { align: "right" });

  // Download PDF
  const reportName = `Quality_Report_${monthFilter.replace(/\s+/g, "_")}_${weekFilter.replace(/\s+/g, "_")}_${dayFilter}.pdf`;
  doc.save(reportName);
}
