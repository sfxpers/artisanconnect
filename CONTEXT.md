# ArtisanConnect

ArtisanConnect is a marketplace on which a Client hires an Artisan, and the request, the paid work, and the money stay on the platform.

## Language

### Parties

**Account**:
The only party that signs in and acts, either a Client or an Artisan, never both, with one named person of at least 18 acting for it. That person's name is an attribute, not a second party; the person is not replaced, the kind does not change, and a human holds at most one of each.
_Avoid_: User, Member, Owner, Operator

**Identity Number**:
The named person's South African ID number or recognised refugee identity document number, or, if they have neither, their passport number and its issuing country. An Account is not held without one. A South African ID number must pass its checksum and show the named person is at least 18. Closing does not free it for the same kind, except when a closed Account's number is found not to be the named person's. A new Account held with that freed number does not inherit the closed one.
_Avoid_: Person-fact, ID, Credential, Asylum-seeker permit

**Email**:
The address an Account signs in with. One email is one Account, and a closed Account keeps its address. It is not the Identity Number, and an Admin's address is not one. An Account may change it, once the new address is proven by an Email code.
_Avoid_: login, username, phone

**Email code**:
The code sent to an address to prove its holder has it, at sign-up, reopening, recovery, and a change of Email. It is valid for ten minutes and works once.
_Avoid_: OTP, Verification code, Badge

**Client**:
The Account that posts a Job and pays for an Engagement. Its public name may be the named person or a trading name, and that name is not a key.
_Avoid_: Employer, Customer, Buyer, Client organization, Client Business

**Artisan**:
The Account that proposes a Quote and is paid for an Engagement. It is the named person, and its public name may be that person or a trading name, not a key.
_Avoid_: Seller, Contractor, Tradesman, Service provider, Solo Artisan, Artisan Business, Worker

**Admin**:
A staff identity that is not an Account. It holds one or more of verification, marketplace operations, trust and safety, and finance and disputes, and one person may hold more than one. It cannot hold a Job or an Engagement, and it does not act as an Account. Only an Admin holding marketplace operations gives or takes a grant, never their own, and never a grant's last holder. The first Admin is created by setup, not given.
_Avoid_: User, Moderator

**Visitor**:
A person with no Account, and not a party.
_Avoid_: Guest, Anonymous user, User

**Closed**:
An Account that no longer signs in or acts, by its own choice or after a finding that its Identity Number is not the named person's. It keeps its Reviews, its Reliability Record, and its Client Relationships. Its person may reopen an Account they closed themselves.
_Avoid_: Deleted, Deactivated, Banned

### Work

**Job**:
A Client's private request for work, before anyone is paid. From the moment it can be matched until the Client pays, the Client may end it.
_Avoid_: Lead, Deal, Order, Booking, Project

**Ended**:
A Job the Client ended before paying, or whose acceptance lapsed unpaid. It is final. It is not a Cancellation, and it is not Expired.
_Avoid_: Cancelled, Closed, Withdrawn

**Site type**:
Home or Business, a label on a Job, not a kind of Account. A Home Site Job is one whose Site type is Home; a Business Site Job is one whose Site type is Business.
_Avoid_: Client organization, commercial Job, premises, property type

**Region**:
A named area Admin has opened. At launch each is one of the City of Cape Town's eight Development Management Districts, as the City names them. A Job is posted in one. An Artisan selects at most three, and is matched only in those.
_Avoid_: Zone, Suburb, Service Area, Reach, Ward, Subcouncil

**Suburb**:
One of the City of Cape Town's official suburbs, as the City names them. A Client picks one to place a site, and it belongs to exactly one Region. It is not a Region, and an Admin may add one the City has newly created but may not move or rename one.
_Avoid_: Area, Neighbourhood, Zone, Ward, Subcouncil

**Job Match**:
The platform's offer of a Job to an Artisan who may Quote it and has selected its Region.
_Avoid_: Lead, Dispatch, Assignment

**Artisan Invitation**:
A Client's choice that shows a Job to one Artisan who may Quote it and has selected its Region. It is not a Job Match, but it turns one the Artisan already holds into an Invitation. Where the platform will not show the Artisan the Job, because they declined it or are suspended, the choice is recorded and reaches no one.
_Avoid_: Request, Direct hire, Lead

