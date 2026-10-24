import { z } from "zod";

/** Strips one pair of surrounding quotes, as added by Windows "Copy as path". */
function unquote(value: string): string {
  const match = /^(["'])([\s\S]*)\1$/.exec(value);
  return match ? (match[2] ?? "").trim() : value;
}

export const scanRequestSchema = z.object({
  folderPath: z
    .string()
    .trim()
    .transform(unquote)
    .pipe(
      z
        .string()
        .min(1)
        .max(4096)
        .refine((value) => !value.includes("\0")),
    ),
});

export type ScanRequest = z.infer<typeof scanRequestSchema>;
