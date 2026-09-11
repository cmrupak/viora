Place the Android install file here as:

  viora-android.apk

Or set VITE_ANDROID_APK_URL in Netlify / .env to a hosted APK URL
(for example an EAS build artifact or GitHub release asset).

Build with Expo:

  cd apps/social
  npx eas build -p android --profile preview
