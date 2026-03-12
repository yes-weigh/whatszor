import { z } from 'zod';

/** UUID validation */
export const UuidSchema = z.string().uuid();

/** Slug validation (lowercase alphanumeric with hyphens) */
export const SlugSchema = z
    .string()
    .min(3)
    .max(63)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Must be a valid slug (e.g. my-workspace)');

/** ISO8601 date string */
export const DateStringSchema = z.string().datetime();

/** Non-empty trimmed string */
export const NonEmptyStringSchema = z.string().trim().min(1);

/** Phone number in E.164 format */
export const PhoneSchema = z
    .string()
    .regex(/^\+[1-9]\d{6,14}$/, 'Must be a valid E.164 phone number (e.g. +919876543210)');

/** Email */
export const EmailSchema = z.string().email().toLowerCase();
