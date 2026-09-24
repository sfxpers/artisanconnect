# Which South African sources can perform the launch verification checks, and a payout-account name check?

Checked 24 September 2026. Facts for [What may an Admin decide, and what must stay a queue?](https://github.com/sfxpers/artisanconnect/issues/71). Not a vendor choice, and not legal advice. No account was opened, and no money was moved.

The checks are already decided. This note only says, for each one, whether the body that owns the record exposes a lookup an integrator can call, or whether a human must read a document. A public web form is recorded as a web form. It is not upgraded to an API. A bank or payment-company product page is not treated as evidence that a lookup exists.

## Answer

No official source exposes a lookup an integrator can call for the trained plumber, the electrical registered person, the electrical contractor, the criminal-record check, business insurance, or the payout-account name. A human reads a document the issuer, or the account-holding bank, gave the person.

The one exception is the authorised gas practitioner. The organisation the Department of Employment and Labour's guidance notes name publishes a public web search of its register. That search is not a documented API, and it is not a search by Identity Number.

| Check | Who holds the record | Integrator lookup | What a human reads |
| --- | --- | --- | --- |
| Trained plumber | Quality Council for Trades and Occupations, for a trade certificate. A SETA, for a certificate that SETA issued. | No. Confirmation requires a certified copy, sent through a registered verification client. There is no public register of trained plumbers. | The trade certificate, or the National Certificate the building regulation also names. |
| Authorised gas practitioner | SAQCC Gas, the organisation the Department's guidance notes name for this registration. | No documented API. A public web search exists, by province, registration number, surname, or town. Not by Identity Number. | The registration card, if the search is not used. A surname hit still has to be matched to the named person. |
| Electrical registered person | Chief inspector, Department of Employment and Labour. The regulations put the registration on a national database. | No. The database is not published as a search. The Department's online services list has no such tool. | The certificate of registration. The holder must produce it on request. |
| Electrical contractor, in the named person's name | Same department. Annual registration, also entered on that national database. | No. The published method for checking a letter is a telephone enquiry, not an API. | The letter of registration. The application form names the applicant and the ID number, and separately asks whether the business is a sole proprietor, partnership, company, or close corporation. |
| Criminal-record check, optional | South African Police Service, Criminal Record and Crime Scene Management. | No. The website enquiry is the status of an application already lodged. It does not return convictions. | A Police Clearance Certificate, handed to the applicant or a person the applicant named. The Service's own page states the purpose as emigration, travel, or employment abroad. |
| Business insurance, optional | No regulator holds a register of who has a policy. The Financial Sector Conduct Authority lists licensed insurers and authorised financial services providers. That is the firm, not the policyholder. | No. | The insurer's policy schedule or certificate of insurance. |
| Payout account bears the named person's name | The account-holding bank. | No public lookup. Account Verification Services exist at the payment-system operator, for participants, not as a public API. Confirmation of Payee is not published as a live domestic lookup. | A document the bank issued, such as a confirmation of account. This note does not choose a bank or a payment company to contract. |

## Trained plumber

The credential is a qualification, not a practising-licence register. The body that verifies the trade certificate is the Quality Council for Trades and Occupations.

The QCTO says it verifies trade certificates issued by itself and by the Departments of Labour, Manpower, and Higher Education and Training, including the former TBVC homelands, and occupational certificates issued since 2016. A certified copy of the certificate, not older than three months, must accompany every application. The certificate holder cannot apply directly. Only a verification client that has signed an agreement with the QCTO can request the service and pay the fee. The client portal is a login at `verification.qcto.org.za`, after that agreement. It is not a search by name or Identity Number. Sources: [QCTO, for employers](https://www.qcto.org.za/for-employers.html), and the QCTO's [verification infographic](https://www.qcto.org.za/assets/verification-infographic-final-2021-approved.pdf).

The same infographic says a trade certificate issued by a SETA or a training board is verified by that SETA, not by the QCTO. Plumbing qualifications on the National Qualifications Framework were quality-assured by the Construction Education and Training Authority. CETA's own pages describe issuing certificates, and they require a certified copy of an identity document with a certification request. They do not publish a register of plumbers. Source: [CETA, application for certificates](https://www.ceta.org.za/media/press-news/application-for-certificates-amended-requirements).

The South African Qualifications Authority does not verify the trade certificate. Its FAQ says to contact the QCTO. SAQA's own service verifies qualifications recorded on the National Learners' Records Database. A private-sector client must return a verification agreement before it can use that service. When another party queries a learner, the query has to name the qualification, the institution, and the date, and the answer is "found" or "not found" for that query only. That is not a plumber register, and it is not a substitute for the QCTO check of the trade certificate. Sources: [SAQA FAQ](https://saqa.org.za/frequently-asked-questions/), [SAQA Verifications Service](https://www.saqa.org.za/services/verification-services/), [SAQA, private-sector clients](https://verisearch.saqa.org.za/ClientMenuPage.aspx), and [gov.za, verify qualifications](https://www.gov.za/services/services-residents/education-and-training/tertiary-education/verify-qualifications).

A Plumbing Industry Registration Board register is not this check. The decided credential is the trained plumber, and that board is not the issuer of the trade certificate.

## Authorised gas practitioner

The Pressure Equipment Regulations define an authorised person as someone an organisation approved by the chief inspector has registered for a scope of work. The regulations do not name the organisation and do not publish a lookup. The Department of Labour's guidance notes, Government Notice 167 in Government Gazette 38505 of 27 February 2015, name "SAQCC (Gas) registered gas practitioner in the applicable field" as that registration. The notes guide. They do not replace the regulations. Source: [Guidance notes](https://www.gov.za/sites/default/files/gcis_document/201503/38505gon167.pdf), the note under the definition of "authorised person".

SAQCC Gas says the Department of Employment and Labour appointed it to register gas practitioners, and that approved applicants are entered on a national database of authorised practitioners. The same page says that database is on its website so a person can find a practitioner and check the credentials of someone offering gas services. The search form on that page posts to `https://saqccgas.co.za/find/` and takes a province, an SAQCC Gas registration number, a surname, or a town. It does not take an Identity Number. No API, schema, or integrator agreement is published on the page. The results address did not respond in this pass, so this note does not describe what a result row contains. Source: [About SAQCC Gas](https://saqccgas.co.za/about-saqcc-gas/), read 24 September 2026.

The organisation also tells a person to ask for the registration card. That card is a document. The web search is the lookup. It is a lookup a person uses. It is not a lookup an integrator is given a contract to call.

## Electrical registered person

The Electrical Installation Regulations, 2009, Government Notice R. 242 in Government Gazette 31975 of 6 March 2009, say the chief inspector furnishes a registered person with a certificate of registration and enters the registration on the national database. A registered person must produce that certificate on request to an inspector, an approved inspection authority, a supplier, or any person to whom a certificate of compliance is to be issued. The regulations do not say the database is public, and they do not describe a query. Source: [eir2009.pdf](https://www.labour.gov.za/DocumentCenter/Regulations%20and%20Notices/Regulations/Occupational%20Health%20and%20Safety/eir2009.pdf), regulation 11(3) and 11(4).

The QCTO says it does not verify a wireman's licence. "Wireman's license can only be verified by the Department of Labour." Source: the [verification infographic](https://www.qcto.org.za/assets/verification-infographic-final-2021-approved.pdf). The Department does not publish how that verification is requested, beyond the certificate the holder must produce.

The Department's online services page, read 24 September 2026, lists compensation, UIF, employment equity, inspection, and employment-services tools. It does not list a registered-person search or an electrical-contractor search. Source: [Online services](https://www.labour.gov.za/online-tools).

The Electrical Contracting Board is not this issuer. The regulations name the chief inspector.

## Electrical contractor, in the named person's name

Regulation 6(2) requires annual registration with the chief inspector. Regulation 6(4) says the chief inspector registers the applicant and enters the registration on the national database, if the applicant has a fixed address and a telephone and either employs a registered person full-time or is a registered person. Same gazette, [eir2009.pdf](https://www.labour.gov.za/DocumentCenter/Regulations%20and%20Notices/Regulations/Occupational%20Health%20and%20Safety/eir2009.pdf).

Annexure 3 asks for the applicant's surname, name, and ID number, then a registered name, a trading name, and whether the business is a sole proprietor, partnership, company, or close corporation. A human reading the letter of registration can see whether the registration is in the named person's name. The database that would confirm the letter is current is the same unpublished national database.

The Department's own public instruction, in a 26 July 2021 media statement, is to telephone 051 505 6371/6200 to verify the authenticity of an electrical contractor's letter of registration. That is a person answering a telephone. It is not an integrator lookup, and the statement is a Free State release, not a published national API. Source: [Beware fake electrical contractors](https://www.labour.gov.za/beware-fake-electrical-contractors-department-of-employment-and-labour-warns-public).

The Employment Equity public register on the same site is a list of designated employers who filed an equity report. It is not the electrical-contractor database, and it is not used here.

## Criminal-record check

The South African Police Service says a Police Clearance Certificate is an official document issued by Criminal Record and Crime Scene Management stating whether any criminal convictions have been recorded against an individual. The page states that this service is for people who need confirmation of their criminal status for emigration, travel, or employment abroad. Fingerprints are taken on a SAPS 91(a). The certificate is handed to the applicant, or to a person the applicant named, or to a courier the applicant chose. Completed certificates are not scanned and emailed. Certificates not collected within three months are destroyed. Source: [Applying for a Police Clearance Certificate](https://www.saps.gov.za/services/applying_clearence_certificate.php).

The online enquiry on the same site asks for the enquiry number allocated to an application already lodged, plus an identity number or a date of birth. The page read on 24 September 2026 says the data were updated on 5 September 2026, and that the results are finalised and outstanding applications. It does not return the criminal record. Source: [Police Clearance Certificates: Online Enquiry](https://www.saps.gov.za/services/certificate.php).

A Police Clearance Report is a different document, issued by a local criminal record centre for an expungement application, and handed to the applicant in person. It is not a third-party lookup. Same applying page.

No SAPS page read in this pass exposes a query an integrator can send to learn whether a named person has a conviction. The official instrument is the certificate. A human reads it. The Service's stated purpose is emigration, travel, or employment abroad. This note does not decide whether that certificate is the document a domestic optional badge should accept. It records that no other official lookup was found.

## Business insurance

No page of the Financial Sector Conduct Authority or the Prudential Authority read in this pass is a register of policyholders.

The FSCA publishes summative lists of regulated entities and a search of authorised financial services providers, by FSP number, name, postal code, or a person's ID where that person is the searched representative. That confirms a firm or a representative is authorised. It does not confirm that a named person holds a policy. Sources: [Regulated entities](https://www.fsca.co.za/Regulated-Entities/) and [Search authorised FSPs](https://www2.fsca.co.za/Fais/Search_FSP.htm). The FSCA also publishes a list of licensed insurers, with the classes of policy each insurer may write. That is the insurer, not the insured. Source: the FSCA [list of licensed insurers](https://www2.fsca.co.za/MagicScripts/mgrqispi.dll?APPNAME=Web&PRGNAME=List_Of_Registered_Insurers). The Prudential Authority's insurer-list page rejected the fetch, so this note does not quote it. Silence there is not a policyholder register.

The document a human reads is the schedule or certificate the licensed insurer issued to the named person. There is no official lookup behind it.

A Letter of Good Standing from the Compensation Fund is a different instrument. The Department publishes a validator that takes the certificate number and returns the trade name, issue date, and expiry date. Source: [Verify LOGS](https://cfonline.labour.gov.za/VerifyLOGS/). That validator checks a workers' compensation letter. It does not check a business-insurance policy, and it is not this badge.

## Payout account that bears the named person's name

No department publishes a register of which bank account bears which person's name. The name is held by the account-holding bank.

The payment-system operator, PayInc, formerly BankservAfrica, lists Account Verification Services as a supplementary service. Its 2019/20 disclosure, still the disclosure file published at the operator's own address, says services are provided to participants, that a prospective participant must meet criteria set by the South African Reserve Bank's National Payment System Department and the payment system management body, and that technical specifications are given to participants, not to the public. The disclosure names the service. It does not publish an API, and it does not say a non-participant may query an account name. Source: [BankservAfrica PFMI disclosure, 2019/20](https://www.bankservafrica.com/website/assets/DisclosureFramework.pdf), the supplementary-services list and Principle 18. The operator's current site still lists Account Verification (AVS) in its services. The service page itself did not render as text on 24 September 2026, so this note does not quote a field list from it. Source: [PayInc](https://www.payinc.co.za/).

The South African Reserve Bank's 2025/26 annual report describes Confirmation of Payee as a pre-payment validation mechanism studied during the G20 presidency, so that specifications can be harmonised across jurisdictions. It defines it as a way for a payer to confirm that the recipient is the intended party before money moves. It does not publish a domestic lookup, and it does not say an integrator can call one. A PEMKey, a reusable payment credential, is described as a minimum viable product aimed at the 2026/27 financial year. It is not a current account-name check. Source: [SARB annual report 2025/26, Powering payments reform](https://www.resbank.co.za/content/dam/sarb/publications/reports/annual-reports/2026/chapters/policy-implementation/payments-25-26.pdf).

A bank's own account-verification product, and a payment company's account-validation API, are vendor offerings. They are not cited as evidence that an official lookup exists, and no vendor is chosen here.

What remains, without contracting a participant, is a document the account-holding bank issued in the named person's name. A human reads it. Whether a joint account matches is a matching detail of whatever source is later used. It is not a second official register.

## What was not found

No public register of trained plumbers. No published query of the electrical national database. No SAPS query that returns convictions to a third party. No policyholder register at the conduct or prudential authority. No public confirmation-of-payee API.

The QCTO verification-client portal, the SAQA verification agreement, and PayInc Account Verification Services are real services. Each one sits behind an agreement with the body that holds the record, and each one, on the pages read, still starts from a document or from participant access. None of them is a lookup an integrator can call from the public pages.

## What this does not decide

This does not decide what an Admin may accept, how long a document stays current, or which vendor to contract. Those questions stay on [What may an Admin decide, and what must stay a queue?](https://github.com/sfxpers/artisanconnect/issues/71). Permission to work stays on [Which documents evidence a current permission to work?](https://github.com/sfxpers/artisanconnect/issues/78). The Identity Number is already held. It is not a badge, and none of the lookups above is a search by that number.
