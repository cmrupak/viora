import type { SupabaseClient } from '@supabase/supabase-js';
import { toUserError } from './errors';
import { PROFILE_SELECT, mapProfileRow } from './profile.mapper';
import type {
  AccountDeletionRequest,
  ActivityLogEntry,
  DataExportRequest,
  LoginEvent,
  Profile,
  UserSettings,
  UserSettingsPatch,
} from './types';

function mapSettings(row: Record<string, unknown>): UserSettings {
  const languageRaw = String(row.language ?? 'en');
  const language: UserSettings['language'] =
    languageRaw === 'es' ||
    languageRaw === 'fr' ||
    languageRaw === 'de' ||
    languageRaw === 'hi' ||
    languageRaw === 'pt'
      ? languageRaw
      : 'en';
  const themeRaw = String(row.theme_preference ?? 'system');
  const themePreference: UserSettings['themePreference'] =
    themeRaw === 'light' || themeRaw === 'dark' ? themeRaw : 'system';

  return {
    userId: String(row.user_id),
    language,
    hideSensitive: Boolean(row.hide_sensitive),
    loginAlerts: Boolean(row.login_alerts ?? true),
    reduceMotion: Boolean(row.reduce_motion),
    themePreference,
    updatedAt: row.updated_at == null ? undefined : String(row.updated_at),
  };
}

function defaultSettings(userId: string): UserSettings {
  return {
    userId,
    language: 'en',
    hideSensitive: false,
    loginAlerts: true,
    reduceMotion: false,
    themePreference: 'system',
  };
}

function mapLoginEvent(row: Record<string, unknown>): LoginEvent {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    ipHint: row.ip_hint == null ? null : String(row.ip_hint),
    userAgent: row.user_agent == null ? null : String(row.user_agent),
    deviceLabel: row.device_label == null ? null : String(row.device_label),
    createdAt: String(row.created_at ?? ''),
  };
}

function mapActivity(row: Record<string, unknown>): ActivityLogEntry {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    action: String(row.action ?? ''),
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: String(row.created_at ?? ''),
  };
}

function mapExport(row: Record<string, unknown>): DataExportRequest {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    status: String(row.status ?? 'pending') as DataExportRequest['status'],
    downloadPath: row.download_path == null ? null : String(row.download_path),
    errorMessage: row.error_message == null ? null : String(row.error_message),
    createdAt: String(row.created_at ?? ''),
    updatedAt: row.updated_at == null ? undefined : String(row.updated_at),
  };
}

function mapDeletion(row: Record<string, unknown>): AccountDeletionRequest {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    status: String(row.status ?? 'pending') as AccountDeletionRequest['status'],
    errorMessage: row.error_message == null ? null : String(row.error_message),
    createdAt: String(row.created_at ?? ''),
    updatedAt: row.updated_at == null ? undefined : String(row.updated_at),
  };
}

/**
 * Account settings helpers.
 * Soft deactivate uses profiles.is_deactivated.
 * Hard delete + zip export are requested here and completed by Netlify Functions.
 */
