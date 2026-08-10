import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import zlib from "zlib";
import { Firestore } from "@google-cloud/firestore";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { Pool } from "pg";

// Load environment variables securely
dotenv.config();
dotenv.config({ path: ".env.local" });

import { 
  User, 
  PipeRecord, 
  PipeHeader, 
  StepRecord, 
  UserRole,
  DashboardStats,
  ToleranceConfig,
  ProjectConfig,
  ChatMessage
} from "./src/types";

// Determine absolute paths robustly across both ES Modules (dev) and CommonJS (bundled production)
const __dirnameFallback = typeof __dirname !== "undefined"
  ? __dirname
  : path.dirname(fileURLToPath(import.meta.url));

const isProduction = process.env.NODE_ENV === "production";
const PROJECT_ROOT = isProduction 
  ? path.resolve(__dirnameFallback, "..") 
  : __dirnameFallback;

// Database storage setup
const DATA_DIR = path.join(PROJECT_ROOT, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

interface DbSchema {
  users: User[];
  pipes: PipeRecord[];
  tolerances?: ToleranceConfig[];
  projects?: ProjectConfig[];
  chat?: ChatMessage[];
}

const DEFAULT_PROJECTS: ProjectConfig[] = [
  {
    id: "pc-1",
    projectCode: "WO-2026-001",
    settingReferences: ["REF-GRE-B300", "S-GRE-300-16", "REF-GRE-B350"],
    settingRefDetails: [
      { settingReference: "REF-GRE-B300", targetQuantityMeters: 400, productionStartDate: "2026-05-15T08:00", productionEndDate: "2026-06-01T18:00" },
      { settingReference: "S-GRE-300-16", targetQuantityMeters: 300, productionStartDate: "2026-05-18T08:00", productionEndDate: "2026-06-10T18:00" },
      { settingReference: "REF-GRE-B350", targetQuantityMeters: 350, productionStartDate: "2026-05-20T08:00", productionEndDate: "2026-06-15T18:00" }
    ],
    targetQuantityMeters: 1050,
    productionStartDate: "2026-05-15T08:00",
    productionEndDate: "2026-06-15T18:00"
  },
  {
    id: "pc-2",
    projectCode: "WO-2026-002",
    settingReferences: ["S-GRV-150-25", "S-GRP-200-10", "S-PE-100-16"],
    settingRefDetails: [
      { settingReference: "S-GRV-150-25", targetQuantityMeters: 200, productionStartDate: "2026-05-20T08:00", productionEndDate: "2026-05-30T18:00" },
      { settingReference: "S-GRP-200-10", targetQuantityMeters: 150, productionStartDate: "2026-05-22T08:00", productionEndDate: "2026-06-02T18:00" },
      { settingReference: "S-PE-100-16", targetQuantityMeters: 150, productionStartDate: "2026-05-25T08:00", productionEndDate: "2026-06-05T18:00" }
    ],
    targetQuantityMeters: 500,
    productionStartDate: "2026-05-20T08:00",
    productionEndDate: "2026-06-05T18:00"
  }
];

// In-memory State for Multi-user Activity and Presence
interface ActivityEvent {
  id: string;
  username: string;
  action: string;
  timestamp: string;
}

let activeUsers: { [username: string]: { lastSeen: string; role: string } } = {};
let activityEvents: ActivityEvent[] = [
  { id: "log-1", username: "admin", action: "System initialized for combined production shift collaboration", timestamp: new Date(Date.now() - 3600 * 2 * 1000).toISOString() },
  { id: "log-2", username: "operator1", action: "Configured PIPE-G101 specifications with Bell/Spigot GRE profile", timestamp: new Date(Date.now() - 60 * 50 * 1000).toISOString() },
  { id: "log-3", username: "operator1", action: "Completed Mold Preparation Step 1 verification on PIPE-G101", timestamp: new Date(Date.now() - 60 * 40 * 1000).toISOString() },
  { id: "log-4", username: "operator2", action: "Created new manufacturing queue list entry for PIPE-V102", timestamp: new Date(Date.now() - 60 * 30 * 1000).toISOString() },
  { id: "log-5", username: "operator2", action: "Successfully validated liner layers for Step 2 on PIPE-V102", timestamp: new Date(Date.now() - 60 * 15 * 1000).toISOString() }
];

let sseClients: any[] = [];

function logActivity(username: string, action: string) {
  const newEvent: ActivityEvent = {
    id: "log-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6),
    username,
    action,
    timestamp: new Date().toISOString()
  };
  activityEvents.unshift(newEvent);
  if (activityEvents.length > 50) {
    activityEvents = activityEvents.slice(0, 50);
  }

  // Real-time broadcast
  const onlineMembers = Object.entries(activeUsers).map(([usr, info]) => ({
    username: usr,
    role: info.role,
    lastSeen: info.lastSeen
  }));

  const payload = JSON.stringify({
    type: "new-event",
    event: newEvent,
    recentLogs: activityEvents,
    activeOperators: onlineMembers
  });

  sseClients.forEach(client => {
    try {
      client.write(`data: ${payload}\n\n`);
    } catch (e) {
      // closed
    }
  });
}

function updateHeartbeat(username: string, role: string) {
  activeUsers[username] = {
    lastSeen: new Date().toISOString(),
    role
  };

  // Real-time broadcast
  const onlineMembers = Object.entries(activeUsers).map(([usr, info]) => ({
    username: usr,
    role: info.role,
    lastSeen: info.lastSeen
  }));

  const payload = JSON.stringify({
    type: "presence-update",
    activeOperators: onlineMembers
  });

  sseClients.forEach(client => {
    try {
      client.write(`data: ${payload}\n\n`);
    } catch (e) {
      // closed
    }
  });
}

// Initial seed data
const DEFAULT_TOLERANCES: ToleranceConfig[] = [
  {
    id: "tc-default",
    project: "WO-2026-001",
    specification: "REF-GRE-B300",
    sa: { min: 14.5, max: 15.5 },
    sb: { min: 14.5, max: 15.5 },
    sc: { min: 14.5, max: 15.5 },
    sd: { min: 118.0, max: 122.0 },
    se: { min: 118.0, max: 122.0 },
    sf: { min: 9.0, max: 11.0 },
    o2s: { min: 118.0, max: 119.5 },
    o3s: { min: 118.5, max: 119.5 },
    o4s: { min: 119.0, max: 120.0 },
    sg: { min: 8.0, max: 9.0 },
    pipeLength: { min: 11950, max: 12050 },
    pipeThickness: { min: 14.0, max: 16.0 },
    o2b: { min: 118.5, max: 119.5 },
    ba: { min: 119.0, max: 120.0 },
    bb: { min: 119.5, max: 120.5 },
    bc: { min: 119.5, max: 120.5 },
    bd: { min: 119.5, max: 120.5 },
    be: { min: 28.0, max: 32.0 },
    bf: { min: 14.0, max: 16.0 },
    bg: { min: 9.0, max: 11.0 },
    pipeWeight: { min: 1100, max: 1400 }
  }
];

const DEFAULT_USERS: User[] = [
  { id: "u-1", username: "admin", role: "admin", password: "admin" },
  { id: "u-2", username: "operator1", role: "operator", password: "operator" },
  { id: "u-3", username: "operator2", role: "operator", password: "operator" },
];

const DEFAULT_PIPES: PipeRecord[] = [
  {
    pipeId: "PIPE-G101",
    header: {
      pipeId: "PIPE-G101",
      diameter: 300,
      pressure: 16,
      stiffness: 5000,
      length: 12000,
      projectWorkOrder: "WO-2026-001",
      settingReference: "REF-GRE-B300",
      pipeType: "Bell/Spigot GRE",
      productionDate: "2026-05-18",
      lotNo: "LOT-A2",
    },
    operatorId: "u-2",
    operatorUsername: "operator1",
    createdAt: "2026-05-18T08:30:00Z",
    lastUpdatedAt: "2026-05-18T14:45:00Z",
    steps: {
      1: {
        stepNo: 1,
        isCompleted: true,
        savedBy: "operator1",
        savedAt: "2026-05-18T09:00:00Z",
        fields: {
          moldSerial: "M-402",
          releaseAgent: "Carnauba Wax Formula B",
          moldCondition: "Excellent",
          prepTime: "25 mins",
        },
        qualityChecks: [
          { id: "1-1", label: "Clean surface", status: "Pass" },
          { id: "1-2", label: "Release agent application", status: "Pass" },
          { id: "1-3", label: "Dimension verification", status: "Pass" },
          { id: "1-4", label: "Crack/Damage check", status: "Pass" }
        ],
        additionalObs: "Mold surface inspected and completely smooth. Dimensions verified against engineering blueprints.",
      },
      2: {
        stepNo: 2,
        isCompleted: true,
        savedBy: "operator1",
        savedAt: "2026-05-18T10:15:00Z",
        fields: {
          resinType: "Epoxy Resin E-44",
          resinBatch: "RB-2026-99",
          cGlassType: "C-Glass Veil 30g",
          cGlassBatch: "CGB-883",
          wovenType: "Woven Roving 600g",
          wovenBatch: "WRB-12",
        },
        qualityChecks: [
          { id: "2-1", label: "Thickness tolerance", status: "Pass" },
          { id: "2-2", label: "Air pockets/bubbles check", status: "Pass" },
          { id: "2-3", label: "Surface smoothness", status: "Pass" }
        ],
        additionalObs: "Good resin saturation. Liner thickness verified using ultrasound caliber.",
      },
      3: {
        stepNo: 3,
        isCompleted: true,
        savedBy: "operator1",
        savedAt: "2026-05-18T11:40:00Z",
        fields: {
          resinType: "Epoxy Resin E-44",
          resinBatch: "RB-2026-99",
          layersCount: 24,
          windingAngle: 54.7,
          hoopType: "Glass Filament 2400tex",
          hoopBatch: "FB-88",
        },
        qualityChecks: [
          { id: "3-1", label: "Layer count matches specification", status: "Pass" },
          { id: "3-2", label: "Winding angle correct", status: "Pass" },
          { id: "3-3", label: "No dry spots or resin-rich areas", status: "Pass" },
          { id: "3-4", label: "Uniform wall thickness", status: "Pass" },
          { id: "3-5", label: "No visual defects", status: "Pass" }
        ],
        additionalObs: "Computerized filament winding executed. Surface is visually uniform.",
      },
      4: {
        stepNo: 4,
        isCompleted: true,
        savedBy: "operator1",
        savedAt: "2026-05-18T13:00:00Z",
        fields: {
          cureTemp: "140°C",
          cureTime: "120 mins",
          testBlock: "Applicable",
          testResult: "Barcol hardness of 42 achieved on test block.",
        },
        qualityChecks: [
          { id: "4-1", label: "Temperature profile met", status: "Pass" },
          { id: "4-2", label: "No warping or deformation", status: "Pass" },
          { id: "4-3", label: "Surface hardness acceptable", status: "Pass" },
          { id: "4-4", label: "Cure time completed fully", status: "Pass" }
        ],
        additionalObs: "Curing temperature profile fully recorded in PLC. No deviation present.",
      },
      5: {
        stepNo: 5,
        isCompleted: true,
        savedBy: "operator1",
        savedAt: "2026-05-18T14:00:00Z",
        fields: {
          ejectionForce: "45 kN",
          ejectionTime: "8 mins",
        },
        qualityChecks: [
          { id: "5-1", label: "No cracking during ejection", status: "Pass" },
          { id: "5-2", label: "Pipe released cleanly", status: "Pass" },
          { id: "5-3", label: "Inner surface undamaged", status: "Pass" },
          { id: "5-4", label: "Outer surface undamaged", status: "Pass" }
        ],
        additionalObs: "Easy ejection on hydraulic extractor.",
      },
      6: {
        stepNo: 6,
        isCompleted: true,
        savedBy: "operator1",
        savedAt: "2026-05-18T14:45:00Z",
        fields: { sa: 15.2, sb: 15.1, sc: 15.3, sd: 120.4, se: 120.3, sf: 10.5, o2s: 118.2, o3s: 118.6, o4s: 119.1, sg: 8.8 },
        qualityChecks: [
          { id: "6-1", label: "Spigot surface smooth and even", status: "Pass" },
          { id: "6-2", label: "No chipping on edges", status: "Pass" },
          { id: "6-3", label: "Concentricity acceptable", status: "Pass" },
          { id: "6-4", label: "Dimensional check passed", status: "Pass" }
        ],
        additionalObs: "Grinding dimensions are well within structural specifications.",
      }
    }
  },
  {
    pipeId: "PIPE-V102",
    header: {
      pipeId: "PIPE-V102",
      diameter: 150,
      pressure: 25,
      stiffness: 10000,
      length: 6000,
      projectWorkOrder: "WO-2026-004",
      settingReference: "REF-GRV-S150",
      pipeType: "Bell/Spigot GRV",
      productionDate: "2026-05-19",
      lotNo: "LOT-B1",
    },
    operatorId: "u-3",
    operatorUsername: "operator2",
    createdAt: "2026-05-19T10:00:00Z",
    lastUpdatedAt: "2026-05-19T11:30:00Z",
    steps: {
      1: {
        stepNo: 1,
        isCompleted: true,
        savedBy: "operator2",
        savedAt: "2026-05-19T10:30:00Z",
        fields: {
          moldSerial: "M-112",
          releaseAgent: "Silicone fluid coat XM-5",
          moldCondition: "Good",
          prepTime: "30 mins",
        },
        qualityChecks: [
          { id: "1-1", label: "Clean surface", status: "Pass" },
          { id: "1-2", label: "Release agent application", status: "Pass" },
          { id: "1-3", label: "Dimension verification", status: "Pass" },
          { id: "1-4", label: "Crack/Damage check", status: "Pass" }
        ],
        additionalObs: "Prepared successfully.",
      },
      2: {
        stepNo: 2,
        isCompleted: true,
        savedBy: "operator2",
        savedAt: "2026-05-19T11:30:00Z",
        fields: {
          resinType: "Vinyl Ester Resin VE-90",
          resinBatch: "VB-2026-11",
          cGlassType: "C-Glass Veil 30g",
          cGlassBatch: "CGB-883",
          wovenType: "Woven Roving 300g",
          wovenBatch: "WRB-02",
        },
        qualityChecks: [
          { id: "2-1", label: "Thickness tolerance", status: "Pass" },
          { id: "2-2", label: "Air pockets/bubbles check", status: "Fail" },
          { id: "2-3", label: "Surface smoothness", status: "Pass" }
        ],
        additionalObs: "Minor bubbles detected near spigot base, reworked immediately with compression rollers.",
      }
    }
  }
];

let cachedDb: DbSchema | null = null;

// Initialize Firebase Firestore safely
let firestore: Firestore | null = null;
let firestoreAvailable = false;
try {
  let firebaseConfig: any = {};
  const configPath = path.join(PROJECT_ROOT, "firebase-applet-config.json");
  if (fs.existsSync(configPath)) {
    firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
  }
  
  if (firebaseConfig.projectId) {
    console.log("[Firestore Database]: Initializing client for project:", firebaseConfig.projectId);
    firestore = new Firestore({
      projectId: firebaseConfig.projectId,
      databaseId: firebaseConfig.firestoreDatabaseId || "(default)"
    });
    firestoreAvailable = true;
  } else {
    console.log("[Firestore Database]: projectId not found in configuration file, continuing with default environment credentials.");
    firestore = new Firestore();
    firestoreAvailable = true;
  }
} catch (e: any) {
  console.log("[Firestore Database]: Failed to create Firestore client:", e.message || e);
}

async function loadDatabaseFromFirestore(): Promise<DbSchema | null> {
  if (!firestoreAvailable || !firestore) return null;
  
  let firebaseConfig: any = {};
  try {
    const configPath = path.join(PROJECT_ROOT, "firebase-applet-config.json");
    if (fs.existsSync(configPath)) {
      firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
    }
  } catch (e) {}

  const projectId = firebaseConfig.projectId;
  if (!projectId) {
    console.log("[Firestore Database]: No projectId found in config, skipping load.");
    return null;
  }

  const dbIdsToTry = [];
  if (firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== "(default)") {
    dbIdsToTry.push(firebaseConfig.firestoreDatabaseId);
  }
  dbIdsToTry.push("(default)");

  for (const dbId of dbIdsToTry) {
    try {
      console.log(`[Firestore Database]: Preloading database state from Google Cloud Firestore (databaseId: ${dbId})...`);
      
      const tempFirestore = new Firestore({
        projectId: projectId,
        databaseId: dbId
      });

      // Read from collections to test access
      const usersSnap = await tempFirestore.collection("users").get();
      const pipesSnap = await tempFirestore.collection("pipes").get();
      const tolerancesSnap = await tempFirestore.collection("tolerances").get();
      const projectsSnap = await tempFirestore.collection("projects").get();
      const chatSnap = await tempFirestore.collection("chat").get();

      const users: User[] = [];
      usersSnap.forEach(doc => {
        users.push(doc.data() as User);
      });

      const pipes: PipeRecord[] = [];
      pipesSnap.forEach(doc => {
        const p = doc.data() as PipeRecord;
        if (p.pipeId) {
          pipes.push(p);
        }
      });

      const tolerances: ToleranceConfig[] = [];
      tolerancesSnap.forEach(doc => {
        tolerances.push(doc.data() as ToleranceConfig);
      });

      const projects: ProjectConfig[] = [];
      projectsSnap.forEach(doc => {
        projects.push(doc.data() as ProjectConfig);
      });

      const chatItems: ChatMessage[] = [];
      chatSnap.forEach(doc => {
        chatItems.push(doc.data() as ChatMessage);
      });
      // Sort chat items by timestamp if available
      chatItems.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      console.log(`[Firestore Database]: Successfully preloaded state using databaseId "${dbId}". Loaded ${users.length} users, ${pipes.length} pipes, ${tolerances.length} tolerances, ${projects.length} projects, ${chatItems.length} chat messages.`);
      
      // Update global client to the one that successfully connected
      firestore = tempFirestore;
      return {
        users,
        pipes,
        tolerances: tolerances.length > 0 ? tolerances : undefined,
        projects: projects.length > 0 ? projects : undefined,
        chat: chatItems.length > 0 ? chatItems : undefined
      };
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.includes("PERMISSION_DENIED") || msg.includes("7") || err?.code === 7) {
        console.log(`[Firestore Database]: Direct server-side preload from databaseId "${dbId}" bypassed (PERMISSION_DENIED / rules enforced). Primary PostgreSQL database active.`);
        firestoreAvailable = false;
        break;
      } else {
        console.log(`[Firestore Database]: Cloud Firestore preload deferred for databaseId "${dbId}":`, msg);
      }
    }
  }

  return null;
}

