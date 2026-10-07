// The one upload path: every photo, PDF, and voice note a party sends (on a
// Job, for Verification, on a Completion, in a message) reaches R2 through
// here, and only if its type, its size, and where it is going allow it. A file
// is known by its bytes, never by the name or type its sender gives it.
// Nothing is stored until every check has passed.

import type { Context } from "../context";
import { MESSAGE_ATTACHMENTS_MAX } from "../conversations/inputs";
import { COMPLETION_DOCUMENTS_MAX, COMPLETION_PHOTOS_MAX } from "../engagements/inputs";
import { PROFILE_PHOTOS_MAX } from "../profiles/inputs";
import { ok, refuse, type Result } from "../result";
import { Locked, startsWith, Unreadable } from "./bytes";
import { mediaContainer, readMedia, type MediaContainer } from "./media";
import { hasActiveContent, isPdf } from "./pdf";
import { drawPhoto, MAX_PHOTO_PIXELS, photoFormat, readPhotoHeader } from "./photos";

/** The most bytes any file may have: 10 MB (MiB, so a file a phone shows as "10 MB" fits). */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_VOICE_NOTE_SECONDS = 5 * 60;

export type FileKind = "photo" | "pdf" | "voice-note";

/** Which kinds of file the place the file is going takes; the caller knows. */
export type UploadContext = { takes: readonly FileKind[] };

export const UPLOAD_CONTEXTS = {
  /** A Job, or a Conversation before Payment: what is sent may reach a stranger. */
  beforePayment: { takes: ["photo"] },
  /** An Engagement's Conversation. */
  afterPayment: { takes: ["photo", "pdf", "voice-note"] },
  /** A Completion's after-work photos. */
  afterWorkPhotos: { takes: ["photo"] },
  /** A Completion's documents, such as its certificate: a photo or a scan of one, or a PDF. */
  completionDocuments: { takes: ["photo", "pdf"] },
  /** Verification documents, which only the Admin sees. */
  verification: { takes: ["photo", "pdf"] },
} as const satisfies Record<string, UploadContext>;

export type StoredFile =
  | {
      kind: "photo";
      id: string;
      /** The copy for viewing, at most 2048 pixels on its long side. */
      key: string;
      thumbnailKey: string;
      width: number;
      height: number;
    }
  | { kind: "pdf"; id: string; key: string }
  | { kind: "voice-note"; id: string; key: string; seconds: number };

export type UploadRefusal =
  | "too-large"
  | "too-long"
  | "video"
  | "script"
  | "type-not-taken"
  | "not-taken-here"
  | "unreadable";

const VOICE_NOTE_TYPES: Record<MediaContainer, { contentType: string; extension: string }> = {
  webm: { contentType: "audio/webm", extension: "webm" },
  ogg: { contentType: "audio/ogg", extension: "ogg" },
  mp4: { contentType: "audio/mp4", extension: "m4a" },
};

export async function uploadFile(
  ctx: Context,
  file: Blob,
  where: UploadContext,
): Promise<Result<StoredFile, UploadRefusal>> {
  // Checked before a byte is read.
  if (file.size > MAX_FILE_BYTES) return refuse("too-large", "A file can be at most 10 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    return await upload(ctx, bytes, where);
  } catch (error) {
    if (error instanceof Locked) {
      return refuse(
        "unreadable",
        "This PDF is locked, so it cannot be read. Save it again without a password, for example with Print, then Save as PDF.",
      );
    }
    if (error instanceof Unreadable) {
      return refuse("unreadable", "This file is damaged, so it cannot be read.");
    }
    throw error;
  }
}

