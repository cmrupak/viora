import type { SupabaseClient } from '@supabase/supabase-js';
import { createAuthService } from './auth.service';
import { createAudiencesService } from './audiences.service';
import { createBlocksService } from './blocks.service';
import { createCommentsService } from './comments.service';
import { createDiscoveryService } from './discovery.service';
import { createEventsService } from './events.service';
import { createFollowsService } from './follows.service';
import { createFriendsService } from './friends.service';
import { createGroupsService } from './groups.service';
import { createLikesService } from './likes.service';
import { createMessagesService } from './messages.service';
import { createNotificationsService } from './notifications.service';
import { createPostsService } from './posts.service';
import { createProfileService } from './profiles.service';
import { createReactionsService } from './reactions.service';
import { createReelsService } from './reels.service';
import { createRelationshipsService } from './relationships.service';
import { createReportsService } from './reports.service';
import { createSavesService } from './saves.service';
import { createSecurityService } from './security.service';
import { createSettingsService } from './settings.service';
import { createSharesService } from './shares.service';
import { createStoriesService } from './stories.service';
import {
  createHttpClient,
  createPhpVioraApi,
  createRealtimeFacade,
  createSessionStore,
  isPhpBackend,
  type VioraBackendConfig,
} from './http';
import { getVioraSupabase } from './supabase';

function createSupabaseVioraApi(supabase: SupabaseClient) {
  return {
    auth: createAuthService(supabase),
    profiles: createProfileService(supabase),
    posts: createPostsService(supabase),
    likes: createLikesService(supabase),
    comments: createCommentsService(supabase),
    saves: createSavesService(supabase),
    follows: createFollowsService(supabase),
    shares: createSharesService(supabase),
    notifications: createNotificationsService(supabase),
    messages: createMessagesService(supabase),
    blocks: createBlocksService(supabase),
    reports: createReportsService(supabase),
    settings: createSettingsService(supabase),
    security: createSecurityService(supabase),
    stories: createStoriesService(supabase),
    reels: createReelsService(supabase),
    groups: createGroupsService(supabase),
    events: createEventsService(supabase),
    friends: createFriendsService(supabase),
    reactions: createReactionsService(supabase),
    relationships: createRelationshipsService(supabase),
    audiences: createAudiencesService(supabase),
    discovery: createDiscoveryService(supabase),
    media: {
      async upload(input: {
        bucket: string;
        file: Blob | ArrayBuffer | ArrayBufferView | FormData;
        filename?: string;
        contentType?: string;
      }): Promise<{ url: string } & Record<string, unknown>> {
        if (input.file instanceof FormData) {
          throw new Error('FormData uploads should use the PHP media endpoint.');
        }
        const ext =
          input.filename?.split('.').pop() ||
          input.contentType?.split('/')[1]?.split(';')[0] ||
          'bin';
        const path = `uploads/${Date.now()}.${ext}`;
        const body =
          typeof Blob !== 'undefined' && input.file instanceof Blob
            ? input.file
            : input.file instanceof ArrayBuffer
              ? new Blob([input.file], input.contentType ? { type: input.contentType } : undefined)
              : new Blob(
                  [
                    (input.file as ArrayBufferView).buffer.slice(
                      (input.file as ArrayBufferView).byteOffset,
                      (input.file as ArrayBufferView).byteOffset +
                        (input.file as ArrayBufferView).byteLength,
                    ) as ArrayBuffer,
                  ],
                  input.contentType ? { type: input.contentType } : undefined,
                );
        const { error } = await supabase.storage.from(input.bucket).upload(path, body, {
          contentType: input.contentType || body.type || 'application/octet-stream',
          upsert: false,
        });
        if (error) throw error;
        const { data } = supabase.storage.from(input.bucket).getPublicUrl(path);
        return { url: data.publicUrl, path, bucket: input.bucket };
      },
    },
    realtime: createRealtimeFacade({ mode: 'supabase', supabase }),
    client: supabase as SupabaseClient | null,
  };
}

/** Existing entry — Supabase client (production default). */
export function createVioraApi(supabase: SupabaseClient) {
  return createSupabaseVioraApi(supabase);
}

/**
 * Dual-mode factory: `backend: 'php'` → Laragon PHP REST; otherwise Supabase.
 * Method names match across both backends.
 */
export function createVioraBackend(config: VioraBackendConfig) {
  if (isPhpBackend(config)) {
    const session = createSessionStore(config.storage);
    const http = createHttpClient({ baseUrl: config.baseUrl, session });
    return createPhpVioraApi(http, session);
  }
  const supabase = getVioraSupabase({
    url: config.url,
    anonKey: config.anonKey,
    storage: config.storage,
    detectSessionInUrl: config.detectSessionInUrl,
  });
  return createSupabaseVioraApi(supabase);
}

export type VioraApi = ReturnType<typeof createSupabaseVioraApi>;
