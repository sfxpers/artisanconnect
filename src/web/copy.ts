import { EMAIL_CODE } from "@/domain/accounts/inputs";

// Every word the web app shows, in one place for later translation. Copy is a
// placeholder until final copy is written (#111).

export const copy = {
  appName: "ArtisanConnect",
  header: {
    visitor: { findArtisans: "Find Artisans", signUp: "Sign up", signIn: "Sign in" },
    client: { jobs: "Jobs", findArtisans: "Find Artisans", account: "Account" },
    artisan: { home: "Home", profile: "Profile", payouts: "Payouts", account: "Account" },
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
      `We sent a ${EMAIL_CODE.length}-digit code to ${email}. It works once, for ${EMAIL_CODE.minutes} minutes.`,
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
