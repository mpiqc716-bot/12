import React, { useState, useEffect } from "react";
import { 
  Settings, 
  Plus, 
  Edit3, 
  Trash2, 
  X, 
  CheckCircle, 
  ShieldCheck, 
  Layers, 
  FileText, 
  Sliders, 
  Search,
  ChevronDown,
  ChevronUp,
  Info,
  Calendar,
  Box,
  Database,
  Tag
} from "lucide-react";
import { User, ToleranceConfig, ProjectConfig, ProjectSettingReferenceData } from "../types";

interface ProjectReferenceModuleProps {
  currentUser: User | null;
  projects: ProjectConfig[];
  onRefreshProjects: () => Promise<void>;
  tolerances: ToleranceConfig[];
  onRefreshTolerances: () => Promise<void>;
}

function ProjectReferenceModule({
  currentUser,
  projects,
  onRefreshProjects,
  tolerances,
  onRefreshTolerances
}: ProjectReferenceModuleProps) {
  const isAdmin = currentUser?.role === "admin";

  // Form & Editing States
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [formProjectCode, setFormProjectCode] = useState("");
  const [formClient, setFormClient] = useState("");
  const [formSettingReferencesList, setFormSettingReferencesList] = useState("");
  const [formTargetQuantityMeters, setFormTargetQuantityMeters] = useState<number>(1000);
  const [formProductionStartDate, setFormProductionStartDate] = useState("");
  const [formProductionEndDate, setFormProductionEndDate] = useState("");
  const [formSettingRefDetails, setFormSettingRefDetails] = useState<ProjectSettingReferenceData[]>([]);
  const [newRefInput, setNewRefInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);
  const [viewingProjectSpecs, setViewingProjectSpecs] = useState<ProjectConfig | null>(null);

  const getResolvedLimits = (det?: ProjectSettingReferenceData, projectCode?: string) => {
    if (det?.specificationLimits && Object.keys(det.specificationLimits).length > 0) {
      return det.specificationLimits;
    }
    if (!det || !projectCode) return {};
    const matchedTol = tolerances?.find(t => 
      (t.project === projectCode || t.project === "All Projects") && 
      (t.specification === det.settingReference || t.specification === "All Specifications")
    );
    if (!matchedTol) return {};
    return {
      barcolMinReq: matchedTol.barcolMinReq,
      sa: matchedTol.sa, sb: matchedTol.sb, sc: matchedTol.sc, sd: matchedTol.sd, se: matchedTol.se, sf: matchedTol.sf,
      o2s: matchedTol.o2s, o3s: matchedTol.o3s, o4s: matchedTol.o4s, sg: matchedTol.sg,
      pipeLength: matchedTol.pipeLength, pipeThickness: matchedTol.pipeThickness,
      o2b: matchedTol.o2b, ba: matchedTol.ba, bb: matchedTol.bb, bc: matchedTol.bc, bd: matchedTol.bd, be: matchedTol.be, bf: matchedTol.bf, bg: matchedTol.bg,
      pipeWeight: matchedTol.pipeWeight
    };
  };

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
      throw new Error("The API server returned an HTML page instead of JSON. Ensure database server is active.");
    }
    throw new Error(cleanText.substring(0, 150) || "Server returned non-JSON response");
  };

  const handleAddDirectRefKey = (rawKey: string) => {
    const keysText = rawKey.trim();
    if (!keysText) return;
    
    const parts = keysText.split(",").map(p => p.trim().toUpperCase()).filter(p => p.length > 0);
    
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
    const bellKeys = ["ba", "bb", "bc", "bd", "be", "bf", "bg", "o2b"];
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
        const bellKeys = ["ba", "bb", "bc", "bd", "be", "bf", "bg", "o2b"];
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
        const matchInExisting = existingDetails?.find(d => d.settingReference.toUpperCase() === key);
        
        const existingTol = tolerances?.find(t => 
          (t.project === formProjectCode || t.project === "All Projects") && 
          (t.specification === key || t.specification === "All Specifications")
        );

        const resolvedLimits = matchInExisting?.specificationLimits && Object.keys(matchInExisting.specificationLimits).length > 0
          ? matchInExisting.specificationLimits
          : (existingTol ? {
              barcolMinReq: existingTol.barcolMinReq || { min: 40, max: "ND" },
              sa: existingTol.sa, sb: existingTol.sb, sc: existingTol.sc, sd: existingTol.sd, se: existingTol.se, sf: existingTol.sf,
              o2s: existingTol.o2s, o3s: existingTol.o3s, o4s: existingTol.o4s, sg: existingTol.sg,
              pipeLength: existingTol.pipeLength, pipeThickness: existingTol.pipeThickness,
              o2b: existingTol.o2b, ba: existingTol.ba, bb: existingTol.bb, bc: existingTol.bc, bd: existingTol.bd, be: existingTol.be, bf: existingTol.bf, bg: existingTol.bg,
              pipeWeight: existingTol.pipeWeight
            } : { barcolMinReq: { min: 40, max: "ND" } });

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
              bellDetail: { ba: "", bb: "", bc: "", bd: "", be: "", bf: "", bg: "", o2b: "" }
            },
            specificationLimits: resolvedLimits
          };
        }

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
            bellDetail: { ba: "", bb: "", bc: "", bd: "", be: "", bf: "", bg: "", o2b: "" }
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

  const filteredProjects = projects.filter(p => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      p.projectCode.toLowerCase().includes(term) ||
      (p.client && p.client.toLowerCase().includes(term)) ||
      p.settingReferences.some(r => r.toLowerCase().includes(term))
    );
  });

  return (
    <div className="space-y-6 font-sans">
      
      {/* Module Banner Header */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-xs p-5 sm:p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2.5 bg-indigo-50 text-indigo-700 rounded-xl border border-indigo-100">
              <Settings className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h2 className="font-extrabold text-gray-900 text-lg uppercase tracking-wide flex items-center gap-2">
                Project & Setting Reference Lists
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Centralized specification matrix, product parameters, spigot & bell dimensional specifications & limits
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full md:w-auto">
          {/* Search Input */}
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5 pointer-events-none" />
            <input
              type="text"
              placeholder="Search projects or references..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-9 pr-3 py-2 text-xs font-medium focus:bg-white focus:border-indigo-500 outline-none transition"
            />
          </div>

          {isAdmin && (
            <button
              id="btn-add-project-config-module"
              type="button"
              onClick={() => handleCreateNewProject()}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4" />
              Add Project Code
            </button>
          )}
        </div>
      </div>

      {!isAdmin && (
        <div className="bg-blue-50 border border-blue-200 text-blue-900 text-xs p-3.5 rounded-xl flex items-center gap-2.5">
          <Info className="w-4 h-4 text-blue-600 shrink-0" />
          <span>
            <strong>Read-Only Mode:</strong> Operator credentials allow viewing and consulting all project parameters and specifications. Administrative rights are required to edit or add new project configurations.
          </span>
        </div>
      )}

      {/* Editing / Creating Form Container */}
      {editingProjectId && isAdmin && (
        <div className="bg-white rounded-2xl border-2 border-indigo-200 shadow-md p-5 sm:p-6 space-y-5 animate-fade-in">
          <div className="flex justify-between items-center border-b border-indigo-100 pb-3">
            <span className="text-sm font-extrabold text-indigo-900 uppercase tracking-wider flex items-center gap-2">
              <Box className="w-4.5 h-4.5 text-indigo-600" />
              {editingProjectId === "new" ? "Add New Pre-defined Project List" : "Edit Pre-defined Project List"}
            </span>
            <button
              type="button"
              onClick={() => setEditingProjectId(null)}
              className="text-gray-400 hover:text-gray-600 p-1 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-gray-700 uppercase mb-1">
                Project / Work Order Code
              </label>
              <input
                id="module-input-project-code"
                type="text"
                placeholder="e.g. WO-2026-001"
                value={formProjectCode}
                onChange={(e) => setFormProjectCode(e.target.value)}
                className="w-full bg-white border border-gray-200 rounded-lg text-xs p-2.5 focus:border-indigo-500 focus:outline-none transition font-sans font-bold text-gray-800"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-gray-700 uppercase mb-1">
                1 - The Client Name
              </label>
              <input
                id="module-input-project-client"
                type="text"
                placeholder="e.g. Saudi Aramco / SWCC / ADNOC"
                value={formClient}
                onChange={(e) => {
                  const val = e.target.value;
                  setFormClient(val);
                  setFormSettingRefDetails(prev => prev.map(item => ({ ...item, client: item.client || val })));
                }}
                className="w-full bg-white border border-gray-200 rounded-lg text-xs p-2.5 focus:border-indigo-500 focus:outline-none transition font-sans text-gray-800"
              />
            </div>
          </div>

          <div className="space-y-3 p-4 bg-gray-50/70 border border-gray-200 rounded-xl">
            <div>
              <label className="block text-[11px] font-bold text-gray-700 uppercase mb-1 flex items-center justify-between">
                <span>Add Setting Reference Keys</span>
                <span className="text-[10px] text-indigo-600 font-bold lowercase">supports typing & commas</span>
              </label>
              <div className="flex gap-2">
                <input
                  id="module-input-setting-references-add"
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
                  className="flex-1 bg-white border border-gray-200 rounded-lg text-xs p-2.5 focus:border-indigo-500 focus:outline-none transition font-mono text-gray-800"
                />
                <button
                  type="button"
                  onClick={() => handleAddDirectRefKey(newRefInput)}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2.5 rounded-lg transition shadow-xs flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Add Key
                </button>
              </div>
              <p className="text-[10px] text-gray-400 mt-1">Press Enter or click "Add Key" to insert. Separate multiple keys with commas if desired.</p>
            </div>

            {/* Active References list as clean tag array */}
            <div className="space-y-2 pt-1 border-t border-gray-200">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">
                Project Reference Keys ({formSettingRefDetails.length})
              </span>
              {formSettingRefDetails.length === 0 ? (
                <div className="text-xs text-gray-400 italic">No references added yet. Add at least one above to assign parameters and targets.</div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {formSettingRefDetails.map((det) => (
                    <div
                      key={det.settingReference}
                      className="inline-flex items-center gap-2 bg-indigo-50 border border-indigo-200 text-indigo-900 text-xs font-mono font-black pl-3 pr-1.5 py-1.5 rounded-lg shadow-2xs"
                    >
                      <span>{det.settingReference}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveDirectRefKey(det.settingReference)}
                        className="w-4 h-4 rounded-full hover:bg-rose-100 hover:text-rose-700 flex items-center justify-center transition text-gray-400 cursor-pointer"
                        title={`Remove ${det.settingReference}`}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sub-form for configuring parameters for each setting reference key */}
          {formSettingRefDetails.length > 0 && (
            <div className="bg-indigo-50/20 p-4 rounded-xl border border-indigo-100/80 space-y-4">
              <h5 className="text-xs font-extrabold text-indigo-800 uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-indigo-600"></span>
                Setting Reference Specifications & Dimensions Details
              </h5>
              
              <div className="space-y-5">
                {formSettingRefDetails.map((detail, index) => (
                  <div key={detail.settingReference} className="p-4 sm:p-5 bg-white rounded-xl border border-indigo-150 space-y-4 shadow-xs">
                    <div className="flex items-center justify-between border-b border-gray-100 pb-2.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-black text-indigo-900 bg-indigo-50 border border-indigo-200 px-3 py-1 rounded-md shadow-2xs">
                          {detail.settingReference}
                        </span>
                      </div>
                      <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Reference Item #{index + 1}</span>
                    </div>

                    {/* 2 - Pipe Class */}
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
                            className="w-full bg-white border border-gray-200 rounded-md text-xs px-2.5 py-1.5 focus:border-indigo-500 focus:outline-none transition font-sans font-bold text-gray-800"
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
                            className="w-full bg-white border border-gray-200 rounded-md text-xs px-2.5 py-1.5 focus:border-indigo-500 focus:outline-none transition font-sans font-bold text-gray-800"
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
                            className="w-full bg-white border border-gray-200 rounded-md text-xs px-2.5 py-1.5 focus:border-indigo-500 focus:outline-none transition font-sans font-bold text-gray-800"
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
                          <div className="bg-emerald-50/30 p-3.5 rounded-lg border border-emerald-100/80 space-y-3">
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
                                        className={`text-[8px] font-extrabold px-1.5 py-0.2 rounded transition cursor-pointer ${
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
                                <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
                                  {["ba", "bb", "bc", "bd", "be", "bf", "bg", "o2b"].map((key) => {
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

                          {/* 6 - Specification Limits Data */}
                          <div className="bg-amber-50/40 p-3.5 rounded-lg border border-amber-200/80 space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-extrabold text-amber-900 uppercase tracking-wider block">
                                6 - Specification Limits Data (Quality Controls & Tolerances)
                              </span>
                              <span className="text-[9px] text-amber-700 font-bold bg-amber-100 px-2 py-0.5 rounded">
                                Auto-validated in Steps 4, 6, 7 & 8
                              </span>
                            </div>

                            {/* 6-0 Step 4 Barcol Hardness Min Requirement */}
                            <div className="space-y-1 bg-emerald-50/60 p-2 rounded-md border border-emerald-200/80">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                                  <span className="text-[9px] font-extrabold text-emerald-950 uppercase tracking-wide">
                                    Step 4 Cure - Barcol Hardness Min Requirement (HBa) [Admin Determined]
                                  </span>
                                </div>
                                <span className="text-[8px] font-black bg-emerald-200 text-emerald-900 px-1.5 py-0.2 rounded uppercase">
                                  Admin Only
                                </span>
                              </div>
                              <div className="flex items-center justify-between gap-3 bg-white/90 p-1.5 rounded border border-emerald-200">
                                <span className="text-[9px] text-gray-650 font-medium">
                                  Min Barcol Hardness required during Step 4 Protocol & Evaluation:
                                </span>
                                <div className="flex items-center gap-1 shrink-0">
                                  <span className="text-[9px] font-bold text-gray-700">Min:</span>
                                  <input
                                    type="text"
                                    placeholder="40"
                                    value={getSpecLimitVal(detail, "barcolMinReq", "min") || "40"}
                                    onChange={(e) => updateSpecLimit(index, "barcolMinReq", "min", e.target.value)}
                                    className="w-16 bg-emerald-50 border border-emerald-300 rounded text-[10px] px-1.5 py-0.5 font-mono font-black text-emerald-950 text-center focus:border-emerald-600 focus:outline-none"
                                  />
                                  <span className="text-[9px] font-extrabold text-emerald-900">HBa</span>
                                </div>
                              </div>
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
                                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-1.5">
                                  {[
                                    { key: "ba", label: "BA" },
                                    { key: "bb", label: "BB" },
                                    { key: "bc", label: "BC" },
                                    { key: "bd", label: "BD" },
                                    { key: "be", label: "BE" },
                                    { key: "bf", label: "BF" },
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

          <div className="pt-2 border-t border-dashed border-indigo-150">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-2">Project Fallback Details (Used if indiv. references empty)</span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-gray-700 uppercase mb-1">
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
                <label className="block text-[11px] font-bold text-gray-700 uppercase mb-1">
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
                <label className="block text-[11px] font-bold text-gray-700 uppercase mb-1">
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

          <div className="flex justify-end gap-2 pt-3 border-t border-indigo-150">
            <button
              id="module-btn-cancel-project"
              type="button"
              onClick={() => setEditingProjectId(null)}
              className="bg-gray-150 hover:bg-gray-200 text-gray-700 text-xs font-bold px-4 py-2 rounded-lg transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              id="module-btn-save-project"
              type="button"
              onClick={() => handleSaveProject()}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-5 py-2 rounded-lg transition shadow-xs cursor-pointer"
            >
              Save Project Code
            </button>
          </div>
        </div>
      )}

      {/* List of Pre-defined Projects */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-xs p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <span className="text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
            <Database className="w-4 h-4 text-indigo-600" />
            Configured Projects ({filteredProjects.length})
          </span>
          {searchTerm && (
            <span className="text-[11px] text-indigo-600 font-semibold bg-indigo-50 px-2.5 py-0.5 rounded-full">
              Filtered by: "{searchTerm}"
            </span>
          )}
        </div>

        {filteredProjects.length === 0 ? (
          <div className="text-center text-xs text-gray-400 py-10">
            {searchTerm ? "No project codes match your search criteria." : "No pre-defined project reference lists configured yet. Click 'Add Project Code' above to create one."}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {filteredProjects.map((p) => {
              const isExpanded = expandedProjectId === p.id;
              return (
                <div
                  key={p.id}
                  className="p-5 rounded-2xl border border-gray-200 bg-gray-50/60 hover:bg-indigo-50/10 transition relative group shadow-2xs space-y-3"
                >
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="font-black text-base text-gray-900 tracking-tight">
                          {p.projectCode}
                        </h4>
                        {p.client && (
                          <span className="text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 rounded-md">
                            Client: {p.client}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-gray-500 flex flex-wrap gap-x-3 gap-y-1">
                        <span>Allocated Volume: <strong className="text-indigo-900 font-extrabold">{p.targetQuantityMeters ?? "N/A"} m</strong></span>
                        {p.productionStartDate && (
                          <span>
                            Start: <strong>{new Date(p.productionStartDate).toLocaleDateString()}</strong>
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setViewingProjectSpecs(p)}
                        className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 px-3 py-1.5 rounded-xl text-xs font-extrabold transition cursor-pointer shadow-3xs flex items-center gap-1.5"
                        title="View Full Specification Sheet"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">View Full Specs</span>
                        <span className="sm:hidden">Specs</span>
                      </button>

                      {isAdmin && (
                        <>
                          <button
                            id={`module-btn-edit-project-${p.id}`}
                            onClick={() => handleEditProject(p)}
                            className="bg-white border border-gray-200 hover:border-indigo-400 hover:text-indigo-600 p-2 rounded-xl text-gray-500 transition cursor-pointer shadow-3xs"
                            title="Edit Project Configuration"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            id={`module-btn-delete-project-${p.id}`}
                            onClick={() => handleDeleteProject(p.id, p.projectCode)}
                            className="bg-white border border-gray-200 hover:border-rose-400 hover:text-rose-600 p-2 rounded-xl text-gray-500 transition cursor-pointer shadow-3xs"
                            title="Delete Project Configuration"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => setExpandedProjectId(isExpanded ? null : p.id)}
                        className="bg-white border border-gray-200 hover:border-indigo-300 p-2 rounded-xl text-gray-600 transition cursor-pointer shadow-3xs flex items-center gap-1 text-xs font-bold"
                        title={isExpanded ? "Collapse Details" : "Expand Details"}
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* References Badges & Specifications Preview */}
                  <div className="space-y-2 pt-1 border-t border-gray-200/80">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                      Pre-defined Setting References ({p.settingReferences.length}):
                    </span>

                    <div className="space-y-2">
                      {p.settingReferences.map((ref) => {
                        const det = p.settingRefDetails?.find(d => d.settingReference.toUpperCase() === ref.toUpperCase());
                        return (
                          <div key={ref} className="bg-white border border-indigo-150 p-3 rounded-xl text-xs space-y-2 shadow-2xs">
                            <div className="flex items-center justify-between border-b border-indigo-50 pb-1.5">
                              <span className="font-mono font-black text-indigo-900 text-xs bg-indigo-50 px-2.5 py-0.5 rounded border border-indigo-100">{ref}</span>
                              {det?.client && <span className="text-[10px] font-bold text-gray-600">Client: {det.client}</span>}
                            </div>

                            {det && (
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[10px] text-gray-650 pt-0.5">
                                {det.pipeClass && (det.pipeClass.nominalDiameter || det.pipeClass.nominalPressure || det.pipeClass.nominalStiffness) && (
                                  <div>
                                    <strong className="text-gray-800 block uppercase text-[9px]">Class (DN/PN/SN):</strong> 
                                    DN{det.pipeClass.nominalDiameter || "-"} / PN{det.pipeClass.nominalPressure || "-"} / SN{det.pipeClass.nominalStiffness || "-"}
                                  </div>
                                )}
                                {det.pipeType && (
                                  <div>
                                    <strong className="text-gray-800 block uppercase text-[9px]">Pipe Type:</strong> 
                                    <span className="text-indigo-700 font-black">{det.pipeType}</span>
                                  </div>
                                )}
                                {det.junctionType && (
                                  <div>
                                    <strong className="text-gray-800 block uppercase text-[9px]">Junction:</strong> 
                                    {det.junctionType}
                                  </div>
                                )}
                              </div>
                            )}

                            {isExpanded && det && (
                              <div className="pt-2 border-t border-gray-100 space-y-2 text-[10px] animate-fade-in">
                                {/* Parameters detail */}
                                {det.productParameters && (
                                  <div className="bg-emerald-50/50 p-2 rounded-lg border border-emerald-100 space-y-1">
                                    <span className="font-bold text-emerald-900 block uppercase text-[9px]">Product Parameters:</span>
                                    <div className="grid grid-cols-3 gap-1 text-[9px]">
                                      <span>Length: <strong>{det.productParameters.length || "N/A"} mm</strong></span>
                                      <span>Thickness: <strong>{det.productParameters.thickness || "N/A"} mm</strong></span>
                                      <span>Weight: <strong>{det.productParameters.weight || "N/A"} kg</strong></span>
                                    </div>
                                  </div>
                                )}

                                {/* Spigot Details */}
                                {det.productParameters?.spigotDetail && !det.productParameters?.spigotNotDefined && (
                                  <div className="bg-blue-50/50 p-2 rounded-lg border border-blue-100 space-y-1">
                                    <span className="font-bold text-blue-900 block uppercase text-[9px]">Spigot Specification:</span>
                                    <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-[9px]">
                                      {Object.entries(det.productParameters.spigotDetail).map(([k, v]) => (
                                        <span key={k}>{k.toUpperCase()}: <strong>{v as string || "N/A"}</strong></span>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Bell Details */}
                                {det.productParameters?.bellDetail && !det.productParameters?.bellNotDefined && (
                                  <div className="bg-purple-50/50 p-2 rounded-lg border border-purple-100 space-y-1">
                                    <span className="font-bold text-purple-900 block uppercase text-[9px]">Bell Specification:</span>
                                    <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-[9px]">
                                      {Object.entries(det.productParameters.bellDetail).map(([k, v]) => (
                                        <span key={k}>{k.toUpperCase()}: <strong>{v as string || "N/A"}</strong></span>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Specification Limits & Tolerances Matrix */}
                                {(() => {
                                  const lims = getResolvedLimits(det, p.projectCode);
                                  if (!lims || Object.keys(lims).length === 0) return null;
                                  return (
                                    <div className="bg-amber-50/50 p-2 rounded-lg border border-amber-200/80 space-y-1">
                                      <span className="font-bold text-amber-950 block uppercase text-[9px]">Specification Limits & QC Tolerances:</span>
                                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 font-mono text-[9px] text-gray-700">
                                        {Object.entries(lims).map(([paramKey, limitObj]: [string, any]) => {
                                          if (!limitObj || (limitObj.min === undefined && limitObj.max === undefined)) return null;
                                          const labelMap: Record<string, string> = {
                                            barcolMinReq: "Barcol", sa: "SA", sb: "SB", sc: "SC", sd: "SD", se: "SE", sf: "SF", o2s: "Ø2S", o3s: "Ø3S", o4s: "Ø4S", sg: "SG",
                                            pipeLength: "Length", pipeThickness: "Thickness", pipeWeight: "Weight",
                                            o2b: "Ø2B", ba: "BA", bb: "BB", bc: "BC", bd: "BD", be: "BE", bf: "BF", bg: "BG"
                                          };
                                          const name = labelMap[paramKey] || paramKey.toUpperCase();
                                          const minVal = limitObj.min !== undefined && limitObj.min !== null && limitObj.min !== "ND" ? limitObj.min : "ND";
                                          const maxVal = limitObj.max !== undefined && limitObj.max !== null && limitObj.max !== "ND" ? limitObj.max : "ND";
                                          return (
                                            <div key={paramKey} className="bg-white/90 p-1 rounded border border-amber-100 flex justify-between gap-1">
                                              <span className="font-bold text-amber-950">{name}:</span>
                                              <span className="text-gray-800">
                                                {minVal !== "ND" ? `Min:${minVal}` : ""}{minVal !== "ND" && maxVal !== "ND" ? " " : ""}{maxVal !== "ND" ? `Max:${maxVal}` : ""}{minVal === "ND" && maxVal === "ND" ? "N/A" : ""}
                                              </span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  );
                                })()}
                              </div>
                            )}

                            {det && (
                              <div className="text-[10px] text-indigo-700 font-sans pt-1 border-t border-indigo-50 flex justify-between">
                                <span>Reference Volume Allocation: <strong className="text-indigo-900 font-black">{det.targetQuantityMeters ?? 500} m</strong></span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Read-Only Project Specification Sheet Modal */}
      {viewingProjectSpecs && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-fade-in">
          <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-gray-100 flex flex-col my-auto">
            
            {/* Modal Header */}
            <div className="p-5 sm:p-6 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-t-3xl sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-white/10 shadow-md">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-black tracking-tight text-white flex items-center gap-2">
                    <FileText className="w-5 h-5 text-indigo-400" />
                    Project Specification Sheet: {viewingProjectSpecs.projectCode}
                  </h3>
                  <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-extrabold px-3 py-0.5 rounded-full flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    Operator Read-Only Access
                  </span>
                </div>
                <div className="text-xs text-slate-300 flex flex-wrap gap-x-4 gap-y-1 pt-0.5">
                  {viewingProjectSpecs.client && <span>Client: <strong className="text-white">{viewingProjectSpecs.client}</strong></span>}
                  <span>Target Volume: <strong className="text-white">{viewingProjectSpecs.targetQuantityMeters ?? "N/A"} meters</strong></span>
                  {viewingProjectSpecs.productionStartDate && (
                    <span>Schedule: <strong className="text-white">{new Date(viewingProjectSpecs.productionStartDate).toLocaleDateString()} - {viewingProjectSpecs.productionEndDate ? new Date(viewingProjectSpecs.productionEndDate).toLocaleDateString() : 'N/A'}</strong></span>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setViewingProjectSpecs(null)}
                className="bg-white/10 hover:bg-white/20 text-white p-2 rounded-xl transition cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 sm:p-6 space-y-6">
              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-xs text-blue-950 flex items-center gap-3">
                <Info className="w-5 h-5 text-blue-600 shrink-0" />
                <span>
                  <strong>Operator Specification View:</strong> Complete product parameter specifications, pipe material classification, spigot & bell dimensions, and Quality Control tolerance limits for project <strong>{viewingProjectSpecs.projectCode}</strong>.
                </span>
              </div>

              {/* Setting References Specifications List */}
              <div className="space-y-6">
                {viewingProjectSpecs.settingReferences.map((ref, idx) => {
                  const det = viewingProjectSpecs.settingRefDetails?.find(d => d.settingReference.toUpperCase() === ref.toUpperCase());
                  const limits = getResolvedLimits(det, viewingProjectSpecs.projectCode);

                  return (
                    <div key={ref} className="bg-white border-2 border-indigo-100 rounded-2xl p-5 shadow-xs space-y-4">
                      
                      {/* Header */}
                      <div className="flex flex-wrap items-center justify-between border-b border-indigo-100 pb-3 gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-black text-sm text-indigo-900 bg-indigo-50 border border-indigo-200 px-3 py-1 rounded-xl shadow-2xs">
                            {ref}
                          </span>
                          <span className="text-xs text-gray-500 font-bold">Setting Reference #{idx + 1}</span>
                        </div>
                        {det?.targetQuantityMeters && (
                          <span className="text-xs font-extrabold text-indigo-800 bg-indigo-50/80 px-3 py-1 rounded-lg border border-indigo-150">
                            Volume Target: {det.targetQuantityMeters} m
                          </span>
                        )}
                      </div>

                      {/* Grid for Class & Type */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                          <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Pipe Class</span>
                          <div className="text-xs font-black text-slate-900 font-mono">
                            DN: {det?.pipeClass?.nominalDiameter || "N/A"} mm | PN: {det?.pipeClass?.nominalPressure || "N/A"} bar | SN: {det?.pipeClass?.nominalStiffness || "N/A"} N/m²
                          </div>
                        </div>

                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                          <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Pipe Material Type</span>
                          <div className="text-xs font-black text-indigo-700">
                            {det?.pipeType || "GRE"}
                          </div>
                        </div>

                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                          <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Junction / Joint Type</span>
                          <div className="text-xs font-black text-slate-900">
                            {det?.junctionType || "BELL/SPIGOT 1OR"}
                          </div>
                        </div>
                      </div>

                      {/* Product Nominal Parameters */}
                      <div className="bg-emerald-50/40 p-3.5 rounded-xl border border-emerald-200/80 space-y-1.5">
                        <span className="text-[11px] font-extrabold text-emerald-900 uppercase tracking-wider block">
                          Product Nominal Parameters
                        </span>
                        <div className="grid grid-cols-3 gap-3 text-xs text-emerald-950 font-bold">
                          <div>Length: <span className="font-mono font-black">{det?.productParameters?.length || "N/A"} mm</span></div>
                          <div>Thickness: <span className="font-mono font-black">{det?.productParameters?.thickness || "N/A"} mm</span></div>
                          <div>Weight: <span className="font-mono font-black">{det?.productParameters?.weight || "N/A"} kg</span></div>
                        </div>
                      </div>

                      {/* Spigot Details */}
                      <div className="bg-blue-50/40 p-3.5 rounded-xl border border-blue-200/80 space-y-1.5">
                        <span className="text-[11px] font-extrabold text-blue-900 uppercase tracking-wider block">
                          Spigot Dimensional Specifications (mm)
                        </span>
                        {det?.productParameters?.spigotNotDefined ? (
                          <div className="text-xs text-blue-700 italic font-semibold">Spigot Details are Not Defined for this junction.</div>
                        ) : (
                          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs font-mono">
                            {Object.entries(det?.productParameters?.spigotDetail || {}).map(([k, v]) => (
                              <div key={k} className="bg-white/80 p-1.5 rounded-lg border border-blue-150 flex justify-between">
                                <span className="font-bold text-blue-900 uppercase">{k}:</span>
                                <span className="font-black text-gray-800">{v as string || "N/A"}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Bell Details */}
                      <div className="bg-purple-50/40 p-3.5 rounded-xl border border-purple-200/80 space-y-1.5">
                        <span className="text-[11px] font-extrabold text-purple-900 uppercase tracking-wider block">
                          Bell Dimensional Specifications (mm)
                        </span>
                        {det?.productParameters?.bellNotDefined ? (
                          <div className="text-xs text-purple-700 italic font-semibold">Bell Details are Not Defined for this junction.</div>
                        ) : (
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
                            {Object.entries(det?.productParameters?.bellDetail || {}).map(([k, v]) => (
                              <div key={k} className="bg-white/80 p-1.5 rounded-lg border border-purple-150 flex justify-between">
                                <span className="font-bold text-purple-900 uppercase">{k === "o2b" ? "Ø2B" : k}:</span>
                                <span className="font-black text-gray-800">{v as string || "N/A"}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* QC Tolerances & Limits Matrix */}
                      <div className="bg-amber-50/50 p-4 rounded-xl border border-amber-200 space-y-2">
                        <span className="text-[11px] font-extrabold text-amber-950 uppercase tracking-wider block">
                          Quality Control Specification Limits & Tolerances Matrix
                        </span>
                        {Object.keys(limits).length === 0 ? (
                          <div className="text-xs text-amber-800 italic">No specific tolerance limits registered for this reference key.</div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 font-mono text-xs">
                            {Object.entries(limits).map(([paramKey, limitObj]: [string, any]) => {
                              if (!limitObj || (limitObj.min === undefined && limitObj.max === undefined)) return null;
                              const labelMap: Record<string, string> = {
                                barcolMinReq: "Barcol Hardness (HBa)", sa: "SA Spigot", sb: "SB Spigot", sc: "SC Spigot", sd: "SD Spigot", se: "SE Spigot", sf: "SF Spigot", o2s: "Ø2S Spigot", o3s: "Ø3S Spigot", o4s: "Ø4S Spigot", sg: "SG Spigot",
                                pipeLength: "Pipe Length", pipeThickness: "Pipe Thickness", pipeWeight: "Pipe Weight",
                                o2b: "Ø2B Bell", ba: "BA Bell", bb: "BB Bell", bc: "BC Bell", bd: "BD Bell", be: "BE Bell", bf: "BF Bell", bg: "BG Bell"
                              };
                              const name = labelMap[paramKey] || paramKey.toUpperCase();
                              const minVal = limitObj.min !== undefined && limitObj.min !== null && limitObj.min !== "ND" ? limitObj.min : "ND";
                              const maxVal = limitObj.max !== undefined && limitObj.max !== null && limitObj.max !== "ND" ? limitObj.max : "ND";

                              return (
                                <div key={paramKey} className="bg-white p-2 rounded-lg border border-amber-200 shadow-2xs flex justify-between items-center gap-2">
                                  <span className="font-bold text-amber-950 text-[11px]">{name}</span>
                                  <span className="text-xs font-black text-slate-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-100">
                                    {minVal !== "ND" ? `Min: ${minVal}` : ""}{minVal !== "ND" && maxVal !== "ND" ? " | " : ""}{maxVal !== "ND" ? `Max: ${maxVal}` : ""}{minVal === "ND" && maxVal === "ND" ? "N/A" : ""}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                    </div>
                  );
                })}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 sm:p-5 bg-gray-50 border-t border-gray-100 rounded-b-3xl flex justify-between items-center">
              <span className="text-xs text-gray-500 font-medium">
                Official QC Specification Record for Operators
              </span>
              <button
                type="button"
                onClick={() => setViewingProjectSpecs(null)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl transition cursor-pointer shadow-xs"
              >
                Close Specification Sheet
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}

export default React.memo(ProjectReferenceModule);
