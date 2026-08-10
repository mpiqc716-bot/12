export type UserRole = 'operator' | 'admin';

export interface User {
  id: string;
  username: string;
  role: UserRole;
  password?: string; // only used in backend or when saving/updating
}

export type PipeType = 
  | 'GRE'
  | 'GRV'
  | 'GRP'
  | 'Bell/Spigot GRE' 
  | 'Bell/Spigot GRV' 
  | 'Bell/Spigot GRP' 
  | 'Plain Ends GRE' 
  | 'Plain Ends GRV' 
  | 'Plain Ends GRP'
  | string;

export type JunctionType =
  | 'BELL/SPIGOT 1OR'
  | 'BELL/SPIGOT 2OR'
  | 'BELL/SPIGOT 2 OR 1 LK'
  | 'BELL/SPIGOT 1 OR 2 LK'
  | 'PLAIN ENDS'
  | 'BELL/PLAIN END'
  | 'SPIGOT/PLAIN END'
  | string;

export interface PipeClassConfig {
  nominalDiameter?: number | string; // 2-1 Nominal diameter (DN - mm)
  nominalPressure?: number | string; // 2-1 Nominal pressure (PN - bar)
  nominalStiffness?: number | string; // 2-1 Nominal stiffness (SN - Pa / N/m²)
}

export interface SpigotDetailConfig {
  sa?: number | string;
  sb?: number | string;
  sc?: number | string;
  sd?: number | string;
  se?: number | string;
  sf?: number | string;
  o2s?: number | string; // Ø2S
  o3s?: number | string; // Ø3S
  o4s?: number | string; // Ø4S
  sg?: number | string;
}

export interface BellDetailConfig {
  ba?: number | string;
  bb?: number | string;
  bc?: number | string;
  bd?: number | string;
  be?: number | string;
  bf?: number | string;
  bg?: number | string;
  o2b?: number | string; // Ø2B
}

export interface ProductParametersConfig {
  length?: number | string; // 5-1 Length (mm)
  thickness?: number | string; // 5-2 Thickness (mm)
  weight?: number | string; // 5-3 Weight (kg)
  spigotDetail?: SpigotDetailConfig; // 5-4 Spigot detail (SA, SB, SC, SD, SE, SF, Ø2S, Ø3S, Ø4S, SG)
  bellDetail?: BellDetailConfig; // 5-5 Bell detail (BA, BB, BC, BD, BE, BF, BG, Ø2B)
  spigotNotDefined?: boolean; // Flag to indicate if Spigot Details are Not Defined / N/A
  bellNotDefined?: boolean; // Flag to indicate if Bell Details are Not Defined / N/A
}

export interface PipeHeader {
  pipeId: string; // scanned barcode / typing
  diameter: number; // mm
  pressure: number; // bar
  stiffness: number; // Pa
  length: number; // mm
  projectWorkOrder: string;
  settingReference: string;
  pipeType: PipeType;
  productionDate: string;
  lotNo: string;

  // Reference fields
  client?: string;
  junctionType?: JunctionType;
  thickness?: number;
  weight?: number;
}

export interface StepQualityCheck {
  id: string;
  label: string;
  status: 'Pass' | 'Fail' | null;
}

export interface Step1Data {
  moldSerial: string;
  moldCondition: string;
}

export interface Step2Data {
  resinType: string;
  resinBatch: string;
  cGlassType: string;
  cGlassBatch: string;
  wovenType: string;
  wovenBatch: string;
}

export interface Step3Data {
  resinType: string;
  resinBatch: string;
  layersCount: number;
  windingAngle: number;
  hoopType: string;
  hoopBatch: string;
}

export interface Step4Data {
  cureTemp: string;
  cureTime: string;
  testBlock: 'Applicable' | 'Not applicable';
  tgValue?: string;
  barcolTest?: 'Applicable' | 'Not applicable';
  barcolValue?: string;
  barcolMinReq?: string;
  barcolResult?: string;
  barcolDeviceSerial?: string;
  barcolReadings?: string;
  testResult?: string;
}

export interface Step5Data {
}

export interface Step6Data {
  // Spigot dimensional checks in mm
  sa: number;
  sb: number;
  sc: number;
  sd: number;
  se: number;
  sf: number;
  o2s?: number;
  o3s?: number;
  o4s?: number;
  sg?: number;
  pipeLength?: number;
  pipeThickness?: number;
}

