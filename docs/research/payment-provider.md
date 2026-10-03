# Which payment provider can run the flow, and what must the adapter mirror?

Research for issue #108. Sources were checked on 3 and 4 October 2026. No account was opened and no money moved.

Every claim has a footnote. **Docs say** means a provider's or regulator's own page says it. **Inferred** means it is my reading and needs confirming. Where a primary page was blocked, the footnote says so.

## Summary

**Recommendation: Stitch, with the adapter shaped like Stitch's Payouts, Refunds, Disputes and Bank Account Verification APIs.** Stitch is the only checked provider whose public docs cover every flow item: card and Pay by Bank collection[^st-pbb][^st-card-refunds], several partial Refunds on both methods[^st-card-refunds][^st-pbb-refunds], Payouts to any SA bank account with an explicit `Reversed` state and bank failure reasons such as "account closed"[^st-disb], Chargeback webhooks (`dispute.created` to `dispute.lost`)[^st-disputes], and an account-holder name and ID check[^st-bav]. Ozow is the runner-up. It is the cheapest published option and covers everything except a documented Chargeback event[^oz-pricing][^oz-glossary].

**The main risk is regulatory, not technical.** Under ADR 0005 the platform collects the Client's money into its own merchant relationship and pays the Artisan days or weeks later. That looks like "accepting money from multiple payers on behalf of a beneficiary", which is the definition of a Beneficiary Service Provider under SARB Directive 1 of 2007[^sarb-d1]. PASA says registration through a sponsoring bank is compulsory for that activity[^pasa-tppp]. A May 2026 SARB draft directive would replace this with direct SARB authorisation, segregated client-fund accounts and FIC registration[^sarb-draft]. **Inferred:** ArtisanConnect may itself need to be a TPPP under ADR 0005. This needs a legal opinion before launch.

**Loud correction to ADR 0005: TradeSafe does hold and release.** TradeSafe is an SA escrow provider. It holds the buyer's money in an escrow account at Standard Bank and pays the seller only when the delivery is accepted[^ts-terms][^ts-faq]. It is a PASA-listed TPPP sponsored by Standard Bank[^pasa-list]. It supports several allocations per transaction (so Materials and Labour could be released separately) and an Agent party that takes a fee[^ts-alloc][^ts-tx]. ADR 0005's statement "no checked South African provider holds the Client's Payment and later pays it to the Artisan's bank account" is true of the five providers it checked, but false for TradeSafe. TradeSafe's fit with the domain rules is weaker (see [TradeSafe](#tradesafe-the-hold-and-release-option)). It is the option to take if the legal opinion says the platform must not hold client funds.

**Paystack is not recommended, despite the best self-serve docs.** Paystack lists "Escrow services — holding funds on behalf of a buyer and seller until the conditions of a sale are met" as an ineligible business in every country[^ps-inelig]. Paying before the work and releasing at Approval is that pattern, whatever we call it.

## Capability matrix

✅ docs say it works. ⚠️ works with a limit, or only partly documented. ❌ docs say no, or no such product. ❓ not found in public docs. "A new payment" in the third row is inferred: each collection is just another payment request.

| Flow item | Paystack | Payfast | Ozow | Peach | **Stitch** | TradeSafe | Netcash |
|---|---|---|---|---|---|---|---|
| Card collection | ✅[^ps-channels] | ✅[^pf-fees] | ✅[^oz-methods] | ✅[^pe-fees] | ✅[^st-card-refunds] | ✅ ≤ R25,000 per deposit[^ts-deposits] | ✅[^nc-refunds] |
| Instant EFT / Pay by Bank | ✅ Ozow EFT, Capitec Pay[^ps-channels][^ps-eft] | ✅[^pf-fees] | ✅[^oz-methods] | ✅[^pe-fees] | ✅ Capitec Pay, Absa Pay, PayShap[^st-pbb] | ✅ Ozow, EFT[^ts-deposits] | ⚠️ Pay Now bills an Instant EFT fee, per an old fee list (search snippet)[^nc-paynow] |
| Separate later collection (Updated Quote) | ✅ a new transaction | ✅ a new payment | ✅ a new payment | ✅ a new payment | ✅ a new payment request[^st-pbb] | ⚠️ "partial payments are not supported"; a second deposit is not documented[^ts-deposits] | ✅ |
| Payout to any SA bank account | ✅ Transfers, recipient type `basa`[^ps-transfers] | ❌ only splits to another Payfast merchant, at payment time[^pf-split] | ✅ Payouts API, needs Ozow approval[^oz-payout] | ✅ Payouts API[^pe-payouts-api] | ✅ Disbursements[^st-disb] | ⚠️ TradeSafe pays the seller on acceptance; no general payout[^ts-terms] | ✅ creditor payment batches[^nc-creditor] |
| Partial and multiple Refunds | ✅ partial[^ps-refund-api]; ⚠️ multiple not stated; EFT refunds may need the Client's bank details[^ps-needs-attention] | ✅ partial and multiple, EFT refunds need the Client's bank details[^pf-api] | ✅ multiple partial, from float[^oz-refunds][^oz-refund-api] | ⚠️ card only; Pay by Bank, Capitec Pay, Peach EFT ❌[^pe-methods] | ✅ multiple partial, card and Pay by Bank[^st-card-refunds][^st-pbb-refunds] | ⚠️ only between start and acceptance of an allocation, "net of Fees"[^ts-alloc][^ts-terms] | ⚠️ card only, each needs manual authorisation[^nc-refunds] |
| Chargeback event with amount | ✅ `charge.dispute.create` with `amount`, `refund_amount`[^ps-webhooks][^ps-dispute-api] | ❓ | ❓ term defined, no event documented[^oz-glossary] | ⚠️ `CB` type exists, webhooks only for DB, PA, RF[^pe-flows][^pe-webhooks] | ✅ `dispute.created` … `dispute.lost`[^st-disputes]; ⚠️ amount field not confirmed | ❓ | ❓ |
| Payout failure / bank rejection event | ✅ `transfer.failed`, `transfer.reversed`[^ps-webhooks][^ps-how-transfers] | n/a | ✅ status 90 Returned, sub-status 9001 "Rejected by destination bank"[^oz-getpayout] | ✅ webhook `Failed`; value returns to float[^pe-payouts-api][^pe-payouts] | ✅ `DisbursementError`, `DisbursementReversed`, reason `invalid_account`[^st-disb] | ❓ | ⚠️ returns in batch reports, polled[^nc-guide] |
| Account-holder check (AVS) | ✅ `/bank/validate`, name + ID, ZAR 3[^ps-validate] | ❌ | ✅ `/bankaccount/verify`, surname + ID, R0.50[^oz-avs][^oz-pricing] | ✅ BANV[^pe-payouts-api] | ✅ ID, last name, initials match[^st-bav] | ⚠️ TradeSafe runs AVS on users itself[^ts-terms] | ✅ real-time AVS[^nc-avs] |
| **Holds money for later release to a third party** | ❌ and bans escrow[^ps-inelig] | ❌ | ❌ | ❌ | ❌ | **✅ escrow**[^ts-terms] | ❌ |

