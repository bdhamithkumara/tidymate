/**
 * How many files are sent to the model per request. Gemma 3 4B writes roughly
 * 35 tokens per suggestion, and CPU-only machines may manage only a few tokens
 * per second, so this keeps a full answer to about a thousand tokens.
 */
export const MAX_FILES_FOR_SUGGESTIONS = 30;

/** Deepest proposed path, counted in segments including the file name. */
export const MAX_DESTINATION_SEGMENTS = 3;

export const MAX_RELATIVE_PATH_LENGTH = 1024;

export const MAX_REASON_LENGTH = 300;
