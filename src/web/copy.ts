import { EMAIL_CODE } from "@/domain/accounts/inputs";

// Every word the web app shows, in one place for later translation. Copy is a
// placeholder until final copy is written (#111).

export const copy = {
  appName: "ArtisanConnect",
  header: {
    visitor: { findArtisans: "Find Artisans", signUp: "Sign up", signIn: "Sign in" },
    client: { jobs: "Jobs", findArtisans: "Find Artisans", account: "Account" },
    artisan: { home: "Home", profile: "Profile", payouts: "Payouts", account: "Account" },
    admin: { queues: "Queues", admins: "Admins", audit: "Audit log", signOut: "Sign out" },
    notices: "Notices",
  },
  landing: {
    title: "Hire a verified Artisan in Cape Town",
    lead: "Post a Job, compare fixed-price Quotes, and pay through the platform. The platform holds your Payment: the Materials go to the Artisan when work starts on site, the Labour once you approve the work.",
    signUp: "Sign up",
    signIn: "I have an Account",
  },
  signUp: {
    title: "Sign up",
    kind: {
      step: "Client or Artisan",
      client: "I need work done",
      clientHint: "A Client posts Jobs and hires Artisans.",
      artisan: "I do the work",
      artisanHint: "An Artisan sends Quotes once verified.",
      fixed: "You choose once. To do both, sign up again with another Email.",
      chosen: { client: "Client", artisan: "Artisan" },
    },
    names: {
      step: "Your name",
      name: "Full name",
      tradingName: "Trading name (optional)",
      clientHint: "Artisans see a Client as first name and last initial, like “Thandi M.”",
      artisanHint: "Your trading name, if you give one, is the name on your Profile.",
    },
    email: { step: "Email and password", email: "Email", password: "Password" },
    rules: {
      step: "Marketplace rules",
      accept: (version: number) => `I accept the Marketplace rules (version ${version}).`,
      read: "Read the rules",
    },
    send: "Send my Email code",
    continue: "Continue",
    change: "Change",
    haveAccount: "Already have an Account?",
  },
  consent:
    "I consent to ArtisanConnect using my personal data as the Marketplace rules describe, including storing it on Cloudflare's network outside South Africa.",
  confirm: {
    title: "Prove your Email",
    lead: (email: string) =>
      `We sent an email to ${email}. Enter the ${EMAIL_CODE.length}-digit code from it. It works once, for ${EMAIL_CODE.minutes} minutes.`,
    code: "Email code",
    submit: "Confirm",
    resend: "Send a new code",
    resent: "A new code is on its way. The old one no longer works.",
  },
  signIn: {
    title: "Sign in",
    email: "Email",
    password: "Password",
    submit: "Sign in",
    forgot: "Forgot your password?",
    noAccount: "No Account yet?",
    enterCode: "Enter my code",
    rulesTitle: "The Marketplace rules have changed",
    rulesLead: "Accept the current version to sign in.",
    acceptAndSignIn: "Accept and sign in",
  },
  recover: {
    title: "Set a new password",
    lead: "We send a code to your Email if it holds an Account.",
    email: "Email",
    send: "Send a code",
    sent: (email: string) =>
      `If ${email} holds an Account, a code is on its way. It works once, for ${EMAIL_CODE.minutes} minutes.`,
    code: "Email code",
    password: "New password",
    submit: "Set the new password",
    done: "Your password is set. Every other session has been signed out.",
    signIn: "Sign in",
  },
  rules: {
    title: "Marketplace rules",
    version: (version: number, published: string) => `Version ${version}, published ${published}`,
    placeholder:
      "The full rules are being written. They will say how a Job, a Quote, a Hire, and the money work, what may be said, and how your personal data is used.",
  },
  notices: {
    title: "Notices",
    empty: "Nothing yet. We tell you here, and by email, when something needs you.",
    open: "Open",
  },
  jobs: {
    title: "Jobs",
    nextStep: "Next step",
    first: "Post your first Job",
    firstLead:
      "Describe the work, pick your suburb, and add photos. Verified Artisans near you send fixed-price Quotes.",
    post: "Post a Job",
    soon: "Posting a Job opens soon.",
  },
  verification: {
    title: "Verification",
    nextStep: "Next step",
    lead: "Before you can Quote, the Admin verifies who you are, your Payout account, and each trade you work in.",
    groups: [
      {
        title: "Once",
        items: [
          "An identity document and a selfie holding it",
          "A work permit, if your document is a foreign passport",
          "A bank letter for your Payout account",
        ],
      },
      {
        title: "Per Service Category",
        items: [
          "Three photos of your own finished work",
          "Any Credential the trade needs (Plumbing and Electrical)",
        ],
      },
      {
        title: "Optional",
        items: ["A police clearance", "Business insurance"],
      },
    ],
    soon: "Submitting documents opens soon.",
  },
  home: {
    waiting: "Waiting on you",
    verification: "Get verified to start quoting",
    open: "Open Verification",
  },
  account: {
    title: "Account",
    name: "Name",
    tradingName: "Trading name",
    none: "None",
    email: "Email",
    kind: "Kind",
    rules: "Marketplace rules",
    accepted: (version: number, when: string) => `Version ${version}, accepted ${when}`,
    signOut: "Sign out",
    names: {
      beingChecked: "Being checked",
      beingCheckedLead:
        "These names are being checked before anyone else sees them. Until then, others see the names shown above, if any.",
      notShown: "Nobody else sees your names until they pass the check.",
      refused: (reason: string) => `Your names were refused: ${reason}`,
      withdraw: "Withdraw",
      change: "Change names",
      save: "Save names",
      cancel: "Cancel",
      saved: "Your names are saved.",
      held: "Your names are being checked.",
    },
  },
  admin: {
    signIn: {
      label: "Staff",
      title: "Admin sign-in",
      lead: "An Admin signs in with a code sent to their Email. There is no password.",
      email: "Email",
      send: "Send my sign-in code",
      sent: (email: string) =>
        `If ${email} is an Admin's Email, a code is on its way. It works once, for ${EMAIL_CODE.minutes} minutes.`,
      code: "Email code",
      submit: "Sign in",
      resend: "Send a new code",
      otherEmail: "Use another Email",
    },
    queues: {
      verification: "Verification",
      "pre-checks": "Pre-checks",
      signals: "Signals",
      reports: "Reports",
      disputes: "Disputes",
      chargebacks: "Chargebacks",
      support: "Support",
      "data-requests": "Data requests",
    },
    home: {
      title: "Queues",
      lead: "Every queue in one stream, oldest first.",
      all: "All",
      empty: "Nothing is waiting. Every queue is clear.",
      emptyQueue: "Nothing is waiting in this queue.",
      raised: (when: string) => `Raised ${when}`,
      open: "Open",
    },
    item: {
      queues: "Queues",
      open: "Open",
      decided: "Decided",
      decision: "Decision",
      choose: "Choose a decision",
      told: (who: string) => `Told: ${who}.`,
      final: "A recorded decision is final and cannot be reopened.",
      reason: "Reason",
      reasonOptional: "Reason (optional)",
      record: "Record decision",
      recorded: (label: string) => `Decision recorded: ${label}`,
      by: (by: string, when: string) => `By ${by}, ${when}`,
      nothingAllowed: "No decision is allowed on this item now.",
      openRead: (label: string) => `Open ${label}`,
      logged: "(logged)",
      loggedNote: "Opening it is written to the audit log.",
      opened: (when: string) => `Opened at ${when}. Written to the audit log.`,
      timeline: "Timeline",
    },
    admins: {
      title: "Admins",
      lead: "Every Admin holds every staff power, and every decision is written to the audit log. An Admin may remove another, but never the last.",
      invite: "Invite an Admin",
      inviteLead:
        "The invite goes to their Email. They sign in there with an Email code, from the Admin sign-in page.",
      email: "Email",
      send: "Send the invite",
      invited: (email: string) => `${email} is an Admin now. An invite is on its way to them.`,
      setUp: (when: string) => `Set up at deploy, ${when}`,
      invitedBy: (by: string, when: string) => `Invited by ${by}, ${when}`,
      you: "You",
      remove: "Remove",
      confirm: "Remove for good",
      cancel: "Keep",
      removeLead: (email: string) =>
        `${email} stops being an Admin and is signed out at once. This is written to the audit log.`,
      last: "The last Admin cannot be removed.",
    },
    audit: {
      title: "Audit log",
      lead: "Every Admin decision and every logged read: who, what, and when. Newest first. Nothing in it can be changed.",
      empty: "Nothing has been logged yet.",
      older: "Older",
    },
  },
  notBuilt: "This page is not built yet.",
  devMail: { title: "Local mailbox", empty: "No email sent since the app started." },
  notAPerson: "Complete the check above first.",
} as const;

/** A date as South Africans read it. */
export function formatDate(date: Date | string): string {
  return new Date(date).toLocaleString("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Johannesburg",
  });
}
