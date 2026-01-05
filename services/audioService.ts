
import { AlarmSoundType } from '../types';

class AudioService {
  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;

  private init() {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.masterGain = this.audioContext.createGain();
      this.masterGain.gain.setValueAtTime(1.2, this.audioContext.currentTime);
      this.masterGain.connect(this.audioContext.destination);
    }
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
  }

  playTapping(intensity: 'soft' | 'hard' = 'soft') {
    this.init();
    const ctx = this.audioContext!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = intensity === 'soft' ? 'sine' : 'triangle';
    osc.frequency.setValueAtTime(intensity === 'soft' ? 120 : 280, ctx.currentTime);
    
    gain.gain.setValueAtTime(intensity === 'soft' ? 0.3 : 0.8, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);

    osc.connect(gain);
    gain.connect(this.masterGain!);

    osc.start();
    osc.stop(ctx.currentTime + 0.08);
  }

  playAlarm(isVigorous: boolean = false, type: AlarmSoundType = 'Classic') {
    this.init();
    const ctx = this.audioContext!;
    const now = ctx.currentTime;
    
    if (type === 'Classic') {
      const beeps = [0, 0.15, 0.3];
      const baseFreq = isVigorous ? 880 : 440;
      beeps.forEach((delay, index) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = isVigorous ? 'square' : 'triangle';
        const freq = baseFreq * (1 + (index * 0.1));
        osc.frequency.setValueAtTime(freq, now + delay);
        gain.gain.setValueAtTime(0, now + delay);
        gain.gain.linearRampToValueAtTime(0.6, now + delay + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.01, now + delay + 0.12);
        osc.connect(gain);
        gain.connect(this.masterGain!);
        osc.start(now + delay);
        osc.stop(now + delay + 0.12);
      });
    } else if (type === 'Bell') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1200, now);
      osc.frequency.exponentialRampToValueAtTime(800, now + 0.5);
      gain.gain.setValueAtTime(0.7, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 1.0);
      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start();
      osc.stop(now + 1.0);
    } else if (type === 'Digital') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(2000, now);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.5, now + 0.01);
      gain.gain.setValueAtTime(0.5, now + 0.1);
      gain.gain.linearRampToValueAtTime(0, now + 0.11);
      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start();
      osc.stop(now + 0.15);
    }
  }

  playSleepSound() {
    this.init();
    const ctx = this.audioContext!;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(60, now + 3);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1000, now);
    filter.frequency.exponentialRampToValueAtTime(100, now + 3);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.4, now + 0.5);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 3);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain!);
    osc.start(now);
    osc.stop(now + 3);
  }

  playBedtimeReminder() {
    this.init();
    const ctx = this.audioContext!;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(330, now); 
    osc.frequency.linearRampToValueAtTime(440, now + 0.5); 
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.3, now + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 1.0);
    osc.connect(gain);
    gain.connect(this.masterGain!);
    osc.start(now);
    osc.stop(now + 1.0);
  }
}

export const audioService = new AudioService();
