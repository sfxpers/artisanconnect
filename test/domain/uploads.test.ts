import { describe, expect, test } from "vitest";
import chromeVideoMp4 from "../fixtures/chrome-video.mp4?inline";
import chromeVideoWebm from "../fixtures/chrome-video.webm?inline";
import chromeVoiceMp4 from "../fixtures/chrome-voice-note.mp4?inline";
import chromeVoiceWebm from "../fixtures/chrome-voice-note.webm?inline";
import certificatePdf from "../fixtures/certificate.pdf?inline";
import heicPhoto from "../fixtures/photo.heic?inline";
import macVoiceMemo from "../fixtures/macos-voice-memo.m4a?inline";
import {
  animatedWebpHeader,
  BLUE,
  cameraJpeg,
  decodeStoredWebp,
  fixture,
  fragmentedM4a,
  m4a,
  oggOpus,
  paddedTo,
  pdf,
  pixelAt,
  png,
  pngHeader,
  RED,
  riffChunks,
  webmOpus,
  webp,
  webpUnderstatingItsSize,
  withFillByte,
} from "../support/files";
import { createUploadsHarness } from "../support/uploads";

// The one upload path: a file reaches R2 only if its type, size, and where it
// is going allow it. Tests drive it through a probe caller
// (test/support/uploads.ts) and look at what local R2 then holds.

const client = { kind: "client", accountId: "client-1" } as const;
const MB = 1024 * 1024;
const beforePayment = { afterPayment: false };
const afterPayment = { afterPayment: true };

function file(bytes: Uint8Array<ArrayBuffer> | string, name = "upload", type = "") {
  return new File([bytes], name, { type });
}

async function upload(bytes: Uint8Array<ArrayBuffer> | string, where = afterPayment) {
  const harness = await createUploadsHarness();
  const result = await harness.domain.uploadsProbe.upload(client, { file: file(bytes), ...where });
  return { ...harness, result };
}

async function expectRefused(
  bytes: Uint8Array<ArrayBuffer> | string,
  reason: string,
  where = afterPayment,
) {
  const { result, stored } = await upload(bytes, where);
  expect(result).toMatchObject({ ok: false, refusal: { reason } });
  expect(await stored()).toEqual([]);
}

/** Every metadata chunk a WebP may carry; a stored photo has none. */
const METADATA_CHUNKS = ["EXIF", "XMP ", "ICCP"];

describe("a photo", () => {
  test("is stored as one resized copy and a thumbnail, with its location data stripped", async () => {
    const { result, stored, read } = await upload(await cameraJpeg(3000, 1500), beforePayment);

    expect(result).toMatchObject({ ok: true, value: { kind: "photo", width: 2048, height: 1024 } });
    if (!result.ok || result.value.kind !== "photo") return;
    const objects = await stored();
    expect(objects.map((o) => o.key).sort()).toEqual(
      [result.value.key, result.value.thumbnailKey].sort(),
    );
    for (const object of objects) {
      expect(object.httpMetadata?.contentType).toBe("image/webp");
      expect(riffChunks(await read(object.key))).not.toEqual(
        expect.arrayContaining([expect.stringMatching(new RegExp(METADATA_CHUNKS.join("|")))]),
      );
    }
    const copy = await decodeStoredWebp((await read(result.value.key)).buffer as ArrayBuffer);
    const thumbnail = await decodeStoredWebp(
      (await read(result.value.thumbnailKey)).buffer as ArrayBuffer,
    );
    expect([copy.width, copy.height]).toEqual([2048, 1024]);
    expect([thumbnail.width, thumbnail.height]).toEqual([400, 200]);
  });

  test.each([
    ["PNG", () => png(640, 480)],
    ["WebP", () => webp(640, 480)],
  ])("is accepted as %s", async (_, make) => {
    const { result, stored } = await upload(await make(), beforePayment);

    expect(result).toMatchObject({ ok: true, value: { kind: "photo", width: 640, height: 480 } });
    expect(await stored()).toHaveLength(2);
  });

  test("is turned the way the camera was held", async () => {
    // Orientation 6: the camera was turned a quarter clockwise, so the left of the sensor is the top.
    const { result, read } = await upload(await cameraJpeg(80, 40, { orientation: 6 }));

    if (!result.ok || result.value.kind !== "photo") throw new Error("not stored");
    const copy = await decodeStoredWebp((await read(result.value.key)).buffer as ArrayBuffer);
    expect([copy.width, copy.height]).toEqual([40, 80]);
    expect(closeTo(pixelAt(copy, 20, 10), RED)).toBe(true);
    expect(closeTo(pixelAt(copy, 20, 70), BLUE)).toBe(true);
  });

  test("is never enlarged", async () => {
    const { result, read } = await upload(await png(300, 200));

    if (!result.ok || result.value.kind !== "photo") throw new Error("not stored");
    const thumbnail = await decodeStoredWebp(
      (await read(result.value.thumbnailKey)).buffer as ArrayBuffer,
    );
    expect(result.value).toMatchObject({ width: 300, height: 200 });
    expect([thumbnail.width, thumbnail.height]).toEqual([300, 200]);
  });

  test("of 10 MB is accepted, and one byte more is refused before anything is stored", async () => {
    const photo = await cameraJpeg(64, 64);

    expect((await upload(paddedTo(photo, 10 * MB))).result).toMatchObject({ ok: true });
    await expectRefused(paddedTo(photo, 10 * MB + 1), "too-large");
  });

  test("with more pixels than can be read is refused", async () => {
    await expectRefused(pngHeader(6000, 4001), "too-large");
  });

  test("is measured by its image, not a smaller size its header claims", async () => {
    await expectRefused(webpUnderstatingItsSize(), "too-large");
  });

  test("with a fill byte before a marker is read", async () => {
    expect((await upload(withFillByte(await cameraJpeg(64, 64)))).result).toMatchObject({
      ok: true,
    });
  });

  test("that is damaged is refused", async () => {
    await expectRefused(
      new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 1, 2, 9, 9, 9, 9]),
      "unreadable",
    );
  });
});

