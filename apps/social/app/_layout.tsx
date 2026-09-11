import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import 'react-native-reanimated';
import '../global.css';
import { AuthProvider, useAuth } from '@/auth/AuthProvider';
import { useColorScheme } from '@/components/useColorScheme';
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
  const colorScheme = useColorScheme();

  return (
    <AuthProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
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
            <Stack.Screen name="groups" options={{ title: 'Groups' }} />
            <Stack.Screen name="events" options={{ title: 'Events' }} />
            <Stack.Screen name="reels" options={{ title: 'Reels' }} />
            <Stack.Screen name="saved" options={{ title: 'Saved' }} />
            <Stack.Screen name="search" options={{ title: 'Search' }} />
            <Stack.Screen name="stories/create" options={{ title: 'New story' }} />
            <Stack.Screen name="settings" options={{ title: 'Settings' }} />
          </Stack>
        </AuthGate>
        <StatusBar style="auto" />
      </ThemeProvider>
    </AuthProvider>
  );
}
