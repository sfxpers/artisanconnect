# ArtisanConnect

ArtisanConnect is a marketplace on which a Client hires an Artisan, and the request, the paid work, and the money stay on the platform.

## Language

### Parties

**Account**:
The only party that signs in and acts, either a Client or an Artisan, never both, with one named person of at least 18 acting for it. That person's name is an attribute, not a second party; the person is not replaced, the kind does not change, and a human holds at most one of each.
_Avoid_: User, Member, Owner, Operator

**Identity Number**:
The named person's South African ID number or recognised refugee identity document number, or, if they have neither, their passport number and its issuing country. An Account is not held without one, and closing that Account does not free it for the same kind.
_Avoid_: Person-fact, ID, Credential, Asylum-seeker permit

**Client**:
The Account that posts a Job and pays for an Engagement. Its public name may be the named person or a trading name, and that name is not a key.
_Avoid_: Employer, Customer, Buyer, Client organization, Client Business

**Artisan**:
The Account that proposes a Quote and is paid for an Engagement. It is the named person, and its public name may be that person or a trading name, not a key.
_Avoid_: Seller, Contractor, Tradesman, Service provider, Solo Artisan, Artisan Business, Worker

**Admin**:
A staff identity that is not an Account. It cannot hold a Job or an Engagement, and it does not act as an Account.
_Avoid_: User, Moderator

**Visitor**:
A person with no Account, and not a party.
_Avoid_: Guest, Anonymous user, User

### Work

**Job**:
A Client's private request for work, before anyone is paid.
_Avoid_: Lead, Deal, Order, Booking, Project

**Artisan Chosen**:
A Job with an accepted Quote that the Client has not yet paid. It is not an Engagement.
_Avoid_: Pending Engagement, Unfunded Engagement

**Engagement**:
A Job once a Quote has been accepted and the Client has paid. One Job leads to at most one Engagement.
_Avoid_: Managed Engagement, Lead, Deal, Order, Booking, Project

**Quote**:
An Artisan's priced proposal on a Job that is not yet an Engagement. A change before the Client accepts it is still that Quote.
_Avoid_: Offer, Bid, Estimate

**Updated Quote**:
A proposed change to the price or scope of an Engagement. It does not apply until the Client accepts it.
_Avoid_: Variation, Change order

**Service Category**:
An Admin-controlled trade a Job is posted in and an Artisan is verified for.
_Avoid_: Subcategory, Specialty, Skill

**Service**:
A line of work an Artisan describes publicly. It does not decide who may Quote, and a Job does not select one.
_Avoid_: Subcategory, Specialty, Skill

**Labour**:
The part of a Quote that is the Artisan's work.
_Avoid_: Call-out

**Materials**:
The part of a Quote that is the goods, priced apart from Labour.
_Avoid_: Parts, Supplies

### Money

**Payment**:
Money the Client pays in for an Engagement: the accepted Quote plus the Protection Fee, including any further amount after an accepted Updated Quote. Until Released, it is still a Payment, not a separate balance.
_Avoid_: Escrow, Wallet, Balance, Held funds

**Payout**:
Money sent to the Artisan's verified payout account. It is the Artisan's share of the accepted Quote after the Artisan Fee. The Protection Fee is never part of a Payout.
_Avoid_: Withdrawal, Settlement

**Release**:
The Client's decision that the accepted-Quote portion of a Payment may be sent as a Payout. One Payment may be Released in more than one part. Each part is still a Release.
_Avoid_: Release Payment, Milestone

**Protection Fee**:
The Client's charge, added on top of the accepted Quote. It is part of the Payment and is never Released.
_Avoid_: Commission, Service fee, Platform fee

**Artisan Fee**:
The charge taken from the Artisan, on Labour only, not on Materials.
_Avoid_: Commission, Service fee, Platform fee

### Trust

**Verification Badge**:
One completed platform check, shown with its validity. It is not a promise that the work will be good.
_Avoid_: Vetted, Guarantee

**Credential**:
A statutory permission a Verification Badge may evidence. It is not itself a badge.
_Avoid_: Badge

**Warranty**:
A promise the Artisan makes on a Quote. It is not a Verification Badge, and the platform does not make one.
_Avoid_: Guarantee, Platform warranty

**Review**:
A Service Category-scoped rating one party writes about the other after a paid Engagement.
_Avoid_: Reputation, Feedback, Score

**Reliability Record**:
The platform's record of an Artisan's conduct, including Cancellation and no-show. It is not a Review.
_Avoid_: Reputation, Feedback, Score

### Relationship

**Client Relationship**:
The pair of one Client Account and one Artisan Account.
_Avoid_: Lock-in, Exclusivity, Repeat customer

**Protected Relationship Period**:
The time after the first paid Engagement in a Client Relationship during which further work between those Accounts belongs on the platform. Cancellation does not end it.
_Avoid_: Lock-in, Exclusivity
