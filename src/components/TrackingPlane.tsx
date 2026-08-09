import React, { useState, useMemo, useEffect } from "react";
import * as XLSX from "xlsx";
import { 
  Building2, 
  Map, 
  Search, 
  Filter, 
  Wrench, 
  Layers2, 
  Infinity as LoopIcon, 
  Thermometer, 
  ArrowUpFromLine, 
  Sliders, 
  Bell, 
  ClipboardCheck, 
  AlertTriangle, 
  Truck, 
  Eye, 
  Play, 
  Sparkles, 
  RefreshCw, 
  Info,
  Layers,
  ChevronRight,
  ArrowRight,
  FileSpreadsheet,
  Upload,
  Download,
  X,
  Check,
  AlertCircle
} from "lucide-react";
import { PipeRecord, PipeType, ProjectConfig, ToleranceConfig, PipeHeader } from "../types";
import { formatDateForDisplay, toUTCMidnightISO } from "../utils/dateUtils";

interface TrackingPlaneProps {
  records: PipeRecord[];
  projects: ProjectConfig[];
  tolerances: ToleranceConfig[];
  onLoadPipe: (pipe: PipeRecord) => void;
  currentUserRole?: string;
  onDispatchPipe?: (pipeId: string, isDispatched: boolean) => Promise<void>;
  onBulkReload?: (records: PipeRecord[], mode: "merge" | "overwrite") => Promise<{ success: boolean; error?: string }>;
}

interface WorkstationConfig {
  id: string;
  stepNo: number | null; // null for dispatch, prep, quarantine
  name: string;
  icon: React.ComponentType<any>;
  color: string;
  borderColor: string;
  bgColor: string;
  badgeBg: string;
  description: string;
  procedure: string;
}

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

