import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.medlum.app",
  appName: "MedLum",
  webDir: "out",
  server: {
    url: process.env.CAPACITOR_SERVER_URL || undefined,
    cleartext: false,
  },
  ios: {
    contentInset: "automatic",
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
