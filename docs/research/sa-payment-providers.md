# Licensed South African providers and the marketplace money contract

Checked 24 September 2026. Feasibility only. No account was opened, no provider was selected, and no live money was enabled.

## Answer

No provider whose own docs were checked documents the contract as a product: collect the full accepted Quote by card or Instant EFT before work starts, hold that money until Completion (or release 30 percent at start and 70 percent at Completion), refund, reconcile, and pay out only to a verified Artisan bank account, with ArtisanConnect not holding the float.

The contract breaks on delayed or conditional release. The docs show two different products, and neither is that hold:

- **Settlement-time split.** Payfast, Paystack, and Stitch can divide a successful collection between the platform and one other merchant account. The split is fixed when the payment is made and settles on the normal payout cycle. It is not held until a later Completion event, and it is not a second release of the remainder.
- **Merchant-funded payout.** Ozow, Peach Payments, and Stitch can send money to a third-party South African bank account, and some of them can check that account first. Those payouts are drawn from a float or company bank account the merchant must fund. Collected client money is not held there for later release. Using that path means ArtisanConnect holds or supplies the float.

Refund and reconciliation are documented widely. They are not the break.

Paystack's manual-payout balance plus Transfers is the only documented way to keep collected ZAR off the platform's own bank account and later send a chosen amount to a validated third-party account. That is still the merchant's Paystack balance, not a documented escrow, and it does not meet the contract. Detail is under Paystack below.

That is the fact the blocked ticket "How does money move inside an Engagement, short of a live provider?" is waiting on: **none of the checked docs show delayed or split release of collected client funds to a third-party bank account.**

## Contract tested

Hypothesis, not a decision:

1. Collect the full accepted Quote from a Client by card or Instant EFT before work starts.
2. Hold the funds.
3. Release either all of it at Completion, or 30 percent at start and 70 percent at Completion.
4. Refund.
5. Reconcile.
6. Pay out only to a verified Artisan bank account.
7. ArtisanConnect must not hold the float itself.

"Card or Instant EFT" is read as the allowed collection rails, not a requirement that one provider must offer both. Each row records which rail the docs actually name.

## Where the contract stands

| Piece | What the checked docs support | Where it breaks |
| --- | --- | --- |
| Collect the full Quote by card or Instant EFT | Payfast, Paystack, Peach, Ozow, Stitch, and Yoco document card and/or bank-pay collection in South Africa. | Collection is not the gap. |
| Hold until Completion, or 30 percent at start and 70 percent at Completion | Not documented. Splits fire at payment or settlement. Payout products pay from a merchant-funded float, not from a held Quote. | This is the break. No checked doc describes a release triggered by start or Completion, or a second release of the unreleased share. |
| Refund | Documented for Payfast, Paystack, Peach (method-dependent), Ozow, Stitch, and Yoco. | A refund of the original collection is not the same as reversing a later payout to an Artisan. Ozow says a payout cannot be reversed once processed. Peach's Payouts API says refunds are not supported on that API. |
| Reconcile | Documented: Payfast ITNs, Paystack payout and transfer records, Peach settlement reports, Ozow payout status, Stitch settlement and split fields, Yoco payout export. | Not the break. |
| Pay out only to a verified Artisan bank account | Paystack, Peach, and Stitch document a name or ownership check before a payout. Ozow's CDV check does not confirm the account is open or owned by the Artisan. Payfast's split pays another Payfast merchant, not an arbitrary bank account. Yoco payouts go to the merchant's own bank. | "Verified Artisan bank account" is only partly documented, and never as the destination of a held Quote. |
| ArtisanConnect must not hold the float | Pay-in settlement, in the docs that describe it, lands in the merchant's bank account or the merchant's processor balance. Payout floats are topped up by the merchant. | A processor balance the platform can transfer from is still the platform's balance. The docs do not show a segregated client hold the platform cannot warehouse. |

## Providers checked

### Payfast (Pty) Ltd

