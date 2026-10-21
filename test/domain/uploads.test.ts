import { describe, expect, test } from "vite-plus/test";
import chromeVideoMp4 from "../fixtures/chrome-video.mp4?inline";
import chromeVideoWebm from "../fixtures/chrome-video.webm?inline";
import chromeVoiceMp4 from "../fixtures/chrome-voice-note.mp4?inline";
import chromeVoiceWebm from "../fixtures/chrome-voice-note.webm?inline";
import bankLetterAes128 from "../fixtures/bank-letter-aes-128.pdf?inline";
import bankLetterPasswordAes from "../fixtures/bank-letter-password-aes.pdf?inline";
import bankLetterPasswordRc4 from "../fixtures/bank-letter-password-rc4.pdf?inline";
import bankLetterRc4128 from "../fixtures/bank-letter-rc4-128.pdf?inline";
import bankLetterRc440 from "../fixtures/bank-letter-rc4-40.pdf?inline";
import certificatePdf from "../fixtures/certificate.pdf?inline";
import heicPhoto from "../fixtures/photo.heic?inline";
import macVoiceMemo from "../fixtures/macos-voice-memo.m4a?inline";
import { env } from "cloudflare:test";
import {
  fixture,
  fragmentedM4a,
  m4a,
  oggOpus,
  paddedTo,
  pdf,
  photos,
  riffChunks,
  webmOpus,
} from "../support/files";
import { createHarness } from "../support/harness";
import { textPdf } from "../support/pdfs";

// What a file sent with a message may be (#113): before Payment photos only;
// after it in the Engagement's Conversation, PDFs and voice notes too; never
// video or a type that can carry a script; and nothing over its limit. A
// refused file is refused before anything is stored, so the send changes
// nothing. A photo is kept as one resized copy and a thumbnail, with no
// location or other metadata.

const MB = 1024 * 1024;

type Bytes = Uint8Array<ArrayBuffer> | string;

/** A Client's Conversation with an Artisan, before Payment (a Sent Quote) or after it (Hired). */
async function conversation(payment: "before" | "after") {
  const { domain, given } = await createHarness();
  const client = await given.client();
  const artisan = await given.matchableArtisan();
  const jobId = await given.openJob(client);
  const quoteId = await given.sentQuote(artisan, jobId);
  if (payment === "after") await given.hired(client, quoteId);
  const { conversationId } = (await domain.conversations.forJob(client.actor, { jobId }))![0]!;
  /** Sends the file alone, as the Client. */
  async function send(bytes: Bytes, type = "") {
    return domain.conversations.send(client.actor, {
      conversationId,
      text: "",
      files: [new File([bytes], "upload", { type })],
    });
  }
  async function messages() {
    return (await domain.conversations.view(client.actor, { conversationId }))!.items.filter(
      (item) => item.kind === "message",
    );
  }
  return { domain, client, send, messages };
}

/** Sends each file in its own message, and gives the refusal reason of each, or "sent". */
async function outcomes(payment: "before" | "after", files: (() => Bytes | Promise<Bytes>)[]) {
  const { send, messages } = await conversation(payment);
  const reasons = [];
  for (const make of files) {
    const sent = await send(await make());
    reasons.push(sent.ok ? "sent" : sent.refusal.reason);
  }
  return { reasons, sent: (await messages()).length };
}

describe("a photo", () => {
  /** The photos of the one message sent, each with its copy's and thumbnail's bytes. */
  async function storedPhotos(sent: Uint8Array<ArrayBuffer>) {
    const { domain, client, send, messages } = await conversation("before");
    expect(await send(sent)).toMatchObject({ ok: true });
    const [message] = await messages();
    if (message?.kind !== "message") throw new Error("not sent");
    const bytesOf = async (fileId: string, thumbnail: boolean) => {
      const served = await domain.conversations.file(client.actor, {
        messageId: message.messageId,
        fileId,
        thumbnail,
      });
      expect(served?.contentType).toBe("image/webp");
      return new Uint8Array(await new Response(served!.body).arrayBuffer());
    };
    return Promise.all(
      message.photos.map(async (photo) => ({
        ...photo,
        copy: await bytesOf(photo.id, false),
        thumbnail: await bytesOf(photo.id, true),
      })),
    );
  }

  test("is kept as one resized copy and a thumbnail, with its location data stripped", async () => {
    const [photo] = await storedPhotos(photos.camera());

    expect(photo).toMatchObject({ width: 2048, height: 1024 });
    for (const [bytes, size] of [
      [photo!.copy, { width: 2048, height: 1024 }],
      [photo!.thumbnail, { width: 400, height: 200 }],
    ] as const) {
      expect(riffChunks(bytes)).not.toEqual(
        expect.arrayContaining([expect.stringMatching(/EXIF|XMP |ICCP/)]),
      );
      expect(await env.IMAGES.info(new Blob([bytes]).stream())).toMatchObject(size);
    }
  });

  test("animated, is kept as a still photo", async () => {
    const [photo] = await storedPhotos(photos.animated());

    expect(riffChunks(photo!.copy)).not.toEqual(expect.arrayContaining(["ANIM", "ANMF"]));
  });

  test("is taken as JPEG, PNG, or WebP up to 10 MB, and no larger", async () => {
    expect(
      await outcomes("before", [
        photos.png,
        photos.webp,
        () => paddedTo(photos.jpeg(), 10 * MB),
        () => paddedTo(photos.jpeg(), 10 * MB + 1),
        () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 1, 2, 9, 9, 9, 9]),
      ]),
    ).toEqual({ reasons: ["sent", "sent", "sent", "too-large", "unreadable"], sent: 3 });
  });
});

