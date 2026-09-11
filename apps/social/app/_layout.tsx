import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import 'react-native-reanimated';
import '../global.css';
import { AuthProvider, useAuth } from '@/auth/AuthProvider';
import { AppUpdateChecker } from '@/components/AppUpdateChecker';
import { AppThemeProvider, useColorScheme } from '@/components/ThemePreference';
import { brand, colors } from '@/design/tokens';

export const unstable_settings = {
  anchor: '(tabs)',
};

function AuthGate({ children }: { children: React.ReactNode }) {
  const { ready, user, configured } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const palette = colors[scheme];

  useEffect(() => {
    if (!ready) return;

    const root = segments[0] as string | undefined;
    const onResetPassword = root === 'reset-password';
    const inAuthGroup =
      root === 'login' ||
      root === 'register' ||
      root === 'forgot-password' ||
      root === 'setup' ||
      onResetPassword;
    const onWelcome = !root || root === 'index';

    if (!configured && root !== 'setup') {
      router.replace('/setup');
      return;
    }

    if (!configured) return;

    if (!user && !inAuthGroup && !onWelcome) {
      router.replace('/login');
      return;
    }

    if (user && (inAuthGroup || onWelcome) && !onResetPassword) {
      router.replace('/(tabs)/feed');
    }
  }, [configured, ready, router, segments, user]);

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.bg }}>
        <ActivityIndicator color={palette.primary} />
      </View>
    );
  }

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <AppThemeProvider>
        <RootNavigation />
      </AppThemeProvider>
    </AuthProvider>
  );
}

function RootNavigation() {
  const colorScheme = useColorScheme();

  return (
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AppUpdateChecker />
        <AuthGate>
          <Stack>
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="setup" options={{ title: 'Setup' }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false, title: brand.name }} />
            <Stack.Screen name="login" options={{ headerShown: false, title: 'Login' }} />
            <Stack.Screen name="register" options={{ headerShown: false, title: 'Register' }} />
            <Stack.Screen name="forgot-password" options={{ headerShown: false, title: 'Forgot password' }} />
            <Stack.Screen name="reset-password" options={{ headerShown: false, title: 'Reset password' }} />
            <Stack.Screen name="post/[id]" options={{ title: 'Post' }} />
            <Stack.Screen name="user/[username]" options={{ title: 'Profile' }} />
            <Stack.Screen name="messages/index" options={{ title: 'Messages' }} />
            <Stack.Screen name="messages/[id]" options={{ title: 'Chat' }} />
            <Stack.Screen name="friends" options={{ title: 'Friends' }} />
            <Stack.Screen name="connections/[username]" options={{ title: 'Connections' }} />
            <Stack.Screen name="relationship-lists" options={{ title: 'Lists' }} />
            <Stack.Screen name="groups" options={{ title: 'Groups' }} />
            <Stack.Screen name="group/[id]" options={{ title: 'Group' }} />
            <Stack.Screen name="events" options={{ title: 'Events' }} />
            <Stack.Screen name="event/[id]" options={{ title: 'Event' }} />
            <Stack.Screen name="reels" options={{ title: 'Reels' }} />
            <Stack.Screen name="reels/create" options={{ title: 'New reel' }} />
            <Stack.Screen name="watch" options={{ title: 'Watch' }} />
            <Stack.Screen name="highlights" options={{ title: 'Highlights' }} />
            <Stack.Screen name="hashtag/[tag]" options={{ title: 'Hashtag' }} />
            <Stack.Screen name="place/[name]" options={{ title: 'Place' }} />
            <Stack.Screen name="saved" options={{ title: 'Saved' }} />
            <Stack.Screen name="search" options={{ title: 'Search' }} />
            <Stack.Screen name="stories/create" options={{ title: 'New story' }} />
            <Stack.Screen name="notification-prefs" options={{ title: 'Notifications' }} />
            <Stack.Screen name="safety" options={{ title: 'Safety' }} />
            <Stack.Screen name="account-security" options={{ title: 'Account security' }} />
            <Stack.Screen name="settings" options={{ title: 'Settings' }} />
          </Stack>
        </AuthGate>
        <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      </ThemeProvider>
  );
}
