import type { AdminMigrationState, AdminQueryValue } from './types';

const DEFAULT_ADMIN_LIMIT = 200;
const DEFAULT_ADMIN_PAGE = 1;
const MAX_ADMIN_LIMIT = 1000;

const normalizeAdminQueryValue = (value: AdminQueryValue): string | undefined => {
  if (Array.isArray(value)) {
    return value[0];
  }

  if (typeof value === 'number') {
    return String(value);
  }

  if (typeof value === 'string') {
    return value;
  }

  return undefined;
};

const parsePositiveInteger = (value: AdminQueryValue, fallback: number): number => {
  const normalizedValue = normalizeAdminQueryValue(value);
  const parsedValue = Number.parseInt(normalizedValue ?? '', 10);

  if (Number.isNaN(parsedValue) || parsedValue <= 0) {
    return fallback;
  }

  return parsedValue;
};

export const parseAdminLimit = (value: AdminQueryValue, fallback = DEFAULT_ADMIN_LIMIT): number => {
  return Math.min(parsePositiveInteger(value, fallback), MAX_ADMIN_LIMIT);
};

export const parseAdminPage = (value: AdminQueryValue, fallback = DEFAULT_ADMIN_PAGE): number => {
  return parsePositiveInteger(value, fallback);
};

export const parseAdminSearch = (value: AdminQueryValue): string => {
  return normalizeAdminQueryValue(value)?.trim() ?? '';
};

export const hasAdminValue = (value: unknown): boolean => {
  if (value == null) {
    return false;
  }

  if (typeof value === 'string') {
    return value.trim().length > 0;
  }

  return true;
};

export const toIntegerOrFallback = (
  value: number | string | null | undefined,
  fallback: number,
): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value !== 'string') {
    return fallback;
  }

  const parsedValue = Number.parseInt(value, 10);
  if (Number.isNaN(parsedValue)) {
    return fallback;
  }

  return parsedValue;
};

export const toBooleanOrFallback = (
  value: boolean | number | string | null | undefined,
  fallback = false,
): boolean => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  if (typeof value !== 'string') {
    return fallback;
  }

  const normalizedValue = value.toLowerCase().trim();
  if (['true', '1', 'yes', 'on'].includes(normalizedValue)) {
    return true;
  }

  if (['false', '0', 'no', 'off'].includes(normalizedValue)) {
    return false;
  }

  return fallback;
};

export const createAdminTotalPages = (limit: number, totalItems: number): number => {
  return Math.max(Math.ceil(totalItems / limit), 1);
};

export const escapeAdminRegExp = (value = ''): string => {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

export const toAdminDateString = (value: Date | string | null | undefined): string | null => {
  if (value == null) {
    return null;
  }

  const dateValue = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(dateValue.getTime())) {
    return null;
  }

  return dateValue.toISOString();
};

export const createAdminMigrationState = (
  source: string,
  nextStep: string,
): AdminMigrationState => {
  return {
    lot: 1,
    stage: 'skeleton',
    source,
    nextStep,
  };
};
