import { EMAIL_CODE } from "@/domain/accounts/inputs";
import type { MessageEvent } from "@/domain/conversations/inputs";
import type { ENGAGEMENT_STATES, NOT_HIRED_REASONS } from "@/domain/schema";
import { formatTime } from "@/domain/sa-days";

// Every word the web app shows, in one place for later translation. Copy is a
// placeholder until final copy is written (#111).

export const copy = {
  appName: "ArtisanConnect",
  header: {
    visitor: { findArtisans: "Find Artisans", signUp: "Sign up", signIn: "Sign in" },
    client: { jobs: "Jobs", findArtisans: "Find Artisans", account: "Account" },
    artisan: { home: "Home", profile: "Profile", payouts: "Payouts", account: "Account" },
    admin: {
      queues: "Queues",
      people: "People",
      payouts: "Payouts",
      admins: "Admins",
      audit: "Audit log",
      signOut: "Sign out",
    },
    notices: "Notices",
  },
  notFound: {
    title: "No such page",
    lead: "Nothing is at this address on ArtisanConnect. The link may be mistyped or out of date.",
    home: "Go to ArtisanConnect",
  },
  landing: {
    title: "Hire a verified Artisan in Cape Town",
    lead: "Post a Job, compare fixed-price Quotes, and pay through the platform. The money waits with the platform until the work is done.",
    postJob: "Post a Job",
    findArtisans: "Find Artisans",
    signIn: "I have an Account",
    howTitle: "How a Job goes",
    how: [
      {
        title: "Post a Job",
        text: "Describe the work, pick your suburb, and add photos. Your street stays private until you hire.",
      },
      {
        title: "Compare Quotes",
        text: "Up to five verified Artisans send a fixed price: Labour, Materials, start date, and any Warranty they offer.",
      },
      {
        title: "Hire by paying",
        text: "You pay the Quote through the platform, which holds it. Nobody is paid in cash or off the platform.",
      },
      {
        title: "Approve the work",
        text: "The Materials go to the Artisan when work starts on site; the Labour once you approve the work.",
      },
    ],
    tradesTitle: "Eight trades",
    tradesLead: "Browse the Artisans verified for each one, by Region.",
    feesTitle: "Fees shown before you pay",
    fees: "A Quote is the Artisan's fixed price. When you hire, you see the 5% Protection Fee on top before you pay, and nothing is added after.",
    badgeTitle: "A badge is a check, not a guarantee",
    badge:
      "Each Verification Badge is a document the Admin checked, such as an identity document or a trade registration. It is not a promise that the work will be good: read the Reviews too.",
  },
  browse: {
    title: "Find Artisans",
    lead: "Verified Artisans, one trade at a time. Those Available for Jobs come first, then by name. Nobody pays to be higher.",
    chooseTrade: "Choose a trade",
    trade: "Trade",
    region: "Region",
    allRegions: "All Regions",
    count: (count: number) => (count === 1 ? "1 Artisan" : `${count} Artisans`),
    empty: "No Artisan is verified for this trade here yet.",
    available: "Available for Jobs",
    notAvailable: "Not taking Job Matches now",
    gasWork: "Gas work too",
    noRegions: "No Regions chosen yet",
    open: "Open Profile",
    signUpPrompt: "To post a Job or invite an Artisan to Quote, sign up as a Client.",
    signUp: "Sign up",
  },
  profile: {
    about: "About",
    noAbout: "No About text yet.",
    photos: "Work photos",
    noPhotos: "No work photos yet.",
    photo: (index: number) => `Work photo ${index}`,
    gasWork: "gas work too",
    badges: "Verification Badges",
    badgesNote: "A badge is a check the Admin accepted, not a promise that the work will be good.",
    expires: (day: string) => `expires ${day}`,
    issued: (day: string) => `issued ${day}`,
    regions: "Works in",
    noRegions: "No Regions chosen yet.",
    available: "Available for Jobs",
    notAvailable: "Not taking Job Matches now",
    completed: (count: number) => (count === 1 ? "1 Job Completed" : `${count} Jobs Completed`),
    rating: (average: number, count: number) =>
      `${average.toFixed(1)} out of 5, from ${count} ${count === 1 ? "Review" : "Reviews"}`,
    noRating: "No Reviews yet",
    notVerifiedNow: "Not verified for any trade right now, so cannot Quote.",
    reviews: "Reviews",
    noReviews: "No Reviews yet. A Client reviews an Artisan once a Job is Completed.",
    noContact:
      "Work is arranged on ArtisanConnect, so a Profile shows no phone number, email, or address.",
    inviteTitle: (name: string) => `Want ${name} to Quote?`,
    inviteLead:
      "Sign up as a Client to post a Job and invite Artisans to Quote. You hire by paying through the platform.",
    signUp: "Sign up",
    signIn: "Sign in",
    share: "Copy the link to this Profile",
    copied: "Link copied",
    back: "Find Artisans",
    description: (name: string, categories: string[]) =>
      categories.length > 0
        ? `${name}: ${categories.join(", ")} in Cape Town, verified on ArtisanConnect.`
        : `${name}, an Artisan in Cape Town on ArtisanConnect.`,
    notFound: "No such Profile",
    notFoundLead: "This Artisan is not on ArtisanConnect.",
  },
  myProfile: {
    title: "Profile",
    lead: "Your public page. Every edit waits for the Admin, and your Profile shows the version before it until then.",
    notPublic:
      "Nobody else can open your Profile until you are verified for a Service Category. You can prepare it now.",
    open: "Open your public Profile",
    edit: "Edit Profile",
    about: "About",
    aboutHint: (max: number) =>
      `What you do and how you work, up to ${max} characters. No phone number, email, link, or address: work is arranged on the platform.`,
    photos: "Work photos",
    photosHint: (max: number) =>
      `Up to ${max} photos of your own finished work (JPEG, PNG, or WebP, up to 10 MB each).`,
    remove: "Remove",
    restore: "Keep",
    send: "Send to the Admin",
    cancel: "Cancel",
    sent: "Sent. The Admin checks it, and we tell you the outcome. Your Profile shows the version before it until then.",
    beingChecked: "Being checked",
    beingCheckedLead:
      "This edit waits for the Admin. Until then, everyone sees your Profile as it is above.",
    withdraw: "Withdraw",
    refused: (reason: string) => `Your last edit was refused: ${reason}`,
    outOfView: (reason: string) =>
      `Your Profile is out of view until you fix it: ${reason} Edit it; it shows again once the Admin accepts the edit.`,
    preview: "As anyone sees it",
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
    another: "Post a Job",
    anotherLead: "Describe the work, pick your suburb, and add photos.",
    post: "Post a Job",
    groups: {
      needsYou: "Needs you",
      inProgress: "In progress",
      finished: "Finished",
    },
    empty: "Nothing here.",
    untitled: "Untitled Job",
    states: {
      draft: "Draft",
      held: "Being checked",
      open: "Open",
      expired: "Expired",
      closed: "Closed",
      hired: "Hired",
    },
    expires: (when: string) => `Expires ${when}`,
    open: "View",
  },
  job: {
    breadcrumb: "Jobs",
    newTitle: "Post a Job",
    newLead:
      "Save a Draft at any time; it may leave anything out. Posting needs everything except a Preferred start date.",
    category: "Service Category",
    chooseCategory: "Choose a Service Category",
    gasWork: "Does the work install or remove a gas appliance, gas system, or gas reticulation?",
    yes: "Yes",
    no: "No",
    siteType: "Site type",
    siteTypes: { home: "Home", business: "Business" },
    suburb: "Suburb",
    suburbHint: "Search the City's official suburbs. Artisans see only the Region.",
    suburbChange: "Change",
    noSuburb: "No suburb matches. Only a site inside the City of Cape Town can be placed.",
    region: "Region",
    street: "Street address",
    streetHint: "Only the Artisan you hire sees it, once you have paid.",
    title: "Title",
    description: "Description",
    descriptionHint:
      "What needs doing, and anything an Artisan should know. No phone number, email, link, or address: Contact details can only be shared after Payment.",
    photos: "Photos",
    photosHint: (max: number) =>
      `1 to ${max} photos of the work. No video. Large photos are made smaller before they are sent.`,
    photo: (index: number) => `Photo ${index}`,
    remove: "Remove",
    restore: "Keep",
    added: (count: number) => (count === 1 ? "1 photo to add" : `${count} photos to add`),
    preferredStart: "Preferred start date (optional)",
    preferredStartShown: "Preferred start",
    matching: "Who may Quote",
    matchings: {
      matched: "Find Artisans for me",
      "invite-only": "Only Artisans I invite",
    },
    matchingHints: {
      matched: "We offer the Job to verified Artisans in its Region, ten at a time.",
      "invite-only": "Nobody sees the Job unless you invite them.",
    },
    locked: "Locked at posting. A different trade or site is a new Job.",
    saveDraft: "Save Draft",
    saved: "Draft saved.",
    postJob: "Post Job",
    discard: "Discard Draft",
    refused: (reason: string) => `The Admin refused this Job: ${reason} Fix it and post it again.`,
    beingChecked: "Being checked",
    heldLead:
      "The Admin is checking this Job before it opens. Nobody else sees it until then. You can withdraw it to change it.",
    withdraw: "Withdraw",
    openLead: (when: string) =>
      `Open until ${when}. Quotes arrive here, and we tell you when one does.`,
    fullLead: "This Job has five Quotes, so it takes no more.",
    editLocked: "The first Quote locked the details, so they can no longer be edited.",
    expiredLead: "This Job expired without a Hire. Renew it to open it for 14 more days.",
    renew: "Renew for 14 days",
    closedLead: "You closed this Job.",
    close: "Close Job",
    closeConfirm: "Close this Job? It cannot be opened again.",
    edit: "Edit",
    editTitle: "Edit the Job",
    editLead:
      "Until the first Quote you may change the title, description, photos, Site type, and Preferred start.",
    sendEdit: "Save changes",
    cancel: "Cancel",
    editApplied: "Your changes are shown.",
    editBeingChecked:
      "Your edit is being checked by the Admin. The Job shows as before until then.",
    editRefused: (reason: string) => `Your last edit was refused: ${reason}`,
    outOfView: (reason: string) =>
      `The Admin took this Job out of view until you fix it: ${reason} Edit it; Artisans see it again once the Admin accepts the edit.`,
    details: "Job details",
    none: "None given",
  },
  invite: {
    title: "Invite Artisans",
    lead: "We offer this Job in turn as well. Invite anyone you would like to Quote.",
    leadInviteOnly:
      "Only the Artisans you invite see this Job. Invite those you would like to Quote.",
    region: "Region",
    allRegions: "All Regions",
    empty: "No Artisan verified for this trade works here yet.",
    invite: "Invite",
    invited: "Invited",
    quoted: "Quoted",
  },
  verification: {
    title: "Verification",
    nextStep: "Next step",
    lead: "Before you can Quote, the Admin verifies who you are, your Payout account, and each trade you work in. A badge is a check the Admin accepted, not a promise about the work.",
    verifiedFor: (categories: string) => `You can Quote on ${categories} Jobs.`,
    notYet: "You are not verified for any Service Category yet.",
    gasWork: "gas work too",
    groups: {
      once: { title: "Once", lead: "Who you are, and where your Payouts go." },
      category: {
        title: "Per Service Category",
        lead: "Three photos of your own finished work in each trade, and any Credential it needs.",
      },
      optional: {
        title: "Optional",
        lead: "Extra badges on your Profile. Neither one changes what you may Quote on.",
      },
    },
    verified: "Verified",
    notVerified: "Not yet",
    states: {
      missing: "Not sent",
      waiting: "Waiting for the Admin",
      accepted: "Badge",
      expired: "Expired",
      stopped: "Stopped by your bank",
      rejected: "Rejected",
      removed: "Badge removed",
    },
    stopped:
      "Your bank refused or sent back a Payout to this account, so it is no longer current and nothing more is sent to it. You may still Quote. Send a bank letter for another account; your Payouts wait until the Admin accepts it.",
    notNeeded: "Only needed with a foreign passport.",
    optionalCheck: "Optional",
    expires: (day: string) => `Expires ${day}`,
    expired: (day: string) => `Expired ${day}`,
    issued: (day: string) => `Issued ${day}`,
    reason: (reason: string) => `Reason: ${reason}`,
    replacementWaiting: "Your replacement is waiting for the Admin. This one counts until then.",
    replacementRejected: (reason: string) => `Your replacement was rejected: ${reason}`,
    submit: "Submit",
    submitAgain: "Submit again",
    replace: "Send a replacement",
    cancel: "Cancel",
    send: "Send to the Admin",
    sent: "Sent. The Admin checks it and we tell you the outcome.",
    fields: {
      documentType: "Kind of document",
      number: "Document number",
      saIdNumber: "South African ID number",
      country: "Country that issued it",
      chooseCountry: "Choose a country",
      expiresOn: "Expiry date",
      expiresOnOptional: "Expiry date (leave empty if it never expires)",
      issuedOn: "Issue date",
      registrationNumber: "Registration number",
      accountHolder: "Account holder, as the bank has it",
      bank: "Bank",
      branchCode: "Branch code",
      accountNumber: "Account number",
    },
    photosOnly: "Photos (JPEG, PNG, or WebP)",
    photosOrPdf: "Photos or PDFs, up to 10 MB each",
  },
  home: {
    waiting: "Waiting on you",
    verification: "Get verified to start quoting",
    open: "Open Verification",
    verificationLead: "You are offered Jobs only in the Service Categories you are verified for.",
    chooseYourRegions: "Choose your Regions",
    chooseRegionsLead: "You are offered Jobs only in the Regions you choose.",
    matchesLead: "Quote on a Job Match, or pass. Nobody is told you passed.",
    seeMatches: "See Job Matches",
    invitationsWaiting: (count: number) =>
      count === 1 ? "An Invitation is waiting" : `${count} Invitations are waiting`,
    jobsWaiting: (invitations: number, matches: number) =>
      [
        invitations === 1 ? "1 Invitation" : invitations > 1 ? `${invitations} Invitations` : "",
        matches === 1 ? "1 Job Match" : matches > 1 ? `${matches} Job Matches` : "",
      ]
        .filter(Boolean)
        .join(" and ") + (invitations + matches === 1 ? " is waiting" : " are waiting"),
    invitationsLead: "A Client chose you and asked you to Quote. You may pass; nobody is told.",
    seeInvitations: "See Invitations",
    nothingWaiting: "Nothing is waiting on you",
    nothingWaitingLead: "New Job Matches and Invitations show here.",
    tabs: {
      matches: (count: number) => `Job Matches (${count})`,
      invitations: (count: number) => `Invitations (${count})`,
      active: (count: number) => `Active Jobs (${count})`,
      notices: "Notices",
    },
    noMatches: "No Job Matches now. A Job in your trade and Regions is offered to you in turn.",
    noMatchesUnavailable: "No Job Matches while you are not Available for Jobs.",
    noInvitations: "No Invitations.",
    noActive: "No Active Jobs. A Job you Quote on shows here.",
    quoteSent: (when: string) => `Quote Sent ${when}`,
    quoteHeld: "Quote being checked",
    offered: (when: string) => `Offered ${when}`,
    invited: (when: string) => `Invited ${when}`,
    openJob: "Open",
    pass: "Pass",
    available: "Available for Jobs",
    availableOn: "You receive Job Matches.",
    availableOff: "No Job Matches. Your Profile stays visible.",
    regions: "Regions",
    noRegions: "You are offered Jobs only in the Regions you choose.",
    chooseRegions: "Choose Regions",
    editRegions: "Edit",
    regionsChosen: (count: number, max: number) => `${count} of ${max} chosen`,
    profile: "Profile",
    profileLead: "Your public page, with your work photos, badges, and Reviews.",
    openProfile: "Open",
    payouts: "Payouts",
    openPayouts: "Open",
    unpaid: "Still to be paid",
    paid: "Paid to you",
    payoutsHeld: "Held by the Admin",
    payoutsStopped: "A Payout came back from your bank",
  },
  payouts: {
    title: "Payouts",
    lead: "Each Release is paid to your Payout account in the next daily run, less the Artisan Fee. A Receipt is emailed for each Payout.",
    unpaid: "Still to be paid",
    paid: "Paid to you",
    held: "The Admin holds your Payouts. They wait until the hold is lifted; you are told when it is.",
    noAccount:
      "You have no current Payout account, so your Payouts wait. Send a bank letter in Verification.",
    stopped:
      "Your bank refused or sent back a Payout, so that Payout account is no longer current and nothing more is sent to it. The money is still owed to you. Send a bank letter for another account in Verification: everything waiting goes in the first daily run after the Admin accepts it.",
    openVerification: "Open Verification",
    empty:
      "No Releases yet. The Materials are released at Work started, and the Labour at Approval.",
    released: (part: string, when: string) => `${part} released ${when}`,
    parts: { materials: "Materials", labour: "Labour" },
    releasedAmount: "Released",
    artisanFee: "Artisan Fee",
    amount: "Paid to you",
    reference: (reference: string) => `Reference ${reference}`,
    paidOn: (when: string) => `Paid ${when}`,
    states: {
      waiting: "Waiting",
      sent: "On its way",
      paid: "Paid",
      refused: "Refused",
      "sent-back": "Sent back",
    },
    waitingFor: {
      "next-run": "Goes in the next daily run",
      hold: "Held by the Admin",
      "payout-account": "Waiting for a Payout account",
    },
    sent: "Sent to your bank.",
    refused: "Your bank refused this Payout.",
    earlier: (reference: string, state: string, when: string) =>
      `Payout ${reference}: ${state.toLowerCase()} by your bank ${when}`,
    earlierStates: { refused: "Refused", "sent-back": "Sent back" },
  },
  quote: {
    write: "Write a Quote",
    writeLead:
      "One fixed price for the whole Job. Sending it is your commitment to the start date: the Client hires by paying for it.",
    scope: "Scope",
    scopeHint:
      "What you will do and what is included. If the Client supplies some materials, say which. No phone number, email, or link.",
    labour: "Labour (R)",
    labourHint: "Paid to you once the Client approves the work.",
    materials: "Materials (R)",
    materialsHint: "Paid to you once work starts on site. Zero if the Client supplies them.",
    materialsBy: "Who supplies the materials",
    materialsByOptions: { artisan: "I do", client: "The Client", both: "Both of us" },
    materialsByShown: { artisan: "The Artisan", client: "The Client", both: "Both" },
    startOn: "Start date",
    durationDays: "Duration (days)",
    durationHint: "Whole days, counting the start date as day 1.",
    warranty: "Warranty (optional)",
    warrantyHint: "Your own promise. The platform does not make or enforce it.",
    total: "Total",
    minimum: "A Quote totals at least R300.",
    includesVat: (vatNumber: string) => `Amounts include VAT (VAT number ${vatNumber}).`,
    noVat: "Not VAT-registered? Your amounts are as given. You can add a VAT number in Account.",
    send: "Send Quote",
    revise: "Revise",
    sendRevision: "Send revision",
    cancel: "Cancel",
    withdraw: "Withdraw Quote",
    withdrawConfirm:
      "Withdraw your Quote? The Client is told, and you cannot Quote on this Job again.",
    withdrawCheck: "Withdraw",
    states: {
      held: "Being checked",
      refused: "Refused",
      sent: "Sent",
      declined: "Declined",
      withdrawn: "Withdrawn",
      expired: "Expired",
      hired: "Hired",
    },
    yourQuote: "Your Quote",
    heldLead:
      "The Admin is checking your Quote before it is Sent. Nobody else sees it until then, and it takes none of the Job's five places.",
    refusedLead: (reason: string) =>
      `The Admin refused your Quote: ${reason} Fix it and send it again.`,
    sentLead: (when: string) =>
      `Sent. It expires ${when} unless the Client hires you. Revising it does not change that.`,
    revisionHeld:
      "Your revision is being checked by the Admin. The Client sees your Quote as before until then.",
    revisionRefused: (reason: string) => `Your last revision was refused: ${reason}`,
    revised: "Revised. The Client was told.",
    revisedOn: (when: string) => `Revised ${when}`,
    endedLead: {
      declined: "The Client declined your Quote.",
      withdrawn: "You withdrew your Quote.",
      expired: "Your Quote expired.",
      hired: "The Client hired you.",
    },
    full: "This Job has five Quotes and takes no more.",
    start: "Start",
    duration: "Duration",
    days: (count: number) => (count === 1 ? "1 day" : `${count} days`),
    labourShort: "Labour",
    materialsShort: "Materials",
    materialsByShort: "Materials from",
    warrantyShort: "Warranty",
    noWarranty: "None",
  },
  quotes: {
    title: (count: number) => (count === 1 ? "1 Quote" : `${count} Quotes`),
    none: "No Quotes yet. We tell you when one arrives.",
    lead: "In the order they were sent. Nothing here is ranked.",
    sortSent: "Order sent",
    sortTotal: "Total, lowest first",
    noName: "Name being checked",
    payment: "You would pay",
    paymentLead: (percent: number, fee: string) =>
      `Includes the ${percent}% Protection Fee of ${fee}, which is not refunded.`,
    decline: "Decline",
    declineConfirm: "Decline this Quote? The Artisan is told.",
    details: "Details",
    hideDetails: "Hide details",
    ended: "No longer open",
    sent: (when: string) => `Sent ${when}`,
    expires: (when: string) => `Expires ${when}`,
    hire: "Hire",
    startPassed: "Start date passed",
    startPassedLead:
      "Ask the Artisan to revise this Quote in your Conversation; then you can Hire it.",
    hireTitle: "Hire by paying for this Quote",
    hireQuote: "Quote",
    hireFee: (percent: number) => `Protection Fee (${percent}%)`,
    hirePayment: "You pay",
    hireAcknowledge: (fee: string) =>
      `I understand the Protection Fee of ${fee} is not refunded, whatever happens next.`,
    hirePay: (amount: string) => `Pay ${amount}`,
    hireLead:
      "By card or Instant EFT. The Artisan is Hired once your Payment arrives, and your other Quotes are then declined.",
    notHired: (
      amount: string,
      reason: (typeof NOT_HIRED_REASONS)[number],
      refund: "on-its-way" | "paid" | "owed",
    ) =>
      `A Payment of ${amount} arrived after ${
        {
          "quote-ended": "the Quote was no longer open, so nobody was Hired",
          "quote-changed": "the Quote was revised, so nobody was Hired",
          suspended: "an Account on it was suspended, so nobody was Hired",
          "out-of-view": "the Job was taken out of view, so nobody was Hired",
          "not-verified": "the Artisan stopped being verified for this trade, so nobody was Hired",
          "updated-quote-ended": "the Updated Quote was no longer proposed, so it did not apply",
        }[reason]
      }. ${
        {
          "on-its-way": "It is being refunded in full, Protection Fee included.",
          paid: "It was refunded in full, Protection Fee included.",
          owed: "Your bank could not take its Refund, so it is still owed to you in full, and we will pay it by bank transfer.",
        }[refund]
      }`,
  },
  engagement: {
    /** A Hired Job's badge: where its Engagement stands. */
    states: {
      paid: "Paid",
      "work-started": "Work started",
      "awaiting-approval": "Awaiting approval",
      "fix-requested": "Fix requested",
      disputed: "Disputed",
      completed: "Completed",
      cancelled: "Cancelled",
    } satisfies Record<(typeof ENGAGEMENT_STATES)[number], string>,
    nextStepClient: "Paid. Next: Work started",
    nextStepClientLead: (start: string) =>
      `The Artisan starts on ${start}. Once they are working on site, you mark Work started here, which releases the Materials to them.`,
    nextStepArtisan: "You were Hired",
    nextStepArtisanLead: (start: string, days: string) =>
      `Start on ${start}, for ${days}. Once you are working on site, tap I've started. Unless the Client answers Not started within 24 hours, it is Work started, which releases the Materials to you.`,
    claimedClient: "The Artisan says work has started",
    claimedClientLead: (answerBy: string) =>
      `If they are working on site, mark Work started. If not, answer Not started by ${answerBy}; otherwise it is Work started then, and the Materials are released to them.`,
    claimedArtisan: "You said you've started",
    claimedArtisanLead: (answerBy: string) =>
      `Unless the Client answers Not started by ${answerBy}, it is Work started then, and the Materials are released to you.`,
    workStarted: "Work started",
    workStartedClientLead:
      "The Materials were released to the Artisan. Next, the Artisan marks the work complete, and your Approval releases the Labour.",
    workStartedArtisanLead:
      "The Materials were released to you, less the Artisan Fee. Once the work is done, you mark it complete, and the Client's Approval releases the Labour.",
    markWorkStarted: "Work started",
    markWorkStartedConfirm: (materials: string | null) =>
      materials
        ? `Mark Work started? This releases the Materials, ${materials}, to the Artisan, and cannot be undone.`
        : "Mark Work started? This cannot be undone.",
    notStarted: "Not started",
    notStartedConfirm: "Tell the Artisan that work has not started on site?",
    claimStarted: "I've started",
    claimFrom: (start: string) =>
      `You can tap I've started from ${start}, the Quote's start date. Starting sooner? The Client can mark Work started.`,
    claimStartedConfirm:
      "Tell the Client you are working on site? Unless they answer Not started within 24 hours, it is Work started.",
    awaitingClient: "The work is marked complete",
    awaitingClientLead: (by: string) =>
      `Check the work below. Approve it to release the Labour to the Artisan, or ask for a fix. If you do not answer by ${by}, it is Approved then.`,
    awaitingArtisan: "Waiting for the Client's Approval",
    awaitingArtisanLead: (by: string) =>
      `The Client approves the work or asks for a fix. If they do not answer by ${by}, it is Approved then, and the Labour is released to you.`,
    fixClient: "You asked for a fix",
    fixClientLead:
      "The Artisan puts it right and marks the work complete again, which gives you a new seven days to answer.",
    fixArtisan: "The Client asked for a fix",
    fixArtisanLead:
      "Put it right, then mark the work complete again. The Client then has a new seven days to answer.",
    cancelledTitle: "Cancelled",
    cancelledLead: (of: {
      who: string;
      afterWorkStarted: boolean;
      asClient: boolean;
      labourRefund: { amount: string; on: string } | null;
    }) => {
      if (!of.afterWorkStarted) {
        return of.asClient
          ? `${of.who} cancelled before Work started. What was not yet released is refunded to you; the Protection Fee is kept.`
          : `${of.who} cancelled before Work started, and the Client is refunded what was not yet released.`;
      }
      const materials = of.asClient
        ? "The Materials stay with the Artisan"
        : "The Materials stay with you";
      if (of.labourRefund) {
        return of.asClient
          ? `${of.who} cancelled after Work started. ${materials}, and the Labour not yet released, ${of.labourRefund.amount}, is refunded to you on ${of.labourRefund.on}.`
          : `${of.who} cancelled after Work started. ${materials}, and the Labour not yet released, ${of.labourRefund.amount}, is refunded to the Client on ${of.labourRefund.on}, unless you open a Dispute for work already done before then. You may refund it sooner under Payments.`;
      }
      return `${of.who} cancelled after Work started. ${materials}, and the Labour not yet released was refunded ${of.asClient ? "to you" : "to the Client"}.`;
    },
    you: "You",
    theClient: "The Client",
    theArtisan: "The Artisan",
    cancelJob: "Cancel this Job",
    cancelLead: (of: { afterWorkStarted: boolean; asClient: boolean; amount: string }) =>
      of.afterWorkStarted
        ? of.asClient
          ? `Cancelling now: the Materials stay with the Artisan, and the Labour not yet released, ${of.amount}, is refunded to you 72 hours later.`
          : `Cancelling now: the Materials stay with you, and the Labour not yet released, ${of.amount}, is refunded to the Client 72 hours later, unless you refund it sooner.`
        : of.asClient
          ? `Cancelling now refunds ${of.amount} to you at once. The Protection Fee is kept.`
          : `Cancelling now refunds ${of.amount} to the Client at once.`,
    cancelReason: "Reason (optional)",
    cancelReasonHint: (asClient: boolean) =>
      `Only the ArtisanConnect Admin reads it; the ${asClient ? "Artisan" : "Client"} does not see it.`,
    cancelConfirm: (lead: string) => `Cancel this Job? ${lead} This cannot be undone.`,
    keepJob: "Keep the Job",
    completedTitle: "Completed",
    completedClientLead: "The work is approved, and the Labour was released to the Artisan.",
    completedArtisanLead:
      "The work is approved, and the Labour was released to you, less the Artisan Fee.",
    markComplete: "Mark the work complete",
    completionNote: "What was done",
    completionNoteHint: "The Client reads this with the photos before approving.",
    afterPhotos: "Photos of the finished work",
    afterPhotosHint: (max: number) => `1 to ${max} photos.`,
    certificate: (name: string) => name.charAt(0).toUpperCase() + name.slice(1),
    certificateHint: (name: string, neededOn: string) =>
      `The law requires a ${name} on ${neededOn}. A PDF or a photo of it, showing your registration number.`,
    documents: "Other documents (optional)",
    documentsHint: (max: number) =>
      `PDFs or photos, such as a guarantee or a data sheet. Up to ${max} documents in all.`,
    markCompleteConfirm:
      "Mark the work complete? The Client then has seven days to approve it or ask for a fix.",
    completionBeingChecked: "Your Completion is being checked",
    completionBeingCheckedLead:
      "Only you see it until the Admin has checked it. The Client is told once it is released, and their seven days start then.",
    withdrawCompletion: "Withdraw",
    completionRefused: (reason: string) => `The Admin refused your Completion: ${reason}`,
    approve: "Approve",
    approveConfirm: (labour: string | null) =>
      labour
        ? `Approve the work? This releases the Labour, ${labour}, to the Artisan, and cannot be undone.`
        : "Approve the work? This cannot be undone.",
    askFix: "Ask for a fix",
    fixNote: "What needs fixing",
    sendFix: "Send Fix request",
    cancel: "Cancel",
    fixRequestNote: "The Client's note",
    fixNoteBeingChecked:
      "The note is being checked. Only you see it until the Admin has checked it.",
    fixNoteHiddenArtisan: "The Client's note is being checked, and shows here once it is.",
    fixNoteRefusedClient: (reason: string) =>
      `The Admin refused your note, so the Artisan does not see it: ${reason}`,
    fixNoteRefusedArtisan:
      "The Client's note was not passed on. Ask them in Messages what needs fixing.",
    completion: "Completion",
    completionMade: (at: string) => `Marked complete ${at}`,
    photo: (index: number) => `Photo ${index}`,
    document: (index: number) => `Document ${index}`,
    certificateDocument: "Certificate",
    approvalBar: (by: string) => `Approved by silence on ${by}`,
    restBar: (by: string) => `The Labour not in Dispute is released on ${by}`,
    payments: "Payments",
    parts: {
      materials: { title: "Materials", released: "Released at Work started" },
      labour: { title: "Labour", released: "Released at Approval" },
    },
    partStates: {
      unreleased: "Paid in",
      released: "Released",
      refunded: "Refunded",
      "charged-back": "Charged back",
    },
    activity: "Activity",
    events: {
      "quote.sent": "Quote sent",
      hired: "Hired and paid",
      "work.started": "Work started",
      "completion.made": "Marked complete",
      "fix.requested": "Fix requested",
      approved: "Approved",
      cancelled: "Cancelled",
      refunded: "Refunded",
      "updated-quote.proposed": "Updated Quote proposed",
      "updated-quote.withdrawn": "Updated Quote withdrawn",
      "updated-quote.rejected": "Updated Quote rejected",
      "updated-quote.accepted": "Updated Quote accepted and paid",
      "dispute.opened": "Disputed",
      "dispute.settled": "Dispute settled",
      "dispute.decided": "Dispute decided by the Admin",
      "chargeback.opened": "Card Payment charged back",
      "chargeback.decided": "Chargeback decided by the Admin",
    },
    refunds: "Refunds",
    refundStates: {
      "on-its-way": "On its way",
      paid: "Refunded",
      owed: "Owed, paid by hand",
    },
    refundLine: (materials: string | null, labour: string | null) =>
      [materials && `Materials ${materials}`, labour && `Labour ${labour}`]
        .filter(Boolean)
        .join(", "),
    refundOwedLead:
      "The bank could not take a Refund, so it is still owed to the Client. ArtisanConnect pays it by bank transfer.",
    refund: "Refund",
    refundLead:
      "Refund any money not yet released, at any time: the Client's agreement is not needed. The Protection Fee is never refunded, and refunded money has no Artisan Fee taken.",
    refundUpTo: (part: string, amount: string) => `${part}, up to ${amount}`,
    refundSend: "Refund",
    refundConfirm: (amount: string) => `Refund ${amount} to the Client? This cannot be undone.`,
    cancelRefund: "Cancel",
    artisan: "Artisan",
    money: "Money",
    paidIn: "Paid in",
    released: "Released",
    unreleased: "Not yet released",
    held: "Held in Dispute",
    refunded: "Refunded",
    chargedBack: "Back to the Client by the Chargeback",
    protectionFee: "Protection Fee (not refunded)",
    artisanFee: "Artisan Fee",
    artisanFeeShown: (percent: number) => `${percent}% of each Release`,
    hiredQuote: "Hired Quote",
    address: "Address",
    chargeback: {
      frozenTitle: "Frozen by a Chargeback",
      frozenLead: (asClient: boolean) =>
        asClient
          ? "Your card Payment was charged back through your bank, so this Job is frozen and your Account is suspended. Nothing more is released, and nothing can be done on the Job until the Admin decides the money not yet released. Send a Support request to talk to us about it."
          : "The Client charged back their card Payment through their bank, so this Job is frozen. Money already released to you stays yours. Nothing more is released, and nothing can be done on the Job until the Admin decides the money not yet released.",
      decidedTitle: "Chargeback decided by the Admin",
      decidedLead: (of: {
        asClient: boolean;
        released: string;
        chargedBack: string | null;
        refunded: string | null;
        back: string;
        reason: string;
      }) =>
        of.asClient
          ? `The Admin decided the money your Chargeback froze: ${[
              `${of.released} is released to the Artisan`,
              of.chargedBack && `${of.chargedBack} stays with your bank's Chargeback`,
              of.refunded && `${of.refunded} is refunded to you`,
            ]
              .filter(Boolean)
              .join(", ")}. The Admin's reason: ${of.reason}`
          : `The Admin decided the money the Client's Chargeback froze: ${of.released} is released to you, and ${of.back} goes back to the Client. The Admin's reason: ${of.reason}`,
    },
    dispute: {
      title: "Disputed: the Admin decides",
      lead: (of: { own: boolean; asClient: boolean; held: string }) =>
        of.asClient
          ? of.own
            ? `You disputed part of the Labour, and ${of.held} is held. The Admin reads the Job, the Completion, and the Conversation, then splits what is held between the Artisan and you. Until then you may release it to the Artisan to settle.`
            : `The Artisan opened a Dispute, and ${of.held} of the Labour is held. The Admin reads the Job, the Completion, and the Conversation, then splits what is held between the Artisan and you. Until then you may release it to the Artisan to settle.`
          : of.own
            ? `You opened a Dispute, and ${of.held} of the Labour is held. The Admin reads the Job, the Completion, and the Conversation, then splits what is held between you and the Client. Until then you may refund it to settle, under Payments.`
            : `The Client disputed part of the Labour, and ${of.held} is held. The Admin reads the Job, the Completion, and the Conversation, then splits what is held between you and the Client. Until then you may refund it to settle, under Payments.`,
      card: "Dispute",
      against: {
        completion: "Against the Completion",
        "fix-request": "Against the Fix request",
        cancellation: "Against the Cancellation's refund of the Labour",
      },
      openedBy: (who: string, at: string) => `Opened by ${who} · ${at}`,
      you: "you",
      theClient: "the Client",
      theArtisan: "the Artisan",
      named: "Disputed",
      heldNow: "Held now",
      reason: "Reason",
      reasonHeld:
        "The Content check was unsure of your reason, so only the Admin reads it and its photos.",
      noReason: "The reason is for the Admin only.",
      states: { open: "Open", settled: "Settled", decided: "Decided" },
      settled: (at: string) => `Settled on ${at}, as nothing was held any more.`,
      decided: (at: string) => `Decided by the Admin on ${at}. The decision is final.`,
      releasedTo: (asClient: boolean) => (asClient ? "Released to the Artisan" : "Released to you"),
      refundedTo: (asClient: boolean) => (asClient ? "Refunded to you" : "Refunded to the Client"),
      decisionReason: "The Admin's reason",
      photo: (index: number) => `Dispute photo ${index}`,
      open: (asClient: boolean) => (asClient ? "Dispute part of the Labour" : "Open a Dispute"),
      clientLead: (labour: string) =>
        `Name how much of the Labour you dispute, up to ${labour}, and why. Only that is held for the Admin to decide; the rest is released when you approve or when the seven days end.`,
      artisanLead: (labour: string, until: string | null) =>
        `All the Labour not yet released, ${labour}, is held for the Admin to decide${until ? `, and is not refunded to the Client. Open it before ${until}` : ""}. Say why the work is done as quoted.`,
      amount: "Amount of the Labour disputed, in rands",
      why: "Why",
      photos: "Photos (optional)",
      photosHint: (max: number) => `Up to ${max} photos.`,
      send: "Open the Dispute",
      confirm: "Open a Dispute? The Admin's decision is final.",
      cancel: "Cancel",
      release: "Release from the Dispute",
      releaseLead: (held: string) =>
        `Release some or all of the ${held} held to the Artisan. Once nothing is held, the Dispute is settled.`,
      releaseAmount: "Amount to release, in rands",
      releaseSend: "Release",
      releaseConfirm: (amount: string) =>
        `Release ${amount} to the Artisan? This cannot be undone.`,
      approveRest: "Approve the Labour not in Dispute",
      approveRestConfirm: (rest: string) =>
        `Approve the work but for what is in Dispute? This releases ${rest} to the Artisan, and cannot be undone.`,
    },
    updatedQuote: {
      title: "Updated Quote",
      proposedClient: (at: string) => `The Artisan proposed it ${at}.`,
      proposedArtisan: (at: string) => `You proposed it ${at}. It is waiting for the Client.`,
      from: "Now",
      to: "Updated",
      total: "Total",
      difference: "Difference",
      fee: (percent: number) => `Protection Fee (${percent}%)`,
      youPay: "You pay",
      acknowledge: (fee: string) =>
        `I understand the Protection Fee of ${fee} is not refunded, whatever happens next.`,
      pay: (amount: string) => `Pay ${amount}`,
      payLead:
        "By card or Instant EFT. The new price applies once your Payment arrives. Reject it, and the price stays as it is.",
      reject: "Reject",
      rejectConfirm: "Reject this Updated Quote? The price stays as it is.",
      withdraw: "Withdraw",
      withdrawConfirm: "Withdraw your Updated Quote? The Client is told.",
      waiting:
        "You cannot mark the work complete while it waits. Once the Client pays the difference it applies; if they reject it, the price stays as it is.",
      propose: "Propose an Updated Quote",
      proposeLead:
        "Does the site differ from the Job? Before you mark the work complete, propose new Labour and Materials. Neither may go down; to lower the price, refund instead. It applies only once the Client pays the difference.",
      labour: "Labour",
      materials: "Materials",
      atLeast: (amount: string) => `At least ${amount}, the price now.`,
      clientSupplies: "The Client supplies the materials, so they stay at zero.",
      send: "Propose",
      sendConfirm: (adds: string) =>
        `Propose this Updated Quote? The Client is asked to pay the difference, ${adds}.`,
      cancel: "Cancel",
    },
  },
  fakeCheckout: {
    title: "Fake checkout",
    lead: "Launch money is fake: no money moves. Pay or fail this Payment as the provider's checkout would.",
    amount: "Amount",
    pay: "Pay",
    fail: "Fail the payment",
    closed: "This checkout is closed.",
    back: "Back to ArtisanConnect",
  },
  conversation: {
    tabs: {
      overview: "Overview",
      messages: (unread: number) => (unread > 0 ? `Messages (${unread})` : "Messages"),
    },
    none: "No Conversations yet. One opens with an Invitation or the first Quote.",
    noneArtisan: "No Conversation yet. One opens when you are invited or your Quote is Sent.",
    noName: "Name being checked",
    unread: (count: number) => `${count} new`,
    ended: "Ended",
    empty: "No messages yet.",
    adminMayRead:
      "The Admin may read this Conversation, for a Report, a Dispute, or a Chargeback. Before Payment, share no contact details, links, address, or surname, and pay only through ArtisanConnect.",
    adminMayReadAfterPayment:
      "The Admin may read this Conversation, for a Report, a Dispute, or a Chargeback. Now that the Job is paid, you may share phone numbers, emails, and the address. Share no bank details or payment links, and pay only through ArtisanConnect.",
    placeholder: "Write a message",
    photos: "Add photos",
    photosHint: (max: number) =>
      `Up to ${max} photos. No video, voice notes, or PDFs before Payment.`,
    photosChosen: (count: number) => (count === 1 ? "1 photo" : `${count} photos`),
    clearPhotos: "Remove photos",
    attach: "Attach",
    filesHint: (max: number) =>
      `Up to ${max} photos, PDFs, or voice notes of up to 5 minutes, each at most 10 MB. No video.`,
    filesChosen: (count: number) => (count === 1 ? "1 file" : `${count} files`),
    clearFiles: "Remove files",
    record: "Record a voice note",
    stopRecording: (seconds: number) => `Stop recording (${formatSeconds(seconds)})`,
    cannotRecord: "Your browser did not let ArtisanConnect use the microphone.",
    voiceNote: (seconds: number) => `Voice note, ${formatSeconds(seconds)}`,
    pdf: (index: number) => `PDF ${index}`,
    send: "Send",
    beingChecked: "Being checked",
    beingCheckedLead: "Only you see this until the Admin has checked it.",
    withdraw: "Withdraw",
    refused: (reason: string) => `Refused by the Admin: ${reason}`,
    readOnly: "This Conversation has ended. It stays here to read.",
    events: {
      "quote.sent": "Quote sent",
      hire: "Hired and paid",
      "work.started": "Work started",
      "completion.made": "Marked complete",
      "fix.requested": "Fix requested",
      approved: "Approved",
      refund: "Refunded",
      cancelled: "Cancelled",
      "dispute.opened": "Disputed",
      "dispute.released": "Released in Dispute",
      "dispute.settled": "Dispute settled",
      "dispute.decided": "Dispute decided by the Admin",
      "chargeback.opened": "Card Payment charged back",
      "chargeback.decided": "Chargeback decided by the Admin",
    } satisfies Record<MessageEvent, string>,
    photo: (index: number) => `Photo ${index}`,
    message: "Message",
  },
  match: {
    breadcrumb: "Home",
    badge: "Job Match",
    invitationBadge: "Invitation",
    nextStep: "Quote or pass",
    invitationLead: "The Client chose you and invited you to Quote on this Job.",
    lead: "Only your trade and Region are shown before Payment: the suburb and street stay private until the Client hires.",
    passLead: "Passing tells nobody.",
    pass: "Pass",
    passed: "You passed on this Job Match.",
    client: "Client",
    noName: "A Client",
    reviews: (average: number | null, count: number) =>
      average === null ? "No Reviews yet" : `${average.toFixed(1)} from ${count} Reviews`,
    completed: (count: number) => `${count} Completed`,
    region: "Region",
    gasWork: "Installs or removes gas",
  },
  regions: {
    title: "Regions",
    lead: "Choose one to three Regions you work in. You are offered Jobs only in these. Open a Region to see its suburbs.",
    suburbs: (count: number) => `${count} suburbs`,
    open: (region: string) => `Show the suburbs of ${region}`,
    close: (region: string) => `Hide the suburbs of ${region}`,
    chosen: (count: number, max: number) => `${count} of ${max} chosen`,
    save: "Save Regions",
    saved: "Your Regions are saved.",
    find: "Find your suburb",
    findLead: "See which Region a suburb is in.",
    findLabel: "Suburb",
    noMatch: "No official suburb matches that.",
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
    support: "Contact support",
    supportLink: "Write to the Admin",
    signOut: "Sign out",
    vat: {
      label: "VAT number",
      none: "Not VAT-registered",
      lead: "If you are VAT-registered, your Quotes' amounts include VAT.",
      change: "Change",
      add: "Add",
      save: "Save",
      remove: "Remove",
      cancel: "Cancel",
      saved: "Saved. Quotes you send or revise from now on carry it.",
      placeholder: "4123456789",
    },
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
  report: {
    action: "Report",
    job: "Report this Job",
    profile: "Report this Profile",
    why: "Why are you reporting it?",
    note: "Anything the Admin should know (optional)",
    lead: "Only the Admin reads your Report. You are told it was received; nobody is told who reported.",
    send: "Send to the Admin",
    cancel: "Cancel",
    made: "Reported. The Admin has it.",
  },
  standing: {
    suspended: "Your Account is suspended",
    suspendedLead: (reason: string) =>
      `${reason} While it is suspended you cannot post a Job, Quote, Hire, invite, or be offered a Job. Your paid Jobs go on.`,
    contest: "Write to support",
    since: (when: string) => `Since ${when}`,
    warnings: "Warnings",
    warned: (when: string) => `Warned ${when}`,
    none: "No warnings.",
  },
  support: {
    title: "Contact support",
    lead: "Write to the Admin about anything on ArtisanConnect. The answer comes to your Email.",
    topic: "What it is about",
    message: "Your message",
    send: "Send to the Admin",
    sent: "Sent. The Admin's answer will come to your Email.",
    yours: "Your requests",
    none: "You have not written to the Admin yet.",
    sentAt: (when: string) => `Sent ${when}`,
    waiting: "Waiting",
    answered: (when: string) => `Answered by email, ${when}`,
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
      floatShort: "The float cannot cover the Payouts and Refunds sent",
      floatShortLead: (float: string, needed: string, when: string) =>
        `The float holds ${float}, and the Payouts sent and not yet paid and the Refunds on their way need ${needed} (checked before the run, ${when}). The provider pauses what it cannot pay until the float is topped up.`,
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
      optional: (label: string) => `${label} (optional)`,
      record: "Record decision",
      recorded: (label: string) => `Decision recorded: ${label}`,
      by: (by: string, when: string) => `By ${by}, ${when}`,
      nothingAllowed: "No decision is allowed on this item now.",
      openRead: (label: string) => `Open ${label}`,
      logged: "(logged)",
      loggedNote: "Opening it is written to the audit log.",
      opened: (when: string) => `Opened at ${when}. Written to the audit log.`,
      timeline: "Timeline",
      pdf: "PDF, opens in a new tab",
      eachRow: "Decide each row on its own",
      rowsNow: "Each row as it stands now",
      noRows: "Nothing on this item is left to decide.",
      splitRefunded: "Refunded to the Client",
      splitOf: (total: string, whole = "held") => `Of ${total} ${whole}`,
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
    payouts: {
      title: "Payouts",
      lead: "Each Artisan still owed money, and each whose Payouts are held. A held Artisan's Payouts wait; lifting the hold sends them in the next daily run. Each is written to the audit log and told to the Artisan.",
      empty: "No Artisan is owed money, and none is held.",
      unpaid: "Unpaid",
      held: "Held",
      hold: "Hold Payouts",
      lift: "Lift the hold",
      history: "Money history",
    },
    people: {
      title: "People",
      lead: "Find a Client or an Artisan by name or Email, and act on them: warn, suspend, or lift a Suspension; hold or free an Artisan's Payouts. Each is told to the Account and written to the audit log.",
      search: "Name or Email",
      find: "Find",
      empty: "Nobody matches.",
      suspended: "Suspended",
      payoutsHeld: "Payouts held",
      signedUp: (when: string) => `Signed up ${when}`,
      act: "Act on this Account",
      suspendedSince: (when: string) => `Suspended since ${when}`,
      acts: { warn: "Warn", suspend: "Suspend", lift: "Lift the Suspension" },
      reason: "Reason",
      liftNote: "Note (optional)",
      told: {
        warn: "Told: the Account, with the reason. Warnings stay.",
        suspend:
          "Told: the Account, with the reason. Its Open Jobs close and its Sent Quotes are Withdrawn; its paid Jobs go on.",
        lift: "Told: the Account. Its warnings stay.",
      },
      record: "Record",
      done: {
        warn: "Warned.",
        suspend: "Suspended.",
        lift: "The Suspension is lifted.",
      },
      history: "Warnings and Suspensions",
      noHistory: "No warnings or Suspensions.",
      warned: (reason: string, leaving: boolean) =>
        `Warned${leaving ? " for Leaving" : ""}: ${reason}`,
      suspendedFor: (reason: string, leaving: boolean, bySystem: boolean) =>
        `Suspended${leaving ? " for Leaving" : ""}${bySystem ? " by the system (Chargeback)" : ""}: ${reason}`,
      lifted: "Suspension lifted",
      payoutsHeldLead: "Their Payouts are held: they wait until the hold is lifted.",
      payoutsFreeLead: "Their Payouts go in each daily run.",
      artisanRecord: {
        title: "Artisan record",
        byArtisan: "Cancelled by the Artisan",
        byClients: "Cancelled by Clients before Work started",
        disputes: "Disputes decided against the Artisan",
        cancellation: (
          job: string,
          by: "client" | "artisan",
          after: boolean,
          reason: string | null,
        ) =>
          `${job}: cancelled by the ${by === "client" ? "Client" : "Artisan"} ${after ? "after" : "before"} Work started.${reason ? ` “${reason}”` : ""}`,
        dispute: (job: string, refunded: string, held: string) =>
          `${job}: Dispute decided, ${refunded} of the ${held} held refunded to the Client.`,
      },
    },
    history: {
      lead: "Each Release owed to this Artisan, newest first, with every Payout of it. A Payout the bank refused or sent back leaves the Release owed again; the next goes to a new Payout account once you accept one in Verification.",
      empty: "No Releases yet.",
      paid: "Paid",
      noPayout: "No Payout yet.",
      payout: (reference: string) => `Payout ${reference}`,
      sentOn: (when: string) => `sent ${when}`,
      paidOn: (when: string) => `paid ${when}`,
      stoppedOn: (state: string, when: string) => `${state.toLowerCase()} ${when}`,
      reason: (reason: string) => `Bank's reason: ${reason}`,
    },
    audit: {
      title: "Audit log",
      lead: "Every Admin decision and every logged read: who, what, and when, with what the system logs for you, such as a Payout the bank sent back. Newest first. Nothing in it can be changed.",
      empty: "Nothing has been logged yet.",
      system: "ArtisanConnect",
      older: "Older",
    },
  },
  notBuilt: "This page is not built yet.",
  devMail: { title: "Local mailbox", empty: "No email sent since the app started." },
  notAPerson: "Complete the check above first.",
} as const;

/** A date as South Africans read it. */
/** A length of time as minutes and seconds: "4:05". */
export function formatSeconds(seconds: number): string {
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

export function formatDate(date: Date | string): string {
  return formatTime(new Date(date));
}
