import type { SupabaseClient } from '@supabase/supabase-js';
import { toUserError } from './errors';
import { PROFILE_SELECT, mapProfileRow } from './profile.mapper';
import type { AudienceList, PageParams, Profile } from './types';

function mapList(row: Record<string, unknown>, memberCount?: number): AudienceList {
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    name: String(row.name ?? ''),
    createdAt: String(row.created_at ?? ''),
    updatedAt: row.updated_at == null ? undefined : String(row.updated_at),
    memberCount,
  };
}

export function createAudiencesService(supabase: SupabaseClient) {
  return {
    async createList(ownerId: string, name: string): Promise<AudienceList> {
      const trimmed = name.trim();
      if (!trimmed) throw new Error('List name is required.');
      const { data, error } = await supabase
        .from('audience_lists')
        .insert({ owner_id: ownerId, name: trimmed })
        .select('id, owner_id, name, created_at, updated_at')
        .single();
      if (error) throw new Error(toUserError(error));
      return mapList(data as Record<string, unknown>, 0);
    },

    async renameList(listId: string, ownerId: string, name: string): Promise<AudienceList> {
      const trimmed = name.trim();
      if (!trimmed) throw new Error('List name is required.');
      const { data, error } = await supabase
        .from('audience_lists')
        .update({ name: trimmed })
        .eq('id', listId)
        .eq('owner_id', ownerId)
        .select('id, owner_id, name, created_at, updated_at')
        .single();
      if (error) throw new Error(toUserError(error));
      return mapList(data as Record<string, unknown>);
    },

    async deleteList(listId: string, ownerId: string): Promise<void> {
      const { error } = await supabase
        .from('audience_lists')
        .delete()
        .eq('id', listId)
        .eq('owner_id', ownerId);
      if (error) throw new Error(toUserError(error));
    },

    async listLists(ownerId: string, params: PageParams = {}): Promise<AudienceList[]> {
      const limit = Math.min(params.limit ?? 50, 100);
      const { data, error } = await supabase
        .from('audience_lists')
        .select('id, owner_id, name, created_at, updated_at')
        .eq('owner_id', ownerId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw new Error(toUserError(error));

      const lists = (data ?? []).map((row) => mapList(row as Record<string, unknown>));
      if (lists.length === 0) return lists;

      const ids = lists.map((l) => l.id);
      const { data: members } = await supabase
        .from('audience_list_members')
        .select('list_id')
        .in('list_id', ids);
      const counts = new Map<string, number>();
      for (const row of members ?? []) {
        const id = String((row as { list_id: string }).list_id);
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
      return lists.map((l) => ({ ...l, memberCount: counts.get(l.id) ?? 0 }));
    },

    async listMembers(listId: string, params: PageParams = {}): Promise<Profile[]> {
      const limit = Math.min(params.limit ?? 50, 100);
      const { data, error } = await supabase
        .from('audience_list_members')
        .select(`created_at, member:profiles!audience_list_members_member_id_fkey(${PROFILE_SELECT})`)
        .eq('list_id', listId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw new Error(toUserError(error));
      return (data ?? [])
        .map((row) => {
          const r = row as unknown as { member: Record<string, unknown> | null };
          return mapProfileRow(r.member);
        })
        .filter((p): p is Profile => p != null);
    },

    async addMember(listId: string, ownerId: string, memberId: string): Promise<void> {
      const { data: list, error: listError } = await supabase
        .from('audience_lists')
        .select('id')
        .eq('id', listId)
        .eq('owner_id', ownerId)
        .maybeSingle();
      if (listError) throw new Error(toUserError(listError));
      if (!list) throw new Error('List not found.');
      if (ownerId === memberId) throw new Error('You are already the list owner.');

      const { error } = await supabase.from('audience_list_members').upsert(
        { list_id: listId, member_id: memberId },
        { onConflict: 'list_id,member_id', ignoreDuplicates: true },
      );
      if (error) throw new Error(toUserError(error));
    },

    async removeMember(listId: string, ownerId: string, memberId: string): Promise<void> {
      const { data: list, error: listError } = await supabase
        .from('audience_lists')
        .select('id')
        .eq('id', listId)
        .eq('owner_id', ownerId)
        .maybeSingle();
      if (listError) throw new Error(toUserError(listError));
      if (!list) throw new Error('List not found.');

      const { error } = await supabase
        .from('audience_list_members')
        .delete()
        .eq('list_id', listId)
        .eq('member_id', memberId);
      if (error) throw new Error(toUserError(error));
    },
  };
}

export type AudiencesService = ReturnType<typeof createAudiencesService>;
