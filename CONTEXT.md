# ArtisanConnect

ArtisanConnect is a Cape Town marketplace on which a Client hires an Artisan for fixed-price work paid by Milestones, and the request, the work, and the money stay on the platform.

## Language

### Parties

**Account**:
The only party that signs in and acts: a Client or an Artisan, never both, held by one named person of at least 18 with one Email and a mobile number.
_Avoid_: User, Member, Owner, Operator

**Client**:
The Account that posts a Job and pays for an Engagement. It needs no Admin approval and gives no Identity Number.
_Avoid_: Employer, Customer, Buyer

**Artisan**:
The Account that sends a Quote and is paid for an Engagement. It is the named person; its public name may be a trading name.
_Avoid_: Seller, Contractor, Tradesman, Service provider, Worker

**Admin**:
The one staff identity, created by setup, that is not an Account and holds every staff power. Every Admin act is logged.
_Avoid_: Moderator, Operator, grant, role

**Visitor**:
A person who is not signed in. A Visitor sees only the landing page, sign-up, and sign-in.
_Avoid_: Guest, Anonymous user

**Identity Number**:
An Artisan's South African ID number, or passport number and issuing country, read from the identity document by the Admin. One Identity Number holds at most one Artisan Account.
_Avoid_: ID, Credential

**Email code**:
A code sent to an Email to prove its holder has it, at sign-up, recovery, reopening, and a change of Email. It works once, for ten minutes.
_Avoid_: OTP, Verification code

**Suspended**:
An Account the Admin has stopped from starting new work. Its open Engagements continue, and the Admin may also hold its Payouts.
_Avoid_: Banned, Blocked, Deactivated

**Closed**:
An Account its person has closed while it had no open Engagement. It keeps its Reviews and may be reopened with an Email code.
_Avoid_: Deleted

### Place and trade

**Region**:
One of the City of Cape Town's eight Development Management Districts. An Artisan selects one or more, and sees Open Jobs only in those.
_Avoid_: Zone, Area, Service Area

**Suburb**:
One of the City's official suburbs, which the Client picks to place a Job. Each belongs to exactly one Region.
_Avoid_: Neighbourhood, Area

**Service Category**:
One of the eight launch trades a Job is posted in and an Artisan is verified for: Plumbing, Electrical, Carpentry and cabinetry, Painting, Tiling, Brickwork and plastering, Roofing, Welding and metalwork.
_Avoid_: Skill, Specialty, Subcategory

**Site type**:
Home or Business, a label on a Job that changes no rule.
_Avoid_: Property type

### Work

**Job**:
A Client's request for work. It is Draft, Open, Closed, or Hired, and is never shown to a Visitor.
_Avoid_: Lead, Project, Order, Booking

**Open Job**:
A Job any Artisan may see who is verified for its Service Category, has selected its Region, and is Available for Jobs. It takes Quotes for 14 days or until it has five.
_Avoid_: Public job, Listing

**Invite-only Job**:
A Job only the Artisans the Client invites may see.
_Avoid_: Private job, Direct hire

**Invitation**:
A Client's request to one Artisan to Quote on a Job.
_Avoid_: Lead, Job Match

**Available for Jobs**:
The Artisan's switch for receiving new Open Jobs and Invitations. Turning it off does not hide the Artisan Profile.
_Avoid_: Online, Calendar

**Artisan Profile**:
An Artisan's page, seen only by signed-in Accounts. It shows no direct contact.
_Avoid_: Listing, Storefront

**Quote**:
An Artisan's fixed-price proposal on a Job: a scope, one or more Milestones, a start date, a duration, who supplies materials, and an optional Warranty. It is Sent for seven days and may be revised until it is Hired, Declined, Withdrawn, or Expired.
_Avoid_: Offer, Bid, Estimate, Proposal

**Milestone**:
A titled, priced part of an Engagement, funded at Payment and later Released or Returned. It is Funded, Submitted, Disputed, Released, or Returned.
_Avoid_: Stage, Phase, Instalment

**Hire**:
The Client's choice of a Sent Quote, made by paying for it. It closes the Job to other Quotes, which become Declined, and shows each party the other's mobile number and the site address.
_Avoid_: Accept, Offer, Booking

**Engagement**:
A Hired Quote's work and money. It is Active until every Milestone is Released or Returned, then Completed if any money was Released, or Returned if none was.
_Avoid_: Contract, Booking, Order

**Submission**:
The Artisan's statement that a Milestone is done, with a note and at least one photo. Submitting the last open Milestone also needs the Job's Completion evidence.
_Avoid_: Mark complete, Delivery

