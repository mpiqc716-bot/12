import React, { useState, useEffect, useRef } from "react";
import { 
  ArrowLeft, 
  ArrowRight, 
  CheckCircle, 
  CheckCircle2,
  AlertTriangle, 
  AlertCircle,
  ShieldCheck,
  Info, 
  FileText, 
  Check, 
  X,
  Gauge,
  Thermometer,
  Layers,
  CircleDot,
  Grid3X3,
  Search,
  Eye,
  Camera,
  RefreshCw,
  History,
  ClipboardCheck,
  RotateCcw
} from "lucide-react";
import { 
  StepQualityCheck, 
  PipeHeader,
  PipeRecord,
  StepRecord
} from "../types";
import CameraCapture from "./CameraCapture";
import { exportStepNCRToPDF } from "../utils/pdfGenerator";

interface StepDetailProps {
  pipeId: string;
  pipeHeader: PipeHeader;
  stepNo: number;
  savedStepData?: StepRecord;
  onSaveStep: (stepNo: number, stepData: {
    fields: any;
    qualityChecks: StepQualityCheck[];
    additionalObs: string;
    image?: string;
    isNonConform?: boolean;
    ncrReason?: string;
  }) => Promise<void>;
  onUnsaveStep?: (stepNo: number) => Promise<void>;
  onPrev: () => void;
  onNext: () => void;
  isSaving: boolean;
  allPipes?: PipeRecord[];
  tolerances?: any[];
  currentUserRole?: string;
}

// Default Quality Checks based on steps
const STEP_QUALITY_CHECKS: { [key: number]: string[] } = {
  1: ["Clean surface", "Release agent application", "Dimensional check passed", "Crack/Damage check"],
  2: ["Thickness tolerance", "Air pockets/bubbles check", "Surface smoothness"],
  3: ["Layer count matches specification", "Winding angle correct", "No dry spots or resin-rich areas", "Uniform wall thickness", "No visual defects"],
  4: ["Temperature profile met", "No warping or deformation", "Surface hardness acceptable", "Cure time completed fully"],
  5: ["No cracking during ejection", "Pipe released cleanly", "Inner surface undamaged", "Outer surface undamaged"],
  6: ["Spigot surface smooth and even", "No chipping on edges", "No visible defects", "Dimensional check passed"],
  7: ["Bell socket surface smooth", "No undercutting observed", "Sealing groove profile correct", "No visible defects", "Dimensional check passed"],
  8: ["All surfaces clean and free of contamination", "Marking legible and correct", "No visible defects on final pipe", "Ready for dispatch"]
};

export const getStepName = (step: number): string => {
  switch (step) {
    case 1: return "Mold Preparation";
    case 2: return "Liner Process";
    case 3: return "Structural Filament Winding Process";
    case 4: return "Post Cure";
    case 5: return "Hydraulic Ejection";
    case 6: return "Spigot Grinder";
    case 7: return "Bell Grinder Calibration Data Sheet";
    case 8: return "Packaging Verification & Final Clearance";
    default: return "";
  }
};

export const getStepProcedures = (step: number): string[] => {
  switch (step) {
    case 2:
      return ["Procedure for Visual Inspection.MPI-SOP-QC-13/Version:00"];
    case 3:
      return ["Procedure for Visual Inspection.MPI-SOP-QC-13/Version:00"];
    case 5:
      return ["Procedure for Visual Inspection.MPI-SOP-QC-13/Version:00"];
    case 6:
      return [
        "Procedure for Visual Inspection.MPI-SOP-QC-13/Version:00",
        "Procedure for DIMENTINAL Inspection.MPI-SOP-QC-14/Version:00"
      ];
    case 7:
      return [
        "Procedure for Visual Inspection.MPI-SOP-QC-13/Version:00",
        "Procedure for DIMENTINAL Inspection.MPI-SOP-QC-14/Version:00"
      ];
    default:
      return [];
  }
};

