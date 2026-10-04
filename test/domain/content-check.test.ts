import { describe, expect, test } from "vitest";
import bankLetter from "../fixtures/bank-letter.pdf?inline";
import bankLetterAes128 from "../fixtures/bank-letter-aes-128.pdf?inline";
import bankLetterRc4128 from "../fixtures/bank-letter-rc4-128.pdf?inline";
import bankLetterRc440 from "../fixtures/bank-letter-rc4-40.pdf?inline";
import certificatePdf from "../fixtures/certificate.pdf?inline";
import chromeVoiceWebm from "../fixtures/chrome-voice-note.webm?inline";
import type { ContentContext } from "@/domain";
import { cameraJpeg, fixture } from "../support/files";
import { createContentHarness } from "../support/content";
import { textPdf } from "../support/pdfs";

// The Content check (ADR 0011): everything sent becomes text (photos by OCR,
// voice notes by speech-to-text, PDFs by text extraction), patterns refuse
// what is certain without calling the content reader, and the reader decides
// the rest. Tests send through a probe (test/support/content.ts) the way Jobs,
// Quotes, and messages will, and look at what the fake reader was given.

const client = { kind: "client", accountId: "client-1" } as const;
const beforePayment: ContentContext = { kind: "before-payment" };
const afterPayment: ContentContext = { kind: "engagement-conversation", engagementId: "e-1" };

function file(bytes: Uint8Array<ArrayBuffer>) {
  return new File([bytes], "upload");
}

async function send(
  text: string,
  { context = beforePayment, files = [] }: { context?: ContentContext; files?: Blob[] } = {},
) {
  const harness = await createContentHarness();
  const result = await harness.domain.contentProbe.send(client, { text, files, context });
  return { ...harness, result };
}

describe("text", () => {
  test("that is clear goes out, once the content reader has read it in its context", async () => {
    const { result, contentReader } = await send("The geyser leaks; can you fix it this week?");

    expect(result).toEqual({
      ok: true,
      value: { verdict: "clear", text: "The geyser leaks; can you fix it this week?" },
    });
    expect(contentReader.reads).toEqual([
      {
        text: "The geyser leaks; can you fix it this week?",
        photos: [],
        context: beforePayment,
      },
    ]);
  });

  test.each([
    ["a phone number", "Call me on 082 555 0123", /phone number/],
    ["a phone number with the country code", "WhatsApp +27 82 555 0123", /phone number/],
    ["a phone number broken up", "0 8 2 - 5 5 5 - 0 1 2 3", /phone number/],
    ["a phone number after a word in capitals", "CALL MY NUMBER 082 555 0123", /phone number/],
    ["a phone number after an abbreviation", "TEL NR 0825550123", /phone number/],
    ["an email address", "Mail thandi.m@example.co.za", /email address/],
    ["a link", "See https://example.com/my-work", /link/],
    ["a bare web address", "My work is on thandisplumbing.co.za", /link/],
    ["a bank account number", "Pay into 6281 2345 678", /bank account number/],
    ["an account number said to be one", "FNB acc no 1234567", /bank account number/],
    ["a card number", "Card 4111 1111 1111 1111", /bank account number/],
  ])(
    "with %s is refused at once, saying what to take out, without the content reader",
    async (_, text, message) => {
      const { result, contentReader } = await send(text);

      expect(result).toEqual({
        ok: false,
        refusal: { reason: "content", message: expect.stringMatching(message) },
      });
      expect(contentReader.reads).toEqual([]);
    },
  );

  test.each([
    "Labour R4 500, Materials R1 250 000.50",
    "Start 2026-10-05 at 08:00, done in 3 days",
    "Tiles 600 x 600, 12 boxes, registration 12345",
    "Email me here on ArtisanConnect.",
  ])("of amounts, dates, and sizes passes the patterns: %s", async (text) => {
    const { result, contentReader } = await send(text);

    expect(result).toMatchObject({ ok: true, value: { verdict: "clear" } });
    expect(contentReader.reads).toHaveLength(1);
  });

  test("after Payment, in the Engagement's Conversation, may give a phone number and an email", async () => {
    const { result, contentReader } = await send(
      "Call me on 082 555 0123 or mail thandi@example.com",
      { context: afterPayment },
    );

    expect(result).toMatchObject({ ok: true, value: { verdict: "clear" } });
    expect(contentReader.reads[0]?.context).toEqual(afterPayment);
  });

  test.each([
    ["a bank account number", "Rather pay into 62812345678", /bank account number/],
    ["a payment link", "Pay here: https://pay.example.com/thandi", /link/],
  ])("after Payment still may not give %s", async (_, text, message) => {
    const { result, contentReader } = await send(text, { context: afterPayment });

    expect(result).toMatchObject({
      ok: false,
      refusal: { message: expect.stringMatching(message) },
    });
    expect(contentReader.reads).toEqual([]);
  });
});

