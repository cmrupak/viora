export type MutationStatus = 'idle' | 'pending' | 'success' | 'error';

export interface OptimisticState<T> {
  data: T;
  previousData?: T;
  status: MutationStatus;
  error?: string;
}

export type OptimisticMutationOptions = {
  apply: () => void;
  mutation: () => Promise<void>;
  rollback: () => void;
  onSuccess?: () => void;
  onError?: (error: unknown) => void;
};

/**
 * Shared optimistic mutation helper used by web + mobile hooks.
 * Apply UI first, sync in background, rollback on failure.
 */
export async function optimisticMutation(options: OptimisticMutationOptions): Promise<void> {
  options.apply();
  try {
    await options.mutation();
    options.onSuccess?.();
  } catch (error) {
    options.rollback();
    options.onError?.(error);
    throw error;
  }
}

/** Deduplicate rapid toggles: latest intent wins via generation counter. */
export function createLatestIntentGate() {
  let generation = 0;
  return {
    next() {
      generation += 1;
      return generation;
    },
    isCurrent(token: number) {
      return token === generation;
    },
  };
}
