import React, { useState } from "react";
import * as XLSX from "xlsx";
import { formatDateForDisplay, isLocaleMDY, toUTCMidnightISO } from "../utils/dateUtils";
import { 
  Search, 
  Filter, 
  Trash2, 
  Eye, 
  Edit3, 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  Info,
  Calendar,
  Layers,
  Box,
  TrendingUp,
  User as UserIcon,
  ChevronDown,
  ChevronUp,
  Camera,
  Layers2,
  ListFilter,
  FileSpreadsheet,
  Plus,
  FileText,
  Users,
  Activity,
  Clock,
  Folder,
  FolderOpen,
  Upload,
  X,
  RefreshCw
} from "lucide-react";
import { PipeRecord, PipeType, DashboardStats, User, ProjectConfig, ToleranceConfig, PipeHeader } from "../types";
import { exportPipeToPDF } from "../utils/pdfGenerator";
import { exportProjectAnalysisToPDF, exportAllProjectsSummaryToPDF } from "../utils/projectPdfGenerator";
import { generateFailedNcrReportPDF } from "../utils/complianceReportGenerator";
import { getStepName, getStepProcedures } from "./StepDetail";

const FIELD_LABEL_MAP: { [key: string]: string } = {
  o2s: "Ø2S (Dia)",
  o3s: "Ø3S (Dia)",
  o4s: "Ø4S (Dia)",
  sa: "SA (Len)",
  sb: "SB (Len)",
  sc: "SC (Len)",
  sd: "SD (Len)",
  se: "SE (Len)",
  sf: "SF (Len)",
  sg: "SG (Len)",
  pipeLength: "Pipe Length (mm)",
  pipeThickness: "Pipe Thickness (mm)",
  pipeWeight: "Pipe Weight (kg)",
  o2b: "Ø2B (Depth)",
  ba: "BA (Len)",
  bb: "BB (Len)",
  bc: "BC (Len)",
  bd: "BD (Len)",
  be: "BE (Len)",
  bf: "BF (Len)",
  bg: "BG (Len)"
};

function getRowValue(row: any, ...keys: string[]): any {
  if (!row || typeof row !== "object") return undefined;
  const normalizedKeys = keys.map(k => String(k).trim().toLowerCase().replace(/[^a-z0-9]/g, ""));
  for (const rowKey of Object.keys(row)) {
    const normalizedRowKey = String(rowKey).trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    if (normalizedKeys.includes(normalizedRowKey)) {
      return row[rowKey];
    }
  }
  return undefined;
}

function mapSimplifiedRowToPipeRecord(row: any): PipeRecord | null {
  const pipeIdVal = getRowValue(row, "Pipe Number", "Pipe ID", "Pipe_Number", "pipeId", "pipeNumber");
  const pipeId = pipeIdVal ? String(pipeIdVal).trim().toUpperCase() : "";
  if (!pipeId) return null;

  const projectVal = getRowValue(row, "Project", "Project Work Order", "projectWorkOrder", "Project_Work_Order", "project");
  const projectWorkOrder = projectVal ? String(projectVal).trim() : "";

  const activeStepVal = getRowValue(row, "Active Step", "Step", "activeStep", "step");
  const activeStepStr = activeStepVal ? String(activeStepVal).trim() : "";

  const commYardVal = getRowValue(row, "Commercial Ready Yard", "commercialReadyYard");
  const isCommYard = commYardVal && (
    String(commYardVal).trim().toLowerCase() === "yes" || 
    String(commYardVal).trim().toLowerCase() === "true" || 
    String(commYardVal).trim() === "1" || 
    String(commYardVal).trim().toLowerCase() === "y"
  );

  const rpsYardVal = getRowValue(row, "RPS Ready Yard", "rpsReadyYard");
  const isRpsYard = rpsYardVal && (
    String(rpsYardVal).trim().toLowerCase() === "yes" || 
    String(rpsYardVal).trim().toLowerCase() === "true" || 
    String(rpsYardVal).trim() === "1" || 
    String(rpsYardVal).trim().toLowerCase() === "y"
  );

  const quarantineVal = getRowValue(row, "NCR Quarantine Area", "ncrQuarantineArea", "Quarantine");
  const isQuarantine = quarantineVal && (
    String(quarantineVal).trim().toLowerCase() === "yes" || 
    String(quarantineVal).trim().toLowerCase() === "true" || 
    String(quarantineVal).trim() === "1" || 
    String(quarantineVal).trim().toLowerCase() === "y"
  );

  const deliveredVal = getRowValue(row, "Delivered Handover", "deliveredHandover", "Delivered");
  const isDelivered = deliveredVal && (
    String(deliveredVal).trim().toLowerCase() === "yes" || 
    String(deliveredVal).trim().toLowerCase() === "true" || 
    String(deliveredVal).trim() === "1" || 
    String(deliveredVal).trim().toLowerCase() === "y"
  );

  const header: PipeHeader = {
    pipeId,
    projectWorkOrder,
    lotNo: "LOT-IMPORT",
    pipeType: "Bell/Spigot GRP",
    diameter: 1000,
    length: 12000,
    pressure: 10,
    stiffness: 5000,
    settingReference: "REF-STD",
    productionDate: toUTCMidnightISO(new Date().toISOString())
  };

  let targetActiveStep = 1;
  let isDispatched = false;
  let isNcr = false;
  let finalDestination = "DP-Commercial";

  if (isDelivered) {
    isDispatched = true;
    targetActiveStep = 9; // fully completed
  } else if (isCommYard) {
    targetActiveStep = 9; // fully completed
    finalDestination = "DP-Commercial";
  } else if (isRpsYard) {
    targetActiveStep = 9; // fully completed
    finalDestination = "RPS-Commercial";
  } else if (isQuarantine) {
    isNcr = true;
    const match = activeStepStr.match(/\d+/);
    targetActiveStep = match ? parseInt(match[0], 10) : 1;
  } else if (activeStepStr) {
    const match = activeStepStr.match(/\d+/);
    if (match) {
      targetActiveStep = parseInt(match[0], 10);
    } else {
      const nameLower = activeStepStr.toLowerCase();
      if (nameLower.includes("mold") || nameLower.includes("prep")) targetActiveStep = 1;
      else if (nameLower.includes("liner")) targetActiveStep = 2;
      else if (nameLower.includes("winding")) targetActiveStep = 3;
      else if (nameLower.includes("cure")) targetActiveStep = 4;
      else if (nameLower.includes("demold") || nameLower.includes("ejection")) targetActiveStep = 5;
      else if (nameLower.includes("spigot") || nameLower.includes("grind")) targetActiveStep = 6;
      else if (nameLower.includes("bell") || nameLower.includes("calib")) targetActiveStep = 7;
      else if (nameLower.includes("inspect")) targetActiveStep = 8;
    }
  }

  targetActiveStep = Math.max(1, Math.min(9, targetActiveStep));

  const steps: { [key: number]: any } = {};

  const getImportQC = (stepNo: number, isPassed: boolean) => {
    if (stepNo === 1) {
      return [
        { id: "s1_qc1", label: "Clean surface", status: isPassed ? "Pass" : ("Fail" as "Pass" | "Fail" | null) },
        { id: "s1_qc2", label: "Release agent application", status: isPassed ? "Pass" : ("Fail" as "Pass" | "Fail" | null) },
        { id: "s1_qc3", label: "Dimensional check passed", status: isPassed ? "Pass" : ("Fail" as "Pass" | "Fail" | null) },
        { id: "s1_qc4", label: "Crack/Damage check", status: isPassed ? "Pass" : ("Fail" as "Pass" | "Fail" | null) },
      ];
    }
    if (stepNo === 2) {
      return [
        { id: "s2_qc1", label: "Thickness tolerance", status: isPassed ? "Pass" : ("Fail" as "Pass" | "Fail" | null) },
        { id: "s2_qc2", label: "Air pockets/bubbles check", status: isPassed ? "Pass" : ("Fail" as "Pass" | "Fail" | null) },
        { id: "s2_qc3", label: "Surface smoothness", status: isPassed ? "Pass" : ("Fail" as "Pass" | "Fail" | null) },
      ];
    }
    if (stepNo === 3) {
      return [
        { id: "s3_qc1", label: "Layer count matches specification", status: isPassed ? "Pass" : ("Fail" as "Pass" | "Fail" | null) },
        { id: "s3_qc2", label: "Winding angle correct", status: isPassed ? "Pass" : ("Fail" as "Pass" | "Fail" | null) },
        { id: "s3_qc3", label: "No dry spots or resin-rich areas", status: isPassed ? "Pass" : ("Fail" as "Pass" | "Fail" | null) },
        { id: "s3_qc4", label: "Uniform wall thickness", status: isPassed ? "Pass" : ("Fail" as "Pass" | "Fail" | null) },
        { id: "s3_qc5", label: "No visual defects", status: isPassed ? "Pass" : ("Fail" as "Pass" | "Fail" | null) },
      ];
    }
    if (stepNo === 4) {
      return [
        { id: "s4_qc1", label: "Temperature profile met", status: isPassed ? "Pass" : ("Fail" as "Pass" | "Fail" | null) },
        { id: "s4_qc2", label: "No warping or deformation", status: isPassed ? "Pass" : ("Fail" as "Pass" | "Fail" | null) },
        { id: "s4_qc3", label: "Surface hardness acceptable", status: isPassed ? "Pass" : ("Fail" as "Pass" | "Fail" | null) },
        { id: "s4_qc4", label: "Cure time completed fully", status: isPassed ? "Pass" : ("Fail" as "Pass" | "Fail" | null) },
      ];
    }
    if (stepNo === 5) {
      return [
        { id: "s5_qc1", label: "No cracking during ejection", status: isPassed ? "Pass" : ("Fail" as "Pass" | "Fail" | null) },
        { id: "s5_qc2", label: "Pipe released cleanly", status: isPassed ? "Pass" : ("Fail" as "Pass" | "Fail" | null) },
        { id: "s5_qc3", label: "Inner surface undamaged", status: isPassed ? "Pass" : ("Fail" as "Pass" | "Fail" | null) },
        { id: "s5_qc4", label: "Outer surface undamaged", status: isPassed ? "Pass" : ("Fail" as "Pass" | "Fail" | null) },
      ];
    }
    if (stepNo === 6) {
      return [
        { id: "s6_qc1", label: "Spigot surface smooth and even", status: isPassed ? "Pass" : ("Fail" as "Pass" | "Fail" | null) },
        { id: "s6_qc2", label: "No chipping on edges", status: isPassed ? "Pass" : ("Fail" as "Pass" | "Fail" | null) },
        { id: "s6_qc3", label: "No visible defects", status: isPassed ? "Pass" : ("Fail" as "Pass" | "Fail" | null) },
        { id: "s6_qc4", label: "Dimensional check passed", status: isPassed ? "Pass" : ("Fail" as "Pass" | "Fail" | null) },
      ];
    }
    if (stepNo === 7) {
      return [
        { id: "s7_qc1", label: "Bell socket surface smooth", status: isPassed ? "Pass" : ("Fail" as "Pass" | "Fail" | null) },
        { id: "s7_qc2", label: "No undercutting observed", status: isPassed ? "Pass" : ("Fail" as "Pass" | "Fail" | null) },
        { id: "s7_qc3", label: "Sealing groove profile correct", status: isPassed ? "Pass" : ("Fail" as "Pass" | "Fail" | null) },
        { id: "s7_qc4", label: "No visible defects", status: isPassed ? "Pass" : ("Fail" as "Pass" | "Fail" | null) },
        { id: "s7_qc5", label: "Dimensional check passed", status: isPassed ? "Pass" : ("Fail" as "Pass" | "Fail" | null) },
      ];
    }
    if (stepNo === 8) {
      return [
        { id: "s8_qc1", label: "All surfaces clean and free of contamination", status: isPassed ? "Pass" : ("Fail" as "Pass" | "Fail" | null) },
        { id: "s8_qc2", label: "Marking legible and correct", status: isPassed ? "Pass" : ("Fail" as "Pass" | "Fail" | null) },
        { id: "s8_qc3", label: "No visible defects on final pipe", status: isPassed ? "Pass" : ("Fail" as "Pass" | "Fail" | null) },
        { id: "s8_qc4", label: "Ready for dispatch", status: isPassed ? "Pass" : ("Fail" as "Pass" | "Fail" | null) },
      ];
    }
    return [];
  };

  for (let s = 1; s <= 8; s++) {
    const isCompleted = s < targetActiveStep || targetActiveStep === 9;
    const isFailed = isNcr && (s === targetActiveStep || (targetActiveStep === 9 && s === 8));

    if (s <= targetActiveStep || targetActiveStep === 9) {
      steps[s] = {
        stepNo: s,
        isCompleted: isCompleted && !isFailed,
        savedBy: "admin-system",
        savedAt: toUTCMidnightISO(new Date().toISOString()),
        fields: s === 8 ? {
          inspectorName: "System Bulk Import",
          pipeDestination: finalDestination,
          pipeWeight: 1850,
          vernierCaliperSerial: "CAL-IMPORT-STD",
          crcometerSerial: "CRC-IMPORT-STD",
          hydrostaticTest: "passed",
          hydrostaticTime: "120s",
          hydrostaticStatus: "passed"
        } : {},
        qualityChecks: getImportQC(s, !isFailed),
        additionalObs: "",
        isNonConform: isFailed
      };
    }
  }

  return {
    pipeId,
    header,
    operatorId: "admin-system",
    operatorUsername: "admin",
    createdAt: toUTCMidnightISO(new Date().toISOString()),
    lastUpdatedAt: toUTCMidnightISO(new Date().toISOString()),
    isDispatched,
    steps,
    isSimplified: true,
    targetActiveStep
  };
}