**Request changes**:
The Client's answer to a Submission that sends the Milestone back to Funded with a note. A new Submission starts a new Auto-release.
_Avoid_: Reject, Revision

**Completion evidence**:
A certificate the law requires before electrical or gas work is handed over: a certificate of compliance on an Electrical Job, a certificate of conformity on a Plumbing Job that installs or removes gas.
_Avoid_: CoC, Compliance document

**Ending**:
Either Account's act to stop an Engagement early. If the Artisan ends, unsubmitted Milestones are Returned; if the Client ends, they are Returned unless the Artisan opens a Dispute within 72 hours.
_Avoid_: Cancellation, Termination

**Hire Again**:
The Client's act of opening an Invite-only Job for an Artisan they have a Completed Engagement with, prefilled from that Engagement.
_Avoid_: Rehire, Repeat booking

**Conversation**:
The messages between one Client and one Artisan on one Job, which the Admin may read and not write in. Before Hire it takes only text and photos.
_Avoid_: Chat, Inbox, DM

### Money

**Payment**:
Money the Client pays in: the Hired Quote plus the Protection Fee, or a new Milestone plus its Protection Fee.
_Avoid_: Escrow, Wallet, Balance, Deposit

**Protection Fee**:
The Client's 5% charge on each Payment. It is never refunded.
_Avoid_: Service fee, Platform fee, Commission

**Artisan Fee**:
The platform's share of each Release, set at Hire: 10% if the Client Relationship has no Completed Engagement yet, 5% if it has one. It is never refunded.
_Avoid_: Commission, Service fee

**Release**:
Sending a Milestone's money to the Artisan, less the Artisan Fee, by the Client's choice, an Auto-release, or the Admin's decision in a Dispute.
_Avoid_: Approve, Pay out

**Auto-release**:
The Release of a Submitted Milestone the Client has not answered 72 hours after its Submission.
_Avoid_: Silence, Timeout

**Return**:
Money from an unreleased Milestone sent back to the Client, without the Protection Fee, by the Artisan's choice, an Ending, or the Admin's decision in a Dispute.
_Avoid_: Refund

**Dispute**:
Either Account's request that the Admin decide how much of one unreleased Milestone is Released and how much Returned. The parties may still Release or Return it until the Admin decides, and the Admin's decision is final.
_Avoid_: Appeal, Complaint, Claim

**Payout**:
Money sent to the Artisan's Payout account after a Release, in the next daily run. Once sent it does not come back.
_Avoid_: Withdrawal, Settlement

**Payout account**:
The bank account in the Artisan's own name, proven by a bank letter, that Payouts are sent to. No two Artisans may hold the same one.
_Avoid_: Wallet, Bank details

**Chargeback**:
A card Payment reversed by the bank. It freezes the Engagement for the Admin, and any Payout already sent stays the platform's loss.
_Avoid_: Reversal, Refund

### Trust

**Verification**:
The Admin's acceptance of an Artisan's documents. Once: an identity document with a selfie holding it, a work permit if the document is a foreign passport, and a Payout account. Per Service Category: three photos of their own work and any Credential that category needs.
_Avoid_: Vetting, KYC

**Credential**:
A legal permission a Service Category requires: a trained plumber for Plumbing, a gas practitioner for gas work, a registered person and electrical contractor registration for Electrical.
_Avoid_: Certificate, Licence

**Verification Badge**:
One check the Admin has accepted, shown on the Artisan Profile with its expiry date when it expires. It is not a promise that the work will be good.
_Avoid_: Vetted, Guarantee

**Warranty**:
A promise the Artisan makes on a Quote. The platform does not make or enforce one.
_Avoid_: Guarantee

**Marketplace rules**:
The rules every Account accepts at sign-up and again after each change.
_Avoid_: Terms, Policy

**Review**:
A 1 to 5 rating with an optional comment, one from each party after an Engagement is Completed. Neither can read the other's until both submit or 14 days pass.
_Avoid_: Feedback, Score, Reputation

**Report**:
A signed-in Account's complaint about a Job, Quote, message, Artisan Profile, or Review, which goes to the Admin.
_Avoid_: Ticket, Complaint, Flag

**Leaving**:
An attempt, found by the Admin, to move a Job, its work, or its money off the platform. The first is a warning; the second is a Suspension.
_Avoid_: Circumvention, Leakage

### Relationship

**Client Relationship**:
The pair of one Client and one Artisan.
_Avoid_: Lock-in, Repeat customer

**Protected Relationship Period**:
The 365 days after the first Payment in a Client Relationship, during which all work between them belongs on the platform.
_Avoid_: Lock-in, Exclusivity
