import { errorResponse } from './cors.ts';
import { sha256 } from './hash.ts';
import { IDENTITY_POLICY } from './identity-policy.ts';

export { IDENTITY_POLICY };

export const IDENTITY_PROVIDER = 'portone';

export type IdentityFailureCode =
  | 'CI_DUPLICATE'
  | 'IDENTITY_ALREADY_VERIFIED'
  | 'IDENTITY_LOCKED'
  | 'MISSING_VERIFIED_CUSTOMER'
  | 'PORTONE_LOOKUP_FAILED'
  | 'PORTONE_NOT_VERIFIED'
  | 'SDK_CANCELLED'
  | 'SDK_ERROR'
  | 'UNDERAGE';

export function getRequiredEnv(name: string) {
  const value = Deno.env.get(name);

  if (!value) {
    throw new Error(`${name} is not configured`);
  }

  return value;
}

export function codedErrorResponse(
  code: IdentityFailureCode | 'BAD_REQUEST' | 'METHOD_NOT_ALLOWED' | 'NOT_FOUND',
  message: string,
  status = 400,
  details: Record<string, unknown> = {},
) {
  return errorResponse(message, status, { code, ...details });
}

export async function hashIdentityValue(type: 'ci' | 'di', value?: string | null) {
  if (!value) {
    return null;
  }

  const salt = getRequiredEnv('PHONE_HASH_SALT');
  return sha256(`${salt}:${type}:${value}`);
}

export function toIdentityVerificationId() {
  return `dei${crypto.randomUUID().replaceAll('-', '')}`;
}

export function toGender(value?: string | null) {
  const normalized = value?.trim().toLowerCase().replace(/^gender_/, '');

  if (normalized === 'male' || normalized === 'm') {
    return 'male';
  }

  if (normalized === 'female' || normalized === 'f') {
    return 'female';
  }

  return null;
}

export function toBirthDate(customer: {
  birthDate?: string | null;
  birthDay?: number | string | null;
  birthMonth?: number | string | null;
  birthYear?: number | string | null;
}) {
  if (customer.birthDate) {
    return customer.birthDate;
  }

  if (!customer.birthYear || !customer.birthMonth || !customer.birthDay) {
    return null;
  }

  const year = String(customer.birthYear).padStart(4, '0');
  const month = String(customer.birthMonth).padStart(2, '0');
  const day = String(customer.birthDay).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getBirthYear(birthDate: string | null, fallback?: number | string | null) {
  if (birthDate) {
    const year = Number(birthDate.slice(0, 4));
    return Number.isFinite(year) ? year : null;
  }

  if (fallback == null) {
    return null;
  }

  const year = Number(fallback);
  return Number.isFinite(year) ? year : null;
}

export function isAdult(birthDate: string | null, birthYear: number | null, now = new Date()) {
  if (birthDate) {
    const [year, month, day] = birthDate.split('-').map(Number);

    if (Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)) {
      const threshold = new Date(Date.UTC(year + IDENTITY_POLICY.minAge, month - 1, day));
      return now.getTime() >= threshold.getTime();
    }
  }

  if (birthYear == null) {
    return false;
  }

  return now.getUTCFullYear() - birthYear >= IDENTITY_POLICY.minAge;
}

export function getLockUntil(now = new Date()) {
  return new Date(
    now.getTime() + IDENTITY_POLICY.lockoutHours * 60 * 60 * 1000,
  ).toISOString();
}

export function getFailureWindowStart(now = new Date()) {
  return new Date(
    now.getTime() - IDENTITY_POLICY.lockoutHours * 60 * 60 * 1000,
  ).toISOString();
}