Yoco was checked and dropped. Its developer API lists a Checkout API and a read-only business-data API, with no payout to a third party[^yoco-api]. Its payouts go to the merchant's own account[^yoco-instant]. Investec Programmable Banking can pay beneficiaries by API, but a beneficiary must first be created and paid online by hand[^investec]. That does not suit a daily run to new Artisans.

## Float and holding findings

ADR 0005 says the adapter "collects into the platform's processor relationship and pays the Artisan later from that relationship, or from a float the platform funds." Per provider:

- **Paystack.** Transfers pay from the Paystack Balance[^ps-transfers]. SA businesses pay a 1% fee to top it up[^ps-funding]. Collected money can stay in the balance instead ("Settled to Balance"), but in SA only for a Registered Business with approved compliance and at least one month of transactions, on request to support[^ps-manual-payouts]. So collected balance can fund Payouts, after approval. Subaccounts have a `manual` settlement schedule ("payout to the subaccount should only be made when requested")[^ps-subaccount], but the split is fixed at payment time and no release API is documented. Paystack also bans escrow[^ps-inelig].
- **Payfast.** No payout to third parties. Split Payments go to one other Payfast merchant and happen instantly at payment time[^pf-split]. Its terms forbid submitting transactions "on behalf of third party" entities that have not signed an Affiliate form[^pf-terms].
- **Ozow.** Docs say the two flows are separate: "payments from your customers are settled into your bank account, and your float is funded separately by you, from your bank account"[^oz-start]. Refunds and Payouts both draw on the float[^oz-glossary][^oz-float]. So the platform must move money from its bank account to the float before each daily run.
- **Peach.** Payouts draw on a float[^pe-payouts]. Peach says merchants "can top up their float using their settlement funds or via EFT"[^pe-rtc]. Failed payouts return to the float[^pe-payouts].
- **Stitch.** "A float account is required" for Disbursements[^st-disb]. Pay by Bank Refunds are "debited from an associated intermediary float account"[^st-pbb-refunds]. **Not documented:** whether collected money can fund that float without a bank transfer. Ask sales.
- **Netcash.** Docs say payment batches can draw on money already in the Netcash account, including Pay Now collections[^nc-guide]. This is the only checked provider whose docs say collections fund payouts directly.
- **TradeSafe.** Holds the money in an escrow account at Standard Bank[^ts-faq]. Releases to the seller (and then the Agent) after acceptance or deemed acceptance[^ts-terms]. Interest on held money accrues to TradeSafe[^ts-terms].

**Verdict on ADR 0005.** It holds for Paystack, Payfast, Ozow, Peach, Stitch and Netcash: none of them holds a Payment for a later release to the Artisan. Two corrections:

1. **TradeSafe does hold and release.** The ADR should name it and say why it was or was not chosen.
2. For Paystack (after approval), Peach and Netcash, the collected balance can fund Payouts. The platform does not need separate money for the float. It still owns and holds that balance, which is the regulatory question.

## TradeSafe: the hold-and-release option

What fits (docs say):

