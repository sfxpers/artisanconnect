import type { Email, Mailer } from "../ports";

export type FakeMailer = Mailer & {
  /** Every email sent, oldest first. */
  readonly sent: Email[];
  sentTo(address: string): Email[];
  /** The next send throws, as when the mail service is down. */
  failNextSend(): void;
};

export function createFakeMailer(): FakeMailer {
  const sent: Email[] = [];
  let failNext = false;
  return {
    sent,
    sentTo: (address) => sent.filter((email) => email.to === address),
    failNextSend() {
      failNext = true;
    },
    async send(email) {
      if (failNext) {
        failNext = false;
        throw new Error("The fake mailer was told to fail");
      }
      sent.push(email);
    },
  };
}
