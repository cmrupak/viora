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

export function createVioraApi(supabase: SupabaseClient) {
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
    client: supabase,
  };
}

export type VioraApi = ReturnType<typeof createVioraApi>;