function mapExcelRowToPipeRecord(row: any): PipeRecord | null {
  // Check if we are using the simplified Floor Map format
  if (!row || typeof row !== "object") return null;
  const keys = Object.keys(row).map(k => String(k).trim().toLowerCase().replace(/[^a-z0-9]/g, ""));
  const hasPipeNumber = keys.some(k => 
    k === "pipenumber" || 
    k === "activestep" || 
    k === "commercialreadyyard" || 
    k === "rpsreadyyard" || 
    k === "ncrquarantinearea" || 
    k === "deliveredhandover"
  );
  if (hasPipeNumber) {
    return mapSimplifiedRowToPipeRecord(row);
  }

  const pipeId = String(row["Pipe ID"] || row["pipeId"] || "").trim().toUpperCase();
  if (!pipeId) return null;

  const parseSafeDate = toUTCMidnightISO;

  const parseSafeNumber = (val: any): number => {
    if (val === null || val === undefined) return 0;
    if (typeof val === "number") return val;
    // strip everything except digits, decimal point and minus sign
    const parsed = parseFloat(String(val).replace(/[^0-9.-]/g, ""));
    return isNaN(parsed) ? 0 : parsed;
  };

  const getStepTimestamp = (stepNo: number): string => {
    return parseSafeDate(
      row[`Step ${stepNo}: Timestamp`] || 
      row[`Step ${stepNo}: Timestamp Date`] || 
      row[`Step ${stepNo}: Date`] || 
      row[`Step ${stepNo}: Time`] || 
      row[`Step ${stepNo}: Saved At`] || 
      row[`Step ${stepNo}: SavedAt`] || 
      row[`Step ${stepNo}: savedAt`] || 
      row[`Step ${stepNo}: timestamp`]
    );
  };

  const header: PipeHeader = {
    pipeId,
    projectWorkOrder: String(row["Project Work Order"] || row["projectWorkOrder"] || ""),
    lotNo: String(row["Lot Number"] || row["lotNo"] || ""),
    pipeType: (row["Pipe Type"] || row["pipeType"] || "Bell/Spigot GRP") as any,
    diameter: parseSafeNumber(row["Nominal Diameter (mm)"] || row["diameter"]),
    length: parseSafeNumber(row["Nominal Length (mm)"] || row["length"]),
    pressure: parseSafeNumber(row["Pressure (bar)"] || row["pressure"]),
    stiffness: parseSafeNumber(row["Stiffness (Pa)"] || row["stiffness"]),
    settingReference: String(row["Setting Reference"] || row["settingReference"] || ""),
    productionDate: parseSafeDate(
      row["Manufacturing Date"] || 
      row["manufacturingDate"] || 
      row["Date of Manufacturing"] || 
      row["Mfg Date"] || 
      row["mfgDate"] || 
      row["Production Date"] || 
      row["productionDate"] || 
      row["Date"] || 
      row["date"]
    )
  };

  const steps: { [key: number]: any } = {};

  // Helper to standardise QC format
  const getImportQC = (stepNo: number, isPassed: boolean) => {
    if (stepNo === 1) {
      return [
        { id: "s1_qc1", label: "Clean surface", status: isPassed ? "Pass" : ("Fail" as "Pass" | "Fail" | null) },
        { id: "s1_qc2", label: "Release agent application", status: isPassed ? "Pass" : ("Fail" as "Pass" | "Fail" | null) },
        { id: "s1_qc3", label: "Dimensional check passed", status: isPassed ? "Pass" : ("Fail" as "Pass" | "Fail" | null) },
        { id: "s1_qc4", label: "Crack/Damage check", status: isPassed ? "Pass" : ("Fail" as "Pass" | "Fail" | null) },
      ];
    }
    if (stepNo === 2) {
      return [
        { id: "s2_qc1", label: "Thickness tolerance", status: isPassed ? "Pass" : ("Fail" as "Pass" | "Fail" | null) },
        { id: "s2_qc2", label: "Air pockets/bubbles check", status: isPassed ? "Pass" : ("Fail" as "Pass" | "Fail" | null) },
        { id: "s2_qc3", label: "Surface smoothness", status: isPassed ? "Pass" : ("Fail" as "Pass" | "Fail" | null) },
      ];
    }
    if (stepNo === 3) {
      return [
        { id: "s3_qc1", label: "Layer count matches specification", status: isPassed ? "Pass" : ("Fail" as "Pass" | "Fail" | null) },
        { id: "s3_qc2", label: "Winding angle correct", status: isPassed ? "Pass" : ("Fail" as "Pass" | "Fail" | null) },
        { id: "s3_qc3", label: "No dry spots or resin-rich areas", status: isPassed ? "Pass" : ("Fail" as "Pass" | "Fail" | null) },
        { id: "s3_qc4", label: "Uniform wall thickness", status: isPassed ? "Pass" : ("Fail" as "Pass" | "Fail" | null) },
        { id: "s3_qc5", label: "No visual defects", status: isPassed ? "Pass" : ("Fail" as "Pass" | "Fail" | null) },
      ];
    }
    if (stepNo === 4) {
      return [
        { id: "s4_qc1", label: "Temperature profile met", status: isPassed ? "Pass" : ("Fail" as "Pass" | "Fail" | null) },
        { id: "s4_qc2", label: "No warping or deformation", status: isPassed ? "Pass" : ("Fail" as "Pass" | "Fail" | null) },
        { id: "s4_qc3", label: "Surface hardness acceptable", status: isPassed ? "Pass" : ("Fail" as "Pass" | "Fail" | null) },
        { id: "s4_qc4", label: "Cure time completed fully", status: isPassed ? "Pass" : ("Fail" as "Pass" | "Fail" | null) },
      ];
    }
    if (stepNo === 5) {
      return [
        { id: "s5_qc1", label: "No cracking during ejection", status: isPassed ? "Pass" : ("Fail" as "Pass" | "Fail" | null) },
        { id: "s5_qc2", label: "Pipe released cleanly", status: isPassed ? "Pass" : ("Fail" as "Pass" | "Fail" | null) },
        { id: "s5_qc3", label: "Inner surface undamaged", status: isPassed ? "Pass" : ("Fail" as "Pass" | "Fail" | null) },
        { id: "s5_qc4", label: "Outer surface undamaged", status: isPassed ? "Pass" : ("Fail" as "Pass" | "Fail" | null) },
      ];
    }
    if (stepNo === 6) {
      return [
        { id: "s6_qc1", label: "Spigot surface smooth and even", status: isPassed ? "Pass" : ("Fail" as "Pass" | "Fail" | null) },
        { id: "s6_qc2", label: "No chipping on edges", status: isPassed ? "Pass" : ("Fail" as "Pass" | "Fail" | null) },
        { id: "s6_qc3", label: "No visible defects", status: isPassed ? "Pass" : ("Fail" as "Pass" | "Fail" | null) },
        { id: "s6_qc4", label: "Dimensional check passed", status: isPassed ? "Pass" : ("Fail" as "Pass" | "Fail" | null) },
      ];
    }
    if (stepNo === 7) {
      return [
        { id: "s7_qc1", label: "Bell socket surface smooth", status: isPassed ? "Pass" : ("Fail" as "Pass" | "Fail" | null) },
        { id: "s7_qc2", label: "No undercutting observed", status: isPassed ? "Pass" : ("Fail" as "Pass" | "Fail" | null) },
        { id: "s7_qc3", label: "Sealing groove profile correct", status: isPassed ? "Pass" : ("Fail" as "Pass" | "Fail" | null) },
        { id: "s7_qc4", label: "No visible defects", status: isPassed ? "Pass" : ("Fail" as "Pass" | "Fail" | null) },
        { id: "s7_qc5", label: "Dimensional check passed", status: isPassed ? "Pass" : ("Fail" as "Pass" | "Fail" | null) },
      ];
    }
    if (stepNo === 8) {
      return [
        { id: "s8_qc1", label: "All surfaces clean and free of contamination", status: isPassed ? "Pass" : ("Fail" as "Pass" | "Fail" | null) },
        { id: "s8_qc2", label: "Marking legible and correct", status: isPassed ? "Pass" : ("Fail" as "Pass" | "Fail" | null) },
        { id: "s8_qc3", label: "No visible defects on final pipe", status: isPassed ? "Pass" : ("Fail" as "Pass" | "Fail" | null) },
        { id: "s8_qc4", label: "Ready for dispatch", status: isPassed ? "Pass" : ("Fail" as "Pass" | "Fail" | null) },
      ];
    }
    return [];
  };

  // Step 1: Prep & Mold
  const s1Time = getStepTimestamp(1);
  if (row["Step 1: Operator"] || row["Step 1: Mold Serial"] || s1Time) {
    const isCompleted = String(row["Step 1: QA Checks"]).toLowerCase().includes("pass") || !!s1Time;
    steps[1] = {
      stepNo: 1,
      isCompleted,
      savedBy: String(row["Step 1: Operator"] || "admin"),
      savedAt: s1Time,
      fields: {
        moldSerial: String(row["Step 1: Mold Serial"] || ""),
        releaseAgent: String(row["Step 1: Release Agent"] || ""),
        moldCondition: String(row["Step 1: Mold Condition"] || ""),
        prepTime: String(row["Step 1: Prep Time"] || ""),
      },
      qualityChecks: getImportQC(1, isCompleted),
      additionalObs: String(row["Step 1: Remarks"] || ""),
      isNonConform: String(row["Step 1: QA Checks"]).toLowerCase().includes("fail")
    };
  }

  // Step 2: Liner Winding
  const s2Time = getStepTimestamp(2);
  if (row["Step 2: Operator"] || row["Step 2: Resin Type"] || s2Time) {
    const isCompleted = String(row["Step 2: QA Checks"]).toLowerCase().includes("pass") || !!s2Time;
    steps[2] = {
      stepNo: 2,
      isCompleted,
      savedBy: String(row["Step 2: Operator"] || "admin"),
      savedAt: s2Time,
      fields: {
        resinType: String(row["Step 2: Resin Type"] || ""),
        resinBatch: String(row["Step 2: Resin Batch"] || ""),
        cGlassType: String(row["Step 2: C-Glass Type"] || ""),
        cGlassBatch: String(row["Step 2: C-Glass Batch"] || ""),
        wovenType: String(row["Step 2: Woven Type"] || ""),
        wovenBatch: String(row["Step 2: Woven Batch"] || ""),
      },
      qualityChecks: getImportQC(2, isCompleted),
      additionalObs: String(row["Step 2: Remarks"] || ""),
      isNonConform: String(row["Step 2: QA Checks"]).toLowerCase().includes("fail")
    };
  }

  // Step 3: Structural Winding
  const s3Time = getStepTimestamp(3);
  if (row["Step 3: Operator"] || row["Step 3: Resin Type"] || s3Time) {
    const isCompleted = String(row["Step 3: QA Checks"]).toLowerCase().includes("pass") || !!s3Time;
    steps[3] = {
      stepNo: 3,
      isCompleted,
      savedBy: String(row["Step 3: Operator"] || "admin"),
      savedAt: s3Time,
      fields: {
        resinType: String(row["Step 3: Resin Type"] || ""),
        resinBatch: String(row["Step 3: Resin Batch"] || ""),
        layersCount: parseSafeNumber(row["Step 3: Layers Count"]),
        windingAngle: parseSafeNumber(row["Step 3: Winding Angle"]),
        hoopType: String(row["Step 3: Hoop Type"] || ""),
        hoopBatch: String(row["Step 3: Hoop Batch"] || ""),
      },
      qualityChecks: getImportQC(3, isCompleted),
      additionalObs: String(row["Step 3: Remarks"] || ""),
      isNonConform: String(row["Step 3: QA Checks"]).toLowerCase().includes("fail")
    };
  }

  // Step 4: Curing
  const s4Time = getStepTimestamp(4);
  if (row["Step 4: Operator"] || row["Step 4: Cure Temp"] || s4Time) {
    const isCompleted = String(row["Step 4: QA Checks"]).toLowerCase().includes("pass") || !!s4Time;
    steps[4] = {
      stepNo: 4,
      isCompleted,
      savedBy: String(row["Step 4: Operator"] || "admin"),
      savedAt: s4Time,
      fields: {
        cureTemp: String(row["Step 4: Cure Temp"] || ""),
        cureTime: String(row["Step 4: Cure Time"] || ""),
        testBlock: String(row["Step 4: Test Block"] || "Applicable"),
        testResult: String(row["Step 4: Barcol Result"] || ""),
        tgValue: String(row["Step 4: Tg Value"] || ""),
      },
      qualityChecks: getImportQC(4, isCompleted),
      additionalObs: String(row["Step 4: Remarks"] || ""),
      isNonConform: String(row["Step 4: QA Checks"]).toLowerCase().includes("fail")
    };
  }

  // Step 5: De-molding / Ejection
  const s5Time = getStepTimestamp(5);
  if (row["Step 5: Operator"] || row["Step 5: Ejection Force"] || s5Time) {
    const isCompleted = String(row["Step 5: QA Checks"]).toLowerCase().includes("pass") || !!s5Time;
    steps[5] = {
      stepNo: 5,
      isCompleted,
      savedBy: String(row["Step 5: Operator"] || "admin"),
      savedAt: s5Time,
      fields: {
        ejectionForce: String(row["Step 5: Ejection Force"] || ""),
        ejectionTime: String(row["Step 5: Ejection Time"] || ""),
      },
      qualityChecks: getImportQC(5, isCompleted),
      additionalObs: String(row["Step 5: Remarks"] || ""),
      isNonConform: String(row["Step 5: QA Checks"]).toLowerCase().includes("fail")
    };
  }

  // Step 6: Spigot Grinder
  const s6Time = getStepTimestamp(6);
  if (row["Step 6: Operator"] || row["Step 6: SA (Len)"] || s6Time) {
    const isCompleted = String(row["Step 6: QA Checks"]).toLowerCase().includes("pass") || !!s6Time;
    steps[6] = {
      stepNo: 6,
      isCompleted,
      savedBy: String(row["Step 6: Operator"] || "admin"),
      savedAt: s6Time,
      fields: {
        sa: parseSafeNumber(row["Step 6: SA (Len)"]),
        sb: parseSafeNumber(row["Step 6: SB (Len)"]),
        sc: parseSafeNumber(row["Step 6: SC (Len)"]),
        sd: parseSafeNumber(row["Step 6: SD (Len)"]),
        se: parseSafeNumber(row["Step 6: SE (Len)"]),
        sf: parseSafeNumber(row["Step 6: SF (Len)"]),
        o2s: parseSafeNumber(row["Step 6: Ø2S (Dia)"]),
        o3s: parseSafeNumber(row["Step 6: Ø3S (Dia)"]),
        o4s: parseSafeNumber(row["Step 6: Ø4S (Dia)"]),
        sg: parseSafeNumber(row["Step 6: SG (Len)"]),
        pipeLength: parseSafeNumber(row["Step 6: Pipe Length (mm)"]),
        pipeThickness: parseSafeNumber(row["Step 6: Pipe Thickness (mm)"]),
      },
      qualityChecks: getImportQC(6, isCompleted),
      additionalObs: String(row["Step 6: Remarks"] || ""),
      isNonConform: String(row["Step 6: QA Checks"]).toLowerCase().includes("fail")
    };
  }

  // Step 7: Bell Calibration
  const s7Time = getStepTimestamp(7);
  if (row["Step 7: Operator"] || row["Step 7: BA (Len)"] || s7Time) {
    const isCompleted = String(row["Step 7: QA Checks"]).toLowerCase().includes("pass") || !!s7Time;
    steps[7] = {
      stepNo: 7,
      isCompleted,
      savedBy: String(row["Step 7: Operator"] || "admin"),
      savedAt: s7Time,
      fields: {
        o2b: parseSafeNumber(row["Step 7: Ø2B (Depth)"]),
        ba: parseSafeNumber(row["Step 7: BA (Len)"]),
        bb: parseSafeNumber(row["Step 7: BB (Len)"]),
        bc: parseSafeNumber(row["Step 7: BC (Len)"]),
        bd: parseSafeNumber(row["Step 7: BD (Len)"]),
        be: parseSafeNumber(row["Step 7: BE (Len)"]),
        bf: parseSafeNumber(row["Step 7: BF (Len)"]),
        bg: parseSafeNumber(row["Step 7: BG (Len)"]),
      },
      qualityChecks: getImportQC(7, isCompleted),
      additionalObs: String(row["Step 7: Remarks"] || ""),
      isNonConform: String(row["Step 7: QA Checks"]).toLowerCase().includes("fail")
    };
  }

  // Step 8: Final Inspection
  const s8Time = getStepTimestamp(8);
  if (row["Step 8: Operator"] || row["Step 8: Inspector Name"] || s8Time) {
    const isCompleted = String(row["Step 8: QA Checks"]).toLowerCase().includes("pass") || !!s8Time;
    steps[8] = {
      stepNo: 8,
      isCompleted,
      savedBy: String(row["Step 8: Operator"] || "admin"),
      savedAt: s8Time,
      fields: {
        inspectorName: String(row["Step 8: Inspector Name"] || ""),
        pipeDestination: String(row["Step 8: Pipe Destination"] || ""),
        pipeWeight: parseSafeNumber(row["Step 8: Pipe Weight (kg)"]),
        vernierCaliperSerial: String(row["Step 8: Vernier Caliper Serial N°"] || ""),
        crcometerSerial: String(row["Step 8: Crcometer Serial N°"] || ""),
        hydrostaticTest: row["Step 8: Hydrostatic Test"] || "not_applicable",
        hydrostaticTime: String(row["Step 8: Hydrostatic Time / Duration"] || ""),
        hydrostaticStatus: row["Step 8: Hydrostatic Test Result"] || "",
      },
      qualityChecks: getImportQC(8, isCompleted),
      additionalObs: String(row["Step 8: Remarks"] || ""),
      isNonConform: String(row["Step 8: QA Checks"]).toLowerCase().includes("fail")
    };
  }

  return {
    pipeId,
    header,
    operatorId: row["Registered By"] || row["operatorId"] || "admin-system",
    operatorUsername: row["Registered By"] || row["operatorUsername"] || "admin",
    createdAt: parseSafeDate(row["Created At"]) || new Date().toISOString(),
    lastUpdatedAt: parseSafeDate(row["Last Updated"]) || new Date().toISOString(),
    steps
  };
}