describe("the content reader's verdict", () => {
  test("of a sure hit refuses with its reason, and records nothing", async () => {
    const harness = await createContentHarness();
    harness.contentReader.force({ kind: "sure-hit", reason: "It gives a phone number in words." });

    const result = await harness.domain.contentProbe.send(client, {
      text: "zero eight two five five five",
      context: beforePayment,
    });

    expect(result).toEqual({
      ok: false,
      refusal: { reason: "content", message: "It gives a phone number in words." },
    });
    expect(
      await harness.domain.queues.home(await harness.given.admin().then((a) => a.actor)),
    ).toMatchObject({
      counts: { "pre-checks": 0 },
    });
  });

  test.each([
    [
      "unsure",
      { kind: "unsure", reason: "It may ask to pay in cash." },
      "It may ask to pay in cash.",
    ],
    ["cannot run", { kind: "cannot-run", reason: "Workers AI is busy." }, "Workers AI is busy."],
  ] as const)("that is %s Holds the item, with the reason", async (_, verdict, reason) => {
    const harness = await createContentHarness();
    harness.contentReader.force(verdict);

    const result = await harness.domain.contentProbe.send(client, {
      text: "Can we sort out the money ourselves?",
      context: beforePayment,
    });

    expect(result).toEqual({
      ok: true,
      value: { verdict: "held", reason, text: "Can we sort out the money ourselves?" },
    });
  });

  test("that never comes, as the reader is down, Holds the item", async () => {
    const harness = await createContentHarness();
    harness.contentReader.breaks();

    const result = await harness.domain.contentProbe.send(client, {
      text: "Hello",
      context: beforePayment,
    });

    expect(result).toMatchObject({ ok: true, value: { verdict: "held" } });
  });
});

describe("a photo", () => {
  test("has its text read (OCR) and joined to the item's text before the patterns run", async () => {
    const harness = await createContentHarness();
    harness.contentReader.photosSay("Thandi Plumbing\n082 555 0123");

    const result = await harness.domain.contentProbe.send(client, {
      text: "Here is the leak",
      files: [file(await cameraJpeg(64, 48))],
      context: beforePayment,
    });

    expect(result).toMatchObject({
      ok: false,
      refusal: { message: expect.stringMatching(/phone number/) },
    });
    expect(harness.contentReader.reads).toEqual([]);
  });

  test("is looked at by the content reader, for a contact card or a screenshot", async () => {
    const harness = await createContentHarness();
    harness.contentReader.photosSay("Thandi Plumbing");

    const result = await harness.domain.contentProbe.send(client, {
      text: "My card",
      files: [file(await cameraJpeg(64, 48))],
      context: beforePayment,
    });

    expect(result).toMatchObject({
      ok: true,
      value: { verdict: "clear", text: "My card\n\nThandi Plumbing" },
    });
    expect(harness.contentReader.reads).toEqual([
      {
        text: "My card\n\nThandi Plumbing",
        photos: [expect.any(Uint8Array)],
        context: beforePayment,
      },
    ]);
  });

  test("that cannot be read, as the reader is down, Holds the item", async () => {
    const harness = await createContentHarness();
    const photo = file(await cameraJpeg(64, 48));
    harness.contentReader.breaks();

    const result = await harness.domain.contentProbe.send(client, {
      text: "Here is the leak",
      files: [photo],
      context: beforePayment,
    });

    expect(result).toMatchObject({
      ok: true,
      value: { verdict: "held", reason: "A photo could not be read." },
    });
  });
});

