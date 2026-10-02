# Which ways of placing a Cape Town street address in a Region fit the launch stack?

Checked 3 October 2026. Facts for [How is a site placed in a Region?](https://github.com/sfxpers/artisanconnect/issues/88). Not a choice, and not legal advice. No account was opened, no key was requested, and nothing was stored in a provider.

The stack is fixed by [Which stack does the spec assume?](https://github.com/sfxpers/artisanconnect/issues/74): TanStack Start on a Cloudflare Worker, D1 and Drizzle, R2, no Workers AI, Queues, or Analytics Engine. This note only reports what each way of placing an address would need from it.

## Answer

All three ways run on a Worker. None needs a stack change except a geocoder, which adds an outbound call and, for most providers, a secret.

| | Fixed suburb list | Polygons plus a geocoding API | City of Cape Town open data |
| --- | --- | --- | --- |
| What places the site | The Client picks a suburb. Nothing checks it against the street. | A provider turns the typed address into a point. A point-in-polygon test turns the point into a Region. | The City's own address points and boundary layers. The City's server can answer both steps with no key. |
| Key in development | None | Google, Mapbox, Geoapify, and LocationIQ need one. The public OpenStreetMap service needs none. | None. The layers are public. |
| Cost | None | Free tiers exist for all of them (below). Google and Mapbox bill after the free tier. | None stated. |
| Terms on storing the result | Not applicable | Differ sharply. Google does not allow caching a geocode, except a place ID. Mapbox allows storing only with its permanent endpoint. | A custom licence. Its terms link returned 404 (below). |
| South African coverage | The City's list is official and complete for the City. | Google marks South African geocoding as good quality. Mapbox, HERE, Geoapify, and LocationIQ docs read here do not say. | The City publishes 862,337 official address points. |
| Edges the City already has | None match the twelve Regions (below). | Not applicable | None match the twelve Regions (below). |

## The twelve Regions have no official edge

The twelve names come from [Who can see a Job, and how do Artisans arrive?](https://github.com/sfxpers/artisanconnect/issues/65). The City publishes these layers, each queried on 3 October 2026:

| Layer | Features | Names |
| --- | --- | --- |
| Official Planning Suburbs | 778 | Suburb names, upper case, no duplicates. |
| Development Management Districts | 8 | Cape Flats, Mitchells Plain/Khayelitsha, Helderberg, Table Bay, Southern, Tygerberg, Blaauwberg, Northern. |
| Sub councils | 20 | Subcouncil 1 to Subcouncil 20. |
| City Health Regions | 8 | Khayelitsha, Mitchells Plain, Klipfontein, Southern, Eastern, Tygerberg, Western, Northern. |
| Area Based Service Delivery Areas | 4 | Area 1 to Area 4. |
| Wards | not counted | Council wards across several delimitations. |

None of these is the twelve. The Development Management Districts come closest by name, and they put Mitchells Plain and Khayelitsha in one district where the launch splits them. No layer has Atlantic Seaboard, City Bowl, Cape Flats and Mitchells Plain, Durbanville and Kraaifontein, or Atlantis as an edge. Whoever builds a Region from official data builds it from suburbs.

## 1. A fixed list of suburbs

The City's Official Planning Suburbs layer is the only official list. It has 778 suburbs, each a polygon with a name and a numeric key (`SL_OFC_SBRB_KEY`). Names are unique. The City's description says suburbs "form the last part of the Official Situational Address for each property". It also says the City changes boundaries or adds suburbs when new developments are built.

Facts a list built from it would have to handle:

- Several entries are not residential: `AIRPORT`, `AIRPORT CITY`, `TABLE MOUNTAIN`, `ATLANTIS INDUSTRIAL`, `KRAAIFONTEIN INDUSTRIA`, `HELDERBERG INDUSTRIAL PARK`.
- Some names carry a disambiguating suffix: `AVONDALE - PAROW` and `AVONDALE - WESFLEUR`, `WESTRIDGE - MITCHELLS PLAIN` and `WESTRIDGE - SOMERSET WEST`.
- Some names are not the name a Client would type. There is no suburb named plain `ATLANTIS`. The nearest are `AVONDALE - WESFLEUR`, `WESFLEUR`, `ROBINVALE`, `SAXONSEA`, and `ATLANTIS INDUSTRIAL`. `CAMPS BAY / BAKOVEN` is one entry.
- At least one name has a trailing space (`AMANDA GLEN `).
- The list says which suburb the Client claims. Nothing in it checks that the street is in that suburb.

The 778-name list is small. The polygons are not needed to use it.

## 2. Region polygons plus a geocoding API

A Worker can call any HTTP API. The Cloudflare limits page says a Worker is limited to 64 MiB, 50 subrequests per invocation on the free plan and 10,000 on the paid plan, and 10 ms CPU per HTTP request on the free plan. The suburb polygons are 8.5 MB as GeoJSON with 200,764 vertices, and 3.0 MB gzipped. That was measured here on the unsimplified layer. Point-in-polygon on that would run in the Worker or at a database, and the stack names no spatial index.

| Provider | Key | Free tier | Terms on storing the result | South African address coverage |
| --- | --- | --- | --- | --- |
| Google Geocoding API | Not confirmed from the pages read. | 10,000 billable events per month. Then $5.00 per 1,000, falling with volume. | The Terms of Service say Customer "will not cache Google Maps Content except as expressly permitted". The Geocoding policies page exempts only the place ID, which "can be stored indefinitely". The service-specific terms read here give a 30-day period only for the Address Validation API, not for Geocoding. A result shown on a map "must be shown on a Google Map". Without a Google map, attribution is required. | The coverage table marks South Africa geocoding as "available in the area, with good data quality and availability". |
| Mapbox Geocoding | Yes. Permanent storage "requires that you have a valid credit card on file or an active enterprise contract". | Temporary: 100,000 per month, then $0.75 per 1,000. Permanent: 500,000 per month, then $5.00 per 1,000. | Temporary results are not allowed to be cached. Permanent results may be stored indefinitely. "You may only use responses from the Geocoding API in conjunction with a Mapbox map." | The Geocoding docs do not name South Africa. Their coverage sections are about languages. Not established. |
| OpenStreetMap Nominatim, public service | None. A valid referer or User-Agent is required. | One request per second. | "Results must be cached on your side". A service "whose primary function is related to geocoding" must run its own. | Not measured here. |
| Geoapify | Yes. No credit card for the free plan. | 3,000 credits per day, 5 requests per second. | The pricing page does not say. | Not established. |
| LocationIQ | Yes. | 5,000 requests per day, 2 per second. | A free account may cache request-response pairs for up to 48 hours. Attribution "Search by LocationIQ.com" is required. | Not established. |
| HERE Geocoding and Search | Not confirmed. | Not read. | Not read. The pricing page and the docs page fetched did not state it. | Not established. |

The Nominatim policy forbids autocomplete on the public service: "you must not implement such a service on the client side using the API." Google and Mapbox bill autocomplete per keystroke by default (Mapbox states it).

The Geoapify and LocationIQ rows are from their pricing pages as summarised by the fetch tool. Re-read the terms before relying on them.

Three consequences are stated by the sources and not argued here:

- A Google result that is not stored cannot also be the Region the Job is posted in, if that Region is derived from a cached geocode. A Region name is not a geocode, and no source says whether a derived Region counts as Google Maps Content. The Terms also say Customer will not "create content based on Google Maps Content". Whether a Region derived from a geocode is that content is a legal reading, not a fact this note can supply.
- Mapbox ties every response to a Mapbox map. The launch interface has no map.
- Nominatim's public service says to cache locally. It forbids the one thing a search-as-you-type field would do.

## 3. City of Cape Town open data

The City's Open Data Portal is `odp-cctegis.opendata.arcgis.com`. Each layer is served live from the City's servers. The item pages say a layer's "Last Updated" or "Publish Date" refers to the metadata only.

**Boundaries.** The suburb layer downloads as GeoJSON from the portal, and the City's service answers a point-in-polygon query. Tested: a point in Gardens returned `ORANJEZICHT`, and a point at 3 Diemar Road, Kommetjie returned the Development Management District `SOUTHERN`. No key was sent. The calls took 2.0 and 3.5 seconds.

**Addresses.** The Street Address Numbers layer has 862,337 point features. Fields include `ADR_NO`, `STR_NAME`, `LU_STR_NAME_TYPE`, `OFC_SBRB_NAME`, and `FULL_ADR`. The City describes it as the official Situational (Street) Address, one per property. A query by street name, number, and suburb returned the point and the suburb. Sample rows show:

- Two points for one address, `3  DIEMAR Road KOMMETJIE` (two spaces) and `3 DIEMAR Road KOMMETJIE`.
- Different life-cycle and status keys on neighbouring rows (`LU_LIFE_CL_STG_KEY`, `LU_ADR_STS_KEY`), whose meaning this note did not look up.
- A page limit of 2,000 records, so the whole layer is 432 pages.

A query for street `LONG`, number 100, returned `100 LONG Street CAPE TOWN CITY CENTRE`, again twice. Long Street is in that suburb, not in Gardens, so the address the Client types may name a suburb different from the official one. The stored form is `<number> <STREET NAME> <Type> <SUBURB>`. Only structured queries on street name and number were run. Free-text matching over the layer was not tested.

**What this does not give.** It is not a documented geocoding API. It has no fuzzy match, no autocomplete, and no tolerance for misspelling. It covers only properties inside the City.

**Hosting and licence.** The published feature-service address is `esapqa.capetown.gov.za`. The `qa` in the name is the City's. This note could not tell whether it is a production endpoint with a stability promise. The layers' licence is listed as "custom". Its text is a disclaimer that the City makes no warranty as to correctness. The licence links to `https://www.capetown.gov.za/General/Terms-of-use-open-data`. That address returned 404 on 3 October 2026, so the reuse and redistribution terms were not read. A web search describes that page as saying the data is "as is".

## Not established

- Address-level coverage of any geocoder over the twelve Regions. No provider was run against real Cape Town addresses.
- Whether any provider's free tier needs a payment card. Only Mapbox's permanent endpoint is stated.
- The City's reuse and redistribution terms.
- Whether the City's feature-service host is a supported production endpoint.
- What the City's life-cycle and status keys mean, and so which address points are current.
- Which suburbs fall in which of the twelve Regions. This note did not draw any edge.