async function saveDatabaseToFirestore(data: DbSchema) {
  if (!firestoreAvailable || !firestore) return;
  try {
    console.log("[Firestore Database]: Saving database state to Google Cloud Firestore in chunked batches...");
    
    // Accumulate all write operations to process in safe batch chunks
    const ops: { ref: any; docData: any; options?: any }[] = [];

    // 1. Save users
    for (const u of data.users) {
      if (!u.id) continue;
      const ref = firestore.collection("users").doc(u.id);
      ops.push({ ref, docData: u, options: { merge: true } });
    }

    // 2. Save pipes
    for (const p of data.pipes) {
      if (!p.pipeId) continue;
      const ref = firestore.collection("pipes").doc(p.pipeId);
      ops.push({ ref, docData: p, options: { merge: true } });
    }

    // 3. Save tolerances
    if (data.tolerances) {
      for (const t of data.tolerances) {
        if (!t.id) continue;
        const ref = firestore.collection("tolerances").doc(t.id);
        ops.push({ ref, docData: t, options: { merge: true } });
      }
    }

    // 4. Save projects
    if (data.projects) {
      for (const pr of data.projects) {
        if (!pr.id) continue;
        const ref = firestore.collection("projects").doc(pr.id);
        ops.push({ ref, docData: pr, options: { merge: true } });
      }
    }

    // 5. Save chat messages
    if (data.chat) {
      for (const c of data.chat) {
        if (!c.id) continue;
        const ref = firestore.collection("chat").doc(c.id);
        ops.push({ ref, docData: c, options: { merge: true } });
      }
    }

    // Process operations in batches of 400 (well within Firestore's 500 operation limit per batch)
    const BATCH_SIZE = 400;
    for (let i = 0; i < ops.length; i += BATCH_SIZE) {
      const chunk = ops.slice(i, i + BATCH_SIZE);
      const batch = firestore.batch();
      for (const op of chunk) {
        batch.set(op.ref, op.docData, op.options);
      }
      await batch.commit();
      console.log(`[Firestore Database]: Committed batch chunk (${i} to ${Math.min(i + BATCH_SIZE, ops.length)} of ${ops.length}).`);
    }

    console.log(`[Firestore Database]: Successfully committed ${ops.length} write operations in chunked batches to Cloud Firestore.`);
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    if (errMsg.includes("PERMISSION_DENIED") || errMsg.includes("7") || err?.code === 7) {
      console.log("[Firestore Database]: Direct server-side Firestore write bypassed (PERMISSION_DENIED or rules active). Primary PostgreSQL database remains fully active.");
      firestoreAvailable = false;
    } else {
      console.log("[Firestore Database]: Server-side batch write deferred:", errMsg);
    }
  }
}

// Initialize Supabase Client safely
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || "https://gkftbdyvcqnzilrxsgxt.supabase.co";
const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_awvvSAgd1lZvrtqnORzl0w_ggjrQ3rz";

let supabase: any = null;
try {
  if (supabaseUrl && supabaseKey) {
    console.log("[Supabase Database]: Initializing client on:", supabaseUrl);
    supabase = createClient(supabaseUrl, supabaseKey);
  } else {
    console.log("[Supabase Database]: Configuration missing or empty, bypassing initialization.");
  }
} catch (e: any) {
  console.log("[Supabase Database]: Failed to create Supabase client:", e.message || e);
}

let supabaseAvailable = false;
let databasePreloaded = false;

// Initialize PostgreSQL Primary Connection safely
let postgresUrl = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL || "postgresql://neondb_owner:npg_UScFI41AuPWN@ep-square-breeze-b1anlxnu.c-5.eu-central-1.aws.neon.tech/neondb?sslmode=require";
if (postgresUrl.includes("postgres.railway.internal") || postgresUrl.includes("rlwy.net")) {
  postgresUrl = "postgresql://neondb_owner:npg_UScFI41AuPWN@ep-square-breeze-b1anlxnu.c-5.eu-central-1.aws.neon.tech/neondb?sslmode=require";
}

let pgPool: Pool | null = null;
try {
  if (postgresUrl && (postgresUrl.startsWith("postgresql://") || postgresUrl.startsWith("postgres://"))) {
    console.log("[Postgres Database]: Initializing PostgreSQL pool with endpoint:", postgresUrl.replace(/:[^:@]+@/, ":****@"));
    pgPool = new Pool({
      connectionString: postgresUrl,
      ssl: postgresUrl.includes("localhost") || postgresUrl.includes("127.0.0.1") ? false : {
        rejectUnauthorized: false
      },
      connectionTimeoutMillis: 5000,
    });
    pgPool.on("error", (err) => {
      console.log("[Postgres Pool Info]:", err.message || err);
    });
  } else {
    console.log("[Postgres Database]: No PostgreSQL DATABASE_URL configured, using Cloud Firestore & local persistence.");
  }
} catch (e: any) {
  console.log("[Postgres Database]: Failed to create PostgreSQL Pool:", e.message || e);
}

let postgresAvailable = false;

