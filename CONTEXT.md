# ArtisanConnect

ArtisanConnect is a Cape Town marketplace on which a Client hires a verified Artisan for a fixed-price Job, pays before the work, and the request, the work, and the money stay on the platform.

## Language

### Parties

**Account**:
The only party that signs in and acts: a Client or an Artisan, never both, held by one named person of at least 18 with one Email.
_Avoid_: User, Member, Owner, Operator

**Client**:
The Account that posts a Job and pays for it. It needs no Admin approval and gives no Identity Number.
_Avoid_: Employer, Customer, Buyer

**Artisan**:
The Account that sends a Quote and is paid for the work. It is the named person; its public name may be a trading name.
_Avoid_: Seller, Contractor, Tradesman, Service provider, Worker

**Admin**:
The one staff identity, created by setup, that is not an Account and holds every staff power. Every Admin act is logged.
_Avoid_: Moderator, Operator, grant, role

**Visitor**:
A person who is not signed in. A Visitor sees only the landing page, sign-up, and sign-in.
_Avoid_: Guest, Anonymous user

**Identity Number**:
An Artisan's South African ID number, or passport number and issuing country, read by the Admin from the identity document. One Identity Number holds at most one Artisan Account.
_Avoid_: ID, Credential

**Email code**:
A code sent to an Email to prove its holder has it, at sign-up, recovery, reopening, and a change of Email. It works once, for ten minutes.
_Avoid_: OTP, Verification code

**Suspended**:
An Account the Admin has stopped from starting new work. Its paid Jobs continue, and the Admin may also hold its Payouts.
_Avoid_: Banned, Blocked, Deactivated

**Closed**:
An Account its person has closed while it had no paid Job in progress. It keeps its Reviews and may be reopened with an Email code.
_Avoid_: Deleted

### Place and trade

**Region**:
One of the City of Cape Town's eight Development Management Districts. An Artisan selects up to three and is offered Jobs only in those.
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

### Finding an Artisan

**Job**:
A Client's request for work, which is Draft, Open, Expired, Closed, or Hired. It is never shown to a Visitor.
_Avoid_: Lead, Project, Order, Booking

**Invite-only Job**:
A Job the platform does not offer to anyone, seen only by the Artisans the Client invites.
_Avoid_: Private job, Direct hire

**Batch**:
The up to ten Artisans a Job is offered to at once: those eligible who were offered a Job least recently. A further Batch follows every 24 hours while the Job is Open with fewer than five Quotes.
_Avoid_: Broadcast, Round

**Job Match**:
The offer of a Job to one Artisan in a Batch. The Artisan may Quote or pass.
_Avoid_: Lead, Dispatch, Assignment

**Invitation**:
A Client's request to one Artisan to Quote on a Job. It reaches the Artisan even if they passed on a Job Match for it.
_Avoid_: Lead, Direct hire

**Available for Jobs**:
The Artisan's switch for receiving Job Matches. Turning it off does not hide the Artisan Profile.
_Avoid_: Online, Calendar

**Artisan Profile**:
An Artisan's page, seen only by signed-in Accounts. A change of its public name or photo shows only once the Admin approves it.
_Avoid_: Listing, Storefront

**Quote**:
An Artisan's fixed price on a Job: a scope, Labour, Materials, who supplies the materials, a start date, a duration, and an optional Warranty, totalling at least R300. It is Sent for 14 days and may be revised until it is Hired, Declined, Withdrawn, or Expired.
_Avoid_: Offer, Bid, Estimate, Proposal

**Labour**:
The part of a Quote that pays for the Artisan's work, released at Approval.
_Avoid_: Call-out, Service charge

**Materials**:
The part of a Quote that pays for goods the Artisan supplies, released at Work started. It is zero when the Client supplies them.
_Avoid_: Deposit, Parts, Supplies

**Hire**:
The Client's choice of a Sent Quote, made by paying for it. Other Sent Quotes on that Job become Declined.
_Avoid_: Accept, Booking

**Conversation**:
The messages between one Client and one Artisan on one Job, opened by a Quote or an Invitation. The Admin may read it and not write in it; before Payment it takes only text and photos.
_Avoid_: Chat, Inbox, DM

### Doing the work

**Engagement**:
A Hired Quote's work and money. It is Paid, Work started, Awaiting approval, Fix requested, Disputed, Completed, or Cancelled.
_Avoid_: Contract, Booking, Order

