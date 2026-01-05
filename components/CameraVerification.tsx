import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GoogleGenAI, Type } from "@google/genai";

// Casting motion components to any to bypass environment-specific type errors
const MotionDiv = motion.div as any;
const MotionP = motion.p as any;

interface CameraVerificationProps {
  onAwake: () => void;
  statusText: string;
}

const CameraVerification: React.FC<CameraVerificationProps> = ({ onAwake, statusText }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [faceDetected, setFaceDetected] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let stream: MediaStream | null = null;

    const startCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ 
          video: { 
            facingMode: 'user',
            width: { ideal: 640 },
            height: { ideal: 480 }
          } 
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setIsScanning(true);
        }
      } catch (err) {
        console.error("Camera access denied", err);
        setMessage("Camera access required");
      }
    };

    startCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const captureFrame = (): string | null => {
    if (!videoRef.current || !canvasRef.current) return null;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    
    // Draw current video frame to canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Get base64 data (JPEG format to keep payload small)
    return canvas.toDataURL('image/jpeg', 0.6).split(',')[1];
  };

  const verifyAwakeState = async () => {
    if (isProcessing) return;
    
    const base64Data = captureFrame();
    if (!base64Data) return;

    setIsProcessing(true);
    setMessage("Checking state...");

    try {
      // Use process.env.API_KEY directly as required by guidelines
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: base64Data
            }
          },
          {
            text: "Analyze this person's face. Are they fully awake with eyes open and looking at the camera? Respond ONLY with a JSON object: {\"awake\": boolean, \"eyes_open\": boolean, \"face_present\": boolean}"
          }
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              awake: { type: Type.BOOLEAN },
              eyes_open: { type: Type.BOOLEAN },
              face_present: { type: Type.BOOLEAN }
            },
            required: ["awake", "eyes_open", "face_present"]
          }
        }
      });

      const result = JSON.parse(response.text || "{}");
      
      if (result.awake && result.eyes_open) {
        setFaceDetected(true);
        setMessage("Awake confirmed!");
        setTimeout(() => onAwake(), 1000);
      } else {
        setFaceDetected(false);
        if (!result.face_present) {
          setMessage("No face detected");
        } else if (!result.eyes_open) {
          setMessage("Eyes closed - still sleeping?");
        } else {
          setMessage("Detection failed, try again");
        }
      }
    } catch (error) {
      console.error("AI Verification failed", error);
      setMessage("AI check failed, retrying...");
    } finally {
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    if (!isScanning) return;

    // Run verification every 4 seconds to allow processing time
    const interval = setInterval(() => {
      verifyAwakeState();
    }, 4000);

    // Initial check
    verifyAwakeState();

    return () => clearInterval(interval);
  }, [isScanning]);

  return (
    <div className="relative w-full h-full bg-black flex items-center justify-center overflow-hidden rounded-3xl border-4 border-white/5">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`w-full h-full object-cover transition-opacity duration-500 ${isProcessing ? 'opacity-40' : 'opacity-70'} grayscale`}
      />
      
      {/* Scanning UI overlay */}
      <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
        <div className={`w-64 h-80 border-2 transition-colors duration-500 ${faceDetected ? 'border-green-400' : 'border-indigo-400'} rounded-[3rem] relative overflow-hidden`}>
          <MotionDiv 
            animate={{ y: [0, 320, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            className={`absolute top-0 left-0 w-full h-1 shadow-[0_0_15px] ${faceDetected ? 'bg-green-400 shadow-green-400' : 'bg-indigo-400 shadow-indigo-400'}`}
          />
          
          {isProcessing && (
            <div className="absolute inset-0 bg-indigo-500/10 flex items-center justify-center">
               <MotionDiv 
                 animate={{ rotate: 360 }}
                 transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                 className="w-12 h-12 border-4 border-indigo-400 border-t-transparent rounded-full"
               />
            </div>
          )}
        </div>
        
        <div className="mt-8 flex flex-col items-center gap-3">
          <div className="bg-black/60 backdrop-blur-md px-6 py-2 rounded-full border border-white/20">
            <p className="text-white font-medium flex items-center gap-3 text-sm">
              <span className={`w-2 h-2 rounded-full ${faceDetected ? 'bg-green-400 animate-ping' : 'bg-red-400 animate-pulse'}`} />
              {statusText}
            </p>
          </div>
          
          <AnimatePresence mode="wait">
            {message && (
              <MotionP 
                key={message}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="text-xs font-bold uppercase tracking-widest text-indigo-300 bg-indigo-950/50 px-4 py-1 rounded-lg"
              >
                {message}
              </MotionP>
            )}
          </AnimatePresence>
        </div>
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

export default CameraVerification;