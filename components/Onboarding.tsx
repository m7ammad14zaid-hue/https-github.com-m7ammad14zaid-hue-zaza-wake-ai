import React, { useState } from 'react';
import { Language, UserPreferences } from '../types';
import { TRANSLATIONS } from '../constants';
import { Info, Check, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Casting motion components to any to bypass environment-specific type errors
const MotionDiv = motion.div as any;

interface OnboardingProps {
  onComplete: (prefs: UserPreferences) => void;
}

const Onboarding: React.FC<OnboardingProps> = ({ onComplete }) => {
  const [step, setStep] = useState(1);
  const [language, setLanguage] = useState<Language>('ar');
  const [sleepTime, setSleepTime] = useState('00:00');
  const [wakeTime, setWakeTime] = useState('00:00');
  const [hasNap, setHasNap] = useState<boolean | null>(null);
  const [backToSleepTime, setBackToSleepTime] = useState('00:00');
  const [name, setName] = useState('');
  const t = TRANSLATIONS[language];

  const handleNext = () => {
    if (step < 4) {
      setStep(step + 1);
    } else {
      onComplete({ 
        language, 
        targetSleepTime: sleepTime, 
        targetWakeTime: wakeTime, 
        targetBackToSleepTime: hasNap ? backToSleepTime : "OFF",
        hasCompletedOnboarding: true, 
        userName: name,
        alarmSound: 'Classic',
        zazaVoice: 'Kore',
        reminders: []
      });
    }
  };

  return (
    <div className={`flex flex-col items-center justify-center h-full p-8 bg-slate-950 text-white ${language === 'ar' ? 'rtl font-["Noto_Sans_Arabic"]' : ''}`}>
      <div className="w-full max-w-md space-y-10">
        <div className="text-center space-y-4">
          <div className="w-20 h-20 bg-indigo-600 rounded-full mx-auto flex items-center justify-center text-3xl shadow-2xl border-4 border-white/20">⏰</div>
          <h1 className="text-3xl font-black text-indigo-400">{t.welcome}</h1>
        </div>

        <div className="min-h-[350px] space-y-8 bg-white/5 p-8 rounded-[3rem] border border-white/10 relative overflow-hidden flex flex-col justify-center">
          {step === 1 && (
            <MotionDiv initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
              <label className="text-xl font-bold text-center block">{t.selectLanguage}</label>
              <div className="grid grid-cols-2 gap-4">
                <button onClick={() => setLanguage('en')} className={`p-6 rounded-3xl border-2 transition-all ${language === 'en' ? 'border-indigo-600 bg-indigo-600/20 text-indigo-400' : 'border-white/10'}`}>English</button>
                <button onClick={() => setLanguage('ar')} className={`p-6 rounded-3xl border-2 transition-all ${language === 'ar' ? 'border-indigo-600 bg-indigo-600/20 text-indigo-400' : 'border-white/10'}`}>العربية</button>
              </div>
              <div className="space-y-2">
                <label className="text-sm opacity-50 block">{language === 'ar' ? 'الاسم' : 'Name'}</label>
                <input type="text" value={name} placeholder="..." onChange={(e) => setName(e.target.value)} className="w-full p-4 bg-white/5 border border-white/10 rounded-2xl text-xl outline-none focus:border-indigo-600" />
              </div>
            </MotionDiv>
          )}

          {step === 2 && (
            <MotionDiv initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
              <div className="space-y-2 text-center">
                <label className="text-lg font-bold block">{t.setSleepTime}</label>
                <input type="time" value={sleepTime} onChange={(e) => setSleepTime(e.target.value)} className="w-full p-6 text-4xl font-black text-center bg-white/10 rounded-3xl outline-none border-2 border-transparent focus:border-indigo-600" />
                <p className="text-[10px] mt-2 opacity-40 uppercase tracking-widest">{language === 'ar' ? 'الوقت الافتراضي 00:00' : 'Default 00:00 AM'}</p>
              </div>
            </MotionDiv>
          )}

          {step === 3 && (
            <MotionDiv initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
              <div className="space-y-2 text-center">
                <label className="text-lg font-bold block">{t.setWakeTime}</label>
                <input type="time" value={wakeTime} onChange={(e) => setWakeTime(e.target.value)} className="w-full p-6 text-4xl font-black text-center bg-white/10 rounded-3xl outline-none border-2 border-transparent focus:border-orange-600" />
                <p className="text-[10px] mt-2 opacity-40 uppercase tracking-widest">{language === 'ar' ? 'الوقت الافتراضي 00:00' : 'Default 00:00 AM'}</p>
              </div>
            </MotionDiv>
          )}

          {step === 4 && (
            <MotionDiv initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-8">
              <div className="space-y-4">
                <label className="text-lg font-bold block text-center">{t.doYouNap}</label>
                <div className="grid grid-cols-2 gap-4">
                  <button 
                    onClick={() => setHasNap(true)} 
                    className={`py-5 rounded-3xl border-2 flex items-center justify-center gap-2 transition-all ${hasNap === true ? 'border-indigo-600 bg-indigo-600/20 text-indigo-400' : 'border-white/10'}`}
                  >
                    <Check className={`w-5 h-5 ${hasNap === true ? 'opacity-100' : 'opacity-20'}`} />
                    {t.yes}
                  </button>
                  <button 
                    onClick={() => setHasNap(false)} 
                    className={`py-5 rounded-3xl border-2 flex items-center justify-center gap-2 transition-all ${hasNap === false ? 'border-red-600 bg-red-600/20 text-red-400' : 'border-white/10'}`}
                  >
                    <X className={`w-5 h-5 ${hasNap === false ? 'opacity-100' : 'opacity-20'}`} />
                    {t.no}
                  </button>
                </div>
              </div>

              <AnimatePresence>
                {hasNap && (
                  <MotionDiv 
                    initial={{ height: 0, opacity: 0 }} 
                    animate={{ height: 'auto', opacity: 1 }} 
                    exit={{ height: 0, opacity: 0 }}
                    className="space-y-4 overflow-hidden"
                  >
                    <label className="text-sm font-bold opacity-60 block text-center">{t.whenNap}</label>
                    <input 
                      type="time" 
                      value={backToSleepTime} 
                      onChange={(e) => setBackToSleepTime(e.target.value)} 
                      className="w-full p-5 text-3xl font-black text-center bg-white/10 rounded-3xl outline-none border-2 border-indigo-500/30 focus:border-indigo-600" 
                    />
                    <div className="p-4 bg-indigo-500/10 rounded-2xl border border-indigo-500/20 flex gap-3 items-start">
                      <Info className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
                      <p className="text-xs leading-relaxed text-indigo-200/70">
                        {t.backToSleepDesc}
                      </p>
                    </div>
                  </MotionDiv>
                )}
              </AnimatePresence>
            </MotionDiv>
          )}
        </div>

        <button 
          onClick={handleNext} 
          disabled={step === 4 && hasNap === null}
          className={`w-full py-5 rounded-3xl font-black text-xl shadow-xl transition-all active:scale-95 ${step === 4 && hasNap === null ? 'bg-slate-800 text-white/30 cursor-not-allowed' : 'bg-indigo-600 text-white shadow-indigo-900/50'}`}
        >
          {step === 4 ? t.getStarted : (language === 'ar' ? 'التالي' : 'Next')}
        </button>
      </div>
    </div>
  );
};

export default Onboarding;