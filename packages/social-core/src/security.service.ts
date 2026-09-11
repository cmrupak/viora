import type { Factor, SupabaseClient } from '@supabase/supabase-js';
import { toUserError } from './errors';

export type MfaFactorSummary = {
  id: string;
  friendlyName: string | null;
  status: string;
  factorType: string;
};

export type MfaEnrollResult = {
  id: string;
  type: string;
  totp?: {
    qr_code?: string;
    secret?: string;
    uri?: string;
  };
};

function mapFactor(factor: Factor): MfaFactorSummary {
  return {
    id: factor.id,
    friendlyName: factor.friendly_name ?? null,
    status: factor.status,
    factorType: factor.factor_type,
  };
}

/**
 * Supabase Auth MFA (TOTP) helpers.
 * Challenge/verify for AAL2; enroll for first-time setup.
 */
export function createSecurityService(supabase: SupabaseClient) {
  return {
    async listMfaFactors(): Promise<MfaFactorSummary[]> {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw new Error(toUserError(error));
      const all = [...(data?.totp ?? []), ...(data?.phone ?? [])];
      return all.map(mapFactor);
    },

    async enrollTotp(friendlyName = 'Viora Authenticator'): Promise<MfaEnrollResult> {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName,
      });
      if (error) throw new Error(toUserError(error));
      return {
        id: data.id,
        type: data.type,
        totp: data.totp
          ? {
              qr_code: data.totp.qr_code,
              secret: data.totp.secret,
              uri: data.totp.uri,
            }
          : undefined,
      };
    },

    async challengeAndVerify(factorId: string, code: string): Promise<void> {
      const challenge = await supabase.auth.mfa.challenge({ factorId });
      if (challenge.error) throw new Error(toUserError(challenge.error));
      const verify = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.data.id,
        code: code.trim(),
      });
      if (verify.error) throw new Error(toUserError(verify.error));
    },

    async unenrollFactor(factorId: string): Promise<void> {
      const { error } = await supabase.auth.mfa.unenroll({ factorId });
      if (error) throw new Error(toUserError(error));
    },

    async getAuthenticatorAssuranceLevel(): Promise<{
      currentLevel: string | null;
      nextLevel: string | null;
    }> {
      const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (error) throw new Error(toUserError(error));
      return {
        currentLevel: data.currentLevel,
        nextLevel: data.nextLevel,
      };
    },
  };
}

export type SecurityService = ReturnType<typeof createSecurityService>;