function StepDetail({
  pipeId,
  pipeHeader,
  stepNo,
  savedStepData,
  onSaveStep,
  onUnsaveStep,
  onPrev,
  onNext,
  isSaving,
  allPipes,
  tolerances = [],
  currentUserRole
}: StepDetailProps) {
  // Fields dynamic states
  const [fields, setFields] = useState<any>({});
  const [qualityChecks, setQualityChecks] = useState<StepQualityCheck[]>([]);
  const [additionalObs, setAdditionalObs] = useState("");
  const [image, setImage] = useState<string | undefined>(undefined);
  const [showNotification, setShowNotification] = useState(false);
  const [hasAutofilled, setHasAutofilled] = useState<string | null>(null);
  const [isNonConform, setIsNonConform] = useState(false);
  const [ncrReason, setNcrReason] = useState("");

  const getActiveTolerance = (): any | null => {
    if (!tolerances || tolerances.length === 0) return null;
    
    const proj = pipeHeader.projectWorkOrder || "";
    const spec = pipeHeader.settingReference || "";
    
    // 1. Exact match (specific project & specific specification reference)
    let match = tolerances.find(t => 
      t.project.toLowerCase() === proj.toLowerCase() && 
      t.specification.toLowerCase() === spec.toLowerCase()
    );
    if (match) return match;

    // 2. Project match with specification wildcard/any
    match = tolerances.find(t => 
      t.project.toLowerCase() === proj.toLowerCase() && 
      (t.specification.toLowerCase() === "all" || t.specification.toLowerCase() === "any" || t.specification.toLowerCase() === "all specifications")
    );
    if (match) return match;

    // 3. Fallback specification match
    match = tolerances.find(t => 
      (t.project.toLowerCase() === "all" || t.project.toLowerCase() === "any" || t.project.toLowerCase() === "all projects") && 
      t.specification.toLowerCase() === spec.toLowerCase()
    );
    if (match) return match;

    // 4. Default fallback tolerance template from db (e.g. ID containing "default")
    match = tolerances.find(t => t.id.includes("default") || t.project === "All Projects");
    if (match) return match;

    // 5. Hard fallback to first defined tolerance config
    return tolerances[0] || null;
  };

  const getFieldSpecRange = (key: string): { min: any; max: any } | null => {
    const activeTol = getActiveTolerance();
    if (!activeTol) return null;
    const r = activeTol[key] || null;
    return r;
  };

  const formatRangeText = (range: { min: any; max: any } | null): string => {
    if (!range) return "ND";
    const minIsNd = range.min === "ND" || range.min === undefined || range.min === null || range.min === "";
    const maxIsNd = range.max === "ND" || range.max === undefined || range.max === null || range.max === "";
    if (minIsNd && maxIsNd) return "ND";
    if (minIsNd) return `≤ ${range.max}`;
    if (maxIsNd) return `≥ ${range.min}`;
    return `${range.min} - ${range.max}`;
  };

  const checkValueInSpec = (key: string, val: any): { inSpec: boolean; min: any; max: any } | null => {
    if (val === undefined || val === null || val === "" || isNaN(Number(val))) return null;
    const range = getFieldSpecRange(key);
    if (!range) return null;
    const num = Number(val);
    
    const minIsNd = range.min === "ND" || range.min === undefined || range.min === null || range.min === "";
    const maxIsNd = range.max === "ND" || range.max === undefined || range.max === null || range.max === "";

    if (minIsNd && maxIsNd) {
      return null;
    }

    let inSpec = true;
    if (!minIsNd) {
      inSpec = inSpec && num >= Number(range.min);
    }
    if (!maxIsNd) {
      inSpec = inSpec && num <= Number(range.max);
    }

    return { 
      inSpec, 
      min: minIsNd ? "ND" : Number(range.min), 
      max: maxIsNd ? "ND" : Number(range.max) 
    };
  };

  const isDirtyRef = useRef(false);
  const prevStepKeyRef = useRef<string | null>(null);

  // Finds the pipe processed immediately prior to the current pipe
  const getPreviousPipe = (): PipeRecord | null => {
    if (!allPipes || allPipes.length === 0) return null;
    
    // 1. Precise Sequential Predecessor Match (e.g. matching P-001 when on P-002)
    const curMatch = pipeId.match(/^(.*?)(\d+)([a-zA-Z0-9_-]*)$/);
    if (curMatch) {
      const prefix = curMatch[1];
      const digits = curMatch[2];
      const suffix = curMatch[3] || "";
      const currentNum = parseInt(digits, 10);
      const prevNum = currentNum - 1;

      if (prevNum >= 0) {
        // Pad the previous number to maintain the same length as current digits
        const paddedDigits = String(prevNum).padStart(digits.length, "0");
        const targetId = `${prefix}${paddedDigits}${suffix}`.toUpperCase();

        const sequentialMatch = allPipes.find(
          p => p.pipeId.trim().toUpperCase() === targetId
        );
        if (sequentialMatch) {
          return sequentialMatch;
        }
      }
    }

    // 2. Fallback: Sorted contiguous matching (existing behavior)
    if (allPipes.length <= 1) return null;
    const getPipeNumberVal = (id: string): number => {
      const match = id.match(/\d+/);
      return match ? parseInt(match[0], 10) : 0;
    };
    
    const sorted = [...allPipes].sort((a, b) => {
      const numA = getPipeNumberVal(a.pipeId);
      const numB = getPipeNumberVal(b.pipeId);
      if (numA !== numB) return numA - numB;
      return a.pipeId.localeCompare(b.pipeId, undefined, { numeric: true, sensitivity: "base" });
    });
    
    const currentIndex = sorted.findIndex(p => p.pipeId === pipeId);
    if (currentIndex > 0) {
      return sorted[currentIndex - 1];
    }
    return null;
  };

  const prevPipe = getPreviousPipe();
  const prevStepData = prevPipe ? (prevPipe.steps[stepNo] || (prevPipe.steps as any)[String(stepNo)]) : null;

  const handleCopyFromPrevious = () => {
    if (!prevStepData) return;
    setFields({ ...prevStepData.fields });
    if (prevStepData.qualityChecks) {
      setQualityChecks(currentChecks => {
        return currentChecks.map(currentQc => {
          const matchingPrev = prevStepData.qualityChecks.find(
            prevQc => prevQc.label === currentQc.label
          );
          if (matchingPrev) {
            return { ...currentQc, status: matchingPrev.status };
          }
          return currentQc;
        });
      });
    }
    setAdditionalObs(prevStepData.additionalObs || "");
    if (prevStepData.image) {
      setImage(prevStepData.image);
    }
    setIsNonConform(!!prevStepData.isNonConform);
    setNcrReason(prevStepData.ncrReason || "");
    setHasAutofilled(prevPipe?.pipeId || "Previous Pipe");
    isDirtyRef.current = true;
  };

  // Load existing step data if available, or load default checks
  useEffect(() => {
    const currentStepKey = `${pipeId}-${stepNo}`;
    const stepOrPipeChanged = prevStepKeyRef.current !== currentStepKey;

    if (stepOrPipeChanged) {
      isDirtyRef.current = false;
      prevStepKeyRef.current = currentStepKey;
    }

    if (stepOrPipeChanged || !isDirtyRef.current) {
      if (savedStepData) {
        setFields({ ...savedStepData.fields });
        setQualityChecks(savedStepData.qualityChecks || []);
        setAdditionalObs(savedStepData.additionalObs || "");
        setImage(savedStepData.image);
        setIsNonConform(!!savedStepData.isNonConform);
        setNcrReason(savedStepData.ncrReason || "");
        setHasAutofilled(null);
      } else {
        // No step data exists for current pipe yet. Try loading memory from the previous pipe's step!
        const prevPipeVal = getPreviousPipe();
        const prevStepDataVal = prevPipeVal ? (prevPipeVal.steps[stepNo] || (prevPipeVal.steps as any)[String(stepNo)]) : null;

        if (prevStepDataVal) {
          setFields({ ...prevStepDataVal.fields });
          setQualityChecks(prevStepDataVal.qualityChecks || []);
          setAdditionalObs(prevStepDataVal.additionalObs || "");
          setImage(prevStepDataVal.image);
          setIsNonConform(!!prevStepDataVal.isNonConform);
          setNcrReason(prevStepDataVal.ncrReason || "");
          setHasAutofilled(prevPipeVal.pipeId);
        } else {
          // Initialize fresh fields based on current step
          setFields(getDefaultFieldsForStep(stepNo));
          
          // Initialize default quality checks
          const labels = STEP_QUALITY_CHECKS[stepNo] || [];
          const checks = labels.map((label, idx) => ({
            id: `${stepNo}-${idx + 1}`,
            label,
            status: null as "Pass" | "Fail" | null
          }));
          setQualityChecks(checks);
          setAdditionalObs("");
          setImage(undefined);
          setIsNonConform(false);
          setNcrReason("");
          setHasAutofilled(null);
        }
      }
    }
  }, [stepNo, savedStepData, pipeId, allPipes]);

  // Handle inputs changing dynamically
  const handleFieldChange = (key: string, value: any) => {
    setFields((prev: any) => ({
      ...prev,
      [key]: value
    }));
    isDirtyRef.current = true;
  };

  const getStep678FailureReason = (): string | null => {
    if (stepNo === 6) {
      const keys = ["sa", "sb", "sc", "sd", "se", "sf", "o2s", "o3s", "o4s", "sg", "pipeLength", "pipeThickness"];
      for (const key of keys) {
        const val = fields[key];
        const specRes = checkValueInSpec(key, val);
        if (specRes && !specRes.inSpec) {
          return `Spigot Grinder parameter "${key.toUpperCase()}" is out of specification limits (${specRes.min} - ${specRes.max}).`;
        }
      }
    }
    if (stepNo === 7) {
      const keys = ["o2b", "ba", "bb", "bc", "bd", "be", "bf", "bg"];
      for (const key of keys) {
        const val = fields[key];
        const specRes = checkValueInSpec(key, val);
        if (specRes && !specRes.inSpec) {
          return `Bell Grinder parameter "${key.toUpperCase()}" is out of specification limits (${specRes.min} - ${specRes.max}).`;
        }
      }
    }
    if (stepNo === 8) {
      const val = fields["pipeWeight"];
      const specRes = checkValueInSpec("pipeWeight", val);
      if (specRes && !specRes.inSpec) {
        return `Final clearance parameter "Pipe Weight" is out of specification limits (${specRes.min} - ${specRes.max}).`;
      }
      
      // Check previous steps (6 & 7) from the saved pipe record in memory
      const currentPipe = allPipes?.find(p => p.pipeId === pipeId);
      if (currentPipe) {
        // Checking Step 6 in saved pipe record
        const step6 = currentPipe.steps[6];
        if (step6 && step6.fields) {
          const keys6 = ["sa", "sb", "sc", "sd", "se", "sf", "o2s", "o3s", "o4s", "sg", "pipeLength", "pipeThickness"];
          for (const key of keys6) {
            const v = step6.fields[key];
            const specRes = checkValueInSpec(key, v);
            if (specRes && !specRes.inSpec) {
              return `Cannot pass: Previous Spigot Grinder parameter "${key.toUpperCase()}" was recorded out of specification limits (${specRes.min} - ${specRes.max}).`;
            }
          }
        }
        // Checking Step 7 in saved pipe record
        const step7 = currentPipe.steps[7];
        if (step7 && step7.fields) {
          const keys7 = ["o2b", "ba", "bb", "bc", "bd", "be", "bf", "bg"];
          for (const key of keys7) {
            const v = step7.fields[key];
            const specRes = checkValueInSpec(key, v);
            if (specRes && !specRes.inSpec) {
              return `Cannot pass: Previous Bell Grinder parameter "${key.toUpperCase()}" was recorded out of specification limits (${specRes.min} - ${specRes.max}).`;
            }
          }
        }
      }
    }
    return null;
  };

  const handleQCStatusChange = (id: string, status: "Pass" | "Fail") => {
    const targetQc = qualityChecks.find(qc => qc.id === id);
    if (status === "Pass" && targetQc) {
      const isRestricted67 = (stepNo === 6 || stepNo === 7) && targetQc.label === "Dimensional check passed";
      const isRestricted8 = (stepNo === 8) && targetQc.label === "Ready for dispatch";
      if (isRestricted67 || isRestricted8) {
        const failureReason = getStep678FailureReason();
        if (failureReason) {
          alert(`Cannot pass this quality check!\n\n${failureReason}`);
          return;
        }
      }
    }
    setQualityChecks((prev) =>
      prev.map((qc) => (qc.id === id ? { ...qc, status } : qc))
    );
    isDirtyRef.current = true;
  };

  // Automatically enforce quality checks based on specifications in Steps 6, 7 and 8
  useEffect(() => {
    const failureReason = getStep678FailureReason();
    if (failureReason) {
      const targetLabel = (stepNo === 6 || stepNo === 7)
        ? "Dimensional check passed"
        : stepNo === 8
        ? "Ready for dispatch"
        : null;

      if (targetLabel) {
        setQualityChecks((prev) => {
          let holdsChange = false;
          const updated = prev.map((qc) => {
            if (qc.label === targetLabel && qc.status !== "Fail") {
              holdsChange = true;
              return { ...qc, status: "Fail" as const };
            }
            return qc;
          });
          if (holdsChange) {
            isDirtyRef.current = true;
            return updated;
          }
          return prev;
        });
      }
    }
  }, [fields, stepNo, tolerances, allPipes, pipeId]);

  // Helper to check if any step (1 to 8) has a failed quality observation
  const checkPipeHasFailedQualityObservation = (): { hasFail: boolean; failedSteps: number[] } => {
    const currentPipe = allPipes?.find((p) => p.pipeId === pipeId);
    const failedStepsSet = new Set<number>();

    for (let s = 1; s <= 8; s++) {
      if (s === stepNo) {
        // Current step state in StepDetail
        const isCurrNonConform = !!isNonConform;
        const currQcFail = qualityChecks.some((qc) => qc.status === "Fail");
        if (isCurrNonConform || currQcFail) {
          failedStepsSet.add(s);
        }
      } else {
        // Saved step state from pipe record
        const stepData = currentPipe?.steps?.[s] || (currentPipe?.steps as any)?.[String(s)];
        if (stepData) {
          const isStepNonConform = !!stepData.isNonConform;
          const stepQcFail = stepData.qualityChecks?.some((qc) => qc.status === "Fail");
          if (isStepNonConform || stepQcFail) {
            failedStepsSet.add(s);
          }
        }
      }
    }

    const failedSteps = Array.from(failedStepsSet).sort((a, b) => a - b);
    return { hasFail: failedSteps.length > 0, failedSteps };
  };

  const { hasFail: hasFailedQualityObservation, failedSteps } = checkPipeHasFailedQualityObservation();

  // Enforce automatic destination locking to "PRODUCT ON HOLD - DP-REWORK" when failed quality observations exist
  useEffect(() => {
    if (stepNo === 8) {
      if (hasFailedQualityObservation) {
        if (fields.pipeDestination !== "PRODUCT ON HOLD - DP-REWORK") {
          handleFieldChange("pipeDestination", "PRODUCT ON HOLD - DP-REWORK");
        }
      }
    }
  }, [stepNo, isNonConform, qualityChecks, allPipes, pipeId, hasFailedQualityObservation, fields.pipeDestination]);

  // Pre-load default fields when starting fresh
  const getDefaultFieldsForStep = (step: number) => {
    switch (step) {
      case 1:
        return { moldSerial: "", moldCondition: "Excellent" };
      case 2:
        return { resinType: "Epoxy", resinBatch: "", cGlassType: "", cGlassBatch: "", wovenType: "", wovenBatch: "" };
      case 3:
        return { resinType: "Epoxy", resinBatch: "", layersCount: 16, windingAngle: 54.7, hoopType: "", hoopBatch: "" };
      case 4: {
        const activeTol = getActiveTolerance();
        const adminBarcolMinVal = activeTol?.barcolMinReq?.min ?? (typeof activeTol?.barcolMinReq === "number" ? activeTol?.barcolMinReq : "40");
        const barcolMinStr = `${adminBarcolMinVal} HBa`;
        return { cureTemp: "140°C", cureTime: "120 mins", testBlock: "Not applicable", tgValue: "", barcolTest: "Not applicable", barcolValue: "", barcolMinReq: barcolMinStr, barcolResult: "Pass - Compliant (Fully Cured)", barcolDeviceSerial: "", barcolReadings: "" };
      }
      case 5:
        return {};
      case 6:
        return { 
          sa: 15.0, 
          sb: 15.0, 
          sc: 15.0, 
          sd: 120.0, 
          se: 120.0, 
          sf: 10.0, 
          o2s: 118.5, 
          o3s: 119.0, 
          o4s: 119.5, 
          sg: 8.5,
          pipeLength: pipeHeader?.length || 12000.0,
          pipeThickness: 15.0
        };
      case 7:
        return { o2b: 119.0, ba: 119.5, bb: 120.0, bc: 120.0, bd: 120.0, be: 30.0, bf: 15.0, bg: 10.0 };
      case 8: {
        const { hasFail } = checkPipeHasFailedQualityObservation();
        return { 
          inspectorName: "",
          hydrostaticTest: "not_applicable",
          hydrostaticTime: "",
          hydrostaticStatus: "TC",
          vernierCaliperSerial: "",
          crcometerSerial: "",
          pipeWeight: undefined,
          pipeDestination: hasFail ? "PRODUCT ON HOLD - DP-REWORK" : "PRODUCT CONFORM - DP-COMMERCIAL"
        };
      }
      default:
        return {};
    }
  };

  const executeSave = async () => {
    await onSaveStep(stepNo, {
      fields,
      qualityChecks,
      additionalObs,
      image,
      isNonConform,
      ncrReason
    });
    isDirtyRef.current = false;
    setShowNotification(true);
    setTimeout(() => {
      setShowNotification(false);
    }, 2500);
  };

  // Helper renderers for process forms
  const renderFieldsForm = () => {
    switch (stepNo) {
      case 1:
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Mold Serial Number</label>
              <input
                type="text"
                required
                placeholder="e.g. MOLD-889"
                value={fields.moldSerial || ""}
                onChange={(e) => handleFieldChange("moldSerial", e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 focus:border-blue-500 focus:bg-white rounded-xl text-sm p-2.5 focus:outline-none transition"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Mold Condition</label>
              <select
                value={fields.moldCondition || "Excellent"}
                onChange={(e) => handleFieldChange("moldCondition", e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 focus:border-blue-500 focus:bg-white rounded-xl text-sm p-2.5 focus:outline-none transition cursor-pointer"
              >
                <option value="Excellent">Excellent (No marks, clean)</option>
                <option value="Good">Good (Minor wear)</option>
                <option value="Fair">Fair (Scratching, usable)</option>
                <option value="Requires Maintenance">Requires Maintenance / Check-up</option>
              </select>
            </div>
          </div>
        );
      case 2:
        return (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Resin Type</label>
              <input
                type="text"
                placeholder="e.g. Epoxy Resin E-44"
                value={fields.resinType || ""}
                onChange={(e) => handleFieldChange("resinType", e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 focus:border-blue-500 focus:bg-white rounded-xl text-sm p-2.5 focus:outline-none transition"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Resin Batch Number</label>
              <input
                type="text"
                placeholder="e.g. RB-2026-X4"
                value={fields.resinBatch || ""}
                onChange={(e) => handleFieldChange("resinBatch", e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 focus:border-blue-500 focus:bg-white rounded-xl text-sm p-2.5 focus:outline-none transition"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">C-Glass Type</label>
              <input
                type="text"
                placeholder="e.g. Veil 30g/m²"
                value={fields.cGlassType || ""}
                onChange={(e) => handleFieldChange("cGlassType", e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 focus:border-blue-500 focus:bg-white rounded-xl text-sm p-2.5 focus:outline-none transition"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">C-Glass Batch N°</label>
              <input
                type="text"
                placeholder="e.g. CGB-401"
                value={fields.cGlassBatch || ""}
                onChange={(e) => handleFieldChange("cGlassBatch", e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 focus:border-blue-500 focus:bg-white rounded-xl text-sm p-2.5 focus:outline-none transition"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Woven Type</label>
              <input
                type="text"
                placeholder="e.g. WR-600g"
                value={fields.wovenType || ""}
                onChange={(e) => handleFieldChange("wovenType", e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 focus:border-blue-500 focus:bg-white rounded-xl text-sm p-2.5 focus:outline-none transition"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Woven Batch N°</label>
              <input
                type="text"
                placeholder="e.g. WRB-11"
                value={fields.wovenBatch || ""}
                onChange={(e) => handleFieldChange("wovenBatch", e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 focus:border-blue-500 focus:bg-white rounded-xl text-sm p-2.5 focus:outline-none transition"
              />
            </div>
          </div>
        );
      case 3:
        return (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Resin Type</label>
              <input
                type="text"
                value={fields.resinType || ""}
                onChange={(e) => handleFieldChange("resinType", e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 focus:border-blue-500 focus:bg-white rounded-xl text-sm p-2.5 focus:outline-none transition"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Resin Batch Number</label>
              <input
                type="text"
                value={fields.resinBatch || ""}
                onChange={(e) => handleFieldChange("resinBatch", e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 focus:border-blue-500 focus:bg-white rounded-xl text-sm p-2.5 focus:outline-none transition"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Number of Layers</label>
              <input
                type="number"
                value={fields.layersCount || ""}
                onChange={(e) => handleFieldChange("layersCount", Number(e.target.value))}
                className="w-full bg-gray-50 border border-gray-200 focus:border-blue-500 focus:bg-white rounded-xl text-sm p-2.5 focus:outline-none transition"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Winding Angle (°)</label>
              <input
                type="number"
                step="0.1"
                value={fields.windingAngle || ""}
                onChange={(e) => handleFieldChange("windingAngle", Number(e.target.value))}
                className="w-full bg-gray-50 border border-gray-200 focus:border-blue-500 focus:bg-white rounded-xl text-sm p-2.5 focus:outline-none transition font-sans"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Hoop Type</label>
              <input
                type="text"
                placeholder="e.g. Continuous filament"
                value={fields.hoopType || ""}
                onChange={(e) => handleFieldChange("hoopType", e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 focus:border-blue-500 focus:bg-white rounded-xl text-sm p-2.5 focus:outline-none transition"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Hoop Batch Number</label>
              <input
                type="text"
                placeholder="e.g. HFB-998"
                value={fields.hoopBatch || ""}
                onChange={(e) => handleFieldChange("hoopBatch", e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 focus:border-blue-500 focus:bg-white rounded-xl text-sm p-2.5 focus:outline-none transition font-sans"
              />
            </div>
          </div>
        );
      case 4: {
        const isBarcolApplicable = fields.barcolTest === "Applicable";
        const activeTolS4 = getActiveTolerance();
        const adminBarcolMinVal = activeTolS4?.barcolMinReq?.min ?? (typeof activeTolS4?.barcolMinReq === "number" ? activeTolS4?.barcolMinReq : "40");
        const adminBarcolMinStr = String(adminBarcolMinVal !== "ND" && adminBarcolMinVal !== undefined && adminBarcolMinVal !== null ? adminBarcolMinVal : "40");
        const minReqBarcol = parseFloat(fields.barcolMinReq || adminBarcolMinStr) || parseFloat(adminBarcolMinStr) || 40;
        const numericBarcol = parseFloat(fields.barcolValue || "");
        const isBarcolLow = !isNaN(numericBarcol) && numericBarcol < minReqBarcol;
        const isBarcolPass = !isNaN(numericBarcol) && numericBarcol >= minReqBarcol;

        return (
          <div className="space-y-5">
            {/* Main Cure Parameters */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Cure Temperature (°C)</label>
                <input
                  type="text"
                  placeholder="e.g. 140°C"
                  value={fields.cureTemp || ""}
                  onChange={(e) => handleFieldChange("cureTemp", e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 focus:border-blue-500 focus:bg-white rounded-xl text-sm p-2.5 focus:outline-none transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Cure Time (mins)</label>
                <input
                  type="text"
                  placeholder="e.g. 120 mins"
                  value={fields.cureTime || ""}
                  onChange={(e) => handleFieldChange("cureTime", e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 focus:border-blue-500 focus:bg-white rounded-xl text-sm p-2.5 focus:outline-none transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Degree of Cure Test Block</label>
                <select
                  value={fields.testBlock || "Not applicable"}
                  onChange={(e) => handleFieldChange("testBlock", e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 focus:border-blue-500 focus:bg-white rounded-xl text-sm p-2.5 focus:outline-none transition cursor-pointer font-medium text-gray-800"
                >
                  <option value="Applicable">Applicable</option>
                  <option value="Not applicable">Not applicable</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Barcol Hardness Test
                </label>
                <select
                  value={fields.barcolTest || "Not applicable"}
                  onChange={(e) => handleFieldChange("barcolTest", e.target.value)}
                  className={`w-full border rounded-xl text-sm p-2.5 focus:outline-none transition cursor-pointer font-bold ${
                    isBarcolApplicable 
                      ? "bg-emerald-50 border-emerald-300 text-emerald-900 focus:border-emerald-500" 
                      : "bg-gray-50 border-gray-200 text-gray-700 focus:border-blue-500"
                  }`}
                >
                  <option value="Not applicable">Not applicable</option>
                  <option value="Applicable">Applicable</option>
                </select>
              </div>
            </div>

            {/* Test Block Tg Value field if Applicable */}
            {fields.testBlock === "Applicable" && (
              <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl space-y-1.5">
                <label className="block text-xs font-bold text-slate-800">
                  Degree of Cure - Tg Value (°C)
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Glass Transition Temp: 115°C"
                  value={(fields as any).tgValue || ""}
                  onChange={(e) => handleFieldChange("tgValue", e.target.value)}
                  className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-lg text-sm p-2.5 focus:outline-none transition font-sans placeholder-gray-400"
                />
              </div>
            )}

            {/* Barcol Hardness Test Result Section (If Applicable) */}
            {isBarcolApplicable && (
              <div className="bg-emerald-50/60 border border-emerald-200/80 p-4 rounded-xl space-y-4 shadow-2xs">
                <div className="flex items-center justify-between border-b border-emerald-200/60 pb-2.5">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
                    <div>
                      <h4 className="text-xs font-bold text-emerald-950 uppercase tracking-wide">
                        Barcol Hardness Test Protocol & Result (ASTM D2583 / BS 2782)
                      </h4>
                      <p className="text-[11px] text-emerald-800 font-medium">
                        Enter impressor readings, device serial number, and evaluate cure status.
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300 px-2.5 py-1 rounded-full uppercase tracking-wider">
                    ASTM D2583
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-emerald-950 mb-1">
                      Barcol Hardness Result (HBa)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 42 HBa"
                      value={fields.barcolValue || ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        handleFieldChange("barcolValue", val);
                        handleFieldChange("testResult", val);
                      }}
                      className="w-full bg-white border border-emerald-300 focus:border-emerald-600 rounded-lg text-sm p-2.5 font-bold text-gray-900 focus:outline-none transition"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-emerald-950 mb-1 flex items-center justify-between">
                      <span>Min Requirement (HBa)</span>
                      <span className="text-[9px] font-extrabold text-amber-800 bg-amber-100 border border-amber-300 px-1.5 py-0.5 rounded flex items-center gap-1" title="Determined by Admin in Project Specification">
                        <ShieldCheck className="w-3 h-3 text-amber-600" />
                        Admin Spec
                      </span>
                    </label>
                    <input
                      type="text"
                      readOnly
                      value={`${minReqBarcol} HBa`}
                      className="w-full bg-amber-50/80 border border-amber-300 rounded-lg text-sm p-2.5 font-extrabold text-amber-950 focus:outline-none cursor-not-allowed shadow-2xs"
                      title="Min Requirement (HBa) is determined by Admin in Specification settings"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-emerald-950 mb-1">
                      Evaluation Status
                    </label>
                    <select
                      value={fields.barcolResult || "Pass - Compliant (Fully Cured)"}
                      onChange={(e) => handleFieldChange("barcolResult", e.target.value)}
                      className="w-full bg-white border border-emerald-300 focus:border-emerald-600 rounded-lg text-sm p-2.5 font-bold text-gray-900 focus:outline-none transition cursor-pointer"
                    >
                      <option value="Pass - Compliant (Fully Cured)">Pass - Compliant (Fully Cured)</option>
                      <option value="Fail - Non-Conform (Under-Cured)">Fail - Non-Conform (Under-Cured)</option>
                      <option value="Conditional - Re-bake Required">Conditional - Re-bake Required</option>
                      <option value="Under Review">Under Review</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-emerald-950 mb-1">
                      Impressor Device Serial N°
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. IMPRESSOR-BAR-902"
                      value={fields.barcolDeviceSerial || ""}
                      onChange={(e) => handleFieldChange("barcolDeviceSerial", e.target.value)}
                      className="w-full bg-white border border-emerald-300 focus:border-emerald-600 rounded-lg text-sm p-2.5 text-gray-800 focus:outline-none transition"
                    />
                  </div>
                </div>

                {/* Individual Readings / Test Notes */}
                <div>
                  <label className="block text-xs font-semibold text-emerald-950 mb-1">
                    Individual Impressor Readings & Test Notes
                  </label>
                  <textarea
                    rows={2}
                    placeholder="e.g. Readings: 41, 43, 42, 44, 42. Average Barcol Hardness: 42.4 HBa (Passes minimum requirement)."
                    value={fields.barcolReadings || ""}
                    onChange={(e) => handleFieldChange("barcolReadings", e.target.value)}
                    className="w-full bg-white border border-emerald-300 focus:border-emerald-600 rounded-lg text-sm p-2.5 focus:outline-none transition font-sans text-gray-800 placeholder-emerald-700/50"
                  />
                </div>

                {/* Auto Warning / Confirmation Box */}
                {isBarcolLow && (
                  <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs p-2.5 rounded-lg flex items-center gap-2 font-medium">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>Warning: Measured hardness ({numericBarcol} HBa) is below the required minimum ({minReqBarcol} HBa). Inspect resin cross-linking or re-bake pipe.</span>
                  </div>
                )}
                {isBarcolPass && (
                  <div className="bg-emerald-100/80 border border-emerald-300 text-emerald-900 text-xs p-2.5 rounded-lg flex items-center gap-2 font-medium">
                    <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                    <span>Passed: Measured hardness ({numericBarcol} HBa) meets or exceeds minimum requirement ({minReqBarcol} HBa).</span>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      }
      case 5:
        return (
          <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl text-stone-600 text-xs">
            💡 This process step does not require manual parameter inputs. Please assess the product using the mandated quality checklists below.
          </div>
        );
      case 6:
        // Spigot Grinder: Dimensional check grid (mm) SA, SB, SC, SD, SE, SF, Ø2S, Ø3S, Ø4S, SG
        return (
          <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100">
            <h4 className="text-xs font-bold text-blue-900 mb-3 uppercase tracking-wider flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Grid3X3 className="w-4 h-4 text-blue-600" />
                Spigot Dimensional Calibration Matrix (mm)
              </span>
              {getActiveTolerance() && (
                <span className="text-[10px] text-blue-700 bg-blue-100/70 border border-blue-200 px-2 py-0.5 rounded-md font-semibold">
                  Limits: {getActiveTolerance().project}
                </span>
              )}
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 gap-3">
              {[
                { label: "Ø2S (Dia)", key: "o2s" },
                { label: "Ø3S (Dia)", key: "o3s" },
                { label: "Ø4S (Dia)", key: "o4s" },
                { label: "SA (Len)", key: "sa" },
                { label: "SB (Len)", key: "sb" },
                { label: "SC (Len)", key: "sc" },
                { label: "SD (Len)", key: "sd" },
                { label: "SE (Len)", key: "se" },
                { label: "SF (Len)", key: "sf" },
                { label: "SG (Len)", key: "sg" }
              ].map((dim) => {
                const val = fields[dim.key];
                const specRes = checkValueInSpec(dim.key, val);
                const range = getFieldSpecRange(dim.key);
                const isErr = specRes && !specRes.inSpec;

                return (
                  <div 
                    key={dim.key} 
                    className={`bg-white p-2.5 rounded-lg border text-center shadow-xs transition-colors ${
                      isErr ? "border-red-400 bg-red-50/30" : "border-gray-200"
                    }`}
                  >
                    <span className="block text-[11px] font-extrabold text-gray-500 tracking-tight lowercase mb-1 bg-gray-100 rounded py-0.5 uppercase">
                      {dim.label}
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      value={val !== undefined && val !== null ? val : ""}
                      onChange={(e) => handleFieldChange(dim.key, e.target.value === "" ? "" : Number(e.target.value))}
                      className="w-full text-center text-sm font-bold text-gray-800 bg-transparent border-b border-gray-200 focus:border-blue-500 focus:outline-none py-1 px-0.5"
                    />
                    {range && (
                      <span className={`block text-[9px] mt-1 font-semibold leading-tight ${
                        isErr 
                          ? "text-red-700 font-extrabold" 
                          : specRes 
                            ? "text-emerald-700 font-extrabold" 
                            : "text-gray-400"
                      }`}>
                        {isErr ? "⚠️ " : ""}
                        {formatRangeText(range)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* General Pipe Dimensions */}
            <div className="mt-4 pt-4 border-t border-blue-100/60 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-blue-900 uppercase tracking-wide mb-1 px-1 flex justify-between items-center">
                  <span>Pipe Length (mm)</span>
                  {getFieldSpecRange("pipeLength") && (
                    <span className={`text-[10px] font-semibold ${
                      checkValueInSpec("pipeLength", fields.pipeLength) && !checkValueInSpec("pipeLength", fields.pipeLength)!.inSpec
                        ? "text-red-600 font-extrabold"
                        : "text-blue-700/80"
                    }`}>
                      Spec limit: {formatRangeText(getFieldSpecRange("pipeLength"))} mm
                    </span>
                  )}
                </label>
                <div className="relative rounded-lg shadow-sm">
                  <input
                    id="spigot-pipe-length"
                    type="number"
                    step="1"
                    placeholder="e.g. 12000"
                    value={fields.pipeLength !== undefined && fields.pipeLength !== null ? fields.pipeLength : ""}
                    onChange={(e) => handleFieldChange("pipeLength", e.target.value === "" ? "" : Number(e.target.value))}
                    className={`block w-full rounded-lg border bg-white px-3 py-2 text-sm font-semibold text-gray-800 focus:outline-none focus:border-blue-500 ${
                      checkValueInSpec("pipeLength", fields.pipeLength) && !checkValueInSpec("pipeLength", fields.pipeLength)!.inSpec
                        ? "border-red-400 bg-red-50/20"
                        : "border-gray-200"
                    }`}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-blue-900 uppercase tracking-wide mb-1 px-1 flex justify-between items-center">
                  <span>Pipe Thickness (mm)</span>
                  {getFieldSpecRange("pipeThickness") && (
                    <span className={`text-[10px] font-semibold ${
                      checkValueInSpec("pipeThickness", fields.pipeThickness) && !checkValueInSpec("pipeThickness", fields.pipeThickness)!.inSpec
                        ? "text-red-600 font-extrabold"
                        : "text-blue-700/80"
                    }`}>
                      Spec limit: {formatRangeText(getFieldSpecRange("pipeThickness"))} mm
                    </span>
                  )}
                </label>
                <div className="relative rounded-lg shadow-sm">
                  <input
                    id="spigot-pipe-thickness"
                    type="number"
                    step="0.1"
                    placeholder="e.g. 15.0"
                    value={fields.pipeThickness !== undefined && fields.pipeThickness !== null ? fields.pipeThickness : ""}
                    onChange={(e) => handleFieldChange("pipeThickness", e.target.value === "" ? "" : Number(e.target.value))}
                    className={`block w-full rounded-lg border bg-white px-3 py-2 text-sm font-semibold text-gray-800 focus:outline-none focus:border-blue-500 ${
                      checkValueInSpec("pipeThickness", fields.pipeThickness) && !checkValueInSpec("pipeThickness", fields.pipeThickness)!.inSpec
                        ? "border-red-400 bg-red-50/20"
                        : "border-gray-200"
                    }`}
                  />
                </div>
              </div>
            </div>
          </div>
        );
      case 7:
        // Bell Grinder: Dimensional check grid (mm) BC, BD, BE, BF, BG
        return (
          <div className="bg-purple-50/50 p-4 rounded-xl border border-purple-100">
            <h4 className="text-xs font-bold text-purple-900 mb-3 uppercase tracking-wider flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Grid3X3 className="w-4 h-4 text-purple-600" />
                Bell Dimensional Calibration Matrix (mm)
              </span>
              {getActiveTolerance() && (
                <span className="text-[10px] text-purple-700 bg-purple-100/70 border border-purple-200 px-2 py-0.5 rounded-md font-semibold">
                  Limits: {getActiveTolerance().project}
                </span>
              )}
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
              {[
                { label: "Ø2B (Depth)", key: "o2b" },
                { label: "BA (Len)", key: "ba" },
                { label: "BB (Len)", key: "bb" },
                { label: "BC (Len)", key: "bc" },
                { label: "BD (Len)", key: "bd" },
                { label: "BE (Len)", key: "be" },
                { label: "BF (Len)", key: "bf" },
                { label: "BG (Len)", key: "bg" }
              ].map((dim) => {
                const val = fields[dim.key];
                const specRes = checkValueInSpec(dim.key, val);
                const range = getFieldSpecRange(dim.key);
                const isErr = specRes && !specRes.inSpec;

                return (
                  <div 
                    key={dim.key} 
                    className={`bg-white p-2.5 rounded-lg border text-center shadow-xs transition-colors ${
                      isErr ? "border-red-400 bg-red-50/30" : "border-gray-200"
                    }`}
                  >
                    <span className="block text-[11px] font-extrabold text-gray-500 tracking-tight lowercase mb-1 bg-gray-100 rounded py-0.5 uppercase">
                      {dim.label}
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      value={val !== undefined && val !== null ? val : ""}
                      onChange={(e) => handleFieldChange(dim.key, e.target.value === "" ? "" : Number(e.target.value))}
                      className="w-full text-center text-sm font-bold text-gray-800 bg-transparent border-b border-gray-200 focus:border-blue-500 focus:outline-none py-1 px-0.5"
                    />
                    {range && (
                      <span className={`block text-[9px] mt-1 font-semibold leading-tight ${
                        isErr 
                          ? "text-red-700 font-extrabold" 
                          : specRes 
                            ? "text-emerald-700 font-extrabold" 
                            : "text-gray-400"
                      }`}>
                        {isErr ? "⚠️ " : ""}
                        {formatRangeText(range)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      case 8:
        const hasHydrotest = (fields as any).hydrostaticTest === "applicable";
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Final Quality Inspector Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Eng. Jean Dupont"
                  value={fields.inspectorName || ""}
                  onChange={(e) => handleFieldChange("inspectorName", e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 focus:border-blue-500 focus:bg-white rounded-xl text-sm p-2.5 focus:outline-none transition"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Vernier Caliper Serial N°</label>
                <input
                  type="text"
                  placeholder="e.g. VC-2024-889"
                  value={(fields as any).vernierCaliperSerial || ""}
                  onChange={(e) => handleFieldChange("vernierCaliperSerial", e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 focus:border-blue-500 focus:bg-white rounded-xl text-sm p-2.5 focus:outline-none transition"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Crcometer Serial N°</label>
                <input
                  type="text"
                  placeholder="e.g. CR-101-X"
                  value={(fields as any).crcometerSerial || ""}
                  onChange={(e) => handleFieldChange("crcometerSerial", e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 focus:border-blue-500 focus:bg-white rounded-xl text-sm p-2.5 focus:outline-none transition"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1 flex justify-between items-center">
                  <span>Pipe Weight (kg)</span>
                  {getFieldSpecRange("pipeWeight") && (
                    <span className={`text-[10px] font-semibold ${
                      checkValueInSpec("pipeWeight", fields.pipeWeight) && !checkValueInSpec("pipeWeight", fields.pipeWeight)!.inSpec
                        ? "text-red-600 font-extrabold"
                        : "text-emerald-750/80"
                    }`}>
                      Spec limit: {formatRangeText(getFieldSpecRange("pipeWeight"))} kg
                    </span>
                  )}
                </label>
                <input
                  type="number"
                  step="0.1"
                  placeholder="e.g. 1250.5"
                  value={fields.pipeWeight !== undefined && fields.pipeWeight !== null ? fields.pipeWeight : ""}
                  onChange={(e) => handleFieldChange("pipeWeight", e.target.value === "" ? "" : Number(e.target.value))}
                  className={`w-full bg-gray-50 border focus:border-blue-500 focus:bg-white rounded-xl text-sm p-2.5 focus:outline-none transition font-semibold text-gray-800 ${
                    checkValueInSpec("pipeWeight", fields.pipeWeight) && !checkValueInSpec("pipeWeight", fields.pipeWeight)!.inSpec
                      ? "border-red-400 bg-red-50/20"
                      : "border-gray-200"
                  }`}
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-gray-700 mb-1 flex items-center justify-between uppercase tracking-wide">
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${hasFailedQualityObservation ? "bg-amber-500 animate-pulse" : "bg-blue-600"}`}></span>
                    Pipe Destination Selection <span className="text-red-500">*</span>
                  </div>
                  {hasFailedQualityObservation && (
                    <span className="text-[9px] font-extrabold text-amber-900 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-md uppercase tracking-wider flex items-center gap-1 shadow-2xs">
                      <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                      Auto-Locked On Hold
                    </span>
                  )}
                </label>
                <select
                  id="select-pipe-destination"
                  disabled={hasFailedQualityObservation}
                  value={hasFailedQualityObservation ? "PRODUCT ON HOLD - DP-REWORK" : (fields.pipeDestination || "PRODUCT CONFORM - DP-COMMERCIAL")}
                  onChange={(e) => handleFieldChange("pipeDestination", e.target.value)}
                  className={`w-full border rounded-xl text-sm p-2.5 focus:outline-none transition font-extrabold ${
                    hasFailedQualityObservation
                      ? "bg-amber-50/90 border-amber-300 text-amber-950 cursor-not-allowed shadow-2xs"
                      : "bg-blue-50/10 border-gray-200 focus:border-blue-500 focus:bg-white text-blue-900"
                  }`}
                >
                  <option value="PRODUCT CONFORM - DP-COMMERCIAL">PRODUCT CONFORM - DP-COMMERCIAL</option>
                  <option value="PRODUCT CONFORM - RPS-COMMERCIAL">PRODUCT CONFORM - RPS-COMMERCIAL</option>
                  <option value="PRODUCT ON HOLD - DP-REWORK">PRODUCT ON HOLD - DP-REWORK</option>
                  <option value="PRODUCT NON-CONFORM - RPS-COMMERCIAL">PRODUCT NON-CONFORM - RPS-COMMERCIAL</option>
                  <option value="PRODUCT NON-CONFORM - REJECTED">PRODUCT NON-CONFORM - REJECTED</option>
                </select>

                {hasFailedQualityObservation && (
                  <div className="mt-2.5 p-3 bg-amber-50/90 border border-amber-300 rounded-xl text-xs text-amber-950 font-medium flex items-start gap-2.5 animate-fade-in shadow-2xs">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <div className="font-extrabold uppercase text-[10px] tracking-wide text-amber-950 flex items-center gap-1.5">
                        Automatic Storage Assignment: PRODUCT ON HOLD - DP-REWORK
                      </div>
                      <p className="text-[11px] text-amber-900 leading-relaxed">
                        This pipe contains unresolved failed quality observation(s) in <strong>Step(s) {failedSteps.join(", ")}</strong>. 
                        It has been automatically directed to <span className="font-black underline bg-amber-200/80 px-1 py-0.5 rounded text-amber-950">PRODUCT ON HOLD - DP-REWORK</span> storage.
                      </p>
                      <p className="text-[10px] text-amber-800 italic pt-0.5 font-sans border-t border-amber-200/60 mt-1">
                        Lock will automatically release once all quality observations in Step(s) {failedSteps.join(", ")} are updated to "Pass".
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="border-t border-gray-100 pt-3">
              <label className="block text-xs font-semibold text-gray-700 mb-1.5 font-sans">
                Hydrostatic Test Process
              </label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 mb-1">Applicable status</label>
                  <select
                    value={(fields as any).hydrostaticTest || "not_applicable"}
                    onChange={(e) => {
                      const val = e.target.value;
                      handleFieldChange("hydrostaticTest", val);
                      if (val === "not_applicable") {
                        handleFieldChange("hydrostaticTime", "");
                        handleFieldChange("hydrostaticStatus", "");
                      } else {
                        handleFieldChange("hydrostaticStatus", "TC");
                      }
                    }}
                    className="w-full bg-white border border-gray-200 focus:border-blue-500 rounded-xl text-sm p-2 focus:outline-none transition font-medium"
                  >
                    <option value="not_applicable">Not Applicable</option>
                    <option value="applicable">Applicable</option>
                  </select>
                </div>

                {hasHydrotest && (
                  <>
                    <div className="animate-fade-in">
                      <label className="block text-[11px] font-semibold text-gray-500 mb-1">Testing Duration / Time</label>
                      <input
                        type="text"
                        placeholder="e.g. 15 mins, 30 seconds"
                        value={(fields as any).hydrostaticTime || ""}
                        onChange={(e) => handleFieldChange("hydrostaticTime", e.target.value)}
                        className="w-full bg-white border border-gray-200 focus:border-blue-500 rounded-xl text-sm p-2 focus:outline-none transition font-medium"
                      />
                    </div>
                    <div className="animate-fade-in">
                      <label className="block text-[11px] font-semibold text-gray-500 mb-1">Test Result</label>
                      <select
                        value={(fields as any).hydrostaticStatus || "TC"}
                        onChange={(e) => handleFieldChange("hydrostaticStatus", e.target.value)}
                        className="w-full bg-white border border-gray-200 focus:border-blue-500 rounded-xl text-sm p-2 focus:outline-none transition font-medium text-gray-800"
                      >
                        <option value="TC">TC</option>
                        <option value="TNC">TNC</option>
                      </select>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mt-2 transition animate-fade-in">
      
      {/* Step Header */}
      <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 mb-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <span className="text-[10px] font-bold text-blue-600 tracking-wider uppercase bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-full">
            Active Workflow Target
          </span>
          <h3 className="font-bold text-gray-800 text-lg mt-1.5 flex items-center gap-1.5 leading-tight">
            Step {stepNo} — {getStepName(stepNo)}
          </h3>
          {getStepProcedures(stepNo).length > 0 && (
            <div className="mt-2.5 flex flex-col gap-1">
              {getStepProcedures(stepNo).map((proc, idx) => (
                <div key={idx} className="text-[10px] md:text-xs text-blue-700 bg-blue-50/80 border border-blue-150 px-2.5 py-1 rounded font-mono font-semibold inline-flex items-center gap-1.5 w-fit">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                  {proc}
                </div>
              ))}
            </div>
          )}
          <div className="mt-2 text-xs font-mono space-y-1">
            <p className="text-gray-700">
              Tracking Pipe Reference: <span className="text-gray-900 font-extrabold text-sm">{pipeId}</span>
            </p>
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-gray-700 pt-1">
              <span className="bg-blue-100/80 text-blue-900 px-2 py-0.5 rounded-md font-bold border border-blue-200">Type: {pipeHeader.pipeType || "Continuous Filament Winding"}</span>
              <span className="bg-cyan-100/80 text-cyan-900 px-2 py-0.5 rounded-md font-bold border border-cyan-200">Junction: {pipeHeader.junctionType || "Bell and Spigot"}</span>
              <span className="bg-emerald-100/80 text-emerald-900 px-2 py-0.5 rounded-md font-bold border border-emerald-200">Thickness: {pipeHeader.thickness ?? "15"} mm</span>
              <span className="bg-slate-100 text-slate-800 px-2 py-0.5 rounded-md font-semibold border border-slate-200">Length: {pipeHeader.length ?? "12000"} mm</span>
              <span className="bg-slate-100 text-slate-800 px-2 py-0.5 rounded-md font-semibold border border-slate-200">DN: {pipeHeader.diameter ?? "1200"} mm</span>
              <span className="bg-slate-100 text-slate-800 px-2 py-0.5 rounded-md font-semibold border border-slate-200">PN: {pipeHeader.pressure ?? "10"} bar</span>
              <span className="bg-slate-100 text-slate-800 px-2 py-0.5 rounded-md font-semibold border border-slate-200">SN: {pipeHeader.stiffness ?? "10000"} N/m²</span>
              {(pipeHeader.settingReference || (pipeHeader as any).settingRefKey) && <span className="bg-amber-100 text-amber-900 px-2 py-0.5 rounded-md font-bold border border-amber-200">Setting Ref: {pipeHeader.settingReference || (pipeHeader as any).settingRefKey}</span>}
              {(pipeHeader.projectWorkOrder || (pipeHeader as any).workOrderCode) && <span className="bg-purple-100 text-purple-900 px-2 py-0.5 rounded-md font-bold border border-purple-200">WO: {pipeHeader.projectWorkOrder || (pipeHeader as any).workOrderCode}</span>}
              {pipeHeader.lotNo && <span className="bg-stone-100 text-stone-800 px-2 py-0.5 rounded-md font-medium border border-stone-200">Lot: {pipeHeader.lotNo}</span>}
            </div>
          </div>
        </div>

        {savedStepData && (
          <div className="bg-green-50 border border-green-200 p-2.5 rounded-xl flex items-center gap-2 text-xs text-green-800 animate-pulse">
            <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
            <div className="text-[10px]">
              <span className="font-semibold block">Step Saved Successfully</span>
              <span className="text-gray-500">by {savedStepData.savedBy} at {new Date(savedStepData.savedAt).toLocaleTimeString()}</span>
            </div>
          </div>
        )}
      </div>

      {showNotification && (
        <div className="mb-4 bg-green-600 text-white text-xs px-4 py-3 rounded-xl shadow-lg flex items-center justify-between transition-all duration-300 transform scale-100 animate-bounce">
          <span className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5" />
            <span>Success: Step {stepNo} data has been saved to the remote server Database.</span>
          </span>
        </div>
      )}

      {/* Historical prefill & copy helper controls */}
      {hasAutofilled ? (
        <div className="mb-5 bg-amber-50 border border-amber-200 p-3.5 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-amber-900 animate-fade-in shadow-2xs">
          <div className="flex items-start gap-2">
            <History className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold block text-[13px] text-amber-950">Smart History Auto-populate Active</span>
              <p className="mt-0.5 text-amber-850">
                To keep continuity across production sequences, measurements and quality checks from the previous pipe (<strong>{hasAutofilled}</strong>) were copied automatically. Feel free to tweak these fields before saving.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setFields(getDefaultFieldsForStep(stepNo));
              const labels = STEP_QUALITY_CHECKS[stepNo] || [];
              const checks = labels.map((label, idx) => ({
                id: `${stepNo}-${idx + 1}`,
                label,
                status: null as "Pass" | "Fail" | null
              }));
              setQualityChecks(checks);
              setAdditionalObs("");
              setImage(undefined);
              setIsNonConform(false);
              setNcrReason("");
              setHasAutofilled(null);
              isDirtyRef.current = false;
            }}
            className="px-3 py-1.5 text-amber-950 bg-amber-100 hover:bg-amber-200 text-[11px] font-bold rounded-lg border border-amber-300 transition-all cursor-pointer whitespace-nowrap self-end sm:self-auto shrink-0 shadow-3xs"
          >
            Reset to Default Empty
          </button>
        </div>
      ) : prevPipe && prevStepData ? (
        <div className="mb-5 bg-blue-50 border border-blue-150 p-3.5 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-blue-900 animate-fade-in shadow-2xs">
          <div className="flex items-start gap-2">
            <ClipboardCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold block text-[13px] text-blue-950">Step History Available</span>
              <p className="mt-0.5 text-blue-850">
                You can carry over step data, observations, and inspected checks from previous pipe (<strong>{prevPipe.pipeId}</strong>) with one click to keep production runs fast and consistent.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleCopyFromPrevious}
            className="px-3.5 py-2 text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-[11px] font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap self-end sm:self-auto shrink-0 shadow-2xs flex items-center gap-1.5"
          >
            <History className="w-3.5 h-3.5" />
            Apply {prevPipe.pipeId} Data
          </button>
        </div>
      ) : null}

      {/* Main Form Fields */}
      <div className="mb-6">
        <h4 className="text-xs font-bold text-gray-400 tracking-wider mb-3.5 uppercase flex items-center gap-1">
          <FileText className="w-4 h-4 text-gray-400" />
          I. Process & Material Entry Fields
        </h4>
        {renderFieldsForm()}
      </div>

      {/* Quality Checks Pass/Fail Panel */}
      <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3.5">
          <div>
            <h4 className="text-xs font-bold text-gray-700 tracking-wider uppercase flex items-center gap-1.5">
              <CheckCircle className="w-4 h-4 text-blue-600" />
              II. Mandated Quality Controls & Inspections
            </h4>
            <p className="text-[11px] text-gray-500 leading-normal mt-1">
              Evaluate physical pipe specifications and check relevant condition statuses. Select **Pass** or **Fail** for each mandated observation.
            </p>
          </div>
        </div>

        {/* Pass/Fail Remarks & Definitions Reference Box */}
        <div className="mb-4 bg-white border border-gray-150 rounded-xl p-3.5 shadow-xs grid grid-cols-1 md:grid-cols-2 gap-3.5 text-xs">
          <div className="border-l-4 border-green-500 pl-3">
            <span className="font-extrabold text-green-700 uppercase tracking-wider block mb-1">Pass Remark & Standard Definition</span>
            <p className="text-gray-600 leading-relaxed text-[11px]">
              CRITERIA CONFORMS: Meets or exceeds all physical, visual, and dimensional lamination specifications. No dry fiber spots, resin delaminations, or bubble defects present (ref: <strong>MPI-SOP-QC-13</strong>). Dimensions fall strictly within standard tolerance ranges (ref: <strong>MPI-SOP-QC-14</strong>). Approved for subsequent production phase or final dispatch.
            </p>
          </div>
          <div className="border-l-4 border-red-500 pl-3">
            <span className="font-extrabold text-red-700 uppercase tracking-wider block mb-1">Fail Remark & Standard Definition</span>
            <p className="text-gray-600 leading-relaxed text-[11px]">
              CRITERIA DEVIATES: Any visual anomalies, surface cracks, material delamination, or dry fiber zones (ref: <strong>MPI-SOP-QC-13</strong>) or geometric measurements falling outside calibrated tolerances (ref: <strong>MPI-SOP-QC-14</strong>). Requires immediate isolation, detailed failure logging, and supervisor-authorized rework or scrap.
            </p>
          </div>
        </div>

        <div className="space-y-2.5">
          {qualityChecks.map((qc) => {
            return (
              <div
                key={qc.id}
                className={`flex flex-col sm:flex-row justify-between items-start sm:items-center p-3 rounded-xl border transition ${
                  qc.status === "Pass"
                    ? "bg-green-50/50 border-green-200 text-green-900"
                    : qc.status === "Fail"
                    ? "bg-red-50/60 border-red-200 text-red-900"
                    : "bg-white border-gray-200"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2 py-0.5">
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${
                      qc.status === "Pass"
                        ? "bg-green-500"
                        : qc.status === "Fail"
                        ? "bg-red-500 animate-ping"
                        : "bg-gray-300"
                    }`}
                  />
                  <span className="text-sm font-medium">{qc.label}</span>
                </div>

                <div className="flex items-center gap-2 mt-2 sm:mt-0 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => handleQCStatusChange(qc.id, "Pass")}
                    className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer ${
                      qc.status === "Pass"
                        ? "bg-green-600 text-white border-green-600 shadow-sm"
                        : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50 active:scale-95"
                    }`}
                  >
                    <Check className="w-3.5 h-3.5" />
                    Pass
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQCStatusChange(qc.id, "Fail")}
                    className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer ${
                      qc.status === "Fail"
                        ? "bg-red-600 text-white border-red-600 shadow-sm"
                        : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50 active:scale-95"
                    }`}
                  >
                    <X className="w-3.5 h-3.5" />
                    Fail
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Non-Conformance Declaration & Reporting Card */}
      <div id="ncr-section" className="bg-red-50/55 border border-red-100 rounded-2xl p-4.5 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3.5">
          <div className="flex gap-2.5 items-start">
            <div className="p-1.5 bg-red-100 text-red-700 rounded-lg shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-extrabold text-red-950 uppercase tracking-wide leading-tight">
                IV. Non-Conformance Declaration
              </h4>
              <p className="text-[11px] text-red-800 font-sans mt-0.5 leading-relaxed">
                If the product exhibits structural deviations, thickness violations, or QA check errors, flag the item as **Non-Conforming** to log details and generate an engineering report.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto shrink-0 font-sans">
            <button
              type="button"
              id="btn-declare-conform"
              onClick={() => {
                setIsNonConform(false);
                isDirtyRef.current = true;
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                !isNonConform
                  ? "bg-emerald-600 text-white border-emerald-600 shadow-xs font-extrabold"
                  : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
              }`}
            >
              Conforming Product
            </button>
            <button
              type="button"
              id="btn-declare-nonconform"
              onClick={() => {
                setIsNonConform(true);
                isDirtyRef.current = true;
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                isNonConform
                  ? "bg-red-600 text-white border-red-700 shadow-xs font-extrabold"
                  : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
              }`}
            >
              Non-Conforming Product
            </button>
          </div>
        </div>

        {isNonConform && (
          <div className="bg-white border border-red-100 rounded-xl p-3.5 mt-2 shadow-xs transition-all duration-300">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4.5">
              <div className="md:col-span-2">
                <label className="block text-[11px] font-bold text-red-950 uppercase tracking-wide mb-1">
                  Defect Description & Non-Conformance (NCR) Details <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={3}
                  value={ncrReason}
                  onChange={(e) => {
                    setNcrReason(e.target.value);
                    isDirtyRef.current = true;
                  }}
                  placeholder="Specify precisely why this step is classified as non-conforming (e.g. Spigot Grinder Ø2S diameter outer limit exceeded, or severe air bubbles identified in structural liner)..."
                  className="w-full bg-red-50/20 border border-red-100 focus:border-red-500 focus:bg-white rounded-lg text-xs p-3 focus:outline-none transition leading-relaxed placeholder-gray-400 font-sans"
                />
              </div>

              <div className="flex flex-col justify-between items-stretch bg-red-50/30 border border-red-100 rounded-xl p-3 font-sans shadow-xs relative overflow-hidden">
                {/* Decorative background visual cue */}
                <div className="absolute top-0 right-0 w-16 h-16 bg-red-100/30 rounded-full blur-xl pointer-events-none" />
                
                <div className="mb-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[9px] font-extrabold bg-red-100 text-red-800 px-1.5 py-0.5 rounded uppercase tracking-wider">
                      CAPA Audit System
                    </span>
                    <span className="text-[9px] text-gray-400 font-mono">
                      Ref: MPI-FO-QA-20
                    </span>
                  </div>
                  <h4 className="text-[11px] font-bold text-gray-900 leading-tight">
                    Maghreb Pipe Quality Export
                  </h4>
                </div>

                <div className="space-y-1.5">
                  <button
                    type="button"
                    id="btn-generate-ncr-pdf"
                    onClick={() => {
                      // Create minimal or full PipeRecord object
                      const existingPipe = allPipes?.find((p) => p.pipeId === pipeId);
                      const pipeRecordBuild: PipeRecord = existingPipe || {
                        pipeId,
                        header: pipeHeader,
                        operatorId: "unknown",
                        operatorUsername: savedStepData?.savedBy || "Operator",
                        createdAt: new Date().toISOString(),
                        lastUpdatedAt: new Date().toISOString(),
                        steps: {
                          [stepNo]: {
                            stepNo,
                            isCompleted: true,
                            savedBy: savedStepData?.savedBy || "Operator",
                            savedAt: savedStepData?.savedAt || new Date().toISOString(),
                            fields,
                            qualityChecks,
                            additionalObs,
                            image,
                            isNonConform,
                            ncrReason
                          }
                        }
                      };
                      
                      exportStepNCRToPDF(pipeRecordBuild, stepNo, ncrReason);
                    }}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-lg text-[11px] font-extrabold tracking-wider text-white uppercase bg-gradient-to-r from-red-600 to-red-750 hover:from-red-700 hover:to-red-850 shadow-md shadow-red-500/15 hover:shadow-lg hover:shadow-red-500/25 active:scale-98 active:translate-y-0 -translate-y-0.5 transition-all duration-300 cursor-pointer"
                  >
                    <FileText className="w-4 h-4 shrink-0 transition-transform group-hover:scale-110" />
                    Generate NCR Report (PDF)
                  </button>
                  <p className="text-[9px] text-gray-500 text-center leading-normal">
                    Generates the official structured non-conformance artifact following strict corporate QA/QC frameworks.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Observations and Camera Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">
            III. Additional Observation Comments
          </label>
          <textarea
            rows={5}
            placeholder="Type optional custom comments, warning logs, repairs made, or structural context here..."
            value={additionalObs}
            onChange={(e) => {
              setAdditionalObs(e.target.value);
              isDirtyRef.current = true;
            }}
            className="w-full bg-gray-50 border border-gray-200 focus:border-blue-500 focus:bg-white rounded-xl text-sm p-3.5 focus:outline-none transition leading-relaxed placeholder-gray-400 font-sans"
          />
        </div>

        <div>
          <CameraCapture
            currentImage={image}
            onImageCaptured={(base64) => {
              setImage(base64);
              isDirtyRef.current = true;
            }}
            onClear={() => {
              setImage(undefined);
              isDirtyRef.current = true;
            }}
          />
        </div>
      </div>

      {/* Modification Audit History Log */}
      {savedStepData?.modifications && savedStepData.modifications.length > 0 && (
        <div id="step-modification-audit-log" className="mb-6 bg-slate-50 border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3 text-xs font-bold text-slate-700 uppercase tracking-wider">
            <History className="w-4 h-4 text-slate-500" />
            <span>Step Modification Audit History ({savedStepData.modifications.length}/2 Changes used)</span>
          </div>
          <div className="space-y-3">
            {savedStepData.modifications.map((mod: any, index: number) => (
              <div key={index} className="bg-white border border-slate-100 p-3 rounded-lg text-xs leading-relaxed shadow-2xs animate-fade-in">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 border-b border-gray-100 pb-2 mb-2">
                  <span className="font-semibold text-slate-800">
                    Modification #{index + 1}
                  </span>
                  <span className="text-gray-400 text-[10px] font-mono">
                    {new Date(mod.at).toLocaleString()}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 mb-2 text-slate-600 bg-slate-50 p-1.5 rounded text-[11px] font-medium">
                  <span className="font-bold">Operator:</span>
                  <span className="bg-slate-200/50 px-1 py-0.5 rounded text-[10px] text-slate-700">{mod.byUser}</span>
                  <span className="mx-1 text-slate-300">|</span>
                  <span className="font-bold">Transfer:</span>
                  <span className="text-slate-700 text-[10px]">
                    from <span className="underline font-semibold">{mod.fromUser}</span> &rarr; to <span className="underline font-semibold">{mod.toUser}</span>
                  </span>
                </div>
                <div className="space-y-1 pl-1 border-l-2 border-slate-200">
                  {mod.changes.map((ch: any, cidx: number) => (
                    <div key={cidx} className="text-[11px] text-gray-500">
                      <span className="font-semibold text-slate-700">{ch.item}:</span>{" "}
                      <span className="text-rose-600 font-mono bg-rose-50 px-1 py-0.2 rounded inline-block max-w-xs truncate align-bottom">
                        {ch.from}
                      </span>{" "}
                      &rarr;{" "}
                      <span className="text-semibold text-emerald-700 font-bold font-mono bg-emerald-50 px-1 py-0.2 rounded inline-block max-w-xs truncate align-bottom">
                        {ch.to}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {savedStepData.modifications.length >= 2 && (
            <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-[11px] flex items-start gap-2 animate-pulse">
              <span className="font-extrabold px-1.5 py-0.5 bg-red-600 text-white rounded text-[9px] uppercase tracking-wider mt-0.5 shrink-0">LOCKED</span>
              <div>
                <span className="font-bold block text-red-950">Edit Threshold Reached (2/2)</span>
                No further edits can be saved by standard Operators. Only users with Quality Director / Administrator credentials can modify this step record.
              </div>
            </div>
          )}
        </div>
      )}

      {/* Save Step Button and Bottom Nav arrows */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-5 border-t border-gray-100">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onPrev}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 active:scale-95 transition border border-gray-200"
          >
            <ArrowLeft className="w-4 h-4" />
            Previous Step
          </button>
          
          <button
            type="button"
            onClick={onNext}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 active:scale-95 transition border border-gray-200"
          >
            Next Step
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-wrap gap-2 w-full sm:w-auto justify-end">
          {currentUserRole === "admin" && savedStepData && onUnsaveStep && (
            <button
              type="button"
              onClick={() => onUnsaveStep(stepNo)}
              disabled={isSaving}
              className="flex-1 sm:flex-initial font-bold text-sm py-2.5 px-6 rounded-xl shadow-md tracking-wide transition transform inline-flex items-center justify-center gap-2 border cursor-pointer active:scale-95 bg-rose-600 hover:bg-rose-700 text-white border-rose-600 hover:translate-y-[-1px] disabled:bg-gray-300 disabled:border-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed"
            >
              <RotateCcw className="w-4 h-4" />
              Unsave Step
            </button>
          )}

          <button
            type="button"
            onClick={executeSave}
            disabled={isSaving || (!!savedStepData?.modifications && savedStepData.modifications.length >= 2 && currentUserRole !== "admin")}
            className={`flex-1 sm:flex-initial font-bold text-sm py-2.5 px-6 rounded-xl shadow-md tracking-wide transition transform inline-flex items-center justify-center gap-2 border cursor-pointer active:scale-95 ${
              isSaving || (!!savedStepData?.modifications && savedStepData.modifications.length >= 2 && currentUserRole !== "admin")
                ? "bg-gray-300 border-gray-300 text-gray-500 cursor-not-allowed hover:translate-y-0 active:scale-100"
                : "bg-green-600 hover:bg-green-700 text-white border-green-600 hover:translate-y-[-1px]"
            }`}
          >
            {isSaving ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-green-100" />
                Saving to Database...
              </>
            ) : (!!savedStepData?.modifications && savedStepData.modifications.length >= 2 && currentUserRole !== "admin") ? (
              <>
                <CheckCircle className="w-4.5 h-4.5 text-gray-400" />
                Locked (2/2 edits)
              </>
            ) : (
              <>
                <CheckCircle className="w-4.5 h-4.5" />
                Save Step {stepNo} Data
              </>
            )}
          </button>
        </div>
      </div>

    </div>
  );
}

export default React.memo(StepDetail);
