import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.tradevault.journal.next',
  appName: 'TradeVault Next',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
