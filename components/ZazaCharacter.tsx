import React, { useEffect, useState } from 'react';
import { motion, useAnimation } from 'framer-motion';
import { CharacterState } from '../types';

// Casting motion components to any to bypass environment-specific type errors
const MotionDiv = motion.div as any;

interface ZazaCharacterProps {
  state: CharacterState;
  className?: string;
}

const ZazaCharacter: React.FC<ZazaCharacterProps> = ({ state, className = "" }) => {
  // Cast controls to any to handle LegacyAnimationControls type mismatch
  const controls: any = useAnimation();
  const [blink, setBlink] = useState(false);

  useEffect(() => {
    const blinkInterval = setInterval(() => {
      setBlink(true);
      setTimeout(() => setBlink(false), 150);
    }, 3500);
    return () => clearInterval(blinkInterval);
  }, []);

  useEffect(() => {
    const sequence = async () => {
      if (state === CharacterState.WAKE_UP || state === CharacterState.VIGOROUS || state === CharacterState.TAPPING) {
        await controls.start({
          scale: [1, 1.15, 1],
          y: [0, -15, 0],
          transition: { duration: 0.25, repeat: Infinity }
        });
      } else if (state === CharacterState.SLEEPY) {
        await controls.start({
          rotate: [-3, 3, -3],
          y: [0, 8, 0],
          transition: { duration: 4, repeat: Infinity, ease: "easeInOut" }
        });
      } else {
        await controls.start({
          x: [-15, 15, -15],
          y: [0, -5, 0],
          transition: { duration: 6, repeat: Infinity, ease: "easeInOut" }
        });
      }
    };
    sequence();
  }, [state, controls]);

  return (
    <MotionDiv 
      animate={controls}
      className={`relative w-56 h-72 flex flex-col items-center justify-center pointer-events-none ${className}`}
    >
      {/* Background Halo */}
      <div className="absolute inset-0 bg-indigo-500/10 blur-[60px] rounded-full animate-pulse" />

      {/* Zaza Body - Humanoid but Clock-like */}
      <div className="relative w-36 h-48 bg-[#fcdbd0] rounded-[3rem] border-x-4 border-b-8 border-indigo-900/20 shadow-2xl flex flex-col items-center">
        
        {/* Clock-Beret Hat */}
        <div className="absolute -top-10 w-40 h-24 bg-indigo-600 rounded-full z-20 border-b-4 border-indigo-800 flex items-center justify-center overflow-hidden">
          <div className="w-32 h-32 bg-white rounded-full border-4 border-indigo-950 relative flex items-center justify-center">
            {/* Clock Markers */}
            {[0, 90, 180, 270].map(deg => (
              <div key={deg} className="absolute w-1 h-3 bg-indigo-200" style={{ transform: `rotate(${deg}deg) translateY(-12px)` }} />
            ))}
            {/* Clock Hands */}
            <MotionDiv 
              animate={{ rotate: 360 }}
              transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
              className="absolute w-1 h-12 bg-indigo-950 origin-bottom bottom-1/2 rounded-full" 
            />
            <MotionDiv 
              animate={{ rotate: 360 }}
              transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
              className="absolute w-0.5 h-14 bg-red-500 origin-bottom bottom-1/2" 
            />
            <div className="w-3 h-3 bg-indigo-950 rounded-full z-10" />
          </div>
        </div>

        {/* Eyebrows (Clock Hands) */}
        <div className="absolute top-10 left-0 w-full flex justify-around px-6">
          <MotionDiv 
            animate={state === CharacterState.SLEEPY ? { rotate: 20 } : { rotate: 0 }}
            className="w-8 h-1.5 bg-indigo-900 rounded-full" 
          />
          <MotionDiv 
            animate={state === CharacterState.SLEEPY ? { rotate: -20 } : { rotate: 0 }}
            className="w-8 h-1.5 bg-indigo-900 rounded-full" 
          />
        </div>

        {/* Gear Eyes */}
        <div className="absolute top-16 left-0 w-full flex justify-around px-4">
          {[0, 1].map(i => (
            <div key={i} className="relative w-10 h-10 bg-white rounded-full border-2 border-indigo-900 overflow-hidden">
              <MotionDiv 
                animate={blink ? { scaleY: 0 } : { scaleY: 1 }}
                className="w-full h-full bg-indigo-500 origin-top flex items-center justify-center"
              >
                {/* Gear Pupil */}
                <MotionDiv 
                  animate={{ rotate: 360 }}
                  transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                  className="w-6 h-6 border-2 border-indigo-100 border-dashed rounded-full flex items-center justify-center"
                >
                  <div className="w-3 h-3 bg-indigo-950 rounded-full" />
                </MotionDiv>
                <div className="absolute top-1 left-1 w-2 h-2 bg-white rounded-full opacity-60" />
              </MotionDiv>
            </div>
          ))}
        </div>

        {/* Cheeks */}
        <div className="absolute top-28 left-0 w-full flex justify-around px-6 opacity-30">
          <div className="w-4 h-4 bg-rose-400 rounded-full blur-sm" />
          <div className="w-4 h-4 bg-rose-400 rounded-full blur-sm" />
        </div>

        {/* Mouth */}
        <MotionDiv 
          animate={state === CharacterState.SLEEPY ? { width: 10, height: 10 } : { width: 24, height: 8 }}
          className="absolute bottom-12 left-1/2 -translate-x-1/2 bg-rose-500 rounded-full"
        />

        {/* Detective Magnifying Glass Overlay */}
        {state === CharacterState.DETECTIVE && (
          <MotionDiv 
            initial={{ scale: 0, x: 20 }}
            animate={{ scale: 1, x: 0 }}
            className="absolute -right-10 bottom-4 w-20 h-20 border-[6px] border-slate-300 rounded-full bg-blue-100/30 backdrop-blur-md shadow-2xl z-30"
          >
            <div className="absolute -bottom-8 -left-3 w-3 h-12 bg-slate-700 rotate-45 rounded-full shadow-lg" />
          </MotionDiv>
        )}
      </div>

      {/* Tapping Pendulum Hands */}
      {(state === CharacterState.TAPPING || state === CharacterState.VIGOROUS || state === CharacterState.WAKE_UP) && (
        <>
          <MotionDiv 
            animate={{ y: [0, -60, 0], x: [-10, 5, -10] }}
            transition={{ duration: 0.15, repeat: Infinity }}
            className="absolute -left-14 top-32 w-12 h-12 bg-[#fcdbd0] rounded-full border-4 border-indigo-600 shadow-xl flex items-center justify-center"
          >
            <div className="w-4 h-4 bg-indigo-600 rounded-full opacity-20" />
          </MotionDiv>
          <MotionDiv 
            animate={{ y: [0, -60, 0], x: [10, -5, 10] }}
            transition={{ duration: 0.15, repeat: Infinity, delay: 0.07 }}
            className="absolute -right-14 top-32 w-12 h-12 bg-[#fcdbd0] rounded-full border-4 border-indigo-600 shadow-xl flex items-center justify-center"
          >
            <div className="w-4 h-4 bg-indigo-600 rounded-full opacity-20" />
          </MotionDiv>
        </>
      )}

      {/* Zaza Name Tag */}
      <div className="mt-6 px-4 py-1.5 bg-indigo-600 text-white rounded-2xl shadow-lg border border-indigo-400 text-xs font-black tracking-widest uppercase">
        Zaza
      </div>
    </MotionDiv>
  );
};

export default ZazaCharacter;