import { jsPDF } from "jspdf";
import { PipeRecord, StepRecord } from "../types";
import { formatDateForDisplay } from "./dateUtils";

// Field labels mapping for the calibration matrices
const FIELD_LABEL_MAP: { [key: string]: string } = {
  o2s: "Dia. S2S (Ø2S mm)",
  o3s: "Dia. S3S (Ø3S mm)",
  o4s: "Dia. S4S (Ø4S mm)",
  sa: "Length SA (mm)",
  sb: "Length SB (mm)",
  sc: "Length SC (mm)",
  sd: "Length SD (mm)",
  se: "Length SE (mm)",
  sf: "Length SF (mm)",
  sg: "Length SG (mm)",
  pipeLength: "Pipe Length (mm)",
  pipeThickness: "Pipe Thickness (mm)",
  o2b: "Depth B2B (Ø2B mm)",
  ba: "Length BA (mm)",
  bb: "Length BB (mm)",
  bc: "Length BC (mm)",
  bd: "Length BD (mm)",
  be: "Length BE (mm)",
  bf: "Length BF (mm)",
  bg: "Length BG (mm)",
  hydrostaticTest: "Hydrostatic Test",
  hydrostaticTime: "Hydrostatic Duration",
  hydrostaticStatus: "Test Result",
  testResult: "Barcol Result",
  tgValue: "Tg Value",
  vernierCaliperSerial: "Vernier Caliper Serial N°",
  crcometerSerial: "Circometer Serial N°",
  pipeWeight: "Pipe Weight (kg)",
  testBlock: "Degree of Cure",
  inspectorName: "Inspector Name",
  hoopType: "Hoop Type",
  resinType: "Resin Type",
  layersCount: "Layers Count",
  hoopBatch: "Hoop Batch",
  resinBatch: "Resin Batch",
  windingAngle: "Winding Angle"
};

