import React, { useState, useEffect, useRef } from "react";
import { 
  Scan, 
  Clipboard, 
  Check, 
  RefreshCw, 
  Layers,
  Camera,
  Upload,
  Sparkles,
  X,
  AlertCircle,
  HelpCircle,
  CheckCircle
} from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";
import { PipeHeader, PipeType, ProjectConfig } from "../types";
import { formatDateToInputString } from "../utils/dateUtils";

interface HeaderFormProps {
  initialData?: PipeHeader;
  onSaveHeader: (header: PipeHeader) => void;
  isLoading: boolean;
  isEdit?: boolean;
  existingPipeIds?: string[];
  projects?: ProjectConfig[];
  currentUserRole?: string;
}

const PIPE_TYPES: PipeType[] = [
  "GRE",
  "GRV",
  "GRP",
  "Bell/Spigot GRE",
  "Bell/Spigot GRV",
  "Bell/Spigot GRP",
  "Plain Ends GRE",
  "Plain Ends GRV",
  "Plain Ends GRP"
];

// Barcodes that automatically fill out premium preloaded mock-spec values
const PRESET_BARCODES = [
  { pipeId: "PX-GRE-300-A", pipeType: "Bell/Spigot GRE", diameter: 300, pressure: 16, stiffness: 5000, length: 12000, settingReference: "S-GRE-300-16", lotNo: "LOT-A1" },
  { pipeId: "PX-GRV-150-B", pipeType: "Bell/Spigot GRV", diameter: 150, pressure: 25, stiffness: 10000, length: 6000, settingReference: "S-GRV-150-25", lotNo: "LOT-B3" },
  { pipeId: "PX-GRP-200-C", pipeType: "Bell/Spigot GRP", diameter: 200, pressure: 10, stiffness: 2500, length: 12000, settingReference: "S-GRP-200-10", lotNo: "LOT-C8" },
  { pipeId: "PX-PE-GRE-100", pipeType: "Plain Ends GRE", diameter: 100, pressure: 16, stiffness: 5000, length: 6000, settingReference: "S-PE-100-16", lotNo: "LOT-A5" }
];

const formatToInputDate = (dateVal: any): string => {
  return formatDateToInputString(dateVal);
};