- A transaction has a BUYER, a SELLER and an optional AGENT with a percentage or fixed fee[^ts-tx].
- A `MILESTONE` workflow has several allocations[^ts-tx]. Materials and Labour could be two allocations.
- `allocationAcceptDelivery` "trigger[s] a payout to the seller"[^ts-alloc]. Payout is instant via Standard Bank host-to-host, up to 24 hours depending on the bank[^ts-terms].
- TradeSafe runs AVS on bank details and matches them to the ID number[^ts-terms].
- Callbacks on every state change, secured by IP allow-list and a secret in the URL[^ts-callbacks].

What does not fit, or is unknown:

- **Client identity.** The terms say each User must provide "their Identity number"[^ts-terms]. CONTEXT.md says a Client "gives no Identity Number". The token API docs are unclear on whether a buyer needs one[^ts-tokens][^ts-quickstart].
- **Who accepts.** The terms say an Agent cannot "accept or dispute a Trade on the Buyer's or Seller's behalf"[^ts-terms]. Work started can be set by the Artisan, and Approval happens on 7 days' silence. **Inferred:** our rules may clash with TradeSafe's own acceptance and dispute process (10 Business Day negotiation[^ts-terms]).
- **Refunds.** Partial refunds work only between `allocationStartDelivery` and `allocationAcceptDelivery`[^ts-alloc], and are "net of Fees"[^ts-terms]. An Artisan's Refund "at any time" and a Refund that never touches the Protection Fee may not map.
- **Updated Quote.** A second deposit into an existing transaction is not documented, and "partial payments are not supported"[^ts-deposits].
- **Cards above R25,000** cannot be paid by card[^ts-deposits].
- **Chargebacks and returned payouts** are not documented.
- **Cost.** Escrow fee 1.15% up to R10,000 on top of the payment method fee[^ts-fees].

## Fees

Checked 3–4 October 2026. Rates exclude VAT unless marked.

| Provider | Card (local) | Instant EFT / Pay by Bank | Payout to Artisan | Refund | Account check | Notes |
|---|---|---|---|---|---|---|
| Paystack | 2.9% + R1, R1 waived under R10[^ps-pricing] | 2% (Ozow EFT, Capitec Pay)[^ps-pricing] | R3 per transfer, failed or successful[^ps-funding] | Paystack keeps its fee[^ps-refund-support] | R3 per successful call[^ps-validate] | 1% to top up the balance[^ps-funding] |
| Payfast | 3.2% + R2[^pf-fees] | 2.0%, min R2[^pf-fees] | n/a | R2[^pf-fees] | n/a | |
| Ozow | 2.85%, min R1[^oz-pricing] | 1.5%, min R1[^oz-pricing] | R3[^oz-pricing] | R3[^oz-pricing] | R0.50[^oz-pricing] | |
| Peach | 2.95% + R1.50 (3DS)[^pe-fees] | 1.50% + R1.50[^pe-fees] | R3.20 per EFT payout (search snippet, not on a primary page)[^pe-payout-fee] | ❓ | ❓ | No account fee on Growth plan[^pe-fees] |
| Stitch | Not published for the API. Stitch Express (a different product) lists card 2.95%, Capitec Pay 2% (search snippet, page 404)[^st-express] | ❓ | ❓ | ❓ | ❓ | Sales conversation needed |
| TradeSafe | 2.50% (fees page) or 3.0% (FAQ), plus escrow fee[^ts-fees][^ts-faq] | Ozow 1.5%, EFT 0.75%[^ts-faq] | In escrow fee; R5 per party for faster than monthly settlement[^ts-faq] | Refunds "net of Fees"[^ts-terms] | Included | Escrow fee 1.15% (incl. VAT) up to R10,000[^ts-fees] |
| Netcash | ❓ no current public list | ❓ | ❓ | ❓ | Charged per call[^nc-avs] | |

The Paystack pricing page (paystack.com/za/pricing) was blocked by a bot check for this research. Its figures come from the search engine's snippet of that page[^ps-pricing]. Confirm them by hand.

**Worked example (inferred).** A R5,000 Quote plus a R250 Protection Fee, paid by card and paid out in two Payouts:

- Ozow: 2.85% × R5,250 = R149.63, plus 2 × R3 = R155.63.
- Paystack: 2.9% × R5,250 + R1 = R153.25, plus 2 × R3 = R159.25, plus up to 1% of R4,500 (R45) if the balance must be topped up.
- Peach: 2.95% × R5,250 + R1.50 = R156.38, plus 2 × R3.20 = R162.78.

The 5% Protection Fee (R250) covers each of these. ADR 0008's "about 2.9% plus R1" matches Paystack's card rate.

## Onboarding and regulation

**Regulation (docs say).**

- SARB Directive 1 of 2007 defines a Beneficiary Service Provider as one who accepts money "as a regular feature of that person's business, from multiple payers on behalf of a beneficiary". It must be appointed as agent of each beneficiary, keep records for five years, keep the business separate, and tell its bank[^sarb-d1].
- PASA: "By law, it is compulsory to register as a TPPP if you are rendering the services contemplated in SARB Directive 1 of 2007". Registration goes through a sponsoring bank and takes about 21 working days[^pasa-tppp].
- SARB published a third draft "Directive in respect of specified payment activities" (Directive X of 2026, May 2026), with comments due 15 June 2026[^sarb-draft][^polity]. It would require SARB authorisation as a Tier 2 TPPP below R5 million average monthly value, segregated "formal beneficiary accounts", minimum capital, and FIC registration within 30 business days[^sarb-draft]. An authorised TPPP may appoint another person as its agent[^sarb-draft].
- All the checked providers are PASA-listed TPPPs: Paystack South Africa, Payfast, Ozow, Peach, Stitch, Netcash, Yoco and Trade-Safe Holdings (sponsored by Standard Bank)[^pasa-list].

