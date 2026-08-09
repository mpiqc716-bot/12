import React, { useState, useRef } from "react";
import { Camera, Image as ImageIcon, X, Check, RefreshCw } from "lucide-react";

interface CameraCaptureProps {
  onImageCaptured: (base64Image: string) => void;
  currentImage?: string;
  onClear: () => void;
}

export default function CameraCapture({ onImageCaptured, currentImage, onClear }: CameraCaptureProps) {
  const [isActive, setIsActive] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Resize and compress captured image to base64
  const handleImageResize = (base64Str: string): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = base64Str;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 480;
        const MAX_HEIGHT = 480;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL("image/jpeg", 0.7)); // compress to 70% quality jpeg
        } else {
          resolve(base64Str);
        }
      };
      img.onerror = () => resolve(base64Str);
    });
  };

  // Start back-facing camera
  const startCamera = async () => {
    setErrorMsg(null);
    setIsActive(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: { ideal: "environment" },
          width: { ideal: 640 },
          height: { ideal: 480 }
        },
        audio: false
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch (err: any) {
      console.warn("MediaDevices camera stream failed/blocked: ", err);
      setErrorMsg("Camera stream blocked or unavailable. Please use the Upload/Capture file option below.");
      setIsActive(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsActive(false);
  };

  const capturePhoto = async () => {
    if (!videoRef.current) return;
    try {
      const video = videoRef.current;
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const originalBase64 = canvas.toDataURL("image/jpeg", 0.82);
        const resizedBase64 = await handleImageResize(originalBase64);
        onImageCaptured(resizedBase64);
        stopCamera();
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("Failed to capture picture. Use file capture.");
    }
  };

  // Handle mobile device native camera file capture or general base64 file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const originalBase64 = event.target?.result as string;
      if (originalBase64) {
        const resizedBase64 = await handleImageResize(originalBase64);
        onImageCaptured(resizedBase64);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 my-2">
      <div className="flex justify-between items-center mb-3">
        <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
          <Camera id="camera-icon-lbl" className="w-4 h-4 text-theme-blue" />
          Image Capture & Documentation
        </label>
        {currentImage && (
          <button
            type="button"
            onClick={onClear}
            className="text-xs text-red-600 hover:text-red-700 flex items-center gap-1 bg-red-50 hover:bg-red-100 py-1 px-2.5 rounded-lg border border-red-200 transition"
          >
            <X id="clear-image-btn" className="w-3.5 h-3.5" />
            Delete Image
          </button>
        )}
      </div>

      {currentImage ? (
        <div className="relative rounded-lg overflow-hidden border border-gray-200 max-w-[280px] mx-auto bg-gray-900 shadow-sm transition">
          <img
            src={currentImage}
            alt="Step QC preview"
            referrerPolicy="no-referrer"
            className="w-full h-auto object-cover"
          />
          <div className="absolute top-2 right-2 bg-green-500 text-white rounded-full p-1.5 shadow-md">
            <Check id="image-passed-icon" className="w-4 h-4" />
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-6 px-4 bg-white border border-dashed border-gray-300 rounded-xl">
          {isActive ? (
            <div className="w-full max-w-[320px] mx-auto flex flex-col gap-3">
              <div className="relative bg-black rounded-lg overflow-hidden aspect-video border border-gray-700">
                <video
                  ref={videoRef}
                  id="camera-video-stream"
                  className="w-full h-full object-cover scale-x-[-1]"
                  playsInline
                  muted
                />
              </div>
              <div className="flex justify-center gap-2.5">
                <button
                  type="button"
                  onClick={capturePhoto}
                  className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl font-medium shadow-sm transition text-sm"
                >
                  <Check id="capture-pic-btn" className="w-4 h-4" />
                  Capture Photo
                </button>
                <button
                  type="button"
                  onClick={stopCamera}
                  className="flex items-center gap-1 text-gray-700 bg-gray-100 hover:bg-gray-200 border border-gray-300 px-3 py-2 rounded-xl font-medium transition text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center w-full max-w-sm flex flex-col items-center">
              <div className="mb-3 p-3 bg-blue-50 text-blue-600 rounded-full">
                <Camera id="video-launcher-ico" className="w-6 h-6" />
              </div>
              <p className="text-xs text-gray-500 mb-4 px-2 leading-relaxed">
                Take a photograph for real-time validation or select an existing folder asset.
              </p>

              {errorMsg && (
                <div className="mb-4 text-xs bg-amber-50 text-amber-800 p-2.5 rounded-lg border border-amber-200">
                  {errorMsg}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 w-full">
                {/* Real-time Streaming WebCam trigger */}
                <button
                  type="button"
                  onClick={startCamera}
                  className="flex items-center justify-center gap-1.5 border border-gray-200 hover:border-blue-300 hover:bg-slate-50 bg-white text-gray-700 py-2.5 px-2 rounded-xl text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-blue-100 shadow-3xs"
                >
                  <Camera id="live-cam-btn-icon" className="w-3.5 h-3.5 text-blue-500" />
                  <span>Live WebCam</span>
                </button>

                {/* Mobile Device Direct Camera */}
                <label className="flex items-center justify-center gap-1.5 border border-gray-200 hover:border-emerald-355 hover:bg-emerald-50/30 bg-white text-gray-700 py-2.5 px-2 rounded-xl text-xs font-semibold cursor-pointer transition focus:outline-none focus:ring-2 focus:ring-emerald-100 shadow-3xs">
                  <Camera id="direct-camera-icon" className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Device Camera</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>

                {/* Upload from Photo Library / Gallery */}
                <label className="flex items-center justify-center gap-1.5 border border-blue-105 hover:border-blue-300 hover:bg-blue-50/50 bg-blue-50/20 text-blue-700 py-2.5 px-2 rounded-xl text-xs font-semibold cursor-pointer transition focus:outline-none focus:ring-2 focus:ring-blue-100 shadow-3xs">
                  <ImageIcon id="file-uploader-icon" className="w-3.5 h-3.5 text-blue-600" />
                  <span>Photo Gallery</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
