import React, { useState, useEffect, useRef } from "react";
import { 
  FileText, 
  Layers, 
  User as UserIcon, 
  TrendingUp, 
  ArrowLeft, 
  ArrowRight, 
  CheckCircle, 
  Check,
  X, 
  AlertTriangle, 
  RefreshCw,
  LogOut,
  Sparkles,
  ClipboardCheck,
  Shield,
  Activity,
  Award,
  BookOpen,
  MessageSquare,
  Map,
  Palette
} from "lucide-react";
import { 
  User, 
  PipeRecord, 
  PipeHeader, 
  StepRecord, 
  DashboardStats, 
  PipeType,
  StepQualityCheck,
  ToleranceConfig,
  ProjectConfig,
  ChatMessage
} from "./types";
import HeaderForm from "./components/HeaderForm";
import StepDetail from "./components/StepDetail";

const PipeDashboard = React.lazy(() => import("./components/PipeDashboard"));
const AccountPanel = React.lazy(() => import("./components/AccountPanel"));
const InteractiveTutorial = React.lazy(() => import("./components/InteractiveTutorial"));
const DiscussionBoard = React.lazy(() => import("./components/DiscussionBoard"));
const PortfolioAnalytics = React.lazy(() => import("./components/PortfolioAnalytics"));
const TrackingPlane = React.lazy(() => import("./components/TrackingPlane"));

const TabLoadingSkeleton = () => (
  <div className="w-full space-y-6 py-6 animate-pulse">
    <div className="h-12 bg-gray-100 rounded-2xl w-2/3"></div>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="h-32 bg-gray-100 rounded-2xl"></div>
      <div className="h-32 bg-gray-100 rounded-2xl"></div>
      <div className="h-32 bg-gray-100 rounded-2xl"></div>
    </div>
    <div className="h-96 bg-gray-100 rounded-3xl"></div>
  </div>
);
import { exportPipeToPDF } from "./utils/pdfGenerator";