export function exportPipeToPDF(pipe: PipeRecord) {
  const doc = new jsPDF("p", "mm", "a4");
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Color Palette
  const primaryNavy = [15, 32, 67]; // #0F2043 - GRP Deep Slate
  const textDark = [31, 41, 55];    // Charcoal
  const borderLight = [229, 231, 235]; // Light Gray
  const grayMuted = [107, 114, 128]; // Muted Gray
  const certGreen = [16, 185, 129]; // Clean Emerald
  const rejectRed = [239, 68, 68];   // Warning Red

  const drawHeader = (pageNum: number) => {
    // Top banner block
    doc.setFillColor(primaryNavy[0], primaryNavy[1], primaryNavy[2]);
    doc.rect(0, 0, pageWidth, 28, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("PIPE PRODUCTION & QC LIFECYCLE TRACK SHEET", 12, 11);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(`Official Tracker Certification • Facility Ledger System`, 12, 16);
    doc.text(`Page ${pageNum}`, pageWidth - 25, 16);

    // Decorative white line
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.5);
    doc.line(12, 19, pageWidth - 12, 19);

    doc.setFont("helvetica", "italic");
    doc.setFontSize(7);
    doc.text(`DocNo:MPI-FO-PD-02A  |  Version:03  |  Date:02/04/2023  |  System ID Reference: ${pipe.pipeId}  |  Generated on: ${new Date().toLocaleString()}`, 12, 23);
  };

  const drawFooter = () => {
    doc.setFillColor(primaryNavy[0], primaryNavy[1], primaryNavy[2]);
    doc.rect(0, pageHeight - 8, pageWidth, 8, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
  };

  // PAGE 1: HEADER & SPECIFICATION SPECIFICS + STEPS 1 - 4
  drawHeader(1);

  let y = 35;

  // Header Box details
  doc.setDrawColor(borderLight[0], borderLight[1], borderLight[2]);
  doc.setFillColor(249, 250, 251); // Soft gray BG
  doc.rect(12, y, pageWidth - 24, 45, "FD");

  doc.setTextColor(primaryNavy[0], primaryNavy[1], primaryNavy[2]);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("PIPE SPECIFICATIONS & TRACEABILITY INDEX", 16, y + 6);

  // Divider
  doc.setDrawColor(220, 224, 230);
  doc.line(16, y + 8, pageWidth - 16, y + 8);

  const col1X = 16;
  const col2X = 88;
  const col3X = 148;

  doc.setFontSize(8);
  doc.setTextColor(textDark[0], textDark[1], textDark[2]);

  // Col 1
  doc.setFont("helvetica", "bold");
  doc.text("Pipe Serial ID Reference:", col1X, y + 14);
  doc.setFont("helvetica", "normal");
  doc.text(`${pipe.pipeId}`, col1X + 38, y + 14);

  doc.setFont("helvetica", "bold");
  doc.text("Product Class/Type:", col1X, y + 20);
  doc.setFont("helvetica", "normal");
  doc.text(`${pipe.header?.pipeType || "N/A"}`, col1X + 38, y + 20);

  doc.setFont("helvetica", "bold");
  doc.text("Lot Number Code:", col1X, y + 26);
  doc.setFont("helvetica", "normal");
  doc.text(`${pipe.header?.lotNo || "N/A"}`, col1X + 38, y + 26);

  doc.setFont("helvetica", "bold");
  doc.text("Project Work Order:", col1X, y + 32);
  doc.setFont("helvetica", "normal");
  doc.text(`${pipe.header?.projectWorkOrder || "N/A"}`, col1X + 38, y + 32);

  doc.setFont("helvetica", "bold");
  doc.text("Operator Scanned By:", col1X, y + 38);
  doc.setFont("helvetica", "normal");
  doc.text(`${pipe.operatorUsername || "N/A"}`, col1X + 38, y + 38);

  // Col 2
  doc.setFont("helvetica", "bold");
  doc.text("Nominal Diameter:", col2X, y + 14);
  doc.setFont("helvetica", "normal");
  doc.text(`${pipe.header?.diameter || 0} mm`, col2X + 32, y + 14);

  doc.setFont("helvetica", "bold");
  doc.text("Nominal Stiffness:", col2X, y + 20);
  doc.setFont("helvetica", "normal");
  doc.text(`${pipe.header?.stiffness || 0} Pa`, col2X + 32, y + 20);

  doc.setFont("helvetica", "bold");
  doc.text("Nominal Pressure:", col2X, y + 26);
  doc.setFont("helvetica", "normal");
  doc.text(`${pipe.header?.pressure || 0} bar`, col2X + 32, y + 26);

  doc.setFont("helvetica", "bold");
  doc.text("Finished Length:", col2X, y + 32);
  doc.setFont("helvetica", "normal");
  doc.text(`${pipe.header?.length || 0} mm`, col2X + 32, y + 32);

  doc.setFont("helvetica", "bold");
  doc.text("Production Date:", col2X, y + 38);
  doc.setFont("helvetica", "normal");
  doc.text(`${formatDateForDisplay(pipe.header?.productionDate)}`, col2X + 32, y + 38);

  // Col 3 (QA Status Badge Banner)
  doc.setFont("helvetica", "bold");
  doc.text("Tracker Status Summary:", col3X, y + 14);

  // Determine overall status
  let hasFail = false;
  let hasCompletedStep8 = pipe.steps[8] && pipe.steps[8].isCompleted;
  
  for (let s = 1; s <= 8; s++) {
    const step = pipe.steps[s];
    if (step && step.qualityChecks && Array.isArray(step.qualityChecks)) {
      if (step.qualityChecks.some((qc: any) => qc.status === "Fail")) {
        hasFail = true;
      }
    }
  }

  y = y + 18;
  if (hasFail) {
    doc.setFillColor(rejectRed[0], rejectRed[1], rejectRed[2]);
    doc.rect(col3X, y, 45, 10, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("REJECTED / FAIL", col3X + 7, y + 6.5);
  } else if (hasCompletedStep8) {
    doc.setFillColor(certGreen[0], certGreen[1], certGreen[2]);
    doc.rect(col3X, y, 45, 10, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("PASS / APPROVED", col3X + 7, y + 6.5);
  } else {
    doc.setFillColor(245, 158, 11); // Amber
    doc.rect(col3X, y, 45, 10, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    const stepCount = Object.keys(pipe.steps || {}).length;
    doc.text(`IN PROGRESS (${stepCount}/8)`, col3X + 5, y + 6.5);
  }

  doc.setTextColor(textDark[0], textDark[1], textDark[2]);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.text(`Setting Ref: ${pipe.header?.settingReference || "N/A"}`, col3X, y + 16);
  doc.text(`Registered: ${pipe.createdAt ? new Date(pipe.createdAt).toLocaleString() : "N/A"}`, col3X, y + 21);

  // Draw steps header section
  y = 90;
  doc.setTextColor(primaryNavy[0], primaryNavy[1], primaryNavy[2]);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.text("PRODUCTION WORKFLOW LIFECYCLE REPORT (STEPS 1 - 4)", 12, y);

  // Pre-calculate step block heights dynamically to prevent page overflow and layout overlap
  const getStepBlockHeight = (stepNo: number): number => {
    const step = pipe.steps[stepNo];
    if (!step) return 21; // Stretched pending block slightly from 18 to 21

    let fieldsText: string[] = [];
    Object.entries(step.fields).forEach(([k, v]) => {
      if (v === null || v === "" || typeof v === "object") return;
      if (stepNo === 8 && k === "pipeDestination") return;
      fieldsText.push(`${k}: ${v}`);
    });

    const limit = Math.ceil(fieldsText.length / 2);
    const paramHeight = limit * 2.9; // Stretched row height slightly from 2.6 to 2.9
    
    const qcCount = step.qualityChecks?.length || 0;
    const qcHeight = 4.5 + (qcCount * 2.5); // Stretched row height slightly from 2.2 to 2.5

    const maxColHeight = Math.max(paramHeight, qcHeight);

    if (step.additionalObs) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6);
      const wrappedRemarks = doc.splitTextToSize(`Remarks: ${step.additionalObs}`, pageWidth - 36);
      const remarksHeight = (wrappedRemarks.length * 2.5) + 2; // Stretched slightly from 2.3 to 2.5
      return Math.max(26, 13 + maxColHeight + remarksHeight + 2); // Minimum height from 22 to 26
    } else {
      return Math.max(26, 13 + maxColHeight + 2); // Minimum height from 22 to 26
    }
  };

  // Draw steps logic: Step 1 to 8
  const drawStepBlock = (stepNo: number, startY: number): number => {
    const step = pipe.steps[stepNo];
    const isSaved = !!step;

    const h = getStepBlockHeight(stepNo);
    let fieldsText: string[] = [];
    let wrappedRemarks: string[] = [];

    if (isSaved) {
      Object.entries(step.fields)
        .sort(([keyA], [keyB]) => {
          const customOrder = stepNo === 3
            ? ["hoopType", "resinType", "layersCount", "hoopBatch", "resinBatch", "windingAngle"]
            : stepNo === 8
            ? ["inspectorName", "crcometerSerial", "vernierCaliperSerial", "pipeWeight", "hydrostaticTest", "hydrostaticTime", "hydrostaticStatus"]
            : ["o2s", "o3s", "o4s", "sa", "sb", "sc", "sd", "se", "sf", "sg", "pipeLength", "pipeThickness", "pipeWeight", "o2b", "ba", "bb", "bc", "bd", "be", "bf", "bg"];
          const indexA = customOrder.indexOf(keyA);
          const indexB = customOrder.indexOf(keyB);
          if (indexA !== -1 && indexB !== -1) return indexA - indexB;
          if (indexA !== -1) return -1;
          if (indexB !== -1) return 1;
          return 0;
        })
        .forEach(([k, v]) => {
          if (v === null || v === "" || typeof v === "object") return;
          if (stepNo === 8 && k === "pipeDestination") return;
          const displayLabel = FIELD_LABEL_MAP[k] || k.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
          let displayValue = String(v);
          if (v === "applicable") displayValue = "Applicable";
          if (v === "not_applicable") displayValue = "Not Applicable";
          fieldsText.push(`${displayLabel}: ${displayValue}`);
        });

      if (step.additionalObs) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6);
        wrappedRemarks = doc.splitTextToSize(`Remarks: ${step.additionalObs}`, pageWidth - 36);
      }
    }

    // Outer Container
    doc.setDrawColor(borderLight[0], borderLight[1], borderLight[2]);
    doc.setFillColor(255, 255, 255);
    doc.rect(12, startY, pageWidth - 24, h, "FD");

    // Left visual sidebar indication
    if (!isSaved) {
      doc.setFillColor(209, 213, 219); // Muted grey
    } else {
      const stepHasFail = step.qualityChecks.some(qc => qc.status === "Fail");
      if (stepHasFail) {
        doc.setFillColor(rejectRed[0], rejectRed[1], rejectRed[2]);
      } else {
        doc.setFillColor(primaryNavy[0], primaryNavy[1], primaryNavy[2]);
      }
    }
    doc.rect(12, startY, 4, h, "F");

    // Title label
    doc.setTextColor(primaryNavy[0], primaryNavy[1], primaryNavy[2]);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5); // Stretched slightly from 8 to 8.5

    let stepTitle = "";
    if (stepNo === 1) stepTitle = "Step 1: Mold Preparation";
    if (stepNo === 2) stepTitle = "Step 2: Liner Process";
    if (stepNo === 3) stepTitle = "Step 3: Structural Filament Winding Process";
    if (stepNo === 4) stepTitle = "Step 4: Post Cure";
    if (stepNo === 5) stepTitle = "Step 5: Hydraulic Ejection";
    if (stepNo === 6) stepTitle = "Step 6: Spigot Grinder";
    if (stepNo === 7) stepTitle = "Step 7: Bell Grinder Calibration Data Sheet";
    if (stepNo === 8) stepTitle = "Step 8: Packaging Verification & Final Clearance";

    doc.text(stepTitle, 18, startY + 5);

    // Procedures sub-title in the PDF
    let proceduresList: string[] = [];
    if (stepNo === 2) proceduresList = ["Procedure for Visual Inspection.MPI-SOP-QC-13/Version:00"];
    if (stepNo === 3) proceduresList = ["Procedure for Visual Inspection.MPI-SOP-QC-13/Version:00"];
    if (stepNo === 5) proceduresList = ["Procedure for Visual Inspection.MPI-SOP-QC-13/Version:00"];
    if (stepNo === 6) proceduresList = ["Procedure for Visual Inspection.MPI-SOP-QC-13/Version:00", "Procedure for DIMENTINAL Inspection.MPI-SOP-QC-14/Version:00"];
    if (stepNo === 7) proceduresList = ["Procedure for Visual Inspection.MPI-SOP-QC-13/Version:00", "Procedure for DIMENTINAL Inspection.MPI-SOP-QC-14/Version:00"];

    if (proceduresList.length > 0) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(6.5);
      doc.setTextColor(3, 105, 161); // Deep blue sky-700
      proceduresList.forEach((proc, pIdx) => {
        doc.text(proc, pageWidth - 16, startY + 5 + (pIdx * 2.6), { align: "right" });
      });
      // Restore standard title fonts
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(primaryNavy[0], primaryNavy[1], primaryNavy[2]);
    }

    // Render completion check
    if (!isSaved) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8);
      doc.setTextColor(grayMuted[0], grayMuted[1], grayMuted[2]);
      doc.text("LOG STATUS: PENDING FACTORY INITIATION", 18, startY + 12.5);
      return startY + h;
    }

    // Step has data:
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5); // Stretched slightly from 7 to 7.5
    doc.setTextColor(grayMuted[0], grayMuted[1], grayMuted[2]);
    doc.text(`LOG STATE: COMPLETED  •  OPERATOR: ${step.savedBy || "N/A"}  •  TIME: ${step.savedAt ? new Date(step.savedAt).toLocaleString() : "N/A"}`, 18, startY + 9.5);

    doc.setDrawColor(243, 244, 246);
    doc.line(18, startY + 11.5, pageWidth - 16, startY + 11.5);

    // Inner columns for parameters & evaluations
    doc.setFontSize(7.5); // Stretched slightly from 7 to 7.5
    doc.setTextColor(textDark[0], textDark[1], textDark[2]);

    const colWidth = 55;
    const px = 18;
    const py = startY + 15.5;

    doc.setFont("helvetica", "normal");
    // Print fields in two columns
    const limit = Math.ceil(fieldsText.length / 2);
    for (let i = 0; i < fieldsText.length; i++) {
      const isCol2 = i >= limit;
      const rowIdx = isCol2 ? i - limit : i;
      const textX = isCol2 ? px + colWidth : px;
      const textY = py + (rowIdx * 2.9);
      doc.text(fieldsText[i], textX, textY);
    }

    // QA Checklist summaries
    const qcX = px + 115;
    doc.setFont("helvetica", "bold");
    doc.text("QC Verification Status:", qcX, py);

    // Itemized checks with their individual pass/fail statuses
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.2); // Stretched slightly from 5.5 to 6.2
    step.qualityChecks.forEach((qc, idx) => {
      const qcY = py + 4.2 + (idx * 2.5);
      const isPass = qc.status === "Pass";
      const isFail = qc.status === "Fail";
      
      if (isPass) {
        doc.setTextColor(certGreen[0], certGreen[1], certGreen[2]);
        doc.setFont("helvetica", "bold");
        doc.text("[PASS]", qcX, qcY);
      } else if (isFail) {
        doc.setTextColor(rejectRed[0], rejectRed[1], rejectRed[2]);
        doc.setFont("helvetica", "bold");
        doc.text("[FAIL]", qcX, qcY);
      } else {
        doc.setTextColor(100, 116, 139);
        doc.setFont("helvetica", "italic");
        doc.text("[PEND]", qcX, qcY);
      }
      
      doc.setTextColor(textDark[0], textDark[1], textDark[2]);
      doc.setFont("helvetica", "normal");
      
      const maxLabelLength = 40;
      let displayLabel = qc.label;
      if (displayLabel.length > maxLabelLength) {
        displayLabel = displayLabel.substring(0, maxLabelLength - 3) + "...";
      }
      doc.text(displayLabel, qcX + 11, qcY);
    });

    // Check if step has comments (render full comments dynamically wrapping lines)
    if (step.additionalObs && wrappedRemarks.length > 0) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(6);
      doc.setTextColor(180, 83, 9); // Amber highlight
      
      const remarksHeight = wrappedRemarks.length * 2.5;
      const remarksStartY = startY + h - remarksHeight - 3;
      
      doc.setDrawColor(243, 244, 246);
      doc.line(18, remarksStartY - 1, pageWidth - 16, remarksStartY - 1);
      
      wrappedRemarks.forEach((line, rIdx) => {
        doc.text(line, 18, remarksStartY + 1.8 + (rIdx * 2.5));
      });
    }

    return startY + h;
  };

  let currentPage = 1;
  let stepY = 93;

  // Step 1
  stepY = drawStepBlock(1, stepY) + 3;

  // Step 2
  stepY = drawStepBlock(2, stepY) + 3;

  // Step 3
  stepY = drawStepBlock(3, stepY) + 3;

  // Step 4
  stepY = drawStepBlock(4, stepY) + 3;

  drawFooter();

  // --- FORCE TRANSITION TO PAGE 2 STRICTLY FOR STEPS 5 TO 8 & CLEARANCE ---
  doc.addPage();
  currentPage = 2;
  drawHeader(currentPage);
  
  y = 33;
  doc.setTextColor(primaryNavy[0], primaryNavy[1], primaryNavy[2]);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.text("PRODUCTION WORKFLOW LIFECYCLE REPORT (STEPS 5 - 8)", 12, y);
  stepY = 38;

  // Step 5
  stepY = drawStepBlock(5, stepY) + 3;

  // Step 6
  stepY = drawStepBlock(6, stepY) + 3;

  // Step 7
  stepY = drawStepBlock(7, stepY) + 3;

  // Step 7 image if it exists
  const step7 = pipe.steps[7];
  if (step7 && step7.image) {
    const boxHeight = 28; // slightly more compact to support more comments safely
    doc.setDrawColor(borderLight[0], borderLight[1], borderLight[2]);
    doc.setFillColor(253, 254, 255);
    doc.rect(12, stepY, pageWidth - 24, boxHeight, "FD");

    // Left visual sidebar tracker line in GRP Primary Navy
    doc.setFillColor(primaryNavy[0], primaryNavy[1], primaryNavy[2]);
    doc.rect(12, stepY, 4, boxHeight, "F");

    // Title label
    doc.setTextColor(primaryNavy[0], primaryNavy[1], primaryNavy[2]);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.text("STEP 7 ATTACHMENT: BELL GRINDER CALIBRATION DOCUMENT IMAGE", 18, stepY + 4.5);

    try {
      const imgWidth = 45;
      const imgHeight = boxHeight - 8;
      const imgX = (pageWidth - imgWidth) / 2;
      const imgY = stepY + 6;
      doc.addImage(step7.image, "JPEG", imgX, imgY, imgWidth, imgHeight);
    } catch (e) {
      console.error("Error adding step 7 image:", e);
      doc.setFont("helvetica", "italic");
      doc.setFontSize(6.5);
      doc.setTextColor(rejectRed[0], rejectRed[1], rejectRed[2]);
      doc.text("Unable to render Step 7 photograph attachment in document.", 18, stepY + 15);
    }

    stepY += boxHeight + 3;
  }

  // Step 8
  stepY = drawStepBlock(8, stepY) + 3;

  // Add Inspector & Factory Certification Clearance Box
  const clearanceBoxHeight = 28; // slightly more compact to support more comments safely

  y = stepY + 1;
  doc.setLineWidth(0.3);
  doc.setDrawColor(186, 230, 253); // Light sky border
  doc.setFillColor(240, 249, 255); // Sky background
  doc.rect(12, y, pageWidth - 24, clearanceBoxHeight, "FD");

  doc.setTextColor(3, 105, 161); // Blue deep
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text("OFFICIAL FACTORY QUALITY CLEARANCE SUMMARY", 16, y + 5);

  doc.setDrawColor(186, 230, 253);
  doc.line(16, y + 7, pageWidth - 16, y + 7);

  doc.setTextColor(textDark[0], textDark[1], textDark[2]);
  doc.setFontSize(7.5);

  const step8Data = pipe.steps[8];
  const isCertified = step8Data && step8Data.isCompleted;
  const inspectorName = step8Data ? (step8Data.fields as any)?.inspectorName || "N/A" : "Under Process";
  const pipeDestination = step8Data ? (step8Data.fields as any)?.pipeDestination || "PRODUCT CONFORM - DP-COMMERCIAL" : "PRODUCT CONFORM - DP-COMMERCIAL";

  doc.setFont("helvetica", "bold");
  doc.text("Certifying QA Lead / Inspector:", 18, y + 11);
  doc.setFont("helvetica", "normal");
  doc.text(`${inspectorName}`, 60, y + 11);

  doc.setFont("helvetica", "bold");
  doc.text("Certified Verification Timestamp:", 18, y + 16);
  doc.setFont("helvetica", "normal");
  doc.text(`${step8Data?.savedAt ? new Date(step8Data.savedAt).toLocaleString() : "Status uncertified"}`, 60, y + 16);

  doc.setFont("helvetica", "bold");
  doc.text("Selected Pipe Destination:", 18, y + 21);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(3, 105, 161);
  doc.text(`${pipeDestination}`, 60, y + 21);
  doc.setTextColor(textDark[0], textDark[1], textDark[2]);

  doc.setFont("helvetica", "bold");
  doc.text("Clearance Code Status:", 18, y + 25);
  doc.setFont("helvetica", "normal");
  
  if (hasFail) {
    doc.setTextColor(rejectRed[0], rejectRed[1], rejectRed[2]);
    doc.setFont("helvetica", "bold");
    doc.text("REJECTED DIRECTIVE - CRITICAL COMPLIANCE DEVIATIONS ENCOUNTERED", 60, y + 25);
  } else if (isCertified) {
    doc.setTextColor(certGreen[0], certGreen[1], certGreen[2]);
    doc.setFont("helvetica", "bold");
    doc.text("APPROVED & CLEARED", 60, y + 25);
  } else {
    doc.setTextColor(245, 158, 11);
    doc.setFont("helvetica", "normal");
    doc.text("INCOMPLETE QUALITY RECORD - PENDING FINAL STEP LOGS AND VERIFICATIONS", 60, y + 25);
  }

  // Draw signature fields on the far right
  const sigX = pageWidth - 60;
  doc.setDrawColor(120, 130, 145);
  doc.line(sigX, y + 21, pageWidth - 18, y + 21);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(6.5);
  doc.setTextColor(grayMuted[0], grayMuted[1], grayMuted[2]);
  doc.text("Lead Quality Inspector Signature", sigX + 5, y + 25);

  drawFooter();

  // Save/Download operation
  const dateStr = new Date().toISOString().split("T")[0];
  doc.save(`GRP_Pipe_QA_Tracking_${pipe.pipeId}_${dateStr}.pdf`);
}