interface PipeDashboardProps {
  records: PipeRecord[];
  currentUser: User | null;
  onEditRecord: (record: PipeRecord) => void;
  onDeleteRecord: (pipeId: string) => Promise<void>;
  onInspectRecord: (record: PipeRecord) => void;
  stats: DashboardStats;
  activeOperators?: { username: string; role: string; lastSeen: string }[];
  recentLogs?: { id: string; username: string; action: string; timestamp: string }[];
  projects?: ProjectConfig[];
  tolerances?: ToleranceConfig[];
  onBulkReload?: (records: PipeRecord[], mode: "merge" | "overwrite") => Promise<{ success: boolean; error?: string }>;
}

function PipeDashboard({
  records,
  currentUser,
  onEditRecord,
  onDeleteRecord,
  onInspectRecord,
  stats,
  activeOperators = [],
  recentLogs = [],
  projects = [],
  tolerances = [],
  onBulkReload
}: PipeDashboardProps) {
  // Search and Filter States
  const [searchTerm, setSearchTerm] = useState("");
  const [projectSearch, setProjectSearch] = useState("");
  const [lotSearch, setLotSearch] = useState("");
  const [selectedPipeType, setSelectedPipeType] = useState<string>("ALL");
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");
  const [reportPeriod, setReportPeriod] = useState<"daily" | "weekly" | "monthly">("daily");
  const [reportDate, setReportDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const portfolioViewTab: "analytics" | "projects" = "analytics";
  const setPortfolioViewTab = (val: "analytics" | "projects") => {};

  // Excel File Ingestion/Reload states
  const [showReloadModal, setShowReloadModal] = useState(false);
  const [parsedImportRecords, setParsedImportRecords] = useState<PipeRecord[]>([]);
  const [uploadError, setUploadError] = useState("");
  const [isProcessingUpload, setIsProcessingUpload] = useState(false);
  const [importMode, setImportMode] = useState<"merge" | "overwrite">("merge");
  const [successfulImportCount, setSuccessfulImportCount] = useState<number | null>(null);

  // Local inspector expand layout state
  const [expandedPipeId, setExpandedPipeId] = useState<string | null>(null);

  // Collapsible folders and subfolders expansion states
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});
  const [expandedSubfolders, setExpandedSubfolders] = useState<Record<string, boolean>>({});

  // Flat Search results local pagination limit
  const [visibleCount, setVisibleCount] = useState(25);

  React.useEffect(() => {
    setVisibleCount(25);
  }, [searchTerm, projectSearch, lotSearch, selectedPipeType, selectedStatus]);

  const handleExportToExcel = () => {
    try {
      console.log("Preparing GRP Pipe QA ledger Excel export...", records);
      if (!records || records.length === 0) {
        alert("There are currently no records loaded in the system to export. Make sure you have created some pipe records, or check that your current operator account has registered items.");
        return;
      }

      const getStepByNum = (rec: PipeRecord, stepNo: number) => {
        if (!rec || !rec.steps) return undefined;
        return rec.steps[stepNo] || (rec.steps as any)[String(stepNo)];
      };

      const sortedRecordsForExcel = [...records].sort((a, b) => {
        const getPipeNumberVal = (pipeId: string): number => {
          const match = pipeId.match(/\d+/);
          return match ? parseInt(match[0], 10) : 0;
        };
        const numA = getPipeNumberVal(a.pipeId);
        const numB = getPipeNumberVal(b.pipeId);
        if (numA !== numB) {
          return numA - numB;
        }
        return a.pipeId.localeCompare(b.pipeId, undefined, { numeric: true, sensitivity: 'base' });
      });

      const rows = sortedRecordsForExcel.map((rec) => {
        let hasFail = false;
        let isNonConforming = false;
        const s8 = getStepByNum(rec, 8);
        const hasCompletedStep8 = s8 && s8.isCompleted;

        for (let s = 1; s <= 8; s++) {
          const step = getStepByNum(rec, s);
          if (step) {
            if (step.isNonConform) {
              isNonConforming = true;
            }
            if (step.qualityChecks && Array.isArray(step.qualityChecks)) {
              if (step.qualityChecks.some((qc: any) => qc.status === "Fail")) {
                hasFail = true;
              }
            }
          }
        }

        let pipeStatus = "In Progress";
        if (isNonConforming) {
          pipeStatus = "Product Non-Conform";
        } else if (hasFail) {
          pipeStatus = "Rejected / Fail";
        } else if (hasCompletedStep8) {
          pipeStatus = "Pass / Approved";
        }

        const getQCPassFail = (stepNo: number) => {
          const step = getStepByNum(rec, stepNo);
          if (!step) return "N/A";
          if (!step.isCompleted) return "In Progress";
          const qcs = step.qualityChecks;
          if (!qcs || !Array.isArray(qcs)) return "In Progress";
          const hasStepFail = qcs.some((qc: any) => qc.status === "Fail");
          return hasStepFail ? "Failed Checks" : "Passed Checks";
        };

        const s1 = getStepByNum(rec, 1);
        const s1f = s1?.fields as any;
        const s2 = getStepByNum(rec, 2);
        const s2f = s2?.fields as any;
        const s3 = getStepByNum(rec, 3);
        const s3f = s3?.fields as any;
        const s4 = getStepByNum(rec, 4);
        const s4f = s4?.fields as any;
        const s5 = getStepByNum(rec, 5);
        const s5f = s5?.fields as any;
        const s6 = getStepByNum(rec, 6);
        const s6f = s6?.fields as any;
        const s7 = getStepByNum(rec, 7);
        const s7f = s7?.fields as any;
        const s8rec = getStepByNum(rec, 8);
        const s8f = s8rec?.fields as any;

        return {
          "Pipe ID": rec.pipeId || "",
          "Project Work Order": rec.header?.projectWorkOrder || "",
          "Lot Number": rec.header?.lotNo || "",
          "Pipe Type": rec.header?.pipeType || "",
          "Nominal Diameter (mm)": rec.header?.diameter != null ? rec.header.diameter : "",
          "Nominal Length (mm)": rec.header?.length != null ? rec.header.length : "",
          "Pressure (bar)": rec.header?.pressure != null ? rec.header.pressure : "",
          "Stiffness (Pa)": rec.header?.stiffness != null ? rec.header.stiffness : "",
          "Setting Reference": rec.header?.settingReference || "",
          "Production Date": formatDateForDisplay(rec.header?.productionDate),
          "Registered By": rec.operatorUsername || "",
          "Created At": rec.createdAt ? new Date(rec.createdAt).toLocaleString() : "",
          "Last Updated": rec.lastUpdatedAt ? new Date(rec.lastUpdatedAt).toLocaleString() : "",
          "Overall QA Status": pipeStatus,

          // Step 1: Prep & Mold
          "Step 1: Mold Serial": s1f?.moldSerial || "",
          "Step 1: Release Agent": s1f?.releaseAgent || "",
          "Step 1: Mold Condition": s1f?.moldCondition || "",
          "Step 1: Prep Time": s1f?.prepTime || "",
          "Step 1: Operator": s1?.savedBy || "",
          "Step 1: Timestamp": s1?.savedAt ? new Date(s1.savedAt).toLocaleString() : "",
          "Step 1: QA Checks": getQCPassFail(1),
          "Step 1: Remarks": s1?.additionalObs || "",

          // Step 2: Liner Winding
          "Step 2: Resin Type": s2f?.resinType || "",
          "Step 2: Resin Batch": s2f?.resinBatch || "",
          "Step 2: C-Glass Type": s2f?.cGlassType || "",
          "Step 2: C-Glass Batch": s2f?.cGlassBatch || "",
          "Step 2: Woven Type": s2f?.wovenType || "",
          "Step 2: Woven Batch": s2f?.wovenBatch || "",
          "Step 2: Operator": s2?.savedBy || "",
          "Step 2: Timestamp": s2?.savedAt ? new Date(s2.savedAt).toLocaleString() : "",
          "Step 2: QA Checks": getQCPassFail(2),
          "Step 2: Remarks": s2?.additionalObs || "",

          // Step 3: Structural Winding
          "Step 3: Resin Type": s3f?.resinType || "",
          "Step 3: Resin Batch": s3f?.resinBatch || "",
          "Step 3: Layers Count": s3f?.layersCount || "",
          "Step 3: Winding Angle": s3f?.windingAngle || "",
          "Step 3: Hoop Type": s3f?.hoopType || "",
          "Step 3: Hoop Batch": s3f?.hoopBatch || "",
          "Step 3: Operator": s3?.savedBy || "",
          "Step 3: Timestamp": s3?.savedAt ? new Date(s3.savedAt).toLocaleString() : "",
          "Step 3: QA Checks": getQCPassFail(3),
          "Step 3: Remarks": s3?.additionalObs || "",

          // Step 4: Curing
          "Step 4: Cure Temp": s4f?.cureTemp || "",
          "Step 4: Cure Time": s4f?.cureTime || "",
          "Step 4: Test Block": s4f?.testBlock || "",
          "Step 4: Barcol Result": s4f?.testResult || "",
          "Step 4: Tg Value": (s4f as any)?.tgValue || "",
          "Step 4: Operator": s4?.savedBy || "",
          "Step 4: Timestamp": s4?.savedAt ? new Date(s4.savedAt).toLocaleString() : "",
          "Step 4: QA Checks": getQCPassFail(4),
          "Step 4: Remarks": s4?.additionalObs || "",

          // Step 5: De-molding / Ejection
          "Step 5: Ejection Force": s5f?.ejectionForce || "",
          "Step 5: Ejection Time": s5f?.ejectionTime || "",
          "Step 5: Operator": s5?.savedBy || "",
          "Step 5: Timestamp": s5?.savedAt ? new Date(s5.savedAt).toLocaleString() : "",
          "Step 5: QA Checks": getQCPassFail(5),
          "Step 5: Remarks": s5?.additionalObs || "",

          // Step 6: Spigot Grinder dimensional matrix
          "Step 6: Ø2S (Dia)": s6f ? (s6f.o2s ?? "") : "",
          "Step 6: Ø3S (Dia)": s6f ? (s6f.o3s ?? "") : "",
          "Step 6: Ø4S (Dia)": s6f ? (s6f.o4s ?? "") : "",
          "Step 6: SA (Len)": s6f ? (s6f.sa ?? "") : "",
          "Step 6: SB (Len)": s6f ? (s6f.sb ?? "") : "",
          "Step 6: SC (Len)": s6f ? (s6f.sc ?? "") : "",
          "Step 6: SD (Len)": s6f ? (s6f.sd ?? "") : "",
          "Step 6: SE (Len)": s6f ? (s6f.se ?? "") : "",
          "Step 6: SF (Len)": s6f ? (s6f.sf ?? "") : "",
          "Step 6: SG (Len)": s6f ? (s6f.sg ?? "") : "",
          "Step 6: Pipe Length (mm)": s6f ? (s6f.pipeLength ?? "") : "",
          "Step 6: Pipe Thickness (mm)": s6f ? (s6f.pipeThickness ?? "") : "",
          "Step 6: Operator": s6?.savedBy || "",
          "Step 6: Timestamp": s6?.savedAt ? new Date(s6.savedAt).toLocaleString() : "",
          "Step 6: QA Checks": getQCPassFail(6),
          "Step 6: Remarks": s6?.additionalObs || "",

          // Step 7: Bell Calibration
          "Step 7: Ø2B (Depth)": s7f ? (s7f.o2b ?? "") : "",
          "Step 7: BA (Len)": s7f ? (s7f.ba ?? "") : "",
          "Step 7: BB (Len)": s7f ? (s7f.bb ?? "") : "",
          "Step 7: BC (Len)": s7f ? (s7f.bc ?? "") : "",
          "Step 7: BD (Len)": s7f ? (s7f.bd ?? "") : "",
          "Step 7: BE (Len)": s7f ? (s7f.be ?? "") : "",
          "Step 7: BF (Len)": s7f ? (s7f.bf ?? "") : "",
          "Step 7: BG (Len)": s7f ? (s7f.bg ?? "") : "",
          "Step 7: Operator": s7?.savedBy || "",
          "Step 7: Timestamp": s7?.savedAt ? new Date(s7.savedAt).toLocaleString() : "",
          "Step 7: QA Checks": getQCPassFail(7),
          "Step 7: Remarks": s7?.additionalObs || "",

          // Step 8: Final Inspection
          "Step 8: Inspector Name": s8f?.inspectorName || "",
          "Step 8: Pipe Destination": s8f?.pipeDestination || "",
          "Step 8: Pipe Weight (kg)": s8f ? (s8f.pipeWeight ?? "") : "",
          "Step 8: Vernier Caliper Serial N°": s8f?.vernierCaliperSerial || "",
          "Step 8: Crcometer Serial N°": s8f?.crcometerSerial || "",
          "Step 8: Hydrostatic Test": s8f?.hydrostaticTest || "not_applicable",
          "Step 8: Hydrostatic Time / Duration": s8f?.hydrostaticTime || "",
          "Step 8: Hydrostatic Test Result": s8f?.hydrostaticStatus || "",
          "Step 8: Operator": s8rec?.savedBy || "",
          "Step 8: Timestamp": s8rec?.savedAt ? new Date(s8rec.savedAt).toLocaleString() : "",
          "Step 8: QA Checks": getQCPassFail(8),
          "Step 8: Remarks": s8rec?.additionalObs || ""
        };
      });

      const xlsxUtils = XLSX.utils || (XLSX as any).default?.utils;
      const xlsxWriteFile = XLSX.writeFile || (XLSX as any).default?.writeFile;

      if (!xlsxUtils || !xlsxWriteFile) {
        throw new Error("XLSX core module extraction failed. Standard bindings are missing.");
      }

      const worksheet = xlsxUtils.json_to_sheet(rows);
      const workbook = xlsxUtils.book_new();
      xlsxUtils.book_append_sheet(workbook, worksheet, "Pipes Tracker Lifecycle");

      // Auto-fit column widths to look super-polished in Excel
      const maxColWidths = rows.reduce<any>((acc, row) => {
        Object.keys(row).forEach((key, colIndex) => {
          const val = String((row as any)[key] ?? '');
          const originalLen = Math.max(key.length, val.length);
          acc[colIndex] = Math.max(acc[colIndex] || 10, originalLen);
        });
        return acc;
      }, []);
      worksheet['!cols'] = maxColWidths.map((w: number) => ({ w: Math.min(w + 3, 40) }));

      const dateStr = new Date().toISOString().split("T")[0];
      xlsxWriteFile(workbook, `GRP_Pipe_QA_Lifecycles_${dateStr}.xlsx`);
    } catch (err: any) {
      console.error("Excel download crash caught:", err);
      alert("Failed to export Excel report: " + err.message);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError("");
    setParsedImportRecords([]);
    setSuccessfulImportCount(null);
    setIsProcessingUpload(true);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = evt.target?.result;
        if (!data) {
          throw new Error("Could not read Excel file data.");
        }

        const xlsxRead = XLSX.read || (XLSX as any).default?.read;
        const xlsxUtils = XLSX.utils || (XLSX as any).default?.utils;
        if (!xlsxRead || !xlsxUtils) {
          throw new Error("XLSX core modules are not available. Ensure dependencies are fully compiled.");
        }

        const workbook = xlsxRead(data, { type: "binary", cellDates: false });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) {
          throw new Error("Excel file appears to be empty or contains no sheets.");
        }

        const sheet = workbook.Sheets[sheetName];
        const rows: any[] = xlsxUtils.sheet_to_json(sheet);
        console.log("Parsed rows from Excel sheet:", rows);

        if (rows.length === 0) {
          throw new Error("No data rows found in the first sheet of this Excel file.");
        }

        const recordsList: PipeRecord[] = [];
        let skippedRows = 0;

        rows.forEach((row, idx) => {
          try {
            const mapped = mapExcelRowToPipeRecord(row);
            if (mapped) {
              recordsList.push(mapped);
            } else {
              skippedRows++;
            }
          } catch (rErr) {
            console.error(`Row ${idx+1} map error:`, rErr);
            skippedRows++;
          }
        });

        if (recordsList.length === 0) {
          throw new Error("None of the rows in the uploaded Excel corresponds to a valid GRP/GRE Pipe QA template. Ensure columns match the expected Pipe ID and steps structure.");
        }

        setParsedImportRecords(recordsList);
        if (skippedRows > 0) {
          console.warn(`Skipped ${skippedRows} rows which could not be mapped correctly.`);
        }
      } catch (err: any) {
        console.error(err);
        setUploadError(err.message || "An outstanding error occurred during Excel file ingestion.");
      } finally {
        setIsProcessingUpload(false);
      }
    };

    reader.onerror = () => {
      setUploadError("HTML File Reader threw an exception. Could not read binary spreadsheet.");
      setIsProcessingUpload(false);
    };

    reader.readAsBinaryString(file);
  };

  const handleConfirmImport = async () => {
    if (parsedImportRecords.length === 0) return;
    if (!onBulkReload) {
      alert("System reload functions are currently initializing, please try again.");
      return;
    }

    setIsProcessingUpload(true);
    setUploadError("");

    try {
      const result = await onBulkReload(parsedImportRecords, importMode);
      if (result.success) {
        setSuccessfulImportCount(parsedImportRecords.length);
        setParsedImportRecords([]);
      } else {
        setUploadError(result.error || "Failed to sync Excel records to server. Make sure you are authenticated.");
      }
    } catch (err: any) {
      console.error(err);
      setUploadError(err.message || "Bulk reload failed unexpectedly.");
    } finally {
      setIsProcessingUpload(false);
    }
  };

  // Filter records with memoization to avoid heavy recalculation on every render
  const filteredRecords = React.useMemo(() => {
    return records.filter((rec) => {
      const searchMatch = rec.pipeId.toLowerCase().includes(searchTerm.toLowerCase());
      const projectMatch = rec.header.projectWorkOrder.toLowerCase().includes(projectSearch.toLowerCase());
      const lotMatch = rec.header.lotNo.toLowerCase().includes(lotSearch.toLowerCase());
      
      const typeMatch = selectedPipeType === "ALL" || rec.header.pipeType === selectedPipeType;
      
      // Status identification
      let pipeStatus = "In Progress";
      let hasFail = false;
      let isNonConforming = false;
      const hasCompletedStep8 = rec.steps[8] && rec.steps[8].isCompleted;
      
      for (let s = 1; s <= 8; s++) {
        const step = rec.steps[s];
        if (step) {
          if (step.isNonConform) {
            isNonConforming = true;
          }
          if (step.qualityChecks?.some(qc => qc.status === "Fail")) {
            hasFail = true;
          }
        }
      }

      if (isNonConforming) {
        pipeStatus = "Product Non-Conform";
      } else if (hasFail) {
        pipeStatus = "Fail";
      } else if (hasCompletedStep8) {
        pipeStatus = "Pass";
      }

      const statusMatch = selectedStatus === "ALL" || pipeStatus === selectedStatus;

      return searchMatch && projectMatch && lotMatch && typeMatch && statusMatch;
    });
  }, [records, searchTerm, projectSearch, lotSearch, selectedPipeType, selectedStatus]);

  const getPipeStatusBadge = (rec: PipeRecord) => {
    let hasFail = false;
    let isNonConforming = false;
    let hasCompletedStep8 = rec.steps[8] && rec.steps[8].isCompleted;
    
    for (let s = 1; s <= 8; s++) {
      const step = rec.steps[s];
      if (step) {
        if (step.isNonConform) {
          isNonConforming = true;
        }
        if (step.qualityChecks?.some(qc => qc.status === "Fail")) {
          hasFail = true;
        }
      }
    }

    if (isNonConforming) {
      return (
        <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 border border-red-300 text-red-700">
          <AlertCircle className="w-3.5 h-3.5 text-red-650 shrink-0" />
          Product Non-Conform
        </span>
      );
    } else if (hasFail) {
      return (
        <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-50 border border-rose-200 text-rose-700">
          <XCircle className="w-3.5 h-3.5" />
          Rejected / Fail
        </span>
      );
    } else if (hasCompletedStep8) {
      return (
        <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 border border-emerald-200 text-emerald-700">
          <CheckCircle className="w-3.5 h-3.5" />
          Pass / Approved
        </span>
      );
    } else {
      // Calculate saved steps
      const savedStepsCount = Object.keys(rec.steps).length;
      return (
        <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 border border-amber-200 text-amber-700">
          <AlertCircle className="w-3.5 h-3.5" />
          In Progress ({savedStepsCount}/8)
        </span>
      );
    }
  };

  const calculatePipeCompleteness = (rec: PipeRecord) => {
    const savedStepsCount = Object.keys(rec.steps).length;
    return Math.round((savedStepsCount / 8) * 100);
  };

  const formatLogTime = (isoTime: string) => {
    try {
      const diffMs = Date.now() - new Date(isoTime).getTime();
      const s = Math.floor(diffMs / 1000);
      if (s < 0) return "Just Now";
      if (s < 60) return `${s}s ago`;
      const m = Math.floor(s / 60);
      if (m < 60) return `${m}m ago`;
      const h = Math.floor(m / 60);
      if (h < 24) return `${h}h ago`;
      return new Date(isoTime).toLocaleDateString();
    } catch (e) {
      return "Recently";
    }
  };

  const renderPipeCardInFolder = (pipe: PipeRecord, completeness: number, isSelfExpanded: boolean) => {
    return (
      <div 
        key={pipe.pipeId} 
        className="bg-white rounded-2xl border border-gray-100 shadow-3xs block overflow-hidden transition hover:shadow-xs border-l-4 border-l-blue-500"
      >
        
        {/* Pipe Card brief */}
        <div className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-base font-extrabold text-blue-900 tracking-wider">
                {pipe.pipeId}
              </span>
              <span className="text-[10px] font-semibold text-gray-500 uppercase bg-gray-100 px-2 py-0.5 rounded border border-gray-200">
                {pipe.header.pipeType}
              </span>
              {getPipeStatusBadge(pipe)}
            </div>
            
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 font-sans">
              <span className="flex items-center gap-1">
                <UserIcon className="w-3.5 h-3.5" />
                Op: <strong className="text-gray-700">{pipe.operatorUsername}</strong>
              </span>
              <span>Lot N°: <strong className="text-gray-700">{pipe.header.lotNo || "N/A"}</strong></span>
              <span>Project Work: <strong className="text-gray-700">{pipe.header.projectWorkOrder || "N/A"}</strong></span>
              <span>Date: <strong className="text-gray-700">{formatDateForDisplay(pipe.header.productionDate)}</strong></span>
            </div>
          </div>

          {/* Completeness Bar + Action Buttons */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
            <div className="text-left sm:text-right min-w-[120px]">
              <span className="text-xs font-bold text-gray-700 block">
                Completeness: {completeness}%
              </span>
              <div className="w-full sm:w-28 bg-gray-100 h-2 rounded-full overflow-hidden mt-1.5 border border-gray-200">
                <div 
                  className={`h-full rounded-full transition-all duration-300 ${completeness === 100 ? "bg-emerald-500" : "bg-blue-600"}`}
                  style={{ width: `${completeness}%` }}
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onInspectRecord(pipe)}
                className="flex-1 sm:flex-initial flex items-center justify-center gap-1 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs px-3 py-2 rounded-xl font-semibold border border-blue-100 transition cursor-pointer"
                title="Load into Active Tracker form"
              >
                <Edit3 className="w-3.5 h-3.5" />
                Track/Edit
              </button>

              <button
                type="button"
                onClick={() => {
                  try {
                    exportPipeToPDF(pipe);
                  } catch (err: any) {
                    console.error(err);
                    alert("Failed to render PDF tracking sheet: " + err.message);
                  }
                }}
                className="flex-1 sm:flex-initial flex items-center justify-center gap-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs px-3 py-2 rounded-xl font-semibold border border-indigo-100 transition cursor-pointer"
                title="Download PDF Pipe Tracking Sheet"
              >
                <FileText className="w-3.5 h-3.5" />
                PDF Sheet
              </button>

              {currentUser?.role === "admin" && (
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`Are you sure you want to permanently delete pipe ID ${pipe.pipeId} logs?`)) {
                      onDeleteRecord(pipe.pipeId);
                    }
                  }}
                  className="flex items-center justify-center bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs p-2 rounded-xl font-bold border border-rose-100 transition cursor-pointer"
                  title="Delete permanently"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}

              <button
                type="button"
                onClick={() => setExpandedPipeId(isSelfExpanded ? null : pipe.pipeId)}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs p-2 rounded-xl border border-gray-200 transition"
              >
                {isSelfExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        {/* Expanded Consult section */}
        {isSelfExpanded && (
          <div className="border-t border-gray-100 bg-gray-50/70 p-4 sm:p-5 space-y-4 animate-fade-in font-sans">
            
            {/* Header Technical Specifications info sheet */}
            <div className="bg-white p-4 rounded-xl border border-gray-200 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
              <div>
                <span className="text-gray-400 block font-bold uppercase tracking-wider text-[9px]">Pipe Diameter</span>
                <strong className="text-gray-800 text-sm leading-snug">{pipe.header.diameter || 0} mm</strong>
              </div>
              <div>
                <span className="text-gray-400 block font-bold uppercase tracking-wider text-[9px]">Tested stiffness</span>
                <strong className="text-gray-800 text-sm leading-snug">{pipe.header.stiffness || 0} Pa</strong>
              </div>
              <div>
                <span className="text-gray-400 block font-bold uppercase tracking-wider text-[9px]">Tested pressure</span>
                <strong className="text-gray-800 text-sm leading-snug">{pipe.header.pressure || 0} bar</strong>
              </div>
              <div>
                <span className="text-gray-400 block font-bold uppercase tracking-wider text-[9px]">Component length</span>
                <strong className="text-gray-800 text-sm leading-snug">{pipe.header.length || 0} mm</strong>
              </div>
            </div>

            <h4 className="text-xs font-extrabold text-gray-800 tracking-wider mb-2.5 uppercase pt-2 border-b border-gray-200 pb-1 flex items-center gap-1">
              <Layers className="w-4 h-4 text-blue-600" />
              Historic Workflow Logs & Quality Evaluations
            </h4>

            {/* QA Standards & Definitions Card */}
            <div className="bg-gradient-to-br from-gray-50 to-white border border-gray-200 rounded-xl p-3.5 mb-4 shadow-xs">
              <div className="flex items-center gap-1.5 font-extrabold text-xs text-gray-800 uppercase mb-2">
                <Info className="w-4 h-4 text-blue-600 shrink-0" />
                Standard Quality Assurance Pass/Fail Definitions & SOP Keys
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 text-xs">
                <div className="border-l-2 border-green-500 pl-2">
                  <div className="font-bold text-green-700 text-[11px] mb-0.5">PASS STATUS REMARK</div>
                  <p className="text-gray-600 text-[10.5px] leading-relaxed">
                    Satisfies drawing, visual, physical, and calibration criteria. Conforms to of-record lamination requirements under <strong>MPI-SOP-QC-13</strong> and dimensional requirements under <strong>MPI-SOP-QC-14</strong>. No dry spots or bubble clusters present.
                  </p>
                </div>
                <div className="border-l-2 border-red-500 pl-2">
                  <div className="font-bold text-red-700 text-[11px] mb-0.5">FAIL STATUS REMARK</div>
                  <p className="text-gray-600 text-[10.5px] leading-relaxed">
                    Visual anomalies (dry fiber, surface material delamination, air pocket clusters ref: <strong>MPI-SOP-QC-13</strong>) or dimensional measurements exceeding acceptable standard tolerances (ref: <strong>MPI-SOP-QC-14</strong>). Requires isolation and supervisor audit.
                  </p>
                </div>
              </div>
            </div>

            {/* Step log list progress */}
            <div className="space-y-3">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((sIndex) => {
                const stepRec = pipe.steps[sIndex];
                if (!stepRec) {
                  return (
                    <div key={sIndex} className="bg-white p-3.5 rounded-xl border border-dashed border-gray-200 flex flex-col gap-1 text-xs text-gray-400">
                      <div className="flex justify-between items-center w-full">
                        <span className="font-bold flex items-center gap-1.5 text-sm text-gray-500">
                          <span className="w-5 h-5 flex items-center justify-center bg-gray-100 rounded-full font-mono font-bold text-gray-500 text-[11px]">
                            {sIndex}
                          </span>
                          {getStepName(sIndex)}
                        </span>
                        <span className="text-[10px] font-semibold text-gray-400 italic">No entry saved yet</span>
                      </div>
                      {getStepProcedures(sIndex).length > 0 && (
                        <div className="pl-6 flex flex-col gap-0.5 mt-0.5">
                          {getStepProcedures(sIndex).map((p, idx) => (
                            <span key={idx} className="text-[10.5px] text-gray-400 font-mono italic">{p}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                }

                // Check if any checks failed
                const stepHasFail = stepRec.qualityChecks.some(qc => qc.status === "Fail");

                return (
                  <div 
                    key={sIndex} 
                    className={`bg-white p-4 rounded-xl border shadow-xs transition ${
                      stepHasFail ? "border-rose-200 bg-rose-50/15" : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-3 pb-2.5 border-b border-gray-100">
                      <div className="flex items-center gap-2">
                        <span className={`w-5.5 h-5.5 flex items-center justify-center rounded-full font-mono font-bold text-[11px] ${
                          stepHasFail 
                            ? "bg-rose-100 text-rose-800 border border-rose-200" 
                            : "bg-blue-100 text-blue-800 border border-blue-200"
                        }`}>
                          {sIndex}
                        </span>
                        <div className="flex flex-col">
                          <h5 className="font-bold text-sm text-gray-800">
                            {getStepName(sIndex)}
                          </h5>
                          {getStepProcedures(sIndex).length > 0 && (
                            <div className="flex flex-col gap-0.5 mt-0.5">
                              {getStepProcedures(sIndex).map((p, idx) => (
                                <span key={idx} className="text-[10px] text-blue-600 font-mono font-semibold">{p}</span>
                              ))}
                            </div>
                          )}
                        </div>
                        
                        {stepHasFail ? (
                          <span className="text-[10px] bg-rose-100 text-rose-800 px-2 py-0.5 rounded font-bold border border-rose-200 flex items-center gap-1 self-start sm:self-center">
                            <XCircle className="w-3 h-3" /> Fails Observed
                          </span>
                        ) : (
                          <span className="text-[10px] bg-green-100 text-green-800 px-2 py-0.5 rounded font-bold border border-green-200 flex items-center gap-1 self-start sm:self-center">
                            <CheckCircle className="w-3 h-3" /> Step Approved
                          </span>
                        )}
                      </div>

                      <div className="text-[10px] text-gray-500 font-mono">
                        Registered by <strong>{stepRec.savedBy}</strong> at {new Date(stepRec.savedAt).toLocaleTimeString()}
                      </div>
                    </div>

                    {/* Render step details fields dynamically */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-gray-600 mb-3">
                      
                      {/* Left parameters */}
                      <div className="space-y-1.5 p-2.5 bg-gray-50 rounded-lg">
                        <strong className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block mb-1 font-sans">
                          Process Parameters
                        </strong>
                        {Object.entries(stepRec.fields)
                          .sort(([keyA], [keyB]) => {
                            const customOrder = ["o2s", "o3s", "o4s", "sa", "sb", "sc", "sd", "se", "sf", "sg", "pipeLength", "pipeThickness", "pipeWeight", "o2b", "ba", "bb", "bc", "bd", "be", "bf", "bg"];
                            const indexA = customOrder.indexOf(keyA);
                            const indexB = customOrder.indexOf(keyB);
                            if (indexA !== -1 && indexB !== -1) return indexA - indexB;
                            if (indexA !== -1) return -1;
                            if (indexB !== -1) return 1;
                            return 0;
                          })
                          .map(([k, v]) => {
                          if (typeof v === "object" || v === null || v === "") return null;
                          const displayLabel = FIELD_LABEL_MAP[k] || k.replace(/([A-Z])/g, '  $1').replace(/^./, str => str.toUpperCase());
                          return (
                            <div key={k} className="flex justify-between items-center text-xs py-0.5 font-sans">
                              <span className="text-gray-500">{displayLabel}:</span>
                              <strong className="text-gray-800 font-semibold">{String(v)}</strong>
                            </div>
                          );
                        })}
                        {Object.keys(stepRec.fields).length === 0 && (
                          <span className="text-gray-400 italic">No entry parameters configured</span>
                        )}
                      </div>

                      {/* Right checks */}
                      <div className="space-y-1.5 p-2.5 bg-gray-50 rounded-lg">
                        <strong className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block mb-1 font-sans">
                          Evaluation Status Checklist
                        </strong>
                        {stepRec.qualityChecks.map((qc) => (
                          <div key={qc.id} className="flex justify-between items-center text-xs py-0.5 font-sans border-b border-gray-100 last:border-b-0">
                            <span className="text-gray-600">{qc.label}</span>
                            {qc.status === "Pass" ? (
                              <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-100 font-bold px-1.5 py-0.5 rounded">
                                Pass
                              </span>
                            ) : qc.status === "Fail" ? (
                              <span className="text-[10px] text-rose-700 bg-rose-50 border border-rose-100 font-bold px-1.5 py-0.5 rounded">
                                Fail
                              </span>
                            ) : (
                              <span className="text-[10px] text-gray-400 bg-gray-50 border border-gray-100 px-1.5 py-0.5 rounded">
                                Unmarked
                              </span>
                            )}
                          </div>
                        ))}
                      </div>

                    </div>

                    {/* Additional Comments & Photo Capture display */}
                    {(stepRec.additionalObs || stepRec.image) && (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 border-t border-gray-100 pt-3">
                        {stepRec.additionalObs && (
                          <div className="md:col-span-2 text-xs text-gray-600">
                            <span className="font-bold text-gray-700 block mb-1 font-sans">Observation Comments:</span>
                            <p className="bg-orange-50/40 text-orange-950 p-2.5 rounded-lg border border-orange-100 italic leading-relaxed font-sans">
                              "{stepRec.additionalObs}"
                            </p>
                          </div>
                        )}

                        {stepRec.image && (
                          <div className="text-xs text-center">
                            <span className="font-bold text-gray-700 block mb-1 text-left font-sans">QA Photo Documentation:</span>
                            <div className="relative rounded-lg overflow-hidden border border-gray-200 max-w-[140px] bg-black">
                              <img
                                src={stepRec.image}
                                alt={`Step ${sIndex} check`}
                                referrerPolicy="no-referrer"
                                className="w-full h-auto object-cover max-h-[140px]"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                  </div>
                );
              })}
            </div>

          </div>
        )}

      </div>
    );
  };

  return (
    <div className="space-y-6">

      {/* Live Collaborative Team Presence & Production Activity Stream */}
      <div className="bg-slate-900 text-slate-100 rounded-3xl p-5 shadow-lg border border-slate-800 transition-all duration-300">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4 pb-4 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <div className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </div>
              <h3 className="font-bold text-slate-100 tracking-tight text-sm uppercase tracking-wider flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-400" />
                Live Collaborative Workstation Control Feed
              </h3>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Multi-user session monitor synchronized in real-time across active production shifts.
            </p>
          </div>
          <div className="bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-700/50 flex items-center gap-2 text-xs font-semibold text-slate-300">
            <Clock className="w-3.5 h-3.5 text-blue-400 animate-pulse" />
            Shift Active • Collaborative Engine Connected
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Active users dashboard panel */}
          <div className="lg:col-span-4 bg-slate-950/40 p-4 rounded-2xl border border-slate-800/80">
            <h4 className="text-xs font-bold text-slate-300 mb-3 uppercase tracking-widest flex items-center gap-1.5">
              <Users className="w-4 h-4 text-blue-400" />
              Online Technicians ({activeOperators.length || 1})
            </h4>
            <div className="space-y-2.5 max-h-[175px] overflow-y-auto pr-1">
              {activeOperators.length > 0 ? (
                activeOperators.map((op) => (
                  <div key={op.username} className="flex items-center justify-between p-2 rounded-xl bg-slate-900/40 border border-slate-800/40">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgb(52,211,153)]" />
                      <div>
                        <span className="text-xs font-bold text-slate-200">
                          {op.username} {currentUser?.username === op.username && <span className="text-[10px] text-emerald-400 font-normal">(You)</span>}
                        </span>
                        <span className="block text-[9px] text-slate-500 font-mono leading-none capitalize mt-0.5">{op.role} Shift Desk</span>
                      </div>
                    </div>
                    <span className="text-[9px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-md font-mono">
                      Active
                    </span>
                  </div>
                ))
              ) : (
                currentUser && (
                  <div className="flex items-center justify-between p-2 rounded-xl bg-slate-900/40 border border-slate-800/40">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgb(52,211,153)]" />
                      <div>
                        <span className="text-xs font-bold text-slate-200">
                          {currentUser.username} <span className="text-[10px] text-emerald-400 font-normal">(You)</span>
                        </span>
                        <span className="block text-[9px] text-slate-500 font-mono leading-none capitalize mt-0.5">{currentUser.role} Shift Desk</span>
                      </div>
                    </div>
                    <span className="text-[9px] bg-slate-800 text-emerald-400 px-2 py-0.5 rounded-md font-mono">
                      Active
                    </span>
                  </div>
                )
              )}
            </div>
          </div>

          {/* Activity Event Logs Stream Ticker */}
          <div className="lg:col-span-8 bg-slate-950/40 p-4 rounded-2xl border border-slate-800/80">
            <h4 className="text-xs font-bold text-slate-300 mb-3 uppercase tracking-widest flex items-center gap-1.5 font-sans">
              <Activity className="w-4 h-4 text-emerald-400" />
              Shared Assembly Line Event Log Stream
            </h4>
            <div className="space-y-2 max-h-[175px] overflow-y-auto pr-1 select-none font-mono text-[11px] text-slate-400 custom-scrollbar">
              {recentLogs.length > 0 ? (
                recentLogs.map((log) => (
                  <div key={log.id} className="p-2 border-b border-slate-900/60 last:border-b-0 hover:bg-slate-900/20 rounded-lg flex justify-between items-start gap-4 transition-colors">
                    <div className="flex items-start gap-2">
                      <span className="text-blue-400 font-bold leading-normal shrink-0">[{log.username}]</span>
                      <span className="text-slate-300 line-clamp-2">{log.action}</span>
                    </div>
                    <span className="text-[10px] text-slate-500 shrink-0 font-sans mt-0.5">
                      {formatLogTime(log.timestamp)}
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-center py-6 text-slate-500 text-xs">
                  No active production updates recorded on the line yet.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>



      {/* Project Volumetric & Timeline Progress Analytics */}
      {false && (
      <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-5">
        
        {/* Header containing premium tab selector and active actions */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-4 border-b border-gray-100">
          <div>
            <h3 className="font-extrabold text-gray-950 text-base flex items-center gap-2">
              <Activity className="w-5 h-5 text-indigo-600" />
              Advanced Portfolio Analytics & Forecasting Hub
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">Automated target matching, daily trends, drop-off analysis, and predictive timelines</p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {/* View Tabs Selector */}
            <div className="bg-gray-100 p-1.5 rounded-xl border border-gray-200/50 flex items-center gap-1">
              <button
                onClick={() => setPortfolioViewTab("analytics")}
                className={`text-[10.5px] font-black uppercase tracking-wider px-3.5 py-1.5 rounded-lg cursor-pointer transition ${
                  portfolioViewTab === "analytics"
                    ? "bg-white text-indigo-950 shadow-xs border border-gray-150"
                    : "text-gray-500 hover:text-gray-800"
                }`}
              >
                Analytics Insights
              </button>
              <button
                onClick={() => setPortfolioViewTab("projects")}
                className={`text-[10.5px] font-black uppercase tracking-wider px-3.5 py-1.5 rounded-lg cursor-pointer transition ${
                  portfolioViewTab === "projects"
                    ? "bg-white text-indigo-950 shadow-xs border border-gray-150"
                    : "text-gray-500 hover:text-gray-800"
                }`}
              >
                Project Targets
              </button>
            </div>

            {/* Master Export Trigger */}
            <button
              onClick={() => {
                try {
                  exportAllProjectsSummaryToPDF(projects, records, tolerances);
                } catch (e: any) {
                  alert("Failed to compile master portfolio PDF: " + e.message);
                }
              }}
              className="bg-indigo-600 hover:bg-indigo-700 cursor-pointer text-white text-[11px] font-extrabold px-3.5 py-2 rounded-xl flex items-center gap-1.5 shadow-sm hover:shadow-md transition active:scale-95"
              title="Download Master Projects Comparative Performance PDF Report"
            >
              <FileText className="w-3.5 h-3.5" />
              Portfolio audit (PDF)
            </button>
          </div>
        </div>

        {/* Dynamic Calculations Section */}
        {(() => {
          // Calculate general stats across all recorded GRP pipes
          const totalPipesProduced = records.length;
          
          // Volume produced (convert mm to meters from header.length)
          const totalMetersProduced = records.reduce((sum, r) => sum + (Number(r.header?.length) || 0), 0) / 1000;
          const totalMetersProducedRound = Math.round(totalMetersProduced * 100) / 100;

          // Identify compliant (liberated) pipes
          const liberatedPipes = records.filter((p) => {
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

          const totalMetersLiberated = liberatedPipes.reduce((sum, p) => sum + (Number(p.header?.length) || 0), 0) / 1000;
          const totalMetersLiberatedRound = Math.round(totalMetersLiberated * 100) / 100;

          // Liberation rate
          const liberatedProductRate = totalPipesProduced > 0 ? Math.round((liberatedPipes.length / totalPipesProduced) * 100) : 100;
          const volumetricLiberationRate = totalMetersProduced > 0 ? Math.round((totalMetersLiberated / totalMetersProduced) * 100) : 100;

          // Group by date
          const rawDailyGroup: Record<string, { produced: number; liberated: number; total: number; failed: number }> = {};
          records.forEach((p) => {
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
          records.forEach((p) => {
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

          // Convert monthly keys to nice human labels (e.g. "May 2026")
          const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
          const formatMonthKey = (key: string): string => {
            const parts = key.split("-");
            if (parts.length < 2) return key;
            const year = parts[0];
            const mIdx = parseInt(parts[1], 10) - 1;
            if (mIdx >= 0 && mIdx < 12) {
              return `${MONTH_NAMES[mIdx]} ${year}`;
            }
            return key;
          };

          // Step quality calculations (Failure bottle-necks)
          const gatesTested: Record<number, number> = {};
          const gatesFailed: Record<number, number> = {};
          for (let s = 1; s <= 8; s++) {
            gatesTested[s] = 0;
            gatesFailed[s] = 0;
          }
          records.forEach((p) => {
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
          let totalPortfolioTarget = projects.reduce((sum, p) => sum + (p.targetQuantityMeters || 1000), 0);
          if (totalPortfolioTarget === 0) totalPortfolioTarget = 1000;

          const remainingTargetMeters = Math.max(0, totalPortfolioTarget - totalMetersProduced);
          const remainingTargetProducedPercent = Math.min(100, Math.round((totalMetersProduced / totalPortfolioTarget) * 100));

          // Velocity and Duration predictions
          const speedDailyMeters = avgMetersPerDay;
          const estimatedShiftsToFinish = speedDailyMeters > 0 ? Math.ceil(remainingTargetMeters / speedDailyMeters) : 0;
          const estimatedWeeksToFinish = speedDailyMeters > 0 ? Math.round((remainingTargetMeters / speedDailyMeters / 7) * 10) / 10 : 0;

          // Reject forecast
          const overallRejectCount = records.filter(p => {
            for (let s = 1; s <= 8; s++) {
              if (p.steps[s]?.qualityChecks?.some(q => q.status === "Fail")) return true;
            }
            return false;
          }).length;
          const overallRejectRate = totalPipesProduced > 0 ? overallRejectCount / totalPipesProduced : 0;
          const forecastedFutureRejectPipes = Math.round(overallRejectRate * (remainingTargetMeters / (avgMetersPerDay || 10) * avgPipesPerDay));

          if (portfolioViewTab === "analytics") {
            return (
              <div className="space-y-6 animate-fade-in">
                
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
                  <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 flex flex-col justify-between relative overflow-hidden group hover:shadow-md transition">
                    <div className="absolute top-0 right-0 p-3 text-slate-200 group-hover:text-slate-300 transition-colors">
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
                  <div className="bg-white p-4.5 rounded-xl border border-gray-150 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-xs font-extrabold text-gray-950 uppercase tracking-widest">Daily Performance Trend</h4>
                        <p className="text-[10px] text-gray-400">Manufactured vs. Compliant volume (meters) over last 7 active shifts</p>
                      </div>
                      <span className="text-[9.5px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md font-bold border border-indigo-100">
                        Past 7 shifts
                      </span>
                    </div>

                    <div className="h-56 bg-gray-50/45 rounded-xl border border-gray-100/80 p-3 flex flex-col justify-between">
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
                    <div className="flex justify-between items-center text-[10px] border-t border-gray-100 pt-2 pb-0.5 px-1">
                      <div className="flex items-center gap-4">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 bg-indigo-600 rounded-xs inline-block"></span>
                          <strong className="text-gray-600 font-semibold">Volume Manufactured (M)</strong>
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 bg-emerald-500 rounded-xs inline-block"></span>
                          <strong className="text-gray-600 font-semibold">Volume Liberated pass (M)</strong>
                        </span>
                      </div>
                      <span className="text-[9px] text-gray-400 italic font-medium">Auto-scaling active</span>
                    </div>

                  </div>

                </div>

                {/* Estimation and Predictive Time of Completion Segment */}
                <div className="bg-radial from-slate-900 to-indigo-950 p-5 rounded-2xl border border-slate-950 text-white space-y-4 shadow-sm">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[9.5px] bg-indigo-500/25 border border-indigo-400/20 text-indigo-300 font-black tracking-widest uppercase px-2 py-0.5 rounded">
                        COGNITIVE ESTIMATION ALGORITHM
                      </span>
                      <h4 className="font-extrabold text-base tracking-tight font-sans mt-1">Linear Timeline Forecasts & Target Milestones</h4>
                    </div>
                    <Clock className="w-5 h-5 text-indigo-400" />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-1">
                    
                    <div className="bg-white/5 p-3 rounded-xl border border-white/10 space-y-1">
                      <span className="text-[10px] text-indigo-200/70 font-bold block uppercase tracking-wider">Target manufactured scope</span>
                      <strong className="text-xl font-bold font-sans block text-white">{totalPortfolioTarget.toLocaleString()}m</strong>
                      <span className="text-[10px] text-indigo-300 font-semibold block">{remainingTargetProducedPercent}% of target delivered</span>
                    </div>

                    <div className="bg-white/5 p-3 rounded-xl border border-white/10 space-y-1">
                      <span className="text-[10px] text-indigo-200/70 font-bold block uppercase tracking-wider">Remaining meters balance</span>
                      <strong className="text-xl font-bold font-sans block text-white">{remainingTargetMeters.toLocaleString()}m</strong>
                      <span className="text-[10px] text-rose-300 font-semibold block">{totalPortfolioTarget > 0 ? Math.round((remainingTargetMeters/totalPortfolioTarget)*100) : 0}% balance to manufacture</span>
                    </div>

                    <div className="bg-white/5 p-3 rounded-xl border border-white/10 space-y-1">
                      <span className="text-[10px] text-indigo-200/70 font-bold block uppercase tracking-wider">Est. finished days</span>
                      <strong className="text-xl font-bold font-sans block text-emerald-400">
                        {remainingTargetMeters <= 0 ? "Completed" : `${estimatedShiftsToFinish} shift days`}
                      </strong>
                      <span className="text-[10px] text-indigo-300 font-semibold block">
                        {remainingTargetMeters <= 0 ? "LEDGER SATISFIED" : `@ ${estimatedWeeksToFinish} operational weeks`}
                      </span>
                    </div>

                    <div className="bg-white/5 p-3 rounded-xl border border-white/10 space-y-1">
                      <span className="text-[10px] text-indigo-200/70 font-bold block uppercase tracking-wider">Anomalous QC Forecasts</span>
                      <strong className="text-xl font-bold font-sans block text-amber-400">
                        {remainingTargetMeters <= 0 ? "0 rejects" : `~ ${forecastedFutureRejectPipes} reject units`}
                      </strong>
                      <span className="text-[10px] text-indigo-300 font-semibold block">Predicted based on historical rates</span>
                    </div>

                  </div>

                  {/* Progress Line */}
                  <div className="space-y-1.5">
                    <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden relative">
                      <div 
                        className="bg-indigo-500 h-full rounded-full transition-all duration-500"
                        style={{ width: `${remainingTargetProducedPercent}%` }}
                      ></div>
                    </div>
                    <div className="flex justify-between text-[10px] text-indigo-200/60 font-medium">
                      <span>Manufactured: {totalMetersProducedRound}m ({remainingTargetProducedPercent}%)</span>
                      <span>Target Scope: {totalPortfolioTarget}m ({100}%)</span>
                    </div>
                  </div>

                  <p className="text-[9.5px] text-indigo-200/60 leading-normal italic bg-indigo-950/40 p-2.5 rounded-lg border border-indigo-900/40">
                    *Estimations are modeled dynamically based on shift registers. Ensure raw transition temperatures are maintained to minimize future anomalies.
                  </p>
                </div>

                {/* Monthly Statistics Summary Table */}
                <div className="bg-white p-4.5 rounded-xl border border-gray-150 space-y-3">
                  <div>
                    <h4 className="text-xs font-extrabold text-gray-950 uppercase tracking-widest">Monthly GRP Volume Summary Logs</h4>
                    <p className="text-[10.5px] text-gray-400">Monthly breakdown of manufactured lengths and dynamic certified compliance passing percentage</p>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left text-gray-500">
                      <thead className="text-[10px] text-gray-400 font-extrabold bg-gray-50 uppercase tracking-wider border-b border-gray-100">
                        <tr>
                          <th className="py-2.5 px-3">MONTH PERIOD</th>
                          <th className="py-2.5 px-3">PIPES MANUFACTURED</th>
                          <th className="py-2.5 px-3">MANUFACTURED VOLUME (M)</th>
                          <th className="py-2.5 px-3">LIBERATED VOLUME (M)</th>
                          <th className="py-2.5 px-3">COMPLIANCE YIELD</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 font-sans font-medium text-gray-700">
                        {Object.keys(rawMonthlyGroup).length === 0 ? (
                          <tr>
                            <td colSpan={5} className="py-6 text-center text-gray-400 text-xs font-normal">
                              No monthly metrics found. Register a pipe to generate trend tables.
                            </td>
                          </tr>
                        ) : (
                          Object.entries(rawMonthlyGroup).sort((a,b) => b[0].localeCompare(a[0])).map(([mKey, mVal]) => {
                            const rate = mVal.total > 0 ? Math.round(((mVal.total - mVal.failed) / mVal.total) * 100) : 100;
                            const rateTextColor = rate >= 95 ? "text-emerald-600 font-black" : rate >= 80 ? "text-indigo-600 font-bold" : "text-rose-600 font-bold";

                            return (
                              <tr key={mKey} className="hover:bg-gray-50/50 transition">
                                <td className="py-2.5 px-3 font-bold text-gray-950">{formatMonthKey(mKey)}</td>
                                <td className="py-2.5 px-3 font-mono">{mVal.total} pipes</td>
                                <td className="py-2.5 px-3 font-mono">{mVal.produced.toFixed(1)} m</td>
                                <td className="py-2.5 px-3 font-mono text-emerald-600">{mVal.liberated.toFixed(1)} m</td>
                                <td className="py-2.5 px-3">
                                  <span className={`px-2 py-0.5 rounded-md text-[10px] border ${rate >= 90 ? 'bg-emerald-50 border-emerald-100' : 'bg-amber-50 border-amber-100'} ${rateTextColor}`}>
                                    {rate}% PASS
                                  </span>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>
            );
          } else {
            // View Tab: projects (Standard portfolio lists updated with pristine styling)
            return (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in">
                {projects.map((project) => {
                  const projPipes = records.filter(p => p.header?.projectWorkOrder?.toUpperCase() === project.projectCode?.toUpperCase());
                  const totalMetersProduced = projPipes.reduce((sum, p) => sum + (Number(p.header?.length) || 0), 0) / 1000;
                  
                  const totalMetersLiberated = projPipes.reduce((sum, p) => {
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

                  const targetMeters = project.targetQuantityMeters || 1000;
                  const producedRounded = Math.round(totalMetersProduced * 100) / 100;
                  const liberatedRounded = Math.round(totalMetersLiberated * 100) / 100;

                  const producedPercent = Math.min(100, Math.round((producedRounded / targetMeters) * 100)) || 0;
                  const liberatedPercentFixed = Math.min(100, Math.round((liberatedRounded / targetMeters) * 100)) || 0;

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
                    <div key={project.id} className="p-5 rounded-2xl border border-gray-150 bg-gray-50/45 hover:bg-gray-50/75 transition space-y-4">
                      
                      {/* Card Header */}
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-extrabold text-gray-950 text-base font-sans tracking-tight">
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
                              className="text-[10px] font-black uppercase text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-2.5 py-1 rounded-lg flex items-center gap-1.5 cursor-pointer transition"
                              title="Generate Detailed Analysis & Diagnostics PDF Report"
                            >
                              <FileText className="w-3.5 h-3.5 text-indigo-600" />
                              detailed report
                            </button>
                          </div>
                          <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mt-1">
                            Aggregate Target Volume: <strong className="text-gray-700">{targetMeters} meters</strong>
                          </p>
                        </div>

                        <span className={`px-2.5 py-1 rounded-md text-[9.5px] font-extrabold border uppercase tracking-wider ${statusBadgeBg}`}>
                          {timelineStatus}
                        </span>
                      </div>

                      {/* Progress Metrics Indicators */}
                      <div className="grid grid-cols-2 gap-3 bg-white p-3.5 rounded-xl border border-gray-150 shadow-2xs">
                        <div className="space-y-0.5">
                          <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">Total Produced</span>
                          <strong className="text-gray-950 text-[16px] font-sans block">{producedRounded}m</strong>
                          <span className="text-[10px] font-semibold text-indigo-600 block">{producedPercent}% of target</span>
                        </div>

                        <div className="space-y-0.5 border-l border-gray-100 pl-3.5">
                          <span className="text-[10px] text-emerald-500 font-bold uppercase tracking-wider block">Total Liberated</span>
                          <strong className="text-emerald-700 text-[16px] font-sans block">{liberatedRounded}m</strong>
                          <span className="text-[10px] font-semibold text-emerald-600 block">{liberatedPercentFixed}% of target</span>
                        </div>
                      </div>

                      {/* Progress bar visual slider */}
                      <div className="space-y-2 pt-1">
                        <div className="w-full bg-gray-200 h-2 rounded-lg overflow-hidden relative">
                          <div 
                            className="bg-indigo-600 h-full rounded-lg transition-all duration-500 absolute top-0 left-0 animate-fade-in" 
                            style={{ width: `${producedPercent}%` }}
                          />
                          <div 
                            className="bg-emerald-500 h-full rounded-lg transition-all duration-500 absolute top-0 left-0 mix-blend-overlay opacity-95" 
                            style={{ width: `${liberatedPercentFixed}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-[10px] text-gray-400 font-bold">
                          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-indigo-600"></span> Produced</span>
                          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Liberated (Compliant Pass)</span>
                        </div>
                      </div>

                      {/* Reference allocating sublist */}
                      <div className="space-y-2 pt-2 border-t border-gray-150/80">
                        <span className="text-[10px] font-extrabold text-gray-450 uppercase tracking-wider block">
                          Per-Reference allocations & progress
                        </span>

                        <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                          {project.settingReferences?.map((ref) => {
                            const refObj = project.settingRefDetails?.find(d => d.settingReference.toUpperCase() === ref.toUpperCase());
                            const refTarget = refObj?.targetQuantityMeters || Math.round((targetMeters / project.settingReferences.length) * 10) / 10;
                            const refStart = refObj?.productionStartDate || project.productionStartDate;
                            const refEnd = refObj?.productionEndDate || project.productionEndDate;

                            const refPipes = projPipes.filter(p => p.header?.settingReference?.toUpperCase() === ref.toUpperCase());
                            const refProduced = refPipes.reduce((sum, p) => sum + (Number(p.header?.length) || 0), 0) / 1000;
                            
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

                            let refTimelineStatus = "Unscheduled";
                            let refElapsed = 0;
                            let refRemainingStr = "";
                            let refStatusBadgeBg = "bg-gray-100/70 text-gray-500 border-gray-200/50";

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
                                  refStatusBadgeBg = "bg-indigo-50 text-indigo-600 border-indigo-150/70";
                                } else {
                                  refTimelineStatus = "Behind";
                                  refStatusBadgeBg = "bg-amber-50 text-amber-600 border-amber-150 animate-pulse";
                                }
                              }
                            }

                            return (
                              <div key={ref} className="bg-white rounded-xl p-3 border border-gray-150 hover:border-indigo-150/85 transition space-y-2">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-mono text-[10px] font-black text-indigo-950 bg-indigo-50/80 px-2 py-0.5 rounded border border-indigo-100">
                                      {ref}
                                    </span>
                                    <span className="text-[10px] text-gray-400 font-bold">Alloc: {refTarget}m</span>
                                  </div>

                                  <span className={`px-1.5 py-0.5 rounded-sm text-[8px] font-black uppercase tracking-wider border ${refStatusBadgeBg}`}>
                                    {refTimelineStatus} {refRemainingStr ? `• ${refRemainingStr}` : ""}
                                  </span>
                                </div>

                                <div className="grid grid-cols-2 gap-4 text-[10px] font-bold">
                                  <div className="space-y-0.5">
                                    <div className="flex justify-between">
                                      <span className="text-gray-400 font-bold">Produced:</span>
                                      <span className="text-gray-800 font-bold">{refProdPercent}%</span>
                                    </div>
                                    <div className="w-full bg-gray-100 h-1 rounded-sm overflow-hidden">
                                      <div className="bg-indigo-600 h-full" style={{ width: `${refProdPercent}%` }}></div>
                                    </div>
                                  </div>

                                  <div className="space-y-0.5">
                                    <div className="flex justify-between">
                                      <span className="text-emerald-500 font-bold">Liberated:</span>
                                      <span className="text-emerald-700 font-bold">{refLibPercent}%</span>
                                    </div>
                                    <div className="w-full bg-gray-100 h-1 rounded-sm overflow-hidden">
                                      <div className="bg-emerald-500 h-full" style={{ width: `${refLibPercent}%` }}></div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Timeline schedule bar */}
                      {project.productionStartDate && (
                        <div className="p-3 rounded-xl border border-dotted border-gray-200 bg-white text-[11px] space-y-1.5 mt-2">
                          <div className="flex justify-between text-gray-500 font-bold">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5 text-gray-400" />
                              Overall Elapsed: {elapsedPercent}%
                            </span>
                            <span className="flex items-center gap-1 text-slate-800">
                              <Clock className="w-3.5 h-3.5 text-indigo-500" />
                              {remainingDaysStr}
                            </span>
                          </div>
                          <div className="w-full bg-gray-100 h-1 rounded-full overflow-hidden">
                            <div className={`h-full ${isExpired ? 'bg-rose-500' : 'bg-slate-500'}`} style={{ width: `${elapsedPercent}%` }}></div>
                          </div>
                        </div>
                      )}

                    </div>
                  );
                })}
              </div>
            );
          }
        })()}

      </div>
      )}

      {/* Dynamic Failed & NCR Exception PDF Report Section */}
      <div className="bg-gradient-to-r from-rose-50/50 to-amber-50/50 border border-rose-100 rounded-3xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-3 border-b border-rose-100/60">
          <div>
            <h3 className="font-extrabold text-rose-950 text-sm flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-rose-600" />
              Automated Compliance & Exception Report Generator
            </h3>
            <p className="text-xs text-rose-700/80 mt-0.5">
              Generate daily, weekly, or monthly PDF reports of all failed quality checks and non-conforming pipes, including operator remarks and photo documentation.
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
              className="w-full bg-white border border-rose-200 text-xs p-2 rounded-xl focus:outline-none focus:border-rose-500 font-medium text-rose-900"
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

      {/* Filters Search Layout */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-xs space-y-4">
        <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
          <ListFilter className="w-4 h-4 text-blue-600" />
          <h4 className="text-xs font-bold text-gray-700 uppercase tracking-widest">
            Audit Query & Filtering Controls
          </h4>
        </div>

        {/* Triple Search Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="relative">
            <input
              type="text"
              placeholder="Search Pipe ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 focus:bg-white focus:border-blue-500 text-sm py-2 px-3 pl-9 rounded-xl outline-none transition font-sans"
            />
            <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-3" />
          </div>

          <div className="relative">
            <input
              type="text"
              placeholder="Search Project Code..."
              value={projectSearch}
              onChange={(e) => setProjectSearch(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 focus:bg-white focus:border-blue-500 text-sm py-2 px-3 pl-9 rounded-xl outline-none transition font-sans"
            />
            <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-3" />
          </div>

          <div className="relative">
            <input
              type="text"
              placeholder="Search Lot Number..."
              value={lotSearch}
              onChange={(e) => setLotSearch(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 focus:bg-white focus:border-blue-500 text-sm py-2 px-3 pl-9 rounded-xl outline-none transition font-sans"
            />
            <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-3" />
          </div>
        </div>

        {/* Filtering Dropdowns */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Pipe Type Selection</label>
            <select
              value={selectedPipeType}
              onChange={(e) => setSelectedPipeType(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 text-xs p-2 rounded-xl focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Pipe Structural Classes</option>
              <option value="Bell/Spigot GRE">Bell/Spigot GRE</option>
              <option value="Bell/Spigot GRV">Bell/Spigot GRV</option>
              <option value="Bell/Spigot GRP">Bell/Spigot GRP</option>
              <option value="Plain Ends GRE">Plain Ends GRE</option>
              <option value="Plain Ends GRV">Plain Ends GRV</option>
              <option value="Plain Ends GRP">Plain Ends GRP</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">QA Evaluation State</label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 text-xs p-2 rounded-xl focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Inspection States</option>
              <option value="Pass">Pass / Approved</option>
              <option value="Fail">Rejected / Fail</option>
              <option value="Product Non-Conform">Product Non-Conform</option>
              <option value="In Progress">In Progress / Uncompleted</option>
            </select>
          </div>

          <div className="col-span-2 flex flex-col sm:flex-row items-center sm:items-end justify-between gap-3 mt-1">
            <span className="text-[11px] text-gray-400 italic self-center sm:self-end">
              Displaying {filteredRecords.length} of {records.length} registered trackers
            </span>
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              <button
                id="excel-upload-trigger-btn"
                onClick={() => {
                  setUploadError("");
                  setParsedImportRecords([]);
                  setSuccessfulImportCount(null);
                  setShowReloadModal(true);
                }}
                className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold px-4 py-2.5 rounded-xl flex items-center justify-center gap-2 transition shadow-sm hover:shadow active:shadow-none cursor-pointer font-sans"
              >
                <Upload className="w-4 h-4" />
                Reload Data from Excel
              </button>

              <button
                id="excel-download-btn"
                onClick={handleExportToExcel}
                className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold px-4 py-2.5 rounded-xl flex items-center justify-center gap-2 transition shadow-sm hover:shadow active:shadow-none cursor-pointer font-sans"
              >
                <FileSpreadsheet className="w-4 h-4" />
                Download Excel Report
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Pipe list display grouped by projects and subfolders */}
      <div className="space-y-4">
        {filteredRecords.length === 0 ? (
          <div className="bg-white p-12 rounded-2xl border border-gray-100 text-center flex flex-col items-center">
            <Box id="no-pipes-box-icon" className="w-12 h-12 text-gray-300 mb-2.5" />
            <h4 className="font-semibold text-gray-700 text-sm">No matching pipe records found</h4>
            <p className="text-xs text-gray-400 max-w-sm mt-1 leading-snug">
              Modify your search keywords or parameters, or select "Tracker" in the bottom menu to initialize a fresh pipe run data collection.
            </p>
          </div>
        ) : (
          (() => {
            // Group *all* pipes belonging to a project flatly
            const projectsMap: Record<string, PipeRecord[]> = {};

            filteredRecords.forEach((pipe) => {
              const projName = pipe.header.projectWorkOrder || "Unassigned Project";
              if (!projectsMap[projName]) {
                projectsMap[projName] = [];
              }
              projectsMap[projName].push(pipe);
            });

            // Extract numeric sequence of digits from pipeId
            const getPipeNumberVal = (pipeId: string): number => {
              const match = pipeId.match(/\d+/);
              return match ? parseInt(match[0], 10) : 0;
            };

            const sortPipesAsc = (pList: PipeRecord[]) => {
              return [...pList].sort((a, b) => {
                const numA = getPipeNumberVal(a.pipeId);
                const numB = getPipeNumberVal(b.pipeId);
                if (numA !== numB) {
                  return numA - numB; // Lower to higher numbers (ascending, less to higher)
                }
                return a.pipeId.localeCompare(b.pipeId, undefined, { numeric: true, sensitivity: "base" });
              });
            };

            const projectNames = Object.keys(projectsMap).sort((a, b) => a.localeCompare(b));

            const isSearching = searchTerm.trim() !== "" || projectSearch.trim() !== "" || lotSearch.trim() !== "";

            if (isSearching) {
              const sortedFilteredList = sortPipesAsc(filteredRecords);
              return (
                <div className="space-y-4">
                  <div className="flex justify-between items-center bg-blue-50/40 p-3 rounded-xl border border-blue-100/60 shadow-3xs">
                    <span className="text-xs font-bold text-blue-900 font-sans flex items-center gap-1.5">
                      🔎 Flat Search Results ({sortedFilteredList.length} Unit{sortedFilteredList.length === 1 ? "" : "s"} - Folders Bypassed)
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setSearchTerm("");
                        setProjectSearch("");
                        setLotSearch("");
                      }}
                      className="text-[10px] font-bold text-blue-700 hover:text-blue-800 underline cursor-pointer"
                    >
                      Clear Search
                    </button>
                  </div>
                  <div className="space-y-4">
                    {sortedFilteredList.slice(0, visibleCount).map((pipe) => {
                      const completeness = calculatePipeCompleteness(pipe);
                      const isSelfExpanded = expandedPipeId === pipe.pipeId;
                      return renderPipeCardInFolder(pipe, completeness, isSelfExpanded);
                    })}
                  </div>
                  {sortedFilteredList.length > visibleCount && (
                    <div className="p-4 text-center">
                      <button
                        type="button"
                        onClick={() => setVisibleCount(prev => prev + 25)}
                        className="bg-blue-650 hover:bg-blue-700 active:scale-95 text-white font-bold text-xs py-2 px-6 rounded-lg border border-blue-700 transition cursor-pointer shadow-3xs hover:shadow-xs font-sans"
                      >
                        Load More Results (+25)
                      </button>
                    </div>
                  )}
                </div>
              );
            }

            return (
              <div className="space-y-6">
                {/* Expand / Collapse All control triggers */}
                <div className="flex justify-between items-center bg-gray-50/50 p-3 rounded-xl border border-gray-200">
                  <span className="text-xs font-semibold text-gray-500 font-sans">
                    🛠️ Project Directory Tree View
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const projExp: Record<string, boolean> = {};
                        const subExp: Record<string, boolean> = {};
                        projectNames.forEach((name) => {
                          projExp[name] = true;
                        });
                        filteredRecords.forEach((pipe) => {
                          const name = pipe.header.projectWorkOrder || "Unassigned Project";
                          const specKey = `DN${pipe.header.diameter} - PN${pipe.header.pressure} - SN${pipe.header.stiffness}`;
                          const lotKey = pipe.header.lotNo || "Unspecified Lot";
                          subExp[`${name}-${specKey}`] = true;
                          subExp[`${name}-${specKey}-${lotKey}`] = true;
                        });
                        setExpandedProjects(projExp);
                        setExpandedSubfolders(subExp);
                      }}
                      className="text-[11px] font-bold text-blue-700 bg-blue-50/55 hover:bg-blue-100 hover:text-blue-800 border border-blue-200 rounded-lg px-2.5 py-1.5 transition cursor-pointer"
                    >
                      📁 Expand All
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const projExp: Record<string, boolean> = {};
                        const subExp: Record<string, boolean> = {};
                        projectNames.forEach((name) => {
                          projExp[name] = false;
                        });
                        filteredRecords.forEach((pipe) => {
                          const name = pipe.header.projectWorkOrder || "Unassigned Project";
                          const specKey = `DN${pipe.header.diameter} - PN${pipe.header.pressure} - SN${pipe.header.stiffness}`;
                          const lotKey = pipe.header.lotNo || "Unspecified Lot";
                          subExp[`${name}-${specKey}`] = false;
                          subExp[`${name}-${specKey}-${lotKey}`] = false;
                        });
                        setExpandedProjects(projExp);
                        setExpandedSubfolders(subExp);
                      }}
                      className="text-[11px] font-bold text-gray-755 bg-white hover:bg-gray-100 border border-gray-250 rounded-lg px-2.5 py-1.5 transition cursor-pointer shadow-3xs"
                    >
                      📂 Collapse All
                    </button>
                  </div>
                </div>

                {projectNames.map((projKey) => {
                  const pipesList = projectsMap[projKey];
                  const totalInProj = pipesList.length;

                  // Group elements of pipesList by specification, and then by Lot No
                  const specsMap: Record<string, Record<string, PipeRecord[]>> = {};

                  pipesList.forEach((pipe) => {
                    const specKey = `DN${pipe.header.diameter} - PN${pipe.header.pressure} - SN${pipe.header.stiffness}`;
                    if (!specsMap[specKey]) {
                      specsMap[specKey] = {};
                    }
                    const lotKey = pipe.header.lotNo || "Unspecified Lot";
                    if (!specsMap[specKey][lotKey]) {
                      specsMap[specKey][lotKey] = [];
                    }
                    specsMap[specKey][lotKey].push(pipe);
                  });

                  const specKeys = Object.keys(specsMap).sort((a, b) => {
                    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
                  });

                  const isProjExpanded = expandedProjects[projKey] === true; // Default: Collapsed (false)

                  return (
                    <div 
                      key={projKey} 
                      className="bg-zinc-50/20 rounded-2xl border border-gray-200 shadow-3xs overflow-hidden transition"
                    >
                      {/* Project Folder Header */}
                      <button
                        type="button"
                        onClick={() => setExpandedProjects(prev => ({ ...prev, [projKey]: !isProjExpanded }))}
                        className="w-full flex items-center justify-between p-4 bg-white hover:bg-gray-50/70 border-b border-gray-200 outline-none transition text-left cursor-pointer"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`p-2.5 rounded-xl ${isProjExpanded ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
                            {isProjExpanded ? (
                              <FolderOpen className="w-5 h-5 text-blue-600 fill-blue-50" strokeWidth={2.5} />
                            ) : (
                              <Folder className="w-5 h-5 text-gray-500 fill-gray-50" strokeWidth={2.5} />
                            )}
                          </div>
                          <div>
                            <span className="text-[10px] font-bold text-gray-400 block uppercase tracking-wider">Project Unit Workspace</span>
                            <span className="font-extrabold text-slate-800 text-base font-sans tracking-tight">
                              {projKey}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold bg-blue-100/85 text-blue-800 border border-blue-200 px-3 py-1 rounded-full font-sans">
                            {totalInProj} {totalInProj === 1 ? 'Pipe' : 'Pipes'}
                          </span>
                          <div className="p-1 rounded bg-gray-50 text-gray-400 border border-gray-150">
                            {isProjExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </div>
                        </div>
                      </button>

                      {/* Project Subfolders by Spec */}
                      {isProjExpanded && (
                        <div className="p-4 space-y-4 bg-gray-50/40">
                          {specKeys.map((specKey) => {
                            const specFolderKey = `${projKey}-${specKey}`;
                            const isSpecExpanded = expandedSubfolders[specFolderKey] === true; // Default: Collapsed (false)
                            const totalInSpec = Object.values(specsMap[specKey]).reduce((sum, list) => sum + list.length, 0);

                            return (
                              <div key={specKey} className="border border-slate-200 rounded-xl bg-slate-50/45 shadow-3xs overflow-hidden">
                                {/* Specification Folder Header */}
                                <button
                                  type="button"
                                  onClick={() => setExpandedSubfolders(prev => ({ ...prev, [specFolderKey]: !isSpecExpanded }))}
                                  className="w-full flex items-center justify-between px-3.5 py-3 bg-zinc-100 hover:bg-zinc-200/60 transition text-left cursor-pointer border-b border-zinc-200"
                                >
                                  <div className="flex items-center gap-2.5">
                                    <div className="text-slate-600">
                                      {isSpecExpanded ? (
                                        <FolderOpen className="w-4.5 h-4.5 text-slate-600 fill-slate-200" strokeWidth={2.5} />
                                      ) : (
                                        <Folder className="w-4.5 h-4.5 text-slate-500 fill-slate-200" strokeWidth={2.5} />
                                      )}
                                    </div>
                                    <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2">
                                      <span className="text-[9px] font-bold text-gray-455 block uppercase tracking-wider font-sans">SPECIFICATION:</span>
                                      <span className="text-xs font-bold text-slate-800 tracking-tight font-mono bg-white border border-gray-150 px-2.5 py-0.5 rounded-lg shadow-3xs">
                                        {specKey}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-bold bg-zinc-200 border border-zinc-300 text-slate-800 px-2.5 py-0.5 rounded-full font-sans">
                                      {totalInSpec} {totalInSpec === 1 ? 'pipe' : 'pipes'}
                                    </span>
                                    <div className="text-slate-500 bg-white p-0.5 rounded border border-gray-200">
                                      {isSpecExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                    </div>
                                  </div>
                                </button>

                                {/* Inner Lot N° subfolders */}
                                {isSpecExpanded && (
                                  <div id={`spec-${specKey}-lots`} className="p-3.5 space-y-3 bg-white">
                                    {Object.keys(specsMap[specKey]).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })).map((lotKey) => {
                                      const lotFolderKey = `${specFolderKey}-${lotKey}`;
                                      const isLotExpanded = expandedSubfolders[lotFolderKey] === true; // Default: Collapsed (false)
                                      const pipesInLot = sortPipesAsc(specsMap[specKey][lotKey]);
                                      const totalInLot = pipesInLot.length;

                                      return (
                                        <div key={lotKey} className="border border-indigo-100 rounded-xl bg-indigo-50/10 shadow-3xs overflow-hidden">
                                          {/* Lot Folder Header */}
                                          <button
                                            type="button"
                                            onClick={() => setExpandedSubfolders(prev => ({ ...prev, [lotFolderKey]: !isLotExpanded }))}
                                            className="w-full flex items-center justify-between px-3.5 py-2.5 bg-indigo-50/20 hover:bg-indigo-100/35 transition text-left cursor-pointer border-b border-indigo-100/50"
                                          >
                                            <div className="flex items-center gap-2.5">
                                              <div className="text-indigo-600">
                                                {isLotExpanded ? (
                                                  <FolderOpen className="w-4 h-4 text-indigo-600 fill-indigo-50" strokeWidth={2.5} />
                                                ) : (
                                                  <Folder className="w-4 h-4 text-indigo-500 fill-indigo-50" strokeWidth={2.5} />
                                                )}
                                              </div>
                                              <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2">
                                                <span className="text-[9px] font-extrabold text-indigo-500 block uppercase tracking-wider font-sans">Lot N°:</span>
                                                <span className="text-xs font-bold text-slate-800 tracking-tight font-mono bg-white border border-gray-150 px-2.5 py-0.5 rounded-lg shadow-3xs">
                                                  {lotKey}
                                                </span>
                                              </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                              <span className="text-[10px] font-bold bg-indigo-100 border border-indigo-200 text-indigo-800 px-2.5 py-0.5 rounded-full font-sans">
                                                {totalInLot} {totalInLot === 1 ? 'unit' : 'units'}
                                              </span>
                                              <div className="text-indigo-500 bg-white p-0.5 rounded border border-indigo-150">
                                                {isLotExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                              </div>
                                            </div>
                                          </button>

                                          {isLotExpanded && (
                                            <div className="p-3.5 space-y-3.5 bg-white border-t border-indigo-50/20">
                                              {pipesInLot.length === 0 ? (
                                                <p className="text-xs text-gray-400 italic py-3 text-center font-sans">No pipes inside this lot</p>
                                              ) : (
                                                pipesInLot.map((pipe) => {
                                                  const completeness = calculatePipeCompleteness(pipe);
                                                  const isSelfExpanded = expandedPipeId === pipe.pipeId;
                                                  return renderPipeCardInFolder(pipe, completeness, isSelfExpanded);
                                                })
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()
        )}
      </div>

      {showReloadModal && (
        <div id="excel-reload-modal-overlay" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in font-sans">
          <div id="excel-reload-modal-content" className="bg-white rounded-2xl shadow-xl border border-gray-150 w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2 text-slate-800">
                <FileSpreadsheet className="w-5 h-5 text-blue-600" />
                <h3 className="font-extrabold text-sm uppercase tracking-tight text-gray-900">Reload Data from Excel</h3>
              </div>
              <button
                onClick={() => setShowReloadModal(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition duration-150 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              <p className="text-xs text-gray-500 leading-relaxed">
                Refreshes, updates or entirely replaces the pipe manufacturing tracking ledger by importing a previously exported spreadsheet report.
              </p>

              {/* Upload Input Area */}
              <div className="border-2 border-dashed border-gray-200 hover:border-blue-500 rounded-xl p-6 text-center transition cursor-pointer relative bg-slate-50 hover:bg-blue-50/20">
                <input
                  type="file"
                  accept=".xlsx, .xls"
                  onChange={handleFileUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  disabled={isProcessingUpload}
                />
                <div className="flex flex-col items-center gap-2">
                  <div className="p-3 bg-white rounded-full shadow-xs border border-gray-150 text-blue-600">
                    <Upload className="w-6 h-6" />
                  </div>
                  <span className="text-xs font-bold text-slate-700">Click or Drag Excel File Here</span>
                  <span className="text-[10px] text-gray-400">Accepts .xlsx or .xls spreadsheets</span>
                </div>
              </div>

              {/* Loading State */}
              {isProcessingUpload && parsedImportRecords.length === 0 && !uploadError && (
                <div className="flex items-center justify-center gap-2 py-4 text-xs font-sans text-blue-600 animate-pulse">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Scanning rows and mapping keys from spreadsheet...</span>
                </div>
              )}

              {/* Error messages */}
              {uploadError && (
                <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl flex items-start gap-2 text-rose-700 text-xs leading-relaxed animate-fade-in">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{uploadError}</span>
                </div>
              )}

              {/* Success of upload indicator */}
              {successfulImportCount !== null && (
                <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl flex items-start gap-2 text-emerald-800 text-xs leading-relaxed animate-fade-in">
                  <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>Bingo! Successfully loaded {successfulImportCount} pipe manufacturing trackers from sheet!</span>
                </div>
              )}

              {/* Parsed records summary & Options */}
              {parsedImportRecords.length > 0 && (
                <div className="space-y-4 border-t border-gray-100 pt-4 animate-fade-in">
                  <div className="bg-slate-50 p-3.5 rounded-xl border border-gray-150 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] uppercase font-black text-gray-400 tracking-wider">Spreadsheet Inventory</span>
                      <span className="block font-black text-slate-800 text-sm font-mono mt-0.5">{parsedImportRecords.length} Pipe Records</span>
                    </div>
                    <span className="text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200 px-2.5 py-1 rounded-lg">
                      Ready to Ingest
                    </span>
                  </div>

                  {/* Mode Selector */}
                  <div className="space-y-2">
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider">Reloading Mode</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => setImportMode("merge")}
                        className={`p-3 rounded-xl border text-left transition flex flex-col gap-1 cursor-pointer ${
                          importMode === "merge"
                            ? "border-blue-500 bg-blue-50/20 text-blue-900 font-sans"
                            : "border-gray-200 hover:border-gray-300 text-slate-705 font-sans"
                        }`}
                      >
                        <span className="text-xs font-black">Merge (Smart Update)</span>
                        <span className="text-[9px] text-gray-400 leading-snug">
                          Updates matching Pipe IDs and preserves/inserts others.
                        </span>
                      </button>

                      <button
                        onClick={() => setImportMode("overwrite")}
                        className={`p-3 rounded-xl border text-left transition flex flex-col gap-1 cursor-pointer ${
                          importMode === "overwrite"
                            ? "border-amber-500 bg-amber-50/20 text-amber-900 font-sans"
                            : "border-gray-200 hover:border-gray-300 text-slate-705 font-sans"
                        }`}
                      >
                        <span className="text-xs font-black text-amber-700">Overwrite Database</span>
                        <span className="text-[9px] text-gray-400 leading-snug">
                          Deletes the current database state, resetting it to Excel contents.
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-4 border-t border-gray-100 bg-slate-50 flex items-center justify-between">
              <button
                onClick={() => setShowReloadModal(false)}
                className="px-4 py-2 text-xs font-bold text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition cursor-pointer"
                disabled={isProcessingUpload}
              >
                Cancel
              </button>

              {parsedImportRecords.length > 0 && (
                <button
                  onClick={handleConfirmImport}
                  className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow active:scale-95 transition flex items-center gap-2 cursor-pointer font-sans"
                  disabled={isProcessingUpload}
                >
                  {isProcessingUpload ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Ingesting...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-3.5 h-3.5" />
                      Confirm Ingest ({importMode})
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default React.memo(PipeDashboard);
