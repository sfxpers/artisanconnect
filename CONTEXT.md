# ArtisanConnect

ArtisanConnect is a marketplace on which a Client hires an Artisan, and the request, the paid work, and the money stay on the platform.

## Language

### Parties

**Account**:
The only party that signs in and acts, either a Client or an Artisan, never both, with one named person of at least 18 acting for it. That person's name is an attribute, not a second party; the person is not replaced, the kind does not change, and a human holds at most one of each.
_Avoid_: User, Member, Owner, Operator

**Identity Number**:
The named person's South African ID number or recognised refugee identity document number, or, if they have neither, their passport number and its issuing country. An Account is not held without one. Closing does not free it for the same kind, except when a closed Account's number is found not to be the named person's. A new Account held with that freed number does not inherit the closed one.
_Avoid_: Person-fact, ID, Credential, Asylum-seeker permit

**Email**:
The address an Account signs in with. One email is one Account. It is not the Identity Number, and an Admin's address is not one.
_Avoid_: login, username, phone

**Client**:
The Account that posts a Job and pays for an Engagement. Its public name may be the named person or a trading name, and that name is not a key.
_Avoid_: Employer, Customer, Buyer, Client organization, Client Business

**Artisan**:
The Account that proposes a Quote and is paid for an Engagement. It is the named person, and its public name may be that person or a trading name, not a key.
_Avoid_: Seller, Contractor, Tradesman, Service provider, Solo Artisan, Artisan Business, Worker

**Admin**:
A staff identity that is not an Account. It holds one or more of verification, marketplace operations, trust and safety, and finance and disputes, and one person may hold more than one. It cannot hold a Job or an Engagement, and it does not act as an Account.
_Avoid_: User, Moderator

**Visitor**:
A person with no Account, and not a party.
_Avoid_: Guest, Anonymous user, User

### Work

**Job**:
A Client's private request for work, before anyone is paid. From the moment it can be matched until she pays, she may end it. That end is final, and it is not a Cancellation.
_Avoid_: Lead, Deal, Order, Booking, Project

**Site type**:
Home or Business, a label on a Job, not a kind of Account. A Home Site Job is one whose Site type is Home; a Business Site Job is one whose Site type is Business.
_Avoid_: Client organization, commercial Job, premises, property type

**Region**:
A named area Admin has opened and edged. A Job is posted in one. An Artisan selects at most three, and is matched only in those.
_Avoid_: Zone, Suburb, Service Area, Reach, Ward, Subcouncil

**Job Match**:
The platform's offer of a Job to an Artisan who is verified for its Service Category and has selected its Region.
_Avoid_: Lead, Dispatch, Assignment

**Artisan Invitation**:
A Client's choice that shows a Job to one Artisan who is verified for its Service Category and has selected its Region. It is not a Job Match.
_Avoid_: Request, Direct hire, Lead

**Artisan Profile**:
The public page of an Artisan. A Visitor may open it. It shows no direct contact.
_Avoid_: Listing, Storefront

**Available for Jobs**:
The Artisan's choice to receive new Job Matches and Artisan Invitations. Turning it off does not hide the Artisan Profile.
_Avoid_: Online, Calendar, Schedule

**Artisan Chosen**:
A Job with an accepted Quote that the Client has not yet paid. It is not an Engagement.
_Avoid_: Pending Engagement, Unfunded Engagement

**Engagement**:
A Job once a Quote has been accepted and the Client has paid. One Job leads to at most one Engagement. The Artisan does not start the work before that Payment.
_Avoid_: Managed Engagement, Lead, Deal, Order, Booking, Project

**Quote**:
An Artisan's priced proposal on a Job. One Artisan has one on a Job. It is accepted when the Artisan confirms the start date and duration the Client entered, and a change before that is still that Quote.
_Avoid_: Offer, Bid, Estimate

**Declined**:
A Quote the Client rejected before one on that Job was accepted. It is not Not chosen, and it does not become open again.
_Avoid_: Rejected, Lost

**Withdrawn**:
A Quote the Artisan pulled back before it was accepted. It does not become open again.
_Avoid_: Declined, Cancelled

**Not chosen**:
A Quote that was still Sent when another Quote on that Job was accepted. It does not become Sent again, and it does not become Expired.
_Avoid_: Lost, Rejected, Unsuccessful, Closed

**Updated Quote**:
A proposed change to the price, scope, or Warranty of an Engagement. It does not apply until the Client accepts it.
_Avoid_: Variation, Change order

**Preferred start**:
The date the Client would like a Job to begin, or absent. It is not the start date on a Quote.
_Avoid_: booking, schedule

**Schedule change**:
A new start date and duration the Client enters after a Quote is accepted. It applies only when the Artisan confirms it, and it is not an Updated Quote.
_Avoid_: Reschedule, Booking

**Completion**:
The Artisan's statement that the work is done. It has not happened unless it carries a note, at least one after-work photo, and every piece of Completion evidence that Job requires.
_Avoid_: Mark, Start Confirmation, Work Started

**Completed**:
An Engagement with a Completion, of which some of the accepted-Quote portion has been Released and none is still unreleased or held. A Cancellation is not one. A full Return is not one.
_Avoid_: Closed, Finished

**Completion evidence**:
A document a Completion must carry when that Job requires it, beyond the note and the after-work photo. It is not a Verification Badge.
_Avoid_: Compliance document, certificate

**Certificate of compliance**:
The Completion evidence an Electrical Job requires, for that installation. It is not a Verification Badge, and it is not a PIRB certificate.
_Avoid_: CoC, compliance document, electrical certificate

