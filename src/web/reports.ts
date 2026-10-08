import { createServerFn } from "@tanstack/react-start";
import type { About } from "@/domain/reports/subjects";
import { requestActor, requestDomain } from "./session";

/** Reports a thing the Account can see to the Admin, once. */
export const sendReport = createServerFn({ method: "POST" })
  .validator((input: { about: About; reason: string; note?: string }) => input)
  .handler(async ({ data }) => {
    const domain = requestDomain();
    return domain.reports.report(await requestActor(domain), data);
  });

/** Whether the signed-in Account has Reported the thing already. */
export const getReportMade = createServerFn({ method: "GET" })
  .validator((input: { about: About }) => input)
  .handler(async ({ data }) => {
    const domain = requestDomain();
    return domain.reports.made(await requestActor(domain), data);
  });