**Artisan Profile**:
The public page of an Artisan. A Visitor may open it. It shows no direct contact.
_Avoid_: Listing, Storefront

**Available for Jobs**:
The Artisan's choice to receive new Job Matches and Artisan Invitations. Turning it off does not hide the Artisan Profile.
_Avoid_: Online, Calendar, Schedule

**Artisan Chosen**:
A Job with an accepted Quote that the Client has not yet paid. It is not an Engagement. Unpaid seven times 24 hours after the Artisan confirmed the dates, it is Ended.
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

**Void**:
A Quote that can no longer be accepted because its Job was Ended or an Account was suspended. It is not Declined, Withdrawn, Expired, or Not chosen, and it does not become Sent again.
_Avoid_: Closed, Dead, Cancelled

**Updated Quote**:
A proposed change to the price, scope, or Warranty of an Engagement, only from the Artisan and only before Completion. It may raise the price and never lowers it. It does not apply until the Client accepts it.
_Avoid_: Variation, Change order

**Preferred start**:
The date the Client would like a Job to begin, or absent. It is not the start date on a Quote.
_Avoid_: booking, schedule

**Schedule change**:
A new start date and duration the Client enters after a Quote is accepted. It applies only when the Artisan confirms it, and it is not an Updated Quote.
_Avoid_: Reschedule, Booking

**Duration**:
How long the work takes, in whole days, at least 1 and at most 365, entered by the Client with a start date and estimated by the Artisan. The start date is day 1, so the duration ends at the end of its last day, in South African time.
_Avoid_: Hours, Length, Estimate

**Clock**:
A period counted in elapsed time from an event, written as N times 24 hours or N hours, which does not pause. A date a person enters, such as a start date or a validity date, is a South African calendar day, not a clock.
_Avoid_: Timer, Deadline, Clock days

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
An ending of an Engagement before Completion, requested by either Account. It is not a walk-away before Payment. The Artisan's Cancellation is on the Reliability Record. The Client's is not.
_Avoid_: Refund, Withdrawal

**No-show**:
A finding, on a Cancellation the Client requested, that the Artisan had not attended by the agreed start date. It is on the Artisan's Reliability Record. The Artisan's own Cancellation is not one.
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
The goods in a Quote, priced apart from Labour so the Client can read the split. The amount is what the Artisan charges, and it is zero when the Client supplies them. The split does not change the Artisan Fee.
_Avoid_: Parts, Supplies

### Money

**Payment**:
Money the Client pays in for an Engagement: the accepted Quote plus the Protection Fee, including any further amount after an accepted Updated Quote. Until Released, it is still a Payment, not a separate balance.
_Avoid_: Escrow, Wallet, Balance, Held funds

**Payout**:
Money sent to the Artisan's verified payout account. It is the Artisan's share of a Release after the Artisan Fee. The Protection Fee is never part of a Payout. A Payout waits while the payout account is not current, and once sent it does not come back.
_Avoid_: Withdrawal, Settlement

**Payout account**:
The bank account Payouts are sent to. It bears the named person's name and is accepted by the platform. It is current until it is removed or a bank rejects a Payout to it, and a replacement does not displace it until the replacement is accepted. A Payout waits while none is current.
_Avoid_: Wallet, Bank details

**Release**:
Sending the accepted-Quote portion of a Payment as a Payout, in one part or more. It is the Client's decision, silence after Completion, or an Admin's allocation.
_Avoid_: Release Payment, Milestone

**Dispute**:
The Client's claim, after Completion, against a named amount of the accepted-Quote portion that has not been Released. The amount is greater than zero and no greater than that unreleased portion. One Engagement has one. It is not an ending, and it is not a Cancellation.
_Avoid_: Refund, appeal

**Return**:
Money from a Payment that goes back to the Client because it was not Released: by an Admin's allocation, by the Artisan alone after Completion, including of an amount a Dispute holds, or because the Payment was reversed. It includes the Protection Fee on that part. It is not a price cut, and it is not a clawback of a Payout.
_Avoid_: Refund

**Protection Fee**:
The Client's charge, added on top of the accepted Quote. It is part of the Payment and is never Released.
_Avoid_: Commission, Service fee, Platform fee