**Certificate of conformity**:
The Completion evidence a Plumbing Job requires when that work includes installing or removing a gas appliance, gas system, or gas reticulation. It is not a Verification Badge.
_Avoid_: Gas certificate, CoC

**Cancellation**:
An ending of an Engagement before Completion, requested by either Account. It is not a walk-away before Payment. His is on the Reliability Record. Hers is not.
_Avoid_: Refund, Withdrawal

**No-show**:
A finding, on a Cancellation she requested, that he had not attended by the agreed start date. It is on his Reliability Record. His own Cancellation is not one.
_Avoid_: Cancellation

**Service Category**:
A trade a Job is posted in and an Artisan is verified for. The launch set is fixed, a participant cannot invent one, and verified for means every check that category requires is current.
_Avoid_: Subcategory, Specialty, Skill, free-text category

**Service**:
A line of work an Artisan describes publicly. It does not decide who may Quote, and a Job does not select one.
_Avoid_: Subcategory, Specialty, Skill

**Labour**:
The part of a Quote that is the Artisan's work, including any attendance. There is no separate call-out charge.
_Avoid_: Call-out

**Materials**:
The goods in a Quote, priced apart from Labour. The amount is what the Artisan charges, and it is zero when the Client supplies them.
_Avoid_: Parts, Supplies

### Money

**Payment**:
Money the Client pays in for an Engagement: the accepted Quote plus the Protection Fee, including any further amount after an accepted Updated Quote. Until Released, it is still a Payment, not a separate balance.
_Avoid_: Escrow, Wallet, Balance, Held funds

**Payout**:
Money sent to the Artisan's verified payout account. It is the Artisan's share of the accepted Quote after the Artisan Fee. The Protection Fee is never part of a Payout.
_Avoid_: Withdrawal, Settlement

**Release**:
Sending the accepted-Quote portion of a Payment as a Payout, in one part or more. It is the Client's decision, or silence after Completion.
_Avoid_: Release Payment, Milestone

**Dispute**:
The Client's claim, after Completion, against a named amount of the accepted-Quote portion that has not been Released. The amount is greater than zero and no greater than that unreleased portion. One Engagement has one. It is not an ending, and it is not a Cancellation.
_Avoid_: Refund, appeal

**Return**:
Money from a Payment that goes back to the Client because it was not Released. It includes the Protection Fee on that part. It is not a price cut, and it is not a clawback of a Payout.
_Avoid_: Refund

**Protection Fee**:
The Client's charge, added on top of the accepted Quote. It is part of the Payment and is never Released.
_Avoid_: Commission, Service fee, Platform fee

**Artisan Fee**:
The charge taken from the Artisan, on Labour only, not on Materials.
_Avoid_: Commission, Service fee, Platform fee

### Trust

**Verification Badge**:
One named check the platform has completed, shown with a validity date only when that check expires. A missing badge is not a failed one, and it is not a promise that the work will be good.
_Avoid_: Vetted, Guarantee, Artisan Verification, Client Verification

**Credential**:
A statutory permission a Verification Badge may evidence. It is not itself a badge.
_Avoid_: Badge

**Warranty**:
A promise the Artisan makes on a Quote. It may be absent. It is not a Verification Badge, and the platform does not make one or enforce it.
_Avoid_: Guarantee, Platform warranty

**Review**:
A rating one party writes about the other, one each, only once an Engagement is Completed. Hers is scoped to that Engagement's Service Category. His is not. She scores workmanship, agreed work, punctuality, and communication, the same four in every category. It is not a Reliability Record.
_Avoid_: Reputation, Feedback, Score, Completion review

**Reliability Record**:
The platform's record of an Artisan's conduct. It records his Cancellation, and a no-show. It does not record hers. Admin and the Artisan may read it. A Client may not. It is not on the Artisan Profile, and it is not a Review.
_Avoid_: Reputation, Feedback, Score

### Relationship

**Conversation**:
The speech between one Client and one Artisan on one Job, in text, pictures, video, documents, or voice notes. It opens when he Quotes, or when either speaks if she invited him, it is the same record after Payment, and it is not private from the platform. An Admin may read it and may not speak in it.
_Avoid_: Chat, thread, inbox, DM

**Client Relationship**:
The pair of one Client Account and one Artisan Account.
_Avoid_: Lock-in, Exclusivity, Repeat customer

**Hire Again**:
The Client's act of opening a new Job addressed only to an Artisan with whom she has a Completed Engagement. It is not a Job Match, and it is not a new fee.
_Avoid_: Rehire, Repeat booking, Direct hire

**Protected Relationship Period**:
The time after the first paid Engagement in a Client Relationship during which further work between those Accounts belongs on the platform. Cancellation does not end it.
_Avoid_: Lock-in, Exclusivity

**Leaving**:
An Account's attempt to move the request, the paid work, or the money off the platform, addressed to the other party or published where someone else can see it. A draft that never becomes matchable is not one.
_Avoid_: Circumvention, leakage, off-platform dealing

**Suspension**:
A stop on new work for one Account. It follows the Leaving ladder, or a finding that the Identity Number is not the named person's. It does not end a paid Engagement, and it is not a close.
_Avoid_: Ban, deactivation, block

**Suspension challenge**:
The suspended Account's one request, within seven times 24 hours of being told, that the suspension be ended. A different person hears it. It is not a Dispute.
_Avoid_: Dispute, appeal
