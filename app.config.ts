import type { ConfigContext, ExpoConfig } from 'expo/config';

const APP_ENV = process.env.EXPO_PUBLIC_APP_ENV ?? 'development';
const IS_PROD = APP_ENV === 'production';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: IS_PROD ? 'Taskrypt' : `Taskrypt (${APP_ENV})`,
  slug: 'taskrypt',
  scheme: 'taskrypt',
  version: '1.0.0',
  orientation: 'default',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: IS_PROD ? 'com.taskrypt.app' : `com.taskrypt.app.${APP_ENV}`,
    supportsTablet: true,
    // Every file the app writes is unreadable while the device is locked.
    entitlements: {
      'com.apple.developer.default-data-protection': 'NSFileProtectionComplete',
    },
    infoPlist: {
      NSFaceIDUsageDescription: 'Taskrypt uses Face ID to unlock your tasks and private documents.',
      ITSAppUsesNonExemptEncryption: false,
    },
    privacyManifests: {
      NSPrivacyAccessedAPITypes: [
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryFileTimestamp',
          NSPrivacyAccessedAPITypeReasons: ['C617.1'],
        },
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryDiskSpace',
          NSPrivacyAccessedAPITypeReasons: ['E174.1'],
        },
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults',
          NSPrivacyAccessedAPITypeReasons: ['CA92.1'],
        },
      ],
    },
  },
  android: {
    package: IS_PROD ? 'com.taskrypt.app' : `com.taskrypt.app.${APP_ENV}`,
    adaptiveIcon: {
      backgroundColor: '#F6F1EA',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    // Keep encrypted vault files and the local database out of adb / cloud backups.
    allowBackup: false,
    predictiveBackGestureEnabled: false,
    permissions: ['USE_BIOMETRIC', 'USE_FINGERPRINT', 'POST_NOTIFICATIONS', 'SCHEDULE_EXACT_ALARM'],
    blockedPermissions: ['android.permission.READ_EXTERNAL_STORAGE', 'android.permission.WRITE_EXTERNAL_STORAGE'],
  },
  web: {
    favicon: './assets/favicon.png',
  },
  plugins: [
    'expo-router',
    'expo-sqlite',
    'expo-font',
    'expo-image',
    'expo-sharing',
    [
      'expo-secure-store',
      {
        configureAndroidBackup: true,
        faceIDPermission: 'Taskrypt uses Face ID to protect your encryption keys.',
      },
    ],
    [
      'expo-local-authentication',
      {
        faceIDPermission: 'Taskrypt uses Face ID to unlock your tasks and private documents.',
      },
    ],
    [
      'expo-notifications',
      {
        color: '#D9653B',
      },
    ],
    [
      'expo-splash-screen',
      {
        // Intentionally blank: the OS splash is just the background colour, so the
        // animated Kora splash (src/app/index.tsx) is the only splash users notice.
        image: './assets/splash-blank.png',
        imageWidth: 180,
        resizeMode: 'contain',
        // Matches the default (Kora / terracotta) themed splash in src/app/index.tsx.
        // Native splash colours are baked in at build time and cannot follow the user's palette.
        backgroundColor: '#FBE4D9',
        dark: { backgroundColor: '#3A2419' },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    appEnv: APP_ENV,
    eas: {
      projectId: process.env.EAS_PROJECT_ID,
    },
  },
});