async function upload(
  ctx: Context,
  bytes: Uint8Array<ArrayBuffer>,
  where: UploadContext,
): Promise<Result<StoredFile, UploadRefusal>> {
  const photo = photoFormat(bytes);
  if (photo) {
    const header = readPhotoHeader(bytes, photo);
    if (header.animated) return refuseVideo();
    if (!where.takes.includes("photo")) return refuseHere(where);
    if (header.width * header.height > MAX_PHOTO_PIXELS) {
      return refuse("too-large", "A photo can be at most 12 megapixels.");
    }
    const drawn = await drawPhoto(bytes, photo);
    const id = ctx.newId();
    const stored = {
      kind: "photo" as const,
      id,
      key: `photos/${id}.webp`,
      thumbnailKey: `photos/${id}-thumbnail.webp`,
      width: drawn.width,
      height: drawn.height,
    };
    const puts = await Promise.allSettled([
      put(ctx, stored.key, drawn.copy, "image/webp", "photo"),
      put(ctx, stored.thumbnailKey, drawn.thumbnail, "image/webp", "photo"),
    ]);
    const failed = puts.find((p) => p.status === "rejected");
    if (failed) {
      // Never leave half a photo behind.
      await ctx.ports.files.delete([stored.key, stored.thumbnailKey]).catch(() => {});
      throw failed.reason;
    }
    return ok(stored);
  }

  const container = mediaContainer(bytes);
  if (container) {
    const media = readMedia(bytes, container);
    if (media.kind === "video") return refuseVideo();
    if (media.kind === "other") return refuseType();
    if (!where.takes.includes("voice-note")) return refuseHere(where);
    if (media.seconds > MAX_VOICE_NOTE_SECONDS) {
      return refuse("too-long", "A voice note can be at most 5 minutes.");
    }
    const id = ctx.newId();
    const { contentType, extension } = VOICE_NOTE_TYPES[media.container];
    const key = `voice-notes/${id}.${extension}`;
    await put(ctx, key, bytes, contentType, "voice-note");
    return ok({ kind: "voice-note", id, key, seconds: media.seconds });
  }

  if (isPdf(bytes)) {
    if (!where.takes.includes("pdf")) return refuseHere(where);
    if (await hasActiveContent(bytes)) {
      return refuse("script", "This PDF holds a script or another file, so it cannot be sent.");
    }
    const id = ctx.newId();
    const key = `pdfs/${id}.pdf`;
    await put(ctx, key, bytes, "application/pdf", "pdf");
    return ok({ kind: "pdf", id, key });
  }

  if (isVideo(bytes)) return refuseVideo();
  if (isMarkup(bytes)) {
    return refuse(
      "script",
      "A file that can carry a script, such as an SVG or a web page, cannot be sent.",
    );
  }
  return refuseType();
}

function put(
  ctx: Context,
  key: string,
  bytes: Uint8Array,
  contentType: string,
  kind: StoredFile["kind"],
) {
  return ctx.ports.files.put(key, bytes, {
    httpMetadata: { contentType },
    customMetadata: { kind },
  });
}

function refuseVideo() {
  return refuse("video", "Video cannot be sent.");
}

function refuseType() {
  return refuse("type-not-taken", "Send a photo (JPEG, PNG, or WebP), a PDF, or a voice note.");
}

const KIND_NAMES: Record<FileKind, string> = {
  photo: "photos",
  pdf: "PDFs",
  "voice-note": "voice notes",
};

/** "Only photos and PDFs can be sent here." */
function refuseHere(where: UploadContext) {
  const names = where.takes.map((kind) => KIND_NAMES[kind]);
  const list =
    names.length > 1
      ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`
      : (names[0] ?? "no files");
  return refuse("not-taken-here", `Only ${list} can be sent here.`);
}

/** Video containers that hold nothing else: AVI, FLV, Windows Media, and MPEG. */
function isVideo(bytes: Uint8Array): boolean {
  return (
    (startsWith(bytes, "RIFF") && startsWith(bytes, "AVI ", 8)) ||
    startsWith(bytes, "FLV") ||
    startsWith(bytes, [0x30, 0x26, 0xb2, 0x75, 0x8e, 0x66, 0xcf, 0x11]) ||
    startsWith(bytes, [0x00, 0x00, 0x01, 0xba]) ||
    // MPEG transport stream: a sync byte every 188 bytes.
    [0, 188, 376].every((at) => bytes[at] === 0x47)
  );
}

/** SVG, HTML, and XML start with a tag, after any byte-order mark and spaces. */
function isMarkup(bytes: Uint8Array): boolean {
  let at = startsWith(bytes, [0xef, 0xbb, 0xbf]) ? 3 : 0;
  while (at < bytes.length && [0x09, 0x0a, 0x0d, 0x20].includes(bytes[at]!)) at++;
  return bytes[at] === 0x3c; // "<"
}

// How many files one thing may hold

/** The caller counts what the thing holds, plus what it is adding, and checks before uploading. */
export const FILE_COUNT_LIMITS = {
  jobPhotos: { max: 10, message: "A Job has at most 10 photos." },
  completionPhotos: {
    max: COMPLETION_PHOTOS_MAX,
    message: `A Completion has at most ${COMPLETION_PHOTOS_MAX} photos.`,
  },
  completionDocuments: {
    max: COMPLETION_DOCUMENTS_MAX,
    message: `A Completion has at most ${COMPLETION_DOCUMENTS_MAX} documents.`,
  },
  messageAttachments: {
    max: MESSAGE_ATTACHMENTS_MAX,
    message: `A message has at most ${MESSAGE_ATTACHMENTS_MAX} attachments.`,
  },
  profilePhotos: {
    max: PROFILE_PHOTOS_MAX,
    message: `A Profile has at most ${PROFILE_PHOTOS_MAX} photos.`,
  },
} as const;

export type FileCountLimit = keyof typeof FILE_COUNT_LIMITS;

export function checkFileCount(
  limit: FileCountLimit,
  count: number,
): Result<null, "too-many-files"> {
  const { max, message } = FILE_COUNT_LIMITS[limit];
  return count > max ? refuse("too-many-files", message) : ok(null);
}