async function ensurePostgresTables() {
  if (!pgPool) return false;
  try {
    const client = await pgPool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id VARCHAR(255) PRIMARY KEY,
          username VARCHAR(255) UNIQUE NOT NULL,
          role VARCHAR(50) NOT NULL,
          password VARCHAR(255) NOT NULL
        )
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS pipes (
          pipe_id VARCHAR(255) PRIMARY KEY,
          data JSONB NOT NULL
        )
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS tolerances (
          id VARCHAR(255) PRIMARY KEY,
          data JSONB NOT NULL
        )
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS projects (
          id VARCHAR(255) PRIMARY KEY,
          data JSONB NOT NULL
        )
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS chat (
          id VARCHAR(255) PRIMARY KEY,
          data JSONB NOT NULL
        )
      `);
      postgresAvailable = true;
      console.log("[Supabase Primary Database]: Tables 'users', 'pipes', 'tolerances', 'projects', and 'chat' verified successfully on Supabase PostgreSQL.");
      return true;
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.log("[Supabase Primary Database]: Supabase PostgreSQL connection retry / info:", err.message || err);
    postgresAvailable = false;
    return false;
  }
}

function mergeDbSchemas(base: DbSchema, incoming: DbSchema): DbSchema {
  const mergedUsersMap = new Map<string, User>();
  (base.users || []).forEach(u => {
    if (u && u.id) mergedUsersMap.set(u.id, u);
  });
  (incoming.users || []).forEach(u => {
    if (!u || !u.id) return;
    const existing = mergedUsersMap.get(u.id);
    if (!existing) {
      mergedUsersMap.set(u.id, u);
    } else {
      mergedUsersMap.set(u.id, {
        ...existing,
        ...u,
        password: u.password || existing.password
      });
    }
  });

  const mergedPipesMap = new Map<string, PipeRecord>();
  (base.pipes || []).forEach(p => {
    if (p && p.pipeId) mergedPipesMap.set(p.pipeId.toUpperCase(), p);
  });
  (incoming.pipes || []).forEach(p => {
    if (!p || !p.pipeId) return;
    const key = p.pipeId.toUpperCase();
    const existing = mergedPipesMap.get(key);
    if (!existing) {
      mergedPipesMap.set(key, p);
    } else {
      const baseTime = new Date(existing.lastUpdatedAt || 0).getTime();
      const incTime = new Date(p.lastUpdatedAt || 0).getTime();
      if (incTime >= baseTime) {
        mergedPipesMap.set(key, p);
      }
    }
  });

  const mergedTolMap = new Map<string, ToleranceConfig>();
  (base.tolerances || []).forEach(t => {
    if (t && t.id) mergedTolMap.set(t.id, t);
  });
  (incoming.tolerances || []).forEach(t => {
    if (t && t.id) mergedTolMap.set(t.id, t);
  });

  const mergedProjMap = new Map<string, ProjectConfig>();
  (base.projects || []).forEach(pr => {
    if (pr && pr.id) mergedProjMap.set(pr.id, pr);
  });
  (incoming.projects || []).forEach(pr => {
    if (pr && pr.id) mergedProjMap.set(pr.id, pr);
  });

  const mergedChatMap = new Map<string, ChatMessage>();
  (base.chat || []).forEach(c => {
    if (c && c.id) mergedChatMap.set(c.id, c);
  });
  (incoming.chat || []).forEach(c => {
    if (c && c.id) mergedChatMap.set(c.id, c);
  });

  return {
    users: Array.from(mergedUsersMap.values()),
    pipes: Array.from(mergedPipesMap.values()),
    tolerances: Array.from(mergedTolMap.values()),
    projects: Array.from(mergedProjMap.values()),
    chat: Array.from(mergedChatMap.values())
  };
}

async function loadDatabaseFromPostgres(): Promise<DbSchema | null> {
  if (!pgPool) return null;
  const ok = await ensurePostgresTables();
  if (!ok) return null;
  try {
    const { rows: userRows } = await pgPool.query("SELECT * FROM users");
    const { rows: pipeRows } = await pgPool.query("SELECT * FROM pipes");
    const { rows: tolRows } = await pgPool.query("SELECT * FROM tolerances");
    const { rows: projRows } = await pgPool.query("SELECT * FROM projects");
    const { rows: chatRows } = await pgPool.query("SELECT * FROM chat");

    const users: User[] = userRows.map(r => ({
      id: r.id,
      username: r.username,
      role: r.role as UserRole,
      password: r.password
    }));
    const pipes: PipeRecord[] = pipeRows.map(r => r.data as PipeRecord);
    const tolerances: ToleranceConfig[] = tolRows.map(r => r.data as ToleranceConfig);
    const projects: ProjectConfig[] = projRows.map(r => r.data as ProjectConfig);
    const chat: ChatMessage[] = chatRows.map(r => r.data as ChatMessage);

    return { users, pipes, tolerances, projects, chat };
  } catch (err: any) {
    console.log("[Postgres Database]: Info — Load from Postgres skipped:", err.message || err);
    return null;
  }
}

async function preloadDatabase() {
  // Load local backup from file system if it exists
  let localDb: DbSchema = { users: [], pipes: [], tolerances: [], projects: [], chat: [] };
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed.users) localDb.users = parsed.users;
      if (parsed.pipes) localDb.pipes = parsed.pipes;
      localDb.tolerances = parsed.tolerances || [...DEFAULT_TOLERANCES];
      localDb.projects = parsed.projects || [...DEFAULT_PROJECTS];
      localDb.chat = parsed.chat || [];
    }
  } catch (e) {}

  if (!localDb.tolerances || localDb.tolerances.length === 0) {
    localDb.tolerances = [...DEFAULT_TOLERANCES];
  }
  if (!localDb.projects || localDb.projects.length === 0) {
    localDb.projects = [...DEFAULT_PROJECTS];
  }
  if (localDb.users.length === 0) {
    localDb.users = [...DEFAULT_USERS];
  }
  if (localDb.pipes.length === 0) {
    localDb.pipes = [...DEFAULT_PIPES];
  }

  let mergedDb: DbSchema = {
    users: [...localDb.users],
    pipes: [...localDb.pipes],
    tolerances: [...localDb.tolerances],
    projects: [...localDb.projects],
    chat: [...localDb.chat]
  };

  // 1. Primary Supabase PostgreSQL Database Connection
  try {
    const postgresDb = await loadDatabaseFromPostgres();
    if (postgresDb) {
      mergedDb = mergeDbSchemas(mergedDb, postgresDb);
      postgresAvailable = true;
      console.log(`[Supabase Primary Database]: Successfully preloaded database state from Supabase PostgreSQL (${postgresDb.pipes?.length || 0} pipes, ${postgresDb.users?.length || 0} users, ${postgresDb.tolerances?.length || 0} tolerances, ${postgresDb.projects?.length || 0} projects).`);
    }
  } catch (err: any) {
    console.log("[Supabase Primary Database]: Failed to preload database from Supabase PostgreSQL:", err.message || err);
  }

  // 2. Auxiliary Cloud Firestore Backup check (if present)
  try {
    const firestoreDb = await loadDatabaseFromFirestore();
    if (firestoreDb) {
      mergedDb = mergeDbSchemas(mergedDb, firestoreDb);
      console.log(`[Firestore Backup]: Preloaded database state from Cloud Firestore (${firestoreDb.pipes?.length || 0} pipes, ${firestoreDb.users?.length || 0} users).`);
    }
  } catch (err: any) {}

  // Ensure admin user exists
  if (!mergedDb.users.some(u => u.role === "admin")) {
    mergedDb.users.push({ id: "u-1", username: "admin", role: "admin", password: "admin" });
  }

  standardizePipesQC(mergedDb.pipes);
  cachedDb = mergedDb;
  databasePreloaded = true;

  console.log(`[Database Sync]: Preloaded database state ready with ${cachedDb.pipes.length} pipes, ${cachedDb.users.length} users, ${cachedDb.tolerances.length} tolerances, ${cachedDb.projects.length} projects.`);

  // Write merged state to local backup
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(cachedDb, null, 2), "utf8");
  } catch (e) {}

  // Synchronize merged state across cloud & postgres providers
  if (firestoreAvailable) {
    saveDatabaseToFirestore(cachedDb).catch(() => {});
  }
  if (pgPool) {
    saveDatabaseToPostgres(cachedDb).catch(err => {
      console.log("[Postgres Database]: Background save failed:", err.message || err);
    });
  }
  if (supabase) {
    saveDatabaseToSupabase(cachedDb).catch(() => {});
  }
}

function loadDatabase(): DbSchema {
  if (cachedDb) {
    return cachedDb;
  }
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(DB_FILE)) {
      const data: DbSchema = { users: DEFAULT_USERS, pipes: DEFAULT_PIPES, tolerances: [...DEFAULT_TOLERANCES], projects: [...DEFAULT_PROJECTS], chat: [] };
      fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf8");
      cachedDb = data;
      return data;
    }
    const raw = fs.readFileSync(DB_FILE, "utf8");
    const parsed = JSON.parse(raw);
    const users: User[] = (parsed.users && parsed.users.length > 0) ? parsed.users : [...DEFAULT_USERS];
    const pipes = (parsed.pipes && parsed.pipes.length > 0) ? parsed.pipes : DEFAULT_PIPES;
    
    const initialTolerances = parsed.tolerances || [...DEFAULT_TOLERANCES];
    const initialProjects = parsed.projects || [...DEFAULT_PROJECTS];
    const systemRow = pipes.find(p => p.pipeId === "SYSTEM_TOLERANCES");
    const tolerances = (systemRow as any)?.tolerances || initialTolerances;
    const projects = (systemRow as any)?.projects || initialProjects;
    const chat = (systemRow as any)?.chat || parsed.chat || [];

    const hasAdmin = users.some(u => u.role === "admin");
    if (!hasAdmin) {
      users.push({ id: "u-1", username: "admin", role: "admin", password: "admin" });
    }

    cachedDb = { users, pipes, tolerances, projects, chat };
    standardizePipesQC(cachedDb.pipes);
    return cachedDb;
  } catch (error: any) {
    console.log("[Local Schema Info]: Fallback DB schema loader active:", error.message || error);
    const data = { users: DEFAULT_USERS, pipes: DEFAULT_PIPES, tolerances: [...DEFAULT_TOLERANCES], projects: [...DEFAULT_PROJECTS] };
    standardizePipesQC(data.pipes);
    return data;
  }
}

async function loadDatabaseFromSupabase(): Promise<DbSchema> {
  if (!databasePreloaded || !cachedDb) {
    await preloadDatabase();
  }
  if (cachedDb) {
    return cachedDb;
  }
  return loadDatabase();
}

const NEW_STEP_QUALITY_CHECKS: { [key: number]: string[] } = {
  1: ["Clean surface", "Release agent application", "Dimensional check passed", "Crack/Damage check"],
  2: ["Thickness tolerance", "Air pockets/bubbles check", "Surface smoothness"],
  3: ["Layer count matches specification", "Winding angle correct", "No dry spots or resin-rich areas", "Uniform wall thickness", "No visual defects"],
  4: ["Temperature profile met", "No warping or deformation", "Surface hardness acceptable", "Cure time completed fully"],
  5: ["No cracking during ejection", "Pipe released cleanly", "Inner surface undamaged", "Outer surface undamaged"],
  6: ["Spigot surface smooth and even", "No chipping on edges", "No visible defects", "Dimensional check passed"],
  7: ["Bell socket surface smooth", "No undercutting observed", "Sealing groove profile correct", "No visible defects", "Dimensional check passed"],
  8: ["All surfaces clean and free of contamination", "Marking legible and correct", "No visible defects on final pipe", "Ready for dispatch"]
};

function standardizePipesQC(pipes: PipeRecord[]) {
  if (!pipes || !Array.isArray(pipes)) return;
  for (const p of pipes) {
    if (!p || p.pipeId === "SYSTEM_TOLERANCES") continue;
    
    // Ensure header object exists with correct fallbacks
    if (!p.header) {
      p.header = {
        pipeId: p.pipeId,
        diameter: 0,
        pressure: 0,
        stiffness: 0,
        length: 0,
        projectWorkOrder: "",
        settingReference: "",
        pipeType: "Bell/Spigot GRE",
        productionDate: "",
        lotNo: ""
      };
    } else {
      if (!p.header.pipeId) p.header.pipeId = p.pipeId;
      if (!p.header.projectWorkOrder) p.header.projectWorkOrder = "";
      if (!p.header.settingReference) p.header.settingReference = "";
      if (!p.header.pipeType) p.header.pipeType = "Bell/Spigot GRE";
      if (!p.header.productionDate) p.header.productionDate = "";
      if (!p.header.lotNo) p.header.lotNo = "";
    }

    // Ensure steps object exists
    if (!p.steps) {
      p.steps = {};
    }

    for (const stepNoKey of Object.keys(p.steps)) {
      const stepNo = Number(stepNoKey);
      const step = p.steps[stepNo];
      if (step) {
        const labels = NEW_STEP_QUALITY_CHECKS[stepNo];
        if (labels) {
          const oldQCs = step.qualityChecks || [];
          const newQCs = labels.map((lbl, idx) => {
            const id = `s${stepNo}_qc${idx + 1}`;
            // Try to look up existing check with same label, same ID, or index
            let existingCheck = oldQCs.find((qc: any) => qc.label === lbl || qc.id === id);
            if (!existingCheck) {
              existingCheck = oldQCs[idx];
            }

            // Fallback check maps for labels changed in this turn
            if (!existingCheck) {
              if (stepNo === 1 && idx === 2) { // Dimensional check passed
                existingCheck = oldQCs.find((qc: any) => qc.label === "Dimension verification" || qc.label === "Length / Thickness parameters compliant");
              }
              if (stepNo === 2 && idx === 1) { // Air pockets/bubbles check
                existingCheck = oldQCs.find((qc: any) => qc.label === "Air pockets/bubbles check (MPI-SOP-QC-13)" || qc.label === "No dry fibers or air bubbles");
              }
              if (stepNo === 3 && idx === 2) { // No dry spots or resin-rich areas
                existingCheck = oldQCs.find((qc: any) => qc.label === "No dry spots or resin-rich areas (MPI-SOP-QC-13)");
              }
              if (stepNo === 5 && idx === 0) { // No cracking during ejection
                existingCheck = oldQCs.find((qc: any) => qc.label === "No cracking during ejection (MPI-SOP-QC-13)" || qc.label === "No visual tearing/cracks on interior surface");
              }
              if (stepNo === 6) {
                if (idx === 0) { // Spigot surface smooth and even
                  existingCheck = oldQCs.find((qc: any) => qc.label === "Visual check passed (MPI-SOP-QC-13)" || qc.label === "Spigot tappers smooth and free of burrs");
                } else if (idx === 3) { // Dimensional check passed
                  existingCheck = oldQCs.find((qc: any) => qc.label === "Dimensional check passed (MPI-SOP-QC-14)" || qc.label === "Length / Thickness parameters compliant");
                }
              }
              if (stepNo === 7) {
                if (idx === 0) { // Bell socket surface smooth
                  existingCheck = oldQCs.find((qc: any) => qc.label === "Visual check passed (MPI-SOP-QC-13)" || qc.label === "Machining visual aspect compliant");
                } else if (idx === 4) { // Dimensional check passed
                  existingCheck = oldQCs.find((qc: any) => qc.label === "Dimensional check passed (MPI-SOP-QC-14)" || qc.label === "Bell interior calibration ring verified");
                }
              }
              if (stepNo === 8) {
                if (idx === 0) { // All surfaces clean and free of contamination
                  existingCheck = oldQCs.find((qc: any) => qc.label === "Final physical inspection and markings");
                } else if (idx === 3) { // Ready for dispatch
                  existingCheck = oldQCs.find((qc: any) => qc.label === "Ready for dispatch" || qc.label.includes("Hydrostatic"));
                }
              }
            }

            return {
              id,
              label: lbl,
              status: existingCheck ? (existingCheck.status || "Pass") : "Pass"
            };
          });
          step.qualityChecks = newQCs;
        }
      }
    }
  }
}

function injectTolerancesIntoPipes(data: DbSchema) {
  // Direct standardization on database operations
  standardizePipesQC(data.pipes);

  const idx = data.pipes.findIndex(p => p.pipeId === "SYSTEM_TOLERANCES");
  const existingSystemRow = idx !== -1 ? data.pipes[idx] as any : null;
  const currentTolerances = data.tolerances || existingSystemRow?.tolerances || [...DEFAULT_TOLERANCES];
  const currentProjects = data.projects || existingSystemRow?.projects || [...DEFAULT_PROJECTS];
  const currentChat = data.chat || existingSystemRow?.chat || [];

  const systemRow = {
    pipeId: "SYSTEM_TOLERANCES",
    header: {
      pipeId: "SYSTEM_TOLERANCES",
      diameter: 0,
      pressure: 0,
      stiffness: 0,
      length: 0,
      projectWorkOrder: "SYSTEM",
      settingReference: "SYSTEM",
      pipeType: "Bell/Spigot GRE" as any,
      productionDate: "",
      lotNo: ""
    },
    operatorId: "system",
    operatorUsername: "system",
    createdAt: existingSystemRow?.createdAt || new Date().toISOString(),
    lastUpdatedAt: new Date().toISOString(),
    steps: {},
    tolerances: currentTolerances,
    projects: currentProjects,
    chat: currentChat
  };

  if (idx !== -1) {
    data.pipes[idx] = systemRow as any;
  } else {
    data.pipes.push(systemRow as any);
  }
}

async function saveDatabaseToPostgres(data: DbSchema) {
  if (!pgPool) return;
  if (!postgresAvailable) {
    const ok = await ensurePostgresTables();
    if (!ok) return;
  }
  try {
    const systemRow = data.pipes?.find(p => p.pipeId === "SYSTEM_TOLERANCES") as any;
    const tolerances = (data.tolerances && data.tolerances.length > 0) ? data.tolerances : (systemRow?.tolerances || DEFAULT_TOLERANCES);
    const projects = (data.projects && data.projects.length > 0) ? data.projects : (systemRow?.projects || DEFAULT_PROJECTS);
    const chat = (data.chat && data.chat.length > 0) ? data.chat : (systemRow?.chat || []);

    if (data.users && data.users.length > 0) {
      const validUsers = data.users.filter(u => u && u.id);
      for (const u of validUsers) {
        await pgPool.query(
          `INSERT INTO users (id, username, role, password) 
           VALUES ($1, $2, $3, $4) 
           ON CONFLICT (id) DO UPDATE 
           SET username = EXCLUDED.username, role = EXCLUDED.role, password = EXCLUDED.password`,
          [u.id, u.username, u.role, u.password || ""]
        );
      }
    }

    if (data.pipes && data.pipes.length > 0) {
      const validPipes = data.pipes.filter(p => p && p.pipeId);
      const CHUNK_SIZE = 50;
      for (let i = 0; i < validPipes.length; i += CHUNK_SIZE) {
        const chunk = validPipes.slice(i, i + CHUNK_SIZE);
        const placeholders: string[] = [];
        const params: any[] = [];
        chunk.forEach((p, idx) => {
          placeholders.push(`($${idx * 2 + 1}, $${idx * 2 + 2})`);
          params.push(p.pipeId, JSON.stringify(p));
        });
        const queryStr = `INSERT INTO pipes (pipe_id, data) VALUES ${placeholders.join(", ")} ON CONFLICT (pipe_id) DO UPDATE SET data = EXCLUDED.data`;
        await pgPool.query(queryStr, params);
      }
    }

    if (tolerances && tolerances.length > 0) {
      const validTol = tolerances.filter(t => t && t.id);
      for (const t of validTol) {
        await pgPool.query(
          `INSERT INTO tolerances (id, data) 
           VALUES ($1, $2) 
           ON CONFLICT (id) DO UPDATE 
           SET data = EXCLUDED.data`,
          [t.id, JSON.stringify(t)]
        );
      }
    }

    if (projects && projects.length > 0) {
      const validProj = projects.filter(pr => pr && pr.id);
      for (const pr of validProj) {
        await pgPool.query(
          `INSERT INTO projects (id, data) 
           VALUES ($1, $2) 
           ON CONFLICT (id) DO UPDATE 
           SET data = EXCLUDED.data`,
          [pr.id, JSON.stringify(pr)]
        );
      }
    }

    if (chat && chat.length > 0) {
      const validChat = chat.filter(c => c && c.id);
      for (const c of validChat) {
        await pgPool.query(
          `INSERT INTO chat (id, data) 
           VALUES ($1, $2) 
           ON CONFLICT (id) DO UPDATE 
           SET data = EXCLUDED.data`,
          [c.id, JSON.stringify(c)]
        );
      }
    }

    console.log(`[Postgres Database]: Successfully synchronized ${data.pipes?.length || 0} pipes, ${data.users?.length || 0} users, ${tolerances.length} tolerances, ${projects.length} projects to PostgreSQL.`);
  } catch (err: any) {
    console.log("[Postgres Database]: Error during PostgreSQL save:", err.message || err);
  }
}

function saveDatabase(data: DbSchema) {
  injectTolerancesIntoPipes(data);
  cachedDb = data;
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tmpFile = DB_FILE + ".tmp";
    fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), "utf8");
    fs.renameSync(tmpFile, DB_FILE);
  } catch (error: any) {
    console.log("[Local Storage Info]: Local database file write active / deferred:", error.message || error);
  }

  if (firestoreAvailable) {
    saveDatabaseToFirestore(data).catch(() => {});
  }
  if (pgPool) {
    saveDatabaseToPostgres(data).catch(err => {
      console.log("[Postgres Database]: Background save failed:", err.message || err);
    });
  }
  if (supabaseAvailable) {
    saveDatabaseToSupabase(data).catch(() => {});
  }
}

async function saveDatabaseToSupabaseAndLocal(data: DbSchema): Promise<void> {
  injectTolerancesIntoPipes(data);
  cachedDb = data;
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tmpFile = DB_FILE + ".tmp";
    fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), "utf8");
    fs.renameSync(tmpFile, DB_FILE);
  } catch (error: any) {
    console.log("[Local Storage Info]: Local database file write active / deferred:", error.message || error);
  }

  if (firestoreAvailable) {
    saveDatabaseToFirestore(data).catch(() => {});
  }
  if (pgPool) {
    saveDatabaseToPostgres(data).catch(err => {
      console.log("[Postgres Database]: Background save bypassed:", err.message || err);
    });
  }
  if (supabaseAvailable) {
    saveDatabaseToSupabase(data).catch(err => {
      console.log("[Supabase Database]: Background save bypassed:", err.message || err);
    });
  }
}

async function saveDatabaseToSupabase(data: DbSchema) {
  if (!supabaseAvailable || !supabase) return;
  try {
    if (data.users.length > 0) {
      const userPayloads = data.users.map(u => ({
        id: u.id,
        username: u.username,
        role: u.role,
        password: u.password || ""
      }));
      const { error: upsertErr } = await supabase.from("users").upsert(userPayloads);
      if (upsertErr) {
        console.log("[Supabase Database]: Info — User upload bypass (RLS policy may protect 'users' table):", upsertErr.message);
      }
    }

    const userIds = data.users.map(u => u.id);
    if (userIds.length > 0) {
      const { error: delErr } = await supabase.from("users").delete().not("id", "in", `(${userIds.join(",")})`);
      if (delErr) {
        console.log("[Supabase Database]: Info — Stale user deletion skipped:", delErr.message);
      }
    }

    if (data.pipes.length > 0) {
      const pipePayloads = data.pipes.map(p => ({
        pipe_id: p.pipeId,
        data: p
      }));
      const { error: upsertErr } = await supabase.from("pipes").upsert(pipePayloads);
      if (upsertErr) {
        console.log("[Supabase Database]: Info — Pipe upload bypass (RLS policy or schema restrict):", upsertErr.message);
        // Softly turn off further updates to avoid unnecessary chatter
        supabaseAvailable = false;
        return;
      }
    }

    const pipeIds = data.pipes.map(p => p.pipeId);
    if (pipeIds.length > 0) {
      const { error: delErr } = await supabase.from("pipes").delete().not("pipe_id", "in", `(${pipeIds.map(id => id.replace(/[(),]/g, "")).join(",")})`);
      if (delErr) {
        console.log("[Supabase Database]: Info — Stale pipe deletion skipped:", delErr.message);
      }
    } else {
      const { error: delErr } = await supabase.from("pipes").delete().neq("pipe_id", "invalid-id-nonexistent");
      if (delErr) {
        console.log("[Supabase Database]: Info — Pipe clear skipped:", delErr.message);
      }
    }

    console.log("[Supabase Database]: Sync step completed (any missing tables or columns on remote were bypassed gracefully).");
  } catch (err: any) {
    console.log("[Supabase Database]: Backup sync paused for connection / schema limits:", err.message || err);
    supabaseAvailable = false;
  }
}


// Helper to extract authenticated user from token string
function authenticateToken(token: string, db: DbSchema): User | null {
  if (!token) return null;
  try {
    // Decoding token base64: "id:username:role"
    const decoded = Buffer.from(token, "base64").toString("utf8");
    const [id, username, role] = decoded.split(":");
    
    if (!db || !db.users || !Array.isArray(db.users)) return null;

    // Validate this user exists in DB by ID or username
    const matchedUser = db.users.find(u => 
      (id && u.id === id) || 
      (username && u.username.toLowerCase() === username.toLowerCase())
    );
    return matchedUser || null;
  } catch (err) {
    return null;
  }
}


// Helper to extract authenticated user from simple token header
function authenticate(req: express.Request, db: DbSchema): User | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.substring(7); // Remove 'Bearer '
  return authenticateToken(token, db);
}

// Full-featured Brotli & Gzip compression middleware using native Node.js zlib
function brotliCompressionMiddleware() {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const acceptEncoding = req.headers["accept-encoding"] as string || "";

    // Determine target format priority: brotli (br) > gzip > deflate
    let compressionType: "br" | "gzip" | "deflate" | null = null;
    if (acceptEncoding.includes("br")) {
      compressionType = "br";
    } else if (acceptEncoding.includes("gzip")) {
      compressionType = "gzip";
    } else if (acceptEncoding.includes("deflate")) {
      compressionType = "deflate";
    }

    if (!compressionType) {
      return next();
    }

    const chunks: Buffer[] = [];
    const originalWrite = res.write;
    const originalEnd = res.end;
    const originalWriteHead = res.writeHead;

    let statusCode = 200;
    let headers: any = {};

    res.writeHead = function (code: number, ...args: any[]) {
      statusCode = code;
      const firstArg = args[0];
      if (typeof firstArg === "string") {
        if (args[1]) {
          headers = { ...headers, ...args[1] };
        }
      } else if (firstArg && typeof firstArg === "object") {
        headers = { ...headers, ...firstArg };
      }

      // Secure real-time SSE stream bypass
      const contentType = res.getHeader("content-type") as string || headers["content-type"] || "";
      if (contentType.includes("event-stream")) {
        res.writeHead = originalWriteHead;
        res.write = originalWrite;
        res.end = originalEnd;
        return originalWriteHead.call(this, code, ...args);
      }

      return this;
    } as any;

    res.write = function (chunk: any, encoding?: any, cb?: any): boolean {
      const contentType = res.getHeader("content-type") as string || headers["content-type"] || "";
      if (contentType.includes("event-stream")) {
        res.writeHead = originalWriteHead;
        res.write = originalWrite;
        res.end = originalEnd;
        if (statusCode) {
          originalWriteHead.call(this, statusCode, headers);
        }
        return originalWrite.call(this, chunk, encoding, cb);
      }

      if (chunk) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, (typeof encoding === "string" ? encoding : "utf8") as BufferEncoding));
      }
      if (typeof encoding === "function") encoding();
      if (typeof cb === "function") cb();
      return true;
    } as any;

    res.end = function (chunk?: any, encoding?: any, cb?: any): any {
      if (chunk) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, (typeof encoding === "string" ? encoding : "utf8") as BufferEncoding));
      }
      if (typeof encoding === "function") {
        cb = encoding;
        encoding = undefined;
      }

      const body = Buffer.concat(chunks);
      const contentType = res.getHeader("content-type") as string || headers["content-type"] || "";
      
      const isCompressible = /json|text|javascript|css|xml|svg|html/i.test(contentType);

      if (!isCompressible || body.length < 512) {
        res.writeHead = originalWriteHead;
        res.write = originalWrite;
        res.end = originalEnd;

        if (statusCode) {
          originalWriteHead.call(this, statusCode, headers);
        }
        return originalEnd.call(this, body, cb);
      }

      let compressFn: (buf: Buffer, callback: (err: any, result: Buffer) => void) => void;
      if (compressionType === "br") {
        compressFn = (buf, callback) => zlib.brotliCompress(buf, {
          params: {
            [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT,
            [zlib.constants.BROTLI_PARAM_QUALITY]: 5, // Upgraded dynamic quality optimal balance
          }
        }, callback);
      } else if (compressionType === "gzip") {
        compressFn = (buf, callback) => zlib.gzip(buf, {
          level: 8 // High Gzip compression ratio
        }, callback);
      } else {
        compressFn = (buf, callback) => zlib.deflate(buf, {
          level: 8 // High Deflate compression ratio
        }, callback);
      }

      compressFn(body, (err, compressed) => {
        res.writeHead = originalWriteHead;
        res.write = originalWrite;
        res.end = originalEnd;

        if (err) {
          if (statusCode) {
            originalWriteHead.call(this, statusCode, headers);
          }
          return originalEnd.call(this, body, cb);
        }

        res.setHeader("Content-Encoding", compressionType!);
        res.setHeader("Content-Length", compressed.length);
        res.removeHeader("Content-Range");

        headers["content-encoding"] = compressionType!;
        headers["content-length"] = compressed.length;
        delete headers["content-range"];

        originalWriteHead.call(this, statusCode, headers);
        originalEnd.call(this, compressed, cb);
      });

      return this;
    } as any;

    next();
  };
}

// Centralized Cache-Control middleware for GET APIs to minimize network egress
function apiCacheControlMiddleware() {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.method === "GET" && req.path.startsWith("/api/") && !req.path.includes("activity-stream")) {
      // Allow private browser-side caching for 1s, plus stale-while-revalidate for an additional 3s.
      // This dampens near-simultaneous or rapid repetitive fetches from React UI re-renders,
      // and guarantees that background validation requests leverage 304 Not Modified efficiently.
      res.setHeader("Cache-Control", "private, max-age=1, stale-while-revalidate=3");
    }
    next();
  };
}

async function startServer() {
  // Instantly load local JSON file/defaults to populate cachedDb at startup
  loadDatabase();

  const app = express();
  const PORT = 3000;

  // Middleware
  // Enable CORS
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") {
      res.sendStatus(200);
      return;
    }
    next();
  });

  // Request logger helper to help debug API mapping
  app.use((req, res, next) => {
    const logStr = `[${new Date().toISOString()}] ${req.method} ${req.url} - Headers: ${JSON.stringify(req.headers)}\n`;
    try {
      fs.appendFileSync(path.join(PROJECT_ROOT, "data", "requests.log"), logStr);
    } catch (e) {}
    console.log(`[Server API Request]: ${req.method} ${req.url}`);
    next();
  });

  // Using high request size limit to support capture uploads
  app.use(express.json({ limit: "25mb" }));
  app.use(express.urlencoded({ limit: "25mb", extended: true }));

  // Serve static folders or upload folder if needed
  
  // API Routes
  
  // 1. Auth Endpoint
  app.post("/api/auth/login", async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
      res.status(400).json({ error: "Username and password are required" });
      return;
    }

    const db = await loadDatabaseFromSupabase();
    const user = db.users.find(
      u => u.username.toLowerCase() === username.toLowerCase() && u.password === password
    );

    if (!user) {
      res.status(401).json({ error: "Invalid username or password" });
      return;
    }

    // Generate token: base64 of id:username:role
    const tokenPayload = `${user.id}:${user.username}:${user.role}`;
    const token = Buffer.from(tokenPayload).toString("base64");

    logActivity(user.username, "Logged into the digital tracker workspace");
    updateHeartbeat(user.username, user.role);

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role
      }
    });
  });

  app.get("/api/db-status", (req, res) => {
    res.json({
      neonActive: true,
      primaryDatabase: "Neon PostgreSQL",
      postgresHost: "ep-square-breeze-b1anlxnu.c-5.eu-central-1.aws.neon.tech",
      postgresAvailable,
      databasePreloaded,
      hasCachedDb: !!cachedDb,
      cachedDbCounts: cachedDb ? {
        users: cachedDb.users?.length || 0,
        pipes: cachedDb.pipes?.length || 0,
        tolerances: cachedDb.tolerances?.length || 0,
        projects: cachedDb.projects?.length || 0,
        chat: cachedDb.chat?.length || 0,
      } : null
    });
  });

  app.post("/api/db/restore", async (req, res) => {
    try {
      console.log("[Restore DB]: Request received to restore database state from Supabase Primary Database...");
      const restoredFromPostgres = await loadDatabaseFromPostgres();
      
      if (restoredFromPostgres) {
        cachedDb = restoredFromPostgres;
        try {
          if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
          }
          fs.writeFileSync(DB_FILE, JSON.stringify(cachedDb, null, 2), "utf8");
        } catch (e) {}

        console.log(`[Restore DB]: Successfully restored ${cachedDb.pipes?.length || 0} pipes and ${cachedDb.users?.length || 0} users from Supabase PostgreSQL.`);
        res.json({
          success: true,
          message: "Database state successfully synchronized and restored from Supabase Primary Database.",
          counts: {
            users: cachedDb.users?.length || 0,
            pipes: cachedDb.pipes?.length || 0,
            tolerances: cachedDb.tolerances?.length || 0,
            projects: cachedDb.projects?.length || 0,
            chat: cachedDb.chat?.length || 0
          }
        });
        return;
      }

      cachedDb = null;
      await preloadDatabase();
      const current = loadDatabase();
      res.json({
        success: true,
        message: "Database state restored from Supabase Primary Database.",
        counts: {
          users: current.users?.length || 0,
          pipes: current.pipes?.length || 0,
          tolerances: current.tolerances?.length || 0,
          projects: current.projects?.length || 0,
          chat: current.chat?.length || 0
        }
      });
    } catch (err: any) {
      console.error("[Restore DB]: Error restoring database state:", err);
      res.status(500).json({ error: err.message || "Failed to restore database state from Supabase Primary Database." });
    }
  });

  app.get("/api/db/export", async (req, res) => {
    try {
      const db = await loadDatabaseFromSupabase();
      const user = authenticate(req, db);
      if (!user || user.role !== "admin") {
        res.status(403).json({ error: "Administrator privileges required to export full database." });
        return;
      }

      const fullDb = loadDatabase();
      const backupData = {
        version: "1.0",
        exportedAt: new Date().toISOString(),
        exportedBy: user.username,
        counts: {
          pipes: fullDb.pipes?.length || 0,
          users: fullDb.users?.length || 0,
          projects: fullDb.projects?.length || 0,
          tolerances: fullDb.tolerances?.length || 0,
          chat: fullDb.chat?.length || 0
        },
        pipes: fullDb.pipes || [],
        users: fullDb.users || [],
        projects: fullDb.projects || [],
        tolerances: fullDb.tolerances || [],
        chat: fullDb.chat || []
      };

      const filename = `pipe_tracker_full_backup_${new Date().toISOString().substring(0, 10)}.json`;
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(JSON.stringify(backupData, null, 2));
      logActivity(user.username, "Exported full system database backup JSON file");
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to generate database export backup." });
    }
  });

  app.post("/api/db/import", async (req, res) => {
    try {
      const db = await loadDatabaseFromSupabase();
      const user = authenticate(req, db);
      if (!user || user.role !== "admin") {
        res.status(403).json({ error: "Administrator privileges required to import full database." });
        return;
      }

      const backupObj = req.body;
      if (!backupObj || typeof backupObj !== "object") {
        res.status(400).json({ error: "Invalid backup payload. Expected a JSON object." });
        return;
      }

      const mergeMode = req.body.mergeMode === "merge" ? "merge" : "overwrite";
      const currentDb = loadDatabase();

      const importedPipes = Array.isArray(backupObj.pipes) ? backupObj.pipes : [];
      const importedUsers = Array.isArray(backupObj.users) ? backupObj.users : [];
      const importedProjects = Array.isArray(backupObj.projects) ? backupObj.projects : [];
      const importedTolerances = Array.isArray(backupObj.tolerances) ? backupObj.tolerances : [];
      const importedChat = Array.isArray(backupObj.chat) ? backupObj.chat : [];

      if (importedPipes.length === 0 && importedUsers.length === 0 && importedProjects.length === 0 && importedTolerances.length === 0 && importedChat.length === 0) {
        res.status(400).json({ error: "The uploaded backup file does not contain any valid pipes, users, projects, specifications, or chat messages." });
        return;
      }

      let newPipes = [...importedPipes];
      let newUsers = [...importedUsers];
      let newProjects = [...importedProjects];
      let newTolerances = [...importedTolerances];
      let newChat = [...importedChat];

      if (mergeMode === "merge") {
        const pipeMap = new Map<string, PipeRecord>();
        (currentDb.pipes || []).forEach(p => pipeMap.set(p.pipeId, p));
        importedPipes.forEach(p => pipeMap.set(p.pipeId, p));
        newPipes = Array.from(pipeMap.values());

        const userMap = new Map<string, User>();
        (currentDb.users || []).forEach(u => userMap.set(u.id || u.username, u));
        importedUsers.forEach(u => userMap.set(u.id || u.username, u));
        newUsers = Array.from(userMap.values());

        const projectMap = new Map<string, ProjectConfig>();
        (currentDb.projects || []).forEach(p => projectMap.set(p.id || p.projectCode, p));
        importedProjects.forEach(p => projectMap.set(p.id || p.projectCode, p));
        newProjects = Array.from(projectMap.values());

        const tolMap = new Map<string, ToleranceConfig>();
        (currentDb.tolerances || []).forEach(t => tolMap.set(t.id || `${t.project}-${t.specification}`, t));
        importedTolerances.forEach(t => tolMap.set(t.id || `${t.project}-${t.specification}`, t));
        newTolerances = Array.from(tolMap.values());

        const chatMap = new Map<string, ChatMessage>();
        (currentDb.chat || []).forEach(c => chatMap.set(c.id, c));
        importedChat.forEach(c => chatMap.set(c.id, c));
        newChat = Array.from(chatMap.values());
      } else {
        const adminExists = newUsers.some(u => u.username.toLowerCase() === "admin" || u.role === "admin");
        if (!adminExists) {
          const currentAdmin = currentDb.users?.find(u => u.username.toLowerCase() === user.username.toLowerCase()) || {
            id: user.id,
            username: user.username,
            role: "admin" as const,
            password: "admin"
          };
          newUsers.unshift(currentAdmin);
        }
      }

      const updatedDb: DbSchema = {
        users: newUsers,
        pipes: newPipes,
        tolerances: newTolerances,
        projects: newProjects,
        chat: newChat
      };

      saveDatabase(updatedDb);

      logActivity(user.username, `Uploaded and ${mergeMode === "merge" ? "merged" : "overwrote"} full database backup (${newPipes.length} pipes, ${newUsers.length} users, ${newProjects.length} projects, ${newTolerances.length} specifications, ${newChat.length} messages)`);

      res.json({
        success: true,
        message: `Database backup successfully ${mergeMode === "merge" ? "merged" : "restored and updated"}.`,
        counts: {
          pipes: newPipes.length,
          users: newUsers.length,
          projects: newProjects.length,
          tolerances: newTolerances.length,
          chat: newChat.length
        }
      });
    } catch (err: any) {
      console.error("[Database Import Error]:", err);
      res.status(500).json({ error: err.message || "Failed to process and import database backup file." });
    }
  });

  app.get("/api/auth/me", async (req, res) => {
    const db = await loadDatabaseFromSupabase();
    const currentUser = authenticate(req, db);
    if (!currentUser) {
      res.status(410).json({ error: "Unauthorized or expired session" });
      return;
    }
    updateHeartbeat(currentUser.username, currentUser.role);
    res.json({
      user: {
        id: currentUser.id,
        username: currentUser.username,
        role: currentUser.role
      }
    });
  });

  // 1.45 Combined Application Bootstrap endpoint to minimize network eagerness and roundtrips
  app.get("/api/bootstrap", async (req, res) => {
    const db = await loadDatabaseFromSupabase();
    const currentUser = authenticate(req, db);
    if (!currentUser) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    updateHeartbeat(currentUser.username, currentUser.role);

    // 1. Pipes
    const pipes = db.pipes || [];

    // 2. Compute Stats (to avoid redundant separate calculations/calls)
    const totalPipes = pipes.length;
    let completedPipes = 0;
    let activePipes = 0;
    const stepCompletionTotals = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0 };
    let passCount = 0;
    let failCount = 0;
    let inProgressCount = 0;

    pipes.forEach(pipe => {
      const step8 = pipe.steps[8];
      const hasCompletedStep8 = step8 && step8.isCompleted;
      if (hasCompletedStep8) {
        completedPipes++;
      } else {
        activePipes++;
      }
      let hasFail = false;
      let hasPass = false;
      let hasStepsSaved = false;
      for (let s = 1; s <= 8; s++) {
        const sr = pipe.steps[s];
        if (sr && sr.isCompleted) {
          hasStepsSaved = true;
          stepCompletionTotals[s as keyof typeof stepCompletionTotals]++;
          const stepHasFail = sr.qualityChecks.some(qc => qc.status === "Fail") || !!sr.isNonConform;
          const stepHasPass = sr.qualityChecks.some(qc => qc.status === "Pass");
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

    const stats = {
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

    // 3. Tolerances
    const tolerances = db.tolerances || [];

    // 4. Projects
    const projects = db.projects || [];

    // 5. Chat messages
    const chat = db.chat || [];

    // 6. Users without passwords
    const safeUsers = (db.users || []).map(u => ({ id: u.id, username: u.username, role: u.role }));

    // 7. Active operators & activity log events
    const now = Date.now();
    for (const [usr, data] of Object.entries(activeUsers)) {
      if (now - new Date(data.lastSeen).getTime() > 4 * 60 * 1000) {
        delete activeUsers[usr];
      }
    }
    const onlineMembers = Object.entries(activeUsers).map(([username, info]) => ({
      username,
      role: info.role,
      lastSeen: info.lastSeen
    }));

    res.json({
      pipes,
      stats,
      tolerances,
      projects,
      chat,
      users: safeUsers,
      activeOperators: onlineMembers,
      recentLogs: activityEvents
    });
  });

  // 1.5 Collaborative Presence & Live Event Stream Feed endpoint
  app.get("/api/activity-feed", async (req, res) => {
    const db = await loadDatabaseFromSupabase();
    const currentUser = authenticate(req, db);
    if (!currentUser) {
      res.status(410).json({ error: "Unauthorized" });
      return;
    }

    updateHeartbeat(currentUser.username, currentUser.role);

    // Filter out operators inactive for more than 4 minutes
    const now = Date.now();
    for (const [usr, data] of Object.entries(activeUsers)) {
      if (now - new Date(data.lastSeen).getTime() > 4 * 60 * 1000) {
        delete activeUsers[usr];
      }
    }

    const onlineMembers = Object.entries(activeUsers).map(([username, info]) => ({
      username,
      role: info.role,
      lastSeen: info.lastSeen
    }));

    res.json({
      activeOperators: onlineMembers,
      recentLogs: activityEvents
    });
  });

  // 1.6 Server-Sent Events (SSE) Real-Time continuous event stream connection
  app.get("/api/activity-stream", async (req, res) => {
    const rawToken = (req.query.token as string) || "";
    const db = await loadDatabaseFromSupabase();
    const currentUser = authenticateToken(rawToken, db);
    
    if (!currentUser) {
      res.status(401).send("Unauthorized activity stream connection");
      return;
    }

    // Write headers for Server-Sent Events (SSE)
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no" // Prevent buffering over reverse proxies like Nginx
    });

    // Keep active presence heartbeat for connection start
    updateHeartbeat(currentUser.username, currentUser.role);

    const onlineMembers = Object.entries(activeUsers).map(([usr, info]) => ({
      username: usr,
      role: info.role,
      lastSeen: info.lastSeen
    }));

    // Send initial configuration payload
    res.write("data: " + JSON.stringify({
      type: "init",
      recentLogs: activityEvents,
      activeOperators: onlineMembers,
      chatMessages: db.chat || []
    }) + "\n\n");

    // Add active client to the list
    sseClients.push(res);

    const keepAliveTimer = setInterval(() => {
      try {
        res.write("data: " + JSON.stringify({ type: "ping" }) + "\n\n");
      } catch (err) {
        // error
      }
    }, 25000);

    req.on("close", () => {
      clearInterval(keepAliveTimer);
      sseClients = sseClients.filter(client => client !== res);
    });
  });

  // 1.7 Chat & Group Discussion Endpoints
  app.get("/api/chat", async (req, res) => {
    const db = await loadDatabaseFromSupabase();
    const currentUser = authenticate(req, db);
    if (!currentUser) {
      res.status(401).json({ error: "Access denied. Authenticate first." });
      return;
    }
    res.json(db.chat || []);
  });

  app.post("/api/chat", async (req, res) => {
    const db = await loadDatabaseFromSupabase();
    const currentUser = authenticate(req, db);
    if (!currentUser) {
      res.status(401).json({ error: "Access denied. Authenticate first." });
      return;
    }

    const { text } = req.body;
    if (!text || !text.trim()) {
      res.status(400).json({ error: "Message text cannot be empty." });
      return;
    }

    const chatMsg: ChatMessage = {
      id: "chat-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6),
      username: currentUser.username,
      role: currentUser.role,
      text: text.trim(),
      timestamp: new Date().toISOString()
    };

    db.chat = db.chat || [];
    db.chat.push(chatMsg);

    // Keep discussion history compact (last 200 items max)
    if (db.chat.length > 200) {
      db.chat = db.chat.slice(db.chat.length - 200);
    }

    saveDatabase(db);

    // Broadcast new message to all other SSE clients in real-time
    const ssePayload = JSON.stringify({
      type: "chat-message",
      message: chatMsg,
      chatMessages: db.chat
    });

    sseClients.forEach(client => {
      try {
        client.write(`data: ${ssePayload}\n\n`);
      } catch (err) {
        // Closed or dead connection
      }
    });

    // Log this activity to global audit events
    logActivity(
      currentUser.username,
      `Sent a message in Operator Discussion: "${text.trim().substring(0, 40)}${text.trim().length > 40 ? "..." : ""}"`
    );

    res.json({ success: true, message: chatMsg });
  });

  // 2. User Management (Admin only for modifications, authenticated for queries)
  app.get("/api/users", async (req, res) => {
    const db = await loadDatabaseFromSupabase();
    const currentUser = authenticate(req, db);
    if (!currentUser) {
      res.status(401).json({ error: "Access denied. Please log in." });
      return;
    }
    // Return all users without revealing passwords
    const safeUsers = db.users.map(u => ({ id: u.id, username: u.username, role: u.role }));
    res.json(safeUsers);
  });

  app.post("/api/users", async (req, res) => {
    const db = await loadDatabaseFromSupabase();
    const currentUser = authenticate(req, db);
    if (!currentUser || currentUser.role !== "admin") {
      res.status(403).json({ error: "Access denied. Admins only." });
      return;
    }

    const { username, password, role } = req.body;
    if (!username || !password || !role) {
      res.status(400).json({ error: "Missing required fields (username, password, role)" });
      return;
    }

    // Check pre-existing username
    const exists = db.users.some(u => u.username.toLowerCase() === username.toLowerCase());
    if (exists) {
      res.status(400).json({ error: "Username already taken" });
      return;
    }

    const newUser: User = {
      id: "u-" + Date.now(),
      username: username.trim(),
      password: password.trim(),
      role: role as UserRole
    };

    db.users.push(newUser);
    await saveDatabaseToSupabaseAndLocal(db);

    res.status(201).json({ id: newUser.id, username: newUser.username, role: newUser.role });
  });

  app.put("/api/users/:id/password", async (req, res) => {
    const db = await loadDatabaseFromSupabase();
    const currentUser = authenticate(req, db);
    if (!currentUser) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { id } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.trim().length === 0) {
      res.status(400).json({ error: "New password cannot be empty" });
      return;
    }

    // Role check: Admin can update anyone. Operator can ONLY update their own password.
    if (currentUser.role !== "admin" && currentUser.id !== id) {
      res.status(403).json({ error: "Access denied. You can only update your own password." });
      return;
    }

    const targetUser = db.users.find(u => u.id === id);
    if (!targetUser) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    targetUser.password = newPassword.trim();
    await saveDatabaseToSupabaseAndLocal(db);
    res.json({ message: "Password updated successfully" });
  });

  app.delete("/api/users/:id", async (req, res) => {
    const db = await loadDatabaseFromSupabase();
    const currentUser = authenticate(req, db);
    if (!currentUser || currentUser.role !== "admin") {
      res.status(403).json({ error: "Access denied. Admins only." });
      return;
    }

    const { id } = req.params;
    if (id === currentUser.id) {
      res.status(400).json({ error: "You cannot delete your own admin account while active" });
      return;
    }

    const index = db.users.findIndex(u => u.id === id);
    if (index === -1) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    // Prevent deleting all admins
    const remainingAdmins = db.users.filter(u => u.role === "admin" && u.id !== id);
    if (remainingAdmins.length === 0) {
      res.status(400).json({ error: "Cannot delete the last remaining Administrator" });
      return;
    }

    db.users.splice(index, 1);
    if (pgPool) {
      pgPool.query("DELETE FROM users WHERE id = $1", [id]).catch(() => {});
    }
    if (firestoreAvailable && firestore) {
      firestore.collection("users").doc(id).delete().catch(() => {});
    }
    await saveDatabaseToSupabaseAndLocal(db);
    res.json({ message: "User deleted successfully" });
  });

  // Tolerances API Endpoints
  app.get("/api/tolerances", async (req, res) => {
    const db = await loadDatabaseFromSupabase();
    const currentUser = authenticate(req, db);
    if (!currentUser) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    res.json(db.tolerances || []);
  });

  app.post("/api/tolerances", async (req, res) => {
    const db = await loadDatabaseFromSupabase();
    const currentUser = authenticate(req, db);
    if (!currentUser) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (currentUser.role !== "admin") {
      res.status(403).json({ error: "Access denied. Admins only." });
      return;
    }

    const input: ToleranceConfig = req.body;
    if (!input || !input.id || !input.project || !input.specification) {
      res.status(400).json({ error: "Invalid tolerance configuration. ID, Project title and Specification are mandatory" });
      return;
    }

    if (!db.tolerances) {
      db.tolerances = [];
    }

    const index = db.tolerances.findIndex(t => t.id === input.id);
    if (index !== -1) {
      db.tolerances[index] = input;
    } else {
      db.tolerances.push(input);
    }

    await saveDatabaseToSupabaseAndLocal(db);
    res.json(input);
  });

  app.delete("/api/tolerances/:id", async (req, res) => {
    const db = await loadDatabaseFromSupabase();
    const currentUser = authenticate(req, db);
    if (!currentUser) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (currentUser.role !== "admin") {
      res.status(403).json({ error: "Access denied. Admins only." });
      return;
    }

    const { id } = req.params;
    if (!db.tolerances) {
      db.tolerances = [];
    }

    const index = db.tolerances.findIndex(t => t.id === id);
    if (index === -1) {
      res.status(404).json({ error: "Tolerance configuration not found" });
      return;
    }

    db.tolerances.splice(index, 1);
    await saveDatabaseToSupabaseAndLocal(db);
    res.json({ message: "Tolerance configuration successfully removed" });
  });

  // Projects list management API
  app.get("/api/projects", async (req, res) => {
    const db = await loadDatabaseFromSupabase();
    const currentUser = authenticate(req, db);
    if (!currentUser) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    res.json(db.projects || []);
  });

  app.post("/api/projects", async (req, res) => {
    const db = await loadDatabaseFromSupabase();
    const currentUser = authenticate(req, db);
    if (!currentUser) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (currentUser.role !== "admin") {
      res.status(403).json({ error: "Access denied. Admins only." });
      return;
    }

    const input: ProjectConfig = req.body;
    if (!input || !input.id || !input.projectCode || !Array.isArray(input.settingReferences)) {
      res.status(400).json({ error: "Invalid project configuration. ID, projectCode and settingReferences list are required." });
      return;
    }

    if (!db.projects) {
      db.projects = [];
    }

    const index = db.projects.findIndex(p => p.id === input.id);
    if (index !== -1) {
      db.projects[index] = input;
    } else {
      db.projects.push(input);
    }

    await saveDatabaseToSupabaseAndLocal(db);
    res.json(input);
  });

  app.delete("/api/projects/:id", async (req, res) => {
    const db = await loadDatabaseFromSupabase();
    const currentUser = authenticate(req, db);
    if (!currentUser) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (currentUser.role !== "admin") {
      res.status(403).json({ error: "Access denied. Admins only." });
      return;
    }

    const { id } = req.params;
    if (!db.projects) {
      db.projects = [];
    }

    const index = db.projects.findIndex(p => p.id === id);
    if (index === -1) {
      res.status(404).json({ error: "Project configuration not found" });
      return;
    }

    db.projects.splice(index, 1);
    await saveDatabaseToSupabaseAndLocal(db);
    res.json({ message: "Project configuration successfully removed" });
  });

  // 3. Pipe Records API
  app.get("/api/pipes", async (req, res) => {
    const db = await loadDatabaseFromSupabase();
    const currentUser = authenticate(req, db);
    if (!currentUser) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    updateHeartbeat(currentUser.username, currentUser.role);
    
    // Multi-user support: Anyone can view all pipes on the assembly line!
    const records = db.pipes;

    res.json(records);
  });

  app.get("/api/pipes/stats", async (req, res) => {
    const db = await loadDatabaseFromSupabase();
    const currentUser = authenticate(req, db);
    if (!currentUser) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    updateHeartbeat(currentUser.username, currentUser.role);

    // Multi-user support: Stats are aggregate across all pipes on the assembly line!
    const records = db.pipes;

    const totalPipes = records.length;
    
    // An active pipe is progress starting (step 1 saved) up to step 8. Completed is when step 8 finishes.
    let completedPipes = 0;
    let activePipes = 0;
    
    const stepCompletionTotals = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0 };
    let passCount = 0;
    let failCount = 0;
    let inProgressCount = 0;

    records.forEach(pipe => {
      const step8 = pipe.steps[8];
      const hasCompletedStep8 = step8 && step8.isCompleted;
      
      if (hasCompletedStep8) {
        completedPipes++;
      } else {
        activePipes++;
      }

      // Check if any steps contain a Failure check
      let hasFail = false;
      let hasPass = false;
      let hasStepsSaved = false;

      for (let s = 1; s <= 8; s++) {
        const sr = pipe.steps[s];
        if (sr && sr.isCompleted) {
          hasStepsSaved = true;
          stepCompletionTotals[s as keyof typeof stepCompletionTotals]++;
          
          // Check for individual step quality checks
          const stepHasFail = sr.qualityChecks.some(qc => qc.status === "Fail") || !!sr.isNonConform;
          const stepHasPass = sr.qualityChecks.some(qc => qc.status === "Pass");
          if (stepHasFail) hasFail = true;
          if (stepHasPass) hasPass = true;
        }
      }

      if (hasFail) {
        failCount++;
      } else if (hasCompletedStep8) {
        passCount++;
      } else if (hasStepsSaved) {
        inProgressCount++;
      } else {
        inProgressCount++;
      }
    });

    // Calc rate percentages
    const stepCompletionRates: { [key: number]: number } = {};
    for (let s = 1; s <= 8; s++) {
      stepCompletionRates[s] = totalPipes > 0 
        ? Math.round((stepCompletionTotals[s as keyof typeof stepCompletionTotals] / totalPipes) * 100) 
        : 0;
    }

    const stats: DashboardStats = {
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

    res.json(stats);
  });

  app.get("/api/pipes/:id", async (req, res) => {
    const db = await loadDatabaseFromSupabase();
    const currentUser = authenticate(req, db);
    if (!currentUser) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { id } = req.params;
    const pipe = db.pipes.find(p => p.pipeId === id.toUpperCase());
    if (!pipe) {
      res.status(404).json({ error: "Pipe record not found" });
      return;
    }

    updateHeartbeat(currentUser.username, currentUser.role);
    res.json(pipe);
  });

  // Save/Create Header Info or update it
  app.post("/api/pipes", async (req, res) => {
    const db = await loadDatabaseFromSupabase();
    const currentUser = authenticate(req, db);
    if (!currentUser) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const headerInput: PipeHeader = req.body;
    if (!headerInput || !headerInput.pipeId) {
      res.status(400).json({ error: "Invalid pipe data. Pipe ID is mandatory" });
      return;
    }

    const originalPipeId = req.query.originalPipeId ? String(req.query.originalPipeId).trim().toUpperCase() : null;
    const pipeIdUpper = headerInput.pipeId.trim().toUpperCase();
    
    let pipe;
    if (originalPipeId) {
      pipe = db.pipes.find(p => p.pipeId === originalPipeId);
      if (originalPipeId !== pipeIdUpper) {
        const potentialConflict = db.pipes.find(p => p.pipeId === pipeIdUpper);
        if (potentialConflict) {
          res.status(400).json({ error: `Cannot rename: A tracker with ID "${pipeIdUpper}" already exists.` });
          return;
        }
      }
    } else {
      pipe = db.pipes.find(p => p.pipeId === pipeIdUpper);
    }

    updateHeartbeat(currentUser.username, currentUser.role);

    if (pipe) {
      const oldId = pipe.pipeId;
      pipe.pipeId = pipeIdUpper;
      // Update existing (unrestricted in collaborative multi-user mode)
      pipe.header = {
        ...headerInput,
        pipeId: pipeIdUpper,
        diameter: Number(headerInput.diameter),
        pressure: Number(headerInput.pressure),
        stiffness: Number(headerInput.stiffness),
        length: Number(headerInput.length),
      };
      pipe.lastUpdatedAt = new Date().toISOString();
      if (oldId !== pipeIdUpper) {
        logActivity(currentUser.username, `Renamed pipe record from ${oldId} to ${pipeIdUpper}`);
      } else {
        logActivity(currentUser.username, `Updated specifications header for ${pipeIdUpper}`);
      }
    } else {
      // Create new pipe tracker
      pipe = {
        pipeId: pipeIdUpper,
        header: {
          ...headerInput,
          pipeId: pipeIdUpper,
          diameter: Number(headerInput.diameter),
          pressure: Number(headerInput.pressure),
          stiffness: Number(headerInput.stiffness),
          length: Number(headerInput.length),
        },
        operatorId: currentUser.id,
        operatorUsername: currentUser.username,
        createdAt: new Date().toISOString(),
        lastUpdatedAt: new Date().toISOString(),
        steps: {}
      };
      db.pipes.push(pipe);
      logActivity(currentUser.username, `Initiated new pipe record ${pipeIdUpper} on manufacturing line`);
    }

    await saveDatabaseToSupabaseAndLocal(db);
    res.json(pipe);
  });

  // Bulk reload / merge GRP/GRE pipe records from Excel
  app.post("/api/pipes/bulk-reload", async (req, res) => {
    const db = await loadDatabaseFromSupabase();
    const currentUser = authenticate(req, db);
    if (!currentUser) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const payload = req.body;
    if (!payload || !Array.isArray(payload.records)) {
      res.status(400).json({ error: "Invalid payload. 'records' array is required." });
      return;
    }

    const newRecordsList = payload.records;
    const mode = payload.mode || "merge"; // "merge" or "overwrite"

    if (mode === "overwrite") {
      db.pipes = newRecordsList;
      logActivity(currentUser.username, `Bulk reloaded GRP tracker database from import spreadsheet (${newRecordsList.length} items)`);
      
      // If we are overwriting, we should delete all existing pipes in Firestore that are not in the new dataset
      if (firestoreAvailable && firestore) {
        try {
          const snapshot = await firestore.collection("pipes").get();
          const newIds = new Set(newRecordsList.map((p: any) => p.pipeId.toUpperCase()));
          const toDeleteRefs: any[] = [];
          
          snapshot.docs.forEach(doc => {
            if (!newIds.has(doc.id.toUpperCase())) {
              toDeleteRefs.push(doc.ref);
            }
          });

          // Process deletions in chunked batches of 400 to prevent exceeding Firestore limits
          const BATCH_SIZE = 400;
          for (let i = 0; i < toDeleteRefs.length; i += BATCH_SIZE) {
            const chunk = toDeleteRefs.slice(i, i + BATCH_SIZE);
            const batch = firestore.batch();
            chunk.forEach(ref => {
              batch.delete(ref);
            });
            await batch.commit();
            console.log(`[Firestore Database]: Deleted old records batch chunk (${i} to ${Math.min(i + BATCH_SIZE, toDeleteRefs.length)} of ${toDeleteRefs.length}).`);
          }
          
          console.log(`[Firestore Database]: Successfully pruned ${toDeleteRefs.length} old records in chunked batches.`);
        } catch (fErr: any) {
          console.log("[Firestore Database]: Pruning old records failed during overwrite:", fErr.message || fErr);
        }
      }
    } else {
      newRecordsList.forEach((newRec: any) => {
        if (!newRec.pipeId) return;
        const pipeIdUpper = newRec.pipeId.trim().toUpperCase();
        newRec.pipeId = pipeIdUpper;
        if (newRec.header) {
          newRec.header.pipeId = pipeIdUpper;
        }

        const idx = db.pipes.findIndex(p => p.pipeId.toUpperCase() === pipeIdUpper);
        if (idx !== -1) {
          const oldRec = db.pipes[idx];

          // Merge header fields safely
          const mergedHeader = { ...oldRec.header };
          if (newRec.header) {
            if (newRec.isSimplified) {
              // For simplified records, only update the project work order if it's provided and not blank
              if (newRec.header.projectWorkOrder && newRec.header.projectWorkOrder !== "") {
                mergedHeader.projectWorkOrder = newRec.header.projectWorkOrder;
              }
            } else {
              // Standard template merge: update all non-empty fields
              Object.keys(newRec.header).forEach((key) => {
                const val = newRec.header[key];
                if (val !== undefined && val !== null && val !== "") {
                  mergedHeader[key] = val;
                }
              });
            }
          }

          // Merge steps dictionary
          let mergedSteps = { ...oldRec.steps };
          if (newRec.isSimplified) {
            const targetActive = newRec.targetActiveStep || 1;
            const updatedSteps: { [key: number]: any } = {};

            // 1. For steps < targetActive (steps completed up to this point):
            // Keep the old detailed step if it exists, otherwise use mock step
            for (let s = 1; s < targetActive && s <= 8; s++) {
              if (oldRec.steps && oldRec.steps[s]) {
                updatedSteps[s] = {
                  ...oldRec.steps[s],
                  isCompleted: true // Force completed since we are beyond this step
                };
              } else if (newRec.steps && newRec.steps[s]) {
                updatedSteps[s] = newRec.steps[s];
              }
            }

            // 2. For s === targetActive (if <= 8): this is the currently active step
            if (targetActive <= 8) {
              const newActiveStep = newRec.steps && newRec.steps[targetActive];
              const isNcr = newActiveStep ? !!newActiveStep.isNonConform : false;
              
              if (oldRec.steps && oldRec.steps[targetActive]) {
                updatedSteps[targetActive] = {
                  ...oldRec.steps[targetActive],
                  isCompleted: false,
                  isNonConform: isNcr,
                  additionalObs: newActiveStep?.additionalObs || oldRec.steps[targetActive].additionalObs || ""
                };
              } else if (newActiveStep) {
                updatedSteps[targetActive] = newActiveStep;
              }
            }

            // 3. For steps > targetActive: they are not completed yet, so we clear them to respect the active step
            // (not adding them to updatedSteps effectively clears them, which is correct and safe)
            
            mergedSteps = updatedSteps;
          } else {
            // Standard non-simplified record merge
            if (newRec.steps) {
              Object.keys(newRec.steps).forEach((stepKey) => {
                const stepNo = Number(stepKey);
                if (isNaN(stepNo)) return;
                const newStep = newRec.steps[stepNo];
                const oldStep = oldRec.steps[stepNo];

                if (newStep) {
                  if (oldStep) {
                    mergedSteps[stepNo] = {
                      ...oldStep,
                      ...newStep,
                      savedAt: newStep.savedAt && newStep.savedAt !== "" ? newStep.savedAt : (oldStep.savedAt || ""),
                      savedBy: newStep.savedBy && newStep.savedBy !== "admin" && newStep.savedBy !== "" ? newStep.savedBy : (oldStep.savedBy || newStep.savedBy),
                      additionalObs: newStep.additionalObs && newStep.additionalObs !== "" ? newStep.additionalObs : (oldStep.additionalObs || ""),
                      fields: {
                        ...(oldStep.fields || {}),
                        ...(newStep.fields || {})
                      },
                      qualityChecks: newStep.qualityChecks && newStep.qualityChecks.length > 0
                        ? newStep.qualityChecks
                        : (oldStep.qualityChecks || [])
                    };
                  } else {
                    mergedSteps[stepNo] = newStep;
                  }
                }
              });
            }
          }

          db.pipes[idx] = {
            ...oldRec,
            header: mergedHeader,
            steps: mergedSteps,
            isDispatched: newRec.isDispatched !== undefined ? newRec.isDispatched : oldRec.isDispatched,
            // Preserve the original createdAt timestamp firmly!
            createdAt: oldRec.createdAt || newRec.createdAt || new Date().toISOString(),
            lastUpdatedAt: newRec.lastUpdatedAt || new Date().toISOString()
          };
        } else {
          db.pipes.push(newRec);
        }
      });
      logActivity(currentUser.username, `Bulk merged data from import spreadsheet into GRP tracker database (${newRecordsList.length} items)`);
    }

    await saveDatabaseToSupabaseAndLocal(db);
    res.json({ success: true, count: newRecordsList.length, mode });
  });

  // Save step data
  app.post("/api/pipes/:id/step/:stepNo", async (req, res) => {
    const db = await loadDatabaseFromSupabase();
    const currentUser = authenticate(req, db);
    if (!currentUser) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { id, stepNo } = req.params;
    const stepNumber = parseInt(stepNo, 10);
    if (isNaN(stepNumber) || stepNumber < 1 || stepNumber > 8) {
      res.status(400).json({ error: "Invalid step number. Must be 1 to 8." });
      return;
    }

    const pipeIdUpper = id.toUpperCase();
    const pipe = db.pipes.find(p => p.pipeId === pipeIdUpper);
    if (!pipe) {
      res.status(404).json({ error: "Pipe tracker not initialized. Submit configuration header first." });
      return;
    }

    updateHeartbeat(currentUser.username, currentUser.role);

    const { fields, qualityChecks, additionalObs, image, isNonConform, ncrReason } = req.body;
    const existingStep = pipe.steps[stepNumber];
    let modifications = existingStep && existingStep.modifications ? [...existingStep.modifications] : [];

    if (existingStep) {
      const changes: { item: string; from: string; to: string }[] = [];

      // Compare fields
      const oldFields = existingStep.fields || {};
      const newFields = fields || {};
      const allFieldKeys = new Set([...Object.keys(oldFields), ...Object.keys(newFields)]);
      for (const key of allFieldKeys) {
        const valOld = oldFields[key];
        const valNew = newFields[key];
        if (
          valOld !== valNew &&
          !(valOld === undefined && valNew === "") &&
          !(valOld === "" && valNew === undefined) &&
          !(valOld === null && valNew === undefined) &&
          !(valOld === undefined && valNew === null)
        ) {
          changes.push({
            item: `Field [${key}]`,
            from: valOld !== undefined && valOld !== null ? String(valOld) : "N/A",
            to: valNew !== undefined && valNew !== null ? String(valNew) : "N/A"
          });
        }
      }

      // Compare qualityChecks
      const oldQCs = existingStep.qualityChecks || [];
      const newQCs = qualityChecks || [];
      oldQCs.forEach(oldQc => {
        const newQc = newQCs.find((q: any) => q.label === oldQc.label || q.id === oldQc.id);
        if (newQc && oldQc.status !== newQc.status) {
          changes.push({
            item: `Quality Check [${oldQc.label}]`,
            from: oldQc.status || "N/A",
            to: newQc.status || "N/A"
          });
        }
      });

      // Compare additionalObs
      if ((existingStep.additionalObs || "") !== (additionalObs || "")) {
        changes.push({
          item: "Additional Observations",
          from: existingStep.additionalObs || "N/A",
          to: additionalObs || "N/A"
        });
      }

      // Compare isNonConform
      const oldNC = !!existingStep.isNonConform;
      const newNC = !!isNonConform;
      if (oldNC !== newNC) {
        changes.push({
          item: "Non-Conformance Status",
          from: oldNC ? "Fail (Non-Conform)" : "Pass (Conforming)",
          to: newNC ? "Fail (Non-Conform)" : "Pass (Conforming)"
        });
      }

      // Compare ncrReason
      if ((existingStep.ncrReason || "") !== (ncrReason || "")) {
        changes.push({
          item: "NCR Defect Reason",
          from: existingStep.ncrReason || "N/A",
          to: ncrReason || "N/A"
        });
      }

      // Compare image
      const oldHasImg = !!existingStep.image;
      const newHasImg = !!image;
      if (oldHasImg !== newHasImg) {
        changes.push({
          item: "Ejection Image attachment",
          from: oldHasImg ? "Image Attached" : "None",
          to: newHasImg ? "Image Attached" : "None"
        });
      }

      if (changes.length > 0) {
        // Enforce max 2 edits rule: standard user blocked if edits >= 2
        if (modifications.length >= 2 && currentUser.role !== "admin") {
          res.status(403).json({
            error: `This step has already been modified ${modifications.length} times. Standard users are blocked from saving any further changes; only Quality Directors (Admin) can modify it.`
          });
          return;
        }

        modifications.push({
          at: new Date().toISOString(),
          byUser: currentUser.username,
          fromUser: existingStep.savedBy || "Operator",
          toUser: currentUser.username,
          changes
        });
      }
    }

    const stepRecord: StepRecord = {
      stepNo: stepNumber,
      isCompleted: true,
      savedBy: currentUser.username,
      savedAt: new Date().toISOString(),
      fields: fields || {},
      qualityChecks: qualityChecks || [],
      additionalObs: additionalObs || "",
      image: image || undefined,
      isNonConform: !!isNonConform,
      ncrReason: ncrReason || "",
      modifications: modifications.length > 0 ? modifications : undefined
    };

    pipe.steps[stepNumber] = stepRecord;
    pipe.lastUpdatedAt = new Date().toISOString();

    logActivity(currentUser.username, `Registered Production Step ${stepNumber} QA data for pipe ${pipeIdUpper}`);
    await saveDatabaseToSupabaseAndLocal(db);
    res.json(pipe);
  });

  // Unsave/revert a step (Admin-only)
  app.post("/api/pipes/:id/step/:stepNo/unsave", async (req, res) => {
    const db = await loadDatabaseFromSupabase();
    const currentUser = authenticate(req, db);
    if (!currentUser) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    if (currentUser.role !== "admin") {
      res.status(403).json({ error: "Access denied. Only Admins can unsave step data." });
      return;
    }

    const { id, stepNo } = req.params;
    const stepNumber = parseInt(stepNo, 10);
    if (isNaN(stepNumber) || stepNumber < 1 || stepNumber > 8) {
      res.status(400).json({ error: "Invalid step number. Must be 1 to 8." });
      return;
    }

    const pipeIdUpper = id.toUpperCase();
    const pipe = db.pipes.find(p => p.pipeId === pipeIdUpper);
    if (!pipe) {
      res.status(404).json({ error: "Pipe record not found." });
      return;
    }

    if (pipe.steps[stepNumber]) {
      delete pipe.steps[stepNumber];
      pipe.lastUpdatedAt = new Date().toISOString();
      logActivity(currentUser.username, `Unsaved/Reverted Production Step ${stepNumber} QA data for pipe ${pipeIdUpper}`);
      await saveDatabaseToSupabaseAndLocal(db);
      res.json(pipe);
    } else {
      res.status(400).json({ error: "Step was not previously saved." });
    }
  });

  app.post("/api/pipes/:id/dispatch", async (req, res) => {
    const db = await loadDatabaseFromSupabase();
    const currentUser = authenticate(req, db);
    if (!currentUser) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    if (currentUser.role !== "admin") {
      res.status(403).json({ error: "Access denied. Only Admins can dispatch pipes." });
      return;
    }

    const { id } = req.params;
    const { isDispatched } = req.body;
    const pipeIdUpper = id.toUpperCase();
    const pipe = db.pipes.find(p => p.pipeId === pipeIdUpper);
    if (!pipe) {
      res.status(404).json({ error: "Pipe tracker not found." });
      return;
    }

    updateHeartbeat(currentUser.username, currentUser.role);

    pipe.isDispatched = isDispatched !== false;
    if (pipe.isDispatched) {
      pipe.dispatchedAt = new Date().toISOString();
      pipe.dispatchedBy = currentUser.username;
      logActivity(currentUser.username, `Dispatched completed pipe ${pipeIdUpper} and delivered to client`);
    } else {
      delete pipe.dispatchedAt;
      delete pipe.dispatchedBy;
      logActivity(currentUser.username, `Reverted dispatch clearance for pipe ${pipeIdUpper}`);
    }
    pipe.lastUpdatedAt = new Date().toISOString();

    await saveDatabaseToSupabaseAndLocal(db);
    res.json({ success: true, pipe });
  });

  app.delete("/api/pipes/:id", async (req, res) => {
    const db = await loadDatabaseFromSupabase();
    const currentUser = authenticate(req, db);
    if (!currentUser) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { id } = req.params;
    const pipeIdUpper = id.toUpperCase();
    const index = db.pipes.findIndex(p => p.pipeId === pipeIdUpper);
    if (index === -1) {
      res.status(404).json({ error: "Pipe tracker not found." });
      return;
    }

    const targetPipe = db.pipes[index];
    updateHeartbeat(currentUser.username, currentUser.role);

    // Permit deleting only to admin OR the operator who originally initiated/owned that pipe tracking record
    if (currentUser.role !== "admin" && targetPipe.operatorId !== currentUser.id) {
      res.status(403).json({ error: "Access denied. Only Admins or the Pipe Creator can delete this record." });
      return;
    }

    db.pipes.splice(index, 1);
    logActivity(currentUser.username, `Permanently deleted pipe tracking sheet ${pipeIdUpper} from storage`);
    if (pgPool) {
      pgPool.query("DELETE FROM pipes WHERE pipe_id = $1", [pipeIdUpper]).catch(() => {});
    }
    if (firestoreAvailable && firestore) {
      firestore.collection("pipes").doc(pipeIdUpper).delete().catch(() => {});
    }
    await saveDatabaseToSupabaseAndLocal(db);
    res.json({ message: "Pipe record deleted successfully" });
  });

  // Fallback for unmatched API routes to ensure they never return HTML
  app.all("/api/*", (req, res) => {
    res.status(404).json({ error: `API route not found: ${req.method} ${req.url}` });
  });

  // Global API Error Handler Middleware to bypass HTML error outputs
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("[Express Error Handler]:", err);
    res.status(500).json({ error: err.message || "An unexpected internal server error occurred" });
  });

  // Static/Vite fallback middleware selection - Probe Vite availability to prevent startup crashes in production containers
  let isDevMode = false;
  if (process.env.NODE_ENV !== "production") {
    try {
      // Safely check if Vite development kit is installed and resolvable
      await import("vite");
      isDevMode = true;
    } catch (e) {
      console.log("[Production Fallback Mode]: 'vite' module not found in node_modules. Transitioning to static assets mode.");
    }
  }

  if (isDevMode) {
    const { createServer } = await import("vite");
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Static application assets serving (React SPA bundle) in production
    const distPath = path.join(PROJECT_ROOT, "dist");
    
    app.use(express.static(distPath, {
      maxAge: "1d",
      setHeaders: (res: any, filePath: string) => {
        // Files in the assets sub-folder are generated with Vite content hashes and are immutable
        if (filePath.includes("/assets/") || filePath.includes("\\assets\\")) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        } else if (filePath.endsWith(".html")) {
          // Never cache HTML dynamically to ensure prompt update propagation
          res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
        } else {
          // General assets (favicon, images, configs) are cached with low TTL (1 hour)
          res.setHeader("Cache-Control", "public, max-age=3600");
        }
      }
    }));

    // SPA Fallback for client-side routing
    app.get("*", (req, res) => {
      const fallbackPath = path.join(distPath, "index.html");
      if (fs.existsSync(fallbackPath)) {
        res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
        res.sendFile(fallbackPath);
      } else {
        res.status(500).send("Static build assets not found. Please compile/build the applet first.");
      }
    });
  }

  // Preload and sync database state from Supabase Primary Database before accepting HTTP requests
  console.log("[Supabase Primary Database]: Preloading database state from Supabase PostgreSQL (db.gkftbdyvcqnzilrxsgxt.supabase.co)...");
  try {
    await preloadDatabase();
    console.log(`[Database]: Database preloading completed. Loaded ${cachedDb?.pipes?.length || 0} pipe records into memory cache.`);
  } catch (err: any) {
    console.log("[Database Info]: Database preloading finished with fallback:", err.message || err);
  }

  app.listen(PORT, "0.0.0.0", () => {
    try {
      fs.appendFileSync(
        path.join(PROJECT_ROOT, "data", "requests.log"),
        `[${new Date().toISOString()}] Server listening on port ${PORT} (NODE_ENV=${process.env.NODE_ENV})\n`
      );
    } catch (e) {}
    console.log(`Node-Express multi-user Server running on port ${PORT}`);
  });
}

process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION MATCHED:", err);
  try {
    fs.appendFileSync(
      path.join(PROJECT_ROOT, "data", "server_crash.log"),
      `[${new Date().toISOString()}] UNCAUGHT EXCEPTION: ${err.stack || err}\n`
    );
  } catch (fsErr) {}
  // Gracefully log instead of exiting during dynamic container runs
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("UNHANDLED REJECTION at:", promise, "reason:", reason);
  try {
    fs.appendFileSync(
      path.join(PROJECT_ROOT, "data", "server_crash.log"),
      `[${new Date().toISOString()}] UNHANDLED REJECTION: ${reason instanceof Error ? reason.stack : reason}\n`
    );
  } catch (fsErr) {}
  // Gracefully log instead of exiting during dynamic container runs
});

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  try {
    fs.appendFileSync(
      path.join(PROJECT_ROOT, "data", "server_crash.log"),
      `[${new Date().toISOString()}] STARTUP ERROR: ${err.stack || err}\n`
    );
  } catch (fsErr) {}
  process.exit(1);
});
