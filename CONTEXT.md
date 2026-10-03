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

### Trust

**Marketplace rules**:
The rules every Account accepts at sign-up and again after each change, with consent to how its personal data is used.
_Avoid_: Terms, Policy