function TrackingPlane({ 
  records, 
  projects, 
  tolerances, 
  onLoadPipe,
  currentUserRole,
  onDispatchPipe,
  onBulkReload
}: TrackingPlaneProps) {
  const [selectedStationId, setSelectedStationId] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProject, setSelectedProject] = useState("all");
  const [selectedPipeType, setSelectedPipeType] = useState("all");
  const [selectedLot, setSelectedLot] = useState("all");
  const [hoveredPipeId, setHoveredPipeId] = useState<string | null>(null);
  const [ledgerSearchQuery, setLedgerSearchQuery] = useState("");

  // Excel File Ingestion/Reload states
  const [showExcelPanel, setShowExcelPanel] = useState(false);
  const [parsedImportRecords, setParsedImportRecords] = useState<PipeRecord[]>([]);
  const [uploadError, setUploadError] = useState("");
  const [isProcessingUpload, setIsProcessingUpload] = useState(false);
  const [importMode, setImportMode] = useState<"merge" | "overwrite">("merge");
  const [successfulImportCount, setSuccessfulImportCount] = useState<number | null>(null);

  const handleExportToExcel = () => {
    try {
      console.log("Preparing GRP Pipe QA ledger Excel export from Floor Map...", records);
      if (!records || records.length === 0) {
        alert("There are currently no records loaded in the system to export. Make sure you have created some pipe records.");
        return;
      }

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
        // Determine quarantine
        let isQuarantined = false;
        let ncrStep = "";
        for (let s = 1; s <= 8; s++) {
          const step = rec.steps[s] || (rec.steps as any)[String(s)];
          if (step) {
            if (step.isNonConform || (step.qualityChecks && step.qualityChecks.some((qc: any) => qc.status === "Fail"))) {
              isQuarantined = true;
              ncrStep = `Step ${s}`;
              break;
            }
          }
        }

        const s8 = rec.steps[8] || (rec.steps as any)["8"];
        const hasCompletedStep8 = s8 && s8.isCompleted;

        let activeStep = "";
        let isCommYard = "No";
        let isRpsYard = "No";
        let isQuarantine = "No";
        let isDelivered = "No";

        if (isQuarantined) {
          activeStep = `Quarantine (${ncrStep})`;
          isQuarantine = "Yes";
        } else if (rec.isDispatched) {
          activeStep = "Delivered Handover";
          isDelivered = "Yes";
        } else if (hasCompletedStep8) {
          const dest = ((s8.fields as any)?.pipeDestination || "").toUpperCase();
          const isRps = dest.includes("RPS-COMMERCIAL");
          if (isRps) {
            activeStep = "RPS Ready Yard";
            isRpsYard = "Yes";
          } else {
            activeStep = "Commercial Ready Yard";
            isCommYard = "Yes";
          }
        } else {
          let stepNo = 1;
          for (let s = 1; s <= 8; s++) {
            const step = rec.steps[s] || (rec.steps as any)[String(s)];
            if (!step || !step.isCompleted) {
              stepNo = s;
              break;
            }
          }
          const stationNames: { [key: number]: string } = {
            1: "Mold Preparation",
            2: "Liner Application",
            3: "Structural Winding",
            4: "Thermal Curing",
            5: "Demolding Core",
            6: "Spigot Machining",
            7: "Bell Calibration",
            8: "Final Inspection"
          };
          activeStep = `Step ${stepNo}: ${stationNames[stepNo] || "Unknown"}`;
        }

        return {
          "Pipe Number": rec.pipeId || "",
          "Project": rec.header?.projectWorkOrder || "",
          "Active Step": activeStep,
          "Commercial Ready Yard": isCommYard,
          "RPS Ready Yard": isRpsYard,
          "NCR Quarantine Area": isQuarantine,
          "Delivered Handover": isDelivered
        };
      });

      const xlsxUtils = XLSX.utils || (XLSX as any).default?.utils;
      const xlsxWriteFile = XLSX.writeFile || (XLSX as any).default?.writeFile;

      if (!xlsxUtils || !xlsxWriteFile) {
        throw new Error("XLSX core module extraction failed. Standard bindings are missing.");
      }

      const worksheet = xlsxUtils.json_to_sheet(rows);
      const workbook = xlsxUtils.book_new();
      xlsxUtils.book_append_sheet(workbook, worksheet, "Pipes Floor Map");

      // Auto-fit columns
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
      xlsxWriteFile(workbook, `GRP_FloorMap_Export_${dateStr}.xlsx`);
    } catch (err: any) {
      console.error("Excel download crash caught on Tracking Plane:", err);
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
        console.log("Parsed rows from Excel sheet on Tracking Plane:", rows);

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
            console.error(`Row ${idx+1} map error on Tracking Plane:`, rErr);
            skippedRows++;
          }
        });

        if (recordsList.length === 0) {
          throw new Error("None of the rows corresponds to a valid GRP/GRE Pipe QA template. Ensure columns match the expected Pipe ID and steps structure.");
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
        setUploadError(result.error || "Failed to sync Excel records to server.");
      }
    } catch (err: any) {
      console.error(err);
      setUploadError(err.message || "Bulk reload failed unexpectedly.");
    } finally {
      setIsProcessingUpload(false);
    }
  };

  // Clear ledger search query when changing step/station
  useEffect(() => {
    setLedgerSearchQuery("");
  }, [selectedStationId]);

  // Define our factory layout stations
  const stations: WorkstationConfig[] = useMemo(() => [
    {
      id: "step1",
      stepNo: 1,
      name: "Mold Preparation",
      icon: Wrench,
      color: "emerald",
      borderColor: "border-emerald-200 hover:border-emerald-400",
      bgColor: "bg-emerald-50/50 hover:bg-emerald-50",
      badgeBg: "bg-emerald-500 text-white",
      description: "Clearing mandrels, mold serial auditing, release agent sprays",
      procedure: "Check mold surface thickness, log mandrel ID, confirm uniform release coating"
    },
    {
      id: "step2",
      stepNo: 2,
      name: "Liner Application",
      icon: Layers2,
      color: "cyan",
      borderColor: "border-cyan-200 hover:border-cyan-400",
      bgColor: "bg-cyan-50/50 hover:bg-cyan-50",
      badgeBg: "bg-cyan-500 text-white",
      description: "Applying inner resin barrier and C-Glass backing veil",
      procedure: "Inspect bubble gaps, record initial resin lot and backing batch, measure profile"
    },
    {
      id: "step3",
      stepNo: 3,
      name: "Filament Winding",
      icon: LoopIcon,
      color: "sky",
      borderColor: "border-sky-200 hover:border-sky-400",
      bgColor: "bg-sky-50/50 hover:bg-sky-50",
      badgeBg: "bg-sky-500 text-white",
      description: "High-tensile continuous fiberglass filament winding matrix",
      procedure: "Calibrate helical winding angles, supervise layer coverage, guarantee wetout"
    },
    {
      id: "step4",
      stepNo: 4,
      name: "Thermal Curing",
      icon: Thermometer,
      color: "orange",
      borderColor: "border-orange-200 hover:border-orange-400",
      bgColor: "bg-orange-50/50 hover:bg-orange-50",
      badgeBg: "bg-orange-500 text-white",
      description: "Controlled oven heating stages to crosslink resin matrix",
      procedure: "Observe thermal curve peaks, register duration logs, probe Barcol hardness"
    },
    {
      id: "step5",
      stepNo: 5,
      name: "Demolding & Ejection",
      icon: ArrowUpFromLine,
      color: "indigo",
      borderColor: "border-indigo-200 hover:border-indigo-400",
      bgColor: "bg-indigo-50/50 hover:bg-indigo-50",
      badgeBg: "bg-indigo-500 text-white",
      description: "Stripping outer collars and hydraulic core extraction",
      procedure: "Extract without core scratching, do visual audit of liner, check collar structural ends"
    },
    {
      id: "step6",
      stepNo: 6,
      name: "Spigot Machining",
      icon: Sliders,
      color: "blue",
      borderColor: "border-blue-200 hover:border-blue-400",
      bgColor: "bg-blue-50/50 hover:bg-blue-50",
      badgeBg: "bg-blue-500 text-white",
      description: "Grinding and calibrating Outer Diameter of spigot ends",
      procedure: "Measure SA through SF with vernier caliper, contrast with tolerance specifications"
    },
    {
      id: "step7",
      stepNo: 7,
      name: "Bell Calibration",
      icon: Bell,
      color: "violet",
      borderColor: "border-violet-200 hover:border-violet-400",
      bgColor: "bg-violet-50/50 hover:bg-violet-50",
      badgeBg: "bg-violet-500 text-white",
      description: "Shaping socket sealing details and locking key grooves",
      procedure: "Verify groove depths and seal seat radii. Ensure complete glass seal"
    },
    {
      id: "step8",
      stepNo: 8,
      name: "Final Inspection",
      icon: ClipboardCheck,
      color: "blue",
      borderColor: "border-purple-200 hover:border-purple-400",
      bgColor: "bg-purple-50/50 hover:bg-purple-50",
      badgeBg: "bg-purple-500 text-white",
      description: "Hydrostatic testing, weight stamps, and clearance logs",
      procedure: "Hold test bar, scan caliper certifications, and mark final product destination"
    }
  ], []);

  // Classify where each pipe currently is positioned
  const pipePositions = useMemo(() => {
    return records.map(pipe => {
      // 1. Check for NCR quarantine. Does this pipe have any step with a "Fail" or "isNonConform"?
      let isQuarantined = false;
      let ncrStep = "";
      
      for (let s = 1; s <= 8; s++) {
        const step = pipe.steps[s];
        if (step) {
          if (step.isNonConform || step.qualityChecks.some(qc => qc.status === "Fail")) {
            isQuarantined = true;
            ncrStep = `Step ${s}`;
            break;
          }
        }
      }

      if (isQuarantined) {
        return {
          pipe,
          stageId: "quarantine",
          stageName: `Quarantine (${ncrStep} NCR)`
        };
      }

      // 2. Check if Dispatched (Delivered to client)
      if (pipe.isDispatched) {
        return {
          pipe,
          stageId: "delivered",
          stageName: "Delivered to Client"
        };
      }

      // 3. Check if Step 8 is fully completed
      const s8 = pipe.steps[8];
      if (s8 && s8.isCompleted) {
        const dest = ((s8.fields as any)?.pipeDestination || "").toUpperCase();
        const isRps = dest.includes("RPS-COMMERCIAL");
        return {
          pipe,
          stageId: isRps ? "dispatch_rps" : "dispatch_dp",
          stageName: isRps ? "RPS Yard Stock" : "Commercial Ready Yard"
        };
      }

      // 4. Otherwise, active in steps. It is in the first step (1 to 8) that is *not completed*
      let activeStep = 1;
      for (let s = 1; s <= 8; s++) {
        const step = pipe.steps[s];
        if (!step || !step.isCompleted) {
          activeStep = s;
          break;
        }
      }

      return {
        pipe,
        stageId: `step${activeStep}`,
        stageName: stations.find(st => st.stepNo === activeStep)?.name || `Step ${activeStep}`
      };
    });
  }, [records, stations]);

  // Extract all unique project codes and lots from pipedata for dropdowns
  const uniqueLots = useMemo(() => {
    const set = new Set<string>();
    records.forEach(r => {
      if (r.header.lotNo) set.add(r.header.lotNo);
    });
    return Array.from(set).sort();
  }, [records]);

  // Filter pipes according to searches & dropdown indicators
  const filteredPositions = useMemo(() => {
    return pipePositions.filter(({ pipe, stageId }) => {
      // Station selected filter
      if (selectedStationId !== "all" && stageId !== selectedStationId) {
        return false;
      }
      // Search text query (matches pipeId, settingRef, projectCode, batch lot)
      if (searchQuery) {
        const query = searchQuery.trim().toLowerCase();
        const matchId = pipe.pipeId.toLowerCase().includes(query);
        const matchLot = pipe.header.lotNo.toLowerCase().includes(query);
        const matchType = pipe.header.pipeType.toLowerCase().includes(query);
        const matchWO = pipe.header.projectWorkOrder.toLowerCase().includes(query);
        const matchRef = pipe.header.settingReference.toLowerCase().includes(query);
        if (!matchId && !matchLot && !matchType && !matchWO && !matchRef) {
          return false;
        }
      }
      // Project drop filter
      if (selectedProject !== "all" && pipe.header.projectWorkOrder !== selectedProject) {
        return false;
      }
      // Pipe Type filter
      if (selectedPipeType !== "all" && pipe.header.pipeType !== selectedPipeType) {
        return false;
      }
      // Lot drop filter
      if (selectedLot !== "all" && pipe.header.lotNo !== selectedLot) {
        return false;
      }
      return true;
    });
  }, [pipePositions, selectedStationId, searchQuery, selectedProject, selectedPipeType, selectedLot]);

  // Filter positions inside the Ledger Area based on ledgerSearchQuery
  const ledgerFilteredPositions = useMemo(() => {
    if (!ledgerSearchQuery) return filteredPositions;
    const query = ledgerSearchQuery.trim().toLowerCase();
    return filteredPositions.filter(({ pipe, stageName }) => {
      const matchId = pipe.pipeId.toLowerCase().includes(query);
      const matchLot = pipe.header.lotNo.toLowerCase().includes(query);
      const matchType = pipe.header.pipeType.toLowerCase().includes(query);
      const matchWO = pipe.header.projectWorkOrder.toLowerCase().includes(query);
      const matchRef = pipe.header.settingReference.toLowerCase().includes(query);
      const matchStage = stageName.toLowerCase().includes(query);
      return matchId || matchLot || matchType || matchWO || matchRef || matchStage;
    });
  }, [filteredPositions, ledgerSearchQuery]);

  // Group filtered results by stage for localized rendering
  const stageGroups = useMemo(() => {
    const groups: { [key: string]: PipeRecord[] } = {
      step1: [],
      step2: [],
      step3: [],
      step4: [],
      step5: [],
      step6: [],
      step7: [],
      step8: [],
      dispatch_dp: [],
      dispatch_rps: [],
      delivered: [],
      quarantine: []
    };
    filteredPositions.forEach(({ pipe, stageId }) => {
      if (groups[stageId]) {
        groups[stageId].push(pipe);
      }
    });
    return groups;
  }, [filteredPositions]);

  // Count overall sums for each stage (ignores current local query search except station filter)
  const fullStageCounts = useMemo(() => {
    const counts: { [key: string]: number } = {
      step1: 0,
      step2: 0,
      step3: 0,
      step4: 0,
      step5: 0,
      step6: 0,
      step7: 0,
      step8: 0,
      dispatch_dp: 0,
      dispatch_rps: 0,
      delivered: 0,
      quarantine: 0
    };
    pipePositions.forEach(({ stageId }) => {
      if (counts[stageId] !== undefined) {
        counts[stageId]++;
      }
    });
    return counts;
  }, [pipePositions]);

  // Helper helper to resolve standard fiberglass polymer class color representation
  const getPipeClassColor = (type: PipeType) => {
    if (type.includes("GRE")) {
      return {
        gradStart: "#059669", // Emerald Green
        gradEnd: "#10b981",
        label: "GRE (Epoxy Resin)"
      };
    }
    if (type.includes("GRV")) {
      return {
        gradStart: "#2563eb", // Royal Cobalt Blue
        gradEnd: "#3b82f6",
        label: "GRV (Vinyl Ester)"
      };
    }
    return {
      gradStart: "#4f46e5", // Indigo GRP
      gradEnd: "#6366f1",
      label: "GRP (Polyester Resin)"
    };
  };

  const activeStationDetails = useMemo(() => {
    if (selectedStationId === "all") return null;
    if (selectedStationId === "dispatch_dp") {
      return {
        name: "Commercial Ready Yard",
        icon: Truck,
        colorClass: "text-indigo-600 bg-indigo-50 border-indigo-200",
        desc: "DP-Commercial stock cleared from QA and stored in the ready yard for shipping",
        procedure: "Issue commercial delivery log, coordinate commercial transport vehicles, check dispatch clearance"
      };
    }
    if (selectedStationId === "dispatch_rps") {
      return {
        name: "RPS Yard Stock",
        icon: Truck,
        colorClass: "text-emerald-600 bg-emerald-50 border-emerald-200",
        desc: "RPS-Commercial stock cleared from QA and queued for special RPS shipping",
        procedure: "Verify RPS specifications, coordinate specialist RPS freight carrier, check dispatch clearance"
      };
    }
    if (selectedStationId === "quarantine") {
      return {
        name: "NCR Quarantine / Red Tag Area",
        icon: AlertTriangle,
        colorClass: "text-rose-600 bg-rose-50 border-rose-200",
        desc: "Pipes flagged with a quality fail check or marked as non-conform during active testing",
        procedure: "Isolate immediate physical item, post physical Red Tag, evaluate rework patches or structural salvage"
      };
    }
    const matchingSt = stations.find(s => s.id === selectedStationId);
    return matchingSt ? {
      name: `Station ${matchingSt.stepNo}: ${matchingSt.name}`,
      icon: matchingSt.icon,
      colorClass: "text-blue-600 bg-blue-50",
      desc: matchingSt.description,
      procedure: matchingSt.procedure
    } : null;
  }, [selectedStationId, stations]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-1">
      
      {/* Title & Stats Overview Widget Header Block */}
      <div className="bg-white p-5 rounded-2xl border border-gray-150 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-blue-550/10 text-blue-600 rounded-xl">
              <Map className="w-5 h-5" />
            </span>
            <div>
              <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">Plant 2D Tracking Plane</h1>
              <p className="text-xs text-slate-500 mt-0.5">Isometric top-down factory-floor map tracking exact fiberglass tubes on active stations</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="bg-slate-50 border border-slate-100 rounded-xl px-3.5 py-2 text-center text-xs">
            <span className="text-slate-400 block font-bold uppercase text-[9px] tracking-wider leading-none">Total Ledgers</span>
            <strong className="text-slate-800 text-base mt-1 block leading-none">{records.length}</strong>
          </div>
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-3.5 py-2 text-center text-xs">
            <span className="text-emerald-500 block font-bold uppercase text-[9px] tracking-wider leading-none">Curing / In-Line</span>
            <strong className="text-emerald-800 text-base mt-1 block leading-none">
              {pipePositions.filter(p => !["dispatch_dp", "dispatch_rps", "delivered", "quarantine"].includes(p.stageId)).length}
            </strong>
          </div>
          <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-3.5 py-2 text-center text-xs">
            <span className="text-indigo-500 block font-bold uppercase text-[9px] tracking-wider leading-none font-bold">Yard Stock (Pending)</span>
            <strong className="text-indigo-800 text-base mt-1 block leading-none">
              {pipePositions.filter(p => ["dispatch_dp", "dispatch_rps"].includes(p.stageId)).length}
            </strong>
          </div>
          <div className="bg-blue-50 border border-blue-100 rounded-xl px-3.5 py-2 text-center text-xs">
            <span className="text-blue-500 block font-bold uppercase text-[9px] tracking-wider leading-none font-bold">
              Shipped / Delivered
            </span>
            <strong className="text-blue-800 text-base mt-1 block leading-none">
              {pipePositions.filter(p => p.stageId === "delivered").length}
            </strong>
          </div>
          <div className="bg-rose-50 border border-rose-100 rounded-xl px-3.5 py-2 text-center text-xs">
            <span className="text-rose-500 block font-semibold uppercase text-[9px] tracking-wider leading-none font-bold">⚠️ Quarantine</span>
            <strong className="text-rose-800 text-base mt-1 block leading-none">{fullStageCounts.quarantine}</strong>
          </div>
        </div>
      </div>

      {/* Spreadsheet Operations Integration Hub */}
      <div className="bg-slate-50/60 border border-slate-200 p-4 rounded-2xl flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4 shadow-3xs">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl border border-blue-100">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-extrabold text-sm text-slate-800 tracking-tight">Excel Spreadsheet Integrations</h3>
            <p className="text-xs text-slate-500 leading-normal">Download complete GRP Pipe QA ledger spreadsheet or upload data back into active tracking workflows</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExportToExcel}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-2 bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 text-xs text-slate-700 py-2.5 px-4 rounded-xl font-bold transition shadow-3xs hover:shadow-2xs cursor-pointer"
          >
            <Download className="w-4 h-4 text-slate-500" />
            Download Excel Report
          </button>
          
          <button
            type="button"
            onClick={() => {
              setShowExcelPanel(!showExcelPanel);
              setUploadError("");
              setParsedImportRecords([]);
              setSuccessfulImportCount(null);
            }}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 text-xs py-2.5 px-4 rounded-xl font-bold transition shadow-3xs cursor-pointer ${
              showExcelPanel 
                ? "bg-slate-800 border border-slate-900 text-white hover:bg-slate-900" 
                : "bg-blue-600 hover:bg-blue-700 text-white border border-blue-700 hover:border-blue-800"
            }`}
          >
            <Upload className="w-4 h-4" />
            {showExcelPanel ? "Close Ingestion Terminal" : "Upload Excel Data"}
          </button>
        </div>
      </div>

      {/* Ingestion Panel Interface */}
      {showExcelPanel && (
        <div className="bg-white rounded-2xl border border-gray-150 p-5 space-y-4 shadow-xs animate-fade-in">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="text-sm font-extrabold text-gray-800 flex items-center gap-1.5 uppercase tracking-wider">
                📥 Excel Data Ingestion Terminal
              </h3>
              <p className="text-xs text-gray-400 mt-1">
                Upload a spreadsheet (.xlsx, .xls) to populate, update, or overwrite active workstation tracks.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowExcelPanel(false);
                setParsedImportRecords([]);
                setUploadError("");
                setSuccessfulImportCount(null);
              }}
              className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {successfulImportCount !== null && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3">
              <div className="p-1 bg-emerald-100 rounded-lg text-emerald-600">
                <Check className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-emerald-800">Symmetric Ingestion Completed Successfully</h4>
                <p className="text-[11px] text-emerald-600 mt-0.5 font-medium">
                  Successfully synchronized <strong>{successfulImportCount}</strong> GRP pipe logs and step checklists.
                </p>
              </div>
            </div>
          )}

          {uploadError && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-start gap-3">
              <div className="p-1 bg-rose-100 rounded-lg text-rose-600">
                <AlertCircle className="w-4 h-4" />
              </div>
              <div className="flex-1">
                <h4 className="text-xs font-bold text-rose-800">Data Import Conflict Observed</h4>
                <p className="text-[11px] text-rose-600 mt-0.5">
                  {uploadError}
                </p>
              </div>
            </div>
          )}

          {parsedImportRecords.length === 0 ? (
            <div className="border-2 border-dashed border-gray-200 hover:border-blue-400 transition rounded-xl p-8 text-center bg-gray-50/30 flex flex-col items-center justify-center relative cursor-pointer group">
              <input
                type="file"
                accept=".xlsx, .xls"
                onChange={handleFileUpload}
                disabled={isProcessingUpload}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
              />
              <FileSpreadsheet className="w-10 h-10 text-gray-300 group-hover:text-blue-500 transition mb-3" />
              <p className="text-xs text-gray-600 font-bold">
                {isProcessingUpload ? "Extracting spreadsheet structures..." : "Drag and drop your Excel ledger here, or click to browse files"}
              </p>
              <p className="text-[10px] text-gray-400 mt-1">
                Supports both the detailed GRP QA lifecycle ledger AND the simplified Floor Map format: [Pipe Number, Project, Active Step, Commercial Ready Yard, RPS Ready Yard, NCR Quarantine Area, Delivered Handover]
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-150 rounded-xl p-4 flex items-start justify-between gap-3">
                <div className="flex gap-2.5">
                  <div className="p-1.5 bg-blue-100 rounded-lg text-blue-600 self-start">
                    <FileSpreadsheet className="w-4.5 h-4.5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-extrabold text-blue-900">
                      Spreadsheet Validated - {parsedImportRecords.length} Pipe Records Queued
                    </h4>
                    <p className="text-[10.5px] text-blue-650 mt-0.5 leading-snug">
                      Confirm synchronization into the database. Make sure you select the correct update mode below to avoid accidental overrides.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setParsedImportRecords([])}
                  className="text-xs text-blue-700 hover:text-blue-800 font-bold underline shrink-0 cursor-pointer"
                >
                  Clear File
                </button>
              </div>

              {/* Import Mode Settings */}
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-200/60 grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="flex items-start gap-3 cursor-pointer group">
                  <input
                    type="radio"
                    name="importMode"
                    value="merge"
                    checked={importMode === "merge"}
                    onChange={() => setImportMode("merge")}
                    className="mt-1 text-blue-600 focus:ring-blue-500 focus:ring-1 border-gray-300 cursor-pointer"
                  />
                  <div>
                    <span className="text-xs font-bold text-gray-800 group-hover:text-blue-700 transition">
                      🔗 Merge and Update (Recommended)
                    </span>
                    <span className="text-[10px] text-gray-400 block mt-0.5 leading-normal">
                      Preserves existing historic logs. Only appends missing step records and updates matching pipe headers.
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-3 cursor-pointer group">
                  <input
                    type="radio"
                    name="importMode"
                    value="overwrite"
                    checked={importMode === "overwrite"}
                    onChange={() => setImportMode("overwrite")}
                    className="mt-1 text-blue-600 focus:ring-blue-500 focus:ring-1 border-gray-300 cursor-pointer"
                  />
                  <div>
                    <span className="text-xs font-bold text-gray-800 group-hover:text-blue-700 transition">
                      ⚠️ Overwrite Entire Records
                    </span>
                    <span className="text-[10px] text-gray-400 block mt-0.5 leading-normal">
                      Completely replaces matching GRP pipe serials in the database with the columns imported from this Excel sheet.
                    </span>
                  </div>
                </label>
              </div>

              {/* Action Triggers */}
              <div className="flex justify-end gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setParsedImportRecords([])}
                  disabled={isProcessingUpload}
                  className="bg-white hover:bg-gray-50 border border-gray-250 text-xs text-gray-700 py-2 px-4 rounded-xl font-bold transition disabled:opacity-50 cursor-pointer shadow-3xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmImport}
                  disabled={isProcessingUpload}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-700 text-xs py-2 px-5 rounded-xl font-bold transition disabled:opacity-50 flex items-center gap-1.5 cursor-pointer shadow-3xs"
                >
                  {isProcessingUpload ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Syncing database...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      Sync and Reload Ledger
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Advanced Searches, Filters, and Interactive Dropdowns */}
      <div className="bg-white p-4 rounded-xl border border-gray-150 shadow-xs space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="w-4 h-4 text-gray-400" />
            </span>
            <input
              type="text"
              placeholder="Search Pipe Serial ID / Lot..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 hover:bg-slate-100/70 text-xs pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-blue-500 focus:bg-white transition"
            />
          </div>

          <div>
            <select
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              className="w-full bg-slate-50 border border-gray-200 text-xs px-3 py-2.5 rounded-xl text-gray-700 focus:outline-none focus:border-blue-500 transition cursor-pointer"
            >
              <option value="all">📁 All Project Code Orders</option>
              {projects.map(proj => (
                <option key={proj.id} value={proj.projectCode}>Project: {proj.projectCode}</option>
              ))}
            </select>
          </div>

          <div>
            <select
              value={selectedPipeType}
              onChange={(e) => setSelectedPipeType(e.target.value)}
              className="w-full bg-slate-50 border border-gray-200 text-xs px-3 py-2.5 rounded-xl text-gray-700 focus:outline-none focus:border-blue-500 transition cursor-pointer"
            >
              <option value="all">🌀 All Fiber Polymers Type</option>
              <option value="Bell/Spigot GRE">Bell/Spigot GRE (Epoxy)</option>
              <option value="Bell/Spigot GRV">Bell/Spigot GRV (Vinyl Ester)</option>
              <option value="Bell/Spigot GRP">Bell/Spigot GRP (Polyester)</option>
              <option value="Plain Ends GRE">Plain Ends GRE (Epoxy)</option>
              <option value="Plain Ends GRV">Plain Ends GRV (Vinyl Ester)</option>
              <option value="Plain Ends GRP">Plain Ends GRP (Polyester)</option>
            </select>
          </div>

          <div>
            <select
              value={selectedLot}
              onChange={(e) => setSelectedLot(e.target.value)}
              className="w-full bg-slate-50 border border-gray-200 text-xs px-3 py-2.5 rounded-xl text-gray-700 focus:outline-none focus:border-blue-500 transition cursor-pointer"
            >
              <option value="all">📦 All Production Lot Batches</option>
              {uniqueLots.map(lot => (
                <option key={lot} value={lot}>Lot Unit: {lot}</option>
              ))}
            </select>
          </div>

          <div>
            <select
              value={selectedStationId}
              onChange={(e) => setSelectedStationId(e.target.value)}
              className="w-full bg-slate-50 border border-gray-200 text-xs px-3 py-2.5 rounded-xl text-gray-700 focus:outline-none focus:border-blue-500 transition cursor-pointer font-bold text-blue-650"
            >
              <option value="all">🌟 Isolated Station View: All</option>
              <option value="step1">Station 1: Mold Prep ({fullStageCounts.step1})</option>
              <option value="step2">Station 2: Liner ({fullStageCounts.step2})</option>
              <option value="step3">Station 3: Winding ({fullStageCounts.step3})</option>
              <option value="step4">Station 4: Cure ({fullStageCounts.step4})</option>
              <option value="step5">Station 5: Demolding ({fullStageCounts.step5})</option>
              <option value="step6">Station 6: Spigot ({fullStageCounts.step6})</option>
              <option value="step7">Station 7: Bell ({fullStageCounts.step7})</option>
              <option value="step8">Station 8: Inspection ({fullStageCounts.step8})</option>
              <option value="dispatch_dp">Commercial Yard Stock ({fullStageCounts.dispatch_dp})</option>
              <option value="dispatch_rps">RPS Yard Stock ({fullStageCounts.dispatch_rps})</option>
              <option value="quarantine">NCR Quarantine Red Spot ({fullStageCounts.quarantine})</option>
            </select>
          </div>

        </div>

        {/* Filters Active Chips row */}
        {(selectedStationId !== "all" || searchQuery || selectedProject !== "all" || selectedPipeType !== "all" || selectedLot !== "all") && (
          <div className="pt-2 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Active Filters:</span>
              {selectedStationId !== "all" && (
                <span className="bg-blue-50 border border-blue-200 text-blue-700 text-[10px] uppercase font-bold px-2 py-0.5 rounded-md flex items-center gap-1">
                  Station: {selectedStationId}
                  <button onClick={() => setSelectedStationId("all")} className="hover:text-red-500 font-black ml-1">×</button>
                </span>
              )}
              {searchQuery && (
                <span className="bg-slate-100 text-slate-700 text-[10px] font-mono px-2 py-0.5 rounded-md flex items-center gap-1">
                  Query: "{searchQuery}"
                  <button onClick={() => setSearchQuery("")} className="hover:text-red-500 font-black ml-1">×</button>
                </span>
              )}
              {selectedProject !== "all" && (
                <span className="bg-indigo-50 border border-indigo-200 text-indigo-700 text-[10px] px-2 py-0.5 rounded-md flex items-center gap-1">
                  Project: {selectedProject}
                  <button onClick={() => setSelectedProject("all")} className="hover:text-red-500 font-black ml-1">×</button>
                </span>
              )}
              {selectedPipeType !== "all" && (
                <span className="bg-violet-50 border border-violet-200 text-violet-750 text-[10px] px-2 py-0.5 rounded-md flex items-center gap-1">
                  Type: {selectedPipeType}
                  <button onClick={() => setSelectedPipeType("all")} className="hover:text-red-500 font-black ml-1">×</button>
                </span>
              )}
              {selectedLot !== "all" && (
                <span className="bg-amber-50 border border-amber-200 text-amber-700 text-[10px] px-2 py-0.5 rounded-md flex items-center gap-1">
                  Lot: {selectedLot}
                  <button onClick={() => setSelectedLot("all")} className="hover:text-red-500 font-black ml-1">×</button>
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                setSelectedStationId("all");
                setSearchQuery("");
                setSelectedProject("all");
                setSelectedPipeType("all");
                setSelectedLot("all");
              }}
              className="text-[10px] text-red-500 hover:text-red-600 font-bold hover:underline"
            >
              Reset All Filters
            </button>
          </div>
        )}
      </div>

      {/* DYNAMIC 2Dfactory GRID MAP DRAWING */}
      <div className="bg-slate-55 bg-slate-50 rounded-3xl p-6 border-4 border-slate-200/90 shadow-xl relative overflow-hidden text-slate-800 select-none">
        
        {/* Abstract background factory blueprint grid decor & lighting ambience */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#cbd5e1_1px,transparent_1px),linear-gradient(to_bottom,#cbd5e1_1px,transparent_1px)] bg-[size:24px_24px] opacity-45 pointer-events-none"></div>
        <div className="absolute -left-10 -top-10 w-96 h-96 bg-blue-100/10 rounded-full blur-[120px] pointer-events-none"></div>
        <div className="absolute -right-10 -bottom-10 w-96 h-96 bg-sky-100/10 rounded-full blur-[120px] pointer-events-none"></div>
        
        {/* Instrumentation Corner Brackets */}
        <div className="absolute top-2 left-2 w-4 h-4 border-t-2 border-l-2 border-slate-300 pointer-events-none"></div>
        <div className="absolute top-2 right-2 w-4 h-4 border-t-2 border-r-2 border-slate-300 pointer-events-none"></div>
        <div className="absolute bottom-2 left-2 w-4 h-4 border-b-2 border-l-2 border-slate-300 pointer-events-none"></div>
        <div className="absolute bottom-2 right-2 w-4 h-4 border-b-2 border-r-2 border-slate-300 pointer-events-none"></div>

        {/* Dynamic Telemetry Dashboard Header */}
        <div className="relative mb-6 pb-5 border-b border-slate-200/80 flex justify-between items-center flex-wrap gap-4 z-10">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-50 border border-blue-200/40 rounded-xl shadow-sm text-blue-600 font-bold">
              <Building2 className="w-5 h-5 shrink-0 animate-pulse text-blue-500" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] uppercase font-extrabold text-blue-600 tracking-widest bg-blue-100/50 border border-blue-200/30 px-2 py-0.5 rounded-full font-bold">Quality division layouts</span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
                <span className="text-[9px] uppercase font-bold text-emerald-600 font-mono tracking-tight">● Telemetry is live</span>
              </div>
              <h2 className="text-base font-black uppercase tracking-wider text-slate-800 mt-1">Live GRP Manufacturing Flowchart</h2>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4 bg-white border border-slate-200/80 rounded-xl px-4 py-2 text-xs shadow-sm">
            <span className="text-[10px] uppercase font-extrabold text-slate-500 tracking-wider">Classification Tags:</span>
            <div className="flex items-center gap-1.5 border-r border-slate-200 pr-3">
              <span className="w-3 h-3 rounded-full bg-emerald-600 border border-emerald-400 inline-block shadow-sm"></span>
              <span className="text-[10px] text-slate-650 text-slate-600 font-extrabold">GRE Epoxy</span>
            </div>
            <div className="flex items-center gap-1.5 border-r border-slate-200 pr-3">
              <span className="w-3 h-3 rounded-full bg-blue-600 border border-blue-400 inline-block shadow-sm"></span>
              <span className="text-[10px] text-slate-650 text-slate-600 font-extrabold">GRV Vinyl</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-indigo-655 bg-indigo-600 border border-indigo-400 inline-block shadow-sm"></span>
              <span className="text-[10px] text-slate-650 text-slate-600 font-extrabold">GRP Poly</span>
            </div>
          </div>
        </div>

        {/* Focused Station Filter Banner indicator */}
        {selectedStationId !== "all" && (
          <div className="mb-4 bg-blue-100/60 border border-blue-200/85 rounded-xl px-4 py-2 text-xs text-blue-800 font-bold flex items-center justify-between animate-fade-in relative z-10 shadow-sm">
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
              FOCUSED STATION TRACKING: Viewing <span className="text-slate-900 underline font-extrabold">{
                selectedStationId === "step1" ? "1. Mold Preparation" :
                selectedStationId === "step2" ? "2. Liner Application" :
                selectedStationId === "step3" ? "3. Structural Winding" :
                selectedStationId === "step4" ? "4. Thermal Curing" :
                selectedStationId === "step5" ? "5. Demolding Core" :
                selectedStationId === "step6" ? "6. Spigot Calibration" :
                selectedStationId === "step7" ? "7. Bell Calibration" :
                selectedStationId === "step8" ? "8. Final Inspection" :
                selectedStationId === "dispatch_dp" ? "Commercial Ready Yard" :
                selectedStationId === "dispatch_rps" ? "RPS Yard Stock" :
                selectedStationId === "delivered" ? "Delivered Handover" : "Delivered Handover"
              }</span>
            </span>
            <button 
              onClick={() => setSelectedStationId("all")}
              className="text-[9px] bg-blue-600 border border-blue-500 text-white font-extrabold uppercase px-2 py-0.5 rounded-md hover:bg-blue-700 tracking-wider transition-all shadow-sm"
            >
              Show All Stations [×]
            </button>
          </div>
        )}

        {/* Map Layout Flowchart */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 relative z-10">
          {/* Station 1: Mold Prep */}
          {(() => {
            const isSelfSelected = selectedStationId === "step1";
            const isAnySelected = selectedStationId !== "all";
            const isDimmed = isAnySelected && !isSelfSelected;
            const hasPipes = stageGroups.step1.length > 0;
            return (
              <div 
                onClick={() => setSelectedStationId(isSelfSelected ? "all" : "step1")}
                className={`cursor-pointer rounded-2xl p-4 transition-all duration-300 border-2 relative h-64 flex flex-col justify-between ${
                  isSelfSelected 
                    ? "bg-white border-emerald-500 shadow-[0_4px_20px_rgba(16,185,129,0.15)] scale-[1.02] z-20" 
                    : "bg-white/90 border-slate-200/80 hover:border-slate-300 hover:shadow-sm"
                } ${isDimmed ? "opacity-35 saturate-50 hover:opacity-75 hover:saturate-100" : ""}`}
              >
                {/* Station visual top neon line */}
                <div className={`absolute top-0 left-0 right-0 h-1 rounded-t-2xl ${isSelfSelected ? 'bg-emerald-500' : 'bg-emerald-500/20'}`}></div>
                
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2">
                    <div className={`p-2 rounded-xl border transition ${
                      isSelfSelected 
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-600' 
                        : 'bg-emerald-50/50 border-emerald-100 text-emerald-505 text-emerald-500'
                    }`}>
                      <Wrench className="w-4 h-4 text-emerald-500" />
                    </div>
                    {hasPipes && (
                      <div className="flex items-center gap-1.5">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                        </span>
                        <span className="text-[8px] font-extrabold text-emerald-600 uppercase tracking-tighter">RUNNING</span>
                      </div>
                    )}
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[9px] tracking-wider font-extrabold uppercase ${
                    isSelfSelected ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'
                  }`}>STG 1</span>
                </div>

                <div className="mt-2.5 flex-grow flex flex-col justify-between">
                  <div>
                    <h3 className="text-slate-800 font-extrabold text-xs tracking-tight uppercase flex items-center gap-1.5">
                      1. Mold Preparation
                    </h3>
                    <p className="text-[10px] text-slate-500 leading-none mt-1">Clearing surfaces & mold IDs</p>
                    <div className="mt-2 flex items-center gap-2 text-[8px] font-mono font-bold text-slate-400 border-t border-slate-100 pt-2">
                      <span className="text-emerald-650 text-emerald-600">MANDREL PREP</span>
                      <span>•</span>
                      <span>TEMP: 26°C</span>
                    </div>
                  </div>
                  
                  {/* Physical Roller Table styled nesting tray */}
                  <div className="mt-3.5 relative border border-slate-200 bg-slate-50/50 rounded-xl p-2.5 h-[105px] overflow-y-auto no-scrollbar content-start flex flex-wrap gap-2 items-center justify-start shadow-inner">
                    <div className="absolute inset-0 bg-[repeating-linear-gradient(90deg,rgba(226,232,240,0.3)_0px,rgba(226,232,240,0.3)_2px,transparent_2px,transparent_14px)] pointer-events-none opacity-40"></div>
                    {stageGroups.step1.length === 0 ? (
                      <span className="text-[9px] italic text-slate-400 w-full text-center relative z-10 py-5 font-semibold">Roller Bed Empty</span>
                    ) : (
                      stageGroups.step1.map(p => render2DTube(p))
                    )}
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100/80 flex justify-between items-center text-[10px] text-slate-500">
                  <span>Active Batch</span>
                  <strong className="text-emerald-700 font-bold bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded font-mono text-[10.5px]">
                    {stageGroups.step1.length}
                  </strong>
                </div>
              </div>
            );
          })()}
               {/* Station 2: Liner */}
          {(() => {
            const isSelfSelected = selectedStationId === "step2";
            const isAnySelected = selectedStationId !== "all";
            const isDimmed = isAnySelected && !isSelfSelected;
            const hasPipes = stageGroups.step2.length > 0;
            return (
              <div 
                onClick={() => setSelectedStationId(isSelfSelected ? "all" : "step2")}
                className={`cursor-pointer rounded-2xl p-4 transition-all duration-300 border-2 relative h-64 flex flex-col justify-between ${
                  isSelfSelected 
                    ? "bg-white border-cyan-500 shadow-[0_4px_20px_rgba(6,182,212,0.15)] scale-[1.02] z-20" 
                    : "bg-white/90 border-slate-200/80 hover:border-slate-300 hover:shadow-sm"
                } ${isDimmed ? "opacity-35 saturate-50 hover:opacity-75 hover:saturate-100" : ""}`}
              >
                <div className={`absolute top-0 left-0 right-0 h-1 rounded-t-2xl ${isSelfSelected ? 'bg-cyan-500' : 'bg-cyan-500/20'}`}></div>
                
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2">
                    <div className={`p-2 rounded-xl border transition ${
                      isSelfSelected 
                        ? 'bg-cyan-50 border-cyan-200 text-cyan-600' 
                        : 'bg-cyan-50/50 border-cyan-100 text-cyan-505 text-cyan-500'
                    }`}>
                      <Layers2 className="w-4 h-4 text-cyan-500" />
                    </div>
                    {hasPipes && (
                      <div className="flex items-center gap-1.5">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
                        </span>
                        <span className="text-[8px] font-extrabold text-cyan-600 uppercase tracking-tighter">LAYERING</span>
                      </div>
                    )}
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[9px] tracking-wider font-extrabold uppercase ${
                    isSelfSelected ? 'bg-cyan-100 text-cyan-800' : 'bg-slate-100 text-slate-500'
                  }`}>STG 2</span>
                </div>

                <div className="mt-2.5 flex-grow flex flex-col justify-between">
                  <div>
                    <h3 className="text-slate-800 font-extrabold text-xs tracking-tight uppercase flex items-center gap-1.5">
                      2. Liner Application
                    </h3>
                    <p className="text-[10px] text-slate-500 leading-none mt-1">Sustained resin barrier layers matrix</p>
                    <div className="mt-2 flex items-center gap-2 text-[8px] font-mono font-bold text-slate-400 border-t border-slate-100 pt-2">
                      <span className="text-cyan-600 font-bold">C-GLASS VEIL</span>
                      <span>•</span>
                      <span>96% IMPERVIOUS</span>
                    </div>
                  </div>
                  
                  <div className="mt-3.5 relative border border-slate-200 bg-slate-50/50 rounded-xl p-2.5 h-[105px] overflow-y-auto no-scrollbar content-start flex flex-wrap gap-2 items-center justify-start shadow-inner">
                    <div className="absolute inset-0 bg-[repeating-linear-gradient(90deg,rgba(226,232,240,0.3)_0px,rgba(226,232,240,0.3)_2px,transparent_2px,transparent_14px)] pointer-events-none opacity-40"></div>
                    {stageGroups.step2.length === 0 ? (
                      <span className="text-[9px] italic text-slate-400 w-full text-center relative z-10 py-5 font-semibold">Roller Bed Empty</span>
                    ) : (
                      stageGroups.step2.map(p => render2DTube(p))
                    )}
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100/80 flex justify-between items-center text-[10px] text-slate-500">
                  <span>Active Batch</span>
                  <strong className="text-cyan-700 font-bold bg-cyan-50 border border-cyan-100 px-2 py-0.5 rounded font-mono text-[10.5px]">
                    {stageGroups.step2.length}
                  </strong>
                </div>
              </div>
            );
          })()}

          {/* Station 3: Filament Winding */}
          {(() => {
            const isSelfSelected = selectedStationId === "step3";
            const isAnySelected = selectedStationId !== "all";
            const isDimmed = isAnySelected && !isSelfSelected;
            const hasPipes = stageGroups.step3.length > 0;
            return (
              <div 
                onClick={() => setSelectedStationId(isSelfSelected ? "all" : "step3")}
                className={`cursor-pointer rounded-2xl p-4 transition-all duration-300 border-2 relative h-64 flex flex-col justify-between ${
                  isSelfSelected 
                    ? "bg-white border-sky-500 shadow-[0_4px_20px_rgba(14,165,233,0.15)] scale-[1.02] z-20" 
                    : "bg-white/90 border-slate-200/80 hover:border-slate-300 hover:shadow-sm"
                } ${isDimmed ? "opacity-35 saturate-50 hover:opacity-75 hover:saturate-100" : ""}`}
              >
                <div className={`absolute top-0 left-0 right-0 h-1 rounded-t-2xl ${isSelfSelected ? 'bg-sky-500' : 'bg-sky-500/20'}`}></div>
                
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2">
                    <div className={`p-2 rounded-xl border transition ${
                      isSelfSelected 
                        ? 'bg-sky-50 border-sky-200 text-sky-600' 
                        : 'bg-sky-50/50 border-sky-100 text-sky-505 text-sky-500'
                    }`}>
                      <LoopIcon className="w-4 h-4 text-sky-500" />
                    </div>
                    {hasPipes && (
                      <div className="flex items-center gap-1.5">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-500"></span>
                        </span>
                        <span className="text-[8px] font-extrabold text-sky-600 uppercase tracking-tighter">WINDING</span>
                      </div>
                    )}
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[9px] tracking-wider font-extrabold uppercase ${
                    isSelfSelected ? 'bg-sky-100 text-sky-850 text-sky-800' : 'bg-slate-100 text-slate-500'
                  }`}>STG 3</span>
                </div>

                <div className="mt-2.5 flex-grow flex flex-col justify-between">
                  <div>
                    <h3 className="text-slate-800 font-extrabold text-xs tracking-tight uppercase flex items-center gap-1.5">
                      3. Structural Winding
                    </h3>
                    <p className="text-[10px] text-slate-500 leading-none mt-1">Helical fiber roving matrix helical</p>
                    <div className="mt-2 flex items-center gap-2 text-[8px] font-mono font-bold text-slate-400 border-t border-slate-100 pt-2">
                      <span className="text-sky-600">4-AXIS ROBOTIC</span>
                      <span>•</span>
                      <span>HELI: 54° WIND</span>
                    </div>
                  </div>
                  
                  <div className="mt-3.5 relative border border-slate-200 bg-slate-50/50 rounded-xl p-2.5 h-[105px] overflow-y-auto no-scrollbar content-start flex flex-wrap gap-2 items-center justify-start shadow-inner">
                    <div className="absolute inset-0 bg-[repeating-linear-gradient(90deg,rgba(226,232,240,0.3)_0px,rgba(226,232,240,0.3)_2px,transparent_2px,transparent_14px)] pointer-events-none opacity-40"></div>
                    {stageGroups.step3.length === 0 ? (
                      <span className="text-[9px] italic text-slate-400 w-full text-center relative z-10 py-5 font-semibold">Roller Bed Empty</span>
                    ) : (
                      stageGroups.step3.map(p => render2DTube(p))
                    )}
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100/80 flex justify-between items-center text-[10px] text-slate-500 font-medium">
                  <span>Active Batch</span>
                  <strong className="text-sky-700 font-bold bg-sky-50 border border-sky-100 px-2 py-0.5 rounded font-mono text-[10.5px]">
                    {stageGroups.step3.length}
                  </strong>
                </div>
              </div>
            );
          })()}

          {/* Station 4: Thermal Curing */}
          {(() => {
            const isSelfSelected = selectedStationId === "step4";
            const isAnySelected = selectedStationId !== "all";
            const isDimmed = isAnySelected && !isSelfSelected;
            const hasPipes = stageGroups.step4.length > 0;
            return (
              <div 
                onClick={() => setSelectedStationId(isSelfSelected ? "all" : "step4")}
                className={`cursor-pointer rounded-2xl p-4 transition-all duration-300 border-2 relative h-64 flex flex-col justify-between ${
                  isSelfSelected 
                    ? "bg-white border-orange-500 shadow-[0_4px_20px_rgba(249,115,22,0.15)] scale-[1.02] z-20" 
                    : "bg-white/90 border-slate-200/80 hover:border-slate-300 hover:shadow-sm"
                } ${isDimmed ? "opacity-35 saturate-50 hover:opacity-75 hover:saturate-100" : ""}`}
              >
                <div className={`absolute top-0 left-0 right-0 h-1 rounded-t-2xl ${isSelfSelected ? 'bg-orange-500' : 'bg-orange-500/20'}`}></div>
                
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2">
                    <div className={`p-2 rounded-xl border transition ${
                      isSelfSelected 
                        ? 'bg-orange-50 border-orange-200 text-orange-600' 
                        : 'bg-orange-50/50 border-orange-100 text-orange-505 text-orange-500'
                    }`}>
                      <Thermometer className="w-4 h-4 text-orange-500" />
                    </div>
                    {hasPipes && (
                      <div className="flex items-center gap-1.5">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500"></span>
                        </span>
                        <span className="text-[8px] font-extrabold text-orange-600 uppercase tracking-tighter">OVEN ACTIVE</span>
                      </div>
                    )}
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[9px] tracking-wider font-extrabold uppercase ${
                    isSelfSelected ? 'bg-orange-100 text-orange-800' : 'bg-slate-100 text-slate-500'
                  }`}>STG 4</span>
                </div>

                <div className="mt-2.5 flex-grow flex flex-col justify-between">
                  <div>
                    <h3 className="text-slate-800 font-extrabold text-xs tracking-tight uppercase flex items-center gap-1.5">
                      4. Thermal Curing
                    </h3>
                    <p className="text-[10px] text-slate-500 leading-none mt-1">Thermo polymerization chambers</p>
                    <div className="mt-2 flex items-center gap-2 text-[8px] font-mono font-bold text-slate-400 border-t border-slate-100 pt-2">
                      <span className="text-orange-600">TEMP TARGET: 135°C</span>
                      <span>•</span>
                      <span>POLY-CHECK</span>
                    </div>
                  </div>
                  
                  <div className="mt-3.5 relative border border-slate-200 bg-slate-50/50 rounded-xl p-2.5 h-[105px] overflow-y-auto no-scrollbar content-start flex flex-wrap gap-2 items-center justify-start shadow-inner">
                    <div className="absolute inset-0 bg-[repeating-linear-gradient(90deg,rgba(226,232,240,0.3)_0px,rgba(226,232,240,0.3)_2px,transparent_2px,transparent_14px)] pointer-events-none opacity-40"></div>
                    {stageGroups.step4.length === 0 ? (
                      <span className="text-[9px] italic text-slate-400 w-full text-center relative z-10 py-5 font-semibold">Roller Bed Empty</span>
                    ) : (
                      stageGroups.step4.map(p => render2DTube(p))
                    )}
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100/80 flex justify-between items-center text-[10px] text-slate-500">
                  <span>Active Batch</span>
                  <strong className="text-orange-700 font-bold bg-orange-50 border border-orange-100 px-2 py-0.5 rounded font-mono text-[10.5px]">
                    {stageGroups.step4.length}
                  </strong>
                </div>
              </div>
            );
          })()}

          {/* Station 5: Demolding Core */}
          {(() => {
            const isSelfSelected = selectedStationId === "step5";
            const isAnySelected = selectedStationId !== "all";
            const isDimmed = isAnySelected && !isSelfSelected;
            const hasPipes = stageGroups.step5.length > 0;
            return (
              <div 
                onClick={() => setSelectedStationId(isSelfSelected ? "all" : "step5")}
                className={`cursor-pointer rounded-2xl p-4 transition-all duration-300 border-2 relative h-64 flex flex-col justify-between ${
                  isSelfSelected 
                    ? "bg-white border-indigo-500 shadow-[0_4px_20px_rgba(99,102,241,0.15)] scale-[1.02] z-20" 
                    : "bg-white/90 border-slate-200/80 hover:border-slate-300 hover:shadow-sm"
                } ${isDimmed ? "opacity-35 saturate-50 hover:opacity-75 hover:saturate-100" : ""}`}
              >
                <div className={`absolute top-0 left-0 right-0 h-1 rounded-t-2xl ${isSelfSelected ? 'bg-indigo-500' : 'bg-indigo-500/20'}`}></div>
                
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2">
                    <div className={`p-2 rounded-xl border transition ${
                      isSelfSelected 
                        ? 'bg-indigo-50 border-indigo-200 text-indigo-600' 
                        : 'bg-indigo-50/50 border-indigo-100 text-indigo-505 text-indigo-500'
                    }`}>
                      <ArrowUpFromLine className="w-4 h-4 text-indigo-500" />
                    </div>
                    {hasPipes && (
                      <div className="flex items-center gap-1.5">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                        </span>
                        <span className="text-[8px] font-extrabold text-indigo-600 uppercase tracking-tighter">STRIPPING</span>
                      </div>
                    )}
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[9px] tracking-wider font-extrabold uppercase ${
                    isSelfSelected ? 'bg-indigo-100 text-indigo-850 text-indigo-800' : 'bg-slate-100 text-slate-500'
                  }`}>STG 5</span>
                </div>

                <div className="mt-2.5 flex-grow flex flex-col justify-between">
                  <div>
                    <h3 className="text-slate-800 font-extrabold text-xs tracking-tight uppercase flex items-center gap-1.5">
                      5. Demolding Core
                    </h3>
                    <p className="text-[10px] text-slate-500 leading-none mt-1">Mandrel separation & lock stripping</p>
                    <div className="mt-2 flex items-center gap-2 text-[8px] font-mono font-bold text-slate-400 border-t border-slate-100 pt-2">
                      <span className="text-indigo-600 font-bold font-semibold">HYDRAULIC STRIP</span>
                      <span>•</span>
                      <span>COLLAR: OK</span>
                    </div>
                  </div>
                  
                  <div className="mt-3.5 relative border border-slate-200 bg-slate-50/50 rounded-xl p-2.5 h-[105px] overflow-y-auto no-scrollbar content-start flex flex-wrap gap-2 items-center justify-start shadow-inner">
                    <div className="absolute inset-0 bg-[repeating-linear-gradient(90deg,rgba(226,232,240,0.3)_0px,rgba(226,232,240,0.3)_2px,transparent_2px,transparent_14px)] pointer-events-none opacity-40"></div>
                    {stageGroups.step5.length === 0 ? (
                      <span className="text-[9px] italic text-slate-400 w-full text-center relative z-10 py-5 font-semibold">Roller Bed Empty</span>
                    ) : (
                      stageGroups.step5.map(p => render2DTube(p))
                    )}
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100/80 flex justify-between items-center text-[10px] text-slate-500 font-bold">
                  <span>Active Batch</span>
                  <strong className="text-indigo-700 font-bold bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded font-mono text-[10.5px]">
                    {stageGroups.step5.length}
                  </strong>
                </div>
              </div>
            );
          })()}

          {/* Station 6: Spigot Calibration */}
          {(() => {
            const isSelfSelected = selectedStationId === "step6";
            const isAnySelected = selectedStationId !== "all";
            const isDimmed = isAnySelected && !isSelfSelected;
            const hasPipes = stageGroups.step6.length > 0;
            return (
              <div 
                onClick={() => setSelectedStationId(isSelfSelected ? "all" : "step6")}
                className={`cursor-pointer rounded-2xl p-4 transition-all duration-300 border-2 relative h-64 flex flex-col justify-between ${
                  isSelfSelected 
                    ? "bg-white border-blue-500 shadow-[0_4px_20px_rgba(59,130,246,0.15)] scale-[1.02] z-20" 
                    : "bg-white/90 border-slate-200/80 hover:border-slate-300 hover:shadow-sm"
                } ${isDimmed ? "opacity-35 saturate-50 hover:opacity-75 hover:saturate-100" : ""}`}
              >
                <div className={`absolute top-0 left-0 right-0 h-1 rounded-t-2xl ${isSelfSelected ? 'bg-blue-500' : 'bg-blue-500/20'}`}></div>
                
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2">
                    <div className={`p-2 rounded-xl border transition ${
                      isSelfSelected 
                        ? 'bg-blue-50 border-blue-200 text-blue-600' 
                        : 'bg-blue-50/50 border-blue-100 text-blue-505 text-blue-500'
                    }`}>
                      <Sliders className="w-4 h-4 text-blue-500" />
                    </div>
                    {hasPipes && (
                      <div className="flex items-center gap-1.5">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                        </span>
                        <span className="text-[8px] font-extrabold text-blue-600 uppercase tracking-tighter">LATHE RUNNING</span>
                      </div>
                    )}
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[9px] tracking-wider font-extrabold uppercase ${
                    isSelfSelected ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-500'
                  }`}>STG 6</span>
                </div>

                <div className="mt-2.5 flex-grow flex flex-col justify-between">
                  <div>
                    <h3 className="text-slate-800 font-extrabold text-xs tracking-tight uppercase flex items-center gap-1.5">
                      6. Spigot Calibration
                    </h3>
                    <p className="text-[10px] text-slate-500 leading-none mt-1">Shaving spigot outer diameter edge profile</p>
                    <div className="mt-2 flex items-center gap-2 text-[8px] font-mono font-bold text-slate-400 border-t border-slate-100 pt-2">
                      <span className="text-blue-600 font-bold">OFFSET: ±0.1mm</span>
                      <span>•</span>
                      <span>CNC LATHE</span>
                    </div>
                  </div>
                  
                  <div className="mt-3.5 relative border border-slate-200 bg-slate-50/50 rounded-xl p-2.5 h-[105px] overflow-y-auto no-scrollbar content-start flex flex-wrap gap-2 items-center justify-start shadow-inner">
                    <div className="absolute inset-0 bg-[repeating-linear-gradient(90deg,rgba(226,232,240,0.3)_0px,rgba(226,232,240,0.3)_2px,transparent_2px,transparent_14px)] pointer-events-none opacity-40"></div>
                    {stageGroups.step6.length === 0 ? (
                      <span className="text-[9px] italic text-slate-400 w-full text-center relative z-10 py-5 font-semibold">Roller Bed Empty</span>
                    ) : (
                      stageGroups.step6.map(p => render2DTube(p))
                    )}
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100/80 flex justify-between items-center text-[10px] text-slate-500">
                  <span>Active Batch</span>
                  <strong className="text-blue-700 font-bold bg-blue-50 border border-blue-100 px-2 py-0.5 rounded font-mono text-[10.5px]">
                    {stageGroups.step6.length}
                  </strong>
                </div>
              </div>
            );
          })()}

          {/* Station 7: Bell Calibration */}
          {(() => {
            const isSelfSelected = selectedStationId === "step7";
            const isAnySelected = selectedStationId !== "all";
            const isDimmed = isAnySelected && !isSelfSelected;
            const hasPipes = stageGroups.step7.length > 0;
            return (
              <div 
                onClick={() => setSelectedStationId(isSelfSelected ? "all" : "step7")}
                className={`cursor-pointer rounded-2xl p-4 transition-all duration-300 border-2 relative h-64 flex flex-col justify-between ${
                  isSelfSelected 
                    ? "bg-white border-violet-500 shadow-[0_4px_20px_rgba(139,92,246,0.15)] scale-[1.02] z-20" 
                    : "bg-white/90 border-slate-200/80 hover:border-slate-300 hover:shadow-sm"
                } ${isDimmed ? "opacity-35 saturate-50 hover:opacity-75 hover:saturate-100" : ""}`}
              >
                <div className={`absolute top-0 left-0 right-0 h-1 rounded-t-2xl ${isSelfSelected ? 'bg-violet-500' : 'bg-violet-500/20'}`}></div>
                
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2">
                    <div className={`p-2 rounded-xl border transition ${
                      isSelfSelected 
                        ? 'bg-violet-50 border-violet-200 text-violet-600' 
                        : 'bg-violet-50/50 border-violet-100 text-violet-505 text-violet-505 text-violet-500'
                    }`}>
                      <Bell className="w-4 h-4 text-violet-500" />
                    </div>
                    {hasPipes && (
                      <div className="flex items-center gap-1.5">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-500"></span>
                        </span>
                        <span className="text-[8px] font-extrabold text-violet-600 uppercase tracking-tighter">ROUTING GROOVE</span>
                      </div>
                    )}
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[9px] tracking-wider font-extrabold uppercase ${
                    isSelfSelected ? 'bg-violet-100 text-violet-800' : 'bg-slate-100 text-slate-500'
                  }`}>STG 7</span>
                </div>

                <div className="mt-2.5 flex-grow flex flex-col justify-between">
                  <div>
                    <h3 className="text-slate-800 font-extrabold text-xs tracking-tight uppercase flex items-center gap-1.5">
                      7. Bell Calibration
                    </h3>
                    <p className="text-[10px] text-slate-500 leading-none mt-1">Carving internal seal ring keyway groove</p>
                    <div className="mt-2 flex items-center gap-2 text-[8px] font-mono font-bold text-slate-400 border-t border-slate-100 pt-2">
                      <span className="text-violet-600">O-RING SLOT FIT</span>
                      <span>•</span>
                      <span>TOLERANCE CODE</span>
                    </div>
                  </div>
                  
                  <div className="mt-3.5 relative border border-slate-200 bg-slate-50/50 rounded-xl p-2.5 h-[105px] overflow-y-auto no-scrollbar content-start flex flex-wrap gap-2 items-center justify-start shadow-inner">
                    <div className="absolute inset-0 bg-[repeating-linear-gradient(90deg,rgba(226,232,240,0.3)_0px,rgba(226,232,240,0.3)_2px,transparent_2px,transparent_14px)] pointer-events-none opacity-40"></div>
                    {stageGroups.step7.length === 0 ? (
                      <span className="text-[9px] italic text-slate-400 w-full text-center relative z-10 py-5 font-semibold">Roller Bed Empty</span>
                    ) : (
                      stageGroups.step7.map(p => render2DTube(p))
                    )}
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100/80 flex justify-between items-center text-[10px] text-slate-500">
                  <span>Active Batch</span>
                  <strong className="text-violet-700 font-bold bg-violet-50 border border-violet-100 px-2 py-0.5 rounded font-mono text-[10.5px]">
                    {stageGroups.step7.length}
                  </strong>
                </div>
              </div>
            );
          })()}

          {/* Station 8: Final Inspection */}
          {(() => {
            const isSelfSelected = selectedStationId === "step8";
            const isAnySelected = selectedStationId !== "all";
            const isDimmed = isAnySelected && !isSelfSelected;
            const hasPipes = stageGroups.step8.length > 0;
            return (
              <div 
                onClick={() => setSelectedStationId(isSelfSelected ? "all" : "step8")}
                className={`cursor-pointer rounded-2xl p-4 transition-all duration-300 border-2 relative h-64 flex flex-col justify-between ${
                  isSelfSelected 
                    ? "bg-white border-purple-500 shadow-[0_4px_20px_rgba(168,85,247,0.15)] scale-[1.02] z-20" 
                    : "bg-white/90 border-slate-200/80 hover:border-slate-300 hover:shadow-sm"
                } ${isDimmed ? "opacity-35 saturate-50 hover:opacity-75 hover:saturate-100" : ""}`}
              >
                <div className={`absolute top-0 left-0 right-0 h-1 rounded-t-2xl ${isSelfSelected ? 'bg-purple-500' : 'bg-purple-500/20'}`}></div>
                
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2">
                    <div className={`p-2 rounded-xl border transition ${
                      isSelfSelected 
                        ? 'bg-purple-50 border-purple-200 text-purple-600' 
                        : 'bg-purple-50/50 border-purple-100 text-purple-505 text-purple-500'
                    }`}>
                      <ClipboardCheck className="w-4 h-4 text-purple-500" />
                    </div>
                    {hasPipes && (
                      <div className="flex items-center gap-1.5">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500"></span>
                        </span>
                        <span className="text-[8px] font-extrabold text-purple-600 uppercase tracking-tighter cursor-pulse">QA PRESSURE</span>
                      </div>
                    )}
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[9px] tracking-wider font-extrabold uppercase ${
                    isSelfSelected ? 'bg-purple-100 text-purple-800' : 'bg-slate-100 text-slate-500'
                  }`}>QA 8</span>
                </div>

                <div className="mt-2.5 flex-grow flex flex-col justify-between">
                  <div>
                    <h3 className="text-slate-800 font-extrabold text-xs tracking-tight uppercase flex items-center gap-1.5">
                      8. Final Inspection
                    </h3>
                    <p className="text-[10px] text-slate-500 leading-none mt-1">Hydrostatic 50-bar & thickness test</p>
                    <div className="mt-2 flex items-center gap-2 text-[8px] font-mono font-bold text-slate-400 border-t border-slate-100 pt-2">
                      <span className="text-purple-600">HYDRO-OK</span>
                      <span>•</span>
                      <span>ULTRASONIC T</span>
                    </div>
                  </div>
                  
                  <div className="mt-3.5 relative border border-slate-200 bg-slate-50/50 rounded-xl p-2.5 h-[105px] overflow-y-auto no-scrollbar content-start flex flex-wrap gap-2 items-center justify-start shadow-inner">
                    <div className="absolute inset-0 bg-[repeating-linear-gradient(90deg,rgba(226,232,240,0.3)_0px,rgba(226,232,240,0.3)_2px,transparent_2px,transparent_14px)] pointer-events-none opacity-40"></div>
                    {stageGroups.step8.length === 0 ? (
                      <span className="text-[9px] italic text-slate-400 w-full text-center relative z-10 py-5 font-semibold">Inspection Clear</span>
                    ) : (
                      stageGroups.step8.map(p => render2DTube(p))
                    )}
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100/80 flex justify-between items-center text-[10px] text-slate-500">
                  <span>Inspection Batch</span>
                  <strong className="text-purple-700 font-bold bg-purple-50 border border-purple-100 px-2 py-0.5 rounded font-mono text-[10.5px]">
                    {stageGroups.step8.length}
                  </strong>
                </div>
              </div>
            );
          })()}

          {/* Delivered Pipes Block in flowchart */}
          {(() => {
            const isSelfSelected = selectedStationId === "delivered";
            const isAnySelected = selectedStationId !== "all";
            const isDimmed = isAnySelected && !isSelfSelected;
            const deliveredPipesCount = stageGroups.delivered.length;
            const hasPipes = deliveredPipesCount > 0;
            return (
              <div 
                onClick={() => setSelectedStationId(isSelfSelected ? "all" : "delivered")}
                className={`cursor-pointer rounded-2xl p-4 transition-all duration-300 border-2 relative h-64 flex flex-col justify-between ${
                  isSelfSelected 
                    ? "bg-white border-emerald-500 shadow-[0_4px_20px_rgba(16,185,129,0.15)] scale-[1.02] z-20" 
                    : "bg-white/90 border-slate-200/80 hover:border-slate-300 hover:shadow-sm"
                } ${isDimmed ? "opacity-35 saturate-50 hover:opacity-75 hover:saturate-100" : ""}`}
              >
                <div className={`absolute top-0 left-0 right-0 h-1 rounded-t-2xl ${isSelfSelected ? 'bg-emerald-500' : 'bg-emerald-500/20'}`}></div>
                
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2">
                    <div className={`p-2 rounded-xl border transition ${
                      isSelfSelected 
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-600' 
                        : 'bg-emerald-50/50 border-emerald-100 text-slate-505 text-emerald-500'
                    }`}>
                      <Truck className="w-4 h-4 text-emerald-500" />
                    </div>
                    {hasPipes && (
                      <div className="flex items-center gap-1.5">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                        </span>
                        <span className="text-[8px] font-extrabold text-emerald-600 uppercase tracking-tighter">DISPATCHED</span>
                      </div>
                    )}
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[9px] tracking-wider font-extrabold uppercase ${
                    isSelfSelected ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'
                  }`}>RELEASED</span>
                </div>

                <div className="mt-2.5 flex-grow flex flex-col justify-between">
                  <div>
                    <h3 className="text-slate-800 font-extrabold text-xs tracking-tight uppercase flex items-center gap-1.5">
                      Delivered Handover
                    </h3>
                    <p className="text-[10px] text-slate-500 leading-none mt-1">Released pipes received at end-user site</p>
                    <div className="mt-2 flex items-center gap-2 text-[8px] font-mono font-bold text-slate-400 border-t border-slate-100 pt-2">
                      <span className="text-emerald-650 text-emerald-600">GATE PASS ACTIVE</span>
                      <span>•</span>
                      <span>LOGISTIC COMPLETED</span>
                    </div>
                  </div>
                  
                  <div className="mt-3.5 relative border border-slate-200 bg-slate-50/50 rounded-xl p-2.5 h-[105px] overflow-y-auto no-scrollbar content-start flex flex-wrap gap-2 items-center justify-start shadow-inner">
                    <div className="absolute inset-0 bg-[repeating-linear-gradient(90deg,rgba(226,232,240,0.3)_0px,rgba(226,232,240,0.3)_2px,transparent_2px,transparent_14px)] pointer-events-none opacity-40"></div>
                    {deliveredPipesCount === 0 ? (
                      <span className="text-[9px] italic text-slate-400 w-full text-center relative z-10 py-5 font-semibold">No delivered pipes yet</span>
                    ) : (
                      stageGroups.delivered.map(p => render2DTube(p))
                    )}
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100/80 flex justify-between items-center text-[10px] text-slate-500">
                  <span>Delivered Count</span>
                  <strong className="text-emerald-700 font-bold bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded font-mono text-[10.5px]">
                    {deliveredPipesCount}
                  </strong>
                </div>
              </div>
            );
          })()}

        </div>

        {/* FACTORY STORAGE YARDS (Dispatch Areas & Red Tag Quarantine Areas) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6 pt-6 border-t border-slate-200 animate-fade-in">
          
          {/* Commercial Ready Yard (DP-COMMERCIAL) */}
          <div 
            onClick={() => setSelectedStationId(selectedStationId === "dispatch_dp" ? "all" : "dispatch_dp")}
            className={`cursor-pointer rounded-2xl p-4 transition-all duration-300 border-2 flex flex-col justify-between h-auto min-h-52 ${
              selectedStationId === "dispatch_dp"
                ? "bg-white border-indigo-500 shadow-[0_4px_20px_rgba(79,70,229,0.15)] scale-[1.01] z-20"
                : "bg-white/90 border-slate-200/80 hover:border-slate-350 hover:shadow-sm"
            }`}
          >
            <div className="flex justify-between items-center border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-2">
                <div className={`p-1.5 rounded-xl border transition ${
                  selectedStationId === "dispatch_dp"
                    ? "bg-indigo-50 border-indigo-200 text-indigo-600"
                    : "bg-indigo-50/55 border-indigo-100 text-indigo-500"
                }`}>
                  <Truck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 font-black">Commercial Ready Yard</h3>
                  <p className="text-[10px] text-slate-500 font-semibold">DP-COMMERCIAL Stockpile</p>
                </div>
               </div>
              <strong className="text-sm text-indigo-700 font-extrabold font-mono bg-indigo-50 border border-indigo-100 px-2.5 py-0.5 rounded-lg">
                {stageGroups.dispatch_dp.length} units
              </strong>
            </div>

            <div className="mt-3.5 flex flex-wrap gap-1.5 overflow-y-auto max-h-32 no-scrollbar content-start">
              {stageGroups.dispatch_dp.length === 0 ? (
                <span className="text-[9px] text-slate-400 italic font-semibold py-4 w-full text-center">No commercial ready pipes</span>
              ) : (
                stageGroups.dispatch_dp.map(p => {
                  const isDelivered = p.isDispatched;
                  return (
                    <div 
                      key={p.pipeId}
                      className={`font-mono text-[8.5px] px-2 py-0.5 rounded-sm flex items-center gap-1 font-bold transition hover:scale-105 ${
                        isDelivered 
                          ? "bg-slate-105 border border-slate-205 text-slate-500" 
                          : "bg-indigo-50 border border-indigo-100 text-indigo-700 hover:bg-indigo-100/50"
                      }`}
                      title={isDelivered ? `Delivered to client on ${new Date(p.dispatchedAt || '').toLocaleDateString()} by ${p.dispatchedBy}` : "Pending shipment to client"}
                    >
                      <span className={`w-1 h-1 rounded-full ${isDelivered ? "bg-slate-400" : "bg-indigo-500 animate-pulse"}`}></span>
                      {p.pipeId}
                      {isDelivered && (
                        <span className="text-[8px] font-black text-indigo-600">✔</span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* RPS Yard Stock (RPS-COMMERCIAL) */}
          <div 
            onClick={() => setSelectedStationId(selectedStationId === "dispatch_rps" ? "all" : "dispatch_rps")}
            className={`cursor-pointer rounded-2xl p-4 transition-all duration-300 border-2 flex flex-col justify-between h-auto min-h-52 ${
              selectedStationId === "dispatch_rps"
                ? "bg-white border-emerald-500 shadow-[0_4px_20px_rgba(16,185,129,0.15)] scale-[1.01] z-20"
                : "bg-white/90 border-slate-200/80 hover:border-slate-350 hover:shadow-sm"
            }`}
          >
            <div className="flex justify-between items-center border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-2">
                <div className={`p-1.5 rounded-xl border transition ${
                  selectedStationId === "dispatch_rps"
                    ? "bg-emerald-50 border-emerald-200 text-emerald-600"
                    : "bg-emerald-50/55 border-emerald-100 text-emerald-500"
                }`}>
                  <Truck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 font-black">RPS Yard Stock</h3>
                  <p className="text-[10px] text-slate-500 font-semibold">RPS-COMMERCIAL Stockpile</p>
                </div>
               </div>
              <strong className="text-sm text-emerald-700 font-extrabold font-mono bg-emerald-50 border border-emerald-100 px-2.5 py-0.5 rounded-lg">
                {stageGroups.dispatch_rps.length} units
              </strong>
            </div>

            <div className="mt-3.5 flex flex-wrap gap-1.5 overflow-y-auto max-h-32 no-scrollbar content-start">
              {stageGroups.dispatch_rps.length === 0 ? (
                <span className="text-[9px] text-slate-400 italic font-semibold py-4 w-full text-center">No RPS-destined ready pipes</span>
              ) : (
                stageGroups.dispatch_rps.map(p => {
                  const isDelivered = p.isDispatched;
                  return (
                    <div 
                      key={p.pipeId}
                      className={`font-mono text-[8.5px] px-2 py-0.5 rounded-sm flex items-center gap-1 font-bold transition hover:scale-105 ${
                        isDelivered 
                          ? "bg-slate-105 border border-slate-205 text-slate-500" 
                          : "bg-emerald-50 border border-emerald-100 text-emerald-700 hover:bg-emerald-100/50"
                      }`}
                      title={isDelivered ? `Delivered to client on ${new Date(p.dispatchedAt || '').toLocaleDateString()} by ${p.dispatchedBy}` : "Pending shipment to client"}
                    >
                      <span className={`w-1 h-1 rounded-full ${isDelivered ? "bg-slate-400" : "bg-emerald-500 animate-pulse"}`}></span>
                      {p.pipeId}
                      {isDelivered && (
                        <span className="text-[8px] font-black text-emerald-600">✔</span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* NCR Quarantine / Red Tag Area */}
          <div 
            onClick={() => setSelectedStationId(selectedStationId === "quarantine" ? "all" : "quarantine")}
            className={`cursor-pointer rounded-2xl p-4 transition-all duration-300 border-2 flex flex-col justify-between h-auto min-h-52 ${
              selectedStationId === "quarantine"
                ? "bg-white border-rose-500 shadow-[0_4px_20px_rgba(244,63,94,0.15)] scale-[1.01] z-20"
                : "bg-white/90 border-slate-200/80 hover:border-slate-350 hover:shadow-sm"
            }`}
          >
            <div className="flex justify-between items-center pb-2.5 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className={`p-1.5 rounded-xl border transition ${
                  selectedStationId === "quarantine"
                    ? "bg-rose-50 border-rose-200 text-rose-600"
                    : "bg-rose-50/55 border-rose-100 text-rose-500"
                }`}>
                  <AlertTriangle className="w-4 h-4 text-rose-500" />
                </div>
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 font-black">⚠️ NCR Quarantine Area</h3>
                  <p className="text-[10px] text-rose-500">Red Tag Isolated / Awaiting MRB Review</p>
                </div>
              </div>
              <strong className="text-sm text-rose-700 font-extrabold font-mono bg-rose-50 border border-rose-100 px-2.5 py-0.5 rounded-lg">
                {stageGroups.quarantine.length} units
              </strong>
            </div>

            <div className="mt-3.5 flex flex-wrap gap-1.5 overflow-y-auto max-h-32 no-scrollbar content-start">
              {stageGroups.quarantine.length === 0 ? (
                <span className="text-[10px] text-slate-40 w-full text-center py-4 font-semibold text-slate-400 italic block">Spotless floor. No active defects reported!</span>
              ) : (
                stageGroups.quarantine.map(p => (
                  <div 
                    key={p.pipeId}
                    className="bg-rose-50 border border-rose-200 text-rose-800 font-mono text-[9px] px-2 py-0.5 rounded-sm flex items-center gap-1 hover:bg-rose-100/30 hover:border-rose-350 font-black cursor-pointer shadow-sm animate-pulse"
                    title="Click below to inspect failure details"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-ping"></span>
                    {p.pipeId}
                    <span className="text-[8px] bg-red-100 text-rose-700 font-extrabold px-1 rounded-sm uppercase tracking-wide">RED TAG</span>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>

      </div>

      {/* DETAILED ACTIVE STATION CONTROL PANEL (Interactive Slide Drawer Desk) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Workstation Specification Sheet (6 columns) */}
        <div className="bg-white rounded-2xl border border-gray-150 shadow-sm p-5 sm:p-6 lg:col-span-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 pb-3.5 border-b border-gray-100">
              {activeStationDetails ? (
                <>
                  <div className={`p-2 rounded-xl text-blue-600 bg-blue-100 ${activeStationDetails.colorClass}`}>
                    <activeStationDetails.icon className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="font-extrabold text-sm text-slate-900 tracking-tight leading-none uppercase">{activeStationDetails.name}</h2>
                    <span className="text-[9.5px] text-slate-400 font-mono uppercase tracking-wider block mt-1">Workstation Profile</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="p-2 bg-slate-100 text-slate-500 rounded-xl">
                    <Info className="w-5 h-5 shrink-0" />
                  </div>
                  <div>
                    <h2 className="font-extrabold text-sm text-slate-800 tracking-tight uppercase leading-none">Full Production Flow</h2>
                    <span className="text-[9.5px] text-gray-400 font-mono block uppercase tracking-wider mt-1">Multi-Stage Audits</span>
                  </div>
                </>
              )}
            </div>

            <div className="py-4 space-y-4">
              {activeStationDetails ? (
                <>
                  <div>
                    <span className="text-[10px] text-gray-400 block font-bold uppercase tracking-wider">Manufacturing Purpose</span>
                    <p className="text-xs text-slate-650 text-slate-600 leading-relaxed mt-1">{activeStationDetails.desc}</p>
                  </div>

                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-150">
                    <span className="text-[10px] text-gray-500 block font-black uppercase tracking-wider">Standard Operating Procedure</span>
                    <p className="text-xs text-indigo-950 font-medium leading-relaxed mt-1.5 italic">
                      " {activeStationDetails.procedure} "
                    </p>
                  </div>
                </>
              ) : (
                <div className="space-y-3.5 text-xs text-gray-600">
                  <p className="leading-relaxed">
                    Fiberglass pipe manufacturing moves sequentially through <strong>8 automated & manual stations</strong>:
                  </p>
                  <ul className="space-y-1.5 list-disc pl-4 text-gray-500 text-[11px]">
                    <li>Molds are checked and lined to establish the chemical-proof inner barrier.</li>
                    <li>Filaments are wound at complex angles matching the design pressure.</li>
                    <li>Ovens cure the polymer matrix to full crosslinked structural stiffness.</li>
                    <li>Pipes are extracted from mandrels, calibrated, jointed and tested.</li>
                  </ul>
                  <div className="bg-blue-50/50 p-3.5 rounded-xl border border-blue-100/70 text-blue-800 text-[10.5px]">
                    <strong>Navigation Tip:</strong> Click any station box on the 2D layout above to isolate and inspect the exact tubes currently positioned at that workstation stage.
                  </div>
                </div>
              )}
            </div>
          </div>

          {activeStationDetails && (
            <button
              onClick={() => setSelectedStationId("all")}
              className="w-full text-center py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer"
            >
              Clear Station Selection
            </button>
          )}
        </div>

        {/* Workstation Pipes Roster Racks (8 columns) */}
        <div className="bg-white rounded-2xl border border-gray-150 shadow-sm p-5 sm:p-6 lg:col-span-8">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-3.5 border-b border-gray-100 mb-4 gap-4">
            <div>
              <span className="text-[9.5px] uppercase font-bold text-gray-400 tracking-wider">Tubes positioned here</span>
              <h2 className="text-sm font-black text-slate-800 tracking-tight leading-none uppercase">
                {selectedStationId === "all" ? "All Active Leads Queue" : `Station Ledger Area`} ({ledgerFilteredPositions.length} matches)
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
              {/* Optional Quick Dropdown to isolate station within this Ledger card */}
              <div className="relative">
                <select
                  value={selectedStationId}
                  onChange={(e) => setSelectedStationId(e.target.value)}
                  className="bg-slate-50 border border-gray-200 text-xs px-2.5 py-1.5 rounded-xl text-slate-700 focus:outline-none focus:border-blue-500 transition cursor-pointer font-bold"
                >
                  <option value="all">📁 All Steps / Stages</option>
                  <option value="step1">Station 1: Mold Prep ({fullStageCounts.step1})</option>
                  <option value="step2">Station 2: Liner ({fullStageCounts.step2})</option>
                  <option value="step3">Station 3: Winding ({fullStageCounts.step3})</option>
                  <option value="step4">Station 4: Cure ({fullStageCounts.step4})</option>
                  <option value="step5">Station 5: Demolding ({fullStageCounts.step5})</option>
                  <option value="step6">Station 6: Spigot ({fullStageCounts.step6})</option>
                  <option value="step7">Station 7: Bell ({fullStageCounts.step7})</option>
                  <option value="step8">Station 8: Inspection ({fullStageCounts.step8})</option>
                  <option value="dispatch_dp">Commercial Yard Stock ({fullStageCounts.dispatch_dp})</option>
                  <option value="dispatch_rps">RPS Yard Stock ({fullStageCounts.dispatch_rps})</option>
                  <option value="quarantine">NCR Quarantine Red Spot ({fullStageCounts.quarantine})</option>
                </select>
              </div>

              {/* Dedicated Ledger-Specific Search Option */}
              <div className="relative w-full sm:w-44">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="w-3.5 h-3.5 text-slate-400" />
                </span>
                <input
                  type="text"
                  placeholder={`Search ${selectedStationId === "all" ? "ledger" : "step"}...`}
                  value={ledgerSearchQuery}
                  onChange={(e) => setLedgerSearchQuery(e.target.value)}
                  className="w-full bg-slate-50 hover:bg-slate-100/70 text-xs pl-8 pr-7 py-1.5 rounded-xl border border-gray-200 focus:outline-none focus:border-blue-500 focus:bg-white transition"
                />
                {ledgerSearchQuery && (
                  <button
                    onClick={() => setLedgerSearchQuery("")}
                    className="absolute inset-y-0 right-0 pr-2 flex items-center text-gray-400 hover:text-gray-650 cursor-pointer text-xs font-bold"
                  >
                    &times;
                  </button>
                )}
              </div>

              <div className="text-[11px] text-slate-500 font-semibold bg-slate-50 border px-2.5 py-1.5 rounded-xl whitespace-nowrap">
                Showing {ledgerFilteredPositions.length} of {filteredPositions.length}
              </div>
            </div>
          </div>

          {/* Table list */}
          {ledgerFilteredPositions.length === 0 ? (
            <div className="text-center py-16 bg-slate-50/30 rounded-2xl border border-dashed border-gray-200">
              <span className="bg-slate-100 text-slate-500 p-3 rounded-full inline-block">
                <Box className="w-5 h-5 opacity-60" />
              </span>
              <h3 className="font-bold text-sm text-slate-700 mt-2.5">No matching pipes found</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1 leading-snug">
                There are no fiberglass cylinder pipes currently located on this workstation matching your filtered criteria.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[310px] overflow-y-auto border border-gray-150 rounded-xl">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 text-slate-400 font-bold uppercase tracking-wider text-[10px] sticky top-0 z-10 border-b border-gray-150 select-none">
                  <tr>
                    <th className="py-3 px-4">Pipe ID Serial</th>
                    <th className="py-3 px-2">Polymer Type</th>
                    <th className="py-3 px-2 text-center">ø Dia x Length</th>
                    <th className="py-3 px-2">Workorder WO</th>
                    <th className="py-3 px-2">Location / Stage</th>
                    <th className="py-3 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-slate-700 font-medium font-sans">
                  {ledgerFilteredPositions.map(({ pipe, stageId, stageName }) => {
                    const polymer = getPipeClassColor(pipe.header.pipeType);
                    const isNcr = stageId === "quarantine";
                    const isDone = stageId === "dispatch_dp" || stageId === "dispatch_rps" || stageId === "delivered";
                    
                    return (
                      <tr key={pipe.pipeId} className="hover:bg-slate-50/75 transition duration-150">
                        <td className="py-3 px-4 font-mono font-bold text-slate-900 flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full inline-block border border-white" style={{ backgroundColor: polymer.gradStart }}></span>
                          {pipe.pipeId}
                        </td>
                        <td className="py-3 px-2 text-slate-600">
                          <span className="truncate max-w-[120px] block" title={pipe.header.pipeType}>
                            {pipe.header.pipeType}
                          </span>
                        </td>
                        <td className="py-3 px-2 text-center font-mono text-[11px] text-slate-550">
                          {pipe.header.diameter}mm × {(pipe.header.length / 1000).toFixed(1)}m
                        </td>
                        <td className="py-3 px-2 text-slate-500 font-mono">
                          {pipe.header.projectWorkOrder}
                        </td>
                        <td className="py-3 px-2">
                          <span className={`inline-block text-[10px] uppercase font-bold px-2 py-0.5 rounded-md ${
                            isNcr 
                              ? "bg-rose-50 text-rose-700 border border-rose-200"
                              : pipe.isDispatched
                              ? "bg-blue-50 text-blue-700 border border-blue-200"
                              : isDone 
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-blue-50 text-blue-700 border border-blue-100"
                          }`}>
                            {stageName}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right whitespace-nowrap">
                          <div className="flex justify-end gap-1.5 items-center">
                            {isDone && currentUserRole === "admin" && (
                              <button
                                type="button"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  if (onDispatchPipe) {
                                    await onDispatchPipe(pipe.pipeId, !pipe.isDispatched);
                                  }
                                }}
                                className={`text-[10.5px] font-bold py-1 px-2.5 rounded-lg flex items-center gap-1 transition active:scale-95 cursor-pointer shadow-3xs ${
                                  pipe.isDispatched 
                                    ? "bg-amber-600 hover:bg-amber-700 text-white" 
                                    : "bg-emerald-600 hover:bg-emerald-700 text-white"
                                }`}
                                title={pipe.isDispatched ? "Revert dispatch delivery status" : "Dispatch completed pipe to client"}
                              >
                                <Truck className="w-3.5 h-3.5" />
                                {pipe.isDispatched ? "Undo Dispatch" : "Dispatch / Deliver"}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => onLoadPipe(pipe)}
                              className="bg-blue-600 hover:bg-blue-700 text-white text-[10.5px] font-bold py-1 px-2.5 rounded-lg flex items-center gap-1 transition active:scale-95 cursor-pointer shadow-3xs"
                              title="Load record and open in active quality worksheet"
                            >
                              <Play className="w-3 h-3 fill-white" />
                              Worksheet
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Quick interactive schematic guide legends */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mt-4 pt-4 border-t border-gray-100 text-[11px] text-gray-500">
            <div>
              <strong className="text-slate-800 block mb-0.5">Scale Representation:</strong>
              Cylinders represent physical dimension ratios. Larger diameters are drawn thicker; longer lengths are drawn wider.
            </div>
            <div>
              <strong className="text-slate-800 block mb-0.5">Red Tag Rule:</strong>
              Any failed telemetry check triggers an automatic red alert quarantine route of the pipe, bypassing step tracking.
            </div>
            <div>
              <strong className="text-slate-800 block mb-0.5">Floor Navigation:</strong>
              Click "Worksheet" on a row to auto-load that pipe into the dynamic 8-step quality checklist tracker form.
            </div>
          </div>
        </div>

      </div>

    </div>
  );

  // Custom 2D Pipe Cylinder vector renderer showing physical shapes & hover tooltips
  function render2DTube(pipe: PipeRecord) {
    const pType = pipe.header.pipeType;
    const colors = getPipeClassColor(pType);
    const id = pipe.pipeId;

    // Calculate dimensions based on actual metadata (proportional scaling)
    const baseWidth = 50; // min width
    const additionalWidth = (pipe.header.length / 12000) * 35; // scales up to 85 max width
    const width = Math.min(85, Math.max(baseWidth, baseWidth + additionalWidth));

    const baseHeight = 14; // min height
    const additionalHeight = (pipe.header.diameter / 1000) * 16; // scales up to 30 max height
    const height = Math.min(30, Math.max(baseHeight, baseHeight + additionalHeight));

    const isHovered = hoveredPipeId === id;

    return (
      <div
        key={id}
        className="relative flex flex-col items-center select-none cursor-pointer group shrink-0 transition mt-0.5"
        style={{ width: `${width}px` }}
        onMouseEnter={() => setHoveredPipeId(id)}
        onMouseLeave={() => setHoveredPipeId(null)}
        onClick={(e) => {
          e.stopPropagation(); // preserve station click
          // Auto filter results to show exactly this pipe
          setSearchQuery(id);
        }}
      >
        {/* SVG cylinder representive 2D drawing of fiberglass pipe */}
        <svg 
          width={width} 
          height={height} 
          viewBox={`0 0 ${width} ${height}`} 
          className="overflow-visible transform group-hover:scale-105 group-hover:-translate-y-0.5 transition duration-200"
        >
          <defs>
            <linearGradient id={`grad-${id}`} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={colors.gradEnd} stopOpacity="1" />
              <stop offset="35%" stopColor={colors.gradStart} stopOpacity="1" />
              <stop offset="65%" stopColor="#ffffff" stopOpacity="0.65" />
              <stop offset="100%" stopColor={colors.gradEnd} stopOpacity="1" />
            </linearGradient>
            
            <filter id={`glow-${id}`} x="-10%" y="-10%" width="120%" height="120%">
              <feDropShadow dx="0" dy="0" stdDeviation="2.5" floodColor={colors.gradStart} floodOpacity="0.8" />
            </filter>
          </defs>

          {/* Behind glowing shadow when hovered */}
          {isHovered && (
            <rect 
              x="2" 
              y="2" 
              width={width - 4} 
              height={height - 4} 
              rx="4" 
              filter={`url(#glow-${id})`}
            />
          )}

          {/* Cylinder Main Body */}
          <rect
            x="3"
            y="0"
            width={width - 6}
            height={height}
            rx="1.5"
            fill={`url(#grad-${id})`}
            className="stroke-slate-400 stroke-[0.75px]"
          />

          {/* Left elliptical lip (depth representation) */}
          <ellipse
            cx="3"
            cy={height / 2}
            rx="2.5"
            ry={height / 2}
            fill="#64748b"
            className="stroke-slate-400 stroke-[0.75px]"
          />

          {/* Right elliptical closure */}
          <ellipse
            cx={width - 3}
            cy={height / 2}
            rx="2.5"
            ry={height / 2}
            fill={colors.gradStart}
            className="stroke-slate-400 stroke-[0.75px]"
          />

          {/* Dynamic inner structural rib overlays for fiberglass winding pattern */}
          {pType.includes("Winding") || true ? (
            <path 
              d={`M 10 0 L 15 ${height} M 20 0 L 25 ${height} M 30 0 L 35 ${height} M 40 0 L 45 ${height} M ${width-20} 0 L ${width-15} ${height}`} 
              stroke="white" 
              strokeOpacity="0.15" 
              strokeWidth="0.8"
              fill="none" 
            />
          ) : null}

          {/* Serial print stamp on pipe (very detailed!) */}
          {height > 16 && width > 55 && (
            <text 
              x={width / 2} 
              y={height / 2 + 3} 
              textAnchor="middle" 
              fill="white" 
              fillOpacity="0.95" 
              fontSize="6.5px" 
              fontWeight="bold"
              fontFamily="monospace"
              className="pointer-events-none select-none"
            >
              {id}
            </text>
          )}
        </svg>

        {/* Dynamic Full Serial Label Badge */}
        <div className="mt-1 px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-200 font-mono text-[7.5px] font-extrabold tracking-tight leading-none text-center select-none truncate max-w-full shadow-md group-hover:border-slate-500 group-hover:bg-slate-900 group-hover:text-white transition-all duration-150">
          {id}
        </div>

        {/* Dynamic Tooltip popup on cylinder hover (absolutely positioned) */}
        {isHovered && (
          <div className="absolute left-1/2 -top-24 -translate-x-1/2 bg-slate-950 text-white rounded-xl border border-slate-800 p-2.5 shadow-2xl z-50 w-48 text-[11px] pointer-events-none animate-fade-in line-clamp-2 leading-tight">
            <div className="flex justify-between items-center pb-1 border-b border-slate-800 font-mono font-bold">
              <span className="text-orange-450 text-blue-400">{id}</span>
              <span className="text-[9px] bg-slate-800 px-1 py-0.5 rounded text-slate-300 font-normal">
                {pipe.header.lotNo}
              </span>
            </div>
            <div className="space-y-1 mt-1.5 font-sans">
              <p className="font-semibold text-slate-350 text-slate-300 truncate">{colors.label}</p>
              <div className="flex justify-between text-slate-400 text-[10px]">
                <span>ø Diameter:</span>
                <span className="font-bold text-slate-200">{pipe.header.diameter}mm</span>
              </div>
              <div className="flex justify-between text-slate-400 text-[10px]">
                <span>Length L:</span>
                <span className="font-bold text-slate-200">{(pipe.header.length / 1000).toFixed(1)}m</span>
              </div>
              <p className="text-[9px] text-indigo-400 italic font-medium mt-1">Click to lock filter results</p>
            </div>
          </div>
        )}
      </div>
    );
  }
}

// Minimal Box dummy wrapper to avoid lucide imports collision
function Box({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m7.5 4.27 9 5.15"/>
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/>
      <path d="m3.3 7 8.7 5 8.7-5"/>
      <path d="M12 22V12"/>
    </svg>
  );
}

export default React.memo(TrackingPlane);
