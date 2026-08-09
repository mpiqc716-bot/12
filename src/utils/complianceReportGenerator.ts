import { jsPDF } from "jspdf";
import { PipeRecord, StepRecord } from "../types";

const STEP_NAMES: Record<number, string> = {
  1: "Mandrel Preparation & Waxing",
  2: "Winding & Glass Fiber Layup",
  3: "Curing & Heating Oven",
  4: "Demolding & Mandrel Extraction",
  5: "Pipe Cutting & Chamfering",
  6: "Hydrostatic Pressure Testing",
  7: "Calibration & Dimensional Audit",
  8: "Final Visual & Code Clearance"
};

/**
 * Checks if a step was saved or modified within the selected period.
 */
function isStepInPeriod(
  step: StepRecord,
  period: "daily" | "weekly" | "monthly",
  targetDate: Date,
  pipeCreatedAt: string
): boolean {
  const savedDateStr = step.savedAt || pipeCreatedAt;
  const savedDate = new Date(savedDateStr);
  if (isDateInPeriod(savedDate, period, targetDate)) {
    return true;
  }

  if (step.modifications && step.modifications.length > 0) {
    for (const mod of step.modifications) {
      if (mod.at) {
        const modDate = new Date(mod.at);
        if (isDateInPeriod(modDate, period, targetDate)) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Checks if a given date falls within the selected period based on the target reference date.
 */
function isDateInPeriod(
  date: Date,
  period: "daily" | "weekly" | "monthly",
  targetDate: Date
): boolean {
  if (isNaN(date.getTime()) || isNaN(targetDate.getTime())) return false;

  if (period === "daily") {
    return (
      date.getFullYear() === targetDate.getFullYear() &&
      date.getMonth() === targetDate.getMonth() &&
      date.getDate() === targetDate.getDate()
    );
  }

  if (period === "weekly") {
    const sunday = new Date(targetDate);
    sunday.setDate(targetDate.getDate() - targetDate.getDay());
    sunday.setHours(0, 0, 0, 0);

    const saturday = new Date(sunday);
    saturday.setDate(sunday.getDate() + 6);
    saturday.setHours(23, 59, 59, 999);

    return date >= sunday && date <= saturday;
  }

  if (period === "monthly") {
    return (
      date.getFullYear() === targetDate.getFullYear() &&
      date.getMonth() === targetDate.getMonth()
    );
  }

  return false;
}

/**
 * Get the display range label for the selected period.
 */
function getPeriodRangeLabel(
  period: "daily" | "weekly" | "monthly",
  selectedDateStr: string
): string {
  const targetDate = new Date(selectedDateStr);
  if (isNaN(targetDate.getTime())) {
    return "Invalid Date Selection";
  }

  if (period === "daily") {
    return `Daily Report: ${targetDate.toLocaleDateString(undefined, { dateStyle: "long" })}`;
  } else if (period === "weekly") {
    const dayOfWeek = targetDate.getDay();
    const sunday = new Date(targetDate);
    sunday.setDate(targetDate.getDate() - dayOfWeek);
    sunday.setHours(0, 0, 0, 0);

    const saturday = new Date(sunday);
    saturday.setDate(sunday.getDate() + 6);
    saturday.setHours(23, 59, 59, 999);

    const sunStr = sunday.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    const satStr = saturday.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    return `Weekly Report: ${sunStr} — ${satStr}`;
  } else if (period === "monthly") {
    const monthLabel = targetDate.toLocaleDateString(undefined, { month: "long", year: "numeric" });
    return `Monthly Report: ${monthLabel}`;
  }

  return "";
}

/**
 * Main function to generate the Daily/Weekly/Monthly PDF exception report.
 */
export function generateFailedNcrReportPDF(
  records: PipeRecord[],
  period: "daily" | "weekly" | "monthly",
  selectedDateStr: string
) {
  const targetDate = new Date(selectedDateStr);
  const rangeLabel = getPeriodRangeLabel(period, selectedDateStr);

  if (isNaN(targetDate.getTime())) {
    return;
  }

  // A pipe was evaluated in this period if it has at least one step with a date falling within this period
  const evaluatedPipes = records.filter((p) => {
    const pCreatedDate = new Date(p.createdAt);
    if (isDateInPeriod(pCreatedDate, period, targetDate)) {
      return true;
    }
    return Object.values(p.steps).some((step) => {
      return isStepInPeriod(step, period, targetDate, p.createdAt);
    });
  });

  // Collect all pipes and their specific steps with issues falling within the selected period
  const exceptionPipes: PipeRecord[] = [];
  const pipeToMatchingIssues = new Map<string, { stepNo: number; name: string; step: any }[]>();

  records.forEach((p) => {
    const stepsWithIssues: { stepNo: number; name: string; step: any }[] = [];
    
    for (let s = 1; s <= 8; s++) {
      const step = p.steps[s];
      if (step) {
        const hasFail = step.qualityChecks?.some((q: any) => q.status === "Fail");
        const isNcr = !!step.isNonConform;
        
        if (hasFail || isNcr) {
          if (isStepInPeriod(step, period, targetDate, p.createdAt)) {
            stepsWithIssues.push({
              stepNo: s,
              name: STEP_NAMES[s] || `Step ${s}`,
              step
            });
          }
        }
      }
    }
    
    if (stepsWithIssues.length > 0) {
      exceptionPipes.push(p);
      pipeToMatchingIssues.set(p.pipeId, stepsWithIssues);
    }
  });

  const doc = new jsPDF("p", "mm", "a4");
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Color Palette Constants
  const navy = [15, 23, 42];        // #0F172A Deep Slate Navy
  const slate600 = [71, 85, 105];    // Slate grey
  const crimson700 = [190, 24, 74];  // Rose/Red Accent for exceptions
  const crimson50 = [255, 241, 242];  // Very soft pink background for alert blocks
  const softBg = [248, 250, 252];    // Off-white canvas
  const textDark = [15, 23, 42];     // Dark grey
  const lightGrey = [226, 232, 240];  // Slate-200 border line

  let pageNum = 1;
  let y = 35; // Start drawing below the header band

  // Helper to draw consistent, premium Header and Footer
  const drawHeaderFooter = (current: number) => {
    // --- HEADER BAND ---
    doc.setFillColor(navy[0], navy[1], navy[2]);
    doc.rect(0, 0, pageWidth, 28, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.text("MAGHREB PIPE QUALITY & COMPLIANCE OPERATIONS LEDGER", 14, 9);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(203, 213, 225); // Slate 300
    doc.text("Automated Quality Exception Register • Active Assembly Incident Logs", 14, 14);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(244, 63, 94); // Light rose accent
    doc.text(`EXCEPTION LOG TYPE: ${period.toUpperCase()}`, 14, 19);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.text(`Page ${current}`, pageWidth - 25, 12);

    // Decorative division line
    doc.setDrawColor(244, 63, 94); // Crimson separator
    doc.setLineWidth(0.4);
    doc.line(14, 22, pageWidth - 14, 22);

    doc.setFont("helvetica", "italic");
    doc.setFontSize(7);
    doc.setTextColor(203, 213, 225);
    doc.text(
      `Date Period: ${rangeLabel} | Compiled: ${new Date().toLocaleString()} | Security Level: Internal Quality Control`,
      14,
      26
    );

    // --- FOOTER BAND ---
    doc.setFillColor(navy[0], navy[1], navy[2]);
    doc.rect(0, pageHeight - 10, pageWidth, 10, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.text("CONFIDENTIAL QA EXCEPTION DOSSIER • COMPILED AUTOMATICALLY", 14, pageHeight - 4);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(203, 213, 225);
    doc.text("GRP FABRICATED INCIDENT JOURNAL", pageWidth - 65, pageHeight - 4);
  };

  // Helper to safely advance page coordinate
  const advanceOffset = (amt: number, sectionTitle?: string) => {
    if (y + amt > pageHeight - 15) {
      doc.addPage();
      pageNum++;
      drawHeaderFooter(pageNum);
      y = 35; // Start coordinates on new page

      if (sectionTitle) {
        doc.setTextColor(navy[0], navy[1], navy[2]);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.text(`${sectionTitle} (Continued)`, 14, y);
        doc.setDrawColor(lightGrey[0], lightGrey[1], lightGrey[2]);
        doc.setLineWidth(0.25);
        doc.line(14, y + 2, pageWidth - 14, y + 2);
        y += 8;
      }
    }
  };

  // Render Page 1 Header and Footer
  drawHeaderFooter(pageNum);

  // --- REPORT TITLE PANEL ---
  doc.setFillColor(softBg[0], softBg[1], softBg[2]);
  doc.setDrawColor(lightGrey[0], lightGrey[1], lightGrey[2]);
  doc.setLineWidth(0.35);
  doc.rect(14, y, pageWidth - 28, 28, "FD");

  doc.setTextColor(navy[0], navy[1], navy[2]);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(`GRP ASSEMBLY LINE EXCEPTIONS & COMPLIANCE REPORT`, 18, y + 6);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(slate600[0], slate600[1], slate600[2]);
  doc.text(`Audited Period: ${rangeLabel}`, 18, y + 11);
  doc.text(`This dossier compiles all registered GRP pipes on the line that did not meet conforming standards.`, 18, y + 15);
  doc.text(`It contains a complete breakdown of failed step parameters, visual photo audits, and operator remarks.`, 18, y + 19);
  doc.text(`Please address these issues to the designated Shift Quality Assurance Manager immediately.`, 18, y + 23);

  y += 33;

  // --- STATISTICAL OVERVIEW CARDS ---
  const totalEvaluated = evaluatedPipes.length;
  const totalExceptions = exceptionPipes.length;
  const totalConforming = totalEvaluated - totalExceptions;
  const incidentRate = totalEvaluated > 0 ? Math.round((totalExceptions / totalEvaluated) * 100) : 0;

  // Render 4 compact visual statistic cards side-by-side
  const cardWidth = (pageWidth - 28 - 9) / 4; // 4 cards, 3 gaps of 3mm
  const cardHeight = 18;

  const drawStatCard = (x: number, title: string, value: string, subtitle: string, isAlert = false) => {
    doc.setFillColor(isAlert ? crimson50[0] : softBg[0], isAlert ? crimson50[1] : softBg[1], isAlert ? crimson50[2] : softBg[2]);
    doc.setDrawColor(isAlert ? crimson700[0] : lightGrey[0], isAlert ? crimson700[1] : lightGrey[1], isAlert ? crimson700[2] : lightGrey[2]);
    doc.setLineWidth(isAlert ? 0.45 : 0.3);
    doc.rect(x, y, cardWidth, cardHeight, "FD");

    doc.setTextColor(isAlert ? crimson700[0] : slate600[0], isAlert ? crimson700[1] : slate600[1], isAlert ? crimson700[2] : slate600[2]);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.text(title.toUpperCase(), x + 3, y + 4.5);

    doc.setTextColor(textDark[0], textDark[1], textDark[2]);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(value, x + 3, y + 11.5);

    doc.setTextColor(slate600[0], slate600[1], slate600[2]);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.text(subtitle, x + 3, y + 15.5);
  };

  drawStatCard(14, "Total Evaluated", `${totalEvaluated} pcs`, `${totalEvaluated} GRP pipelines checked`);
  drawStatCard(14 + cardWidth + 3, "Conforming Units", `${totalConforming} pcs`, `${totalConforming} units fully conforming`);
  drawStatCard(14 + (cardWidth + 3) * 2, "Exception Incidents", `${totalExceptions} pcs`, `${totalExceptions} failed/NCR detected`, totalExceptions > 0);
  drawStatCard(14 + (cardWidth + 3) * 3, "Incident Rejection Rate", `${incidentRate}%`, `Ratio of pipeline exceptions`, totalExceptions > 0);

  y += cardHeight + 6;

  // --- LINE REGISTER LIST SECTION ---
  advanceOffset(15, "Exception Register");
  doc.setTextColor(navy[0], navy[1], navy[2]);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.text("EXCEPTIONAL INCIDENT AND COMPLIANCE LISTINGS", 14, y);

  doc.setDrawColor(navy[0], navy[1], navy[2]);
  doc.setLineWidth(0.4);
  doc.line(14, y + 1.5, pageWidth - 14, y + 1.5);
  y += 5.5;

  if (exceptionPipes.length === 0) {
    // Conforming State - Render beautiful conform card
    advanceOffset(35);
    doc.setFillColor(240, 253, 244); // Soft green bg
    doc.setDrawColor(22, 163, 74);   // Green 600 border
    doc.setLineWidth(0.5);
    doc.rect(14, y, pageWidth - 28, 30, "FD");

    doc.setTextColor(21, 128, 61); // Green 700
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("✓ ASSEMBLY LINE IN 100% PERFECT QUALITY STATE", 18, y + 8);

    doc.setTextColor(textDark[0], textDark[1], textDark[2]);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text(`No GRP Pipeline failures or Non-Conformances (NCR) were logged in the register for this period.`, 18, y + 15);
    doc.text(`All fabricated pieces are fully compliant and conforming with nominal stiffness and pressure thresholds.`, 18, y + 20);
    doc.text(`Shift Quality Certification is fully authorized for safe dispatch into the commercial yard.`, 18, y + 25);
    
    y += 35;
  } else {
    // Loop each exception pipe and draw a dedicated exception section
    exceptionPipes.forEach((pipe, pipeIdx) => {
      // Get the pre-calculated steps with issues matching the target period
      const stepsWithIssues = pipeToMatchingIssues.get(pipe.pipeId) || [];

      // Check height needed for this pipe's header block + step blocks
      // A safe estimated height calculation to see if we should start a fresh page
      const estHeight = 41 + stepsWithIssues.length * 40;
      advanceOffset(estHeight > 80 ? 50 : estHeight, `Exception Record ${pipe.pipeId}`);

      // --- PIPE ADMINISTRATIVE WRAPPER ---
      doc.setFillColor(softBg[0], softBg[1], softBg[2]);
      doc.setDrawColor(crimson700[0], crimson700[1], crimson700[2]); // Pink outline
      doc.setLineWidth(0.45);
      doc.rect(14, y, pageWidth - 28, 28, "FD");

      // Discrepancy Title
      doc.setTextColor(crimson700[0], crimson700[1], crimson700[2]);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text(`⚠️ QUALITY EXCEPTION RECORD #${pipeIdx + 1}: PIPE ID ${pipe.pipeId}`, 18, y + 5.5);

      // Metadata items
      doc.setTextColor(textDark[0], textDark[1], textDark[2]);
      doc.setFontSize(7.5);
      
      const pWO = pipe.header?.projectWorkOrder || "N/A";
      const lotN = pipe.header?.lotNo || "N/A";
      const typeP = pipe.header?.pipeType || "N/A";
      const registerTime = new Date(pipe.createdAt).toLocaleString();
      const operator = pipe.operatorUsername || "N/A";

      // Row 1: Project WO & Lot Number
      doc.setFont("helvetica", "bold");
      doc.text("Project WO:", 18, y + 11);
      doc.setFont("helvetica", "normal");
      doc.text(pWO, 36, y + 11);

      doc.setFont("helvetica", "bold");
      doc.text("Lot Number:", 110, y + 11);
      doc.setFont("helvetica", "normal");
      doc.text(lotN, 128, y + 11);

      // Row 2: Pipe Type & Logged By
      doc.setFont("helvetica", "bold");
      doc.text("Pipe Type:", 18, y + 16.5);
      doc.setFont("helvetica", "normal");
      doc.text(typeP, 34, y + 16.5);

      doc.setFont("helvetica", "bold");
      doc.text("Logged By:", 110, y + 16.5);
      doc.setFont("helvetica", "normal");
      doc.text(`${operator} @ ${registerTime}`, 127, y + 16.5);

      // Row 3: Physical Specs (full line)
      const specText = `Diameter: ${pipe.header?.diameter || "N/A"}mm | Stiffness: SN ${pipe.header?.stiffness || "N/A"} | Pressure: PN ${pipe.header?.pressure || "N/A"} | Length: ${pipe.header?.length || "N/A"}mm`;
      doc.setFont("helvetica", "bold");
      doc.text("Physical Specs:", 18, y + 22);
      doc.setFont("helvetica", "normal");
      doc.text(specText, 41, y + 22);

      y += 32;

      // Draw each step with issues
      stepsWithIssues.forEach((issue) => {
        const stepNo = issue.stepNo;
        const sName = issue.name;
        const step = issue.step;

        const isNCR = !!step.isNonConform;
        const failedChecks = step.qualityChecks?.filter((q: any) => q.status === "Fail") || [];
        
        // Let's compute exact dynamic height needed for this box
        let boxHeight = 12; // Start with header + classification

        // 1. Failed Checks
        let processedFailedChecks: string[][] = [];
        if (failedChecks.length > 0) {
          boxHeight += 6; // Section Title: "FAILED QUALITY OBSERVATIONS / PARAMETERS:"
          failedChecks.forEach((qc: any) => {
            const checkText = `• ${qc.label || qc.name || qc.id}`;
            const lines = doc.splitTextToSize(checkText, pageWidth - 38);
            processedFailedChecks.push(lines);
            boxHeight += lines.length * 4.5;
          });
          boxHeight += 2; // spacing
        }

        // 2. NCR Reason
        let ncrReasonLines: string[] = [];
        if (step.ncrReason) {
          boxHeight += 6; // Title: "NCR ROOT CAUSE DISCREPANCY:"
          ncrReasonLines = doc.splitTextToSize(step.ncrReason, pageWidth - 38);
          boxHeight += ncrReasonLines.length * 4.5;
          boxHeight += 2; // spacing
        }

        // 3. Operator Remarks
        const remarksText = step.additionalObs || "No comments entered by operator.";
        boxHeight += 6; // Title: "OPERATOR OBSERVATION REMARKS / EXPLANATIONS:"
        const remarkLines = doc.splitTextToSize(remarksText, pageWidth - 38);
        boxHeight += remarkLines.length * 4.5;
        boxHeight += 3; // spacing

        // 4. Photo Documentation
        if (step.image) {
          boxHeight += 42; // Title + base photo box spacing and rendering
        }

        // Add padding bottom
        boxHeight += 4;

        // Advance page if we don't fit
        advanceOffset(boxHeight + 5, `Exception Record ${pipe.pipeId}`);

        // Draw step exception box frame
        doc.setFillColor(crimson50[0], crimson50[1], crimson50[2]);
        doc.setDrawColor(244, 150, 160); // Soft rose border
        doc.setLineWidth(0.35);
        doc.rect(16, y, pageWidth - 32, boxHeight, "FD");

        // Start drawing contents inside the box at current y + 5
        let currentY = y + 5;

        // Title of Step Issue
        doc.setTextColor(crimson700[0], crimson700[1], crimson700[2]);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.5);
        doc.text(`Gate ${stepNo}: ${sName.toUpperCase()}`, 20, currentY);
        currentY += 4.5;

        // Incident Classification
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(navy[0], navy[1], navy[2]);
        doc.text(`Incident Classification: `, 20, currentY);
        
        doc.setFont("helvetica", "bold");
        doc.setTextColor(crimson700[0], crimson700[1], crimson700[2]);
        let statusLabel = isNCR ? "PRODUCT NON-CONFORMANCE (NCR)" : "QUALITY CONTROL CHECKLIST FAIL";
        if (isNCR && failedChecks.length > 0) {
          statusLabel = "PRODUCT NON-CONFORMANCE (NCR) & QUALITY CHECKLIST FAIL";
        }
        doc.text(statusLabel, 50, currentY);
        currentY += 5.5;

        // Draw Failed Checks List
        if (processedFailedChecks.length > 0) {
          doc.setTextColor(navy[0], navy[1], navy[2]);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(7.5);
          doc.text("FAILED QUALITY OBSERVATIONS / PARAMETERS:", 20, currentY);
          currentY += 4.5;

          doc.setFont("helvetica", "normal");
          doc.setTextColor(crimson700[0], crimson700[1], crimson700[2]);
          processedFailedChecks.forEach((lines) => {
            lines.forEach((line) => {
              doc.text(line, 22, currentY);
              currentY += 4.5;
            });
          });
          currentY += 1;
        }

        // Draw NCR Reason if present
        if (ncrReasonLines.length > 0) {
          doc.setTextColor(navy[0], navy[1], navy[2]);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(7.5);
          doc.text("NCR ROOT CAUSE DISCREPANCY:", 20, currentY);
          currentY += 4.5;

          doc.setFont("helvetica", "italic");
          doc.setTextColor(crimson700[0], crimson700[1], crimson700[2]);
          ncrReasonLines.forEach((line) => {
            doc.text(line, 22, currentY);
            currentY += 4.5;
          });
          currentY += 1;
        }

        // Draw Operator Remarks
        doc.setTextColor(navy[0], navy[1], navy[2]);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.5);
        doc.text("OPERATOR OBSERVATION REMARKS / EXPLANATIONS:", 20, currentY);
        currentY += 4.5;

        doc.setFont("helvetica", "normal");
        doc.setTextColor(slate600[0], slate600[1], slate600[2]);
        remarkLines.forEach((line) => {
          doc.text(line, 22, currentY);
          currentY += 4.5;
        });
        currentY += 2;

        // Draw Photograph Attachment
        if (step.image) {
          doc.setTextColor(navy[0], navy[1], navy[2]);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(7.5);
          doc.text("EXCEPTION PHOTO DOCUMENTATION ATTACHMENT:", 20, currentY);
          currentY += 4.5;

          try {
            const imgW = 45;
            const imgH = 30;
            const imgX = (pageWidth - imgW) / 2;
            const imgY = currentY;

            // Background frame for picture
            doc.setFillColor(255, 255, 255);
            doc.setDrawColor(226, 232, 240);
            doc.rect(imgX - 2, imgY - 1.5, imgW + 4, imgH + 3, "F");

            // Embed photograph
            doc.addImage(step.image, "JPEG", imgX, imgY, imgW, imgH);
            
            // Thin outline around picture
            doc.setDrawColor(crimson700[0], crimson700[1], crimson700[2]);
            doc.setLineWidth(0.3);
            doc.rect(imgX, imgY, imgW, imgH, "S");
            
            currentY += imgH + 4;
          } catch (imgErr) {
            console.error("Non-fatal step exception image render bypass in PDF report", imgErr);
            doc.setFont("helvetica", "italic");
            doc.setFontSize(6.5);
            doc.setTextColor(crimson700[0], crimson700[1], crimson700[2]);
            doc.text("Image file structure is not compatible or is corrupted for PDF embedding.", 20, currentY);
            currentY += 5;
          }
        }

        // Advance y by the total size of this box plus spacer
        y += boxHeight + 4;
      });

      y += 4; // Margin between different pipes
    });
  }

  // Save the generated document
  const dateSuffix = selectedDateStr.replace(/-/g, "_");
  doc.save(`GRP_Quality_Exception_Report_${period}_${dateSuffix}.pdf`);
}