**Inferred.** Under ADR 0005 the platform receives each Client's Payment and pays it on to an Artisan later. That is the Beneficiary Service Provider pattern. Being a merchant of a TPPP does not obviously make the platform exempt. A lawyer should answer: does ArtisanConnect need its own TPPP registration (or SARB authorisation once the draft is final), or can it act as an appointed agent of its provider?

**Per provider (docs say).**

- **Paystack.** Transfers and identity verification need a Registered Business; a Starter Business is capped at R1,000,000 in collections[^ps-business-types]. EFT and Capitec Pay need an extra KYC review[^ps-eft]. Escrow services are ineligible[^ps-inelig].
- **Payfast.** No transactions for third parties without an Affiliate form (clause 5.17(vi)). Marketplace merchants must follow card-scheme marketplace rules (12.2). Payfast may hold settlement for up to 540 days (9.8)[^pf-terms].
- **Ozow.** Payouts need approval by Ozow's onboarding team and a staging sign-off, "There are no exceptions"[^oz-methods][^oz-prereq].
- **Peach.** Payouts need source-of-funds documents[^pe-payouts].
- **Stitch.** No self-serve onboarding found. Treat it as a sales-led contract.
- **TradeSafe.** Every user gives ID, bank proof and contact details; businesses give CIPC documents[^ts-terms][^ts-faq]. An integrator must also sign a merchant agreement (clause 21)[^ts-terms].

## The adapter

The fake adapter mirrors Stitch's semantics, with neutral names. Every operation and event below also maps onto Paystack and Ozow (see the mapping table), so a swap is a new adapter, not a new domain.

### Shared rules

- **Amounts are integer cents in ZAR.** Paystack and Ozow use subunits or cents[^ps-transfers][^oz-payout]. Stitch uses a decimal `quantity` with a currency[^st-disb], so the Stitch adapter converts at the edge.
- **Every write carries our own idempotency key.** Stitch calls it a `nonce`[^st-disb][^st-card-refunds]. Ozow uses an `Idempotency-Key` header[^oz-refund-api]. Paystack uses the transfer `reference` and says to retry with the same one until the status is final[^ps-how-transfers]. Use the domain row's ID (Payment, Refund or Payout ID).
- **Our ID travels as the external reference.** Stitch: `externalReference`[^st-pbb]. Ozow: `merchantReference`, max 20 characters[^oz-getpayout].
- **Bank-statement references are short.** Beneficiary reference max 20 characters, payer reference max 12[^st-pbb][^st-disb].
- **Everything that moves money is async.** A write returns a provider ID and `pending`. The final state comes by webhook. A poll operation exists for when a webhook is missed.
- **Webhooks are signed, may repeat, and may arrive out of order.** Stitch and Ozow deliver through Svix[^st-webhooks][^oz-refund-api]; Peach signs `timestamp.webhookId.url.payload` with HMAC SHA-256[^pe-webhooks]; Paystack signs the body with HMAC SHA-512[^ps-webhooks]. Ozow warns it "may occasionally send duplicate notifications"[^oz-payout]. Handlers dedupe on the event ID and never move a state backwards.
- **Payouts and Refunds draw on a float.** Both can pause when it is short[^st-disb][^st-pbb-refunds][^oz-float].

### Operations

| Operation | Inputs | Outputs | Sync / async |
|---|---|---|---|
| `createCollection` | `paymentId` (idempotency key and external reference), `amountCents` (Quote or difference, plus the Protection Fee), `methods` (`card`, `pay_by_bank`), `payerReference` (≤ 12), `beneficiaryReference` (≤ 20), `returnUrl` | `providerCollectionId`, `checkoutUrl`, `status: pending` | Sync create; the result arrives as an event. The redirect back is not proof of payment[^oz-start]. |
| `getCollection` | `providerCollectionId` | `status` (`pending`, `succeeded`, `failed`, `cancelled`, `expired`), `amountCents`, `method`, `paidAt` | Sync poll, for reconciliation |
| `refund` | `refundId` (idempotency key), `providerCollectionId`, `amountCents`, `reason` | `providerRefundId`, `status: pending` | Async. The provider rejects a total above the collected amount less earlier Refunds[^st-card-refunds]. Send one at a time per collection[^oz-refunds]. |
| `getRefund` | `providerRefundId` | `status` (`pending`, `submitted`, `succeeded`, `failed`, `paused`), `reason` | Sync poll |
| `verifyBankAccount` | `accountNumber`, `bankId`, `branchCode`, `accountType`, holder `idNumber` or `passportNumber` + `country`, `surname`, `initials` | `accountExists`, `accountOpen`, `openOverThreeMonths`, `acceptsCredits`, `idMatch`, `surnameMatch`, `initialsMatch`, `accountTypeMatch`, or `pending` | Usually sync. Stitch may take up to 120 seconds and return pending; retry free for 48 hours[^st-bav]. |
| `createPayout` | `payoutId` (idempotency key and external reference), `amountCents`, beneficiary `name`, `accountNumber`, `bankId`, `branchCode`, `accountType`, `beneficiaryReference` (≤ 20) | `providerPayoutId`, `status: pending`; or an immediate `rejected` with `reason` when the account fails its check digit[^st-disb] | Async |
| `getPayout` | `providerPayoutId` | `status` (`pending`, `submitted`, `succeeded`, `failed`, `paused`, `cancelled`, `reversed`), `reason` | Sync poll |
| `getFloatBalance` | none | `availableCents` | Sync. The daily run checks it before sending. |
| `verifyWebhook` | raw body, headers | a typed event, or a rejection | Sync, before any handler runs |

