import type { SupabaseClient } from '@supabase/supabase-js';
import { toUserError } from './errors';
import { PROFILE_SELECT, mapProfileRow } from './profile.mapper';
import type {
  Event,
  EventInvite,
  EventInviteStatus,
  EventMember,
  EventRsvpStatus,
  PageParams,
  Profile,
} from './types';

export type CreateEventInput = {
  title: string;
  hostId: string;
  startsAt: string;
  endsAt?: string | null;
  description?: string | null;
  coverUrl?: string | null;
  location?: string | null;
  groupId?: string | null;
  isOnline?: boolean;
  meetingUrl?: string | null;
  recurrenceRule?: string | null;
};

const EVENT_SELECT = `
  id, title, description, cover_url, location, starts_at, ends_at, host_id,
  group_id, is_online, meeting_url, recurrence_rule, discussion_post_id,
  created_at, updated_at,
  host:profiles!events_host_id_fkey(${PROFILE_SELECT})
`;

const EVENT_SELECT_FALLBACK = `
  id, title, description, cover_url, location, starts_at, ends_at, host_id, created_at, updated_at,
  host:profiles!events_host_id_fkey(${PROFILE_SELECT})
`;

const EVENT_MEMBER_SELECT = `
  id, event_id, user_id, status, created_at, updated_at,
  profile:profiles!event_members_user_id_fkey(${PROFILE_SELECT})
`;

const EVENT_INVITE_SELECT = `
  id, event_id, invitee_id, invited_by, status, created_at, updated_at,
  invitee:profiles!event_invites_invitee_id_fkey(${PROFILE_SELECT})
`;

function mapAuthor(row: unknown): Profile | null {
  if (!row || typeof row !== 'object') return null;
  return mapProfileRow(row as Record<string, unknown>);
}

function mapEventRow(row: Record<string, unknown>): Event {
  return {
    id: String(row.id),
    title: String(row.title ?? ''),
    description: row.description == null ? null : String(row.description),
    coverUrl: row.cover_url == null ? null : String(row.cover_url),
    location: row.location == null ? null : String(row.location),
    startsAt: String(row.starts_at ?? ''),
    endsAt: row.ends_at == null ? null : String(row.ends_at),
    hostId: String(row.host_id),
    groupId: row.group_id == null ? null : String(row.group_id),
    isOnline: Boolean(row.is_online),
    meetingUrl: row.meeting_url == null ? null : String(row.meeting_url),
    recurrenceRule: row.recurrence_rule == null ? null : String(row.recurrence_rule),
    discussionPostId: row.discussion_post_id == null ? null : String(row.discussion_post_id),
    createdAt: String(row.created_at ?? ''),
    updatedAt: row.updated_at == null ? undefined : String(row.updated_at),
    host: mapAuthor(row.host ?? row.profiles),
  };
}

function mapEventMemberRow(row: Record<string, unknown>): EventMember {
  const statusRaw = String(row.status ?? 'interested');
  const status: EventRsvpStatus =
    statusRaw === 'going' || statusRaw === 'declined' ? statusRaw : 'interested';

  return {
    id: String(row.id),
    eventId: String(row.event_id),
    userId: String(row.user_id),
    status,
    createdAt: String(row.created_at ?? ''),
    updatedAt: row.updated_at == null ? undefined : String(row.updated_at),
    profile: mapAuthor(row.profile ?? row.profiles),
  };
}

function mapInvite(row: Record<string, unknown>): EventInvite {
  const statusRaw = String(row.status ?? 'pending');
  const status: EventInviteStatus =
    statusRaw === 'accepted' || statusRaw === 'declined' ? statusRaw : 'pending';
  return {
    id: String(row.id),
    eventId: String(row.event_id),
    inviteeId: String(row.invitee_id),
    invitedBy: String(row.invited_by),
    status,
    createdAt: String(row.created_at ?? ''),
    updatedAt: row.updated_at == null ? undefined : String(row.updated_at),
    invitee: mapAuthor(row.invitee),
  };
}

