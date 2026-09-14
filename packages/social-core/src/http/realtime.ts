import type { SupabaseClient } from '@supabase/supabase-js';
import type { VioraHttpClient } from './client';

export type Unsubscribe = () => void;

export type MessageInsertPayload = {
  conversationId: string;
  message: Record<string, unknown>;
};

export type TypingPayload = {
  conversationId: string;
  userId: string;
  isTyping: boolean;
};

/**
 * Backend-agnostic realtime façade.
 * Supabase: postgres_changes + broadcast.
 * PHP: polling interim (same subscribe API).
 */
export function createRealtimeFacade(opts: {
  mode: 'supabase' | 'php';
  supabase?: SupabaseClient;
  http?: VioraHttpClient;
  pollIntervalMs?: number;
}) {
  const pollMs = opts.pollIntervalMs ?? 2500;

  return {
    typingChannelName(conversationId: string) {
      return `typing:${conversationId}`;
    },

    subscribeMessages(
      conversationId: string,
      onInsert: (payload: MessageInsertPayload) => void,
    ): Unsubscribe {
      if (opts.mode === 'supabase' && opts.supabase) {
        const channel = opts.supabase
          .channel(`messages:${conversationId}`)
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'messages',
              filter: `conversation_id=eq.${conversationId}`,
            },
            (payload) => {
              onInsert({
                conversationId,
                message: (payload.new ?? {}) as Record<string, unknown>,
              });
            },
          )
          .subscribe();
        return () => {
          void opts.supabase!.removeChannel(channel);
        };
      }

      // PHP interim: poll and emit only newly seen message ids
      if (!opts.http) return () => undefined;
      let stopped = false;
      const seen = new Set<string>();
      let primed = false;
      const tick = async () => {
        if (stopped) return;
        try {
          const data = await opts.http!.get<{ messages?: Array<Record<string, unknown>> }>(
            `/api/v1/conversations/${conversationId}/messages`,
            { limit: 30 },
          );
          const messages = [...(data.messages ?? [])].reverse();
          for (const message of messages) {
            const id = String(message.id ?? '');
            if (!id || seen.has(id)) continue;
            seen.add(id);
            if (primed) onInsert({ conversationId, message });
          }
          primed = true;
        } catch {
          // ignore transient poll errors
        }
        if (!stopped) timer = setTimeout(() => void tick(), pollMs);
      };
      let timer = setTimeout(() => void tick(), pollMs);
      return () => {
        stopped = true;
        clearTimeout(timer);
      };
    },

    subscribeTyping(
      conversationId: string,
      onTyping: (payload: TypingPayload) => void,
    ): Unsubscribe {
      if (opts.mode === 'supabase' && opts.supabase) {
        const channel = opts.supabase
          .channel(`typing:${conversationId}`)
          .on('broadcast', { event: 'typing' }, ({ payload }) => {
            const p = (payload ?? {}) as Partial<TypingPayload>;
            if (!p.userId) return;
            onTyping({
              conversationId,
              userId: String(p.userId),
              isTyping: Boolean(p.isTyping),
            });
          })
          .subscribe();
        return () => {
          void opts.supabase!.removeChannel(channel);
        };
      }
      // PHP: typing deferred — no-op unsubscribe
      void onTyping;
      void conversationId;
      return () => undefined;
    },

    async publishTyping(conversationId: string, userId: string, isTyping: boolean): Promise<void> {
      if (opts.mode === 'supabase' && opts.supabase) {
        const channel = opts.supabase.channel(`typing:${conversationId}`);
        await channel.subscribe();
        await channel.send({
          type: 'broadcast',
          event: 'typing',
          payload: { conversationId, userId, isTyping },
        });
        return;
      }
      // PHP typing endpoint not yet available
      void conversationId;
      void userId;
      void isTyping;
    },
  };
}

export type RealtimeFacade = ReturnType<typeof createRealtimeFacade>;