function HeaderForm({ 
  initialData, 
  onSaveHeader, 
  isLoading, 
  isEdit = false, 
  existingPipeIds = [], 
  projects = [],
  currentUserRole
}: HeaderFormProps) {
  // State variables for main form fields
  const [pipeId, setPipeId] = useState(initialData?.pipeId || "");
  const [diameter, setDiameter] = useState(initialData?.diameter?.toString() || "");
  const [pressure, setPressure] = useState(initialData?.pressure?.toString() || "");
  const [stiffness, setStiffness] = useState(initialData?.stiffness?.toString() || "");
  const [length, setLength] = useState(initialData?.length?.toString() || "");
  const [thickness, setThickness] = useState(initialData?.thickness?.toString() || "");
  const [junctionType, setJunctionType] = useState(initialData?.junctionType || "");
  const [projectWorkOrder, setProjectWorkOrder] = useState(initialData?.projectWorkOrder || "");
  const [settingReference, setSettingReference] = useState(initialData?.settingReference || "");
  const [pipeType, setPipeType] = useState<PipeType>(initialData?.pipeType || "Bell/Spigot GRE");
  const [productionDate, setProductionDate] = useState(formatToInputDate(initialData?.productionDate));
  const [lotNo, setLotNo] = useState(initialData?.lotNo || "");

  const trimmedId = pipeId.trim().toUpperCase();
  const idAlreadyExists = !isEdit && trimmedId !== "" && existingPipeIds.some(
    (existingId) => existingId.trim().toUpperCase() === trimmedId
  );

  // Auto-populate spec parameters when project & setting reference key change
  useEffect(() => {
    if (!projectWorkOrder) return;
    const foundProject = projects.find(p => p.projectCode === projectWorkOrder);
    if (!foundProject) return;

    const refDetail = settingReference 
      ? foundProject.settingRefDetails?.find(d => d.settingReference.toUpperCase() === settingReference.toUpperCase())
      : foundProject.settingRefDetails?.[0];

    if (refDetail) {
      if (refDetail.pipeClass?.nominalDiameter !== undefined) setDiameter(String(refDetail.pipeClass.nominalDiameter));
      if (refDetail.pipeClass?.nominalPressure !== undefined) setPressure(String(refDetail.pipeClass.nominalPressure));
      if (refDetail.pipeClass?.nominalStiffness !== undefined) setStiffness(String(refDetail.pipeClass.nominalStiffness));
      if (refDetail.productParameters?.length !== undefined) setLength(String(refDetail.productParameters.length));
      if (refDetail.productParameters?.thickness !== undefined) setThickness(String(refDetail.productParameters.thickness));
      if (refDetail.pipeType) setPipeType(refDetail.pipeType as PipeType);
      if (refDetail.junctionType) setJunctionType(refDetail.junctionType);
    } else {
      if (foundProject.pipeClass?.nominalDiameter !== undefined) setDiameter(String(foundProject.pipeClass.nominalDiameter));
      if (foundProject.pipeClass?.nominalPressure !== undefined) setPressure(String(foundProject.pipeClass.nominalPressure));
      if (foundProject.pipeClass?.nominalStiffness !== undefined) setStiffness(String(foundProject.pipeClass.nominalStiffness));
      if (foundProject.productParameters?.length !== undefined) setLength(String(foundProject.productParameters.length));
      if (foundProject.productParameters?.thickness !== undefined) setThickness(String(foundProject.productParameters.thickness));
      if (foundProject.pipeType) setPipeType(foundProject.pipeType as PipeType);
      if (foundProject.junctionType) setJunctionType(foundProject.junctionType);
    }
  }, [projectWorkOrder, settingReference, projects]);

  // Scanning system UI states
  const [showScannerDashboard, setShowScannerDashboard] = useState(false);
  const [activeTab, setActiveTab] = useState<"camera" | "upload" | "demo">("camera");
  
  // Real Camera webcam state
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>("");
  const [cameraActive, setCameraActive] = useState(false);
  const [isInitializingCam, setIsInitializingCam] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);

  // Simulated Scanning
  const [isSimulatingScan, setIsSimulatingScan] = useState(false);

  // Success indicator notice
  const [scanMatchedMsg, setScanMatchedMsg] = useState("");

  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const dragRef = useRef<HTMLDivElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // Auto handle camera scanning based on state changes
  useEffect(() => {
    if (showScannerDashboard && activeTab === "camera" && cameraActive && selectedCameraId) {
      setScannerError(null);
      let isMounted = true;

      const startScannerSession = async () => {
        try {
          // Initialize scanner
          const html5QrCode = new Html5Qrcode("real-camera-preview-box");
          html5QrCodeRef.current = html5QrCode;

          await html5QrCode.start(
            selectedCameraId,
            {
              fps: 10,
              qrbox: (width, height) => {
                // Return a centered box for standard scanning
                const frameSize = Math.round(Math.min(width, height) * 0.7);
                return { width: frameSize, height: frameSize };
              },
              aspectRatio: 1.0
            },
            (decodedText) => {
              if (isMounted) {
                handleSuccessfulDecode(decodedText, "Real Camera Core");
              }
            },
            () => {
              // Verbose error logging filtered
            }
          );
        } catch (err: any) {
          console.error("Failed to start html5Qrcode scanning stream:", err);
          if (isMounted) {
            setScannerError(err?.message || "Required Secure Camera authorization (HTTPS or Localhost).");
            setCameraActive(false);
          }
        }
      };

      startScannerSession();

      return () => {
        isMounted = false;
        if (html5QrCodeRef.current) {
          const currentScanner = html5QrCodeRef.current;
          html5QrCodeRef.current = null;
          if (currentScanner.isScanning) {
            currentScanner.stop().catch((e) => console.warn("Quiet cleanup camera session stop:", e));
          }
        }
      };
    }
  }, [showScannerDashboard, activeTab, cameraActive, selectedCameraId]);

  // Request & get authorized camera sensors list
  const handleOpenCameras = async () => {
    setIsInitializingCam(true);
    setScannerError(null);
    try {
      const cameraList = await Html5Qrcode.getCameras();
      if (cameraList && cameraList.length > 0) {
        setCameras(cameraList);
        
        // Find environment back facing camera if available, default to first sensor
        const backFacingCamera = cameraList.find(c => 
          c.label.toLowerCase().includes("back") || 
          c.label.toLowerCase().includes("rear") || 
          c.label.toLowerCase().includes("environment")
        );
        setSelectedCameraId(backFacingCamera ? backFacingCamera.id : cameraList[0].id);
        setCameraActive(true);
      } else {
        setScannerError("No digital cameras or camera feeds were logged on this machine.");
      }
    } catch (err: any) {
      console.warn("Camera request error details:", err);
      setScannerError("Camera permission rejected or device disconnected. Note: Chrome/Safari require HTTPS context.");
    } finally {
      setIsInitializingCam(false);
    }
  };

  const handleStopCameraStream = async () => {
    setCameraActive(false);
    if (html5QrCodeRef.current) {
      try {
        const currentScanner = html5QrCodeRef.current;
        html5QrCodeRef.current = null;
        if (currentScanner.isScanning) {
          await currentScanner.stop();
        }
      } catch (err) {
        console.warn("Quiet stopping scanner stream:", err);
      }
    }
  };

  // Uploaded image file reader decoder logic
  const handleFileUploadDecode = async (e: React.ChangeEvent<HTMLInputElement> | React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    setScannerError(null);

    let file: File | null = null;
    if ("files" in e.target && e.target.files) {
      file = e.target.files[0];
    } else if ("dataTransfer" in e && e.dataTransfer.files) {
      file = e.dataTransfer.files[0];
    }

    if (!file) return;

    try {
      const tempScanner = new Html5Qrcode("real-file-decoder-temp");
      const decodedText = await tempScanner.scanFile(file, true);
      
      // Clean temporary scanning context
      await tempScanner.clear();
      
      handleSuccessfulDecode(decodedText, "Uploaded Image File");
    } catch (err: any) {
      console.error("File evaluation barcode decode fail:", err);
      setScannerError("Unable to locate or resolve any QR Code or standard 1D Barcode signature. Center the barcode under solid lighting and try again.");
    }
  };

  // Simulated scan
  const handleSimulateScan = () => {
    setIsSimulatingScan(true);
    setScannerError(null);
    
    setTimeout(() => {
      setIsSimulatingScan(false);
      // Pick random barcode
      const randomPreset = PRESET_BARCODES[Math.floor(Math.random() * PRESET_BARCODES.length)];
      const randomizedSuffix = Math.floor(100 + Math.random() * 899);
      const compositeId = `${randomPreset.pipeId}-${randomizedSuffix}`;
      
      handleSuccessfulDecode(compositeId, "Instant Simulator");
    }, 1100);
  };

  const matchPresetToScannedValue = (scannedText: string) => {
    const rawCode = scannedText.trim();
    // Parse preset
    const matchingPreset = PRESET_BARCODES.find(p => 
      rawCode === p.pipeId || 
      rawCode.startsWith(p.pipeId)
    );

    if (matchingPreset) {
      setPipeId(rawCode);
      setPipeType(matchingPreset.pipeType as PipeType);
      setDiameter(matchingPreset.diameter.toString());
      setPressure(matchingPreset.pressure.toString());
      setStiffness(matchingPreset.stiffness.toString());
      setLength(matchingPreset.length.toString());
      if ((matchingPreset as any).thickness !== undefined) setThickness((matchingPreset as any).thickness.toString());
      if ((matchingPreset as any).junctionType !== undefined) setJunctionType((matchingPreset as any).junctionType);
      setSettingReference(matchingPreset.settingReference);
      setLotNo(matchingPreset.lotNo);
      setProjectWorkOrder(`WO-2026-${Math.floor(100 + Math.random() * 899)}`);
      setProductionDate(new Date().toISOString().split("T")[0]);
      return true;
    } else {
      // Direct raw text code binding
      setPipeId(rawCode.toUpperCase());
      // Bind matching fallback defaults so formatting won't be empty
      setDiameter("250");
      setPressure("16");
      setStiffness("5000");
      setLength("12000");
      setThickness("12.5");
      setJunctionType("BELL/SPIGOT 1OR");
      setSettingReference("S-DECODE-NEW");
      setLotNo("LOT-QR-READ");
      setProjectWorkOrder(`WO-2026-${Math.floor(100 + Math.random() * 899)}`);
      setProductionDate(new Date().toISOString().split("T")[0]);
      return false;
    }
  };

  const handleSuccessfulDecode = (decodedText: string, scanSource: string) => {
    // Vibrate phone support
    if (navigator.vibrate) {
      navigator.vibrate(120);
    }

    const matchedPreset = matchPresetToScannedValue(decodedText);
    
    setScanMatchedMsg(
      matchedPreset 
        ? `Successfully verified ${scanSource}: "${decodedText}" matched certified preset parameters!` 
        : `Successfully verified ${scanSource}: Loaded Pipe ID "${decodedText}" into active tracker.`
    );

    // Dynamic UI close
    handleStopCameraStream();
    setShowScannerDashboard(false);

    // Auto wipe dialog after timer
    setTimeout(() => {
      setScanMatchedMsg("");
    }, 4500);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pipeId.trim()) {
      alert("Please scan a barcode or enter a Pipe identification code manually.");
      return;
    }

    onSaveHeader({
      pipeId: pipeId.trim().toUpperCase(),
      diameter: Number(diameter) || 0,
      pressure: Number(pressure) || 0,
      stiffness: Number(stiffness) || 0,
      length: Number(length) || 0,
      thickness: Number(thickness) || 0,
      projectWorkOrder: projectWorkOrder.trim(),
      settingReference: settingReference.trim(),
      pipeType,
      junctionType,
      productionDate,
      lotNo: lotNo.trim(),
    });
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mt-2 transition">
      
      {/* Primary header widget layout */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-5 pb-4 border-b border-gray-100">
        <div>
          <h3 className="font-semibold text-gray-900 text-base flex items-center gap-2">
            <Layers className="w-5 h-5 text-blue-600 animate-pulse" />
            {isEdit ? "Edit Specifications & Physical Properties" : "Pipe Header Setup & Identification"}
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            {isEdit 
              ? "Modify the active pipe identification, dimensions, pressure tolerances, and project lots." 
              : "Configure pipe identification using live scanner, image file verification, or manual entry."}
          </p>
        </div>

        {!isEdit && (
          <button
            type="button"
            onClick={() => {
              setShowScannerDashboard(prev => !prev);
              handleStopCameraStream();
            }}
            className={`w-full md:w-auto relative flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-xs tracking-wide transition border shadow-sm cursor-pointer ${
              showScannerDashboard 
                ? "bg-slate-800 border-slate-800 text-white" 
                : "bg-blue-600 border-blue-600 text-white hover:bg-blue-700"
            }`}
          >
            {showScannerDashboard ? (
              <>
                <X className="w-4 h-4" />
                Close Scanner Desk
              </>
            ) : (
              <>
                <Scan className="w-4 h-4" />
                Scan Barcode / QR Code
              </>
            )}
          </button>
        )}
      </div>

      {/* Embedded hidden scanning hook container for uploading files */}
      <div id="real-file-decoder-temp" className="hidden absolute left-0 top-0 w-0 h-0 opacity-0 pointer-events-none"></div>

      {/* Advanced Real/Simulated Scanner Console Drawer */}
      {showScannerDashboard && (
        <div className="mb-6 bg-slate-900 text-white rounded-2xl p-4 border border-slate-800 shadow-xl overflow-hidden animate-fade-in">
          
          {/* Quick tab controllers */}
          <div className="flex border-b border-slate-800 pb-3 mb-4 overflow-x-auto gap-2 no-scrollbar">
            <button
              type="button"
              onClick={() => {
                setActiveTab("camera");
                handleStopCameraStream();
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold font-sans transition shrink-0 flex items-center gap-1.5 ${
                activeTab === "camera" 
                  ? "bg-blue-600 text-white shadow" 
                  : "bg-slate-850 hover:bg-slate-800 text-slate-400 hover:text-white"
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              1. Live Camera Stream
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab("upload");
                handleStopCameraStream();
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold font-sans transition shrink-0 flex items-center gap-1.5 ${
                activeTab === "upload" 
                  ? "bg-blue-600 text-white shadow" 
                  : "bg-slate-850 hover:bg-slate-800 text-slate-400 hover:text-white"
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              2. Upload Photo File
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab("demo");
                handleStopCameraStream();
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold font-sans transition shrink-0 flex items-center gap-1.5 ${
                activeTab === "demo" 
                  ? "bg-blue-600 text-white shadow" 
                  : "bg-slate-850 hover:bg-slate-800 text-slate-400 hover:text-white"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              3. Interactive Simulator
            </button>
          </div>

          {/* Tab Content Display Area */}
          <div className="space-y-4">
            
            {/* Live Camera Feed Tab */}
            {activeTab === "camera" && (
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div>
                    <h4 className="text-xs font-bold tracking-wider text-slate-300 uppercase flex items-center gap-1">
                      Webcam Scanner Module
                    </h4>
                    <p className="text-[10px] text-slate-400">
                      Decodes physical QR-codes and 1D Industrial Barcodes in real time.
                    </p>
                  </div>

                  {!cameraActive ? (
                    <button
                      type="button"
                      disabled={isInitializingCam}
                      onClick={handleOpenCameras}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-2 px-3.5 rounded-lg cursor-pointer transition active:scale-95 disabled:opacity-50"
                    >
                      {isInitializingCam ? "Initializing Sensors..." : "Power On Webcam Stream"}
                    </button>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      {cameras.length > 1 && (
                        <select
                          value={selectedCameraId}
                          onChange={(e) => setSelectedCameraId(e.target.value)}
                          className="bg-slate-800 text-white text-xs border border-slate-700 p-1.5 rounded-lg cursor-pointer outline-none max-w-[150px]"
                        >
                          {cameras.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.label || `Camera sensor ${c.id}`}
                            </option>
                          ))}
                        </select>
                      )}
                      
                      <button
                        type="button"
                        onClick={handleStopCameraStream}
                        className="bg-red-900 hover:bg-red-800 border border-red-700 text-white font-bold text-xs py-1.5 px-3 rounded-lg cursor-pointer transition active:scale-95"
                      >
                        Stop Stream
                      </button>
                    </div>
                  )}
                </div>

                {/* Stream Video Container Rendering viewport */}
                <div className="relative w-full max-w-sm mx-auto bg-black rounded-xl overflow-hidden aspect-video border border-slate-800 flex flex-col justify-center items-center group">
                  <div id="real-camera-preview-box" className="w-full h-full object-cover"></div>
                  
                  {/* Absolute targeting indicator UI */}
                  {cameraActive && (
                    <>
                      {/* Laser red sweep line */}
                      <div className="absolute inset-x-4 top-1/2 h-0.5 bg-red-500 shadow-[0_0_8px_rgba(239,68,68,1)] animate-pulse z-10"></div>
                      
                      {/* Target corner indicators */}
                      <div className="absolute top-4 left-4 w-5 h-5 border-t-2 border-l-2 border-blue-500 pointer-events-none"></div>
                      <div className="absolute top-4 right-4 w-5 h-5 border-t-2 border-r-2 border-blue-500 pointer-events-none"></div>
                      <div className="absolute bottom-4 left-4 w-5 h-5 border-b-2 border-l-2 border-blue-500 pointer-events-none"></div>
                      <div className="absolute bottom-4 right-4 w-5 h-5 border-b-2 border-r-2 border-blue-500 pointer-events-none"></div>

                      <div className="absolute bottom-2.5 inset-x-0 text-center pointer-events-none">
                        <span className="bg-slate-900/80 text-white text-[10px] px-2 py-0.5 rounded-md font-mono tracking-widest uppercase">
                          Camera active - scanning...
                        </span>
                      </div>
                    </>
                  )}

                  {!cameraActive && (
                    <div className="p-6 text-center text-slate-500 font-sans z-0 flex flex-col items-center">
                      <Camera className="w-10 h-10 mb-2 text-slate-700" />
                      <p className="text-xs">Camera stream currently paused.</p>
                      <p className="text-[10px] mt-0.5 text-slate-600">
                        Click "Power On Webcam Stream" to initialize real image feedback.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Upload image file decoder Tab */}
            {activeTab === "upload" && (
              <div className="space-y-3">
                <div>
                  <h4 className="text-xs font-bold tracking-wider text-slate-300 uppercase">
                    Photo File Decoder Module
                  </h4>
                  <p className="text-[10px] text-slate-400">
                    Upload or drag/drop any picture file containing a QR Code or Barcode. Works offline!
                  </p>
                </div>

                <div
                  ref={dragRef}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragOver(true);
                  }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={handleFileUploadDecode}
                  className={`border-2 border-dashed rounded-xl p-6 text-center transition cursor-pointer flex flex-col items-center justify-center min-h-[140px] ${
                    isDragOver 
                      ? "border-blue-500 bg-slate-800" 
                      : "border-slate-800 hover:border-slate-700 bg-slate-850/50"
                  }`}
                >
                  <Upload className="w-8 h-8 text-slate-500 mb-2" />
                  <p className="text-xs font-semibold text-slate-300">
                    Drag and drop file here, or click to browse files
                  </p>
                  <p className="text-[10px] text-slate-500 mt-1">Supports PNG, JPG, JPEG, GIF formats</p>
                  
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileUploadDecode}
                    className="absolute inset-0 opacity-0 w-full h-full cursor-pointer hidden"
                    id="barcode-image-file-input"
                  />
                  <label
                    htmlFor="barcode-image-file-input"
                    className="mt-3 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs py-1.5 px-3 rounded-lg cursor-pointer border border-slate-750 transition active:scale-95 block"
                  >
                    Select From Device
                  </label>
                </div>
              </div>
            )}

            {/* Sandbox Simulation presets Tab */}
            {activeTab === "demo" && (
              <div className="space-y-3">
                <div>
                  <h4 className="text-xs font-bold tracking-wider text-slate-300 uppercase">
                    Developer Demonstration Simulator
                  </h4>
                  <p className="text-[10px] text-slate-400">
                    Simulate a barcode swipe or quickly click preloaded spec arrays for testing.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 text-left">
                  {PRESET_BARCODES.map((p) => (
                    <button
                      key={p.pipeId}
                      type="button"
                      onClick={() => handleSuccessfulDecode(`${p.pipeId}-${Math.floor(100 + Math.random() * 899)}`, "Preset Simulation")}
                      className="bg-slate-850 hover:bg-slate-800 p-2.5 rounded-lg text-xs leading-normal border border-slate-800 text-slate-300 hover:text-white transition w-full text-left"
                    >
                      <strong className="block text-blue-400 font-mono text-[11px] font-bold">
                        {p.pipeId}-###
                      </strong>
                      <span className="block text-[10px] text-slate-500 font-sans">
                        {p.pipeType} — d:{p.diameter}mm / p:{p.pressure}b
                      </span>
                    </button>
                  ))}
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleSimulateScan}
                    disabled={isSimulatingScan}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white text-xs font-bold py-2.5 rounded-xl transition flex justify-center items-center gap-1.5 active:scale-95"
                  >
                    {isSimulatingScan ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        Triggering Scanner Beam...
                      </>
                    ) : (
                      <>
                        <Scan className="w-3.5 h-3.5" />
                        Simulate Random Laser Barcode Scan Sweep
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Unified Scanner Error messages */}
            {scannerError && (
              <div className="mt-3 bg-red-950 border border-red-850/50 text-red-200 text-xs p-3 rounded-xl flex items-start gap-2 animate-fade-in font-sans">
                <AlertCircle className="w-4.5 h-4.5 text-red-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <span className="font-bold block text-red-300">Scanner Exception Observed</span>
                  <p className="leading-snug text-red-200/90">{scannerError}</p>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* Unified verification notification card */}
      {scanMatchedMsg && (
        <div className="mb-5 bg-emerald-50 border border-emerald-250 text-emerald-850 text-xs p-3.5 rounded-xl flex items-start gap-2.5 animate-bounce">
          <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <div className="space-y-0.5 font-sans">
            <span className="font-bold block text-emerald-950">Barcode Registered!</span>
            <p className="leading-snug">{scanMatchedMsg}</p>
          </div>
        </div>
      )}

      {/* Primary entry attributes fields */}
      <form onSubmit={handleFormSubmit} className="space-y-4">
        
        {/* Step 1: Work Order & Setting Reference Selection */}
        <div className="bg-blue-50/60 border border-blue-200/80 rounded-xl p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-blue-900 uppercase tracking-wide flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] font-black flex items-center justify-center">1</span>
              Work Order & Setting Reference Selection
            </span>
            <span className="text-[10px] text-blue-700 bg-blue-100/80 px-2 py-0.5 rounded-full font-semibold">
              Select to Auto-Fill Pipe Class & Product Parameters
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Project / Work Order Code*
              </label>
              <select
                required
                value={projectWorkOrder}
                onChange={(e) => {
                  const chosen = e.target.value;
                  setProjectWorkOrder(chosen);
                  const found = projects.find(p => p.projectCode === chosen);
                  if (found && found.settingReferences && found.settingReferences.length > 0) {
                    setSettingReference(found.settingReferences[0]);
                  } else {
                    setSettingReference("");
                  }
                }}
                className="w-full bg-white border border-slate-300 focus:border-blue-500 rounded-xl text-sm p-2.5 focus:outline-none transition font-sans cursor-pointer font-bold text-slate-800"
              >
                <option value="">-- Choose Work Order Code --</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.projectCode}>
                    {p.projectCode} {p.client ? `(${p.client})` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Setting Reference Key*
              </label>
              <select
                required
                value={settingReference}
                onChange={(e) => setSettingReference(e.target.value)}
                disabled={!projectWorkOrder}
                className="w-full bg-white border border-slate-300 focus:border-blue-500 rounded-xl text-sm p-2.5 focus:outline-none transition font-sans cursor-pointer font-bold text-slate-800 disabled:opacity-55 disabled:bg-gray-100"
              >
                <option value="">-- Choose Setting Reference --</option>
                {(projects.find(p => p.projectCode === projectWorkOrder)?.settingReferences || []).map((ref) => (
                  <option key={ref} value={ref}>
                    {ref}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Step 2: Auto-Filled Pipe Class & Product Parameters */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-slate-700 text-white text-[10px] font-black flex items-center justify-center">2</span>
              Pipe Class & Product Parameters (Auto-Filled)
            </span>
            {projectWorkOrder && settingReference && (
              <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-600" /> Auto-Filled from Setting Reference
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center justify-between">
                <span>Pipe Type</span>
                <span className="text-[10px] text-blue-700 bg-blue-100/80 px-1.5 py-0.2 rounded font-bold">Auto-Selected</span>
              </label>
              <input
                type="text"
                readOnly
                value={pipeType || "Bell/Spigot GRE"}
                className="w-full bg-slate-100 border border-slate-250 rounded-xl text-sm p-2.5 font-bold text-slate-800 cursor-not-allowed focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Junction Type
              </label>
              <input
                type="text"
                placeholder="e.g. BELL/SPIGOT 1OR"
                value={junctionType}
                onChange={(e) => setJunctionType(e.target.value)}
                className="w-full bg-white border border-slate-250 focus:border-blue-500 rounded-xl text-sm p-2.5 focus:outline-none transition font-sans font-medium text-slate-800"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Length (mm)
              </label>
              <input
                type="text"
                placeholder="e.g. 12000"
                value={length}
                onChange={(e) => setLength(e.target.value)}
                className="w-full bg-white border border-slate-250 focus:border-blue-500 rounded-xl text-sm p-2.5 focus:outline-none transition font-sans"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Pipe Thickness (mm)
              </label>
              <input
                type="text"
                placeholder="e.g. 12.5"
                value={thickness}
                onChange={(e) => setThickness(e.target.value)}
                className="w-full bg-white border border-slate-250 focus:border-blue-500 rounded-xl text-sm p-2.5 focus:outline-none transition font-sans"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Diameter (mm)
              </label>
              <input
                type="text"
                placeholder="e.g. 300"
                value={diameter}
                onChange={(e) => setDiameter(e.target.value)}
                className="w-full bg-white border border-slate-250 focus:border-blue-500 rounded-xl text-sm p-2.5 focus:outline-none transition font-sans"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Pressure (bar)
              </label>
              <input
                type="text"
                placeholder="e.g. 16"
                value={pressure}
                onChange={(e) => setPressure(e.target.value)}
                className="w-full bg-white border border-slate-250 focus:border-blue-500 rounded-xl text-sm p-2.5 focus:outline-none transition font-sans"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Stiffness (Pa)
              </label>
              <input
                type="text"
                placeholder="e.g. 5000"
                value={stiffness}
                onChange={(e) => setStiffness(e.target.value)}
                className="w-full bg-white border border-slate-250 focus:border-blue-500 rounded-xl text-sm p-2.5 focus:outline-none transition font-sans"
              />
            </div>
          </div>
        </div>

        {/* Step 3: User Filled Pipe Identification & Production Details */}
        <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-950 uppercase tracking-wide flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-amber-600 text-white text-[10px] font-black flex items-center justify-center">3</span>
              Pipe Identification & Production Details (Filled by User)
            </span>
            <span className="text-[10px] text-amber-800 bg-amber-100/90 px-2 py-0.5 rounded-full font-semibold">
              User Entry
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex justify-between items-center">
                <span>Pipe ID (scan or type)*</span>
                {isEdit && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                    currentUserRole === "admin" 
                      ? "bg-indigo-50 text-indigo-700 border border-indigo-100" 
                      : "bg-amber-50 text-amber-700 border border-amber-100 animate-pulse"
                  }`}>
                    {currentUserRole === "admin" ? "Unlocked for Admin" : "Locked (Admin Only)"}
                  </span>
                )}
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  disabled={isEdit && currentUserRole !== "admin"}
                  placeholder="e.g. PIPE-S300-112"
                  value={pipeId}
                  onChange={(e) => setPipeId(e.target.value)}
                  className={`w-full border focus:border-blue-500 rounded-xl text-sm py-2.5 pl-3 pr-10 focus:outline-none transition font-sans placeholder-slate-400 font-bold uppercase ${
                    (isEdit && currentUserRole !== "admin")
                      ? "bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed opacity-75" 
                      : "bg-white border-slate-300 text-gray-800"
                  }`}
                />
                <span className="absolute right-3.5 top-3.5 flex items-center text-slate-400 pointer-events-none">
                  <Clipboard className="w-4 h-4" />
                </span>
              </div>
              {idAlreadyExists && (
                <div className="mt-1.5 flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-2.5 font-sans animate-fade-in shadow-2xs">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold block text-amber-900">Sequence Notice: ID Already Exists</span>
                    <span className="text-[11px] text-amber-850">A pipe with ID <strong>{trimmedId}</strong> is already registered. If you initialize it, you can view or append quality checks to its existing worksheet history.</span>
                  </div>
                </div>
              )}
              {isEdit && (
                <span className="text-[10px] text-emerald-600 font-semibold block mt-1">
                  Serial tracker record ID is locked during quality testing.
                </span>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Manufacturing Date*
              </label>
              <input
                type="date"
                required
                value={productionDate}
                onChange={(e) => setProductionDate(e.target.value)}
                className="w-full bg-white border border-slate-300 focus:border-blue-500 rounded-xl text-sm p-2.5 focus:outline-none transition cursor-pointer text-slate-700 font-sans"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Lot Number (N°)*
              </label>
              <input
                type="text"
                required
                placeholder="e.g. LOT-42"
                value={lotNo}
                onChange={(e) => setLotNo(e.target.value)}
                className="w-full bg-white border border-slate-300 focus:border-blue-500 rounded-xl text-sm p-2.5 focus:outline-none transition font-sans"
              />
            </div>
          </div>
        </div>

        <div className="pt-2">
          <button
            type="submit"
            disabled={isLoading}
            className={`w-full text-white font-bold text-xs py-3 rounded-xl shadow-md cursor-pointer transition flex items-center justify-center gap-2 hover:shadow-lg active:scale-[0.99] ${
              isEdit 
                ? "bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400" 
                : "bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400"
            }`}
          >
            {isLoading 
              ? "Saving Joint Specifications..." 
              : isEdit 
                ? "Save & Apply Header Specification Updates" 
                : "Initialize / Update Pipe Tracking Header"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default React.memo(HeaderForm);