export function createEventsService(supabase: SupabaseClient) {
  return {
    async create(input: CreateEventInput): Promise<Event> {
      const title = input.title.trim();
      if (!title) throw new Error('Event title is required.');
      if (!input.startsAt) throw new Error('Event start time is required.');

      const insertRow: Record<string, unknown> = {
        title,
        host_id: input.hostId,
        starts_at: input.startsAt,
        ends_at: input.endsAt ?? null,
        description: input.description?.trim() || null,
        cover_url: input.coverUrl ?? null,
        location: input.location?.trim() || null,
        group_id: input.groupId ?? null,
        is_online: Boolean(input.isOnline),
        meeting_url: input.meetingUrl?.trim() || null,
        recurrence_rule: input.recurrenceRule?.trim() || null,
      };

      let data: unknown = null;
      let error: { message?: string } | null = null;
      const first = await supabase.from('events').insert(insertRow).select(EVENT_SELECT).single();
      data = first.data;
      error = first.error;

      if (error && /group_id|is_online|meeting_url|recurrence|discussion/i.test(error.message ?? '')) {
        const fallback = await supabase
          .from('events')
          .insert({
            title,
            host_id: input.hostId,
            starts_at: input.startsAt,
            ends_at: input.endsAt ?? null,
            description: input.description?.trim() || null,
            cover_url: input.coverUrl ?? null,
            location: input.location?.trim() || null,
          })
          .select(EVENT_SELECT_FALLBACK)
          .single();
        data = fallback.data;
        error = fallback.error;
      }

      if (error) throw new Error(toUserError(error));
      const event = mapEventRow(data as Record<string, unknown>);

      // Ensure discussion post for thread
      try {
        const { data: post } = await supabase
          .from('posts')
          .insert({
            author_id: input.hostId,
            body: `Discussion for event: ${title}`,
          })
          .select('id')
          .single();
        if (post) {
          await supabase
            .from('events')
            .update({ discussion_post_id: (post as { id: string }).id })
            .eq('id', event.id);
          event.discussionPostId = String((post as { id: string }).id);
        }
      } catch {
        /* optional until migration applied */
      }

      return event;
    },

    async list(
      params: PageParams & { groupId?: string | null } = {},
    ): Promise<Event[]> {
      const limit = Math.min(params.limit ?? 20, 50);
      let query = supabase
        .from('events')
        .select(EVENT_SELECT)
        .order('starts_at', { ascending: true })
        .limit(limit);

      if (params.groupId) {
        query = query.eq('group_id', params.groupId);
      }
      if (params.cursor) {
        query = query.gt('starts_at', params.cursor);
      }

      let { data, error } = await query;
      if (error && /group_id|is_online|meeting_url|recurrence|discussion/i.test(error.message ?? '')) {
        const fallback = await supabase
          .from('events')
          .select(EVENT_SELECT_FALLBACK)
          .order('starts_at', { ascending: true })
          .limit(limit);
        data = fallback.data as typeof data;
        error = fallback.error;
      }
      if (error) throw new Error(toUserError(error));
      return (data ?? []).map((row) => mapEventRow(row as Record<string, unknown>));
    },

    async getById(eventId: string): Promise<Event | null> {
      let { data, error } = await supabase
        .from('events')
        .select(EVENT_SELECT)
        .eq('id', eventId)
        .maybeSingle();

      if (error && /group_id|is_online|meeting_url|recurrence|discussion/i.test(error.message ?? '')) {
        const fallback = await supabase
          .from('events')
          .select(EVENT_SELECT_FALLBACK)
          .eq('id', eventId)
          .maybeSingle();
        data = fallback.data as typeof data;
        error = fallback.error;
      }
      if (error) throw new Error(toUserError(error));
      if (!data) return null;
      return mapEventRow(data as Record<string, unknown>);
    },

    async join(
      eventId: string,
      userId: string,
      status: EventRsvpStatus = 'interested',
    ): Promise<EventMember> {
      const { data, error } = await supabase
        .from('event_members')
        .upsert(
          {
            event_id: eventId,
            user_id: userId,
            status,
          },
          { onConflict: 'event_id,user_id' },
        )
        .select(EVENT_MEMBER_SELECT)
        .single();

      if (error) throw new Error(toUserError(error));
      return mapEventMemberRow(data as Record<string, unknown>);
    },

    async leave(eventId: string, userId: string): Promise<void> {
      const { error } = await supabase
        .from('event_members')
        .delete()
        .eq('event_id', eventId)
        .eq('user_id', userId);

      if (error) throw new Error(toUserError(error));
    },

    async delete(eventId: string, hostId: string): Promise<void> {
      const { error } = await supabase
        .from('events')
        .delete()
        .eq('id', eventId)
        .eq('host_id', hostId);

      if (error) throw new Error(toUserError(error));
    },

    async listMembers(eventId: string, params: PageParams = {}): Promise<EventMember[]> {
      const limit = Math.min(params.limit ?? 50, 100);
      let query = supabase
        .from('event_members')
        .select(EVENT_MEMBER_SELECT)
        .eq('event_id', eventId)
        .order('created_at', { ascending: true })
        .limit(limit);

      if (params.cursor) {
        query = query.gt('created_at', params.cursor);
      }

      const { data, error } = await query;
      if (error) throw new Error(toUserError(error));
      return (data ?? []).map((row) => mapEventMemberRow(row as Record<string, unknown>));
    },

    async invite(
      eventId: string,
      invitedBy: string,
      inviteeId: string,
    ): Promise<EventInvite> {
      const { data, error } = await supabase
        .from('event_invites')
        .upsert(
          {
            event_id: eventId,
            invited_by: invitedBy,
            invitee_id: inviteeId,
            status: 'pending',
          },
          { onConflict: 'event_id,invitee_id' },
        )
        .select(EVENT_INVITE_SELECT)
        .single();
      if (error) throw new Error(toUserError(error));
      return mapInvite(data as Record<string, unknown>);
    },

    async listMyInvites(userId: string): Promise<EventInvite[]> {
      const { data, error } = await supabase
        .from('event_invites')
        .select(EVENT_INVITE_SELECT)
        .eq('invitee_id', userId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) {
        if (/event_invites|relation/i.test(error.message ?? '')) return [];
        throw new Error(toUserError(error));
      }
      return (data ?? []).map((row) => mapInvite(row as Record<string, unknown>));
    },

    async respondToInvite(
      inviteId: string,
      userId: string,
      status: Exclude<EventInviteStatus, 'pending'>,
    ): Promise<EventInvite> {
      const { data, error } = await supabase
        .from('event_invites')
        .update({ status })
        .eq('id', inviteId)
        .eq('invitee_id', userId)
        .select(EVENT_INVITE_SELECT)
        .single();
      if (error) throw new Error(toUserError(error));
      const invite = mapInvite(data as Record<string, unknown>);
      if (status === 'accepted') {
        await this.join(invite.eventId, userId, 'going');
      }
      return invite;
    },
  };
}

export type EventsService = ReturnType<typeof createEventsService>;
