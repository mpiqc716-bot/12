import React, { useState, useEffect } from "react";
import { 
  X, 
  ChevronLeft, 
  ChevronRight, 
  Download, 
  Maximize2, 
  Minimize2, 
  Presentation, 
  CheckCircle2, 
  ShieldCheck, 
  Layers, 
  Activity, 
  Settings, 
  Map, 
  TrendingUp, 
  Database, 
  HelpCircle,
  Sparkles,
  FileText
} from "lucide-react";

interface PresentationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface SlideData {
  id: number;
  title: string;
  subtitle: string;
  category: string;
  icon: React.ElementType;
  accentColor: string;
  overview: string;
  keyFeatures: { title: string; desc: string }[];
  howItFunctions: string[];
  businessValue: string;
  speakerNotes: string;
}

const SLIDES: SlideData[] = [
  {
    id: 1,
    title: "Digital Pipe Quality Control & Tracking System",
    subtitle: "End-to-End Fiberglass & Composite Pipe Quality Management System",
    category: "Executive Summary",
    icon: ShieldCheck,
    accentColor: "from-blue-600 to-indigo-700",
    overview: "A specialized digital quality control platform built for industrial composite pipe manufacturing facilities producing GRE (Glass Reinforced Epoxy), GRV (Glass Reinforced Vinyl Ester), and GRP (Glass Reinforced Polyester) piping systems according to international standards (ISO 14692 and AWWA C950 specifications).",
    keyFeatures: [
      { title: "Real-Time Barcol & Dimensional Validation", desc: "Instant automated comparison of physical measurements against project tolerance matrices." },
      { title: "Multi-Station Quality Tracker", desc: "Station 1 header & hardness registration + Station 2 detailed spigot/bell dimensional inspection." },
      { title: "Central Quality Records & Certification", desc: "Automated PDF Quality Certificate generation and Excel data exports for client submittals." },
      { title: "Plant Floor Visual Tracking Plane", desc: "Interactive 2D spatial floor map displaying pipe locations and live pass/fail status cards." }
    ],
    howItFunctions: [
      "Production operators access terminal stations using role-assigned credentials (Operator or Administrator).",
      "Pipe serial numbers are registered along with Work Order, Project Code, and Setting Reference key.",
      "Measurement inputs automatically calculate compliance against Min/Max tolerance matrices with visual alerts.",
      "Quality managers monitor plant-wide first-pass yield, defect trends, and floor logistics in real time."
    ],
    businessValue: "Replaces prone-to-error paper QC sheets with 100% digital traceability, eliminates out-of-spec shipments, and cuts client audit turnaround from days to seconds.",
    speakerNotes: "Welcome everyone. Today we are presenting the Digital Pipe Quality Control & Tracking System. This platform bridges shop-floor operations with engineering specifications and executive analytics."
  },
  {
    id: 2,
    title: "System Architecture, Tech Stack & Security",
    subtitle: "Robust Full-Stack Engineering & Role-Based Access Control",
    category: "System Architecture",
    icon: ShieldCheck,
    accentColor: "from-indigo-600 to-purple-700",
    overview: "Built on a resilient Node.js Express application backend paired with a high-performance React 18 + Vite frontend, utilizing persistent JSON/Firestore storage, strict TypeScript typing, and JWT bearer token authentication.",
    keyFeatures: [
      { title: "Multi-Tiered Desk Interfaces", desc: "Dedicated Administrator Desk (full configuration rights) and Operator Desk (streamlined execution & read-only specs)." },
      { title: "REST API & Data Persistence", desc: "Endpoint layer (/api/pipes, /api/projects, /api/tolerances) with lazy-loaded database persistence." },
      { title: "Security & Token Lifecycles", desc: "Password hashing, session token expiration, and permission checks preventing unauthorized edits." },
      { title: "Theme Engine & Customization", desc: "Industrial Steel, Midnight Executive, Emerald Precision, and Titanium Gold visual UI themes." }
    ],
    howItFunctions: [
      "Client app authenticates against /api/login and receives a secure session token stored locally.",
      "Admin users can manage project references, edit tolerance thresholds, create user accounts, and execute system backups.",
      "Operator users are restricted to pipe data entry, step inspection updates, and read-only specification reference views.",
      "Automatic database sync ensures multi-terminal consistency across plant floor screens."
    ],
    businessValue: "Ensures zero unauthorized modification of engineering limits while keeping shop-floor terminal user interfaces uncluttered and fast.",
    speakerNotes: "Security and role-based access are core to the platform. Administrators maintain engineering limits, while operators focus on accurate measurement entry."
  },
  {
    id: 3,
    title: "Station 1 & Pipe Header Registration",
    subtitle: "Serial Numbering, Work Orders & Reference Key Assignment",
    category: "Shop Floor Operations",
    icon: Activity,
    accentColor: "from-blue-600 to-cyan-600",
    overview: "The entry point of the manufacturing inspection pipeline where every pipe unit receives its unique identity, project classification, work order binding, and target volume tracking.",
    keyFeatures: [
      { title: "Barcode & Camera Scanner", desc: "Integrated live camera barcode/QR scanner or rapid manual barcode input." },
      { title: "Project Code & Work Order Lookup", desc: "Automatic linkage to active projects (e.g. Mainline Gas Pipeline, Municipal Water Transmission)." },
      { title: "Setting Reference Key Resolution", desc: "Selects pre-configured product specification keys (e.g. REF-GRE-800-PN25)." },
      { title: "Target Meter Volume Counter", desc: "Live tracking of produced meters against total contractually required project meters." }
    ],
    howItFunctions: [
      "Operator scans or types the unique pipe serial number (e.g. P-2026-0812-001).",
      "System populates project client, nominal pipe diameter (DN), nominal pressure rating (PN), and stiffness class (SN).",
      "Work order metadata, operator name, shift, and timestamp are locked into the header record.",
      "System advances the pipe status to 'Under Inspection' and enables Station 1 measurement fields."
    ],
    businessValue: "Prevents duplicate serial number creation and guarantees every pipe is bound to the exact contractual specification set from birth.",
    speakerNotes: "The Tracker form is designed for rapid entry. When an operator types a measurement, the system highlights in real-time whether it complies with specs."
  },
  {
    id: 4,
    title: "Barcol Hardness & Resin Cure Quality Testing",
    subtitle: "Station 1 Mechanical & Hardness Verification (HBa 1-5)",
    category: "Mechanical Testing",
    icon: Activity,
    accentColor: "from-teal-600 to-emerald-700",
    overview: "Evaluates the polymerization degree and resin cross-linking of composite pipe walls through multi-point Barcol hardness testing in accordance with ASTM D2583 / ISO 14692 standards.",
    keyFeatures: [
      { title: "5-Point Hardness Suite", desc: "Captures individual Barcol readings (HBa 1, HBa 2, HBa 3, HBa 4, HBa 5) along the pipe barrel." },
      { title: "Automatic Average Calculation", desc: "Calculates the arithmetic mean hardness across test points automatically." },
      { title: "Min Required Hardness Validation", desc: "Compares average and individual readings against min required Barcol limits (e.g. Min 40 HBa)." },
      { title: "Visual Out-of-Spec Highlighting", desc: "Real-time red highlight warning if hardness falls below the resin cure threshold." }
    ],
    howItFunctions: [
      "Operator uses an Impressor hardener to take 5 readings along the pipe surface.",
      "As values are entered, the system calculates average hardness and validates against the project's tolerance setting.",
      "If hardness is below threshold, the pipe is flagged as under-cured, triggering an automated Non-Conformity alert.",
      "Passing test results unlock the pipe for Station 2 dimensional and joint inspection."
    ],
    businessValue: "Prevents premature structural failure or weeping by ensuring 100% of manufactured pipes reach full resin cure prior to hydrotesting.",
    speakerNotes: "Barcol hardness testing ensures proper chemical polymerization. The system flags under-cured pipes immediately before further machining."
  },
  {
    id: 5,
    title: "Spigot Dimensional Inspection Suite (10 Parameters)",
    subtitle: "Station 2 Machined & Laminated Spigot Joint Verification",
    category: "Dimensional QC",
    icon: Layers,
    accentColor: "from-indigo-600 to-blue-600",
    overview: "Exhaustive dimensional measurement of the spigot male joint end to guarantee leak-free O-ring sealing and structural insertion alignment during site installation.",
    keyFeatures: [
      { title: "Axial Length Measurements", desc: "SA (Spigot end to primary groove), SB, SC, SD, SE, and SF taper lengths in mm." },
      { title: "Diameter Suite", desc: "Ø2S (Spigot sealing diameter), Ø3S (Groove root diameter), and Ø4S (Land diameter)." },
      { title: "Groove Depth SG", desc: "Precise measurement of O-ring rubber gasket lock depth." },
      { title: "Instant Min/Max Limit Checks", desc: "Every parameter is checked against specific upper and lower tolerance bands." }
    ],
    howItFunctions: [
      "Quality inspector measures spigot profile dimensions using calibrated digital calipers and micrometer bands.",
      "Values entered into the Station 2 form are compared instantly against tolerances resolved for that Setting Reference.",
      "In-range values highlight in crisp green, while out-of-spec dimensions turn bold red with deviation deltas.",
      "Inspector can save progress or mark specific parameters as Not Defined (ND) for plain-end pipe configurations."
    ],
    businessValue: "Guarantees 100% field joint fit-up success, eliminating costly pipe joint re-machining at offshore or desert installation sites.",
    speakerNotes: "Spigot dimensions control rubber gasket compression. Our system verifies 10 distinct spigot parameters against client tolerance bands."
  },
  {
    id: 6,
    title: "Bell Dimensional Inspection Suite (8 Parameters)",
    subtitle: "Station 2 Molded & Laminated Bell Female Joint Verification",
    category: "Dimensional QC",
    icon: Layers,
    accentColor: "from-purple-600 to-indigo-700",
    overview: "Comprehensive verification of the bell female receiving socket to ensure proper gasket compression and structural socket depth under working pressures.",
    keyFeatures: [
      { title: "Bell Axial Length Suite", desc: "BA (Bell mouth entry), BB, BC, BD, BE, BF, and BG total bell socket depth in mm." },
      { title: "Internal Diameter Ø2B", desc: "Critical internal bell seating diameter verification." },
      { title: "Flexible Junction Support", desc: "Handles Bell/Spigot 1OR (Single O-Ring), 2OR (Double O-Ring), and Plain End combinations." },
      { title: "Automatic Conditional Masking", desc: "Hides or flags bell parameters when inspecting spigot-only or plain-end fittings." }
    ],
    howItFunctions: [
      "Inspector measures internal bell socket depths using internal depth gauges and telescopic bore micrometers.",
      "Entered values are validated against the specific Bell Tolerance Matrix linked to the project's Setting Reference.",
      "Out-of-range dimensions trigger immediate rejection warnings and offer Non-Conformity Report (NCR) logging.",
      "Complete bell data is appended to the pipe's permanent digital quality record."
    ],
    businessValue: "Prevents hydrotest socket blow-outs and field joint leakage under extreme working pressures (up to 50+ bar).",
    speakerNotes: "Bell dimensions ensure structural socket depth. The app handles various joint geometries like 1OR, 2OR, and plain ends."
  },
  {
    id: 7,
    title: "Quality Control Tolerances & Matrix Configuration",
    subtitle: "Centralized Tolerance Overrides & Non-Conformity Rules",
    category: "Engineering Management",
    icon: Settings,
    accentColor: "from-amber-600 to-orange-700",
    overview: "A multi-tiered tolerance management engine that allows administrators to set global default limits or project-specific client overrides for all 23 QC parameters.",
    keyFeatures: [
      { title: "Global 'All Projects' Baseline", desc: "Fallback tolerance boundaries applied when specific project overrides are not declared." },
      { title: "Project-Specific Custom Overrides", desc: "Client-tailored limits for demanding project specifications." },
      { title: "23 Parameter Matrix", desc: "Individual Min and Max bounds for Barcol, Length, Thickness, Weight, SA-SF, Ø2S-Ø4S, SG, BA-BG, Ø2B." },
      { title: "NCR (Non-Conformity Report) Engine", desc: "Captures operator reasons, corrective action plans, and disposition statuses for failed pipes." }
    ],
    howItFunctions: [
      "Administrators configure tolerance profiles in the Account Panel or Project Specs tab.",
      "When an operator enters measurements, the system resolves tolerances using a hierarchy: Project-Specific > All Projects Baseline.",
      "Any out-of-bound value flags the pipe as 'FAIL' and prompts the operator to record an NCR reason.",
      "Administrators can view plant-wide non-conformity logs and adjust limits when engineering changes occur."
    ],
    businessValue: "Maintains total audit compliance with client engineering standards while allowing agile line switching between project runs.",
    speakerNotes: "Tolerance matrices ensure strict compliance. Fallbacks keep standard quality rules active while allowing client-specific overrides."
  },
  {
    id: 8,
    title: "Records Ledger & Master Quality Database",
    subtitle: "Searchable Central Quality Ledger & Certificate Generation",
    category: "Data Management",
    icon: Database,
    accentColor: "from-emerald-600 to-teal-700",
    overview: "A high-density data management table storing every manufactured pipe record, complete with global instant search, multi-filter criteria, and batch documentation.",
    keyFeatures: [
      { title: "Instant Multi-Field Search", desc: "Filter instantly by pipe serial number, project code, work order, operator name, or date range." },
      { title: "Quality Status Badges", desc: "Visual status pills for PASS (Emerald), FAIL (Rose), UNDER INSPECTION (Amber), and DISPATCHED (Blue)." },
      { title: "One-Click PDF Quality Certificates", desc: "Generates branded PDF inspection release certificates ready for client sign-off." },
      { title: "Bulk Data Export Engine", desc: "One-click export of complete or filtered inspection ledgers into CSV and Excel formats." }
    ],
    howItFunctions: [
      "Every submitted pipe inspection streams into the central ledger with full timestamp and operator audit trails.",
      "Inspectors search records to inspect historical measurements, modify step details, or mark pipes as Dispatched.",
      "PDF generator compiles header data, mechanical test scores, spigot/bell dimensions, and compliance stamps onto formal certificates."
    ],
    businessValue: "Replaces manual certificate compilation (hours of work) with instant 1-click PDF releases for client inspection agents.",
    speakerNotes: "The Records Dashboard is our central ledger. Quality managers can search any pipe serial number and view its full measurement history."
  },
  {
    id: 9,
    title: "Interactive 2D Visual Floor Tracking Plane",
    subtitle: "Plant Floor Spatial Grid & Live Location Map",
    category: "Visual Management",
    icon: Map,
    accentColor: "from-purple-600 to-indigo-800",
    overview: "An interactive top-down 2D floor grid representing physical factory bays and yard storage, displaying live pipe locations and quality compliance statuses visually.",
    keyFeatures: [
      { title: "Multi-Bay Factory Grid Layout", desc: "Visual representation of Winding Bay A, Curing Bay B, Hydrotest Bay C, and Yard Storage." },
      { title: "Interactive Pipe Cards", desc: "Color-coded cards displaying serial number, project code, current station, and pass/fail indicator." },
      { title: "One-Click Modal Drill-Down", desc: "Clicking any card on the floor map opens its full inspection datasheet." },
      { title: "Live Bay Capacity Indicators", desc: "Visual count of active pipes per bay to optimize material handling forklift movement." }
    ],
    howItFunctions: [
      "As pipes transition through manufacturing steps, operators or floor supervisors update the pipe's bay assignment.",
      "The Tracking Plane renders a live top-down visual map accessible from any plant monitor or tablet.",
      "Quality managers can spot bottlenecked bays (e.g. 15 pipes stuck in Curing Bay B) at a glance.",
      "Quick filter highlights failing or pending pipes on the floor for immediate quarantine isolation."
    ],
    businessValue: "Eliminates lost or misplaced pipe inventory in sprawling factory yards and streamlines physical quality isolation workflows.",
    speakerNotes: "The 2D Tracking Plane transforms raw data into a visual plant map. Quality teams can locate any pipe physically on the floor in seconds."
  },
  {
    id: 10,
    title: "Portfolio Analytics & Performance Metrics",
    subtitle: "Executive Quality Dashboards & First-Pass Yield Analytics",
    category: "Analytics & Intelligence",
    icon: TrendingUp,
    accentColor: "from-amber-600 to-orange-700",
    overview: "Advanced statistical dashboard providing plant directors and quality heads with real-time OEE, yield trends, defect root-cause pareto charts, and production velocity.",
    keyFeatures: [
      { title: "First-Pass Yield (FPY) Metric", desc: "Live calculation of first-time pass percentage across all active production lines." },
      { title: "Total Production Velocity Tracker", desc: "Tracks produced meters versus contractually scheduled target meters per project." },
      { title: "Defect Parameter Breakdown", desc: "Pareto distribution chart pinpointing exact failing parameters (e.g., 60% Barcol, 25% Ø2S, 15% Thickness)." },
      { title: "Multi-Page Executive PDF Summary", desc: "Exports complete visual analytics reports with formatted executive chart summaries." }
    ],
    howItFunctions: [
      "The analytics engine aggregates data points from all pipe records in real time.",
      "Recharts visualization library renders dynamic line graphs, bar charts, and circular yield meters.",
      "Plant managers analyze defect trends to identify raw resin batch issues or winding machine alignment drift.",
      "One-click executive PDF export compiles project progress and quality health for monthly management reviews."
    ],
    businessValue: "Drives continuous quality improvement (CQI), reduces composite material scrap costs by up to 25%, and optimizes factory throughput.",
    speakerNotes: "Portfolio Analytics turns daily inspection data into actionable intelligence, highlighting top defect root causes and overall production compliance."
  },
  {
    id: 11,
    title: "Operator Specification View & Read-Only Modal",
    subtitle: "Shop-Floor Read-Only Specification Sheet",
    category: "Operator Safety & Guidance",
    icon: FileText,
    accentColor: "from-indigo-600 to-slate-800",
    overview: "A dedicated read-only specification inspector accessible to shop-floor operators to consult official engineering specifications without risk of accidental data modification.",
    keyFeatures: [
      { title: "Complete Project Reference Breakdown", desc: "Displays Nominal Diameter (DN), Nominal Pressure (PN), and Stiffness Class (SN)." },
      { title: "Product Nominal Specifications", desc: "Exact target length (mm), wall thickness (mm), and unit pipe weight (kg)." },
      { title: "Full Dimensional Specification Sheet", desc: "Complete spigot and bell nominal profiles + exact Min/Max tolerance matrices." },
      { title: "Strict Read-Only Protection", desc: "Zero edit inputs or delete actions, guaranteeing operators cannot alter client engineering limits." }
    ],
    howItFunctions: [
      "Operators click the 'View Full Specs' button on any project card in the Project Specs module.",
      "A modal window pops up presenting the complete engineering reference data sheet for that project.",
      "Operators verify machine setup parameters (e.g., mandrel diameter, winding angle, target wall thickness).",
      "The modal can be accessed on tablets or floor terminals at any time during active production shifts."
    ],
    businessValue: "Empowers operators with instant access to engineering standards while guaranteeing total protection against accidental spec tampering.",
    speakerNotes: "Operators can view full specifications anytime in read-only mode, keeping floor workers informed without risking accidental changes to engineering tolerances."
  },
  {
    id: 12,
    title: "Data Backup, Disaster Recovery & Operational Summary",
    subtitle: "Durability, JSON Database Export/Import & Business Impact",
    category: "System Administration",
    icon: Database,
    accentColor: "from-slate-700 to-slate-900",
    overview: "Comprehensive system maintenance toolset ensuring total data safety, instant disaster recovery, and seamless multi-system data portability.",
    keyFeatures: [
      { title: "Full JSON System State Backup", desc: "One-click export of complete database snapshot (Pipes, Projects, Tolerances, Users, Logs)." },
      { title: "Atomic Database Restoration Engine", desc: "Safe JSON file import with Overwrite or Merge options and schema validation." },
      { title: "Audit Logging & User Activity", desc: "Timestamped event logs tracking login sessions, data edits, and admin configuration changes." },
      { title: "Enterprise-Grade Reliability", desc: "Zero-downtime architecture designed for continuous 24/7 manufacturing operations." }
    ],
    howItFunctions: [
      "System administrators trigger automated or manual JSON database exports at the end of each shift or week.",
      "In case of terminal hardware failure or system migration, the JSON backup file can be restored in under 5 seconds.",
      "Merging capabilities allow combining offline terminal inspection logs into the primary central database.",
      "Comprehensive audit trails record every user interaction for ISO 9001 quality audit compliance."
    ],
    businessValue: "Ensures 100% data durability, eliminates risk of data loss, and delivers complete paperless transformation for composite pipe manufacturing.",
    speakerNotes: "In summary, this system provides an end-to-end digital foundation for fiberglass pipe manufacturing—from scanning on the floor to executive reporting and full data backup."
  }
];

