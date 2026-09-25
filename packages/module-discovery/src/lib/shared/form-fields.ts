import { z } from "zod";

/**
 * Zod field helpers for form input at the server boundary, shared by the Marketing and
 * Funding schemas. Blank form fields arrive as "" — each helper turns that into null, so
 * "not entered" stays distinguishable from a real value (a 0, a date) all the way down.
 */

export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const optionalUuid = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null))
  .pipe(z.uuid().nullable());

export const optionalDate = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || !Number.isNaN(new Date(v).getTime()), "Enter a valid date.");

export const optionalUrl = z
  .string()
  .trim()
  .max(2000)
  .optional()
  .nullable()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^https?:\/\//i.test(v), "Links must start with http:// or https://.");

export const optionalMoney = z
  .union([z.number(), z.string()])
  .optional()
  .nullable()
  .transform((v, ctx) => {
    if (v === null || v === undefined || v === "") return null;
    const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, "").trim());
    if (!Number.isFinite(n)) {
      ctx.addIssue({ code: "custom", message: "Enter a number." });
      return z.NEVER;
    }
    if (n < 0) {
      ctx.addIssue({ code: "custom", message: "Amounts cannot be negative." });
      return z.NEVER;
    }
    return Math.round(n * 100) / 100;
  });

export const optionalCount = z
  .union([z.number(), z.string()])
  .optional()
  .nullable()
  .transform((v, ctx) => {
    if (v === null || v === undefined || v === "") return null;
    const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, "").trim());
    if (!Number.isInteger(n) || n < 0) {
      ctx.addIssue({ code: "custom", message: "Counts must be whole numbers, zero or more." });
      return z.NEVER;
    }
    return n;
  });

export const currency = z
  .string()
  .trim()
  .toUpperCase()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^[A-Z]{3}$/.test(v), "Use a three-letter currency code such as INR.");

export const lines = (max: number) =>
  z
    .string()
    .optional()
    .nullable()
    .transform((v) =>
      (v ?? "")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, max),
    );