There is no `release` operation. A Release is a ledger row only (CONTEXT.md). The provider sees only the Payout that follows in the daily run.

### Events

Every event has an envelope: `eventId` (dedupe key), `type`, `occurredAt`, and `data`.

| Event | Payload (`data`) | Domain effect |
|---|---|---|
| `collection.succeeded` | `providerCollectionId`, `paymentId`, `amountCents`, `method` | The Payment is recorded; the Quote is Hired, or the Updated Quote applies |
| `collection.failed` | `providerCollectionId`, `paymentId`, `reason` (`failed`, `cancelled`, `expired`) | Nothing is Hired |
| `refund.succeeded` | `providerRefundId`, `refundId`, `providerCollectionId`, `amountCents` | The Refund is done; Receipt sent |
| `refund.failed` | `providerRefundId`, `refundId`, `reason` | The Admin sees it; the money is still the Client's |
| `refund.paused` | `providerRefundId`, `refundId`, `reason: insufficient_float` | Top up the float |
| `payout.succeeded` | `providerPayoutId`, `payoutId`, `amountCents` | The Payout is sent; Receipt sent |
| `payout.failed` | `providerPayoutId`, `payoutId`, `reason` (`invalid_account`, `inactive_account`, `restricted_account`, `exceeded_limit`, `bank_processing_error`, `insufficient_float`)[^st-disb] | The Payout account needs fixing; no money left |
| `payout.reversed` | `providerPayoutId`, `payoutId`, `amountCents`, `reason` | Money came back to the float after a success[^st-disb][^oz-getpayout]; send again once fixed |
| `payout.paused` | `providerPayoutId`, `payoutId`, `reason: insufficient_float` | Top up the float |
| `chargeback.opened` | `disputeId`, `caseReference`, `providerCollectionId`, `amountCents`, `evidenceDueAt` | The Engagement freezes for the Admin |
| `chargeback.closed` | `disputeId`, `outcome` (`won`, `lost`, `accepted`, `partially_accepted`), `reversedAmountCents` | A loss writes the reversed amount to the ledger |

The chargeback events follow Stitch's dispute lifecycle: one `dispute.created`, then exactly one of `dispute.won`, `dispute.lost`, `dispute.auto_accepted`, `dispute.partially_accepted`[^st-disputes]. Paystack auto-accepts an SA chargeback after 48 hours without a reply[^ps-first-cb], and Stitch rejects late evidence with `410 DEADLINE_EXPIRED`[^st-disputes]. So `evidenceDueAt` must reach the Admin. Chargebacks only exist for card Payments; Ozow describes Pay by Bank as irrevocable[^oz-methods].

### Mapping to other providers

| Neutral | Stitch | Paystack | Ozow |
|---|---|---|---|
| `createCollection` | `clientPaymentInitiationRequestCreate` / card hosted UI[^st-pbb] | Initialize transaction | `POST /payments`[^oz-one-api] |
| `refund` | refund mutation with `nonce`[^st-card-refunds] | `POST /refund`, `amount` optional[^ps-refund-api] | `POST /transactions/{id}/refunds` with `Idempotency-Key`[^oz-refund-api] |
| `verifyBankAccount` | Bank Account Verification[^st-bav] | `POST /bank/validate`[^ps-validate] | `POST /bankaccount/verify`[^oz-avs] |
| `createPayout` | Disbursement, `nonce`[^st-disb] | Create recipient `basa` + `POST /transfer`, `source: balance`[^ps-transfers] | `RequestPayout`, AES-encrypted account number, verification webhook[^oz-payout] |
| `payout.failed` / `payout.reversed` | `DisbursementError` / `DisbursementReversed`[^st-disb] | `transfer.failed` / `transfer.reversed`[^ps-webhooks] | status 4 / status 90[^oz-getpayout] |
| `chargeback.*` | `dispute.*`[^st-disputes] | `charge.dispute.create` / `.resolve`[^ps-webhooks] | ❓ |

Ozow's payout flow adds one step the fake should be able to show: Ozow calls *our* verification webhook before paying, and we must confirm the payout and return the decryption key[^oz-payout]. If Ozow is chosen, add a `confirmPayout(providerPayoutId) → {verified, decryptionKey}` callback.

