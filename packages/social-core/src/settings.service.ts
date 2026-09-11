import type { SupabaseClient } from '@supabase/supabase-js';
import { toUserError } from './errors';
import { PROFILE_SELECT, mapProfileRow } from './profile.mapper';
import type { Profile } from './types';

/**
 * Account settings helpers.
 * Deactivation is a soft flag on profiles (is_deactivated).
 * Hard account deletion remains a future Auth Admin / Edge Function flow.
 */
export function createSettingsService(supabase: SupabaseClient) {
  return {
    async deactivateAccount(userId: string): Promise<Profile> {
      const { data, error } = await supabase
        .from('profiles')
        .update({ is_deactivated: true })
        .eq('id', userId)
        .select(PROFILE_SELECT)
        .single();

      if (error) throw new Error(toUserError(error));
      const profile = mapProfileRow(data as Record<string, unknown>);
      if (!profile) throw new Error('Unable to deactivate account.');
      return profile;
    },

    async reactivateAccount(userId: string): Promise<Profile> {
      const { data, error } = await supabase
        .from('profiles')
        .update({ is_deactivated: false })
        .eq('id', userId)
        .select(PROFILE_SELECT)
        .single();

      if (error) throw new Error(toUserError(error));
      const profile = mapProfileRow(data as Record<string, unknown>);
      if (!profile) throw new Error('Unable to reactivate account.');
      return profile;
    },
  };
}

export type SettingsService = ReturnType<typeof createSettingsService>;
