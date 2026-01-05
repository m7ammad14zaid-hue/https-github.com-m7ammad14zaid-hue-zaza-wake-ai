
import { UserPreferences, SleepStats, Reminder } from '../types';

const PREFS_KEY = 'zzz_wake_prefs';
const STATS_KEY = 'zzz_wake_stats';

export const storageService = {
  getPreferences: (): UserPreferences => {
    const data = localStorage.getItem(PREFS_KEY);
    return data ? JSON.parse(data) : {
      targetSleepTime: '00:00',
      targetWakeTime: '00:00',
      targetBackToSleepTime: '00:00',
      language: 'ar',
      hasCompletedOnboarding: false,
      userName: '',
      alarmSound: 'Classic',
      zazaVoice: 'Kore',
      reminders: []
    };
  },

  savePreferences: (prefs: UserPreferences) => {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  },

  getStats: (): SleepStats[] => {
    const data = localStorage.getItem(STATS_KEY);
    return data ? JSON.parse(data) : [];
  },

  saveStat: (stat: SleepStats) => {
    const stats = storageService.getStats();
    stats.push(stat);
    localStorage.setItem(STATS_KEY, JSON.stringify(stats.slice(-30))); // Keep last 30 days
  }
};
