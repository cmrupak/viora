import { handlePasswordOtp, type PasswordOtpRequest } from './_lib/passwordOtp';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type NetlifyEvent = {
  httpMethod: string;
  body: string | null;
};

export async function handler(event: NetlifyEvent) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, message: 'Method not allowed' }),
    };
  }

  try {
    const body = JSON.parse(event.body || '{}') as PasswordOtpRequest;
    const result = await handlePasswordOtp(body);
    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(result),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to process request.';
    return {
      statusCode: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, message }),
    };
  }
}
