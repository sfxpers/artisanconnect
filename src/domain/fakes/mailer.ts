import type { Email, Mailer } from "../ports";

export type FakeMailer = Mailer & {
  /** Every email sent, oldest first. */
  readonly sent: Email[];
  sentTo(address: string): Email[];
};

export function createFakeMailer(): FakeMailer {
  const sent: Email[] = [];
  return {
    sent,
    sentTo: (address) => sent.filter((email) => email.to === address),
    async send(email) {
      sent.push(email);
    },
  };
}