**Artisan Fee**:
The charge taken from the Artisan on each Release, on the whole accepted Quote, Labour and Materials together. Its rate falls with the Completed Engagements already in that Client Relationship.
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

**Reference**:
A person who vouches for an Artisan's work in one Service Category: a name, a phone number or email, how they know the Artisan, the work done, and its month and year. It is never shown. It is not the Artisan or the Artisan's other Account, and it does not expire.
_Avoid_: Referee channel, Testimonial

**Marketplace rules**:
The version of the rules the platform publishes, which a Client accepts at sign-up and an Artisan accepts as a gate to Quote. After a change a Client accepts again before making a Job matchable or paying, and nothing else a Client does waits on it.
_Avoid_: Terms, Policy

**Review**:
A rating one party writes about the other, one each, only once an Engagement is Completed. The Client's Review is scoped to that Engagement's Service Category. The Artisan's is not. The Client scores workmanship, agreed work, punctuality, and communication, the same four in every category. It is not a Reliability Record.
_Avoid_: Reputation, Feedback, Score, Completion review

**Reliability Record**:
The platform's record of an Artisan's conduct. It records the Artisan's Cancellation, a no-show, and an Admin's allocation in a Dispute that Returns any amount. It does not record the Client's Cancellation. Admin and the Artisan may read it. A Client may not. It is not on the Artisan Profile, and it is not a Review.
_Avoid_: Reputation, Feedback, Score

### Relationship

**Conversation**:
The speech between one Client and one Artisan on one Job, in text, pictures, documents, or voice notes, and after Payment also video. It opens when the Artisan Quotes, or when either speaks if the Client invited the Artisan, it is the same record after Payment, and it is not private from the platform. It takes no new message once its Quote is no longer Sent or Accepted, its Job is Ended, or its Engagement is Completed, Cancelled, or Returned, and is then read-only. An Admin may read it and may not speak in it.
_Avoid_: Chat, thread, inbox, DM

**Client Relationship**:
The pair of one Client Account and one Artisan Account.
_Avoid_: Lock-in, Exclusivity, Repeat customer

**Hire Again**:
The Client's act of opening a new Job addressed only to an Artisan with whom the Client has a Completed Engagement. It is not a Job Match, and it is not a new fee.
_Avoid_: Rehire, Repeat booking, Direct hire

**Protected Relationship Period**:
The 365 times 24 hours after the Payment that begins the first Engagement in a Client Relationship, during which further work between those Accounts belongs on the platform. A later paid Engagement does not extend it, and Cancellation, a full Return, Completion, Suspension, and an open Dispute do not end or pause it.
_Avoid_: Lock-in, Exclusivity

**Leaving**:
An Account's attempt, found by an Admin, to move the request, the paid work, or the money off the platform, addressed to the other party or published where someone else can see it. A draft that never becomes matchable is not one, and neither is a send the platform refuses.
_Avoid_: Circumvention, leakage, off-platform dealing

**Suspension**:
A stop on new work for one Account. It follows the Leaving ladder, a finding that the Identity Number is not the named person's, or a conduct finding on a paid Engagement. It does not end a paid Engagement, and it is not a close. A suspension for an Identity Number also holds the money on that Account's Engagements.
_Avoid_: Ban, deactivation, block

**Suspension challenge**:
The suspended Account's one request, within seven times 24 hours of being told, that the suspension be ended. A different person hears it. It is not a Dispute.
_Avoid_: Dispute, appeal

**Tell**:
The platform's message to an Account that something has happened, sent when the event needs that Account's action, moves its money, ends something it holds, or changes its standing. An Account is told once its notice is written, whether or not the email arrives. An Account is never told of its own act, and a pure view tells nobody.
_Avoid_: Notification, Alert, Message

**Reminder**:
A Tell, sent before a clock ends, to the party who can still act. It never says whether the other side has acted.
_Avoid_: Nudge, Warning

**Report**:
One signed-in Account's complaint about one thing it can see, made from that thing's page, with one fixed reason and an optional note. It removes nothing, and the reporter is told it was received and never the outcome.
_Avoid_: Complaint, Ticket, Support request

**Flag**:
A fact the platform raises for an Admin with no reporter: a third refused send on one Job, a chargeback, a payout account on two Artisan Accounts, or one an Admin raises from an item they already have open.
_Avoid_: Alert, Report
