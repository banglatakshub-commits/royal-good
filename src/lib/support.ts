import { z } from "zod";

export const supportUsernameSchema = z
  .string()
  .trim()
  .max(33)
  .transform((value) => value.replace(/^@/, ""))
  .pipe(
    z
      .string()
      .regex(/^(?:[A-Za-z][A-Za-z0-9_]{4,31})?$/, "সঠিক টেলিগ্রাম ইউজারনেম দিন (যেমন @username)।"),
  );
