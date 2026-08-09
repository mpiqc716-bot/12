import React, { useState, useEffect } from "react";
import { 
  User as UserIcon, 
  Key, 
  ShieldAlert, 
  UserPlus, 
  Trash2, 
  RefreshCw, 
  CheckCircle, 
  X, 
  Lock,
  LockOpen,
  Users,
  Sliders,
  Settings,
  Plus,
  Edit3,
  Download,
  Upload,
  Database,
  FileJson
} from "lucide-react";
import { User, UserRole, ToleranceConfig, ParameterTolerance, ProjectConfig, ProjectSettingReferenceData } from "../types";

interface AccountPanelProps {
  currentUser: User | null;
  onLogout: () => void;
  tolerances: ToleranceConfig[];
  onRefreshTolerances: () => Promise<void>;
  projects: ProjectConfig[];
  onRefreshProjects: () => Promise<void>;
  onRestoreDatabase?: () => Promise<void>;
}

function AccountPanel({ 
  currentUser, 
  onLogout, 
  tolerances, 
  onRefreshTolerances,
  projects,
  onRefreshProjects,
  onRestoreDatabase
}: AccountPanelProps) {
  const [isRestoringDb, setIsRestoringDb] = useState(false);
  const [dbRestoreStatus, setDbRestoreStatus] = useState<{ success?: boolean; message?: string } | null>(null);

  // Admin Full Backup Export & Import State
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importMergeMode, setImportMergeMode] = useState<"overwrite" | "merge">("overwrite");
  const [importStatus, setImportStatus] = useState<{ success?: boolean; message?: string; counts?: any } | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedImportData, setParsedImportData] = useState<any | null>(null);
  const [parsedCounts, setParsedCounts] = useState<{ pipes: number; users: number; projects: number; tolerances: number; chat: number } | null>(null);

  const handleExportData = async () => {
    setIsExporting(true);
    try {
      const res = await fetch("/api/db/export", {
        headers: getHeaders()
      });
      if (!res.ok) {
        const err = await safeParseJson(res);
        alert(err.error || "Failed to export system database backup");
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pipe_tracker_full_backup_${new Date().toISOString().substring(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      alert(err.message || "Error generating database backup file");
    } finally {
      setIsExporting(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setImportStatus(null);
    if (!file) {
      setSelectedFile(null);
      setParsedImportData(null);
      setParsedCounts(null);
      return;
    }

    setSelectedFile(file);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);
        if (!parsed || typeof parsed !== "object") {
          throw new Error("Invalid JSON backup structure");
        }
        setParsedImportData(parsed);
        setParsedCounts({
          pipes: Array.isArray(parsed.pipes) ? parsed.pipes.length : 0,
          users: Array.isArray(parsed.users) ? parsed.users.length : 0,
          projects: Array.isArray(parsed.projects) ? parsed.projects.length : 0,
          tolerances: Array.isArray(parsed.tolerances) ? parsed.tolerances.length : 0,
          chat: Array.isArray(parsed.chat) ? parsed.chat.length : 0
        });
      } catch (err: any) {
        alert("Selected file is not a valid JSON database backup file.");
        setSelectedFile(null);
        setParsedImportData(null);
        setParsedCounts(null);
      }
    };
    reader.readAsText(file);
  };

  const handleImportData = async () => {
    if (!parsedImportData) return;
    setIsImporting(true);
    setImportStatus(null);
    try {
      const payload = {
        ...parsedImportData,
        mergeMode: importMergeMode
      };
      const res = await fetch("/api/db/import", {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify(payload)
      });
      const data = await safeParseJson(res);
      if (res.ok) {
        setImportStatus({
          success: true,
          message: data.message,
          counts: data.counts
        });
        setSelectedFile(null);
        setParsedImportData(null);
        setParsedCounts(null);

        if (onRestoreDatabase) {
          await onRestoreDatabase();
        }
        await onRefreshTolerances();
        await onRefreshProjects();
      } else {
        setImportStatus({
          success: false,
          message: data.error || "Failed to import database backup"
        });
      }
    } catch (err: any) {
      setImportStatus({
        success: false,
        message: err.message || "Network error uploading database backup"
      });
    } finally {
      setIsImporting(false);
    }
  };

  const handleRestoreDatabase = async () => {
    setIsRestoringDb(true);
    setDbRestoreStatus(null);
    try {
      const res = await fetch("/api/db/restore", {
        method: "POST",
        headers: getHeaders()
      });
      const data = await safeParseJson(res);
      if (res.ok) {
        setDbRestoreStatus({
          success: true,
          message: `${data.message} (Loaded ${data.counts?.pipes || 0} pipe records & ${data.counts?.users || 0} user accounts)`
        });
        if (onRestoreDatabase) {
          await onRestoreDatabase();
        }
        await onRefreshTolerances();
        await onRefreshProjects();
      } else {
        setDbRestoreStatus({
          success: false,
          message: data.error || "Failed to restore database state"
        });
      }
    } catch (err: any) {
      setDbRestoreStatus({
        success: false,
        message: err.message || "Network error restoring database"
      });
    } finally {
      setIsRestoringDb(false);
    }
  };
  // Passwords state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwSuccessMsg, setPwSuccessMsg] = useState("");
  const [pwErrorMsg, setPwErrorMsg] = useState("");

  // Admin User List State
  const [users, setUsers] = useState<User[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  
  // Create user form
  const [newUsername, setNewUsername] = useState("");
  const [newRole, setNewRole] = useState<UserRole>("operator");
  const [newPickPassword, setNewPickPassword] = useState("");
  const [userCreatedMsg, setUserCreatedMsg] = useState("");
  const [userCreatedErrorMsg, setUserCreatedErrorMsg] = useState("");

  // Overwriting someone else's password state
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [adminOverwritesPassword, setAdminOverwritesPassword] = useState("");

  // Tolerances local states
  const [selectedToleranceConfigId, setSelectedToleranceConfigId] = useState<string | null>(null);
  const [formProject, setFormProject] = useState("");
  const [formSpecification, setFormSpecification] = useState("");
  const [formLimits, setFormLimits] = useState<{ [key: string]: { min: number; max: number } }>({});

  // Projects management states
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [formProjectCode, setFormProjectCode] = useState("");
  const [formClient, setFormClient] = useState("");
  const [formSettingReferencesList, setFormSettingReferencesList] = useState("");
  const [formTargetQuantityMeters, setFormTargetQuantityMeters] = useState<number>(1000);
  const [formProductionStartDate, setFormProductionStartDate] = useState("");
  const [formProductionEndDate, setFormProductionEndDate] = useState("");
  const [formSettingRefDetails, setFormSettingRefDetails] = useState<ProjectSettingReferenceData[]>([]);
  const [newRefInput, setNewRefInput] = useState("");

  const handleAddDirectRefKey = (rawKey: string) => {
    const keysText = rawKey.trim();
    if (!keysText) return;
    
    // Split by comma just in case they typed multiple
    const parts = keysText.split(",").map(p => p.trim().toUpperCase()).filter(p => p.length > 0);
    
    // Get existing keys
    const currentKeys = formSettingReferencesList
      .split(",")
      .map(r => r.trim().toUpperCase())
      .filter(r => r.length > 0);
    
    const combinedKeys = Array.from(new Set([...currentKeys, ...parts])) as string[];
    const newListStr = combinedKeys.join(", ");
    
    setFormSettingReferencesList(newListStr);
    syncSettingRefDetails(newListStr, formProductionStartDate, formProductionEndDate);
    setNewRefInput("");
  };

  const handleRemoveDirectRefKey = (keyToRemove: string) => {
    const currentKeys = formSettingReferencesList
      .split(",")
      .map(r => r.trim().toUpperCase())
      .filter(r => r.length > 0);
    
    const filteredKeys = currentKeys.filter(k => k !== keyToRemove.toUpperCase());
    const newListStr = filteredKeys.join(", ");
    
    setFormSettingReferencesList(newListStr);
    syncSettingRefDetails(newListStr, formProductionStartDate, formProductionEndDate);
  };

  const isParamND = (item: ProjectSettingReferenceData, paramKey: string): boolean => {
    if (!item.productParameters) return false;
    if (paramKey === "pipeLength") {
      return item.productParameters.length === "N/A" || item.productParameters.length === "ND";
    }
    if (paramKey === "pipeThickness") {
      return item.productParameters.thickness === "N/A" || item.productParameters.thickness === "ND";
    }
    if (paramKey === "pipeWeight") {
      return item.productParameters.weight === "N/A" || item.productParameters.weight === "ND";
    }
    const spigotKeys = ["sa", "sb", "sc", "sd", "se", "sf", "o2s", "o3s", "o4s", "sg"];
    if (spigotKeys.includes(paramKey)) {
      if (item.productParameters.spigotNotDefined) return true;
      const spigotObj = (item.productParameters.spigotDetail || {}) as any;
      return spigotObj[paramKey] === "N/A" || spigotObj[paramKey] === "ND";
    }
    const bellKeys = ["ba", "bb", "bc", "bd", "be", "bg", "o2b"];
    if (bellKeys.includes(paramKey)) {
      if (item.productParameters.bellNotDefined) return true;
      const bellObj = (item.productParameters.bellDetail || {}) as any;
      return bellObj[paramKey] === "N/A" || bellObj[paramKey] === "ND";
    }
    return false;
  };

  const getSpecLimitVal = (item: ProjectSettingReferenceData, paramKey: string, limitType: "min" | "max"): string => {
    if (isParamND(item, paramKey)) return "N/A";
    if (!item.specificationLimits) return "";
    const param = (item.specificationLimits as any)[paramKey];
    if (!param) return "";
    const val = param[limitType];
    if (val === undefined || val === null) return "";
    if (val === "ND" || val === "N/A") return "N/A";
    return String(val);
  };

  const toggleParamAndSpecND = (itemIndex: number, paramKey: string) => {
    setFormSettingRefDetails(prev => prev.map((item, idx) => {
      if (idx !== itemIndex) return item;
      const currentIsND = isParamND(item, paramKey);
      const newVal = currentIsND ? "" : "N/A";
      const newNDVal = currentIsND ? "" : "ND";

      let updatedProductParams = { ...(item.productParameters || {}) };
      if (paramKey === "pipeLength") {
        updatedProductParams.length = newVal;
      } else if (paramKey === "pipeThickness") {
        updatedProductParams.thickness = newVal;
      } else if (paramKey === "pipeWeight") {
        updatedProductParams.weight = newVal;
      } else {
        const spigotKeys = ["sa", "sb", "sc", "sd", "se", "sf", "o2s", "o3s", "o4s", "sg"];
        if (spigotKeys.includes(paramKey)) {
          const existingSpigot = updatedProductParams.spigotDetail || {};
          updatedProductParams.spigotDetail = { ...existingSpigot, [paramKey]: newVal };
        }
        const bellKeys = ["ba", "bb", "bc", "bd", "be", "bg", "o2b"];
        if (bellKeys.includes(paramKey)) {
          const existingBell = updatedProductParams.bellDetail || {};
          updatedProductParams.bellDetail = { ...existingBell, [paramKey]: newVal };
        }
      }

      const existingLimits = item.specificationLimits || {};
      const newLimits = {
        ...existingLimits,
        [paramKey]: { min: newNDVal, max: newNDVal }
      };

      return {
        ...item,
        productParameters: updatedProductParams,
        specificationLimits: newLimits
      };
    }));
  };

  const updateSpecLimit = (itemIndex: number, paramKey: string, limitType: "min" | "max", value: string) => {
    setFormSettingRefDetails(prev => prev.map((item, idx) => {
      if (idx !== itemIndex) return item;
      const existingLimits = item.specificationLimits || {};
      const existingParam = (existingLimits as any)[paramKey] || { min: "ND", max: "ND" };
      const cleanVal = value.trim();
      const formattedVal = cleanVal === "" || cleanVal.toUpperCase() === "ND" || cleanVal.toUpperCase() === "N/A" ? "ND" : (isNaN(Number(cleanVal)) ? cleanVal : Number(cleanVal));
      
      return {
        ...item,
        specificationLimits: {
          ...existingLimits,
          [paramKey]: {
            ...existingParam,
            [limitType]: formattedVal
          }
        }
      };
    }));
  };

  const syncSettingRefDetails = (rawRefString: string, baseStart?: string, baseEnd?: string, existingDetails?: any[]) => {
    const keys = rawRefString
      .split(",")
      .map(ref => ref.trim().toUpperCase())
      .filter(ref => ref.length > 0);

    const uniqueKeys = Array.from(new Set(keys));

    const now = new Date();
    const defaultStart = baseStart || now.toISOString().substring(0, 16);
    const end = new Date();
    end.setDate(now.getDate() + 30);
    const defaultEnd = baseEnd || end.toISOString().substring(0, 16);

    setFormSettingRefDetails(prev => {
      return uniqueKeys.map(key => {
        // Check in custom existingDetails (for edits)
        const matchInExisting = existingDetails?.find(d => d.settingReference.toUpperCase() === key);
        
        // Look up existing tolerance config if matchInExisting has no specificationLimits
        const existingTol = tolerances?.find(t => 
          (t.project === formProjectCode || t.project === "All Projects") && 
          (t.specification === key || t.specification === "All Specifications")
        );

        const resolvedLimits = matchInExisting?.specificationLimits && Object.keys(matchInExisting.specificationLimits).length > 0
          ? matchInExisting.specificationLimits
          : (existingTol ? {
              sa: existingTol.sa, sb: existingTol.sb, sc: existingTol.sc, sd: existingTol.sd, se: existingTol.se, sf: existingTol.sf,
              o2s: existingTol.o2s, o3s: existingTol.o3s, o4s: existingTol.o4s, sg: existingTol.sg,
              pipeLength: existingTol.pipeLength, pipeThickness: existingTol.pipeThickness,
              o2b: existingTol.o2b, ba: existingTol.ba, bb: existingTol.bb, bc: existingTol.bc, bd: existingTol.bd, be: existingTol.be, bf: existingTol.bf, bg: existingTol.bg,
              pipeWeight: existingTol.pipeWeight
            } : {});

        if (matchInExisting) {
          return {
            settingReference: key,
            targetQuantityMeters: Number(matchInExisting.targetQuantityMeters) || 500,
            productionStartDate: matchInExisting.productionStartDate ?? defaultStart,
            productionEndDate: matchInExisting.productionEndDate ?? defaultEnd,
            pipeClass: matchInExisting.pipeClass ?? { nominalDiameter: "", nominalPressure: "", nominalStiffness: "" },
            pipeType: matchInExisting.pipeType ?? "GRE",
            junctionType: matchInExisting.junctionType ?? "BELL/SPIGOT 1OR",
            productParameters: matchInExisting.productParameters ?? {
              length: "",
              thickness: "",
              weight: "",
              spigotDetail: { sa: "", sb: "", sc: "", sd: "", se: "", sf: "", o2s: "", o3s: "", o4s: "", sg: "" },
              bellDetail: { ba: "", bb: "", bc: "", bd: "", be: "", bg: "", o2b: "" }
            },
            specificationLimits: resolvedLimits
          };
        }

        // Check in existing state
        const existing = prev?.find(p => p.settingReference.toUpperCase() === key);
        if (existing) {
          return {
            ...existing,
            settingReference: key
          };
        }

        return {
          settingReference: key,
          targetQuantityMeters: 500,
          productionStartDate: defaultStart,
          productionEndDate: defaultEnd,
          pipeClass: { nominalDiameter: "", nominalPressure: "", nominalStiffness: "" },
          pipeType: "GRE",
          junctionType: "BELL/SPIGOT 1OR",
          productParameters: {
            length: "",
            thickness: "",
            weight: "",
            spigotDetail: { sa: "", sb: "", sc: "", sd: "", se: "", sf: "", o2s: "", o3s: "", o4s: "", sg: "" },
            bellDetail: { ba: "", bb: "", bc: "", bd: "", be: "", bg: "", o2b: "" }
          },
          specificationLimits: resolvedLimits
        };
      });
    });
  };

  const handleCreateNewProject = () => {
    setEditingProjectId("new");
    setFormProjectCode("");
    setFormClient("");
    setFormSettingReferencesList("");
    setFormTargetQuantityMeters(1000);
    const now = new Date();
    const startStr = now.toISOString().substring(0, 16);
    setFormProductionStartDate(startStr);
    const end = new Date();
    end.setDate(now.getDate() + 30);
    const endStr = end.toISOString().substring(0, 16);
    setFormProductionEndDate(endStr);
    setFormSettingRefDetails([]);
  };

  const handleEditProject = (p: ProjectConfig) => {
    setEditingProjectId(p.id);
    setFormProjectCode(p.projectCode);
    setFormClient(p.client || "");
    setFormSettingReferencesList(p.settingReferences.join(", "));
    setFormTargetQuantityMeters(p.targetQuantityMeters ?? 1000);
    
    const now = new Date();
    const defaultStart = p.productionStartDate ?? now.toISOString().substring(0, 16);
    const end = new Date();
    end.setDate(now.getDate() + 30);
    const defaultEnd = p.productionEndDate ?? end.toISOString().substring(0, 16);

    setFormProductionStartDate(defaultStart);
    setFormProductionEndDate(defaultEnd);
    
    syncSettingRefDetails(p.settingReferences.join(", "), defaultStart, defaultEnd, p.settingRefDetails);
  };

  const handleDeleteProject = async (id: string, code: string) => {
    const doubleCheck = window.confirm(`Are you sure you want to remove the project code "${code}"? Operators will no longer be able to select it.`);
    if (!doubleCheck) return;

    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: "DELETE",
        headers: getHeaders()
      });
      if (res.ok) {
        onRefreshProjects();
      } else {
        const errData = await safeParseJson(res);
        alert(errData.error || "Failed to delete project");
      }
    } catch (err: any) {
      alert("Error: " + err.message);
    }
  };

  const handleSaveProject = async () => {
    if (!formProjectCode.trim()) {
      alert("Please provide a valid Project/Work Order Code.");
      return;
    }

    const references = formSettingReferencesList
      .split(",")
      .map(ref => ref.trim().toUpperCase())
      .filter(ref => ref.length > 0);

    const uniqueRefs = Array.from(new Set(references)) as string[];

    if (uniqueRefs.length === 0) {
      alert("Please enter at least one Setting Reference Key (separate multiple references with commas).");
      return;
    }

    // Capture and clean setting reference details dynamically linked with comma separated input
    const finalDetails: ProjectSettingReferenceData[] = uniqueRefs.map(ref => {
      const existing = formSettingRefDetails.find(d => d.settingReference.toUpperCase() === ref);
      const now = new Date();
      const defaultStart = formProductionStartDate || now.toISOString().substring(0, 16);
      const end = new Date();
      end.setDate(now.getDate() + 30);
      const defaultEnd = formProductionEndDate || end.toISOString().substring(0, 16);

      return {
        settingReference: ref,
        targetQuantityMeters: existing ? Number(existing.targetQuantityMeters) || 500 : 500,
        productionStartDate: existing ? existing.productionStartDate : defaultStart,
        productionEndDate: existing ? existing.productionEndDate : defaultEnd,
        pipeClass: existing?.pipeClass || {},
        pipeType: existing?.pipeType || "GRE",
        junctionType: existing?.junctionType || "BELL/SPIGOT 1OR",
        productParameters: existing?.productParameters || {},
        specificationLimits: existing?.specificationLimits || {}
      };
    });

    // Project level target is the sum of reference level targets to keep metrics coherent
    const totalTarget = finalDetails.reduce((sum, d) => sum + (d.targetQuantityMeters || 0), 0) || Number(formTargetQuantityMeters) || 1000;

    const id = editingProjectId === "new" ? "pc-" + Date.now() : editingProjectId!;
    const projectCodeUpper = formProjectCode.trim().toUpperCase();

    const payload: ProjectConfig = {
      id,
      projectCode: projectCodeUpper,
      client: formClient.trim(),
      settingReferences: uniqueRefs,
      settingRefDetails: finalDetails,
      targetQuantityMeters: totalTarget,
      productionStartDate: formProductionStartDate,
      productionEndDate: formProductionEndDate
    };

    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        // Auto-sync tolerance specifications to /api/tolerances for each reference
        for (const detail of finalDetails) {
          if (detail.specificationLimits && Object.keys(detail.specificationLimits).length > 0) {
            const tolPayload = {
              id: `tc-${projectCodeUpper}-${detail.settingReference.toUpperCase()}`,
              project: projectCodeUpper,
              specification: detail.settingReference.toUpperCase(),
              ...detail.specificationLimits,
              updatedAt: new Date().toISOString()
            };
            try {
              await fetch("/api/tolerances", {
                method: "POST",
                headers: getHeaders(),
                body: JSON.stringify(tolPayload)
              });
            } catch (e) {
              console.error("Auto-syncing tolerance error", e);
            }
          }
        }

        setEditingProjectId(null);
        onRefreshProjects();
        if (onRefreshTolerances) onRefreshTolerances();
      } else {
        const errData = await safeParseJson(res);
        alert(errData.error || "Failed to save project");
      }
    } catch (err: any) {
      alert("Error saving: " + err.message);
    }
  };

  const ALL_LIMITS_KEYS = [
    "sa", "sb", "sc", "sd", "se", "sf", "o2s", "o3s", "o4s", "sg", "pipeLength", "pipeThickness",
    "o2b", "ba", "bb", "bc", "bd", "be", "bf", "bg", "pipeWeight"
  ];

  const handleCreateNewTolerance = () => {
    setSelectedToleranceConfigId("new");
    setFormProject("");
    setFormSpecification("");
    const initialLimits: { [key: string]: { min: any; max: any } } = {};
    for (const key of ALL_LIMITS_KEYS) {
      initialLimits[key] = { min: "ND", max: "ND" };
    }
    setFormLimits(initialLimits);
  };

  const handleEditTolerance = (tc: ToleranceConfig) => {
    setSelectedToleranceConfigId(tc.id);
    setFormProject(tc.project);
    setFormSpecification(tc.specification);
    const initialLimits: { [key: string]: { min: any; max: any } } = {};
    for (const key of ALL_LIMITS_KEYS) {
      const field = (tc as any)[key];
      initialLimits[key] = {
        min: field && field.min !== undefined && field.min !== null ? field.min : "ND",
        max: field && field.max !== undefined && field.max !== null ? field.max : "ND"
      };
    }
    setFormLimits(initialLimits);
  };

  const handleDeleteTolerance = async (id: string, project: string, specification: string) => {
    const doubleCheck = window.confirm(`Are you sure you want to remove tolerance ranges for Project: ${project} / Specification: ${specification}?`);
    if (!doubleCheck) return;

    try {
      const res = await fetch(`/api/tolerances/${id}`, {
        method: "DELETE",
        headers: getHeaders()
      });
      if (res.ok) {
        onRefreshTolerances();
      } else {
        const errData = await safeParseJson(res);
        alert(errData.error || "Failed to delete tolerance configuration");
      }
    } catch (err: any) {
      alert("Error: " + err.message);
    }
  };

  const handleSaveToleranceConfig = async () => {
    if (!formProject.trim() || !formSpecification.trim()) {
      alert("Please ensure both Project name and Specification code are defined.");
      return;
    }

    const id = selectedToleranceConfigId === "new" ? "tc-" + Date.now() : selectedToleranceConfigId!;
    const payload: any = {
      id,
      project: formProject.trim(),
      specification: formSpecification.trim(),
      updatedAt: new Date().toISOString()
    };

    for (const key of ALL_LIMITS_KEYS) {
      const limit = formLimits[key];
      if (limit) {
        payload[key] = {
          min: limit.min === "ND" || limit.min === "" || limit.min === null ? "ND" : Number(limit.min),
          max: limit.max === "ND" || limit.max === "" || limit.max === null ? "ND" : Number(limit.max)
        };
      }
    }

    try {
      const res = await fetch("/api/tolerances", {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setSelectedToleranceConfigId(null);
        onRefreshTolerances();
      } else {
        const errData = await safeParseJson(res);
        alert(errData.error || "Failed to save tolerance configuration");
      }
    } catch (err: any) {
      alert("Error saving: " + err.message);
    }
  };

  const handleLimitFieldChange = (key: string, limitType: "min" | "max", val: any) => {
    setFormLimits(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        [limitType]: val
      }
    }));
  };

  const formatRangeDisplay = (field: any): string => {
    if (!field) return "ND";
    const minIsNd = field.min === undefined || field.min === null || field.min === "ND" || field.min === "";
    const maxIsNd = field.max === undefined || field.max === null || field.max === "ND" || field.max === "";
    if (minIsNd && maxIsNd) return "ND";
    if (minIsNd) return `≤${field.max}`;
    if (maxIsNd) return `≥${field.min}`;
    return `${field.min}-${field.max}`;
  };

  const renderLimitFields = (label: string, key: string) => {
    const limits = formLimits[key] || { min: "ND", max: "ND" };
    const minIsNd = limits.min === "ND" || limits.min === null || limits.min === undefined;
    const maxIsNd = limits.max === "ND" || limits.max === null || limits.max === undefined;

    return (
      <div key={key} className="bg-white p-2.5 rounded-xl border border-gray-150 space-y-2 shadow-2xs">
        <div className="flex justify-between items-center bg-gray-50 p-1 rounded-md">
          <span className="block text-[10px] font-extrabold text-gray-750 uppercase tracking-tight truncate">
            {label}
          </span>
          <button
            type="button"
            onClick={() => {
              const allNd = minIsNd && maxIsNd;
              setFormLimits(prev => ({
                ...prev,
                [key]: allNd ? { min: 0, max: 200 } : { min: "ND", max: "ND" }
              }));
            }}
            className={`text-[8px] font-bold px-1.5 py-0.5 rounded transition cursor-pointer ${
              minIsNd && maxIsNd 
                ? "bg-slate-200 text-slate-800" 
                : "bg-blue-50 text-blue-600 hover:bg-blue-150"
            }`}
          >
            {minIsNd && maxIsNd ? "Define All" : "Set ND All"}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {/* Min Field */}
          <div>
            <div className="flex justify-between items-center mb-0.5">
              <label className="block text-[9px] font-bold text-gray-400 uppercase">Min</label>
              <button
                type="button"
                onClick={() => {
                  handleLimitFieldChange(key, "min", minIsNd ? 0 : "ND");
                }}
                className={`text-[8px] font-bold px-1 rounded cursor-pointer transition ${
                  minIsNd ? "text-purple-650 bg-purple-50 hover:bg-purple-100" : "text-gray-400 hover:text-purple-650"
                }`}
              >
                ND
              </button>
            </div>
            {minIsNd ? (
              <div className="w-full bg-purple-50/50 border border-purple-100 p-1 text-center text-[10px] font-extrabold text-purple-700 rounded h-[30px] flex items-center justify-center">
                ND
              </div>
            ) : (
              <input
                type="number"
                step="0.01"
                value={limits.min}
                onChange={(e) => handleLimitFieldChange(key, "min", e.target.value === "" ? "" : Number(e.target.value))}
                className="w-full bg-gray-50 border border-gray-100 p-1 text-xs text-center rounded font-semibold outline-none focus:bg-white focus:border-blue-500 h-[30px]"
              />
            )}
          </div>

          {/* Max Field */}
          <div>
            <div className="flex justify-between items-center mb-0.5">
              <label className="block text-[9px] font-bold text-gray-400 uppercase">Max</label>
              <button
                type="button"
                onClick={() => {
                  handleLimitFieldChange(key, "max", maxIsNd ? 200 : "ND");
                }}
                className={`text-[8px] font-bold px-1 rounded cursor-pointer transition ${
                  maxIsNd ? "text-purple-650 bg-purple-50 hover:bg-purple-100" : "text-gray-400 hover:text-purple-650"
                }`}
              >
                ND
              </button>
            </div>
            {maxIsNd ? (
              <div className="w-full bg-purple-50/50 border border-purple-100 p-1 text-center text-[10px] font-extrabold text-purple-700 rounded h-[30px] flex items-center justify-center">
                ND
              </div>
            ) : (
              <input
                type="number"
                step="0.01"
                value={limits.max}
                onChange={(e) => handleLimitFieldChange(key, "max", e.target.value === "" ? "" : Number(e.target.value))}
                className="w-full bg-gray-50 border border-gray-100 p-1 text-xs text-center rounded font-semibold outline-none focus:bg-white focus:border-blue-500 h-[30px]"
              />
            )}
          </div>
        </div>
      </div>
    );
  };

  useEffect(() => {
    if (currentUser?.role === "admin") {
      fetchUsersList();
    }
  }, [currentUser]);

  const getHeaders = () => {
    const token = localStorage.getItem("pipe_tracker_token");
    return {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    };
  };

  const safeParseJson = async (res: Response) => {
    const contentType = res.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      return await res.json();
    }
    const text = await res.text();
    const cleanText = text.trim();
    if (cleanText.toLowerCase().startsWith("<!doctype html") || cleanText.toLowerCase().startsWith("<html")) {
      throw new Error("The API server returned an HTML page (SPA index fallback) instead of JSON. Ensure database/express runtime server is active.");
    }
    throw new Error(cleanText.substring(0, 150) || "Server returned non-JSON response");
  };

  const fetchUsersList = async () => {
    setIsLoadingUsers(true);
    try {
      const res = await fetch("/api/users", {
        headers: getHeaders()
      });
      if (res.ok) {
        const data = await safeParseJson(res);
        setUsers(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingUsers(false);
    }
  };

  const handleSelfPasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwSuccessMsg("");
    setPwErrorMsg("");

    if (!newPassword || newPassword.trim().length === 0) {
      setPwErrorMsg("New password is empty or blank");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwErrorMsg("Passwords do not match");
      return;
    }

    try {
      const res = await fetch(`/api/users/${currentUser?.id}/password`, {
        method: "PUT",
        headers: getHeaders(),
        body: JSON.stringify({ newPassword: newPassword })
      });
      const data = await safeParseJson(res);
      if (res.ok) {
        setPwSuccessMsg("Password changed successfully in secure storage.");
        setNewPassword("");
        setConfirmPassword("");
        setCurrentPassword("");
      } else {
        setPwErrorMsg(data.error || "Failed to update security credentials");
      }
    } catch (err: any) {
      setPwErrorMsg(err.message || "Database network offline. Check connection.");
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserCreatedMsg("");
    setUserCreatedErrorMsg("");

    if (!newUsername.trim() || !newPickPassword.trim()) {
      setUserCreatedErrorMsg("Username and password are required");
      return;
    }

    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          username: newUsername.trim(),
          password: newPickPassword.trim(),
          role: newRole
        })
      });
      const data = await safeParseJson(res);
      if (res.ok) {
        setUserCreatedMsg(`User "${data.username}" successfully established in database`);
        setNewUsername("");
        setNewPickPassword("");
        fetchUsersList();
      } else {
        setUserCreatedErrorMsg(data.error || "Could not register details");
      }
    } catch (err: any) {
      setUserCreatedErrorMsg(err.message || "Remote API error");
    }
  };

  const handleDeleteUser = async (idOfUser: string, nameOfUser: string) => {
    if (!confirm(`Are you sure you want to permanently delete user ${nameOfUser}? This action is irreversible.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/users/${idOfUser}`, {
        method: "DELETE",
        headers: getHeaders()
      });
      const data = await safeParseJson(res);
      if (res.ok) {
        fetchUsersList();
      } else {
        alert(data.error || "Could not delete user account");
      }
    } catch (err: any) {
      alert(err.message || "Database error deleting operator");
    }
  };

  const handleForceChangePassword = async (userId: string, targetUsername: string) => {
    if (!adminOverwritesPassword.trim()) {
      alert("Please specify a valid new password");
      return;
    }

    try {
      const res = await fetch(`/api/users/${userId}/password`, {
        method: "PUT",
        headers: getHeaders(),
        body: JSON.stringify({ newPassword: adminOverwritesPassword })
      });
      if (res.ok) {
        alert(`Successfully overwritten password for ${targetUsername}`);
        setEditingUserId(null);
        setAdminOverwritesPassword("");
      } else {
        const data = await safeParseJson(res);
        alert(data.error || "Failed to change credentials");
      }
    } catch (err: any) {
      alert(err.message || "Error reaching login service API");
    }
  };

  if (!currentUser) return null;

  return (
    <div className="space-y-6 font-sans">
      
      {/* Self Account specifications card */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-xs p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
            <UserIcon className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-extrabold text-gray-800 text-lg leading-tight uppercase tracking-wide">
              {currentUser.username}
            </h3>
            <div className="flex gap-2 items-center mt-1">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${
                currentUser.role === 'admin' 
                  ? 'bg-rose-50 border-rose-200 text-rose-700' 
                  : 'bg-indigo-50 border-indigo-200 text-indigo-700'
              }`}>
                {currentUser.role} PRIVILEGES
              </span>
              <span className="text-[11px] text-gray-400">ID: {currentUser.id}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full sm:w-auto">
          <button
            type="button"
            onClick={handleRestoreDatabase}
            disabled={isRestoringDb}
            className="inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-4 py-2.5 rounded-xl transition active:scale-95 disabled:opacity-50 cursor-pointer shadow-xs"
          >
            <RefreshCw className={`w-4 h-4 ${isRestoringDb ? 'animate-spin' : ''}`} />
            {isRestoringDb ? "Restoring Database..." : "Restore Data from Database"}
          </button>

          <button
            onClick={onLogout}
            className="bg-gray-100 hover:bg-gray-200 border border-gray-200 text-gray-800 hover:text-red-700 text-xs font-semibold px-4.5 py-2.5 rounded-xl cursor-pointer transition active:scale-95 text-center"
          >
            Sign Out
          </button>
        </div>
      </div>

      {dbRestoreStatus && (
        <div className={`p-4 rounded-xl border text-xs flex items-start gap-2.5 ${
          dbRestoreStatus.success 
            ? 'bg-emerald-50 border-emerald-200 text-emerald-900' 
            : 'bg-rose-50 border-rose-200 text-rose-900'
        }`}>
          <CheckCircle className={`w-4 h-4 shrink-0 mt-0.5 ${dbRestoreStatus.success ? 'text-emerald-600' : 'text-rose-600'}`} />
          <div>
            <span className="font-bold">{dbRestoreStatus.success ? 'Database Restored Successfully' : 'Database Restoration Error'}</span>
            <p className="mt-0.5">{dbRestoreStatus.message}</p>
          </div>
        </div>
      )}

      {/* Admin Full System Data Backup & Restore Card */}
      {currentUser.role === "admin" && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-xs p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-3">
            <div>
              <h4 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
                <Database className="w-4.5 h-4.5 text-indigo-600" />
                Full System Data Backup & Restore (Download & Upload All Data)
              </h4>
              <p className="text-xs text-gray-500 mt-0.5">
                Exclusively for Administrators: Export a complete JSON database archive or upload a backup file to restore pipes, users, projects, chat messages, and specifications.
              </p>
            </div>
            
            <button
              type="button"
              onClick={handleExportData}
              disabled={isExporting}
              className="inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition active:scale-95 disabled:opacity-50 cursor-pointer shadow-xs shrink-0"
            >
              <Download className={`w-4 h-4 ${isExporting ? "animate-bounce" : ""}`} />
              {isExporting ? "Preparing Backup..." : "Download Full Database (.json)"}
            </button>
          </div>

          {importStatus && (
            <div className={`p-4 rounded-xl border text-xs flex items-start gap-2.5 ${
              importStatus.success 
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900' 
                : 'bg-rose-50 border-rose-200 text-rose-900'
            }`}>
              <CheckCircle className={`w-4 h-4 shrink-0 mt-0.5 ${importStatus.success ? 'text-emerald-600' : 'text-rose-600'}`} />
              <div>
                <span className="font-bold">{importStatus.success ? 'Backup Imported & Synchronized' : 'Database Upload Error'}</span>
                <p className="mt-0.5">{importStatus.message}</p>
                {importStatus.counts && (
                  <div className="flex flex-wrap gap-2 mt-2 font-mono text-[11px]">
                    <span className="px-2 py-0.5 bg-white/80 rounded border border-emerald-300 font-bold">{importStatus.counts.pipes} Pipes</span>
                    <span className="px-2 py-0.5 bg-white/80 rounded border border-emerald-300 font-bold">{importStatus.counts.users} Users</span>
                    <span className="px-2 py-0.5 bg-white/80 rounded border border-emerald-300 font-bold">{importStatus.counts.projects} Projects</span>
                    <span className="px-2 py-0.5 bg-white/80 rounded border border-emerald-300 font-bold">{importStatus.counts.tolerances} Specs</span>
                    <span className="px-2 py-0.5 bg-white/80 rounded border border-emerald-300 font-bold">{importStatus.counts.chat} Messages</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Upload Backup Area */}
          <div className="bg-gray-50 rounded-xl p-4 border border-dashed border-gray-300 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="text-xs font-bold text-gray-700 flex items-center gap-1.5 uppercase tracking-wide">
                <Upload className="w-4 h-4 text-blue-600" />
                Upload Database Backup File
              </span>

              <div className="flex items-center gap-2 text-xs">
                <span className="text-gray-500 font-medium">Import Mode:</span>
                <label className="inline-flex items-center gap-1 cursor-pointer font-bold text-gray-700">
                  <input
                    type="radio"
                    name="importMergeMode"
                    value="overwrite"
                    checked={importMergeMode === "overwrite"}
                    onChange={() => setImportMergeMode("overwrite")}
                    className="text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                  Replace All (Overwrite)
                </label>
                <label className="inline-flex items-center gap-1 cursor-pointer font-bold text-gray-700 ml-2">
                  <input
                    type="radio"
                    name="importMergeMode"
                    value="merge"
                    checked={importMergeMode === "merge"}
                    onChange={() => setImportMergeMode("merge")}
                    className="text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                  Merge Records
                </label>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <input
                type="file"
                accept=".json"
                onChange={handleFileChange}
                className="block w-full text-xs text-gray-500 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer border border-gray-200 rounded-xl bg-white p-1"
              />

              {parsedImportData && (
                <button
                  type="button"
                  onClick={handleImportData}
                  disabled={isImporting}
                  className="inline-flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-5 py-2.5 rounded-xl transition active:scale-95 disabled:opacity-50 cursor-pointer shrink-0 shadow-xs"
                >
                  <Upload className={`w-3.5 h-3.5 ${isImporting ? "animate-spin" : ""}`} />
                  {isImporting ? "Uploading Data..." : "Restore Data from File"}
                </button>
              )}
            </div>

            {parsedCounts && (
              <div className="bg-white rounded-lg p-3 border border-blue-150 text-xs text-gray-700 space-y-1.5">
                <div className="flex items-center justify-between font-bold text-blue-900">
                  <span className="flex items-center gap-1">
                    <FileJson className="w-4 h-4 text-blue-600" />
                    Selected File Preview: {selectedFile?.name}
                  </span>
                  <span className="text-[11px] font-normal text-gray-500">{(selectedFile?.size || 0) / 1024 > 1024 ? `${((selectedFile?.size || 0) / (1024 * 1024)).toFixed(2)} MB` : `${Math.round((selectedFile?.size || 0) / 1024)} KB`}</span>
                </div>
                <div className="flex flex-wrap gap-2 text-[11px]">
                  <span className="px-2 py-0.5 bg-blue-50 text-blue-800 rounded font-semibold">{parsedCounts.pipes} Pipes</span>
                  <span className="px-2 py-0.5 bg-purple-50 text-purple-800 rounded font-semibold">{parsedCounts.users} Users</span>
                  <span className="px-2 py-0.5 bg-amber-50 text-amber-800 rounded font-semibold">{parsedCounts.projects} Projects</span>
                  <span className="px-2 py-0.5 bg-emerald-50 text-emerald-800 rounded font-semibold">{parsedCounts.tolerances} Specifications</span>
                  <span className="px-2 py-0.5 bg-indigo-50 text-indigo-800 rounded font-semibold">{parsedCounts.chat} Messages</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Two-Column split panels: Left is update password, right is admin user desk if admin */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Reset credentials card */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-xs p-5">
          <h4 className="font-semibold text-gray-900 text-sm mb-4 flex items-center gap-1.5 border-b border-gray-100 pb-2.5">
            <Key className="w-4.5 h-4.5 text-blue-600 animate-pulse" />
            Modify Security Credentials
          </h4>

          {pwSuccessMsg && (
            <div className="mb-4 bg-green-50 text-green-800 text-xs p-3 rounded-lg border border-green-200">
              {pwSuccessMsg}
            </div>
          )}
          {pwErrorMsg && (
            <div className="mb-4 bg-red-50 text-red-800 text-xs p-3 rounded-lg border border-red-200">
              {pwErrorMsg}
            </div>
          )}

          <form onSubmit={handleSelfPasswordReset} className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">New Operator Password</label>
              <input
                type="password"
                required
                placeholder="Enter new passkey..."
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 text-sm p-2.5 rounded-xl focus:border-blue-500 focus:bg-white outline-none transition"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Confirm New Password</label>
              <input
                type="password"
                required
                placeholder="Type password again to check..."
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 text-sm p-2.5 rounded-xl focus:border-blue-500 focus:bg-white outline-none transition"
              />
            </div>

            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs py-2.5 rounded-xl cursor-default shadow-sm transition active:scale-98 text-center"
            >
              Update Passkey Credentials
            </button>
          </form>
        </div>

        {/* Admin Desk Panel */}
        {currentUser.role === "admin" && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-xs p-5 space-y-5">
            <h4 className="font-semibold text-gray-900 text-sm flex items-center gap-1.5 border-b border-gray-100 pb-2.5">
              <Users className="w-4.5 h-4.5 text-rose-500" />
              Administrative Operations Desk (Add / Remove Users)
            </h4>

            {/* Create operator employee form */}
            <form onSubmit={handleCreateUser} className="bg-gray-50 rounded-xl p-3.5 border border-gray-250/70 space-y-3">
              <span className="text-[10px] font-bold text-gray-400 block uppercase tracking-wider mb-1 flex items-center gap-1">
                <UserPlus className="w-3.5 h-3.5 text-blue-600" />
                Register New Authorized Account
              </span>

              {userCreatedMsg && (
                <div className="bg-green-50 text-green-800 text-[11px] p-2 rounded-lg border border-green-200">
                  {userCreatedMsg}
                </div>
              )}
              {userCreatedErrorMsg && (
                <div className="bg-rose-50 text-rose-800 text-[11px] p-2 rounded-lg border border-rose-200">
                  {userCreatedErrorMsg}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-gray-600 mb-0.5">Username</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. operator_john"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    className="w-full bg-white border border-gray-200 text-xs p-2 rounded-lg outline-none font-sans"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-600 mb-0.5">Role Level</label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as UserRole)}
                    className="w-full bg-white border border-gray-200 text-xs p-2 rounded-lg outline-none cursor-pointer"
                  >
                    <option value="operator">Operator (Track runs)</option>
                    <option value="admin">Administrator (Full control)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-600 mb-0.5">Pick New Password</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. OperatorPassword123"
                  value={newPickPassword}
                  onChange={(e) => setNewPickPassword(e.target.value)}
                  className="w-full bg-white border border-gray-200 text-xs p-2 rounded-lg outline-none font-sans"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2 rounded-lg shadow-sm transition cursor-pointer"
              >
                Register Employee Account
              </button>
            </form>

            {/* Existing user registries review list */}
            <div className="space-y-2">
              <span className="text-[10px] font-bold text-gray-400 block uppercase tracking-wider">
                Authorized Personnel Registers ({users.length})
              </span>

              {isLoadingUsers ? (
                <div className="text-xs text-gray-400 py-3 text-center animate-pulse flex items-center justify-center gap-1">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-500" />
                  Refreshing registry logs...
                </div>
              ) : (
                <div className="max-h-56 overflow-y-auto space-y-2 border border-gray-200 rounded-xl p-2 bg-gray-50/50">
                  {users.map((usr) => (
                    <div 
                      key={usr.id} 
                      className="bg-white p-2.5 rounded-lg border border-gray-100 shadow-xs flex justify-between items-center text-xs"
                    >
                      <div>
                        <div className="flex items-center gap-1.5">
                          <strong className="text-gray-800">{usr.username}</strong>
                          <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded border uppercase ${
                            usr.role === 'admin' 
                              ? 'bg-rose-50 border-rose-100 text-rose-700' 
                              : 'bg-indigo-50 border-indigo-100 text-indigo-700'
                          }`}>
                            {usr.role}
                          </span>
                        </div>
                        <span className="text-[10px] text-gray-400 block">System account key: {usr.id}</span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        
                        {editingUserId === usr.id ? (
                          <div className="flex items-center gap-1 bg-gray-100 p-1.5 rounded-lg border border-gray-300">
                            <input
                              type="text"
                              placeholder="New pass..."
                              value={adminOverwritesPassword}
                              onChange={(e) => setAdminOverwritesPassword(e.target.value)}
                              className="bg-white border border-gray-200 text-[11px] p-1 rounded w-24 outline-none font-mono"
                            />
                            <button
                              type="button"
                              onClick={() => handleForceChangePassword(usr.id, usr.username)}
                              className="bg-green-600 text-white p-1 rounded font-bold hover:bg-green-700"
                              title="Confirm change password"
                            >
                              ✓
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingUserId(null);
                                setAdminOverwritesPassword("");
                              }}
                              className="bg-gray-400 text-white p-1 rounded font-bold hover:bg-gray-500"
                              title="Cancel write"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingUserId(usr.id);
                              setAdminOverwritesPassword("");
                            }}
                            className="text-[10px] bg-gray-100 hover:bg-gray-200 text-gray-700 px-2 py-1 rounded"
                            title="Reset Credentials manually"
                          >
                            Reset Password
                          </button>
                        )}

                        {usr.id !== currentUser.id && (
                          <button
                            type="button"
                            onClick={() => handleDeleteUser(usr.id, usr.username)}
                            className="bg-rose-50 text-rose-600 hover:bg-rose-100 p-1.5 rounded-lg border border-rose-100 transition"
                            title="Delete user"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        )}

      </div>

      {/* Project/Work Order Codes and Settings References Registry */}
      {currentUser.role === "admin" && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-xs p-5 space-y-5">
          <h4 className="font-semibold text-gray-900 text-sm flex items-center justify-between border-b border-gray-100 pb-2.5">
            <span className="flex items-center gap-1.5 text-indigo-700">
              <Settings className="w-4.5 h-4.5 text-indigo-600 animate-pulse" />
              Project & Setting Reference Lists
            </span>
            <button
              id="admin-btn-add-new-project-config"
              onClick={() => handleCreateNewProject()}
              className="bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 text-xs font-bold px-3 py-1.5 rounded-lg transition flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Project Code
            </button>
          </h4>

          {editingProjectId ? (
            <div className="bg-indigo-50/45 p-4 rounded-xl border border-indigo-190/70 space-y-4">
              <span className="text-xs font-bold text-indigo-800 uppercase tracking-wider block">
                {editingProjectId === "new" ? "Add New Pre-defined Project List" : "Edit Pre-defined Project List"}
              </span>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 uppercase mb-1">
                    Project / Work Order Code
                  </label>
                  <input
                    id="admin-input-project-code"
                    type="text"
                    placeholder="e.g. WO-2026-001"
                    value={formProjectCode}
                    onChange={(e) => setFormProjectCode(e.target.value)}
                    className="w-full bg-white border border-gray-200 rounded-lg text-xs p-2 focus:border-indigo-500 focus:outline-none transition font-sans font-bold text-gray-800"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-gray-700 uppercase mb-1">
                    1 - The Client Name
                  </label>
                  <input
                    id="admin-input-project-client"
                    type="text"
                    placeholder="e.g. Saudi Aramco / SWCC / ADNOC"
                    value={formClient}
                    onChange={(e) => {
                      const val = e.target.value;
                      setFormClient(val);
                      // Update formSettingRefDetails client if empty
                      setFormSettingRefDetails(prev => prev.map(item => ({ ...item, client: item.client || val })));
                    }}
                    className="w-full bg-white border border-gray-200 rounded-lg text-xs p-2 focus:border-indigo-500 focus:outline-none transition font-sans text-gray-800"
                  />
                </div>
              </div>

              <div className="space-y-3 p-3.5 bg-gray-50/50 border border-gray-150 rounded-xl">
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 uppercase mb-1 flex items-center justify-between">
                    <span>Add Setting Reference Keys</span>
                    <span className="text-[10px] text-indigo-500 font-bold lowercase">supports quick typing & commas</span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="admin-input-setting-references-add"
                      type="text"
                      placeholder="e.g. S-GRE-300-16"
                      value={newRefInput}
                      onChange={(e) => setNewRefInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddDirectRefKey(newRefInput);
                        }
                      }}
                      className="flex-1 bg-white border border-gray-200 rounded-lg text-xs p-2 focus:border-indigo-500 focus:outline-none transition font-mono text-gray-800"
                    />
                    <button
                      type="button"
                      onClick={() => handleAddDirectRefKey(newRefInput)}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-3 py-2 rounded-lg transition shadow-3xs flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add Key
                    </button>
                  </div>
                  <p className="text-[9px] text-gray-400 mt-1">Press Enter or click "Add Key" to insert. Separate multiple keys with commas if desired.</p>
                </div>

                {/* Active References list as clean tag array */}
                <div className="space-y-2 pt-1 border-t border-gray-100">
                  <span className="text-[10px] font-bold text-gray-450 uppercase tracking-wider block">Project Reference Keys ({formSettingRefDetails.length})</span>
                  {formSettingRefDetails.length === 0 ? (
                    <div className="text-[11px] text-gray-400 italic">No references added yet. Add at least one above to assign parameters and targets.</div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {formSettingRefDetails.map((det) => (
                        <div
                          key={det.settingReference}
                          className="inline-flex items-center gap-1.5 bg-indigo-50 border border-indigo-120 text-indigo-805 text-[11px] font-mono font-black pl-2.5 pr-1 py-1 rounded-lg shadow-3xs"
                        >
                          <span>{det.settingReference}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveDirectRefKey(det.settingReference)}
                            className="w-4 h-4 rounded-full hover:bg-rose-50 hover:text-rose-650 flex items-center justify-center transition text-gray-400 cursor-pointer"
                            title={`Remove ${det.settingReference}`}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Comprehensive Sub-form for configuring parameters for each setting reference key */}
              {formSettingRefDetails.length > 0 && (
                <div className="bg-indigo-50/20 p-4 rounded-xl border border-indigo-100/60 space-y-4">
                  <h5 className="text-[11px] font-extrabold text-indigo-700 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-600"></span>
                    Project & Setting Reference Lists Specification Parameters
                  </h5>
                  
                  <div className="space-y-4">
                    {formSettingRefDetails.map((detail, index) => (
                      <div key={detail.settingReference} className="p-4 bg-white rounded-xl border border-indigo-150 space-y-4 shadow-2xs">
                        <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-black text-indigo-900 bg-indigo-50 border border-indigo-200 px-3 py-1 rounded-md shadow-2xs">
                              {detail.settingReference}
                            </span>
                          </div>
                          <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Reference Item #{index + 1}</span>
                        </div>

                        {/* 2 - Pipe Class: 2-1 nominal diameter - nominal pressure - nominal stiffness */}
                        <div className="bg-indigo-50/30 p-3 rounded-lg border border-indigo-100/80 space-y-2">
                          <span className="text-[10px] font-extrabold text-indigo-800 uppercase tracking-wider block">
                            2 - Pipe Class
                          </span>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                            <div>
                              <label className="block text-[9px] font-bold text-gray-600 uppercase mb-0.5">
                                Nominal Diameter (DN - mm)
                              </label>
                              <input
                                type="text"
                                placeholder="e.g. 300"
                                value={detail.pipeClass?.nominalDiameter ?? ""}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setFormSettingRefDetails(prev => prev.map((item, idx) => idx === index ? { ...item, pipeClass: { ...item.pipeClass, nominalDiameter: val } } : item));
                                }}
                                className="w-full bg-white border border-gray-200 rounded-md text-xs px-2 py-1 focus:border-indigo-500 focus:outline-none transition font-sans font-bold text-gray-800"
                              />
                            </div>
                            <div>
                              <label className="block text-[9px] font-bold text-gray-600 uppercase mb-0.5">
                                Nominal Pressure (PN - bar)
                              </label>
                              <input
                                type="text"
                                placeholder="e.g. 16"
                                value={detail.pipeClass?.nominalPressure ?? ""}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setFormSettingRefDetails(prev => prev.map((item, idx) => idx === index ? { ...item, pipeClass: { ...item.pipeClass, nominalPressure: val } } : item));
                                }}
                                className="w-full bg-white border border-gray-200 rounded-md text-xs px-2 py-1 focus:border-indigo-500 focus:outline-none transition font-sans font-bold text-gray-800"
                              />
                            </div>
                            <div>
                              <label className="block text-[9px] font-bold text-gray-600 uppercase mb-0.5">
                                Nominal Stiffness (SN - N/m²)
                              </label>
                              <input
                                type="text"
                                placeholder="e.g. 10000"
                                value={detail.pipeClass?.nominalStiffness ?? ""}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setFormSettingRefDetails(prev => prev.map((item, idx) => idx === index ? { ...item, pipeClass: { ...item.pipeClass, nominalStiffness: val } } : item));
                                }}
                                className="w-full bg-white border border-gray-200 rounded-md text-xs px-2 py-1 focus:border-indigo-500 focus:outline-none transition font-sans font-bold text-gray-800"
                              />
                            </div>
                          </div>
                        </div>

                        {/* 3 - Pipe Type & 4 - Junction Type */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[10px] font-bold text-gray-700 uppercase mb-1">
                              3 - Pipe Type
                            </label>
                            <select
                              value={detail.pipeType || "GRE"}
                              onChange={(e) => {
                                const val = e.target.value;
                                setFormSettingRefDetails(prev => prev.map((item, idx) => idx === index ? { ...item, pipeType: val } : item));
                              }}
                              className="w-full bg-white border border-gray-200 rounded-lg text-xs p-2 focus:border-indigo-500 focus:outline-none transition font-sans font-bold text-gray-800 cursor-pointer"
                            >
                              <option value="GRE">GRE</option>
                              <option value="GRV">GRV</option>
                              <option value="GRP">GRP</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-[10px] font-bold text-gray-700 uppercase mb-1">
                              4 - Junction Type
                            </label>
                            <select
                              value={detail.junctionType || "BELL/SPIGOT 1OR"}
                              onChange={(e) => {
                                const val = e.target.value;
                                const isSpigotNotDef = val === "PLAIN ENDS" || val === "BELL/PLAIN END";
                                const isBellNotDef = val === "PLAIN ENDS" || val === "SPIGOT/PLAIN END";
                                setFormSettingRefDetails(prev => prev.map((item, idx) => idx === index ? {
                                  ...item,
                                  junctionType: val,
                                  productParameters: {
                                    ...item.productParameters,
                                    spigotNotDefined: isSpigotNotDef,
                                    bellNotDefined: isBellNotDef
                                  }
                                } : item));
                              }}
                              className="w-full bg-white border border-gray-200 rounded-lg text-xs p-2 focus:border-indigo-500 focus:outline-none transition font-sans font-bold text-gray-800 cursor-pointer"
                            >
                              <option value="BELL/SPIGOT 1OR">BELL/SPIGOT 1OR</option>
                              <option value="BELL/SPIGOT 2OR">BELL/SPIGOT 2OR</option>
                              <option value="BELL/SPIGOT 2 OR 1 LK">BELL/SPIGOT 2 OR 1 LK</option>
                              <option value="BELL/SPIGOT 1 OR 2 LK">BELL/SPIGOT 1 OR 2 LK</option>
                              <option value="PLAIN ENDS">PLAIN ENDS</option>
                              <option value="BELL/PLAIN END">BELL/PLAIN END</option>
                              <option value="SPIGOT/PLAIN END">SPIGOT/PLAIN END</option>
                            </select>
                          </div>
                        </div>

                        {(() => {
                          const jType = detail.junctionType || "BELL/SPIGOT 1OR";
                          const isSpigotAutoNotDef = jType === "PLAIN ENDS" || jType === "BELL/PLAIN END";
                          const isBellAutoNotDef = jType === "PLAIN ENDS" || jType === "SPIGOT/PLAIN END";

                          const isSpigotNotDefined = detail.productParameters?.spigotNotDefined !== undefined
                            ? Boolean(detail.productParameters?.spigotNotDefined)
                            : isSpigotAutoNotDef;

                          const isBellNotDefined = detail.productParameters?.bellNotDefined !== undefined
                            ? Boolean(detail.productParameters?.bellNotDefined)
                            : isBellAutoNotDef;

                          return (
                            <>
                              {/* 5 - Product Parameters */}
                              <div className="bg-emerald-50/20 p-3 rounded-lg border border-emerald-100/80 space-y-3">
                                <span className="text-[10px] font-extrabold text-emerald-800 uppercase tracking-wider block">
                                  5 - Product Parameters
                                </span>

                                {/* 5-1 Length, 5-2 Thickness, 5-3 Weight */}
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                                  {[
                                    { key: "length", paramKey: "pipeLength", label: "5-1 Length (mm)", placeholder: "e.g. 12000" },
                                    { key: "thickness", paramKey: "pipeThickness", label: "5-2 Thickness (mm)", placeholder: "e.g. 12.5" },
                                    { key: "weight", paramKey: "pipeWeight", label: "5-3 Weight (kg)", placeholder: "e.g. 145" }
                                  ].map(({ key, paramKey, label, placeholder }) => {
                                    const val = (detail.productParameters as any)?.[key] ?? "";
                                    const isND = val === "N/A" || val === "ND" || isParamND(detail, paramKey);
                                    return (
                                      <div key={key}>
                                        <div className="flex items-center justify-between mb-0.5">
                                          <label className="block text-[9px] font-bold text-gray-600 uppercase">
                                            {label}
                                          </label>
                                          <button
                                            type="button"
                                            onClick={() => toggleParamAndSpecND(index, paramKey)}
                                            className={`text-[8px] font-extrabold px-1 py-0.2 rounded transition cursor-pointer ${
                                              isND ? "bg-amber-500 text-white" : "bg-gray-100 hover:bg-gray-200 text-gray-600"
                                            }`}
                                            title="Toggle N/A for Parameter and Specification Limits"
                                          >
                                            N/A
                                          </button>
                                        </div>
                                        <input
                                          type="text"
                                          placeholder={placeholder}
                                          value={val}
                                          onChange={(e) => {
                                            const v = e.target.value;
                                            setFormSettingRefDetails(prev => prev.map((item, idx) => idx === index ? {
                                              ...item,
                                              productParameters: { ...item.productParameters, [key]: v }
                                            } : item));
                                          }}
                                          className={`w-full border rounded-md text-xs px-2 py-1 focus:border-indigo-500 focus:outline-none transition font-sans ${
                                            isND ? "bg-amber-50 border-amber-300 text-amber-900 font-bold" : "bg-white border-gray-200 text-gray-800"
                                          }`}
                                        />
                                      </div>
                                    );
                                  })}
                                </div>

                                {/* 5-4 Spigot Detail */}
                                <div className="space-y-1.5 pt-1 border-t border-emerald-100">
                                  <div className="flex items-center justify-between">
                                    <span className="text-[9px] font-bold text-emerald-700 uppercase tracking-wider block">
                                      5-4 Spigot Detail (SA - SB - SC - SD - SE - SF - Ø2S - Ø3S - Ø4S - SG)
                                    </span>
                                    <label className="inline-flex items-center gap-1 cursor-pointer bg-white border border-emerald-200 px-2 py-0.5 rounded text-[9px] font-bold text-emerald-800 hover:bg-emerald-50 transition">
                                      <input
                                        type="checkbox"
                                        checked={isSpigotNotDefined}
                                        onChange={(e) => {
                                          const checked = e.target.checked;
                                          setFormSettingRefDetails(prev => prev.map((item, idx) => idx === index ? {
                                            ...item,
                                            productParameters: {
                                              ...item.productParameters,
                                              spigotNotDefined: checked
                                            }
                                          } : item));
                                        }}
                                        className="w-3 h-3 text-emerald-600 rounded cursor-pointer"
                                      />
                                      <span>Not Defined (N/A)</span>
                                    </label>
                                  </div>

                                  {isSpigotNotDefined ? (
                                    <div className="bg-emerald-50/80 border border-emerald-200 p-2 rounded text-[10px] text-emerald-700 font-bold text-center">
                                      Spigot Details are NOT DEFINED {isSpigotAutoNotDef ? `(Default for Junction: ${jType})` : "(Selected as Not Defined)"}
                                    </div>
                                  ) : (
                                    <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5">
                                      {["sa", "sb", "sc", "sd", "se", "sf", "o2s", "o3s", "o4s", "sg"].map((key) => {
                                        const labelMap: Record<string, string> = { o2s: "Ø2S", o3s: "Ø3S", o4s: "Ø4S" };
                                        const displayLabel = labelMap[key] || key.toUpperCase();
                                        const spigotObj = (detail.productParameters?.spigotDetail || {}) as any;
                                        const val = spigotObj[key] ?? "";
                                        const isND = val === "N/A" || val === "ND";

                                        return (
                                          <div key={key} className="flex flex-col">
                                            <div className="flex items-center justify-between mb-0.5">
                                              <label className="block text-[8px] font-bold text-gray-500 uppercase">
                                                {displayLabel}
                                              </label>
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  const newVal = isND ? "" : "N/A";
                                                  setFormSettingRefDetails(prev => prev.map((item, idx) => {
                                                    if (idx !== index) return item;
                                                    const existingSpigot = item.productParameters?.spigotDetail || {};
                                                    return {
                                                      ...item,
                                                      productParameters: {
                                                        ...item.productParameters,
                                                        spigotDetail: { ...existingSpigot, [key]: newVal }
                                                      }
                                                    };
                                                  }));
                                                }}
                                                className={`text-[7px] font-black px-0.5 py-0.2 rounded transition cursor-pointer ${
                                                  isND ? "bg-amber-500 text-white" : "bg-gray-100 hover:bg-gray-200 text-gray-500"
                                                }`}
                                                title={`Mark ${displayLabel} as N/A`}
                                              >
                                                N/A
                                              </button>
                                            </div>
                                            <input
                                              type="text"
                                              placeholder="mm"
                                              value={val}
                                              onChange={(e) => {
                                                const inputVal = e.target.value;
                                                setFormSettingRefDetails(prev => prev.map((item, idx) => {
                                                  if (idx !== index) return item;
                                                  const existingSpigot = item.productParameters?.spigotDetail || {};
                                                  return {
                                                    ...item,
                                                    productParameters: {
                                                      ...item.productParameters,
                                                      spigotDetail: { ...existingSpigot, [key]: inputVal }
                                                    }
                                                  };
                                                }));
                                              }}
                                              className={`w-full border rounded text-[10px] p-1 text-center focus:border-indigo-500 focus:outline-none font-mono ${
                                                isND ? "bg-amber-50 border-amber-300 text-amber-900 font-bold" : "bg-white border-gray-200 text-gray-800"
                                              }`}
                                            />
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>

                                {/* 5-5 Bell Detail */}
                                <div className="space-y-1.5 pt-1 border-t border-emerald-100">
                                  <div className="flex items-center justify-between">
                                    <span className="text-[9px] font-bold text-emerald-700 uppercase tracking-wider block">
                                      5-5 Bell Detail (BA - BB - BC - BD - BE - BG - Ø2B)
                                    </span>
                                    <label className="inline-flex items-center gap-1 cursor-pointer bg-white border border-emerald-200 px-2 py-0.5 rounded text-[9px] font-bold text-emerald-800 hover:bg-emerald-50 transition">
                                      <input
                                        type="checkbox"
                                        checked={isBellNotDefined}
                                        onChange={(e) => {
                                          const checked = e.target.checked;
                                          setFormSettingRefDetails(prev => prev.map((item, idx) => idx === index ? {
                                            ...item,
                                            productParameters: {
                                              ...item.productParameters,
                                              bellNotDefined: checked
                                            }
                                          } : item));
                                        }}
                                        className="w-3 h-3 text-emerald-600 rounded cursor-pointer"
                                      />
                                      <span>Not Defined (N/A)</span>
                                    </label>
                                  </div>

                                  {isBellNotDefined ? (
                                    <div className="bg-emerald-50/80 border border-emerald-200 p-2 rounded text-[10px] text-emerald-700 font-bold text-center">
                                      Bell Details are NOT DEFINED {isBellAutoNotDef ? `(Default for Junction: ${jType})` : "(Selected as Not Defined)"}
                                    </div>
                                  ) : (
                                    <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
                                      {["ba", "bb", "bc", "bd", "be", "bg", "o2b"].map((key) => {
                                        const displayLabel = key === "o2b" ? "Ø2B" : key.toUpperCase();
                                        const bellObj = (detail.productParameters?.bellDetail || {}) as any;
                                        const val = bellObj[key] ?? "";
                                        const isND = val === "N/A" || val === "ND";

                                        return (
                                          <div key={key} className="flex flex-col">
                                            <div className="flex items-center justify-between mb-0.5">
                                              <label className="block text-[8px] font-bold text-gray-500 uppercase">
                                                {displayLabel}
                                              </label>
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  const newVal = isND ? "" : "N/A";
                                                  setFormSettingRefDetails(prev => prev.map((item, idx) => {
                                                    if (idx !== index) return item;
                                                    const existingBell = item.productParameters?.bellDetail || {};
                                                    return {
                                                      ...item,
                                                      productParameters: {
                                                        ...item.productParameters,
                                                        bellDetail: { ...existingBell, [key]: newVal }
                                                      }
                                                    };
                                                  }));
                                                }}
                                                className={`text-[7px] font-black px-0.5 py-0.2 rounded transition cursor-pointer ${
                                                  isND ? "bg-amber-500 text-white" : "bg-gray-100 hover:bg-gray-200 text-gray-500"
                                                }`}
                                                title={`Mark ${displayLabel} as N/A`}
                                              >
                                                N/A
                                              </button>
                                            </div>
                                            <input
                                              type="text"
                                              placeholder="mm"
                                              value={val}
                                              onChange={(e) => {
                                                const inputVal = e.target.value;
                                                setFormSettingRefDetails(prev => prev.map((item, idx) => {
                                                  if (idx !== index) return item;
                                                  const existingBell = item.productParameters?.bellDetail || {};
                                                  return {
                                                    ...item,
                                                    productParameters: {
                                                      ...item.productParameters,
                                                      bellDetail: { ...existingBell, [key]: inputVal }
                                                    }
                                                  };
                                                }));
                                              }}
                                              className={`w-full border rounded text-[10px] p-1 text-center focus:border-indigo-500 focus:outline-none font-mono ${
                                                isND ? "bg-amber-50 border-amber-300 text-amber-900 font-bold" : "bg-white border-gray-200 text-gray-800"
                                              }`}
                                            />
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* 6 - Specification Limits Data (Dimensional Tolerances) */}
                              <div className="bg-amber-50/40 p-3 rounded-lg border border-amber-200/80 space-y-3">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-extrabold text-amber-900 uppercase tracking-wider block">
                                    6 - Specification Limits Data (Min / Max Tolerances)
                                  </span>
                                  <span className="text-[9px] text-amber-700 font-bold bg-amber-100 px-2 py-0.5 rounded">
                                    Auto-validated in Steps 6, 7 & 8
                                  </span>
                                </div>

                                {/* 6-1 Product Specification Limits */}
                                <div className="space-y-1.5">
                                  <span className="text-[9px] font-bold text-amber-800 uppercase tracking-wider block">
                                    6-1 Product Limits (Length, Thickness, Weight)
                                  </span>
                                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                    {[
                                      { paramKey: "pipeLength", label: "Length (mm)", placeholderMin: "Min (e.g. 11950)", placeholderMax: "Max (e.g. 12050)" },
                                      { paramKey: "pipeThickness", label: "Thickness (mm)", placeholderMin: "Min (e.g. 12.0)", placeholderMax: "Max (e.g. 13.5)" },
                                      { paramKey: "pipeWeight", label: "Weight (kg)", placeholderMin: "Min (e.g. 140)", placeholderMax: "Max (e.g. 155)" }
                                    ].map(({ paramKey, label, placeholderMin, placeholderMax }) => {
                                      const isND = isParamND(detail, paramKey);
                                      return (
                                        <div key={paramKey} className="bg-white/80 p-1.5 rounded border border-amber-200 flex flex-col justify-between">
                                          <div className="flex items-center justify-between mb-1">
                                            <label className="block text-[8px] font-bold text-gray-700 uppercase">
                                              {label} Limits
                                            </label>
                                            <button
                                              type="button"
                                              onClick={() => toggleParamAndSpecND(index, paramKey)}
                                              className={`text-[7px] font-black px-1 py-0.2 rounded transition cursor-pointer ${
                                                isND ? "bg-amber-500 text-white" : "bg-gray-100 hover:bg-gray-200 text-gray-600"
                                              }`}
                                              title="Toggle N/A for Parameter and Specification Limits"
                                            >
                                              N/A
                                            </button>
                                          </div>
                                          {isND ? (
                                            <div className="bg-amber-100/80 border border-amber-300 text-amber-900 font-bold text-[9px] p-1 text-center rounded">
                                              N/A (Not Defined)
                                            </div>
                                          ) : (
                                            <div className="flex gap-1">
                                              <input
                                                type="text"
                                                placeholder={placeholderMin}
                                                value={getSpecLimitVal(detail, paramKey, "min")}
                                                onChange={(e) => updateSpecLimit(index, paramKey, "min", e.target.value)}
                                                className="w-1/2 bg-white border border-gray-250 rounded text-[10px] px-1.5 py-1 focus:border-amber-500 focus:outline-none font-mono text-gray-800"
                                              />
                                              <input
                                                type="text"
                                                placeholder={placeholderMax}
                                                value={getSpecLimitVal(detail, paramKey, "max")}
                                                onChange={(e) => updateSpecLimit(index, paramKey, "max", e.target.value)}
                                                className="w-1/2 bg-white border border-gray-250 rounded text-[10px] px-1.5 py-1 focus:border-amber-500 focus:outline-none font-mono text-gray-800"
                                              />
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>

                                {/* 6-2 Spigot Details Specification Limits */}
                                <div className="space-y-1.5 pt-1 border-t border-amber-200/60">
                                  <div className="flex items-center justify-between">
                                    <span className="text-[9px] font-bold text-amber-800 uppercase tracking-wider block">
                                      6-2 Spigot Details Specification Limits (Min / Max in mm)
                                    </span>
                                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded ${isSpigotNotDefined ? "bg-amber-200 text-amber-900" : "bg-amber-100 text-amber-800"}`}>
                                      {isSpigotNotDefined ? "NOT DEFINED (N/A)" : "Active"}
                                    </span>
                                  </div>

                                  {isSpigotNotDefined ? (
                                    <div className="bg-amber-100/60 border border-amber-200 p-1.5 rounded text-[9px] text-amber-900 font-medium text-center italic">
                                      Spigot Specification Limits are Not Defined / Not Applicable.
                                    </div>
                                  ) : (
                                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                                      {[
                                        { key: "sa", label: "SA" },
                                        { key: "sb", label: "SB" },
                                        { key: "sc", label: "SC" },
                                        { key: "sd", label: "SD" },
                                        { key: "se", label: "SE" },
                                        { key: "sf", label: "SF" },
                                        { key: "o2s", label: "Ø2S" },
                                        { key: "o3s", label: "Ø3S" },
                                        { key: "o4s", label: "Ø4S" },
                                        { key: "sg", label: "SG" }
                                      ].map(({ key, label }) => {
                                        const isND = isParamND(detail, key);
                                        return (
                                          <div key={key} className="bg-white/80 p-1 rounded border border-amber-200 flex flex-col justify-between">
                                            <div className="flex items-center justify-between mb-0.5">
                                              <label className="block text-[8px] font-bold text-gray-700 uppercase">
                                                {label} Limits
                                              </label>
                                              <button
                                                type="button"
                                                onClick={() => toggleParamAndSpecND(index, key)}
                                                className={`text-[7px] font-black px-0.5 py-0.2 rounded transition cursor-pointer ${
                                                  isND ? "bg-amber-500 text-white" : "bg-gray-100 hover:bg-gray-200 text-gray-500"
                                                }`}
                                                title={`Toggle N/A for ${label}`}
                                              >
                                                N/A
                                              </button>
                                            </div>
                                            {isND ? (
                                              <div className="bg-amber-100/80 border border-amber-300 text-amber-900 font-bold text-[8px] p-0.5 text-center rounded">
                                                N/A
                                              </div>
                                            ) : (
                                              <div className="flex gap-0.5">
                                                <input
                                                  type="text"
                                                  placeholder="Min"
                                                  value={getSpecLimitVal(detail, key, "min")}
                                                  onChange={(e) => updateSpecLimit(index, key, "min", e.target.value)}
                                                  className="w-1/2 bg-white border border-gray-200 rounded text-[9px] p-0.5 text-center focus:border-amber-500 focus:outline-none font-mono text-gray-800"
                                                />
                                                <input
                                                  type="text"
                                                  placeholder="Max"
                                                  value={getSpecLimitVal(detail, key, "max")}
                                                  onChange={(e) => updateSpecLimit(index, key, "max", e.target.value)}
                                                  className="w-1/2 bg-white border border-gray-200 rounded text-[9px] p-0.5 text-center focus:border-amber-500 focus:outline-none font-mono text-gray-800"
                                                />
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>

                                {/* 6-3 Bell Details Specification Limits */}
                                <div className="space-y-1.5 pt-1 border-t border-amber-200/60">
                                  <div className="flex items-center justify-between">
                                    <span className="text-[9px] font-bold text-amber-800 uppercase tracking-wider block">
                                      6-3 Bell Details Specification Limits (Min / Max in mm)
                                    </span>
                                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded ${isBellNotDefined ? "bg-amber-200 text-amber-900" : "bg-amber-100 text-amber-800"}`}>
                                      {isBellNotDefined ? "NOT DEFINED (N/A)" : "Active"}
                                    </span>
                                  </div>

                                  {isBellNotDefined ? (
                                    <div className="bg-amber-100/60 border border-amber-200 p-1.5 rounded text-[9px] text-amber-900 font-medium text-center italic">
                                      Bell Specification Limits are Not Defined / Not Applicable.
                                    </div>
                                  ) : (
                                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-1.5">
                                      {[
                                        { key: "ba", label: "BA" },
                                        { key: "bb", label: "BB" },
                                        { key: "bc", label: "BC" },
                                        { key: "bd", label: "BD" },
                                        { key: "be", label: "BE" },
                                        { key: "bg", label: "BG" },
                                        { key: "o2b", label: "Ø2B" }
                                      ].map(({ key, label }) => {
                                        const isND = isParamND(detail, key);
                                        return (
                                          <div key={key} className="bg-white/80 p-1 rounded border border-amber-200 flex flex-col justify-between">
                                            <div className="flex items-center justify-between mb-0.5">
                                              <label className="block text-[8px] font-bold text-gray-700 uppercase">
                                                {label} Limits
                                              </label>
                                              <button
                                                type="button"
                                                onClick={() => toggleParamAndSpecND(index, key)}
                                                className={`text-[7px] font-black px-0.5 py-0.2 rounded transition cursor-pointer ${
                                                  isND ? "bg-amber-500 text-white" : "bg-gray-100 hover:bg-gray-200 text-gray-500"
                                                }`}
                                                title={`Toggle N/A for ${label}`}
                                              >
                                                N/A
                                              </button>
                                            </div>
                                            {isND ? (
                                              <div className="bg-amber-100/80 border border-amber-300 text-amber-900 font-bold text-[8px] p-0.5 text-center rounded">
                                                N/A
                                              </div>
                                            ) : (
                                              <div className="flex gap-0.5">
                                                <input
                                                  type="text"
                                                  placeholder="Min"
                                                  value={getSpecLimitVal(detail, key, "min")}
                                                  onChange={(e) => updateSpecLimit(index, key, "min", e.target.value)}
                                                  className="w-1/2 bg-white border border-gray-200 rounded text-[9px] p-0.5 text-center focus:border-amber-500 focus:outline-none font-mono text-gray-800"
                                                />
                                                <input
                                                  type="text"
                                                  placeholder="Max"
                                                  value={getSpecLimitVal(detail, key, "max")}
                                                  onChange={(e) => updateSpecLimit(index, key, "max", e.target.value)}
                                                  className="w-1/2 bg-white border border-gray-200 rounded text-[9px] p-0.5 text-center focus:border-amber-500 focus:outline-none font-mono text-gray-800"
                                                />
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </>
                          );
                        })()}

                        {/* Quantity Allocation & Dates */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-gray-100">
                          <div>
                            <label className="block text-[10px] font-bold text-gray-600 uppercase mb-1">
                              Volume Target (Meters)
                            </label>
                            <input
                              type="number"
                              min="1"
                              required
                              placeholder="500"
                              value={detail.targetQuantityMeters}
                              onChange={(e) => {
                                const val = Number(e.target.value) || 0;
                                setFormSettingRefDetails(prev => prev.map((item, idx) => idx === index ? { ...item, targetQuantityMeters: val } : item));
                              }}
                              className="w-full bg-white border border-gray-200 rounded-lg text-xs px-2.5 py-1.5 focus:border-indigo-500 focus:outline-none transition font-sans text-gray-800 font-bold"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-bold text-gray-600 uppercase mb-1">
                              Production Starts
                            </label>
                            <input
                              type="datetime-local"
                              required
                              value={detail.productionStartDate}
                              onChange={(e) => {
                                const val = e.target.value;
                                setFormSettingRefDetails(prev => prev.map((item, idx) => idx === index ? { ...item, productionStartDate: val } : item));
                              }}
                              className="w-full bg-white border border-gray-200 rounded-lg text-xs px-2.5 py-1.5 focus:border-indigo-500 focus:outline-none transition font-sans text-gray-800"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-bold text-gray-600 uppercase mb-1">
                              Timeline Ends
                            </label>
                            <input
                              type="datetime-local"
                              required
                              value={detail.productionEndDate}
                              onChange={(e) => {
                                const val = e.target.value;
                                setFormSettingRefDetails(prev => prev.map((item, idx) => idx === index ? { ...item, productionEndDate: val } : item));
                              }}
                              className="w-full bg-white border border-gray-200 rounded-lg text-xs px-2.5 py-1.5 focus:border-indigo-500 focus:outline-none transition font-sans text-gray-800"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="text-[10px] text-gray-500 bg-indigo-50 p-2.5 rounded-lg text-right font-medium flex items-center justify-between border border-indigo-100">
                    <span className="text-gray-400 italic">Summed target across setting references overrides fallback allocation.</span>
                    <span className="text-gray-700">Total Project Allocation: <strong className="text-indigo-700 text-xs font-extrabold">{formSettingRefDetails.reduce((sum, d) => sum + (Number(d.targetQuantityMeters) || 0), 0)} m</strong></span>
                  </div>
                </div>
              )}

              <div className="pt-2 border-t border-dashed border-indigo-100/60">
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-2">Project Fallback Details (Used if indiv. references empty)</span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-gray-750 uppercase mb-1">
                      Fallback Quantity (Meters)
                    </label>
                    <input
                      type="number"
                      min="1"
                      required
                      placeholder="e.g. 1000"
                      value={formTargetQuantityMeters}
                      onChange={(e) => setFormTargetQuantityMeters(Number(e.target.value))}
                      className="w-full bg-white border border-gray-200 rounded-lg text-xs p-2 focus:border-indigo-500 focus:outline-none transition font-sans text-gray-800 font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-gray-755 uppercase mb-1">
                      Fallback Start Production
                    </label>
                    <input
                      type="datetime-local"
                      required
                      value={formProductionStartDate}
                      onChange={(e) => setFormProductionStartDate(e.target.value)}
                      className="w-full bg-white border border-gray-200 rounded-lg text-xs p-1.5 focus:border-indigo-500 focus:outline-none transition font-sans text-gray-800"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-gray-755 uppercase mb-1">
                      Fallback Timeline Ends
                    </label>
                    <input
                      type="datetime-local"
                      required
                      value={formProductionEndDate}
                      onChange={(e) => setFormProductionEndDate(e.target.value)}
                      className="w-full bg-white border border-gray-200 rounded-lg text-xs p-1.5 focus:border-indigo-500 focus:outline-none transition font-sans text-gray-800"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-indigo-150">
                <button
                  id="admin-btn-cancel-project"
                  type="button"
                  onClick={() => setEditingProjectId(null)}
                  className="bg-gray-150 hover:bg-gray-200 text-gray-700 text-xs font-bold px-3 py-1.5 rounded-lg transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  id="admin-btn-save-project"
                  type="button"
                  onClick={() => handleSaveProject()}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-1.5 rounded-lg transition shadow-xs cursor-pointer"
                >
                  Save Project Code
                </button>
              </div>
            </div>
          ) : null}

          {/* List of Pre-defined Projects */}
          {projects.length === 0 ? (
            <p className="text-xs text-gray-400 py-3 text-center">No pre-defined projects yet. Add one above to lock dropdown values.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {projects.map((p) => (
                <div
                  key={p.id}
                  className="p-4 rounded-xl border border-gray-250/70 bg-gray-50/50 hover:bg-indigo-50/10 transition relative group"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2">
                        <h5 className="font-extrabold text-sm text-gray-900 tracking-tight">
                          {p.projectCode}
                        </h5>
                        {p.client && (
                          <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-150 px-2 py-0.5 rounded-md">
                            Client: {p.client}
                          </span>
                        )}
                      </div>

                      <span className="block text-[10px] text-gray-400 uppercase font-bold tracking-wider mt-2">
                        Pre-defined Reference List ({p.settingReferences.length}):
                      </span>

                      <div className="space-y-2 mt-1.5">
                        {p.settingReferences.map((ref) => {
                          const det = p.settingRefDetails?.find(d => d.settingReference.toUpperCase() === ref.toUpperCase());
                          return (
                            <div key={ref} className="bg-indigo-50/70 border border-indigo-120 p-2.5 rounded-lg text-[10px] space-y-1 shadow-2xs">
                              <div className="flex items-center justify-between border-b border-indigo-100 pb-1">
                                <span className="font-mono font-black text-indigo-900 text-[11px]">{ref}</span>
                                {det?.client && <span className="text-[9px] font-bold text-gray-600">Client: {det.client}</span>}
                              </div>

                              {det && (
                                <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[9px] text-gray-650 pt-0.5">
                                  {det.pipeClass && (det.pipeClass.nominalDiameter || det.pipeClass.nominalPressure || det.pipeClass.nominalStiffness) && (
                                    <div>
                                      <strong className="text-gray-800">Class:</strong> DN{det.pipeClass.nominalDiameter || "-"} / PN{det.pipeClass.nominalPressure || "-"} / SN{det.pipeClass.nominalStiffness || "-"}
                                    </div>
                                  )}
                                  {det.pipeType && (
                                    <div>
                                      <strong className="text-gray-800">Type:</strong> <span className="text-indigo-700 font-bold">{det.pipeType}</span>
                                    </div>
                                  )}
                                  {det.junctionType && (
                                    <div>
                                      <strong className="text-gray-800">Junction:</strong> {det.junctionType}
                                    </div>
                                  )}
                                  {det.productParameters && (det.productParameters.length || det.productParameters.thickness || det.productParameters.weight) && (
                                    <div>
                                      <strong className="text-gray-800">Params:</strong> L:{det.productParameters.length || "-"}mm | T:{det.productParameters.thickness || "-"}mm | W:{det.productParameters.weight || "-"}kg
                                    </div>
                                  )}
                                </div>
                              )}

                              {det && (
                                <div className="text-[9px] text-indigo-700 font-sans pt-0.5 border-t border-indigo-100/60 flex justify-between">
                                  <span>Allocation Target: <strong className="text-indigo-900 font-black">{det.targetQuantityMeters ?? 500}m</strong></span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      <div className="mt-3 pt-2 border-t border-gray-150 text-[11px] text-gray-550 space-y-1 bg-white p-2 rounded-lg border border-gray-100">
                        <div>
                          <span className="font-bold text-gray-705">Total Project Volume:</span>{" "}
                          <span className="font-extrabold text-indigo-650">{p.targetQuantityMeters ?? "N/A"} meters</span>
                        </div>
                        {p.productionStartDate && (
                          <div className="text-[10px] text-gray-400">
                            <span className="font-bold text-gray-700">Default Timeline:</span>{" "}
                            {new Date(p.productionStartDate).toLocaleDateString()} {new Date(p.productionStartDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            {" → "}
                            {p.productionEndDate ? (
                              <>
                                {new Date(p.productionEndDate).toLocaleDateString()} {new Date(p.productionEndDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </>
                            ) : "Not Set"}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1.5 opacity-80 group-hover:opacity-100 transition">
                      <button
                        id={`admin-btn-edit-project-${p.id}`}
                        onClick={() => handleEditProject(p)}
                        className="bg-white border border-gray-150 hover:border-indigo-400 hover:text-indigo-600 p-1.5 rounded-lg text-gray-500 transition cursor-pointer opacity-70 hover:opacity-100"
                        title="Edit Project Configuration"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        id={`admin-btn-delete-project-${p.id}`}
                        onClick={() => handleDeleteProject(p.id, p.projectCode)}
                        className="bg-white border border-gray-150 hover:border-red-400 hover:text-red-600 p-1.5 rounded-lg text-gray-500 transition cursor-pointer opacity-70 hover:opacity-100"
                        title="Delete Project Configuration"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}



    </div>
  );
}

export default React.memo(AccountPanel);