export interface Step7Data {
  // Bell dimensional checks in mm
  o2b?: number;
  ba?: number;
  bb?: number;
  bc: number;
  bd: number;
  be: number;
  bf: number;
  bg: number;
}

export interface Step8Data {
  packaging?: string;
  inspectorName: string;
  hydrostaticTest?: "applicable" | "not_applicable";
  hydrostaticTime?: string;
  hydrostaticStatus?: "TC" | "TNC";
  vernierCaliperSerial?: string;
  crcometerSerial?: string;
  pipeWeight?: number;
  pipeDestination?: string;
}

export interface StepModification {
  at: string;
  byUser: string;
  fromUser: string;
  toUser: string;
  changes: {
    item: string;
    from: string;
    to: string;
  }[];
}

export interface StepRecord {
  stepNo: number;
  isCompleted: boolean;
  savedBy: string; // username
  savedAt: string;
  fields: Step1Data | Step2Data | Step3Data | Step4Data | Step5Data | Step6Data | Step7Data | Step8Data | {};
  qualityChecks: StepQualityCheck[];
  additionalObs: string;
  image?: string; // base64 string
  isNonConform?: boolean;
  ncrReason?: string;
  modifications?: StepModification[];
}

export interface PipeRecord {
  pipeId: string;
  header: PipeHeader;
  operatorId: string;
  operatorUsername: string;
  createdAt: string;
  lastUpdatedAt: string;
  steps: {
    [key: number]: StepRecord; // steps 1 to 8
  };
  isDispatched?: boolean;
  dispatchedAt?: string;
  dispatchedBy?: string;
  isSimplified?: boolean;
  targetActiveStep?: number;
}

export interface DashboardStats {
  totalPipes: number;
  completedPipes: number;
  activePipes: number;
  stepCompletionRates: { [key: number]: number };
  statusDistribution: { pass: number; fail: number; inProgress: number };
}

export interface ParameterTolerance {
  min: number | "ND" | null;
  max: number | "ND" | null;
}

export interface ToleranceConfig {
  id: string;
  project: string; // projectWorkOrder or "All Projects"
  specification: string; // settingReference or "All Specifications"
  
  // Step 4 Barcol Hardness Min Requirement (HBa)
  barcolMinReq?: ParameterTolerance;

  // Step 6 Spigot parameters (mm)
  sa?: ParameterTolerance;
  sb?: ParameterTolerance;
  sc?: ParameterTolerance;
  sd?: ParameterTolerance;
  se?: ParameterTolerance;
  sf?: ParameterTolerance;
  o2s?: ParameterTolerance;
  o3s?: ParameterTolerance;
  o4s?: ParameterTolerance;
  sg?: ParameterTolerance;
  pipeLength?: ParameterTolerance;
  pipeThickness?: ParameterTolerance;

  // Step 7 Bell parameters (mm)
  o2b?: ParameterTolerance;
  ba?: ParameterTolerance;
  bb?: ParameterTolerance;
  bc?: ParameterTolerance;
  bd?: ParameterTolerance;
  be?: ParameterTolerance;
  bf?: ParameterTolerance;
  bg?: ParameterTolerance;

  // Step 8 Final parameter
  pipeWeight?: ParameterTolerance;
}

export interface ProjectSettingReferenceData {
  settingReference: string;
  targetQuantityMeters?: number;
  productionStartDate?: string;
  productionEndDate?: string;

  // 1 - The Client (Optional)
  client?: string;

  // 2 - Pipe Class
  pipeClass?: PipeClassConfig;

  // 3 - Pipe Type (GRE, GRV, GRP, etc.)
  pipeType?: string;

  // 4 - Junction Type (BELL/SPIGOT 1, BELL/SPIGOT 2, etc.)
  junctionType?: string;

  // 5 - Product Parameters (Length, Thickness, Weight, Spigot Details, Bell Details)
  productParameters?: ProductParametersConfig;

  // Specification Limits (Min & Max tolerances for product parameters, spigot details, bell details)
  specificationLimits?: Partial<ToleranceConfig>;
}

export interface ProjectConfig {
  id: string;
  projectCode: string;
  client?: string;
  pipeClass?: PipeClassConfig;
  pipeType?: string;
  junctionType?: string;
  productParameters?: ProductParametersConfig;
  settingReferences: string[];
  settingRefDetails?: ProjectSettingReferenceData[];
  targetQuantityMeters?: number;
  productionStartDate?: string;
  productionEndDate?: string;
}

export interface ChatMessage {
  id: string;
  username: string;
  role: UserRole;
  text: string;
  timestamp: string;
}
