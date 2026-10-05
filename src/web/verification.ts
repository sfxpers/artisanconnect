import { createServerFn } from "@tanstack/react-start";
import type { CheckDetailsInput, FilePart } from "@/domain/verification/checks";
import { requestActor, requestDomain } from "./session";

/** The signed-in Artisan's Verification: its checks in three groups. */
export const getMyVerification = createServerFn({ method: "GET" }).handler(async () => {
  const domain = requestDomain();
  return domain.verification.mine(await requestActor(domain));
});

const PARTS: FilePart["part"][] = ["document", "selfie", "photos"];

/**
 * Submits one check: its details as JSON under "details", and its files
 * under the part each is ("document", "selfie", "photos").
 */
export const submitCheck = createServerFn({ method: "POST" })
  .inputValidator((input: FormData) => {
    if (!(input instanceof FormData)) throw new Error("Expected a form");
    const details = JSON.parse(String(input.get("details") ?? "{}")) as CheckDetailsInput;
    const files: Partial<Record<FilePart["part"], Blob[]>> = {};
    for (const part of PARTS) {
      const sent = input.getAll(part).filter((value): value is File => value instanceof File);
      if (sent.length > 0) files[part] = sent;
    }
    return { details, files };
  })
  .handler(async ({ data }) => {
    const domain = requestDomain();
    return domain.verification.submit(await requestActor(domain), data);
  });