describe("a voice note", () => {
  test("is turned into text and joined to the item's text", async () => {
    const harness = await createContentHarness();
    harness.contentReader.voiceNotesSay("Rather pay into my account, 62812345678");

    const result = await harness.domain.contentProbe.send(client, {
      text: "",
      files: [file(fixture(chromeVoiceWebm))],
      context: afterPayment,
    });

    expect(result).toMatchObject({
      ok: false,
      refusal: { message: expect.stringMatching(/bank account number/) },
    });
  });
});

describe("a PDF", () => {
  test("has its text extracted and joined to the item's text", async () => {
    const { result, contentReader } = await send("The certificate", {
      context: afterPayment,
      files: [file(fixture(certificatePdf))],
    });

    expect(result).toMatchObject({ ok: true, value: { verdict: "clear" } });
    expect(contentReader.reads[0]?.text).toBe(
      "The certificate\n\nCertificate of Compliance\nRegistration 12345",
    );
  });

  test.each([
    ["not encrypted", async () => fixture(bankLetter)],
    ["RC4, 40 bits", async () => fixture(bankLetterRc440)],
    ["RC4, 128 bits", async () => fixture(bankLetterRc4128)],
    ["AES, 128 bits", async () => fixture(bankLetterAes128)],
    [
      "AES, 256 bits",
      () =>
        textPdf({
          lines: ["Confirmation of banking details", "Account number 62812345678"],
          aes256: {},
        }),
    ],
  ])(
    "that opens without a password (%s) is read, so a bank account number in it is refused",
    async (_, letter) => {
      const { result } = await send("My bank letter", {
        context: afterPayment,
        files: [file(await letter())],
      });

      expect(result).toMatchObject({
        ok: false,
        refusal: { message: expect.stringMatching(/bank account number/) },
      });
    },
  );

  test("is read through its font's ToUnicode map when its codes are only glyph numbers", async () => {
    const letter = await textPdf({
      lines: ["Proof of address", "12 Loop Street, Cape Town"],
      font: "composite",
    });

    const { result, contentReader } = await send("", {
      context: afterPayment,
      files: [file(letter)],
    });

    expect(result).toMatchObject({ ok: true, value: { verdict: "clear" } });
    expect(contentReader.reads[0]?.text).toBe("Proof of address\n12 Loop Street, Cape Town");
  });

  test("is read past a stray null operand, as a viewer shows it", async () => {
    const letter = await textPdf({ lines: ["Account number 62812345678"], before: "null" });

    const { result } = await send("", { context: afterPayment, files: [file(letter)] });

    expect(result).toMatchObject({
      ok: false,
      refusal: { message: expect.stringMatching(/bank account number/) },
    });
  });

  test("has the text of its annotations read too, as a viewer shows them", async () => {
    const letter = await textPdf({ lines: ["Proof of payment"], note: "Pay into 62812345678" });

    const { result } = await send("", { context: afterPayment, files: [file(letter)] });

    expect(result).toMatchObject({
      ok: false,
      refusal: { message: expect.stringMatching(/bank account number/) },
    });
  });

  test("of scanned pages, which has no text to extract, Holds the item", async () => {
    const { result, contentReader } = await send("My letter", {
      context: afterPayment,
      files: [file(await textPdf({ scanned: true }))],
    });

    expect(result).toMatchObject({
      ok: true,
      value: { verdict: "held", reason: "A PDF with scanned pages cannot be read." },
    });
    expect(contentReader.reads).toEqual([]);
  });

  test("with text and a scanned page Holds the item, as the scan cannot be read", async () => {
    const letter = await textPdf({ lines: ["Proof of payment"], scannedSecondPage: true });

    const { result } = await send("", { context: afterPayment, files: [file(letter)] });

    expect(result).toMatchObject({
      ok: true,
      value: { verdict: "held", reason: "A PDF with scanned pages cannot be read." },
    });
  });

  test("whose symbolic font does not say what its characters are Holds the item", async () => {
    const letter = await textPdf({ lines: ["Pay into 62812345678"], font: "symbolic" });

    const { result } = await send("", { context: afterPayment, files: [file(letter)] });

    expect(result).toMatchObject({
      ok: true,
      value: { verdict: "held", reason: "A PDF could not be read." },
    });
  });
});