export default function PresentationModal({ isOpen, onClose }: PresentationModalProps) {
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSpeakerNotes, setShowSpeakerNotes] = useState(false);
  const [isGeneratingPptx, setIsGeneratingPptx] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === "ArrowRight" || e.key === "Space") {
        e.preventDefault();
        setCurrentSlideIndex(prev => Math.min(prev + 1, SLIDES.length - 1));
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setCurrentSlideIndex(prev => Math.max(prev - 1, 0));
      } else if (e.key === "Escape" && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isFullscreen]);

  if (!isOpen) return null;

  const slide = SLIDES[currentSlideIndex];
  const IconComponent = slide.icon;

  const handleDownloadPptx = async () => {
    try {
      setIsGeneratingPptx(true);
      const pptxModule = await import("pptxgenjs");
      const PptxGen = (pptxModule.default || pptxModule) as any;
      const pptx = new PptxGen();
      const rectShape = pptx.ShapeType?.rect || "rect";
      const roundRectShape = pptx.ShapeType?.roundRect || "roundRect";
      
      pptx.layout = "LAYOUT_16x9";
      pptx.author = "Quality Engineering Team";
      pptx.company = "Digital Pipe QC Platform";
      pptx.title = "Digital Pipe Quality Control & Tracking System - Full Presentation";

      // Slide 1: Title Slide (Dark navy luxury)
      const slide1 = pptx.addSlide();
      slide1.background = { color: "0F172A" }; // Slate 900
      
      slide1.addText("DIGITAL PIPE QUALITY CONTROL & TRACKING SYSTEM", {
        x: 0.8,
        y: 1.8,
        w: 11.5,
        h: 1.2,
        fontSize: 32,
        bold: true,
        color: "38BDF8", // Sky blue
        fontFace: "Arial"
      });

      slide1.addText("End-to-End Fiberglass & Composite Pipe Quality Management System", {
        x: 0.8,
        y: 3.1,
        w: 11.5,
        h: 0.8,
        fontSize: 18,
        color: "94A3B8", // Slate 400
        fontFace: "Arial"
      });

      slide1.addShape(rectShape, {
        x: 0.8,
        y: 4.2,
        w: 4.0,
        h: 0.05,
        fill: { color: "0284C7" }
      });

      slide1.addText("Full Technical Feature Presentation & Operational Architecture", {
        x: 0.8,
        y: 4.6,
        w: 11.5,
        h: 0.6,
        fontSize: 14,
        color: "CBD5E1",
        italic: true,
        fontFace: "Arial"
      });

      // Slide 2 to Slide 9: Detailed Feature Slides
      SLIDES.forEach((item, index) => {
        const s = pptx.addSlide();
        s.background = { color: "F8FAFC" }; // Slate 50

        // Header Banner
        s.addShape(rectShape, {
          x: 0,
          y: 0,
          w: 13.33,
          h: 1.1,
          fill: { color: "0F172A" }
        });

        s.addText(`SLIDE ${index + 1} OF ${SLIDES.length} | ${item.category.toUpperCase()}`, {
          x: 0.8,
          y: 0.2,
          w: 10,
          h: 0.3,
          fontSize: 10,
          bold: true,
          color: "38BDF8",
          fontFace: "Arial"
        });

        s.addText(item.title, {
          x: 0.8,
          y: 0.45,
          w: 11.5,
          h: 0.5,
          fontSize: 20,
          bold: true,
          color: "FFFFFF",
          fontFace: "Arial"
        });

        // Overview Box
        s.addShape(rectShape, {
          x: 0.8,
          y: 1.3,
          w: 11.73,
          h: 0.9,
          fill: { color: "EFF6FF" },
          line: { color: "BFDBFE", width: 1 }
        });

        s.addText(item.overview, {
          x: 1.0,
          y: 1.35,
          w: 11.33,
          h: 0.8,
          fontSize: 12,
          color: "1E3A8A",
          fontFace: "Arial"
        });

        // Key Features Column (Left Box)
        s.addText("KEY CAPABILITIES & FEATURES", {
          x: 0.8,
          y: 2.35,
          w: 5.6,
          h: 0.3,
          fontSize: 12,
          bold: true,
          color: "0F172A",
          fontFace: "Arial"
        });

        item.keyFeatures.forEach((feat, fIdx) => {
          const yPos = 2.7 + fIdx * 0.9;
          s.addShape(roundRectShape, {
            x: 0.8,
            y: yPos,
            w: 5.6,
            h: 0.8,
            fill: { color: "FFFFFF" },
            line: { color: "E2E8F0", width: 1 }
          });

          s.addText(feat.title, {
            x: 0.95,
            y: yPos + 0.08,
            w: 5.3,
            h: 0.3,
            fontSize: 11,
            bold: true,
            color: "0369A1",
            fontFace: "Arial"
          });

          s.addText(feat.desc, {
            x: 0.95,
            y: yPos + 0.35,
            w: 5.3,
            h: 0.4,
            fontSize: 9.5,
            color: "475569",
            fontFace: "Arial"
          });
        });

        // How it Functions Column (Right Box)
        s.addText("OPERATIONAL WORKFLOW", {
          x: 6.8,
          y: 2.35,
          w: 5.7,
          h: 0.3,
          fontSize: 12,
          bold: true,
          color: "0F172A",
          fontFace: "Arial"
        });

        s.addShape(roundRectShape, {
          x: 6.8,
          y: 2.7,
          w: 5.73,
          h: 2.5,
          fill: { color: "FFFFFF" },
          line: { color: "CBD5E1", width: 1 }
        });

        const workflowBullets = item.howItFunctions.map(step => ({
          text: step,
          options: { fontSize: 10, color: "334155", bullet: true, spaceAfter: 6 }
        }));

        s.addText(workflowBullets, {
          x: 7.0,
          y: 2.8,
          w: 5.33,
          h: 2.3,
          fontFace: "Arial"
        });

        // Business Value Callout Footer
        s.addShape(rectShape, {
          x: 6.8,
          y: 5.35,
          w: 5.73,
          h: 1.05,
          fill: { color: "F0FDF4" },
          line: { color: "BBF7D0", width: 1 }
        });

        s.addText("VALUE & IMPACT:", {
          x: 7.0,
          y: 5.45,
          w: 5.3,
          h: 0.25,
          fontSize: 10,
          bold: true,
          color: "15803D",
          fontFace: "Arial"
        });

        s.addText(item.businessValue, {
          x: 7.0,
          y: 5.7,
          w: 5.3,
          h: 0.6,
          fontSize: 10,
          color: "166534",
          fontFace: "Arial"
        });
      });

      // Save file
      await pptx.writeFile({ fileName: "Pipe_QC_System_Presentation.pptx" });
      setIsGeneratingPptx(false);
    } catch (err) {
      console.error("Error generating PPTX presentation:", err);
      alert("Failed to export PowerPoint presentation. Please try again.");
      setIsGeneratingPptx(false);
    }
  };

  return (
    <div className={`fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex flex-col justify-between p-3 sm:p-6 transition-all duration-300 font-sans ${
      isFullscreen ? "p-0" : ""
    }`}>
      
      {/* Top Navigation Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 text-white flex flex-wrap items-center justify-between gap-3 shadow-xl shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-600/20 text-blue-400 rounded-xl border border-blue-500/30">
            <Presentation className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h3 className="font-extrabold text-sm sm:text-base tracking-wide flex items-center gap-2">
              System Presentation & Feature Showcase
            </h3>
            <p className="text-xs text-slate-400">
              Slide {currentSlideIndex + 1} of {SLIDES.length} — {slide.category}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Download PowerPoint Button */}
          <button
            type="button"
            onClick={handleDownloadPptx}
            disabled={isGeneratingPptx}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs px-3.5 py-2 rounded-xl transition shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            title="Download full PowerPoint (.pptx) file"
          >
            <Download className="w-4 h-4" />
            <span>{isGeneratingPptx ? "Exporting .pptx..." : "Download PowerPoint (.pptx)"}</span>
          </button>

          {/* Toggle Speaker Notes */}
          <button
            type="button"
            onClick={() => setShowSpeakerNotes(!showSpeakerNotes)}
            className={`text-xs font-bold px-3 py-2 rounded-xl border transition cursor-pointer ${
              showSpeakerNotes ? "bg-amber-500/20 text-amber-300 border-amber-500/40" : "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700"
            }`}
          >
            Speaker Notes
          </button>

          {/* Fullscreen Toggle */}
          <button
            type="button"
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="bg-slate-800 hover:bg-slate-700 text-slate-300 p-2 rounded-xl border border-slate-700 transition cursor-pointer"
            title="Toggle fullscreen"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          {/* Close Modal */}
          <button
            type="button"
            onClick={onClose}
            className="bg-slate-800 hover:bg-rose-600 text-slate-300 hover:text-white p-2 rounded-xl border border-slate-700 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Slide Stage */}
      <div className="flex-1 my-4 flex flex-col justify-center max-w-6xl w-full mx-auto overflow-hidden">
        
        {/* Slide Canvas Card */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[75vh] animate-fade-in">
          
          {/* Slide Header Banner */}
          <div className={`bg-gradient-to-r ${slide.accentColor} p-6 text-white flex justify-between items-center shadow-md shrink-0`}>
            <div className="space-y-1">
              <span className="text-[11px] font-black uppercase tracking-wider bg-white/20 px-3 py-1 rounded-full text-white/90">
                {slide.category}
              </span>
              <h2 className="text-xl sm:text-2xl font-black tracking-tight">{slide.title}</h2>
              <p className="text-xs sm:text-sm text-white/80 font-medium">{slide.subtitle}</p>
            </div>
            <div className="hidden sm:flex p-3 bg-white/10 rounded-2xl backdrop-blur-md border border-white/20">
              <IconComponent className="w-8 h-8 text-white" />
            </div>
          </div>

          {/* Slide Body */}
          <div className="p-6 overflow-y-auto space-y-6 flex-1">
            
            {/* Overview Banner */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs sm:text-sm text-slate-800 leading-relaxed font-medium">
              <strong className="text-slate-900 block font-extrabold uppercase text-[11px] tracking-wider text-indigo-700 mb-1">
                Executive Overview
              </strong>
              {slide.overview}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Key Features Column */}
              <div className="space-y-3">
                <h4 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-blue-600" />
                  Key Features & Capabilities
                </h4>
                <div className="space-y-2.5">
                  {slide.keyFeatures.map((feat, i) => (
                    <div key={i} className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs space-y-1 hover:border-indigo-300 transition">
                      <div className="text-xs font-black text-indigo-900 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        {feat.title}
                      </div>
                      <div className="text-xs text-slate-600 pl-5">{feat.desc}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Operational Workflow Column */}
              <div className="space-y-3">
                <h4 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <Layers className="w-4 h-4 text-indigo-600" />
                  How the App Functions
                </h4>
                <div className="bg-slate-50/80 border border-slate-200 rounded-2xl p-4 space-y-2.5">
                  {slide.howItFunctions.map((step, idx) => (
                    <div key={idx} className="flex items-start gap-2.5 text-xs text-slate-700">
                      <span className="w-5 h-5 rounded-full bg-indigo-600 text-white font-black text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                        {idx + 1}
                      </span>
                      <span className="font-medium">{step}</span>
                    </div>
                  ))}
                </div>

                {/* Business Value Footer */}
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-900">
                  <strong className="block font-bold text-emerald-800 uppercase text-[10px] tracking-wider mb-0.5">
                    Business Impact & Operational Value:
                  </strong>
                  {slide.businessValue}
                </div>
              </div>

            </div>

            {/* Speaker Notes Overlay */}
            {showSpeakerNotes && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs text-amber-950 font-mono space-y-1 animate-fade-in">
                <strong className="block text-amber-900 font-extrabold uppercase text-[10px]">
                  🎙️ Presenter Speaker Notes:
                </strong>
                <p>{slide.speakerNotes}</p>
              </div>
            )}

          </div>

        </div>

      </div>

      {/* Bottom Deck Navigation Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 text-white flex flex-wrap items-center justify-between gap-3 shadow-xl shrink-0 max-w-6xl w-full mx-auto">
        
        {/* Previous Button */}
        <button
          type="button"
          onClick={() => setCurrentSlideIndex(prev => Math.max(prev - 1, 0))}
          disabled={currentSlideIndex === 0}
          className="bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Previous Slide</span>
        </button>

        {/* Thumbnail Selector Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto max-w-xl py-1">
          {SLIDES.map((s, idx) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setCurrentSlideIndex(idx)}
              className={`w-7 h-7 rounded-lg text-xs font-black transition flex items-center justify-center shrink-0 cursor-pointer ${
                currentSlideIndex === idx
                  ? "bg-blue-600 text-white ring-2 ring-blue-400"
                  : "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white"
              }`}
              title={`Slide ${idx + 1}: ${s.title}`}
            >
              {idx + 1}
            </button>
          ))}
        </div>

        {/* Next Button */}
        <button
          type="button"
          onClick={() => setCurrentSlideIndex(prev => Math.min(prev + 1, SLIDES.length - 1))}
          disabled={currentSlideIndex === SLIDES.length - 1}
          className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-md"
        >
          <span>Next Slide</span>
          <ChevronRight className="w-4 h-4" />
        </button>

      </div>

    </div>
  );
}