export default function App() {
  // Authentication status states
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [usernameInput, setUsernameInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  // Layout theme customization: steel (Industrial Slate/Steel) | midnight (Executive Dark) | emerald (Precision Mint) | amber (Titanium Gold)
  const [theme, setTheme] = useState<"steel" | "midnight" | "emerald" | "amber">(() => {
    return (localStorage.getItem("pipe_app_theme") as any) || "steel";
  });
  const [showThemeMenu, setShowThemeMenu] = useState(false);

  const handleThemeChange = (newTheme: "steel" | "midnight" | "emerald" | "amber") => {
    setTheme(newTheme);
    localStorage.setItem("pipe_app_theme", newTheme);
  };

  const THEME_STYLES = {
    steel: {
      id: "steel",
      name: "Industrial Steel",
      bg: "bg-slate-100/90 text-slate-900 selection:bg-blue-100 selection:text-blue-900",
      header: "bg-slate-900 text-white border-slate-800",
      footer: "bg-white/95 backdrop-blur-md border-slate-200 text-slate-700",
      activeTab: "text-blue-600 font-extrabold scale-105",
      inactiveTab: "text-slate-400 hover:text-slate-600 font-semibold",
      badge: "bg-blue-600/15 text-blue-400 border-blue-500/30",
      btn: "bg-blue-600 hover:bg-blue-700 text-white",
      card: "bg-white border-slate-200/80 shadow-xs",
    },
    midnight: {
      id: "midnight",
      name: "Midnight Executive (Dark)",
      bg: "bg-slate-950 text-slate-100 selection:bg-cyan-900 selection:text-cyan-100",
      header: "bg-slate-950 text-slate-100 border-slate-800/90 shadow-2xl",
      footer: "bg-slate-900/95 backdrop-blur-md border-slate-800 text-slate-300",
      activeTab: "text-cyan-400 font-extrabold scale-105",
      inactiveTab: "text-slate-500 hover:text-slate-300 font-semibold",
      badge: "bg-cyan-950 text-cyan-300 border-cyan-800/60",
      btn: "bg-cyan-600 hover:bg-cyan-700 text-white",
      card: "bg-slate-900 border-slate-800 shadow-xl text-slate-100",
    },
    emerald: {
      id: "emerald",
      name: "Emerald Precision",
      bg: "bg-emerald-950/5 text-slate-900 selection:bg-emerald-100 selection:text-emerald-900",
      header: "bg-emerald-950 text-emerald-50 border-emerald-900 shadow-md",
      footer: "bg-white/95 backdrop-blur-md border-emerald-200/80 text-emerald-900",
      activeTab: "text-emerald-700 font-extrabold scale-105",
      inactiveTab: "text-slate-400 hover:text-slate-600 font-semibold",
      badge: "bg-emerald-600/15 text-emerald-300 border-emerald-500/30",
      btn: "bg-emerald-600 hover:bg-emerald-700 text-white",
      card: "bg-white border-emerald-100 shadow-xs",
    },
    amber: {
      id: "amber",
      name: "Titanium Gold",
      bg: "bg-stone-100 text-stone-900 selection:bg-amber-100 selection:text-amber-900",
      header: "bg-stone-900 text-amber-50 border-amber-900/50 shadow-md",
      footer: "bg-stone-900/95 backdrop-blur-md border-stone-800 text-amber-100",
      activeTab: "text-amber-500 font-extrabold scale-105",
      inactiveTab: "text-stone-400 hover:text-stone-200 font-semibold",
      badge: "bg-amber-600/20 text-amber-400 border-amber-500/40",
      btn: "bg-amber-600 hover:bg-amber-700 text-white",
      card: "bg-white border-amber-200/80 shadow-xs",
    },
  };

  const currentThemeStyle = THEME_STYLES[theme] || THEME_STYLES.steel;

  // Layout navigation: tracker (the scanning form) | records (dashboard table database) | analytics (Advanced Portfolio Analytics) | manual (user guide & presentation clip) | account (credentials/operator desk) | chat (shift discussion board) | tracking-plane (visual 2D layout)
  const [activeTab, setActiveTab ] = useState<"tracker" | "records" | "analytics" | "manual" | "account" | "chat" | "tracking-plane">("tracker");
  
  // Discussion chat states
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isLoadingChat, setIsLoadingChat] = useState(false);
  const [unreadChatMessages, setUnreadChatMessages] = useState<number>(0);

  // Tab navigation history states
  const [tabHistory, setTabHistory] = useState<string[]>(["tracker"]);
  const [historyIndex, setHistoryIndex] = useState<number>(0);

  // Keep active tab state in sync inside a Ref to prevent EventSource restart on tab switch
  const activeTabRef = useRef(activeTab);
  useEffect(() => {
    activeTabRef.current = activeTab;
    if (activeTab === "chat") {
      setUnreadChatMessages(0);
    }

    // Automatically record tab switches in history if driven from user actions (like footer tabs)
    if (tabHistory[historyIndex] !== activeTab) {
      const idxInHistory = tabHistory.indexOf(activeTab);
      if (idxInHistory !== -1) {
        setHistoryIndex(idxInHistory);
      } else {
        const updatedHistory = tabHistory.slice(0, historyIndex + 1);
        updatedHistory.push(activeTab);
        setTabHistory(updatedHistory);
        setHistoryIndex(updatedHistory.length - 1);
      }
    }
  }, [activeTab, tabHistory, historyIndex]);

  const handleGoBack = () => {
    if (historyIndex > 0) {
      const prevIdx = historyIndex - 1;
      setHistoryIndex(prevIdx);
      setActiveTab(tabHistory[prevIdx] as any);
    }
  };

  const handleGoForward = () => {
    if (historyIndex < tabHistory.length - 1) {
      const nextIdx = historyIndex + 1;
      setHistoryIndex(nextIdx);
      setActiveTab(tabHistory[nextIdx] as any);
    }
  };
  
  // Tracker forms workflow states
  const [activeStep, setActiveStep] = useState<number>(1);
  const [currentHeader, setCurrentHeader] = useState<PipeHeader | null>(null);
  const [pipeRecords, setPipeRecords] = useState<PipeRecord[]>([]);
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
  
  // Acceptable tolerances configuration
  const [tolerances, setTolerances] = useState<ToleranceConfig[]>([]);

  // Pre-defined projects selection configs
  const [projects, setProjects] = useState<ProjectConfig[]>([]);
  
  // Collaborative multi-user variables
  const [activeOperators, setActiveOperators] = useState<{ username: string; role: string; lastSeen: string }[]>([]);
  const [recentLogs, setRecentLogs] = useState<{ id: string; username: string; action: string; timestamp: string }[]>([]);
  const [appUsers, setAppUsers] = useState<{ id: string; username: string; role: string }[]>([]);
  
  // App operations state statuses
  const [isLoadingPipes, setIsLoadingPipes] = useState(false);
  const [isSavingStep, setIsSavingStep] = useState(false);
  const [isSavingHeader, setIsSavingHeader] = useState(false);
  const [activePipeId, setActivePipeId] = useState<string>("");
  const [isEditingHeader, setIsEditingHeader] = useState<boolean>(false);

  // Keep track of last fetch timestamp to prevent eager/redundant network requests
  const lastFetchTimestamps = useRef<Record<string, number>>({});

  const shouldFetch = React.useCallback((key: string, cooldownMs = 15000) => {
    const now = Date.now();
    const last = lastFetchTimestamps.current[key] || 0;
    if (now - last > cooldownMs) {
      lastFetchTimestamps.current[key] = now;
      return true;
    }
    return false;
  }, []);

  const performLogin = React.useCallback(async (user: string, pass: string) => {
    setAuthError(null);
    setIsAuthenticating(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: user.trim(), password: pass.trim() })
      });
      const data = await safeParseJson(res);
      if (res.ok) {
        setToken(data.token);
        setCurrentUser(data.user);
        localStorage.setItem("pipe_tracker_token", data.token);
        localStorage.setItem("pipe_tracker_user", JSON.stringify(data.user));
        setUsernameInput("");
        setPasswordInput("");
        return true;
      } else {
        setAuthError(data.error || "Authentication failed");
        return false;
      }
    } catch (err) {
      setAuthError("Multi-operator server offline. Run the Node container server.");
      return false;
    } finally {
      setIsAuthenticating(false);
    }
  }, []);

  // Check login state on mount, auto-authenticate if no stored token exists
  useEffect(() => {
    const savedToken = localStorage.getItem("pipe_tracker_token");
    const savedUser = localStorage.getItem("pipe_tracker_user");
    if (savedToken && savedUser) {
      setToken(savedToken);
      try {
        setCurrentUser(JSON.parse(savedUser));
      } catch (e) {
        localStorage.removeItem("pipe_tracker_token");
        localStorage.removeItem("pipe_tracker_user");
        performLogin("admin", "admin");
      }
    } else {
      performLogin("admin", "admin");
    }
  }, [performLogin]);

  // Fallback calculated stats in case server stats endpoint has delay
  const computedFallbackStats = React.useMemo(() => {
    const totalPipes = pipeRecords.length;
    let completedPipes = 0;
    let activePipes = 0;
    const stepCompletionTotals = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0 };
    let passCount = 0;
    let failCount = 0;
    let inProgressCount = 0;

    pipeRecords.forEach(pipe => {
      const step8 = pipe.steps?.[8];
      const hasCompletedStep8 = step8 && step8.isCompleted;
      if (hasCompletedStep8) {
        completedPipes++;
      } else {
        activePipes++;
      }
      let hasFail = false;
      let hasPass = false;
      for (let s = 1; s <= 8; s++) {
        const sr = pipe.steps?.[s];
        if (sr && sr.isCompleted) {
          stepCompletionTotals[s as keyof typeof stepCompletionTotals]++;
          const stepHasFail = sr.qualityChecks?.some(qc => qc.status === "Fail") || !!sr.isNonConform;
          const stepHasPass = sr.qualityChecks?.some(qc => qc.status === "Pass");
          if (stepHasFail) hasFail = true;
          if (stepHasPass) hasPass = true;
        }
      }
      if (hasFail) {
        failCount++;
      } else if (hasCompletedStep8) {
        passCount++;
      } else {
        inProgressCount++;
      }
    });

    const stepCompletionRates: { [key: number]: number } = {};
    for (let s = 1; s <= 8; s++) {
      stepCompletionRates[s] = totalPipes > 0 
        ? Math.round((stepCompletionTotals[s as keyof typeof stepCompletionTotals] / totalPipes) * 100) 
        : 0;
    }

    return {
      totalPipes,
      completedPipes,
      activePipes,
      stepCompletionRates,
      statusDistribution: {
        pass: passCount,
        fail: failCount,
        inProgress: inProgressCount
      }
    };
  }, [pipeRecords]);

  // MINIMIZE NETWORK EGRESS: Pull-on-demand relevant states as soon as we land on a dynamic tab
  useEffect(() => {
    if (!token) return;
    if (activeTab === "tracker") {
      fetchPipesFromServerSilently();
    } else if (activeTab === "records") {
      fetchPipesFromServerSilently();
      fetchDashboardStatsSilently();
    } else if (activeTab === "tracking-plane") {
      fetchPipesFromServerSilently();
    } else if (activeTab === "analytics") {
      fetchPipesFromServerSilently();
    } else if (activeTab === "account") {
      fetchTolerances();
      fetchProjects();
    } else if (activeTab === "manual") {
      fetchAppUsers();
    }
  }, [activeTab, token]);

  // Sync server database whenever authenticated with live active multi-user poll & Stream
  useEffect(() => {
    if (token) {
      // Coalesced single initial request instead of 6 eager separate ones
      fetchBootstrapData(true);

      // Establish live, continuous Server-Sent Events (SSE) stream connection
      let eventSource: EventSource | null = null;
      try {
        const streamUrl = `/api/activity-stream?token=${encodeURIComponent(token)}`;
        eventSource = new EventSource(streamUrl);

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === "init" || data.type === "new-event") {
              if (data.recentLogs) {
                setRecentLogs(data.recentLogs);
              }
              if (data.activeOperators) {
                setActiveOperators(data.activeOperators);
              }
              if (data.chatMessages) {
                setChatMessages(data.chatMessages);
              }
            } else if (data.type === "presence-update") {
              if (data.activeOperators) {
                setActiveOperators(data.activeOperators);
              }
            } else if (data.type === "chat-message") {
              if (data.chatMessages) {
                setChatMessages(data.chatMessages);
                if (activeTabRef.current !== "chat") {
                  setUnreadChatMessages((prev) => prev + 1);
                }
              }
            }
          } catch (err) {
            console.error("Error parsing event stream message:", err);
          }
        };

        eventSource.onerror = () => {
          console.warn("Event stream encountered connection error. Reverting to poll fallback.");
          if (eventSource) {
            eventSource.close();
            eventSource = null;
          }
        };
      } catch (err) {
        console.error("Failed to connect EventSource stream:", err);
      }

      // MINIMIZE NETWORK EGRESS: Increase polling interval to 60s and only fetch active production ledger/stats
      const timer = setInterval(() => {
        // Soft refresh for active pipeline records and global statistics (forces updates over interval)
        fetchPipesFromServerSilently(true);
        fetchDashboardStatsSilently(true);

        // Tolerances, projects, and users are highly static and loaded once on login / updated manually on Account actions.
        // We do not poll them repetitively here to prevent unnecessary network egress.

        // If the live event stream falls back or fails, continue regular polling for logs and messages
        if (!eventSource) {
          fetchActivityFeed();
          fetchChatHistorySilently(true);
        }
      }, 60000);

      return () => {
        clearInterval(timer);
        if (eventSource) {
          eventSource.close();
        }
      };
    }
  }, [token]);

  const getHeaders = React.useCallback(() => {
    return {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    };
  }, [token]);

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

  const handleLogout = React.useCallback(() => {
    localStorage.removeItem("pipe_tracker_token");
    localStorage.removeItem("pipe_tracker_user");
    setToken(null);
    setCurrentUser(null);
    setCurrentHeader(null);
    setActivePipeId("");
    setActiveStep(1);
  }, []);

  const fetchBootstrapData = React.useCallback(async (force = false) => {
    if (!token) return;
    const isForce = force || pipeRecords.length === 0;
    if (!isForce && !shouldFetch("bootstrap", 15000)) return;
    setIsLoadingPipes(true);
    try {
      const res = await fetch("/api/bootstrap", { headers: getHeaders() });
      if (res.ok) {
        const data = await safeParseJson(res);
        setPipeRecords(data.pipes || []);
        setDashboardStats(data.stats || null);
        setTolerances(data.tolerances || []);
        setProjects(data.projects || []);
        setChatMessages(data.chat || []);
        setAppUsers(data.users || []);
        setActiveOperators(data.activeOperators || []);
        setRecentLogs(data.recentLogs || []);

        const now = Date.now();
        lastFetchTimestamps.current["bootstrap"] = now;
        lastFetchTimestamps.current["pipes"] = now;
        lastFetchTimestamps.current["stats"] = now;
        lastFetchTimestamps.current["tolerances"] = now;
        lastFetchTimestamps.current["projects"] = now;
        lastFetchTimestamps.current["users"] = now;
        lastFetchTimestamps.current["chat"] = now;
        lastFetchTimestamps.current["activity-feed"] = now;
      } else if (res.status === 410 || res.status === 401) {
        handleLogout();
        performLogin("admin", "admin");
      }
    } catch (err) {
      console.error("Failed to bootstrap application data", err);
    } finally {
      setIsLoadingPipes(false);
    }
  }, [token, getHeaders, shouldFetch, pipeRecords.length, handleLogout, performLogin]);

  const fetchActivityFeed = async (force = false) => {
    if (!token) return;
    if (!force && !shouldFetch("activity-feed", 15000)) return;
    try {
      const res = await fetch("/api/activity-feed", { headers: getHeaders() });
      if (res.ok) {
        const data = await safeParseJson(res);
        setActiveOperators(data.activeOperators || []);
        setRecentLogs(data.recentLogs || []);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchTolerances = async (force = false) => {
    if (!token) return;
    if (!force && !shouldFetch("tolerances", 15000)) return;
    try {
      const res = await fetch("/api/tolerances", { headers: getHeaders() });
      if (res.ok) {
        const data = await safeParseJson(res);
        setTolerances(data);
      }
    } catch (err) {
      console.error("Error fetching tolerances:", err);
    }
  };

  const fetchProjects = async (force = false) => {
    if (!token) return;
    if (!force && !shouldFetch("projects", 15000)) return;
    try {
      const res = await fetch("/api/projects", { headers: getHeaders() });
      if (res.ok) {
        const data = await safeParseJson(res);
        setProjects(data);
      }
    } catch (err) {
      console.error("Error fetching projects:", err);
    }
  };

  const fetchAppUsers = async (force = false) => {
    if (!token) return;
    if (!force && !shouldFetch("users", 15000)) return;
    try {
      const res = await fetch("/api/users", { headers: getHeaders() });
      if (res.ok) {
        const data = await safeParseJson(res);
        setAppUsers(data);
      }
    } catch (err) {
      console.error("Error fetching app users:", err);
    }
  };

  const fetchChatHistory = async (force = false) => {
    if (!token) return;
    if (!force && !shouldFetch("chat", 15000)) return;
    setIsLoadingChat(true);
    try {
      const res = await fetch("/api/chat", { headers: getHeaders() });
      if (res.ok) {
        const data = await safeParseJson(res);
        setChatMessages(data || []);
      }
    } catch (err) {
      console.error("Error fetching chat history:", err);
    } finally {
      setIsLoadingChat(false);
    }
  };

  const fetchChatHistorySilently = async (force = false) => {
    if (!token) return;
    if (!force && !shouldFetch("chat", 15000)) return;
    try {
      const res = await fetch("/api/chat", { headers: getHeaders() });
      if (res.ok) {
        const data = await safeParseJson(res);
        setChatMessages(data || []);
      }
    } catch (err) {}
  };

  const handleSendMessage = async (text: string) => {
    if (!token) return;
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ text })
    });
    if (res.ok) {
      const data = await safeParseJson(res);
      if (data.success && data.message) {
        setChatMessages(prev => {
          if (prev.some(m => m.id === data.message.id)) return prev;
          return [...prev, data.message];
        });
      }
      fetchActivityFeed(true);
    } else {
      const errData = await safeParseJson(res);
      throw new Error(errData.error || "Failed to submit message");
    }
  };

  const fetchPipesFromServerSilently = async (force = false) => {
    const isForce = force || pipeRecords.length === 0;
    if (!isForce && !shouldFetch("pipes", 15000)) return;
    try {
      const res = await fetch("/api/pipes", { headers: getHeaders() });
      if (res.ok) {
        const data = await safeParseJson(res);
        if (Array.isArray(data) && data.length > 0) {
          setPipeRecords(data);
        }
      }
    } catch (err) {}
  };

  const fetchDashboardStatsSilently = async (force = false) => {
    const isForce = force || !dashboardStats;
    if (!isForce && !shouldFetch("stats", 15000)) return;
    try {
      const res = await fetch("/api/pipes/stats", { headers: getHeaders() });
      if (res.ok) {
        const data = await safeParseJson(res);
        if (data && data.totalPipes) {
          setDashboardStats(data);
        }
      }
    } catch (err) {}
  };

  const fetchPipesFromServer = async (force = false) => {
    if (!force && !shouldFetch("pipes", 15000)) return;
    setIsLoadingPipes(true);
    try {
      const res = await fetch("/api/pipes", { headers: getHeaders() });
      if (res.ok) {
        const data = await safeParseJson(res);
        setPipeRecords(data);
      } else if (res.status === 410) {
        handleLogout();
      }
    } catch (err) {
      console.error("Failed to load pipes from database server", err);
    } finally {
      setIsLoadingPipes(false);
    }
  };

  const fetchDashboardStats = async (force = false) => {
    if (!force && !shouldFetch("stats", 15000)) return;
    try {
      const res = await fetch("/api/pipes/stats", { headers: getHeaders() });
      if (res.ok) {
        const data = await safeParseJson(res);
        setDashboardStats(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await performLogin(usernameInput, passwordInput);
  };

  // Helper presets login buttons to make sandbox evaluation smooth and delightful
  const useQuickLogin = (user: string, pass: string) => {
    performLogin(user, pass);
  };

  // Start tracking a specific pipe ID (either newly registered or loading previous ones)
  const handleSaveHeader = React.useCallback(async (header: PipeHeader, originalPipeId?: string) => {
    setIsSavingHeader(true);
    try {
      const url = originalPipeId ? `/api/pipes?originalPipeId=${encodeURIComponent(originalPipeId)}` : "/api/pipes";
      const res = await fetch(url, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify(header)
      });
      const data = await safeParseJson(res);
      if (res.ok) {
        setCurrentHeader(data.header);
        setActivePipeId(data.pipeId);
        // Sync our local list
        fetchPipesFromServer();
        fetchDashboardStats();
        // Shift focus to step 1
        setActiveStep(1);
      } else {
        alert(data.error || "Failed to submit pipe header setup parameters");
      }
    } catch (err: any) {
      alert(err.message || "Error reaching back-end Express server context");
    } finally {
      setIsSavingHeader(false);
    }
  }, [getHeaders]);

  // Save specific step quality evaluation
  const handleSaveStepData = React.useCallback(async (stepNumber: number, stepData: {
    fields: any;
    qualityChecks: StepQualityCheck[];
    additionalObs: string;
    image?: string;
    isNonConform?: boolean;
    ncrReason?: string;
  }) => {
    if (!activePipeId) {
      alert("Please initialize pipe header specifications first!");
      return;
    }

    setIsSavingStep(true);
    try {
      const res = await fetch(`/api/pipes/${activePipeId}/step/${stepNumber}`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify(stepData)
      });
      if (res.ok) {
        // Sync record & recalculate metrics
        await fetchPipesFromServer();
        await fetchDashboardStats();
      } else {
        const errData = await safeParseJson(res);
        alert(errData.error || "Error saving step parameters");
      }
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Failed to submit step telemetry. Operational backend offline.");
    } finally {
      setIsSavingStep(false);
    }
  }, [activePipeId, getHeaders]);

  const handleUnsaveStepData = React.useCallback(async (stepNumber: number) => {
    if (!activePipeId) return;
    if (!window.confirm(`Are you sure you want to unsave and revert Step ${stepNumber} for this pipe?`)) {
      return;
    }
    setIsSavingStep(true);
    try {
      const res = await fetch(`/api/pipes/${activePipeId}/step/${stepNumber}/unsave`, {
        method: "POST",
        headers: getHeaders()
      });
      if (res.ok) {
        await fetchPipesFromServer();
        await fetchDashboardStats();
      } else {
        const errData = await safeParseJson(res);
        alert(errData.error || "Error unsaving step data");
      }
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Failed to unsave step data.");
    } finally {
      setIsSavingStep(false);
    }
  }, [activePipeId, getHeaders]);

  const handleDeletePipeRecord = React.useCallback(async (pipeId: string) => {
    try {
      const res = await fetch(`/api/pipes/${pipeId}`, {
        method: "DELETE",
        headers: getHeaders()
      });
      if (res.ok) {
        fetchPipesFromServer();
        fetchDashboardStats();
        if (activePipeId === pipeId) {
          setActivePipeId("");
          setCurrentHeader(null);
        }
      } else {
        const errData = await safeParseJson(res);
        alert(errData.error || "Error deleting pipe record");
      }
    } catch (err: any) {
      alert(err.message || "API deletion error");
    }
  }, [getHeaders, activePipeId]);

  const handleDispatchPipe = React.useCallback(async (pipeId: string, isDispatched: boolean) => {
    try {
      const res = await fetch(`/api/pipes/${pipeId}/dispatch`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ isDispatched })
      });
      if (res.ok) {
        await fetchPipesFromServer();
        await fetchDashboardStats();
        fetchActivityFeed();
      } else {
        const errData = await safeParseJson(res);
        alert(errData.error || "Error dispatching pipe record");
      }
    } catch (err: any) {
      alert(err.message || "API dispatch error");
    }
  }, [getHeaders]);

  const handleBulkReload = React.useCallback(async (records: PipeRecord[], mode: "merge" | "overwrite") => {
    try {
      setIsLoadingPipes(true);
      const res = await fetch("/api/pipes/bulk-reload", {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ records, mode })
      });
      if (res.ok) {
        await fetchPipesFromServer();
        await fetchDashboardStats();
        return { success: true };
      } else {
        const errData = await safeParseJson(res);
        return { success: false, error: errData.error || "Bulk reload failed on API." };
      }
    } catch (err: any) {
      console.error(err);
      return { success: false, error: err.message || "Network error during bulk reload." };
    } finally {
      setIsLoadingPipes(false);
    }
  }, [getHeaders]);

  // Select item from the Dashboard list to load into active working inputs
  const handleLoadPipeIntoTracker = React.useCallback((recToLoad: PipeRecord) => {
    setCurrentHeader(recToLoad.header);
    setActivePipeId(recToLoad.pipeId);
    setIsEditingHeader(false);
    
    // Auto find the first unfilled step index
    let targetStep = 1;
    for (let s = 1; s <= 8; s++) {
      if (!recToLoad.steps[s]) {
        targetStep = s;
        break;
      }
    }
    setActiveStep(targetStep);
    setActiveTab("tracker");
  }, []);

  // Get active loaded pipe database record
  const getActivePipeRecord = (): PipeRecord | undefined => {
    return pipeRecords.find(p => p.pipeId === activePipeId);
  };

  // Check checklist completeness status parameters
  const renderStepCompletionChip = (sIndex: number) => {
    const activeRec = getActivePipeRecord();
    const isSaved = activeRec?.steps[sIndex];

    let hasFail = false;
    if (isSaved) {
      hasFail = isSaved.qualityChecks.some(qc => qc.status === "Fail");
    }

    const isActive = activeStep === sIndex;

    return (
      <button
        key={sIndex}
        type="button"
        onClick={() => {
          if (!activePipeId) {
            alert("Configure identification metadata setup form before jumping steps.");
            return;
          }
          setActiveStep(sIndex);
        }}
        className={`flex-1 min-w-[70px] sm:min-w-[90px] py-2 px-1 text-center border rounded-xl font-sans text-[11px] font-bold transition-all shrink-0 ${
          isActive 
            ? "bg-blue-600 border-blue-600 text-white font-black shadow-sm ring-2 ring-blue-100" 
            : hasFail 
            ? "bg-rose-50 border-rose-200 hover:border-rose-300 text-rose-700 font-extrabold"
            : isSaved 
            ? "bg-green-50 border-green-200 hover:border-green-300 text-green-700" 
            : "bg-white border-gray-200 hover:border-gray-300 text-gray-500 hover:text-gray-700"
        }`}
      >
        <span className="block text-[8px] uppercase tracking-wider font-semibold opacity-80 leading-none">Chip</span>
        <span className="block text-xs my-0.5 font-bold">Step {sIndex}</span>
        <span className="text-[9px] font-sans block leading-none font-medium text-center truncate">
          {sIndex === 1 && "Prepare"}
          {sIndex === 2 && "Liner"}
          {sIndex === 3 && "Winding"}
          {sIndex === 4 && "Cure"}
          {sIndex === 5 && "Ejection"}
          {sIndex === 6 && "Spigot"}
          {sIndex === 7 && "Bell"}
          {sIndex === 8 && "Finition"}
        </span>
      </button>
    );
  };

  // Render official completion factory report
  const renderFactoryClearanceReport = (pipe: PipeRecord) => {
    // Generate checks calculations
    let totalChecks = 0;
    let passedChecks = 0;
    let failedChecks = 0;
    let hasPhotos = 0;

    for (let s = 1; s <= 8; s++) {
      const step = pipe.steps[s];
      if (step) {
        step.qualityChecks.forEach(qc => {
          totalChecks++;
          if (qc.status === "Pass") passedChecks++;
          if (qc.status === "Fail") failedChecks++;
        });
        if (step.image) hasPhotos++;
      }
    }

    const overallReportStatus = failedChecks > 0 ? "REJECTED (CRITICAL FAILURES DETECTED)" : "COMPLETED & ENTIRELY APPROVED";

    return (
      <div className="bg-white rounded-2xl border-2 border-gray-300 shadow-md p-5 sm:p-6 my-6 border-b-8 border-b-blue-600 relative overflow-hidden font-sans">
        
        {/* Subtle background industrial certificate motif */}
        <div className="absolute right-[-40px] top-[-40px] text-gray-100/50 pointer-events-none rotate-12 scale-[1.8] select-none">
          <Award className="w-48 h-48" />
        </div>

        <div className="border-b-2 border-dashed border-gray-200 pb-4 mb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <span className="text-[10px] bg-blue-100 text-blue-800 border border-blue-200 px-3 py-1 rounded-full font-bold uppercase tracking-wider flex items-center gap-1 w-fit">
              <Award className="w-3.5 h-3.5 text-blue-700 animate-spin" />
              Official QA Production clearance report
            </span>
            <h4 className="text-xl font-black text-gray-900 tracking-tight mt-1.5 leading-none">
              Pipe Clearance Certificate — {pipe.pipeId}
            </h4>
            <p className="text-xs text-gray-500 mt-1">
              Generated in real-time by factory system: <strong>{new Date().toISOString().split("T")[0]}</strong>
            </p>
          </div>

          <div className="shrink-0">
            {failedChecks > 0 ? (
              <span className="bg-red-600 text-white font-extrabold text-xs px-4 py-2 rounded-xl shadow-sm block uppercase tracking-wide">
                ✘ Fails Flagged
              </span>
            ) : (
              <span className="bg-green-600 text-white font-extrabold text-xs px-4 py-2 rounded-xl shadow-sm block uppercase tracking-wide">
                ✓ Fully Approved
              </span>
            )}
          </div>
        </div>

        {/* Certificate metadata tables */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-xs py-3.5 border-b border-gray-100">
          <div>
            <span className="text-gray-400 font-bold block uppercase text-[10px] tracking-wider mb-0.5">Structure Class</span>
            <strong className="text-gray-800 text-sm leading-snug">{pipe.header.pipeType}</strong>
          </div>
          <div>
            <span className="text-gray-400 font-bold block uppercase text-[10px] tracking-wider mb-0.5">Project ID</span>
            <strong className="text-gray-800 text-sm leading-snug">{pipe.header.projectWorkOrder || "WO-2026-X1"}</strong>
          </div>
          <div>
            <span className="text-gray-400 font-bold block uppercase text-[10px] tracking-wider mb-0.5">Lot Batch Lot</span>
            <strong className="text-gray-800 text-sm leading-snug">{pipe.header.lotNo || "LOT-B3"}</strong>
          </div>
          <div>
            <span className="text-gray-400 font-bold block uppercase text-[10px] tracking-wider mb-0.5">Primary Inspector</span>
            <strong className="text-gray-800 text-sm leading-snug">
              {(pipe.steps[8]?.fields as any)?.inspectorName || "Assigned QA Technicians"}
            </strong>
          </div>
          <div className="col-span-2 md:col-span-1">
            <span className="text-gray-400 font-bold block uppercase text-[10px] tracking-wider mb-0.5">Pipe Destination</span>
            <span className={`inline-block text-[10px] font-black px-2 py-0.5 rounded border mt-0.5 uppercase tracking-tight ${
              ((pipe.steps[8]?.fields as any)?.pipeDestination || "PRODUCT CONFORM - DP-COMMERCIAL").includes("NON-CONFORM")
                ? "bg-red-50 text-red-700 border-red-200"
                : ((pipe.steps[8]?.fields as any)?.pipeDestination || "").includes("ON HOLD") || ((pipe.steps[8]?.fields as any)?.pipeDestination || "").includes("REWORK")
                ? "bg-amber-100 text-amber-900 border-amber-300"
                : "bg-emerald-50 text-emerald-850 border-emerald-150"
            }`}>
              {(pipe.steps[8]?.fields as any)?.pipeDestination || "PRODUCT CONFORM - DP-COMMERCIAL"}
            </span>
          </div>
        </div>

        {/* Metrics overview widgets block */}
        <div className="grid grid-cols-3 gap-3.5 pt-4">
          <div className="bg-gray-50 p-3 rounded-xl border border-gray-200 text-center">
            <span className="text-gray-500 font-semibold block text-[10px] uppercase leading-none">Mandated Controls</span>
            <strong className="text-lg font-bold text-gray-800 tracking-tight block mt-1">{totalChecks}</strong>
          </div>

          <div className="bg-green-50/50 p-3 rounded-xl border border-green-100 text-center">
            <span className="text-green-600 font-semibold block text-[10px] uppercase leading-none">Passed Evaluated</span>
            <strong className="text-lg font-bold text-green-700 tracking-tight block mt-1">
              {passedChecks} ({totalChecks > 0 ? Math.round((passedChecks / totalChecks) * 100) : 0}%)
            </strong>
          </div>

          <div className={`p-3 rounded-xl text-center border ${
            failedChecks > 0 ? "bg-red-50/60 border-red-200 text-red-700" : "bg-gray-50 border-gray-200 text-gray-500"
          }`}>
            <span className="font-semibold block text-[10px] uppercase leading-none">Critical Fails</span>
            <strong className="text-lg font-bold tracking-tight block mt-1">{failedChecks}</strong>
          </div>
        </div>

        {failedChecks > 0 ? (
          <div className="mt-4 p-3 bg-red-50 text-red-800 text-xs rounded-xl border border-red-200 flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold block">Physical Deficiencies Detected</span>
              Quality controls recorded rejection statuses on active grinding, liner bubble checking, or structures. Reworking, surface polishing, or structural patches are recommended prior to load clearance.
            </div>
          </div>
        ) : (
          <div className="mt-4 p-3 bg-green-50 text-green-800 text-xs rounded-xl border border-green-200 flex items-start gap-2">
            <CheckCircle className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold block">Structural Verification Integrity Confirmed</span>
              All 8 production check levels passed physical compliance successfully. Dimensions values comply completely with structural limits, and lot has been sealed for immediate dispatch and shipment.
            </div>
          </div>
        )}

        <div className="mt-5 pt-3.5 border-t border-gray-100 flex flex-col sm:flex-row justify-between items-center gap-3">
          <span className="text-[11px] text-gray-400 italic">
            AWWA C950 / ISO 14692 / API 15LR Quality Standards Active
          </span>
          <button
            type="button"
            onClick={() => {
              try {
                exportPipeToPDF(pipe);
              } catch (e: any) {
                alert("Failed to generate PDF: " + e.message);
              }
            }}
            className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold text-xs py-2.5 px-5 rounded-xl flex items-center justify-center gap-2 transition shadow-md hover:shadow cursor-pointer tracking-wider uppercase font-sans"
          >
            <FileText className="w-4 h-4" />
            Download Complete PDF Tracking Sheet
          </button>
        </div>

      </div>
    );
  };

  // If not logged in, render the login shield
  if (!token) {
    return (
      <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col justify-between p-4 sm:p-6 relative overflow-hidden font-sans select-none">
        
        {/* Decorative ambient glowing grids inside dark theme */}
        <div className="absolute top-[-100px] left-[-100px] w-96 h-96 bg-blue-500/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-[-100px] right-[-100px] w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl"></div>

        {/* Brand visual header */}
        <div className="text-center py-6 sm:py-10 z-10 animate-fade-in">
          <div className="bg-blue-600/10 text-blue-500 border border-blue-500/20 w-fit mx-auto p-3.5 rounded-2xl mb-3 sm:mb-4 shadow-lg">
            <Activity className="w-8 h-8 animate-pulse" />
          </div>
          <h1 className="text-2xl sm:text-3.5xl font-black tracking-tight text-white uppercase sm:tracking-widest">
            Pipe Tracker Center
          </h1>
          <p className="text-xs text-gray-400 mt-2 max-w-sm mx-auto leading-relaxed">
            Mobile-Responsive multi-operator server tracker & database for fiberglass pipe production inspections
          </p>
        </div>

        {/* Login Credentials validation card */}
        <div className="w-full max-w-md mx-auto bg-gray-800 rounded-3xl border border-gray-700 shadow-2xl p-6 sm:p-8 z-10 transition">
          <h2 className="text-lg font-bold text-white tracking-wide mb-5 flex items-center gap-1.5 border-b border-gray-700 pb-2.5">
            <Shield className="w-5 h-5 text-blue-500" />
            Operator Verification Access
          </h2>

          {authError && (
            <div className="mb-4 bg-red-950 border border-red-800 text-red-200 text-xs p-3.5 rounded-xl flex items-start gap-2">
              <AlertTriangle className="w-4.5 h-4.5 text-red-400 shrink-0 mt-0.5" />
              <span>{authError}</span>
            </div>
          )}

          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                Username Identifier
              </label>
              <input
                type="text"
                required
                placeholder="Type your username..."
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 text-sm p-3 rounded-xl outline-none text-white focus:bg-gray-950 focus:border-blue-500 transition placeholder-gray-600 font-sans"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                Secure Password Check
              </label>
              <input
                type="password"
                required
                placeholder="Type secure password..."
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 text-sm p-3 rounded-xl outline-none text-white focus:bg-gray-950 focus:border-blue-500 transition placeholder-gray-600 font-sans"
              />
            </div>

            <button
              type="submit"
              disabled={isAuthenticating}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm py-3 rounded-xl tracking-wider shadow-md transition active:scale-95 duration-100 cursor-pointer text-center"
            >
              {isAuthenticating ? "Verifying Credentials..." : "Authenticate Session"}
            </button>
          </form>

          {/* Quick evaluation accounts assistance drawer */}
          <div className="mt-6 pt-5 border-t border-gray-700/50">
            <span className="text-[10px] font-bold text-gray-500 block mb-2.5 uppercase tracking-widest text-center">
              Multi-user Developer Accounts
            </span>
            <div className="grid grid-cols-2 gap-2 text-center text-xs">
              <button
                type="button"
                onClick={() => useQuickLogin("operator1", "operator")}
                className="bg-gray-900 hover:bg-gray-950 border border-gray-700 rounded-xl p-2.5 block text-[11px] text-gray-300 hover:text-white transition duration-200"
              >
                <strong>Operator Account</strong>
                <span className="block text-[9px] text-gray-500 mt-0.5">operator1 / operator</span>
              </button>

              <button
                type="button"
                onClick={() => useQuickLogin("admin", "admin")}
                className="bg-gray-900 hover:bg-gray-950 border border-gray-700 rounded-xl p-2.5 block text-[11px] text-gray-300 hover:text-white transition duration-200"
              >
                <strong>Administrator Dev</strong>
                <span className="block text-[9px] text-gray-500 mt-0.5">admin / admin</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer brand trademark block */}
        <div className="text-center text-[11px] text-gray-600 py-4 max-w-sm mx-auto uppercase tracking-wide">
          Production Security Core — Google AI Studio Platform
        </div>

      </div>
    );
  }

  // Active pipeline view selection details
  const activePipeRecord = getActivePipeRecord();
  const currentSavedStepData = activePipeRecord?.steps[activeStep];
  const step8Completed = activePipeRecord?.steps[8]?.isCompleted;

  return (
    <div className={`min-h-screen flex flex-col justify-between font-sans transition-colors duration-300 ${currentThemeStyle.bg}`}>
      
      {/* Top Banner Navigation bar */}
      <header className={`shadow-md border-b sticky top-0 z-30 select-none transition-colors duration-300 ${currentThemeStyle.header}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex justify-between items-center">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-600/10 text-blue-400 border border-blue-500/25 rounded-xl">
              <Activity className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h1 className="font-extrabold text-sm sm:text-base uppercase tracking-wider leading-none">
                Pipe Quality Center
              </h1>
              <p className="text-[10px] opacity-75 mt-0.5 font-mono">
                Operator: <span className="font-bold">{currentUser.username}</span>
              </p>
            </div>
          </div>

          {/* Back/Return and Forward History Navigation controls */}
          <div className="flex items-center gap-1 bg-black/20 p-1 rounded-xl border border-white/10">
            <button
              type="button"
              disabled={historyIndex <= 0}
              onClick={handleGoBack}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                historyIndex > 0
                  ? "text-blue-400 hover:text-white hover:bg-white/10 cursor-pointer"
                  : "text-gray-500 cursor-not-allowed opacity-40"
              }`}
              title="Return / Go Back"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Back</span>
            </button>
            <div className="w-px h-4 bg-white/10" />
            <button
              type="button"
              disabled={historyIndex >= tabHistory.length - 1}
              onClick={handleGoForward}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                historyIndex < tabHistory.length - 1
                  ? "text-blue-400 hover:text-white hover:bg-white/10 cursor-pointer"
                  : "text-gray-500 cursor-not-allowed opacity-40"
              }`}
              title="Go Forward"
            >
              <span className="hidden sm:inline">Forward</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            {/* Theme Selector Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowThemeMenu(prev => !prev)}
                className="text-xs font-bold bg-white/10 hover:bg-white/15 text-white border border-white/15 px-2.5 py-1.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                title="Change Theme & Design"
              >
                <Palette className="w-3.5 h-3.5 text-blue-400" />
                <span className="hidden md:inline">Theme</span>
                <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></span>
              </button>

              {showThemeMenu && (
                <div className="absolute right-0 mt-2 w-52 bg-slate-900 text-white border border-slate-750 rounded-2xl shadow-2xl p-2 z-50 animate-fade-in space-y-1">
                  <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 px-2 py-1 flex justify-between items-center border-b border-slate-800 pb-1.5">
                    <span>App Theme & Design</span>
                    <button type="button" onClick={() => setShowThemeMenu(false)} className="text-slate-500 hover:text-slate-300">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {[
                    { id: "steel", label: "Industrial Steel", dot: "bg-blue-500" },
                    { id: "midnight", label: "Midnight Dark", dot: "bg-cyan-400" },
                    { id: "emerald", label: "Emerald Clean", dot: "bg-emerald-500" },
                    { id: "amber", label: "Titanium Gold", dot: "bg-amber-500" },
                  ].map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        handleThemeChange(t.id as any);
                        setShowThemeMenu(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                        theme === t.id
                          ? "bg-blue-600/20 text-blue-300 border border-blue-500/40"
                          : "text-slate-300 hover:bg-slate-800 hover:text-white"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${t.dot}`} />
                        <span>{t.label}</span>
                      </div>
                      {theme === t.id && <Check className="w-3.5 h-3.5 text-blue-400" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={handleLogout}
              className="text-xs font-semibold bg-white/10 hover:bg-white/15 text-white border border-white/15 p-2 sm:px-3 rounded-xl transition flex items-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main client workflow screens */}
      <main className="flex-grow max-w-7xl w-full mx-auto p-4 sm:p-6 mb-16">
        <React.Suspense fallback={<TabLoadingSkeleton />}>
          {activeTab === "tracker" && (
          <div className="space-y-4 animate-fade-in">
            
            {/* If no active pipe track, load header form initializer */}
            {!activePipeId ? (
              <HeaderForm 
                onSaveHeader={handleSaveHeader} 
                isLoading={isSavingHeader} 
                existingPipeIds={pipeRecords.map(p => p.pipeId)}
                projects={projects}
                currentUserRole={currentUser?.role}
              />
            ) : (
              // Live tracking steps worksheet
              <div className="space-y-4">
                
                {/* Active pipe header toolbar banner */}
                <div className={`p-4 rounded-xl shadow-xs border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 ${theme === "midnight" ? "bg-slate-900 border-slate-800" : "bg-white border-gray-100"}`}>
                  <div>
                    <h2 className={`text-base font-extrabold tracking-wider ${theme === "midnight" ? "text-cyan-400" : "text-blue-900"}`}>
                      Worksheet: {activePipeId}
                    </h2>
                    <div className="flex flex-wrap gap-2 text-[11px] text-gray-500 mt-0.5">
                      <span>Type: <strong>{currentHeader?.pipeType}</strong></span>
                      <span>Diameter: <strong>{currentHeader?.diameter}mm</strong></span>
                      <span>Pressure: <strong>{currentHeader?.pressure}bar</strong></span>
                      <span>Lot N°: <strong>{currentHeader?.lotNo}</strong></span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={() => setIsEditingHeader(prev => !prev)}
                      className={`text-xs font-bold py-1.5 px-3 rounded-lg border transition cursor-pointer flex items-center gap-1 ${
                        isEditingHeader 
                          ? "bg-slate-800 border-slate-900 text-white" 
                          : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-100"
                      }`}
                    >
                      {isEditingHeader ? "Back to Quality Steps" : "Edit Setup & Identification"}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (confirm("Reset current loaded tracker form to initiate checking a new pipe?")) {
                          setActivePipeId("");
                          setCurrentHeader(null);
                          setActiveStep(1);
                          setIsEditingHeader(false);
                        }
                      }}
                      className="text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-100 py-1.5 px-3 rounded-lg transition"
                    >
                      Load/Scan Another Pipe
                    </button>
                  </div>
                </div>

                {isEditingHeader ? (
                  <div className="space-y-4">
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex justify-between items-center">
                      <div>
                        <h3 className="font-extrabold text-xs text-slate-800 uppercase tracking-widest">
                          Edit Pipe Identification Mode
                        </h3>
                        <p className="text-[11px] text-slate-500">Updating active dimensions and tolerances for serial tracker {activePipeId}.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsEditingHeader(false)}
                        className="text-xs font-bold text-gray-600 hover:text-gray-950 bg-white hover:bg-gray-100 border border-gray-250 py-1 py-2.5 px-3.5 rounded-lg transition"
                      >
                        Back to Worksheet
                      </button>
                    </div>

                    <HeaderForm 
                      initialData={currentHeader || undefined}
                      isEdit={true}
                      onSaveHeader={async (editedHeader) => {
                        await handleSaveHeader(editedHeader, activePipeId);
                        setIsEditingHeader(false);
                      }}
                      isLoading={isSavingHeader}
                      existingPipeIds={pipeRecords.map(p => p.pipeId)}
                      projects={projects}
                      currentUserRole={currentUser?.role}
                    />
                  </div>
                ) : (
                  <>
                    {/* Steps Horizontal Chips Navigation panel */}
                    <div className={`p-3 rounded-2xl border flex items-center gap-2 overflow-x-auto shadow-inner no-scrollbar ${theme === "midnight" ? "bg-slate-900 border-slate-800" : "bg-white border-gray-100"}`}>
                      {[1, 2, 3, 4, 5, 6, 7, 8].map((sNo) => renderStepCompletionChip(sNo))}
                    </div>

                    {/* Main dynamic worksheet form render */}
                    {currentHeader && (
                      <StepDetail
                        pipeId={activePipeId}
                        pipeHeader={currentHeader}
                        stepNo={activeStep}
                        savedStepData={currentSavedStepData}
                        onSaveStep={handleSaveStepData}
                        onUnsaveStep={handleUnsaveStepData}
                        onPrev={() => activeStep > 1 && setActiveStep(prev => prev - 1)}
                        onNext={() => activeStep < 8 && setActiveStep(prev => prev + 1)}
                        isSaving={isSavingStep}
                        allPipes={pipeRecords}
                        tolerances={tolerances}
                        currentUserRole={currentUser?.role}
                      />
                    )}

                    {/* Clear factory dispatch certificate on step-8 finished */}
                    {activePipeRecord && step8Completed && renderFactoryClearanceReport(activePipeRecord)}
                  </>
                )}

              </div>
            )}
          </div>
        )}

        {activeTab === "records" && (
          <div className="animate-fade-in">
            {isLoadingPipes && pipeRecords.length === 0 ? (
              <div className="text-center text-gray-500 py-16 animate-pulse flex flex-col items-center justify-center gap-2">
                <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
                <span>Reading full-stack multi-user ledger...</span>
              </div>
            ) : (
              <PipeDashboard
                records={pipeRecords}
                currentUser={currentUser}
                onEditRecord={handleLoadPipeIntoTracker}
                onDeleteRecord={handleDeletePipeRecord}
                onInspectRecord={handleLoadPipeIntoTracker}
                stats={dashboardStats || computedFallbackStats}
                activeOperators={activeOperators}
                recentLogs={recentLogs}
                projects={projects}
                tolerances={tolerances}
                onBulkReload={handleBulkReload}
              />
            )}
          </div>
        )}

        {activeTab === "analytics" && (
          <div className="animate-fade-in">
            <PortfolioAnalytics
              records={pipeRecords}
              currentUser={currentUser}
              projects={projects}
              tolerances={tolerances}
            />
          </div>
        )}

        {activeTab === "manual" && (
          <div className="animate-fade-in">
            <InteractiveTutorial currentUser={currentUser} pipeRecords={pipeRecords} activeOperators={activeOperators} appUsers={appUsers} />
          </div>
        )}

        {activeTab === "account" && (
          <div className="animate-fade-in">
            <AccountPanel
              currentUser={currentUser}
              onLogout={handleLogout}
              tolerances={tolerances}
              onRefreshTolerances={fetchTolerances}
              projects={projects}
              onRefreshProjects={fetchProjects}
              onRestoreDatabase={fetchBootstrapData}
            />
          </div>
        )}

        {activeTab === "chat" && (
          <div className="animate-fade-in">
            <DiscussionBoard
              currentUser={currentUser}
              chatMessages={chatMessages}
              activeOperators={activeOperators}
              onSendMessage={handleSendMessage}
              isLoadingHistory={isLoadingChat}
            />
          </div>
        )}

        {activeTab === "tracking-plane" && (
          <div className="animate-fade-in">
            <TrackingPlane
              records={pipeRecords}
              projects={projects}
              tolerances={tolerances}
              onLoadPipe={handleLoadPipeIntoTracker}
              currentUserRole={currentUser?.role}
              onDispatchPipe={handleDispatchPipe}
              onBulkReload={handleBulkReload}
            />
          </div>
        )}
        </React.Suspense>
      </main>

      {/* Primary Bottom Navigation Bar (Tracker / Records / Forecaster / Chat / Manual / Account) */}
      <footer className={`${currentThemeStyle.footer} border-t shadow-2xl fixed bottom-0 left-0 right-0 z-40 select-none transition-colors duration-300`}>
        <div className="max-w-4xl mx-auto grid grid-cols-7 text-center h-16 py-1.5">
          
          <button
            onClick={() => setActiveTab("tracker")}
            className={`flex flex-col items-center justify-center gap-0.5 text-xs transition group cursor-pointer ${
              activeTab === "tracker" ? currentThemeStyle.activeTab : currentThemeStyle.inactiveTab
            }`}
          >
            <Layers className="w-5 h-5 transition-transform group-active:scale-90" />
            <span>Tracker</span>
          </button>

          <button
            onClick={() => setActiveTab("records")}
            className={`flex flex-col items-center justify-center gap-0.5 text-xs transition group cursor-pointer ${
              activeTab === "records" ? currentThemeStyle.activeTab : currentThemeStyle.inactiveTab
            }`}
          >
            <TrendingUp className="w-5 h-5 transition-transform group-active:scale-90" />
            <span>Ledgers</span>
          </button>

          <button
            onClick={() => setActiveTab("tracking-plane")}
            className={`flex flex-col items-center justify-center gap-0.5 text-xs transition group cursor-pointer ${
              activeTab === "tracking-plane" ? currentThemeStyle.activeTab : currentThemeStyle.inactiveTab
            }`}
          >
            <Map className="w-5 h-5 transition-transform group-active:scale-90" />
            <span>Floor Map</span>
          </button>

          <button
            onClick={() => setActiveTab("analytics")}
            className={`flex flex-col items-center justify-center gap-0.5 text-xs transition group cursor-pointer ${
              activeTab === "analytics" ? currentThemeStyle.activeTab : currentThemeStyle.inactiveTab
            }`}
          >
            <Activity className="w-5 h-5 transition-transform group-active:scale-90" />
            <span>Analytics</span>
          </button>

          <button
            onClick={() => {
              setActiveTab("chat");
              fetchChatHistory();
            }}
            className={`flex flex-col items-center justify-center gap-0.5 text-xs transition group cursor-pointer ${
              activeTab === "chat" ? currentThemeStyle.activeTab : currentThemeStyle.inactiveTab
            }`}
          >
            <div className="relative">
              <MessageSquare className="w-5 h-5 transition-transform group-active:scale-90" />
              {unreadChatMessages > 0 && (
                <span className="absolute -top-1.5 -right-2.5 bg-red-500 text-white font-extrabold text-[9px] px-1 rounded-full flex items-center justify-center min-w-[16px] h-4 leading-none border border-white animate-bounce shadow-md">
                  {unreadChatMessages}
                </span>
              )}
            </div>
            <span>Floor Chat</span>
          </button>

          <button
            onClick={() => setActiveTab("manual")}
            className={`flex flex-col items-center justify-center gap-0.5 text-xs transition group cursor-pointer ${
              activeTab === "manual" ? currentThemeStyle.activeTab : currentThemeStyle.inactiveTab
            }`}
          >
            <BookOpen className="w-5 h-5 transition-transform group-active:scale-90" />
            <span>Guide</span>
          </button>

          <button
            onClick={() => setActiveTab("account")}
            className={`flex flex-col items-center justify-center gap-0.5 text-xs transition group cursor-pointer ${
              activeTab === "account" ? currentThemeStyle.activeTab : currentThemeStyle.inactiveTab
            }`}
          >
            <UserIcon className="w-5 h-5 transition-transform group-active:scale-90" />
            <span>Account</span>
          </button>

        </div>
      </footer>

    </div>
  );
}
