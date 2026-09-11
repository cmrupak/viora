import type { SupabaseClient } from '@supabase/supabase-js';
import { toUserError } from './errors';
import { mapPostRow, POST_SELECT } from './posts.service';
import type { Post, PostShare, ShareTarget } from './types';

export type CreateShareInput = {
  postId: string;
  userId: string;
  target?: ShareTarget;
  conversationId?: string | null;
  /** For share-to-DM: recipient user id (opens/creates DM and sends link). */
  recipientUserId?: string | null;
  /** Optional quote text when resharing to feed. */
  quoteBody?: string | null;
  /** Absolute or path URL to include in DM / link shares. */
  postUrl?: string | null;
};

function mapShare(row: Record<string, unknown>): PostShare {
  const targetRaw = String(row.target ?? 'external');
  const target: ShareTarget =
    targetRaw === 'link' || targetRaw === 'feed' || targetRaw === 'dm' || targetRaw === 'external'
      ? targetRaw
      : 'external';
  return {
    id: String(row.id),
    postId: String(row.post_id),
    userId: String(row.user_id),
    target,
    conversationId: row.conversation_id == null ? null : String(row.conversation_id),
    createdAt: String(row.created_at ?? ''),
  };
}

export function createSharesService(supabase: SupabaseClient) {
  async function insertShare(input: {
    postId: string;
    userId: string;
    target: ShareTarget;
    conversationId?: string | null;
  }): Promise<PostShare> {
    const payload: Record<string, unknown> = {
      post_id: input.postId,
      user_id: input.userId,
      target: input.target,
    };
    if (input.conversationId) payload.conversation_id = input.conversationId;

    let { data, error } = await supabase
      .from('post_shares')
      .insert(payload)
      .select('id, post_id, user_id, target, conversation_id, created_at')
      .single();

    if (error && /target|conversation_id/i.test(error.message ?? '')) {
      const fallback = await supabase
        .from('post_shares')
        .insert({ post_id: input.postId, user_id: input.userId })
        .select('id, post_id, user_id, created_at')
        .single();
      data = fallback.data as typeof data;
      error = fallback.error;
    }
    if (error) throw new Error(toUserError(error));
    return mapShare(data as Record<string, unknown>);
  }

  return {
    async createShare(postId: string, userId: string): Promise<PostShare> {
      return insertShare({ postId, userId, target: 'external' });
    },

    async share(input: CreateShareInput): Promise<{ share: PostShare; repost?: Post | null }> {
      const target = input.target ?? 'external';

      if (target === 'feed') {
        const { data: original, error: findError } = await supabase
          .from('posts')
          .select(POST_SELECT)
          .eq('id', input.postId)
          .is('deleted_at', null)
          .maybeSingle();
        if (findError) throw new Error(toUserError(findError));
        if (!original) throw new Error('Post not found.');

        const quote = (input.quoteBody ?? '').trim();
        const insertPayload: Record<string, unknown> = {
          author_id: input.userId,
          body: quote || '',
          visibility: 'public',
          publish_status: 'published',
          repost_of_id: input.postId,
        };

        let { data: created, error } = await supabase
          .from('posts')
          .insert(insertPayload)
          .select(POST_SELECT)
          .single();

        if (error && /repost_of_id|publish_status/i.test(error.message ?? '')) {
          const fallback = await supabase
            .from('posts')
            .insert({
              author_id: input.userId,
              body: quote || 'Shared a post',
              visibility: 'public',
            })
            .select(POST_SELECT)
            .single();
          created = fallback.data as typeof created;
          error = fallback.error;
        }
        if (error) throw new Error(toUserError(error));

        const share = await insertShare({
          postId: input.postId,
          userId: input.userId,
          target: 'feed',
        });
        const repost = mapPostRow(created as Record<string, unknown>);
        repost.repostOf = mapPostRow(original as Record<string, unknown>);
        return { share, repost };
      }

      if (target === 'dm') {
        if (!input.recipientUserId) {
          throw new Error('Pick someone to share with.');
        }
        const { data: conversationId, error: dmError } = await supabase.rpc('get_or_create_dm', {
          other_user_id: input.recipientUserId,
        });
        if (dmError) throw new Error(toUserError(dmError));
        const convoId = String(conversationId);
        const link = input.postUrl?.trim() || `/posts/${input.postId}`;
        const body = `Shared a post: ${link}`;
        const { error: msgError } = await supabase.from('messages').insert({
          conversation_id: convoId,
          sender_id: input.userId,
          body,
        });
        if (msgError) throw new Error(toUserError(msgError));

        const share = await insertShare({
          postId: input.postId,
          userId: input.userId,
          target: 'dm',
          conversationId: convoId,
        });
        return { share };
      }

      const share = await insertShare({
        postId: input.postId,
        userId: input.userId,
        target: target === 'link' ? 'link' : 'external',
      });
      return { share };
    },
  };
}

export type SharesService = ReturnType<typeof createSharesService>;