export function createSettingsService(supabase: SupabaseClient) {
  return {
    async getSettings(userId: string): Promise<UserSettings> {
      const { data: ensured, error: ensureError } = await supabase.rpc('ensure_user_settings', {
        p_user_id: userId,
      });
      if (!ensureError && ensured) {
        const row = Array.isArray(ensured) ? ensured[0] : ensured;
        if (row) return mapSettings(row as Record<string, unknown>);
      }

      const { data, error } = await supabase
        .from('user_settings')
        .select(
          'user_id, language, hide_sensitive, login_alerts, reduce_motion, theme_preference, updated_at',
        )
        .eq('user_id', userId)
        .maybeSingle();

      if (error && /user_settings|relation/i.test(error.message ?? '')) {
        return defaultSettings(userId);
      }
      if (error) throw new Error(toUserError(error));
      if (!data) {
        const { data: inserted, error: insertError } = await supabase
          .from('user_settings')
          .insert({ user_id: userId })
          .select(
            'user_id, language, hide_sensitive, login_alerts, reduce_motion, theme_preference, updated_at',
          )
          .single();
        if (insertError && /user_settings|relation/i.test(insertError.message ?? '')) {
          return defaultSettings(userId);
        }
        if (insertError) throw new Error(toUserError(insertError));
        return mapSettings(inserted as Record<string, unknown>);
      }
      return mapSettings(data as Record<string, unknown>);
    },

    async updateSettings(userId: string, patch: UserSettingsPatch): Promise<UserSettings> {
      await this.getSettings(userId);
      const payload: Record<string, unknown> = {};
      if (patch.language !== undefined) payload.language = patch.language;
      if (patch.hideSensitive !== undefined) payload.hide_sensitive = patch.hideSensitive;
      if (patch.loginAlerts !== undefined) payload.login_alerts = patch.loginAlerts;
      if (patch.reduceMotion !== undefined) payload.reduce_motion = patch.reduceMotion;
      if (patch.themePreference !== undefined) payload.theme_preference = patch.themePreference;

      const { data, error } = await supabase
        .from('user_settings')
        .update(payload)
        .eq('user_id', userId)
        .select(
          'user_id, language, hide_sensitive, login_alerts, reduce_motion, theme_preference, updated_at',
        )
        .single();

      if (error) throw new Error(toUserError(error));
      await this.logActivity(userId, 'settings.update', patch as Record<string, unknown>);
      return mapSettings(data as Record<string, unknown>);
    },

    async logActivity(
      userId: string,
      action: string,
      metadata: Record<string, unknown> = {},
    ): Promise<void> {
      const { error } = await supabase.from('activity_log').insert({
        user_id: userId,
        action,
        metadata,
      });
      if (error && !/activity_log|relation/i.test(error.message ?? '')) {
        // Non-fatal for callers
        console.warn('activity_log insert failed', error.message);
      }
    },

    async listActivity(userId: string, limit = 40): Promise<ActivityLogEntry[]> {
      const { data, error } = await supabase
        .from('activity_log')
        .select('id, user_id, action, metadata, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error && /activity_log|relation/i.test(error.message ?? '')) return [];
      if (error) throw new Error(toUserError(error));
      return ((data ?? []) as Record<string, unknown>[]).map(mapActivity);
    },

    async recordLoginEvent(
      userId: string,
      input?: { userAgent?: string | null; deviceLabel?: string | null; ipHint?: string | null },
    ): Promise<LoginEvent | null> {
      const { data, error } = await supabase
        .from('login_events')
        .insert({
          user_id: userId,
          user_agent: input?.userAgent ?? null,
          device_label: input?.deviceLabel ?? null,
          ip_hint: input?.ipHint ?? null,
        })
        .select('id, user_id, ip_hint, user_agent, device_label, created_at')
        .single();

      if (error && /login_events|relation/i.test(error.message ?? '')) return null;
      if (error) throw new Error(toUserError(error));

      const event = mapLoginEvent(data as Record<string, unknown>);

      try {
        const settings = await this.getSettings(userId);
        if (settings.loginAlerts) {
          await supabase.from('notifications').insert({
            user_id: userId,
            actor_id: null,
            type: 'system',
            body: `New sign-in${event.deviceLabel ? ` from ${event.deviceLabel}` : ''}.`,
          });
        }
      } catch {
        /* ignore alert failures */
      }

      return event;
    },

    async listLoginEvents(userId: string, limit = 30): Promise<LoginEvent[]> {
      const { data, error } = await supabase
        .from('login_events')
        .select('id, user_id, ip_hint, user_agent, device_label, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error && /login_events|relation/i.test(error.message ?? '')) return [];
      if (error) throw new Error(toUserError(error));
      return ((data ?? []) as Record<string, unknown>[]).map(mapLoginEvent);
    },

    async requestDataExport(userId: string): Promise<DataExportRequest> {
      const { data, error } = await supabase
        .from('data_export_requests')
        .insert({ user_id: userId, status: 'pending' })
        .select('id, user_id, status, download_path, error_message, created_at, updated_at')
        .single();
      if (error) throw new Error(toUserError(error));
      await this.logActivity(userId, 'export.request', { requestId: data.id });
      return mapExport(data as Record<string, unknown>);
    },

    async listDataExports(userId: string, limit = 10): Promise<DataExportRequest[]> {
      const { data, error } = await supabase
        .from('data_export_requests')
        .select('id, user_id, status, download_path, error_message, created_at, updated_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error && /data_export_requests|relation/i.test(error.message ?? '')) return [];
      if (error) throw new Error(toUserError(error));
      return ((data ?? []) as Record<string, unknown>[]).map(mapExport);
    },

    async getExportDownloadUrl(path: string): Promise<string | null> {
      const { data, error } = await supabase.storage
        .from('account-exports')
        .createSignedUrl(path, 60 * 60);
      if (error) return null;
      return data?.signedUrl ?? null;
    },

    async requestHardDelete(userId: string): Promise<AccountDeletionRequest> {
      const { data, error } = await supabase
        .from('account_deletion_requests')
        .insert({ user_id: userId, status: 'pending' })
        .select('id, user_id, status, error_message, created_at, updated_at')
        .single();
      if (error) throw new Error(toUserError(error));
      await this.logActivity(userId, 'account.delete_request', { requestId: data.id });
      return mapDeletion(data as Record<string, unknown>);
    },

    async listDeletionRequests(userId: string, limit = 5): Promise<AccountDeletionRequest[]> {
      const { data, error } = await supabase
        .from('account_deletion_requests')
        .select('id, user_id, status, error_message, created_at, updated_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error && /account_deletion_requests|relation/i.test(error.message ?? '')) return [];
      if (error) throw new Error(toUserError(error));
      return ((data ?? []) as Record<string, unknown>[]).map(mapDeletion);
    },

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
      await this.logActivity(userId, 'account.deactivate');
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
      await this.logActivity(userId, 'account.reactivate');
      return profile;
    },
  };
}

export type SettingsService = ReturnType<typeof createSettingsService>;