export function exportStepNCRToPDF(pipe: PipeRecord, stepNo: number, ncrReason: string) {
  const doc = new jsPDF("p", "mm", "a4");
  const stepRecord = pipe.steps[stepNo];
  const stepNames: { [key: number]: string } = {
    1: "Mold Preparation",
    2: "Liner Process",
    3: "Structural Filament Winding Process",
    4: "Post Cure",
    5: "Hydraulic Ejection",
    6: "Spigot Grinder Calibration",
    7: "Bell Grinder Calibration Data Sheet",
    8: "Packaging Verification & Final Clearance"
  };
  const stepTitle = stepNames[stepNo] || `Step ${stepNo}`;

  // Helper function to draw table cells with precise Excel-style borders & background colors
  const drawCell = (
    x: number,
    y: number,
    w: number,
    h: number,
    text: string,
    type: "shaded-blue" | "shaded-gray" | "white",
    align: "left" | "center" | "right" = "left",
    isBold = false,
    textOverrideColor?: [number, number, number]
  ) => {
    // Colors matching Excel sheet reference style exactly
    if (type === "shaded-blue") {
      doc.setFillColor(189, 215, 238); // #bdd7ee
      doc.rect(x, y, w, h, "FD");
    } else if (type === "shaded-gray") {
      doc.setFillColor(217, 217, 217); // #d9d9d9
      doc.rect(x, y, w, h, "FD");
    } else {
      doc.setFillColor(255, 255, 255); // #ffffff
      doc.rect(x, y, w, h, "FD");
    }
    
    // Set line details
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);

    // Text configuration
    if (textOverrideColor) {
      doc.setTextColor(textOverrideColor[0], textOverrideColor[1], textOverrideColor[2]);
    } else {
      doc.setTextColor(0, 0, 0);
    }
    doc.setFont("helvetica", isBold ? "bold" : "normal");
    doc.setFontSize(7.5);

    let textX = x + 3;
    if (align === "center") {
      textX = x + w / 2;
    } else if (align === "right") {
      textX = x + w - 3;
    }

    // Vertical text centering helper
    const textY = y + h / 2 + 1;
    doc.text(text, textX, textY, { align: align });
  };

  // Draw the consistent header table box for NCR Page 1 and Page 2
  const drawHeaderBox = (pageNum: number) => {
    // Top border rectangle (Row 1-3 border)
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.35);
    doc.setFillColor(255, 255, 255);
    doc.rect(10, 12, 190, 22, "FD");

    // Vertical dividers between cells (logo box / middle box / right metadata box)
    doc.line(45, 12, 45, 34);
    doc.line(145, 12, 145, 34);

    // Left Cell (Columns A-B): Maghreb Pipe Industries Stylized Logo
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(20, 80, 160); // Deep Blue
    doc.text("MAGHREB", 12, 18);
    doc.setTextColor(220, 60, 20); // Orange Red
    doc.text("PIPE", 12, 23);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(80, 90, 100);
    doc.text("Industries", 23, 23);
    doc.setFontSize(5.5);
    doc.text("Tuyaux et raccords en PRV", 12, 28);

    // Middle Cell (Columns C-E): Report Label
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.text("NCR and CA Report", 95, 25, { align: "center" });

    // Right Cell (Columns F-H): Metadata Labels
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(0, 0, 0);
    doc.text("Doc No: MPI-FO-QA-20", 147, 18);
    doc.text("Rev: 02", 147, 23);
    const dateStr = formatDateForDisplay(pipe.header?.productionDate);
    doc.text(`Date: ${dateStr}`, 147, 28);
  };

  const drawFooter = (pageNum: number) => {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7);
    doc.setTextColor(100, 110, 120);
    doc.text(`Page ${pageNum} of 2  •  Maghreb Pipe Industries Quality Management System`, 105, 285, { align: "center" });
  };

  // --- PAGE 1 ---
  drawHeaderBox(1);
  drawFooter(1);

  // Row 4: NCR No & Dept
  drawCell(10, 34, 25, 6, "NCR no:", "shaded-blue", "right", true);
  drawCell(35, 34, 55, 6, `NCR-${pipe.pipeId}-S${stepNo}`, "white", "left");
  drawCell(90, 34, 20, 6, "Dept:", "shaded-blue", "right", true);
  drawCell(110, 34, 90, 6, "QC", "white", "left");

  // Row 5: Date & Initiator
  drawCell(10, 40, 25, 6, "Date:", "shaded-blue", "right", true);
  drawCell(35, 40, 55, 6, stepRecord?.savedAt ? new Date(stepRecord.savedAt).toLocaleDateString() : new Date().toLocaleDateString(), "white", "left");
  drawCell(90, 40, 20, 6, "Initiator:", "shaded-blue", "right", true);
  drawCell(110, 40, 90, 6, (stepRecord?.savedBy || pipe.operatorUsername || "HERIZI ABDESSAMED").toUpperCase(), "white", "left");

  // Row 6: Source
  drawCell(10, 46, 25, 6, "Source:", "shaded-blue", "right", true);
  const matchedSourceStr = `POSTE DE TRAITEMENT THERMIQUE (LES SECHEURES) / GATE: ${stepTitle.toUpperCase()}`;
  drawCell(35, 46, 155, 6, matchedSourceStr, "white", "left");

  // Row 7: Description of Non-Conformance title banner
  drawCell(10, 52, 190, 6, "Description of Non-Conformance", "shaded-blue", "center", true);

  // Row 8-11: Large Description block (Height = 40)
  doc.setFillColor(255, 255, 255);
  doc.rect(10, 58, 190, 40, "FD");
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.3);

  // Populate formatted reference of non-conformance text
  const mainSpecInfo = `LE TUYAU DN ${pipe.header?.diameter || "1000"} PN ${pipe.header?.pressure || "25"} SN ${pipe.header?.stiffness || "5000"} N° ${pipe.pipeId}`;
  const rawObs = (ncrReason || stepRecord?.additionalObs || "").trim();
  const actualObs = rawObs || "CONTIENT UNE MAUVAISE STRUCTURE ( HOOP NON SATURE ) , ANISI QUE PRESENCE D'UNE BOSSE";
  const fullDescriptionPhrase = actualObs.toUpperCase().startsWith("CONTIENT")
    ? `${mainSpecInfo} ${actualObs}`
    : `${mainSpecInfo} CONTIENT : ${actualObs}`;

  const hasImage = !!stepRecord?.image;
  // If there is an image, we split the text to a width of 115mm (leaves 70mm for the image box on the right).
  // If no image, we use the full 182mm width.
  const wrapWidth = hasImage ? 115 : 182;
  const wrappedDesc = doc.splitTextToSize(fullDescriptionPhrase, wrapWidth);
  let descY = 64;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  wrappedDesc.forEach((line: string) => {
    if (descY < 95) {
      doc.text(line, 14, descY);
      descY += 4.5;
    }
  });

  // Render attachment if present on the right side to prevent overwriting the text statement
  if (hasImage && stepRecord?.image) {
    try {
      doc.addImage(stepRecord.image, "JPEG", 135, 61, 60, 34);
    } catch (e) {
      console.error("Non-fatal image bypass in NCR PDF export", e);
    }
  }

  // Row 12-15: Target Dates and Correction Responsibility
  drawCell(10, 98, 95, 6, "Target Date for completion of Correction", "shaded-gray", "left");
  drawCell(105, 98, 95, 6, "", "white", "left");

  drawCell(10, 104, 95, 6, "Target Date for completion of Corrective Action", "shaded-gray", "left");
  drawCell(105, 104, 95, 6, "", "white", "left");

  drawCell(10, 110, 95, 6, "Responsible Person and Position (Correction)", "shaded-gray", "left");
  drawCell(105, 110, 95, 6, "", "white", "left");

  drawCell(10, 116, 95, 6, "Responsible Person and Position (Corrective action)", "shaded-gray", "left");
  drawCell(105, 116, 95, 6, "", "white", "left");

  // Row 16: Disposition Section Header
  drawCell(10, 122, 190, 6, "Disposition Action (For product NC, if applicable)", "shaded-blue", "center", true);

  // Resolve status ticks based on Step 8 destination / clearances
  const destStr = ((pipe.steps[8]?.fields as any)?.pipeDestination || "").toUpperCase();
  const isUseAsItIs = destStr.includes("COMMERCIAL") || destStr.includes("CONFORM");
  const isReleaseConcession = destStr.includes("CONCESSION") || destStr.includes("DEROGATION");
  const destIsReject = destStr.includes("REJECT") || destStr.includes("NON-CONFORM") || destStr.includes("REJECTED");

  // Row 17-22: Disposition Grid Elements
  drawCell(10, 128, 70, 6, "Use as it is", "white", "right");
  drawCell(80, 128, 15, 6, isUseAsItIs ? "X" : "", "white", "center", true);
  drawCell(95, 128, 45, 6, "Disposition done by", "shaded-gray", "center");
  drawCell(140, 128, 60, 6, stepRecord?.savedBy ? stepRecord.savedBy.toUpperCase() : "QA INSPECTOR", "white", "center");

  drawCell(10, 134, 70, 6, "Repair / Rework", "white", "right");
  drawCell(80, 134, 15, 6, "", "white", "center");
  drawCell(95, 134, 45, 6, "", "white", "center");
  drawCell(140, 134, 60, 6, "", "white", "center");

  drawCell(10, 140, 70, 6, "Regrade", "white", "right");
  drawCell(80, 140, 15, 6, "", "white", "center");
  drawCell(95, 140, 45, 6, "", "white", "center");
  drawCell(140, 140, 60, 6, "", "white", "center");

  drawCell(10, 146, 70, 6, "Release under Concession", "white", "right");
  drawCell(80, 146, 15, 6, isReleaseConcession ? "X" : "", "white", "center", true);
  drawCell(95, 146, 45, 6, "Disposition approved by", "shaded-gray", "center");
  drawCell(140, 146, 60, 6, "FACTORY QC DIRECTOR", "white", "center");

  drawCell(10, 152, 70, 6, "Reject / Scrap", "white", "right");
  drawCell(80, 152, 15, 6, destIsReject ? "X" : "", "white", "center", true);
  drawCell(95, 152, 45, 6, "", "white", "center");
  drawCell(140, 152, 60, 6, "", "white", "center");

  drawCell(10, 158, 70, 6, "Other", "white", "right");
  drawCell(80, 158, 15, 6, "", "white", "center");
  drawCell(95, 158, 105, 6, "", "white", "left");


  // --- PAGE 2 ---
  doc.addPage();
  drawHeaderBox(2);
  drawFooter(2);

  // Row 23: Header
  drawCell(10, 34, 190, 6, "To be filled if the disposition action is release under concession", "shaded-blue", "center", true);

  // Row 24-27: Release under concession inputs
  drawCell(10, 40, 110, 6, "Reason or rationale to support release of product under concession :", "shaded-gray", "left");
  drawCell(120, 40, 80, 6, "", "white", "left");

  drawCell(10, 46, 110, 6, "Is relevant party notified (including customer ) :", "shaded-gray", "left");
  drawCell(120, 46, 80, 6, "", "white", "left");

  drawCell(10, 52, 110, 6, "Personnel approving concession (Name and Signature) :", "shaded-gray", "left");
  drawCell(120, 52, 80, 6, "", "white", "left");

  drawCell(10, 58, 110, 6, "Date of approving release under concession :", "shaded-gray", "left");
  drawCell(120, 58, 80, 6, "", "white", "left");

  // Row 28: Correction Header
  drawCell(10, 64, 190, 6, "Correction", "shaded-blue", "center", true);

  // Row 29: Describe Header
  drawCell(10, 70, 190, 6, "Describe the Action taken to correct the NC", "shaded-gray", "left");

  // Row 30: Correction Description text area
  doc.setFillColor(255, 255, 255);
  doc.rect(10, 76, 190, 20, "FD");

  // Row 31-33: Correction completed detail cells
  drawCell(10, 96, 95, 6, "Date of Correction completion:", "shaded-gray", "left");
  drawCell(105, 96, 95, 6, "", "white", "left");

  drawCell(10, 102, 95, 6, "Correction completed by:", "shaded-gray", "left");
  drawCell(105, 102, 95, 6, "", "white", "left");

  drawCell(10, 108, 95, 6, "Correction Reviewed By", "shaded-gray", "left");
  drawCell(105, 108, 95, 6, "", "white", "left");

  // Row 34: Root cause analysis header
  drawCell(10, 114, 190, 6, "Root cause analysis (5 Why method recommended)", "shaded-blue", "center", true);

  // Row 35: Root cause text area
  doc.setFillColor(255, 255, 255);
  doc.rect(10, 120, 190, 20, "FD");

  // Row 36: Corrective Action Header
  drawCell(10, 140, 190, 6, "Corrective Action (Include MOC / Risk assessment details if applicable)", "shaded-blue", "center", true);

  // Row 37: Corrective Action text area
  doc.setFillColor(255, 255, 255);
  doc.rect(10, 146, 190, 20, "FD");

  // Row 38-40: Corrective Action implementation metadata
  drawCell(10, 166, 95, 6, "Corrective Action implemented Date:", "shaded-gray", "left");
  drawCell(105, 166, 95, 6, "", "white", "left");

  drawCell(10, 172, 95, 6, "Implemented by:", "shaded-gray", "left");
  drawCell(105, 172, 95, 6, "", "white", "left");

  drawCell(10, 178, 95, 6, "Reviewed By :", "shaded-gray", "left");
  drawCell(105, 178, 95, 6, "", "white", "left");

  // Row 41: Blue Spacer divider line
  drawCell(10, 184, 190, 6, "", "shaded-blue", "center");

  // Row 42-44: Signatures signature block line
  doc.setFillColor(255, 255, 255);
  doc.rect(10, 190, 190, 18, "FD");
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.3);
  doc.line(15, 201, 85, 201);
  doc.line(115, 201, 185, 201);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text("Approved by Plant Manager (Sign & Date)", 15, 205);
  doc.text("Customer Verification Approved", 115, 205);

  // Row 45-47: Effectiveness verified status cells
  drawCell(10, 208, 95, 6, "Effectiveness verified by:", "shaded-gray", "left");
  drawCell(105, 208, 95, 6, "", "white", "left");

  drawCell(10, 214, 95, 6, "Effectiveness Verification date:", "shaded-gray", "left");
  drawCell(105, 214, 95, 6, "", "white", "left");

  drawCell(10, 220, 95, 6, "Status of NC:", "shaded-gray", "left");
  drawCell(105, 220, 95, 6, "OPEN - UNDER QUALITY TRACKING", "white", "left", true, [220, 50, 50]);

  // Save/Download operation
  doc.save(`MAGHREB_PIPE_Quality_NCR_CA_Report_${pipe.pipeId}_Step${stepNo}.pdf`);
}

