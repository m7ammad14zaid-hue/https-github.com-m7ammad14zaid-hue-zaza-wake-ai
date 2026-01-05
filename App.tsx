
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AppStatus, CharacterState, UserPreferences, Language, SleepStats, AlarmSoundType, ZazaVoiceType, Reminder } from './types';
import { storageService } from './services/storageService';
import { audioService } from './services/audioService';
import { TRANSLATIONS, OPTIMAL_SLEEP_DURATION } from './constants';
import ZazaCharacter from './components/ZazaCharacter';
import Onboarding from './components/Onboarding';
import CameraVerification from './components/CameraVerification';
import { Settings, X, Timer, Mic, MicOff, Play, Coffee, Volume2, UserCheck, Loader2, Sparkles, AlertCircle, ExternalLink, Bell, Trash2, Moon, Sun, Activity, TrendingUp, Clock, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { GoogleGenAI, Modality, LiveServerMessage, FunctionDeclaration, Type } from "@google/genai";

// Casting motion components to any to bypass environment-specific type errors
const MotionDiv = motion.div as any;
const MotionButton = motion.button as any;

declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }
  interface Window {
    aistudio?: AIStudio;
    webkitAudioContext: typeof AudioContext;
  }
}

function encode(bytes: Uint8Array) {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

const App: React.FC = () => {
  const [prefs, setPrefs] = useState<UserPreferences>(storageService.getPreferences());
  const [status, setStatus] = useState<AppStatus>(
    prefs.hasCompletedOnboarding ? AppStatus.DASHBOARD : AppStatus.ONBOARDING
  );
  const [charState, setCharState] = useState<CharacterState>(CharacterState.IDLE);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [startTime, setStartTime] = useState<number>(0);
  const [isLiveActive, setIsLiveActive] = useState(false);
  const [zazaResponding, setZazaResponding] = useState(false);
  const [isPreviewingVoice, setIsPreviewingVoice] = useState(false);
  const [apiError, setApiError] = useState<boolean>(false);
  
  const [timerRemaining, setTimerRemaining] = useState<number>(0);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const nextStartTimeRef = useRef(0);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const sessionRef = useRef<any>(null);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  
  const [showSettings, setShowSettings] = useState(false);
  const [showTimerModal, setShowTimerModal] = useState(false);
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [showStatsModal, setShowStatsModal] = useState(false);
  
  const [customTimerValue, setCustomTimerValue] = useState("30");
  const [newReminderTime, setNewReminderTime] = useState("00:00");
  const [newReminderLabel, setNewReminderLabel] = useState("");

  const [isReminderFiring, setIsReminderFiring] = useState(false);
  const lastReminderTriggeredRef = useRef<string>("");

  const t = TRANSLATIONS[prefs.language];
  const stats = storageService.getStats();

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(now);
      const currentTimeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
      if (currentTimeStr !== lastReminderTriggeredRef.current) {
        prefs.reminders.forEach(reminder => {
          if (reminder.active && reminder.time === currentTimeStr) {
            triggerZazaReminder(reminder);
            lastReminderTriggeredRef.current = currentTimeStr;
          }
        });
      }
      if (status === AppStatus.SLEEPING && currentTimeStr === prefs.targetWakeTime) {
        triggerAlarm();
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [prefs.reminders, prefs.targetWakeTime, status]);

  useEffect(() => {
    let alarmInterval: ReturnType<typeof setInterval> | null = null;
    if (status === AppStatus.ALARMING) {
      audioService.playAlarm(true, prefs.alarmSound);
      alarmInterval = setInterval(() => {
        audioService.playAlarm(true, prefs.alarmSound);
        setCharState(CharacterState.TAPPING);
      }, 1500);
    }
    return () => {
      if (alarmInterval) clearInterval(alarmInterval);
    };
  }, [status, prefs.alarmSound]);

  const triggerZazaReminder = async (reminder: Reminder) => {
    setIsReminderFiring(true);
    audioService.playBedtimeReminder(); 
    setCharState(CharacterState.VIGOROUS);
    const userLabel = prefs.userName ? prefs.userName : '';
    const message = prefs.language === 'ar' 
      ? `يا ${userLabel}، حان وقت الـ ${reminder.label} الآن!` 
      : `Hey ${userLabel}, it is time for ${reminder.label} now!`;
    speakMessage(message);
    setTimeout(() => {
      setIsReminderFiring(false);
      setCharState(prev => prev === CharacterState.VIGOROUS ? CharacterState.IDLE : prev);
    }, 30000);
  };

  const stopReminderAction = () => {
    setIsReminderFiring(false);
    setCharState(CharacterState.IDLE);
    activeSourcesRef.current.forEach(s => { try { s.stop(); } catch(e) {} });
    activeSourcesRef.current.clear();
    return "ok";
  };

  const speakMessage = async (msg: string) => {
    if (!outputAudioContextRef.current) {
      outputAudioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
    }
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: msg }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: prefs.zazaVoice } } },
        },
      });
      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        const audioBuffer = await decodeAudioData(decode(base64Audio), outputAudioContextRef.current, 24000, 1);
        const source = outputAudioContextRef.current.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(outputAudioContextRef.current.destination);
        source.start();
        activeSourcesRef.current.add(source);
        source.onended = () => activeSourcesRef.current.delete(source);
      }
    } catch (e) { console.error(e); }
  };

  const handleVoiceActivation = async () => {
    try { if (window.aistudio) { await window.aistudio.openSelectKey(); setApiError(false); } } catch (err) {}
  };

  const toggleLiveChat = async () => {
    if (isLiveActive) {
      setIsLiveActive(false);
      setZazaResponding(false);
      setCharState(CharacterState.IDLE);
      if (sessionRef.current) sessionRef.current.close();
      return;
    }
    setIsLiveActive(true);
    setCharState(CharacterState.DETECTIVE);
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    if (!outputAudioContextRef.current) {
      outputAudioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
    }
    const getCurrentTimeTool: FunctionDeclaration = { name: 'getCurrentTime', description: 'Get current local time.', parameters: { type: Type.OBJECT, properties: {} } };
    const stopReminderTool: FunctionDeclaration = { name: 'stopReminderAction', description: 'Stops reminder.', parameters: { type: Type.OBJECT, properties: {} } };
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: () => {
            const inputCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
            const source = inputCtx.createMediaStreamSource(stream);
            const processor = inputCtx.createScriptProcessor(4096, 1, 1);
            processor.onaudioprocess = (e) => {
              const input = e.inputBuffer.getChannelData(0);
              const int16 = new Int16Array(input.length);
              for(let i=0; i<input.length; i++) int16[i] = input[i] * 32768;
              const pcmData = encode(new Uint8Array(int16.buffer));
              sessionPromise.then(s => s.sendRealtimeInput({ media: { data: pcmData, mimeType: 'audio/pcm;rate=16000' } }));
            };
            source.connect(processor);
            processor.connect(inputCtx.destination);
          },
          onmessage: async (msg: LiveServerMessage) => {
            if (msg.toolCall) {
              const responses = [];
              for (const fc of msg.toolCall.functionCalls) {
                if (fc.name === 'getCurrentTime') {
                  const now = new Date();
                  const timeStr = now.toLocaleTimeString(prefs.language === 'ar' ? 'ar-SA' : 'en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
                  responses.push({ id: fc.id, name: fc.name, response: { result: timeStr } });
                } else if (fc.name === 'stopReminderAction') {
                  const result = stopReminderAction();
                  responses.push({ id: fc.id, name: fc.name, response: { result } });
                }
              }
              if (responses.length > 0) sessionPromise.then(s => s.sendToolResponse({ functionResponses: responses }));
            }
            const audioBase64 = msg.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (audioBase64) {
              setZazaResponding(true);
              const buffer = await decodeAudioData(decode(audioBase64), outputAudioContextRef.current!, 24000, 1);
              const source = outputAudioContextRef.current!.createBufferSource();
              source.buffer = buffer;
              source.connect(outputAudioContextRef.current!.destination);
              const playAt = Math.max(nextStartTimeRef.current, outputAudioContextRef.current!.currentTime);
              source.start(playAt);
              nextStartTimeRef.current = playAt + buffer.duration;
              activeSourcesRef.current.add(source);
              source.onended = () => {
                activeSourcesRef.current.delete(source);
                if (activeSourcesRef.current.size === 0) setZazaResponding(false);
              };
            }
          },
          onclose: () => { setIsLiveActive(false); setCharState(CharacterState.IDLE); },
          onerror: () => { setIsLiveActive(false); handleVoiceActivation(); }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          tools: [{ functionDeclarations: [getCurrentTimeTool, stopReminderTool] }],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: prefs.zazaVoice } } },
          systemInstruction: `Your name is Zaza. You are Mohammad's funny alarm clock assistant. 
          USER: ${prefs.userName || 'User'}.
          
          CAPABILITIES:
          1. You can tell jokes and help with alarms.
          2. Be funny, a bit sarcastic, but always helpful.`
        }
      });
      sessionRef.current = await sessionPromise;
    } catch (err) { setIsLiveActive(false); handleVoiceActivation(); }
  };

  const triggerAlarm = useCallback(() => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    setStatus(AppStatus.ALARMING);
    setCharState(CharacterState.TAPPING);
    setStartTime(Date.now());
    audioService.playAlarm(true, prefs.alarmSound);
  }, [prefs.alarmSound]);

  const addReminder = () => {
    if (!newReminderLabel) return;
    const reminder: Reminder = { id: Math.random().toString(36).substr(2, 9), time: newReminderTime, label: newReminderLabel, active: true };
    const updated = { ...prefs, reminders: [...prefs.reminders, reminder] };
    setPrefs(updated);
    storageService.savePreferences(updated);
    setNewReminderLabel("");
    setShowReminderModal(false);
  };

  const deleteReminder = (id: string) => {
    const updated = { ...prefs, reminders: prefs.reminders.filter(r => r.id !== id) };
    setPrefs(updated);
    storageService.savePreferences(updated);
  };

  const startNapTimer = (minutes: number) => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    setTimerRemaining(minutes * 60);
    setStatus(AppStatus.TIMER_RUNNING);
    setCharState(CharacterState.SLEEPY);
    setShowTimerModal(false);
    timerIntervalRef.current = setInterval(() => {
      setTimerRemaining((prev) => {
        if (prev <= 1) { clearInterval(timerIntervalRef.current!); triggerAlarm(); return 0; }
        return prev - 1;
      });
    }, 1000);
  };

  const handleAwake = () => {
    storageService.saveStat({ 
      bedTime: prefs.targetSleepTime, 
      wakeTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }), 
      responseTime: (Date.now() - startTime) / 1000, 
      success: true, 
      date: new Date().toISOString() 
    });
    setStatus(AppStatus.DASHBOARD);
    setCharState(CharacterState.IDLE);
    audioService.playTapping('soft');
  };

  const updatePrefs = (newPrefs: Partial<UserPreferences>) => {
    const updated = { ...prefs, ...newPrefs };
    setPrefs(updated);
    storageService.savePreferences(updated);
  };

  const calculateSleepQuality = (stat: SleepStats) => {
    const [bedH, bedM] = stat.bedTime.split(':').map(Number);
    const [wakeH, wakeM] = stat.wakeTime.split(':').map(Number);
    let durationH = wakeH - bedH;
    if (durationH < 0) durationH += 24;
    const duration = durationH + (wakeM - bedM) / 60;
    const durationScore = Math.min(100, (duration / OPTIMAL_SLEEP_DURATION) * 100);
    const responseScore = Math.max(0, 100 - (stat.responseTime * 5)); 
    return Math.round((durationScore * 0.7) + (responseScore * 0.3));
  };

  const getQualityLabel = (score: number) => {
    if (score > 85) return t.excellent;
    if (score > 70) return t.good;
    if (score > 50) return t.fair;
    return t.poor;
  };

  if (status === AppStatus.ONBOARDING) return <Onboarding onComplete={(p) => { storageService.savePreferences(p); setPrefs(p); setStatus(AppStatus.DASHBOARD); }} />;

  return (
    <div className={`h-full w-full flex flex-col bg-slate-950 overflow-hidden text-white ${prefs.language === 'ar' ? 'rtl font-["Noto_Sans_Arabic"]' : ''}`}>
      <header className="px-5 py-3 flex justify-between items-center z-50 bg-slate-900/40 backdrop-blur-xl border-b border-white/5">
        <button onClick={() => setShowSettings(true)} className="p-2.5 bg-white/5 rounded-xl border border-white/10 active:scale-90 transition-all hover:bg-white/10">
          <Settings className="w-5 h-5 text-indigo-300"/>
        </button>
        
        <div className="flex items-center gap-2">
           <button 
             onClick={toggleLiveChat} 
             className={`px-5 py-2.5 rounded-full flex items-center gap-3 font-black transition-all duration-300 ${isLiveActive ? 'bg-indigo-600 shadow-[0_0_20px_rgba(79,70,229,0.5)]' : 'bg-slate-800 hover:bg-slate-700'} active:scale-95`}
           >
            {isLiveActive ? (
              <div className="flex items-center gap-2">
                <Mic className={`w-4 h-4 ${zazaResponding ? 'animate-bounce text-white' : 'text-indigo-200'}`}/>
                <span className="text-[10px] uppercase tracking-widest">{zazaResponding ? t.zazaSpeaking : t.zazaListening}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <MicOff className="w-4 h-4 opacity-40"/>
                <span className="text-[10px] uppercase tracking-widest">{t.askZaza}</span>
              </div>
            )}
          </button>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-between py-6 px-6 relative overflow-hidden">
        {status === AppStatus.ALARMING ? (
          <div className="w-full h-full relative rounded-[3rem] overflow-hidden border-2 border-indigo-500/30 shadow-2xl shadow-indigo-900/20">
            <CameraVerification onAwake={handleAwake} statusText="Zaza is Checking..." />
          </div>
        ) : (
          <>
            <div className="text-center z-10 pt-4">
              {status === AppStatus.TIMER_RUNNING ? (
                <MotionDiv initial={{scale:0.8, opacity:0}} animate={{scale:1, opacity:1}} className="space-y-2">
                  <h2 className="text-7xl font-black text-indigo-400 drop-shadow-[0_0_15px_rgba(129,140,248,0.4)]">
                    {Math.floor(timerRemaining/60)}:{(timerRemaining%60).toString().padStart(2, '0')}
                  </h2>
                  <p className="text-[10px] uppercase tracking-[0.3em] opacity-40 font-bold">{t.napInProgress}</p>
                </MotionDiv>
              ) : status === AppStatus.SLEEPING ? (
                <div className="space-y-3">
                  <Moon className="w-8 h-8 mx-auto text-indigo-400 animate-pulse" />
                  <h2 className="text-2xl font-black uppercase tracking-widest">{t.sleepingNow}</h2>
                  <div className="px-4 py-1.5 bg-white/5 rounded-full border border-white/5">
                    <p className="text-[10px] font-bold opacity-60 uppercase tracking-tighter">{t.nextAlarm}: {prefs.targetWakeTime}</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  <h2 className="text-7xl font-light tracking-tighter opacity-90 drop-shadow-sm">
                    {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                  </h2>
                  {prefs.userName && <p className="text-indigo-400 font-black uppercase tracking-[0.4em] text-[10px]">{prefs.userName}</p>}
                </div>
              )}
            </div>
            
            <div className="flex-1 flex flex-col items-center justify-center w-full max-h-[50%] relative">
              <ZazaCharacter state={charState} className="scale-100" />
              
              <AnimatePresence>
                {status === AppStatus.DASHBOARD && !isReminderFiring && (
                  <MotionButton 
                    initial={{ y: 20, opacity: 0 }} 
                    animate={{ y: 0, opacity: 1 }} 
                    exit={{ y: 20, opacity: 0 }} 
                    onClick={() => setShowReminderModal(true)} 
                    className="absolute -bottom-8 px-6 py-3 bg-white/5 border border-white/10 rounded-full flex items-center gap-3 shadow-xl backdrop-blur-md active:scale-95 transition-all group hover:bg-white/10"
                  >
                    <Bell className="w-4 h-4 text-indigo-400 group-hover:rotate-12 transition-transform" />
                    <span className="text-[10px] font-black uppercase tracking-widest">{t.addReminder}</span>
                  </MotionButton>
                )}
              </AnimatePresence>

              {isReminderFiring && (
                <MotionDiv initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="absolute -bottom-12 px-6 py-3 bg-indigo-600/20 border border-indigo-500/40 rounded-[1.5rem] flex flex-col items-center gap-1.5 animate-pulse backdrop-blur-sm">
                   <span className="text-[9px] font-black uppercase tracking-wider text-indigo-300">Answer Zaza:</span>
                   <span className="text-sm font-bold text-white italic">"حسنا زازا شكرا"</span>
                </MotionDiv>
              )}
            </div>

            <div className="w-full max-w-xs flex flex-col gap-4 z-20 mb-8">
              {status === AppStatus.DASHBOARD && (
                <div className="space-y-3">
                  <button 
                    onClick={() => { setStatus(AppStatus.SLEEPING); setCharState(CharacterState.SLEEPY); audioService.playSleepSound(); }} 
                    className="w-full py-5 bg-indigo-600 rounded-[2rem] font-black text-lg flex flex-col items-center justify-center shadow-[0_10px_30px_rgba(79,70,229,0.3)] active:scale-95 transition-all hover:bg-indigo-500"
                  >
                    <div className="flex items-center gap-3">
                      <Moon className="w-6 h-6" />
                      <span>{t.startSleep}</span>
                    </div>
                  </button>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <button 
                      onClick={() => setShowTimerModal(true)} 
                      className="py-4 bg-white/5 border border-white/10 rounded-[1.8rem] font-black text-[10px] flex items-center justify-center gap-2 active:scale-95 hover:bg-white/10 transition-all uppercase tracking-widest"
                    >
                      <Coffee className="w-4 h-4 text-orange-400" />
                      {t.napTimer}
                    </button>
                    <button 
                      onClick={() => setShowStatsModal(true)} 
                      className="py-4 bg-emerald-600/10 border border-emerald-500/20 rounded-[1.8rem] font-black text-[10px] text-emerald-400 flex items-center justify-center gap-2 active:scale-95 hover:bg-emerald-600/20 transition-all uppercase tracking-widest"
                    >
                      <Activity className="w-4 h-4" />
                      {t.stats}
                    </button>
                  </div>
                </div>
              )}
              
              {status === AppStatus.SLEEPING && (
                <button 
                  onClick={() => { setStatus(AppStatus.DASHBOARD); setCharState(CharacterState.IDLE); }} 
                  className="w-full py-4 bg-white/5 border border-white/10 rounded-2xl font-black text-[10px] text-white/30 uppercase tracking-[0.2em] active:scale-95"
                >
                  Wake Up Manually
                </button>
              )}
            </div>
          </>
        )}
      </main>

      <AnimatePresence>
        {/* Sleep Health Stats Modal */}
        {showStatsModal && (
          <MotionDiv initial={{y:'100%'}} animate={{y:0}} exit={{y:'100%'}} className="fixed inset-0 z-[130] bg-slate-950 p-6 flex flex-col overflow-y-auto">
             <div className="flex justify-between items-center mb-8">
                <h2 className="text-3xl font-black tracking-tighter text-emerald-400">{t.stats}</h2>
                <button onClick={() => setShowStatsModal(false)} className="p-3 bg-white/10 rounded-full hover:bg-white/20 transition-all"><X className="w-6 h-6"/></button>
              </div>

              {stats.length > 0 ? (
                <div className="space-y-6">
                  {/* Last Session Analysis */}
                  <div className="bg-emerald-500/5 border border-emerald-500/20 p-6 rounded-[2.5rem] space-y-4">
                    <div className="flex items-center gap-3">
                      <TrendingUp className="w-5 h-5 text-emerald-400" />
                      <h3 className="text-xs font-black uppercase tracking-widest text-emerald-400/60">{t.lastNight}</h3>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-black/20 p-4 rounded-2xl border border-white/5">
                        <p className="text-[10px] font-black uppercase opacity-40 mb-1">{t.sleepQuality}</p>
                        <p className="text-2xl font-black text-emerald-400">{calculateSleepQuality(stats[stats.length-1])}%</p>
                        <p className="text-[9px] font-bold opacity-60">{getQualityLabel(calculateSleepQuality(stats[stats.length-1]))}</p>
                      </div>
                      <div className="bg-black/20 p-4 rounded-2xl border border-white/5">
                        <p className="text-[10px] font-black uppercase opacity-40 mb-1">{t.responseTime}</p>
                        <p className="text-2xl font-black text-indigo-400">{stats[stats.length-1].responseTime.toFixed(1)} <span className="text-xs">{t.seconds}</span></p>
                        <p className="text-[9px] font-bold opacity-60">{t.avgWakeSpeed}</p>
                      </div>
                    </div>
                  </div>

                  {/* Highlights */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white/5 border border-white/10 p-5 rounded-[2rem] flex flex-col items-center gap-2">
                       <Clock className="w-5 h-5 text-indigo-400" />
                       <p className="text-[10px] font-black opacity-40 uppercase">{t.bedTime}</p>
                       <p className="text-lg font-black">{stats[stats.length-1].bedTime}</p>
                    </div>
                    <div className="bg-white/5 border border-white/10 p-5 rounded-[2rem] flex flex-col items-center gap-2">
                       <Zap className="w-5 h-5 text-orange-400" />
                       <p className="text-[10px] font-black opacity-40 uppercase">{t.wakeUpTime}</p>
                       <p className="text-lg font-black">{stats[stats.length-1].wakeTime}</p>
                    </div>
                  </div>

                  {/* History List */}
                  <div className="space-y-4">
                    <h3 className="text-xs font-black uppercase tracking-widest opacity-40 px-2">{t.history}</h3>
                    <div className="space-y-2">
                      {[...stats].reverse().map((s, idx) => (
                        <div key={idx} className="bg-white/5 border border-white/5 p-4 rounded-2xl flex items-center justify-between">
                           <div className="flex flex-col">
                             <span className="text-[10px] font-black opacity-30">{new Date(s.date).toLocaleDateString(prefs.language === 'ar' ? 'ar-SA' : 'en-US')}</span>
                             <span className="text-sm font-black">{s.bedTime} - {s.wakeTime}</span>
                           </div>
                           <div className="text-right">
                             <span className={`text-xs font-black ${calculateSleepQuality(s) > 70 ? 'text-emerald-400' : 'text-orange-400'}`}>{calculateSleepQuality(s)}%</span>
                             <p className="text-[8px] opacity-30 font-black uppercase">{t.sleepQuality}</p>
                           </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center opacity-20 py-20">
                   <Activity className="w-16 h-16 mb-4" />
                   <p className="text-center font-black uppercase tracking-widest text-xs px-10">{t.noStats}</p>
                </div>
              )}
          </MotionDiv>
        )}

        {/* Reminders Modal */}
        {showReminderModal && (
          <MotionDiv initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 z-[120] bg-slate-950/98 backdrop-blur-3xl flex items-center justify-center p-6">
            <div className="w-full max-w-sm space-y-8">
              <div className="flex justify-between items-center">
                <h2 className="text-3xl font-black tracking-tighter">{t.reminders}</h2>
                <button onClick={() => setShowReminderModal(false)} className="p-3 bg-white/10 rounded-full hover:bg-white/20 transition-all"><X className="w-5 h-5"/></button>
              </div>
              
              <div className="bg-white/5 p-6 rounded-[2.5rem] border border-white/10 space-y-6 shadow-2xl">
                 <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase text-indigo-400 tracking-widest">{t.reminderTime}</label>
                    <input type="time" value={newReminderTime} onChange={(e) => setNewReminderTime(e.target.value)} className="w-full p-5 bg-white/5 rounded-2xl text-4xl font-black text-center outline-none border border-white/5 focus:border-indigo-500 transition-all" />
                 </div>
                 
                 <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase text-indigo-400 tracking-widest">{t.reminderLabel}</label>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {[t.studyTime, t.gymTime, t.workTime].map(label => (
                        <button key={label} onClick={() => setNewReminderLabel(label)} className={`px-4 py-2 rounded-full text-[10px] font-black transition-all ${newReminderLabel === label ? 'bg-indigo-600 text-white' : 'bg-white/5 border border-white/10 text-white/40'}`}>{label}</button>
                      ))}
                    </div>
                    <input type="text" value={newReminderLabel} onChange={(e) => setNewReminderLabel(e.target.value)} placeholder="..." className="w-full p-4 bg-white/5 rounded-2xl text-lg font-black outline-none border border-white/5 focus:border-indigo-500" />
                 </div>
                 
                 <button onClick={addReminder} className="w-full py-5 bg-indigo-600 rounded-2xl font-black text-xl shadow-xl shadow-indigo-900/40 hover:bg-indigo-500 transition-all">{t.save}</button>
              </div>

              <div className="max-h-[25vh] overflow-y-auto space-y-3 pr-2 scrollbar-hide">
                {prefs.reminders.length === 0 ? (
                  <p className="text-center opacity-10 text-[10px] py-8 uppercase font-black tracking-[0.5em]">{t.noReminders}</p>
                ) : (
                  prefs.reminders.map(r => (
                    <div key={r.id} className="p-5 bg-white/5 rounded-[1.8rem] border border-white/5 flex justify-between items-center group hover:bg-white/10 transition-all">
                      <div>
                        <p className="text-xl font-black text-indigo-400">{r.time}</p>
                        <p className="text-[9px] font-black opacity-40 uppercase tracking-widest">{r.label}</p>
                      </div>
                      <button onClick={() => deleteReminder(r.id)} className="p-3 text-red-500/20 hover:text-red-500 hover:bg-red-500/10 rounded-2xl transition-all">
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </MotionDiv>
        )}

        {/* Timer Modal */}
        {showTimerModal && (
          <MotionDiv initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 z-[100] bg-slate-950/95 backdrop-blur-3xl flex items-center justify-center p-6">
            <div className="w-full max-w-sm space-y-10">
              <div className="text-center space-y-2">
                <div className="w-16 h-16 bg-orange-500/10 rounded-3xl flex items-center justify-center mx-auto mb-4 border border-orange-500/20 shadow-[0_0_30px_rgba(249,115,22,0.1)]">
                  <Timer className="w-8 h-8 text-orange-400"/>
                </div>
                <h2 className="text-4xl font-black tracking-tighter">{t.napTimer}</h2>
              </div>
              
              <div className="space-y-6">
                <div className="flex items-center gap-4 bg-white/5 p-6 rounded-[2.5rem] border border-white/10 shadow-inner">
                  <input type="number" value={customTimerValue} onChange={(e) => setCustomTimerValue(e.target.value)} className="flex-1 bg-transparent text-6xl font-black text-center outline-none text-orange-400" />
                  <span className="text-lg font-black opacity-20 mr-4">MIN</span>
                </div>
                
                <div className="grid grid-cols-4 gap-3">
                  {[15, 30, 45, 60].map(m => (
                    <button key={m} onClick={() => setCustomTimerValue(m.toString())} className={`py-4 rounded-2xl font-black text-xs transition-all ${customTimerValue === m.toString() ? 'bg-orange-600 text-white shadow-lg shadow-orange-900/40' : 'bg-white/5 text-white/40 border border-white/10'}`}>{m}m</button>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <button onClick={() => startNapTimer(parseInt(customTimerValue))} className="w-full py-6 bg-orange-600 rounded-[2rem] font-black text-xl shadow-xl shadow-orange-900/40 hover:bg-orange-500 transition-all">Start Nap</button>
                <button onClick={() => setShowTimerModal(false)} className="w-full py-2 text-white/20 font-black text-[10px] uppercase tracking-[0.4em] hover:text-white/40 transition-all">Cancel</button>
              </div>
            </div>
          </MotionDiv>
        )}

        {/* Settings Modal */}
        {showSettings && (
          <MotionDiv initial={{y:'100%'}} animate={{y:0}} exit={{y:'100%'}} transition={{type:'spring', damping:25, stiffness:200}} className="fixed inset-0 z-[110] bg-slate-950 p-6 flex flex-col overflow-y-auto">
            <div className="flex justify-between items-center mb-10">
              <h2 className="text-3xl font-black tracking-tighter">{t.settings}</h2>
              <button onClick={() => setShowSettings(false)} className="p-3 bg-white/10 rounded-full hover:bg-white/20 transition-all"><X className="w-6 h-6"/></button>
            </div>
            
            <div className="space-y-8 pb-24">
               <button onClick={() => { setShowSettings(false); triggerAlarm(); }} className="w-full py-5 bg-indigo-600 text-white rounded-[2rem] font-black flex items-center justify-center gap-3 active:scale-95 shadow-xl shadow-indigo-900/50">
                  <Play className="w-5 h-5" /> 
                  <span className="text-lg">{t.testAlarm}</span>
               </button>

               <div className={`p-6 rounded-[2.5rem] border-2 transition-all ${apiError ? 'bg-orange-500/5 border-orange-500/20' : 'bg-green-500/5 border-green-500/20'}`}>
                  <div className="flex items-start gap-5">
                    <div className={`p-4 rounded-2xl ${apiError ? 'bg-orange-500/20 text-orange-400' : 'bg-green-500/20 text-green-400'}`}>
                      {apiError ? <AlertCircle className="w-7 h-7" /> : <Sparkles className="w-7 h-7" />}
                    </div>
                    <div className="flex-1 space-y-2">
                      <h3 className="font-black text-xs uppercase tracking-widest">{apiError ? t.voiceRequired : t.voiceReady}</h3>
                      <p className="text-[11px] leading-relaxed opacity-60 font-medium">{t.voiceDesc}</p>
                    </div>
                  </div>
                  {apiError && (
                    <button onClick={handleVoiceActivation} className="w-full mt-6 py-4 bg-indigo-600 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg hover:bg-indigo-500 transition-all">
                      {t.activateVoice}
                    </button>
                  )}
                  <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" className="flex items-center justify-center gap-2 mt-4 text-[9px] font-black opacity-20 uppercase tracking-widest hover:opacity-40 transition-all">
                    {t.billingLink} <ExternalLink className="w-2.5 h-2.5" />
                  </a>
               </div>

               <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase text-indigo-400 flex items-center gap-2 tracking-widest"><Moon className="w-3.5 h-3.5" /> {t.bedTime}</label>
                    <input type="time" value={prefs.targetSleepTime} onChange={e => updatePrefs({ targetSleepTime: e.target.value })} className="w-full p-5 bg-white/5 border border-white/10 rounded-2xl text-2xl font-black text-center outline-none focus:border-indigo-500 transition-all"/>
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase text-orange-400 flex items-center gap-2 tracking-widest"><Sun className="w-3.5 h-3.5" /> {t.wakeUpTime}</label>
                    <input type="time" value={prefs.targetWakeTime} onChange={e => updatePrefs({ targetWakeTime: e.target.value })} className="w-full p-5 bg-white/5 border border-white/10 rounded-2xl text-2xl font-black text-center outline-none focus:border-orange-500 transition-all"/>
                  </div>
               </div>

               <div className="space-y-4">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-300 flex items-center gap-2 px-1">
                    <Volume2 className="w-4 h-4" /> {t.alarmSound}
                  </label>
                  <div className="grid grid-cols-3 gap-3">
                    {(['Classic', 'Bell', 'Digital'] as AlarmSoundType[]).map((snd) => (
                      <button key={snd} onClick={() => { updatePrefs({ alarmSound: snd }); audioService.playAlarm(false, snd); }} className={`py-4 rounded-2xl font-black text-[11px] transition-all uppercase tracking-tighter ${prefs.alarmSound === snd ? 'bg-indigo-600 border-indigo-400' : 'bg-white/5 border-white/10'} border`}>
                        {snd}
                      </button>
                    ))}
                  </div>
               </div>

               <div className="space-y-4">
                  <div className="flex justify-between items-center px-1">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-300 flex items-center gap-2">
                      <UserCheck className="w-4 h-4" /> {t.zazaVoice}
                    </label>
                    {isPreviewingVoice && <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />}
                  </div>
                  <div className="grid grid-cols-5 gap-2">
                    {(['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'] as ZazaVoiceType[]).map((v) => (
                      <button key={v} onClick={() => { updatePrefs({ zazaVoice: v }); setIsPreviewingVoice(true); speakMessage(prefs.language === 'ar' ? "أنا زازا" : "I am Zaza").finally(() => setIsPreviewingVoice(false)); }} className={`py-3 rounded-xl font-black text-[9px] transition-all uppercase ${prefs.zazaVoice === v ? 'bg-indigo-600 text-white' : 'bg-white/5 text-white/30 border border-white/5'}`} disabled={isPreviewingVoice}>
                        {v}
                      </button>
                    ))}
                  </div>
               </div>

               <div className="pt-6 space-y-4">
                  <button onClick={() => updatePrefs({ language: prefs.language === 'en' ? 'ar' : 'en' })} className="w-full py-5 bg-white/5 border border-white/10 rounded-[1.5rem] font-black text-sm flex items-center justify-center gap-3 hover:bg-white/10 transition-all">
                    {t.languageToggle}
                  </button>
                  <button onClick={() => { localStorage.clear(); window.location.reload(); }} className="w-full py-4 text-red-500/20 font-black text-[10px] uppercase tracking-[0.5em] hover:text-red-500/50 transition-all">
                    Reset App
                  </button>
               </div>
            </div>
          </MotionDiv>
        )}
      </AnimatePresence>
    </div>
  );
};

export default App;
