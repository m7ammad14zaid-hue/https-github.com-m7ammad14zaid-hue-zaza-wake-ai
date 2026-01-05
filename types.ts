
export type Language = 'en' | 'ar';

export enum AppStatus {
  ONBOARDING = 'ONBOARDING',
  DASHBOARD = 'DASHBOARD',
  SLEEPING = 'SLEEPING',
  TIMER_RUNNING = 'TIMER_RUNNING',
  ALARMING = 'ALARMING',
  BEDTIME_ALARM = 'BEDTIME_ALARM',
  CHAT = 'CHAT'
}

export enum CharacterState {
  IDLE = 'IDLE',
  SLEEPY = 'SLEEPY',
  WAKE_UP = 'WAKE_UP',
  VIGOROUS = 'VIGOROUS',
  DETECTIVE = 'DETECTIVE',
  TAPPING = 'TAPPING'
}

export type AlarmSoundType = 'Classic' | 'Bell' | 'Digital';
export type ZazaVoiceType = 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Zephyr';

export interface Reminder {
  id: string;
  time: string; // "HH:mm"
  label: string;
  active: boolean;
}

export interface SleepStats {
  bedTime: string;
  wakeTime: string;
  responseTime: number; // seconds
  success: boolean;
  date: string;
}

export interface UserPreferences {
  targetSleepTime: string; // "HH:mm"
  targetWakeTime: string;  // "HH:mm"
  targetBackToSleepTime: string; // "HH:mm"
  language: Language;
  hasCompletedOnboarding: boolean;
  userName: string;
  alarmSound: AlarmSoundType;
  zazaVoice: ZazaVoiceType;
  reminders: Reminder[];
}