If TradeSafe is chosen instead, the shape changes. `createCollection` becomes a transaction with Materials and Labour allocations plus a checkout link[^ts-tx][^ts-deposits]. A Release becomes `allocationAcceptDelivery`, after which TradeSafe pays the Artisan itself[^ts-alloc]. `createPayout`, `getFloatBalance` and the float events disappear. That would reverse ADR 0005.

### Conflicts with CONTEXT.md to raise

- **Payout: "Once sent it does not come back."** A bank can return a completed Payout: Stitch `DisbursementReversed`, Ozow status 90 "Payout Returned"[^st-disb][^oz-getpayout]. The money goes back to the float, not to the Client. The glossary should allow for a returned Payout.
- **Refund needing bank details.** EFT Refunds may need the Client's bank details: Payfast's `BANK_PAYOUT` method[^pf-api] and Paystack's `needs-attention` state[^ps-needs-attention]. Stitch and Ozow refund to the source account[^st-pbb-refunds][^oz-refunds].

## Open questions for a sales or legal conversation

1. **Legal:** Under ADR 0005, is ArtisanConnect a Beneficiary Service Provider that must register as a TPPP now, or be authorised under the 2026 directive? Can it instead be an agent of its provider?
2. **Stitch:** Prices for card, Pay by Bank, Disbursements, Refunds and Bank Account Verification. Minimum volumes. Is a startup marketplace accepted?
3. **Stitch:** Can collected money fund the Disbursement float directly, or must the platform transfer it in?
4. **Stitch:** Does the dispute payload carry the disputed and reversed amount?
5. **Stitch / Ozow / Peach:** Do their merchant terms forbid holding Client money until the work is approved, as Paystack's do?
6. **Ozow:** Is there a card Chargeback webhook, and what does it carry?
7. **TradeSafe:** Can a buyer be created without an ID number? Can the integrator accept an allocation on the buyer's behalf by API? Can a second deposit be added for an Updated Quote? Are partial refunds possible before delivery starts? Can the Agent's fee be kept on cancellation? How are card chargebacks handled?
8. **Paystack:** Confirm the SA prices (page blocked). Would Paystack accept this flow despite its escrow rule if it is described as "pay before work"?
9. **All:** How long can money sit between Payment and Payout before the provider or its sponsor bank objects? Labour may wait weeks.

## Sources

