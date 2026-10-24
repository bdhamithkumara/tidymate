import type { FileKind } from "@/types/files";

const COMPOUND_EXTENSIONS = ["tar.gz", "tar.bz2", "tar.xz", "tar.zst"] as const;

const KIND_BY_EXTENSION: Record<string, FileKind> = {};

function register(kind: FileKind, extensions: readonly string[]) {
  for (const extension of extensions) {
    KIND_BY_EXTENSION[extension] = kind;
  }
}

register("document", [
  "pdf", "doc", "docx", "odt", "rtf", "txt", "md", "markdown", "pages", "epub", "tex",
]);
register("spreadsheet", ["xls", "xlsx", "ods", "csv", "tsv", "numbers"]);
register("presentation", ["ppt", "pptx", "odp", "key"]);
register("image", [
  "jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "tif", "tiff", "heic", "heif", "avif", "ico", "raw", "psd",
]);
register("video", ["mp4", "mov", "mkv", "avi", "webm", "m4v", "wmv", "flv"]);
register("audio", ["mp3", "wav", "flac", "aac", "ogg", "m4a", "opus", "wma"]);
register("archive", [
  "zip", "rar", "7z", "tar", "gz", "bz2", "xz", "zst", "tgz", ...COMPOUND_EXTENSIONS,
]);
register("code", [
  "js", "jsx", "ts", "tsx", "mjs", "cjs", "json", "yaml", "yml", "toml", "xml", "html", "css", "scss",
  "py", "rb", "go", "rs", "java", "kt", "c", "h", "cpp", "hpp", "cs", "php", "swift", "sh", "ps1", "sql", "ipynb",
]);
register("installer", ["exe", "msi", "dmg", "pkg", "deb", "rpm", "appimage", "apk", "iso"]);
register("font", ["ttf", "otf", "woff", "woff2"]);

/**
 * Lowercase extension without the leading dot. Dotfiles such as `.env` have
 * no extension; common compound archive extensions are kept whole.
 */
export function getExtension(fileName: string): string {
  const lower = fileName.toLowerCase();
  const lastDot = lower.lastIndexOf(".");
  if (lastDot <= 0 || lastDot === lower.length - 1) {
    return "";
  }

  for (const compound of COMPOUND_EXTENSIONS) {
    if (lower.endsWith(`.${compound}`) && lower.length > compound.length + 1) {
      return compound;
    }
  }

  return lower.slice(lastDot + 1);
}

export function getFileKind(extension: string): FileKind {
  return KIND_BY_EXTENSION[extension.toLowerCase()] ?? "other";
}

export const FILE_KIND_LABELS: Record<FileKind, string> = {
  document: "Document",
  spreadsheet: "Spreadsheet",
  presentation: "Presentation",
  image: "Image",
  video: "Video",
  audio: "Audio",
  archive: "Archive",
  code: "Code",
  installer: "Installer",
  font: "Font",
  other: "Other",
};
