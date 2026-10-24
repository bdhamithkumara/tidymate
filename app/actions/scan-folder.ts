"use server";

import { headers } from "next/headers";

import { scanRequestSchema } from "@/lib/files/scan-request";
import { ScanError, toScanFailure } from "@/lib/server/files/errors";
import { scanDirectory } from "@/lib/server/files/scanner";
import { isLoopbackRequest } from "@/lib/server/local-request";
import type { ScanFailure, ScanResult } from "@/types/files";

export type ScanActionState =
  | { status: "idle" }
  | { status: "success"; folderPath: string; result: ScanResult }
  | { status: "error"; folderPath: string; error: ScanFailure };

/**
 * Read-only: scans a folder the user explicitly typed in and returns metadata.
 * It never opens, modifies, moves or uploads files.
 */
export async function scanFolderAction(
  _previous: ScanActionState,
  formData: FormData,
): Promise<ScanActionState> {
  const rawPath = formData.get("folderPath");
  const folderPath = typeof rawPath === "string" ? rawPath : "";

  try {
    if (!isLoopbackRequest(await headers())) {
      throw new ScanError("NOT_LOCAL");
    }

    const parsed = scanRequestSchema.safeParse({ folderPath });
    if (!parsed.success) {
      throw new ScanError("INVALID_PATH");
    }

    const result = await scanDirectory(parsed.data.folderPath);
    return { status: "success", folderPath, result };
  } catch (error) {
    if (!(error instanceof ScanError)) {
      console.error("[tidymate] unexpected scan failure", error);
    }
    return { status: "error", folderPath, error: toScanFailure(error) };
  }
}
