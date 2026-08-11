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
  FileJson,
  ShieldCheck
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
  onNavigateToProjectSpecs?: () => void;
}

function AccountPanel({ 
  currentUser, 
  onLogout, 
  tolerances, 
  onRefreshTolerances,
  projects,
  onRefreshProjects,
  onRestoreDatabase,
  onNavigateToProjectSpecs
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

  // Note: Project & Setting Reference Lists functionality has been moved into its own dedicated page module (src/components/ProjectReferenceModule.tsx)



  const ALL_LIMITS_KEYS = [
    "barcolMinReq", "sa", "sb", "sc", "sd", "se", "sf", "o2s", "o3s", "o4s", "sg", "pipeLength", "pipeThickness",
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

      {/* Notice Card for Separated Project & Setting Reference Module */}
      <div className="bg-gradient-to-r from-indigo-900 via-indigo-800 to-slate-900 rounded-2xl p-5 sm:p-6 text-white shadow-lg flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-indigo-300 animate-pulse" />
            <h4 className="font-extrabold text-base tracking-wide uppercase">Project & Setting Reference Module</h4>
          </div>
          <p className="text-xs text-indigo-200/90 max-w-2xl">
            All project configurations, setting reference specifications, product parameters, spigot & bell details, and limit thresholds are managed in the dedicated <strong>Project Specs</strong> page module.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-xs font-bold text-indigo-200 bg-white/10 px-3 py-2 rounded-xl border border-white/10">
            {projects.length} Active Projects
          </span>
          {onNavigateToProjectSpecs && (
            <button
              type="button"
              onClick={onNavigateToProjectSpecs}
              className="bg-indigo-500 hover:bg-indigo-400 text-white font-extrabold text-xs px-4 py-2 rounded-xl transition shadow-md flex items-center gap-1.5 cursor-pointer"
            >
              <span>Open Projects Page</span>
            </button>
          )}
        </div>
      </div>



    </div>
  );
}

export default React.memo(AccountPanel);
