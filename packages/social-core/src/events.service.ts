import type { SupabaseClient } from '@supabase/supabase-js';
import { toUserError } from './errors';
import { PROFILE_SELECT, mapProfileRow } from './profile.mapper';
import type { Event, EventMember, EventRsvpStatus, PageParams, Profile } from './types';

export type CreateEventInput = {
  title: string;
  hostId: string;
  startsAt: string;
  endsAt?: string | null;
  description?: string | null;
  coverUrl?: string | null;
  location?: string | null;
};

const EVENT_SELECT = `
  id, title, description, cover_url, location, starts_at, ends_at, host_id, created_at, updated_at,
  host:profiles!events_host_id_fkey(${PROFILE_SELECT})
`;

const EVENT_MEMBER_SELECT = `
  id, event_id, user_id, status, created_at, updated_at,
  profile:profiles!event_members_user_id_fkey(${PROFILE_SELECT})
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

export function createEventsService(supabase: SupabaseClient) {
  return {
    async create(input: CreateEventInput): Promise<Event> {
      const title = input.title.trim();
      if (!title) throw new Error('Event title is required.');
      if (!input.startsAt) throw new Error('Event start time is required.');

      const { data, error } = await supabase
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
        .select(EVENT_SELECT)
        .single();

      if (error) throw new Error(toUserError(error));
      return mapEventRow(data as Record<string, unknown>);
    },

    async list(params: PageParams = {}): Promise<Event[]> {
      const limit = Math.min(params.limit ?? 20, 50);
      let query = supabase
        .from('events')
        .select(EVENT_SELECT)
        .order('starts_at', { ascending: true })
        .limit(limit);

      if (params.cursor) {
        query = query.gt('starts_at', params.cursor);
      }

      const { data, error } = await query;
      if (error) throw new Error(toUserError(error));
      return (data ?? []).map((row) => mapEventRow(row as Record<string, unknown>));
    },

    async getById(eventId: string): Promise<Event | null> {
      const { data, error } = await supabase
        .from('events')
        .select(EVENT_SELECT)
        .eq('id', eventId)
        .maybeSingle();

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
  };
}

export type EventsService = ReturnType<typeof createEventsService>;