SARB designated Payfast (Pty) Ltd (registration number 1999/017441/07) as a clearing system participant. The same notice says Payfast is a third-party payment provider and a system operator registered with the Payments Association of South Africa, that Absa Bank Limited is the associated settlement participant, and that Payfast must continue as a TPPP under the Directive for Conduct within the National Payment System in respect of Payments to Third Persons (Directive 1 of 2007) while designated. The notice also consolidates Paygate, Setcom, and Payfast into that one entity. Paygate was not checked as a separate escrow product. Sources: [Government Gazette No. 51556, Notice 5549, 15 November 2024](https://www.gov.za/sites/default/files/gcis_document/202411/51556gon5549.pdf), and the [SARB designation PDF](https://www.resbank.co.za/content/dam/sarb/what-we-do/payments-and-settlements/regulation-oversight-and-supervision/designation-notices/Designation%20of%20Payfast%20(Pty)%20Ltd%20as%20a%20clearing%20system%20participant.pdf).

| Piece | Docs |
| --- | --- |
| Collect | Card and Instant EFT are listed payment methods. Instant EFT is "available on Aggregator only." [Payment methods](https://payfast.io/features/payment-methods/). |
| Hold / split release | Split Payments "instantly splits a portion of an online payment with a third party." The payment reflects in the main Payfast account, then the predetermined funds are immediately split to a secondary Payfast account. One receiving merchant per split. The receiving merchant is identified by Payfast merchant ID, not by an arbitrary bank account. Percentage, fixed amount, or both, with optional min and max, in cents. The split is set on the payment request or as a global account setup. It is not a later release. [Feature page](https://payfast.io/features/split-payments/), [developer docs](https://developers.payfast.co.za/documentation/#splitpayments). |
| Refund | Full or partial refund of the original transaction from the dashboard, including card and Instant EFT. The docs do not say a refund claws back an already-split share from the secondary merchant. [Merchant refund](https://payfast.io/features/merchant-refund/). |
| Reconcile | Instant transaction notifications (ITNs) are part of the developer integration. [Developer docs](https://developers.payfast.co.za/documentation/). |
| Payout | Immediate Payout sends cleared funds from the Payfast account to the merchant's linked bank account, within minutes, for eligible verified merchants. Standard payout is described as typically 1–2 working days. The destination is the merchant's own registered account, not an Artisan account chosen per Engagement. [Immediate payout](https://payfast.io/features/immediate-payout/). |
| Float | The unsplit remainder stays in the main Payfast account and is paid to the platform's linked bank. That is the platform receiving the float. |

Does not meet the contract. Instant split to another Payfast merchant is not a hold until Completion, and it is not a payout to a verified Artisan bank account on a later event.

### Paystack

Stripe's own country list marks South Africa as "Extended network" and links to Paystack, not to a Stripe registration for ZA. [Stripe global availability](https://stripe.com/global). Paystack's support docs describe South African businesses, ZAR VAT invoices, card, Instant EFT via Ozow, and Capitec Pay. Those pages do not state that a Paystack entity is registered with SARB or PASA. A search snippet of [Paystack's terms](https://paystack.com/terms) describes Paystack Payments Limited as a Nigerian company licensed by the Central Bank of Nigeria. The terms page itself returned 403 on fetch, so that licence sentence is not quoted from a page read in full. Do not treat Paystack as a confirmed SARB-licensed South African provider on this record.

| Piece | Docs |
| --- | --- |
| Collect | Card, including American Express by default for South African businesses. [Pay with card](https://support.paystack.com/en/articles/2128258). Instant EFT via Ozow, and Capitec Pay, after an extra KYC review. Ozow Instant EFT covers Absa, FNB, Investec, Nedbank, Standard Bank, Bidvest Bank, and TymeBank. [Pay with Bank South Africa](https://support.paystack.com/en/articles/2132482). |
| Hold / split release | Transaction splits settle the vendor's bank account and the platform's share "simultaneously" on the payout schedule. A subaccount is a bank account; the account name is resolved when it is created. The first payout to a new or updated subaccount is delayed until the platform verifies the subaccount, then later payouts follow the market schedule. That delay is a one-time verification hold, not a hold until Completion. South Africa's automatic payout schedule is T+2. [Transaction splits](https://support.paystack.com/en/articles/2132802), [Getting your money](https://support.paystack.com/en/articles/2125314). |
| Manual balance | Registered businesses in South Africa can ask support to switch to manual payouts. Support asks why, "to confirm whether it is the best fit for your business model in terms of compliance." South Africa needs at least one month of transaction history. After approval, ZAR is credited to the Paystack balance early on the second day, including weekends and holidays, instead of being paid to the merchant bank. From that balance the merchant can transfer out at any time. [Manual payouts](https://support.paystack.com/en/articles/2131074). |
| Transfers | Transfers send money from the Paystack balance to a bank account in the business's country. South Africa: ZAR 3 per transfer, minimum ZAR 1, maximum ZAR 1,000,000 per transfer. An Account Validation API can check a personal or business account before the transfer, at ZAR 3 per successful request. The docs point at [the developer page](https://paystack.com/docs/identity-verification/verify-account-number/#account-validation), which was behind a bot wall and was not read. The support article itself states the check exists. [Transfers](https://support.paystack.com/en/articles/2132866). |
| Refund | Full or partial refund from the dashboard or API. Refunds are deducted from pending payout, or from the Paystack balance for a registered business. South Africa can retry a failed refund to a customer bank account after Paystack resolves the account name. [Refunds](https://support.paystack.com/en/articles/2127106). |
| Reconcile | Payout detail pages, CSV export, transfer references, and the refunds page. [Getting your money](https://support.paystack.com/en/articles/2125314), [Transfers](https://support.paystack.com/en/articles/2132866). |
| Float | Default settlement pays the platform's own bank account. Manual payouts leave the money in the merchant's Paystack balance, which the merchant can transfer. The docs call it "your Paystack Balance." They do not call it client escrow, and they do not say how long funds may sit there. |

Does not meet the contract. A 30/70 release could be assembled by transferring twice from a manual balance, but that assembly is not what the docs describe, it needs a support exception, the money is available only after T+2, and the balance is the platform's. Developer docs for split payments and transfers were not readable (HTTP 403). The support articles above are Paystack's own.

### Stripe

Not a South African acquiring platform on Stripe's own country page. South Africa is "Extended network" and the signup link is Paystack. [Stripe global](https://stripe.com/global).

Separate charges and transfers, the Connect flow that charges the platform and later transfers a chosen amount to a connected account, is listed for a set of regions that does not include ZA. Cross-border transfers on the payments balance are limited to the United States, Canada, the United Kingdom, the EEA, and Switzerland. Otherwise the platform and the connected account must be in the same region. [Separate charges and transfers](https://docs.stripe.com/connect/separate-charges-and-transfers).

Express and Custom connected-account country lists do include ZA, with the caveat that some countries are available only for cross-border payouts. [Connected account types](https://docs.stripe.com/connect/accounts). That does not create a South African platform that can collect ZAR and hold it. Stripe is not a candidate for this contract.

### Peach Payments

Peach's developer docs describe South African card collection (Visa, Mastercard, Amex, Diners) and bank methods (Pay by Bank, Capitec Pay, Absa Pay, Peach EFT, PayShap). Card refunds are full or partial. Pay by Bank, Capitec Pay, Absa Pay, and Peach EFT are marked as not refundable in the payment-method table; those refunds must be done manually. [Payment methods](https://developer.peachpayments.com/docs/pp-payment-methods).

Settlement of collected money is into the business bank account: next business day on a Peach aggregation account, or the acquiring bank's own cycle on an ISO account with Nedbank, Absa, or FNB. [Settlement and billing](https://developer.peachpayments.com/docs/reference-reconciliation-settlement-billing). Reconciliation reports and a Reconciliation API are documented from the same hub. [llms.txt index](https://developer.peachpayments.com/llms.txt).

Payouts are a separate product. The merchant deposits funds into a Peach Payments account, sends a source-of-funds document, verifies the recipient with bank account verification (BANV), then creates a payout. BANV covers the major South African banks. The Payouts API page says "Refunds are not supported" and "Once a payout is successfully submitted, you cannot recall it." Minimum payout is R10. [Payouts](https://developer.peachpayments.com/docs/peach-payouts).

The pages read do not state a SARB or PASA registration. Do not treat that silence as a licence, or as the absence of one.

Does not meet the contract. Collected funds settle to the business. Payouts spend a float the business deposited. There is no documented hold of a Quote until Completion.

### Ozow

Ozow documents Pay by bank, card, Capitec Pay, refunds, and payouts. [Payouts product page](https://ozow.com/our-products/ozow-payouts). The Hub docs are the useful ones.

Payouts are merchant-initiated transfers to a recipient bank account. They are not tied to a pay-in. They draw on a float held with Ozow. "Payins do not need one, so if you only take payments you never meet it." The float is topped up by the merchant paying Ozow from internet banking, and processing can take 1–2 business days. [Send a payout](https://hub.ozow.com/integration-methods/apis/money-out/send-a-payout/), [Float top-up](https://hub.ozow.com/payment-methods/settlements-and-float/float-top-up/).

Account check on payouts is CDV: branch code plus account number against the bank's check-digit rules. Ozow says this "does not check if the account itself is valid or active." [Payouts product page](https://ozow.com/our-products/ozow-payouts). Payouts cannot be reversed once processed. [Send a payout](https://hub.ozow.com/integration-methods/apis/money-out/send-a-payout/).

The Ozow pages read, including [other documents](https://ozow.com/other-documents), do not state a SARB or PASA registration.

Does not meet the contract. Pay-ins and payouts are separate. The platform must fund the float. There is no hold of collected client money, and CDV is not verification that the account belongs to the Artisan.

### Stitch

Stitch's terms, updated 21 September 2026, say Stitch Money Proprietary Limited (2018/409288/07) is registered as a third-party payments processor, a system operator, and a screen scraper with the South African Reserve Bank, and is sponsored by South African banks as a TPPP. The same terms say Stitch acts as an intermediary and is not a party to the transaction between the user and the merchant. [Terms of use](https://www.stitch.money/legal/terms-of-use). That is Stitch's own claim. The SARB page says an official list of registered TPPPs has been published; that list was not retrieved, so this note does not confirm the name appears on it. [PSMB transition](https://www.resbank.co.za/en/home/what-we-do/payments-and-settlements/psmb).

| Piece | Docs |
| --- | --- |
| Collect | Card, Pay by Bank, and Capitec Pay are documented pay-in products. [Payments products](https://docs.stitch.money/payment-products). |
| Split | Card split payments settle a fixed rand amount to one pre-registered destination merchant when the payment succeeds. Stitch creates separate settlement intents. The stated use case includes "a marketplace collects payment and splits settlement between itself and the seller." Destination merchants must be registered with Stitch. One destination merchant per transaction. ZAR only. The split is on the payment call, not a later release. [Split payments](https://docs.stitch.money/payment-products/payins/card/split-payments). |
| Payout | "Payouts are payments made from your company's bank account to a destination account." Disbursements pay destination accounts over SDV or RTC. Refunds of a pay-in go back to the account used for the pay-in. [Payouts overview](https://docs.stitch.money/payment-products/payouts/introduction). The marketing page defines a payout as a transfer from a business bank account to another. [Payouts](https://www.stitch.money/payouts). |
| Verification | Bank Account Verification confirms the account is valid and belongs to the associated user. [BAV](https://docs.stitch.money/payment-products/bank-account-verification/introduction). |
| Reconcile | A settlements product, marked deprecated, pays a batched set of user payments to the client. Test settlements are daily. A Stitch intermediary account is required. [Settlements](https://docs.stitch.money/payment-products/settlements). Split fees and net amounts are readable on the transaction. |
| Float | The payout product spends the company's bank account. A marketing "Float Facility" offers extra funds if scheduled payouts exceed the available balance. That is credit against the business's own shortfall, not a hold of client Quotes. [Payouts](https://www.stitch.money/payouts). |

Does not meet the contract. The marketplace split settles at payment time to a Stitch-registered merchant. Disbursements to a verified bank account come from the company's bank account. Neither holds the Quote until Completion.

### Yoco

Yoco's Checkout API documents refunds of a successful checkout, including a partial amount, confirmed by webhook. [Refunding a payment](https://yoco.docs.buildwithfern.com/guides/online-payments/refunding-a-payment). The Payouts API retrieves payouts to the merchant. Status text refers to "the merchant's receiving bank" and tells the merchant to fix bank details in the Yoco App. It does not document creating a payout to a third party. [Payouts introduction](https://yoco.docs.buildwithfern.com/api-reference/yoco-api/payouts/introduction). Reconciliation matches Checkout IDs to a daily payout export. [Reconciling Checkout API payments with daily payouts](https://yoco.docs.buildwithfern.com/guides/online-payments/reconciliation/reconciling-checkout-api-payments-with-daily-payouts).

The published doc index lists payout retrieval and daily payout reconciliation. It does not list split, escrow, or a payout-create API to an Artisan account. [llms.txt](https://yoco.docs.buildwithfern.com/llms.txt).

SARB has published designation notices for Yoco Technologies (Pty) Limited. Those PDFs were not fetched (the SARB host rejected the request). This note does not quote them. Yoco's own docs, which were read, do not show the contract.

Does not meet the contract. Collection, refund, and reconciliation of the merchant's own daily payout are documented. Hold and third-party release are not.

## Regulator, only as far as the pages read

From 11 August 2026, TPPP registration sits with SARB. Existing TPPP registrations stay valid until SARB publishes the Directive in respect of Specified Payment Activities (the Authorisation Framework). SARB says the official list of registered TPPPs is on its website. That list was not retrieved. [PSMB transition](https://www.resbank.co.za/en/home/what-we-do/payments-and-settlements/psmb).

Directive 1 of 2007 is still the directive Payfast must keep operating under, according to the 2024 designation notice. The directive text itself was not retrieved, so this note does not claim a maximum hold period. The product-doc finding does not depend on one.

## Not checked

No merchant account was opened. Paystack and Stripe developer pages behind bot walls were not read, except where Paystack's own support articles describe the same feature. PayGate's separate gateway docs were not read; the 2024 gazette treats Paygate as consolidated into Payfast (Pty) Ltd. Flutterwave, Adumo, Netcash, iKhokha, and Pay@ were not checked. The SARB TPPP list was not opened, so a provider can be licensed and still be missing from the licence column above.

## What this does not decide

This is not a provider choice. It is the feasibility result for an adapter: the checked primary docs do not show a licensed South African provider holding the Quote and releasing it, whole or 30/70, to a verified Artisan bank account without ArtisanConnect holding or funding the float.