**Work started**:
The moment the Artisan is working on site, set by the Client, or by the Artisan when the Client does not answer "Not started" within 24 hours. It releases the Materials.
_Avoid_: Start code, Check-in

**Completion**:
The Artisan's statement that the work is done, with a note, at least one after-work photo, and any Completion evidence. It needs Work started first.
_Avoid_: Mark done, Delivery

**Completion evidence**:
A certificate the law requires before the work is handed over: a certificate of compliance on an Electrical Job, a certificate of conformity on a Plumbing Job that installs or removes gas.
_Avoid_: CoC, Compliance document

**Approval**:
The Client's acceptance of a Completion, which releases the Labour. Silence for seven days after a Completion is Approval.
_Avoid_: Sign-off, Accept

**Fix request**:
The Client's answer to a Completion asking the Artisan to put something right. The next Completion starts a new seven days.
_Avoid_: Rework order, Rejection

**Updated Quote**:
The Artisan's proposed new Labour and Materials before Completion. Neither line may go down. It applies when the Client pays the difference.
_Avoid_: Variation, Change order

**Cancellation**:
Either Account's ending of an Engagement before Approval. Before Work started the Client is refunded at once; after it, the unreleased Labour is refunded after 72 hours unless the Artisan opens a Dispute.
_Avoid_: Termination, Withdrawal

**Dispute**:
A request that the Admin decide how much of a held amount of Labour is released and how much refunded. The Client opens one for a named amount at Completion; the Artisan opens one against a Fix request or a Cancellation. The Admin's decision is final.
_Avoid_: Appeal, Complaint, Claim

**Hire Again**:
The Client's act of opening an Invite-only Job for an Artisan they have a Completed Engagement with, prefilled from it.
_Avoid_: Rehire, Repeat booking

### Money

**Payment**:
Money the Client pays in: the Hired Quote plus the Protection Fee, or an Updated Quote's difference plus its Protection Fee.
_Avoid_: Escrow, Wallet, Balance, Deposit

**Protection Fee**:
The Client's 5% charge on each Payment. It is never refunded.
_Avoid_: Service fee, Platform fee, Commission

**Artisan Fee**:
The platform's share of each Release, set at Hire: 10% if the Client Relationship has no Completed Engagement yet, 5% if it has one. It is never refunded.
_Avoid_: Commission, Service fee

**Release**:
Sending Materials or Labour to the Artisan, less the Artisan Fee.
_Avoid_: Approve, Pay out

**Refund**:
Unreleased money sent back to the Client, without the Protection Fee, by the Artisan's choice at any time, a Cancellation, or the Admin's decision in a Dispute.
_Avoid_: Return, Reversal

**Payout**:
Money sent to the Artisan's Payout account after a Release, in the next daily run. Once sent it does not come back.
_Avoid_: Withdrawal, Settlement

**Payout account**:
The bank account in the Artisan's own name, proven by a bank letter, that Payouts are sent to. No two Artisans may hold the same one.
_Avoid_: Wallet, Bank details

**Chargeback**:
A card Payment reversed by the bank. It freezes the Engagement for the Admin, and a Payout already sent stays the platform's loss.
_Avoid_: Reversal

### Trust

**Verification**:
The Admin's acceptance of an Artisan's documents. Once: an identity document with a selfie holding it, a work permit if it is a foreign passport, and a Payout account. Per Service Category: three photos of their own work and any Credential that category needs.
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
A 1 to 5 rating with an optional comment, one from each party once an Engagement is Completed. Neither can read the other's until both submit or seven days pass.
_Avoid_: Feedback, Score, Reputation

**Artisan record**:
The Admin's view of an Artisan's Cancellations, Cancellations by Clients before Work started, and Disputes decided against them. No Account sees it.
_Avoid_: Reliability score, Reputation

**Report**:
A signed-in Account's complaint about a Job, Quote, message, Artisan Profile, or Review, which goes to the Admin.
_Avoid_: Ticket, Flag

**Leaving**:
An attempt, found by the Admin, to move a Job, its work, or its money off the platform. The first is a warning and the second a Suspension; one that openly dodges the fees is a Suspension at once.
_Avoid_: Circumvention, Leakage

### Relationship

**Client Relationship**:
The pair of one Client and one Artisan.
_Avoid_: Lock-in, Repeat customer

**Protected Relationship Period**:
The 365 days after the first Payment in a Client Relationship, during which all work between them belongs on the platform.
_Avoid_: Lock-in, Exclusivity
