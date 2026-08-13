import { jsPDF } from "jspdf";
import { PipeRecord } from "../types";

export interface OperatorPdfFilters {
  selectedOperator?: string;
  statusFilter?: "ALL" | "NON CONFORM" | "ON HOLD" | "LIBERATED";
  month?: string;
  searchQuery?: string;
  day?: string;
  week?: string;
}

export function generateOperatorShiftReport(
  pipeRecords: PipeRecord[],
  currentUsername: string,
  allUsers: any[] = [],
  filters?: OperatorPdfFilters
) {
  const doc = new jsPDF("p", "mm", "a4");
  const pageWidth = 210;
  const pageHeight = 297;

  const selectedOperator = filters?.selectedOperator || "ALL";
  const statusFilter = filters?.statusFilter || "ALL";
  const monthFilter = filters?.month || "All";
  const searchQuery = (filters?.searchQuery || "").toLowerCase().trim();

  const isAllOps = selectedOperator === "ALL";

  // 1. Process Pipe Statistics matching real-time OperatorStats.tsx UI logic
  const relevantPipes = (pipeRecords || []).filter(pipe => {
    if (isAllOps) return true;
    if (pipe.operatorUsername === selectedOperator) return true;
    if (pipe.dispatchedBy === selectedOperator) return true;
    return Object.values(pipe.steps || {}).some((s: any) => s?.savedBy === selectedOperator);
  });

  const pipeStatistics = relevantPipes.map(pipe => {
    const stepsControlledSet = new Set<number>();
    const stepsFailedList: Array<{ stepNo: number; label: string; reason: string }> = [];
    let pipeHasNonConformity = false;

    Object.entries(pipe.steps || {}).forEach(([stepNoStr, step]: [string, any]) => {
      const stepNo = Number(stepNoStr);
      if (!step) return;

      if (isAllOps || step.savedBy === selectedOperator) {
        stepsControlledSet.add(stepNo);
      }

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
    });

    if ((isAllOps || pipe.operatorUsername === selectedOperator) && pipe.steps?.[1]) {
      stepsControlledSet.add(1);
    }

    let computedStatus: "NON CONFORM" | "ON HOLD" | "LIBERATED" = "ON HOLD";

    if (pipeHasNonConformity) {
      computedStatus = "NON CONFORM";
    } else if (pipe.isDispatched || (pipe.steps?.[8]?.isCompleted && !pipeHasNonConformity)) {
      computedStatus = "LIBERATED";
    } else {
      computedStatus = "ON HOLD";
    }

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
      status: computedStatus
    };
  });

  // Filter by status, month, and search query (sorted by Pipe N° from low to high)
  const filteredStats = pipeStatistics
    .filter(item => {
      if (statusFilter !== "ALL" && item.status !== statusFilter) return false;

      if (monthFilter !== "All" && item.createdAt) {
        const itemMonth = new Date(item.createdAt).toLocaleString("en-US", { month: "long" });
        if (itemMonth !== monthFilter) return false;
      }

      if (searchQuery) {
        const matchId = item.pipeId.toLowerCase().includes(searchQuery);
        const matchWO = item.projectWorkOrder.toLowerCase().includes(searchQuery);
        const matchType = item.pipeType.toLowerCase().includes(searchQuery);
        const matchOp = item.createdBy.toLowerCase().includes(searchQuery);
        return matchId || matchWO || matchType || matchOp;
      }

      return true;
    })
    .sort((a, b) => (a.pipeId || "").localeCompare(b.pipeId || "", undefined, { numeric: true, sensitivity: "base" }));

  // KPI Counts
  const totalCount = pipeStatistics.length;
  const nonConformCount = pipeStatistics.filter(p => p.status === "NON CONFORM").length;
  const onHoldCount = pipeStatistics.filter(p => p.status === "ON HOLD").length;
  const liberatedCount = pipeStatistics.filter(p => p.status === "LIBERATED").length;

  // PDF Color Palette
  const navy = [15, 23, 42]; // #0F172A
  const indigo = [79, 70, 229]; // #4F46E5
  const emerald = [16, 185, 129]; // #10B981
  const rose = [225, 29, 72]; // #E11D48
  const amber = [217, 119, 6]; // #D97706
  const slate600 = [71, 85, 105];

  let pageNum = 1;

  const drawPageHeader = (pNum: number) => {
    // Top colored indicator bar
    doc.setFillColor(indigo[0], indigo[1], indigo[2]);
    doc.rect(12, 10, pageWidth - 24, 2, "F");

    // Header banner block
    doc.setFillColor(navy[0], navy[1], navy[2]);
    doc.rect(12, 12, pageWidth - 24, 22, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("GRP PIPE QUALITY & OPERATOR CONTROL AUDIT REPORT", 17, 20);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(203, 213, 225);
    doc.text("Real-Time Floor Traceability Ledger • Steps Controlled & Quality Status", 17, 26);

    // Right side badge
    doc.setFillColor(emerald[0], emerald[1], emerald[2]);
    doc.rect(pageWidth - 48, 15, 33, 5, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "bold");
    doc.text("OFFICIAL QA AUDIT", pageWidth - 31.5, 18.5, { align: "center" });

    // Header metadata info
    doc.setTextColor(slate600[0], slate600[1], slate600[2]);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.text(`Generated: ${new Date().toLocaleString()} | Inspector: ${currentUsername}`, 12, 39);
    doc.text(`Page ${pNum}`, pageWidth - 12, 39, { align: "right" });

    // Divider line
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.4);
    doc.line(12, 41, pageWidth - 12, 41);
  };

  drawPageHeader(pageNum);
  let y = 46;

  // Filter summary bar box
  doc.setFillColor(248, 250, 252);
  doc.rect(12, y, pageWidth - 24, 12, "F");
  doc.setDrawColor(226, 232, 240);
  doc.rect(12, y, pageWidth - 24, 12, "D");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(navy[0], navy[1], navy[2]);
  doc.text(`OPERATOR PROFILE: ${selectedOperator === "ALL" ? "ALL OPERATORS (FACTORY ROSTER)" : selectedOperator.toUpperCase()}`, 16, y + 4.8);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text(`Status Filter: ${statusFilter}  |  Month Horizon: ${monthFilter}  |  Records Matching: ${filteredStats.length} of ${totalCount}`, 16, y + 9.2);

  y += 16;

  // KPI Summary Bar (4 Blocks)
  const blockW = (pageWidth - 24 - 9) / 4; // 4 blocks with 3mm gaps
  const blocks = [
    { title: "TOTAL PIPES", val: String(totalCount), color: indigo, bg: [238, 242, 255] },
    { title: "NON CONFORM", val: String(nonConformCount), color: rose, bg: [255, 241, 242] },
    { title: "ON HOLD", val: String(onHoldCount), color: amber, bg: [254, 243, 199] },
    { title: "LIBERATED", val: String(liberatedCount), color: emerald, bg: [236, 253, 245] },
  ];

  blocks.forEach((b, idx) => {
    const x = 12 + idx * (blockW + 3);
    doc.setFillColor(b.bg[0], b.bg[1], b.bg[2]);
    doc.rect(x, y, blockW, 13, "F");
    doc.setDrawColor(b.color[0], b.color[1], b.color[2]);
    doc.setLineWidth(0.3);
    doc.rect(x, y, blockW, 13, "D");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(b.color[0], b.color[1], b.color[2]);
    doc.text(b.title, x + 3, y + 4);

    doc.setFontSize(11);
    doc.text(b.val, x + 3, y + 10.5);
  });

  y += 18;

  // Master Table Headers
  const colWidths = [50, 52, 52, 32]; // Total = 186mm (matches 210 - 24)
  const colX = [12, 12 + 50, 12 + 50 + 52, 12 + 50 + 52 + 52];

  const drawTableHeader = () => {
    doc.setFillColor(navy[0], navy[1], navy[2]);
    doc.rect(12, y, pageWidth - 24, 7, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);

    doc.text("PIPE N°", colX[0] + 3, y + 4.8);
    doc.text("STEPS CONTROLLED", colX[1] + 3, y + 4.8);
    doc.text("STEPS FAILED", colX[2] + 3, y + 4.8);
    doc.text("STATUS", colX[3] + colWidths[3] - 3, y + 4.8, { align: "right" });

    y += 7;
  };

  drawTableHeader();

  // Draw Table Rows
  if (filteredStats.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text("No pipe records found matching the active operator and filter criteria.", 16, y + 8);
    y += 14;
  } else {
    filteredStats.forEach((item, rIdx) => {
      // Estimate row height based on step details
      const controlledText = item.stepsControlled.length > 0
        ? item.stepsControlled.map(s => `Step ${s}`).join(", ")
        : "None recorded";

      const failedText = item.stepsFailed.length > 0
        ? item.stepsFailed.map(sf => `Step ${sf.stepNo}: ${sf.reason}`).join("; ")
        : "None (0 Defects)";

      const controlledLines = doc.splitTextToSize(controlledText, colWidths[1] - 6);
      const failedLines = doc.splitTextToSize(failedText, colWidths[2] - 6);

      const maxLines = Math.max(controlledLines.length, failedLines.length, 1);
      const rowHeight = Math.max(10, maxLines * 4 + 4);

      // Check for page break
      if (y + rowHeight > pageHeight - 25) {
        doc.addPage();
        pageNum++;
        drawPageHeader(pageNum);
        y = 46;
        drawTableHeader();
      }

      // Row background
      if (rIdx % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(12, y, pageWidth - 24, rowHeight, "F");
      }
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.2);
      doc.rect(12, y, pageWidth - 24, rowHeight, "D");

      // Column 1: PIPE N° & Work Order
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(navy[0], navy[1], navy[2]);
      doc.text(item.pipeId, colX[0] + 3, y + 4.5);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139);
      doc.text(`WO: ${item.projectWorkOrder}`, colX[0] + 3, y + 8);

      // Column 2: STEPS CONTROLLED
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(30, 41, 59);
      doc.text(controlledLines, colX[1] + 3, y + 4.5);

      // Column 3: STEPS FAILED
      if (item.stepsFailed.length > 0) {
        doc.setFont("helvetica", "bold");
        doc.setTextColor(rose[0], rose[1], rose[2]);
      } else {
        doc.setFont("helvetica", "normal");
        doc.setTextColor(16, 185, 129);
      }
      doc.setFontSize(7);
      doc.text(failedLines, colX[2] + 3, y + 4.5);

      // Column 4: STATUS BADGE
      const badgeW = 26;
      const badgeH = 5.5;
      const badgeX = colX[3] + colWidths[3] - badgeW - 3;
      const badgeY = y + (rowHeight - badgeH) / 2;

      if (item.status === "NON CONFORM") {
        doc.setFillColor(rose[0], rose[1], rose[2]);
        doc.rect(badgeX, badgeY, badgeW, badgeH, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6.5);
        doc.text("NON CONFORM", badgeX + badgeW / 2, badgeY + 3.8, { align: "center" });
      } else if (item.status === "ON HOLD") {
        doc.setFillColor(amber[0], amber[1], amber[2]);
        doc.rect(badgeX, badgeY, badgeW, badgeH, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6.5);
        doc.text("ON HOLD", badgeX + badgeW / 2, badgeY + 3.8, { align: "center" });
      } else {
        doc.setFillColor(emerald[0], emerald[1], emerald[2]);
        doc.rect(badgeX, badgeY, badgeW, badgeH, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6.5);
        doc.text("LIBERATED", badgeX + badgeW / 2, badgeY + 3.8, { align: "center" });
      }

      y += rowHeight;
    });
  }

  // Signatures & Sign-off Block at the bottom
  if (y > pageHeight - 40) {
    doc.addPage();
    pageNum++;
    drawPageHeader(pageNum);
    y = 46;
  }

  y += 8;
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.line(12, y, pageWidth - 12, y);
  y += 6;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(navy[0], navy[1], navy[2]);
  doc.text("REGULATORY AUTHENTICATION SEAL", 12, y);
  doc.text("AUTHORIZED AUDITOR SIGN-OFF", pageWidth - 12, y, { align: "right" });
  y += 4.5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text("AWWA C950 GRP Quality Auditor Stamp", 12, y);
  doc.text("Plant Quality Manager Validation Signature", pageWidth - 12, y, { align: "right" });

  y += 14;
  doc.line(12, y, 60, y);
  doc.line(pageWidth - 60, y, pageWidth - 12, y);

  doc.setFontSize(6);
  doc.text("Automated system authentication hash", 12, y + 4);
  doc.text("Manual signature verification line", pageWidth - 12, y + 4, { align: "right" });

  // Save PDF
  const filename = `Operator_Statistics_Report_${selectedOperator}_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
}
