import { Link } from 'expo-router';
import { Text, View } from 'react-native';
import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/components/ui/Primitives';
import { brand } from '@/design/tokens';

export default function WelcomeScreen() {
  const { user, configured } = useAuth();

  return (
    <View className="flex-1 justify-center bg-bg px-6 py-10">
      <Text className="text-xs font-bold uppercase tracking-[1.5px] text-primary">{brand.name}</Text>
      <Text className="mt-3 text-4xl font-bold leading-10 text-ink">{brand.tagline}</Text>
      <Text className="mt-3 text-base leading-6 text-muted">
        Same account on web and mobile. Phase 2 polishes sign-in, sign-up, and password recovery.
      </Text>

      <View className="mt-8 gap-3">
        <Link href={user ? '/(tabs)/feed' : '/login'} asChild>
          <Button>{user ? 'Open home' : 'Get started'}</Button>
        </Link>
        <Link href={configured ? (user ? '/(tabs)/profile' : '/register') : '/setup'} asChild>
          <Button variant="secondary">
            {configured ? (user ? 'Profile' : 'Create account') : 'Connect Supabase'}
          </Button>
        </Link>
      </View>
    </View>
  );
}