describe("a PDF", () => {
  test("is taken only after Payment, up to 10 MB, and as sent", async () => {
    const certificate = fixture(certificatePdf);
    const { domain, client, send, messages } = await conversation("after");

    expect(await send(certificate)).toMatchObject({ ok: true });
    const [message] = await messages();
    if (message?.kind !== "message") throw new Error("not sent");
    const served = await domain.conversations.file(client.actor, {
      messageId: message.messageId,
      fileId: message.files[0]!.id,
    });
    expect(served?.contentType).toBe("application/pdf");
    expect(new Uint8Array(await new Response(served!.body).arrayBuffer())).toEqual(certificate);
    expect((await send(paddedTo(certificate, 10 * MB))).ok).toBe(true);
    expect(await send(paddedTo(certificate, 10 * MB + 1))).toMatchObject({
      refusal: { reason: "too-large" },
    });
    expect((await outcomes("before", [() => certificate])).reasons).toEqual(["not-taken-here"]);
  });

  test("is taken encrypted if it opens without a password, and refused if it carries a script or cannot be read", async () => {
    expect(
      await outcomes("after", [
        // Saved with an owner password only, as a bank letter or a generated
        // certificate forbids editing or copying.
        () => fixture(bankLetterRc440),
        () => fixture(bankLetterRc4128),
        () => fixture(bankLetterAes128),
        () => textPdf({ lines: ["Bank letter"], aes256: {} }),
        () => pdf({ script: "plain" }),
        () => pdf({ script: "escaped" }),
        () => pdf({ script: "object-stream" }),
        () => textPdf({ aes256: {}, script: true }),
        () => pdf({ script: "object-stream", packing: "flate-then-hex" }),
        () => pdf({ script: "object-stream", packing: "predictor" }),
        () => fixture(bankLetterPasswordRc4),
        () => fixture(bankLetterPasswordAes),
        () => textPdf({ lines: ["Hidden"], aes256: { userPassword: "secret" } }),
      ]),
    ).toEqual({
      reasons: [
        // Taken, as Workers AI opens them to read their text.
        ...Array<string>(4).fill("sent"),
        ...Array<string>(4).fill("script"),
        ...Array<string>(5).fill("unreadable"),
      ],
      sent: 4,
    });
  });
});

describe("a voice note", () => {
  test("is taken only after Payment, as recorded in a browser or by a voice recorder, up to 5 minutes", async () => {
    const fiveMinutes = Math.floor((300 * 44_100) / 1024);

    expect(
      await outcomes("after", [
        () => fixture(chromeVoiceWebm),
        () => fixture(chromeVoiceMp4),
        () => fixture(macVoiceMemo),
        () => webmOpus(300),
        () => oggOpus(300),
        () => m4a(300),
        // Its length is only in its fragments, and is added up from them.
        () => fragmentedM4a(fiveMinutes),
        () => webmOpus(301),
        () => oggOpus(301),
        () => m4a(301),
        () => fragmentedM4a(fiveMinutes + 50),
        () => fragmentedM4a(0xffffffff),
      ]),
    ).toEqual({
      reasons: [...Array<string>(7).fill("sent"), ...Array<string>(5).fill("too-long")],
      sent: 7,
    });
    expect((await outcomes("before", [() => fixture(chromeVoiceWebm)])).reasons).toEqual([
      "not-taken-here",
    ]);
  });
});

describe("anything else", () => {
  const refused = [
    ["video", () => fixture(chromeVideoWebm)],
    ["video", () => fixture(chromeVideoMp4)],
    ["video", () => webmOpus(10, { video: true })],
    ["video", () => oggOpus(10, { video: true })],
    ["video", () => m4a(10, { video: true })],
    [
      "script",
      () =>
        '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    ],
    ["script", () => "﻿  <!doctype html><html><script>alert(1)</script></html>"],
    ["type-not-taken", () => fixture(heicPhoto)],
    [
      "type-not-taken",
      () => new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0, 0, 0, 0]),
    ],
    ["type-not-taken", () => "alert(document.cookie)"],
    ["type-not-taken", () => new Uint8Array([0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0])],
  ] as const;

  test.each(["before", "after"] as const)(
    "is refused %s Payment: video, a type that can carry a script, or any other",
    async (payment) => {
      expect(
        await outcomes(
          payment,
          refused.map(([, make]) => make),
        ),
      ).toEqual({
        reasons: refused.map(([reason]) => reason),
        sent: 0,
      });
    },
  );

  test("is refused whatever name and type it claims", async () => {
    const { send } = await conversation("after");

    expect(await send("<html><script>alert(1)</script></html>", "image/jpeg")).toMatchObject({
      ok: false,
      refusal: { reason: "script" },
    });
  });
});