[^st-pbb]: Docs say. Stitch, Pay By Bank integration process. https://docs.stitch.money/payment-products/payins/paybybank/integration-process and https://docs.stitch.money/payment-products/payins/paybybank/introduction
[^st-card-refunds]: Docs say. Stitch, Card refunds: "Multiple partial refunds can also be created up to the amount of the original payment"; refunds need a `nonce`. https://docs.stitch.money/payment-products/payins/card/refunds
[^st-pbb-refunds]: Docs say. Stitch, Pay By Bank refunds; funded from "an associated intermediary float account"; statuses include `RefundPaused`. https://docs.stitch.money/payment-products/payins/paybybank/refunds
[^st-disb]: Docs say. Stitch, Disbursements: "A float account is required"; `nonce`; statuses Pending, Submitted, Completed, Error, Paused, Cancelled, Reversed; reasons `invalid_account` ("It may have been closed"), `inactive_account`, `restricted_account`, `insufficient_funds`, `exceeded_limit`, `bank_processing_error`; CDV failure returns `account_verification_failed_cdv`. https://docs.stitch.money/payment-products/payouts/disbursements
[^st-disputes]: Docs say. Stitch, Disputes overview. https://docs.stitch.money/disputes/overview
[^st-bav]: Docs say. Stitch, Bank Account Verification integration process. https://docs.stitch.money/payment-products/bank-account-verification/integration-process
[^st-webhooks]: Docs say. Stitch, Webhooks: delivered by Svix with exponential retry. https://docs.stitch.money/webhooks
[^st-express]: Search snippet only; page returned 404 when fetched. Stitch Express, "What processing fees do I pay?" https://help-express.stitch.money/en/articles/8182293-what-processing-fees-do-i-pay
[^oz-pricing]: Docs say. Ozow pricing. https://ozow.com/pricing
[^oz-glossary]: Docs say. Ozow Hub glossary: float, settlement, chargeback, dispute, payout. https://hub.ozow.com/glossary/
[^oz-methods]: Docs say. Ozow Hub, Payment methods: card, Pay by Bank ("irrevocable"), payouts need approval and staging, "There are no exceptions". https://hub.ozow.com/payment-methods/
[^oz-start]: Docs say. Ozow Hub, How Ozow works: "The two flows never meet". https://hub.ozow.com/getting-started/
[^oz-float]: Docs say. Ozow Hub, Float top-up. https://hub.ozow.com/payment-methods/settlements-and-float/float-top-up/
[^oz-payout]: Docs say. Ozow Hub, Send a payout: amounts in cents, float, verification webhook, encrypted account number, duplicate notifications. https://hub.ozow.com/integration-methods/apis/money-out/send-a-payout/
[^oz-getpayout]: Docs say. Ozow Payouts API, Get Payout: status codes 1–99 and sub-statuses including 401, 405, 9001. https://hub.ozow.com/api-reference/payouts-api/get-getpayout/
[^oz-refunds]: Docs say. Ozow Hub, Refunds: "more than one partial refund on the same transaction"; wait for each to finish; from float. https://hub.ozow.com/integration-methods/no-code/refunds/
[^oz-refund-api]: Docs say. Ozow Hub, Refund a payment: `Idempotency-Key`, statuses including `returned`, Svix signature. https://hub.ozow.com/integration-methods/apis/refunds/refund-a-payment/
[^oz-avs]: Docs say. Ozow One API, `POST /bankaccount/verify`. https://hub.ozow.com/api-reference/one-api/post-bankaccount-verify/
[^oz-one-api]: Docs say. Ozow One API reference. https://hub.ozow.com/api-reference/one-api/
[^oz-prereq]: Docs say. Ozow Hub, Prerequisites and onboarding. https://hub.ozow.com/getting-started/prerequisites-and-onboarding/
[^pe-fees]: Docs say. Peach Payments fees, ZA Growth plan. https://www.peachpayments.com/fees/
[^pe-methods]: Docs say. Peach, Payment methods: refund support per method. https://developer.peachpayments.com/docs/pp-payment-methods
[^pe-flows]: Docs say. Peach, Transaction flows: CB "Initiates a refund forcibly". https://developer.peachpayments.com/docs/oppwa-references-transaction-flows
[^pe-webhooks]: Docs say. Peach, Checkout webhooks: DB, PA, RF; HMAC SHA-256; 30-day retry. https://developer.peachpayments.com/docs/checkout-webhooks
[^pe-payouts-api]: Docs say. Peach, Payouts API: BANV, webhook statuses Processing, Successful, Failed. https://developer.peachpayments.com/docs/payouts-api-1
[^pe-payouts]: Docs say. Peach, Payouts product: float deposits, "you cannot reverse payouts", failed payouts return to float, source-of-funds documents. https://developer.peachpayments.com/docs/peach-payouts
[^pe-rtc]: Docs say. Peach, "Peach Payments announces real-time clearance Payouts", 19 August 2025. https://www.peachpayments.com/scale/peach-payments-announces-real-time-clearance-payouts/
[^pe-payout-fee]: Search snippet only, attributed to Peach pages. Search "Peach Payments payouts pricing per payout fee", 4 October 2026; candidate source https://developer.peachpayments.com/docs/peach-payouts
[^ps-channels]: Docs say. Paystack, Payment channels: EFT via Ozow, SA only. https://docs-v2.paystack.com/payments/payment-channels/
[^ps-eft]: Docs say. Paystack support, Pay with Bank South Africa (EFT and Capitec Pay); extra KYC review. https://support.paystack.com/en/articles/2132482
[^ps-transfers]: Docs say. Paystack, Single transfers: `basa` recipient, `source: balance`, amounts in subunits, UUID reference, `transfer.success`/`failed`/`reversed`. https://docs-v2.paystack.com/transfers/single-transfers/
[^ps-how-transfers]: Docs say. Paystack, How transfers work: retry with the same reference; failed vs reversed. https://docs-v2.paystack.com/docs/transfers/how-transfers-work/
[^ps-funding]: Docs say. Paystack support, Transfers: 1% top-up fee in SA; ZAR 3 per transfer, failed or successful. https://support.paystack.com/en/articles/2132866
[^ps-manual-payouts]: Docs say. Paystack support, Manual payouts ("Settled to Balance"); SA needs one month of history. https://support.paystack.com/en/articles/2131074
[^ps-subaccount]: Docs say. Paystack, Subaccount API: `settlement_schedule` `manual`. https://docs-v2.paystack.com/api/subaccount/
[^ps-refund-api]: Docs say. Paystack, Refund API: `amount` optional, in subunits. https://docs-v2.paystack.com/api/refund/
[^ps-needs-attention]: Search snippet of Paystack's own docs. Refund `needs-attention` and `POST /refund/retry_with_customer_details/{id}`. https://paystack.com/docs/payments/refunds/ (page blocked for direct fetch)
[^ps-refund-support]: Docs say. Paystack support, Initiating and completing a refund: "Our transaction charges are non-refundable". https://support.paystack.com/en/articles/2127106
[^ps-webhooks]: Docs say. Paystack, Webhooks: `x-paystack-signature` HMAC SHA-512; dispute, refund and transfer events. https://docs-v2.paystack.com/payments/webhooks/
[^ps-dispute-api]: Docs say. Paystack, Dispute API: `refund_amount`, `amount`, `status`, `due_at`. https://docs-v2.paystack.com/api/dispute/
[^ps-first-cb]: Docs say. Paystack support, First chargeback: 48 hours for SA businesses. https://support.paystack.com/en/articles/2127234
[^ps-validate]: Docs say. Paystack, Verify account number: `/bank/validate` for SA, ZAR 3 per successful request; resolve is Nigeria and Ghana only. https://docs-v2.paystack.com/identity-verification/verify-account-number/
[^ps-inelig]: Docs say. Paystack support, Ineligible businesses, "General unsupported categories". https://support.paystack.com/en/articles/2127042
[^ps-business-types]: Docs say. Paystack support, Paystack business types. https://support.paystack.com/en/articles/2128898
[^ps-pricing]: Search snippet only. paystack.com/za/pricing was blocked by a bot check on 3 October 2026; figures from the search engine's index of that page. https://paystack.com/za/pricing
[^pf-fees]: Docs say. Payfast fees. https://payfast.io/fees/
[^pf-split]: Docs say. Payfast developer docs, Split Payments: one receiving merchant per transaction, split "instantly". https://developers.payfast.co.za/docs (Split Payments section) and https://payfast.io/features/split-payments/
[^pf-api]: Docs say. Payfast API, Refunds: `amount_available_for_refund`, `PAYMENT_SOURCE` or `BANK_PAYOUT`. https://developers.payfast.co.za/api (Refunds section)
[^pf-terms]: Docs say. Payfast General Terms and Conditions, clauses 5.17(vi), 9.8, 12.2. https://payfast.io/legal/general-terms-conditions/
[^ts-terms]: Docs say. TradeSafe Terms of Service v3.0: clauses 2.14, 5.2, 5.3, 9.2, 10, 11, 12.4, 20.1, 21. https://www.tradesafe.co.za/wp-content/uploads/2024/02/TradeSafe-Terms-of-Service-v3.0-Final.pdf
[^ts-faq]: Docs say. TradeSafe FAQ: fees, Standard Bank escrow account, TPPP, KYC. https://www.tradesafe.co.za/faq/
[^ts-fees]: Docs say. TradeSafe fees. https://www.tradesafe.co.za/fees/
[^ts-alloc]: Docs say. TradeSafe API, Allocations. https://docs.tradesafe.co.za/api/allocations/
[^ts-tx]: Docs say. TradeSafe API, Transactions: BUYER, SELLER, AGENT; STANDARD, MILESTONE, DRAWDOWN. https://docs.tradesafe.co.za/api/transactions/
[^ts-deposits]: Docs say. TradeSafe API, Deposits: methods, limits, "partial payments are not supported". https://docs.tradesafe.co.za/api/deposits/
[^ts-callbacks]: Docs say. TradeSafe API, Callbacks. https://docs.tradesafe.co.za/api/callbacks/
[^ts-tokens]: Docs say. TradeSafe API, Tokens. https://docs.tradesafe.co.za/api/tokens/
[^ts-quickstart]: Docs say. TradeSafe Quick Start. https://docs.tradesafe.co.za/guides/quick-start/
[^nc-guide]: Docs say. Netcash, Payments service guide: batches funded from the Netcash account, including Pay Now collections. https://help.netcash.co.za/docs/quick-start-guides/payments/payments-service-guide/
[^nc-creditor]: Docs say. Netcash API, Salary and creditor payments. https://api.netcash.co.za/outbound-payments/salary-creditor-payments/
[^nc-refunds]: Docs say. Netcash API, Pay Now refunds: card only, "ALL refunds … require manual authorisation". https://api.netcash.co.za/inbound-payments/pay-now/payment-refunds/
[^nc-paynow]: Search snippet only. Netcash Pay Now fee items include "Instant EFT minimum fee" and "Instant EFT commission". https://help.netcash.co.za/docs/account-profile-2/service-profiles/pay-now/
[^nc-avs]: Docs say. Netcash API, ID / Bank Account Verification (Real-Time). https://api.netcash.co.za/value-added-services/avs-real-time/
[^yoco-api]: Docs say. Yoco developer API reference: Yoco API and Checkout API. https://developer.yoco.com/api-reference
[^yoco-instant]: Docs say. Yoco Instant Payout (to the merchant). https://www.yoco.com/za/instant-payouts/
[^investec]: Search snippet of Investec's Postman collection: beneficiaries must be created and paid online first. https://www.postman.com/investec-open-api/programmable-banking/request/26868804-66e7b38a-86f7-49b2-9977-4b0ea2c696a6
[^sarb-d1]: Docs say. SARB Directive 1 of 2007, sections 2.1–3.2. https://www.resbank.co.za/content/dam/sarb/what-we-do/payments-and-settlements/regulation-oversight/D1_2007(ThirdParty).pdf
[^pasa-tppp]: Docs say. PASA, TPPP registration. https://authorisation.pasa.org.za/so-and-tppp/tppp-registration/
[^pasa-list]: Docs say. PASA public list of TPPPs, August 2024. https://authorisation.pasa.org.za/wp-content/uploads/2024/08/Public-list-TPPP-August-2024.pdf
[^sarb-draft]: Docs say. SARB, Draft Directive in respect of specified payment activities, Directive X of 2026, May 2026: definitions 3.86–3.87, sections 5.1, 15.5, 24–25. https://www.resbank.co.za/content/dam/sarb/publications/prudential-authority/pa-public-awareness/communication/2026/prudential-communication-10-of-2026/Annexure%20D-%20Draft%20Authorisation%20Framework.pdf
[^polity]: Secondary. Polity, "South Africa's payments regulatory framework: Third Draft of Authorisation Framework published for comment", 22 May 2026. https://www.polity.org.za/article/south-africas-payments-regulatory-framework-third-draft-of-authorisation-framework-published-for-comment-2026-05-22
