'use server';

import { cookies } from 'next/headers';
import { ACCESS_COOKIE, accessMaxAge, passcodeMatches, tokenFor } from '@/lib/auth';
import { getConfig } from '@/lib/config';

export interface GateState {
  error?: string;
}

/**
 * Checks a submitted passcode and, if it is right, remembers the device.
 *
 * The cookie is httpOnly so page scripts cannot read it, and lax rather than
 * strict so following the link from WhatsApp still arrives unlocked.
 */
export async function submitPasscode(_prev: GateState, formData: FormData): Promise<GateState> {
  const { passcode } = getConfig().site;
  if (!passcode) return {};

  const candidate = String(formData.get('passcode') ?? '');

  // A small delay blunts brute forcing without being noticeable to someone
  // typing a passcode they know.
  await new Promise((resolve) => setTimeout(resolve, 300));

  if (!passcodeMatches(candidate)) {
    return { error: 'That passcode is not right. Ask whoever runs the league.' };
  }

  (await cookies()).set(ACCESS_COOKIE, tokenFor(passcode), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: accessMaxAge(),
  });

  return {};
}
