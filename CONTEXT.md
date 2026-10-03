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
A staff identity that is not an Account and holds every staff power. The first is created by setup; an Admin may invite another by Email, and may remove one but never the last. Every Admin act is logged.
_Avoid_: Moderator, Operator, grant, role

**Visitor**:
A person who is not signed in. A Visitor may browse Artisan Profiles and nothing else; posting, inviting, and hiring need an Account.
_Avoid_: Guest, Anonymous user

**Identity Number**:
An Artisan's South African ID number, or passport number and issuing country, read by the Admin from the identity document. One Identity Number holds at most one Artisan Account.
_Avoid_: ID, Credential

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
An Artisan's public page, which anyone may open, with no direct contact. Every edit shows only once the Admin approves it.
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
The rules every Account accepts at sign-up and again after each change, with consent to how its personal data is used.
_Avoid_: Terms, Policy