describe("a PDF", () => {
  test("of up to 10 MB is accepted after Payment, and stored as sent", async () => {
    const certificate = fixture(certificatePdf);

    const { result, stored, read } = await upload(certificate, afterPayment);

    expect(result).toMatchObject({ ok: true, value: { kind: "pdf" } });
    const [object] = await stored();
    expect(object?.httpMetadata?.contentType).toBe("application/pdf");
    expect(await read(object!.key)).toEqual(certificate);
    expect((await upload(paddedTo(certificate, 10 * MB))).result).toMatchObject({ ok: true });
    await expectRefused(paddedTo(certificate, 10 * MB + 1), "too-large");
  });

  test("is refused before Payment", async () => {
    await expectRefused(fixture(certificatePdf), "after-payment-only", beforePayment);
  });

  test.each(["plain", "escaped", "object-stream"] as const)(
    "carrying a script (%s) is refused",
    async (script) => {
      await expectRefused(await pdf({ script }), "script");
    },
  );

  test.each(["flate-then-hex", "predictor"] as const)(
    "whose object stream cannot be unpacked to check (%s) is refused",
    async (packing) => {
      await expectRefused(await pdf({ script: "object-stream", packing }), "unreadable");
    },
  );

  test("that is locked is refused, since it cannot be read", async () => {
    expect((await upload(await pdf())).result).toMatchObject({ ok: true });
    await expectRefused(await pdf({ encrypted: true }), "unreadable");
  });
});

describe("a voice note", () => {
  test.each([
    // About 1.5 seconds each; Chrome's MP4 states almost none of it, so it is read from the fragments.
    ["recorded in Chrome (WebM)", chromeVoiceWebm, "audio/webm", 1.38],
    ["recorded in Chrome (MP4)", chromeVoiceMp4, "audio/mp4", 1.46],
    ["saved by a voice recorder (M4A)", macVoiceMemo, "audio/mp4", 1.16],
  ])("%s is accepted after Payment", async (_, recording, contentType, seconds) => {
    const { result, stored } = await upload(fixture(recording), afterPayment);

    expect(result).toMatchObject({ ok: true, value: { kind: "voice-note" } });
    if (!result.ok || result.value.kind !== "voice-note") return;
    expect(result.value.seconds).toBeCloseTo(seconds, 1);
    expect((await stored())[0]?.httpMetadata?.contentType).toBe(contentType);
  });

  test.each([
    ["WebM", webmOpus],
    ["Ogg", oggOpus],
    ["M4A", m4a],
  ])("of up to 5 minutes is accepted as %s, and longer is refused", async (_, make) => {
    expect((await upload(make(300))).result).toMatchObject({ ok: true });
    await expectRefused(make(301), "too-long");
  });

  test("whose length is only in its fragments is measured from them", async () => {
    const fiveMinutes = Math.floor((300 * 44_100) / 1024);

    expect((await upload(fragmentedM4a(fiveMinutes))).result).toMatchObject({ ok: true });
    await expectRefused(fragmentedM4a(fiveMinutes + 50), "too-long");
    // Four billion samples are added up, not counted one by one.
    await expectRefused(fragmentedM4a(0xffffffff), "too-long");
  });

  test("is refused before Payment", async () => {
    await expectRefused(fixture(chromeVoiceWebm), "after-payment-only", beforePayment);
  });
});

