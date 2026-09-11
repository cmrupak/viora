import type { SupabaseClient } from '@supabase/supabase-js';
import { toUserError } from './errors';
import type { Report, ReportTargetType } from './types';

export type CreateReportInput = {
  reporterId: string;
  targetType: ReportTargetType;
  targetId: string;
  reason: string;
  details?: string | null;
};

export function createReportsService(supabase: SupabaseClient) {
  return {
    async create(input: CreateReportInput): Promise<Report> {
      const reason = input.reason.trim();
      if (!reason) throw new Error('Please provide a reason for the report.');

      const { data, error } = await supabase
        .from('reports')
        .insert({
          reporter_id: input.reporterId,
          target_type: input.targetType,
          target_id: input.targetId,
          reason,
          details: input.details?.trim() || null,
        })
        .select('id, reporter_id, target_type, target_id, reason, details, status, created_at')
        .single();

      if (error) throw new Error(toUserError(error));

      const row = data as Record<string, unknown>;
      return {
        id: String(row.id),
        reporterId: String(row.reporter_id),
        targetType: row.target_type as ReportTargetType,
        targetId: String(row.target_id),
        reason: String(row.reason),
        details: row.details == null ? null : String(row.details),
        status: (row.status as Report['status']) ?? 'open',
        createdAt: String(row.created_at ?? ''),
      };
    },
  };
}

export type ReportsService = ReturnType<typeof createReportsService>;