describe("video", () => {
  const videos = [
    ["recorded in Chrome (WebM)", () => fixture(chromeVideoWebm)],
    ["recorded in Chrome (MP4)", () => fixture(chromeVideoMp4)],
    ["in WebM", () => webmOpus(10, { video: true })],
    ["in Ogg", () => oggOpus(10, { video: true })],
    ["in M4A", () => m4a(10, { video: true })],
    ["as an animated WebP", animatedWebpHeader],
  ] as const;

  test.each(videos)("%s is refused after Payment", async (_, make) => {
    await expectRefused(make(), "video", afterPayment);
  });

  test.each(videos)("%s is refused before Payment", async (_, make) => {
    await expectRefused(make(), "video", beforePayment);
  });
});

describe("a type that can carry a script", () => {
  test.each([
    [
      "an SVG",
      '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    ],
    ["a web page", "﻿  <!doctype html><html><script>alert(1)</script></html>"],
  ])("such as %s is refused everywhere", async (_, text) => {
    await expectRefused(text, "script", beforePayment);
    await expectRefused(text, "script", afterPayment);
  });

  test("is refused whatever name and type it claims", async () => {
    const harness = await createUploadsHarness();

    const result = await harness.domain.uploadsProbe.upload(client, {
      file: file("<html><script>alert(1)</script></html>", "geyser.jpg", "image/jpeg"),
      ...afterPayment,
    });

    expect(result).toMatchObject({ ok: false, refusal: { reason: "script" } });
  });
});

describe("any other type", () => {
  test.each([
    ["a HEIC photo", () => fixture(heicPhoto)],
    ["a GIF", () => new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0, 0, 0, 0])],
    ["a script file", () => "alert(document.cookie)"],
    ["a Windows program", () => new Uint8Array([0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0])],
  ])("such as %s is refused", async (_, make) => {
    await expectRefused(make(), "type-not-taken");
  });
});

describe("count limits, enforced by the caller", () => {
  const tinyPhoto = async () => file(await png(8, 8));

  async function attachMany(
    limit: Parameters<typeof attach>[1],
    count: number,
    where = afterPayment,
  ) {
    const harness = await createUploadsHarness();
    const files = await Promise.all(Array.from({ length: count }, tinyPhoto));
    const first = await attach(harness, limit, files, where);
    const next = await attach(harness, limit, [await tinyPhoto()], where);
    return { ...harness, first, next };
  }

  async function attach(
    harness: Awaited<ReturnType<typeof createUploadsHarness>>,
    limit: "jobPhotos" | "completionPhotos" | "completionDocuments" | "messageAttachments",
    files: File[],
    where: { afterPayment: boolean },
  ) {
    return harness.domain.uploadsProbe.attach(client, { to: "thing-1", limit, files, ...where });
  }

  test.each([
    ["10 photos on a Job", "jobPhotos", 10, "A Job has at most 10 photos."],
    ["10 photos on a Completion", "completionPhotos", 10, "A Completion has at most 10 photos."],
    [
      "5 documents on a Completion",
      "completionDocuments",
      5,
      "A Completion has at most 5 documents.",
    ],
    ["5 attachments on a message", "messageAttachments", 5, "A message has at most 5 attachments."],
  ] as const)("allow %s and no more", async (_, limit, max, message) => {
    const { first, next, stored } = await attachMany(limit, max);

    expect(first).toEqual({ ok: true, value: max });
    expect(next).toEqual({ ok: false, refusal: { reason: "too-many-files", message } });
    expect(await stored()).toHaveLength(max * 2);
  });

  test("refuse a batch that would go over before any of it is stored", async () => {
    const harness = await createUploadsHarness();
    const files = await Promise.all(Array.from({ length: 6 }, tinyPhoto));

    const result = await attach(harness, "messageAttachments", files, afterPayment);

    expect(result).toMatchObject({ ok: false, refusal: { reason: "too-many-files" } });
    expect(await harness.stored()).toEqual([]);
  });
});

function closeTo(actual: number[], expected: number[], tolerance = 40) {
  return actual.every((value, i) => Math.abs(value - expected[i]!) <= tolerance);
}
