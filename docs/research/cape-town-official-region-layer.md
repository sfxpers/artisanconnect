# Which official City of Cape Town layer is the best unit for a Region?

Checked 3 October 2026. Facts and a recommendation for [Which official City layer is the best unit for a Region?](https://github.com/sfxpers/artisanconnect/issues/94). [How is a site placed in a Region?](https://github.com/sfxpers/artisanconnect/issues/88) decides. Not legal advice. No account was opened, no key was used, and every query was a read of a public layer. Follows up [Which ways of placing a Cape Town street address in a Region fit the launch stack?](https://github.com/sfxpers/artisanconnect/blob/research/sa-address-region-placement/docs/research/sa-address-region-placement.md).

## Answer

No official layer is both a name a Client uses for their own area and big enough to fill a batch of ten. The best fit is the **Development Management Districts** (8 units), with the **Official Suburb** (778) kept as the thing each site is placed in.

| Layer (official name in the service) | Units | Names | Address points per unit (min / median / max) | Suburbs that straddle it (second unit over 1%) | Used outside the City? |
| --- | --- | --- | --- | --- | --- |
| Official Suburb (`ODP_SPLIT_5/3`) | 778 | Real suburb names. 28 are "EXT n" extensions, 20 carry a " - " suffix, about 28 are industrial or commercial. | 0 / 436 / 25,698 | Not applicable. Every address carries one suburb. | Partly. It is the last part of the City's Official Situational Address. Property portals use suburb-level pages (one checked), not shown to be the City's list. |
| Development Management Districts (`ODP_SPLIT_5/2`) | 8 | Real names: Cape Flats, Mitchells Plain/Khayelitsha, Helderberg, Table Bay, Southern, Tygerberg, Blaauwberg, Northern. | 48,405 / 96,878 / 221,858 | 27 (3.5%) | Not established. Planning-department unit. |
| Sub councils (`ODP_SPLIT_5/5`) | 20 | Numerals only, by by-law. | 20,385 / 38,693 / 92,134 | 81 (10.4%) | Not established. |
| City Health Regions (`ODP_SPLIT_7/11`) | 8 | Real names: Khayelitsha, Mitchells Plain, Klipfontein, Southern, Eastern, Tygerberg, Western, Northern. | 60,068 / 115,377 / 161,345 | 51 (6.6%) | Not established. Used in City Census 2022 profiles. |
| Area Based Service Delivery Areas (`ODP_SPLIT_5/1`) | 4 | "Area 1" to "Area 4" in the layer. City newsletters use Area North, East, Central, South. | 185,999 / 216,379 / 243,559 | 38 (4.9%) | Not established. |
| Wards (`ODP_SPLIT_5/6`) | 116 (all 2021) | Numbers only. | 2,106 / 7,034 / 17,063 | 249 (32.0%) | Yes, as electoral wards. Not established beyond that. |

Address points are the City's 862,337 Street Address Numbers points. They are a proxy for places a Job could be, not for Artisans. No Artisan data exists, so whether any unit can fill a batch of ten was not tested.

## 1. What the City says each layer is for, and who else uses it

The portal items are owned by `cctgis` on ArcGIS Online. Each item's description is quoted or paraphrased below.

**Official Suburb.** The Development Management Department maintains it. The City says suburbs are residential regions set to administer areas more efficiently, and that it changes boundaries or adds suburbs mainly when new developments take place. It says suburbs "form the last part of the Official Situational Address for each property" ([item](https://www.arcgis.com/sharing/rest/content/items/8ebcd15badfe40a4ab759682aacf8439?f=json)). The Street Address Numbers item says that layer is the only source of Situational Addresses in the City ([item](https://www.arcgis.com/sharing/rest/content/items/c2101858187f424298f85e60f9706533?f=json)). Test of that on 3,000 address points (three pages of 1,000 at offsets 100,000, 500,000 and 800,000, ordered by object id): the suburb on every point equals the suburb polygon the point sits in (3,000 of 3,000). Outside the City: Property24's "Cape Town" listing page links 129 suburb pages with Property24's own numeric ids, and 100 of those 129 slugs match an official suburb name exactly ([page](https://www.property24.com/for-sale/all-suburbs/cape-town/western-cape/432)). That shows property portals use suburb-level names. It does not show they use the City's list, and Property24 may list other suburbs under other towns. Utilities: the City publishes prepaid electricity sales by suburb ([item](https://www.arcgis.com/sharing/rest/content/items/7dc533cc51d641d0b05cf94dff04d84f?f=json)). Eskom, banks, the Post Office and delivery firms were not checked.

**Development Management Districts.** The item says the Development Management department regulates land use and building development and "operates on an eight District module" ([item](https://www.arcgis.com/sharing/rest/content/items/045404a7a661442abe6b59b009862e14?f=json)). The City's District Plans page says each district has a ten-year plan the Council approved as policy, approved under the Municipal Planning By-law in February 2023, and gazetted as Environmental Management Frameworks on 15 July 2025 (Gazette 9104) ([page](https://www.capetown.gov.za/work-and-business/planning-portal/plans-policies-frameworks-and-guidelines/district-plans/)). Use outside the City administration was not found.

**Sub councils.** The item says the boundaries "serve to inform administrative delineation" and are as at September 2024 ([item](https://www.arcgis.com/sharing/rest/content/items/34f64f953f0649658c9d58d7ee35c282?f=json)). The by-law says a sub-council is a cluster of adjoining wards and is composed of the ward councillors in it plus allocated proportional councillors ([by-law text](https://openbylaws.org.za/akn/za-cpt/act/by-law/2003/sub-council/eng@2024-08-30)). Use by the public was not found.

**City Health Regions.** The item calls them the administrative districts used by the City Health Department ([item](https://www.arcgis.com/sharing/rest/content/items/7b60bd0882ad4c4c99998c63ec794a78?f=json)). The service's own layer description reads "Date: 2006" ([layer](https://esapqa.capetown.gov.za/agsext/rest/services/Theme_Based/ODP_SPLIT_7/FeatureServer/11?f=json)). The City's Census 2022 profiles are published per health district ([example](https://www.capetown.gov.za/_documents/resource.capetown.gov.za/documentcentre/Documents/Maps%20and%20statistics/health_district_Eastern-Census2022.pdf)).

**Area Based Service Delivery Areas.** The item says the four areas are part of the City's Organisational Development and Transformation Plan, "now dubbed Towards 2022", and are for planning and service delivery ([item](https://www.arcgis.com/sharing/rest/content/items/48b4a333b74646c88e72692ca0c24806?f=json)). The Refuse Collection Beats layer carries an `ABSD_NAME` field ([layer](https://esapqa.capetown.gov.za/agsext/rest/services/Theme_Based/ODP_SPLIT_1/FeatureServer/9?f=json)). The April 2025 City News newsletter has four area editions headed Area North, Area East, Area Central and Area South ([issue 71 north edition](https://www.capetown.gov.za/_documents/resource.capetown.gov.za/documentcentre/Documents/Forms,%20notices,%20tariffs%20and%20lists/CityNews_71_NORTH.pdf)). Which of 1 to 4 is which name was not established. An overlap test against the electricity layer's own "Area North/East/South" labels did not give a clean match.

**Wards.** The item says the layer holds the 2000, 2006, 2009, 2011, 2016 and 2021 wards ([item](https://www.arcgis.com/sharing/rest/content/items/358f42b351c2451f89e2b38dd6f2668f?f=json)). The service holds only year 2021 (116 features; a statistics query on `WARD_YEAR` returned one value, 2021), and the layer description still says 2009, 2011 and 2016. So the metadata disagrees with the data.

**Other official polygon layers.** The portal also holds Special Rating Areas / City Improvement Districts (58, ratepayer-funded top-up service areas), Electricity District Areas (13, with real names such as Muizenberg, Mowbray, Parow, Atlantis, but one of the 13 is an Eskom area and the layer is for electricity supply), Refuse Collection Beats (754), Load Shedding Blocks (19), Electricity Generation and Distribution Districts (3), Estates (34), Tourism Development Areas (12), and Rate Payers Associations (0 features). None is a full-coverage, name-bearing unit for the whole City. The Electricity District Areas are the only other layer with resident-style names, and they are an electricity-supply boundary.

## 2. Do the names mean something to a resident?

- **Suburb names are the names on a street address.** That is the only claim the City makes. Whether a given Client types or knows their own official suburb was not tested. The earlier note already found that the official suburb for an address can differ from what the Client types (Long Street is in `CAPE TOWN CITY CENTRE`, not Gardens). The 778 include entries a Client would not call home: 28 "EXT" extensions (23 are `BELHAR EXT n`), 20 with a " - " suffix, golf courses, a hospital, `AIRPORT`, `TABLE MOUNTAIN`, and (by a rough name search) about 28 industrial or commercial areas.
- **Development Management District names are real place names** but a mix of scales. "Southern" and "Northern" are compass words, and one pairs two townships (Mitchells Plain/Khayelitsha). The planning page names the same district "Khayelitsha/Mitchell's Plain Greater Blue Downs". Whether a Client recognises "Tygerberg" or "Table Bay" as their area was not tested.
- **Sub councils, wards and the service delivery areas have no resident-facing name in the layer.** The by-law says the name of each sub-council is its numeral (section 4(1)). Ward names are "1" to "116". The areas are "Area 1" to "Area 4".
- **City Health Regions have real names**, all of them one word taken from a township or compass point.

## 3. Size and spread

Address-point counts per unit were taken with one polygon-intersect `returnCountOnly` query per unit on the Street Address Numbers layer, using each polygon simplified to 15 m. The sums are 862,302 to 862,328 against 862,337 in the layer, so about 10 to 35 points fall outside every polygon or were lost in the simplification. Suburb counts come from one grouped statistics query on `OFC_SBRB_NAME`. Both are the whole layer, including points whose status key is 3 (19,152 points). What the status, life-cycle and type keys mean was not found.

| Layer | Units | Smallest unit | Largest unit | Units under 10,000 points |
| --- | --- | --- | --- | --- |
| Development Management Districts | 8 | Table Bay 48,405 | Mitchells Plain/Khayelitsha 221,858 | 0 |
| City Health Regions | 8 | Klipfontein 60,068, Khayelitsha 60,667 | Eastern 161,345 | 0 |
| Area Based Service Delivery Areas | 4 | Area 3 185,999 | Area 1 243,559 | 0 |
| Sub councils | 20 | Subcouncil 9 20,385 | Subcouncil 14 92,134 | 0 |
| Wards | 116 | Ward 41 2,106, Ward 90 2,203, Ward 40 2,803 | Ward 16 17,063 | 98 (27 under 5,000) |
| Official Suburb | 778 | `AIRPORT` 0, five suburbs with 1 point (including `KHAYELITSHA`) | `PHILIPPI` 25,698 | 778 (all) |

Suburbs, in address points: 26 have under 10, 90 under 50, 161 under 100, 248 under 200, 419 under 500, 552 under 1,000. The median is 436, the 25th percentile 135, the 75th 1,209. One address point has no suburb at all. Suburb areas run from 0.018 km² to 403.5 km², median 0.65 km². A Client in a suburb with few formal addresses is likely to be an informal-settlement or industrial case. Address points are formal addresses. How well they cover informal settlements was not tested. `KHAYELITSHA` the suburb has one point.

The suburb-to-district allocation is not a good way to count a district's points. Counting each suburb to its majority district gives Cape Flats 122,021 points where the direct polygon count is 100,986, and Mitchells Plain/Khayelitsha 198,903 against 221,858. `PHILIPPI` alone is 25,698 points and 28% of it lies in a second district.

**How much of the City an Artisan covers with three Regions.** A rough proxy using the medians above: three typical districts hold about 34% of all address points (the largest three, 56%), three typical sub councils about 13%, three typical wards about 2.4%, three typical suburbs about 0.15%. This says nothing about where Artisans live or work. It only shows how fast "up to three" shrinks as the unit gets smaller.

**Population per unit.** What the City publishes:

- **Official Suburb:** no population figure was found. The City's Census 2011 "suburbs" are 190 groupings of Stats SA sub-places made by the City's GIS department, not the 778 planning suburbs ([Durbanville profile, July 2013](https://www.capetown.gov.za/_documents/resource.capetown.gov.za/documentcentre/Documents/Maps%20and%20statistics/2011_Census_CT_Suburb_Durbanville_Profile.pdf)).
- **Wards:** Census 2011 population per ward, on 2011 boundaries, with 111 wards. Smallest 20,633, median 32,164, largest 64,512, summing to the City total of 3,740,025 ([City, January 2013](https://www.capetown.gov.za/_documents/resource.capetown.gov.za/documentcentre/Documents/Maps%20and%20statistics/Population_and_Households_by_Ward_2001_and_2011.pdf)). Those are not the 116 wards in the layer. No 2022 ward population was found.
- **Sub councils:** the same 2011 table lists 24 sub councils. No population for the current 20 was found.
- **City Health Regions, Census 2022** ([profiles](https://www.capetown.gov.za/_documents/resource.capetown.gov.za/documentcentre/Documents/Maps%20and%20statistics/health_district_Eastern-Census2022.pdf), December 2025; each assigns Stats SA sub-places by centroid, so edges are approximate): Eastern 813,291; Khayelitsha 639,551; Klipfontein 354,515; Mitchells Plain 446,493; Northern 565,119; Tygerberg 727,613; Western 569,277. The Southern profile was not retrieved. The City total is 4,772,846 ([Census 2022: Cape Town Profile](https://www.capetown.gov.za/media/gt3cvtps/2022_census_cape_town_profile.pdf)), so Southern is about 656,987 by subtraction (derived here, not published by the City).
- **Development Management Districts and service delivery areas:** nothing found.

## 4. Nesting

Method: shapely, polygons projected to UTM 34S. For each of the 778 suburbs, the share of its area in each unit of another layer. "Straddles" means a second unit holds over the stated share of the suburb. Small shares are boundary mismatch as much as real overlap, so three thresholds are shown.

| Layer | Second unit over 0.5% | Over 1% | Over 5% | Over 20% | Suburb area outside its main unit |
| --- | --- | --- | --- | --- | --- |
| Development Management Districts | 36 (4.6%) | 27 (3.5%) | 14 (1.8%) | 9 (1.2%) | 2.7% |
| Sub councils | 101 (13.0%) | 81 (10.4%) | 39 (5.0%) | 18 (2.3%) | 5.8% |
| City Health Regions | 62 (8.0%) | 51 (6.6%) | 12 (1.5%) | 11 (1.4%) | 2.8% |
| Area Based Service Delivery Areas | 48 (6.2%) | 38 (4.9%) | 18 (2.3%) | 11 (1.4%) | 0.6% |
| Wards (2021) | 287 (36.9%) | 249 (32.0%) | 156 (20.1%) | 92 (11.8%) | 21.4% |

So no layer nests exactly under suburbs. The worst straddles by district: `MUIZENBERG` 57% Southern and 43% another district, `MALMESBURY FARMS` 67/33, `PHILIPPI` 72/28, `PAARDEN EILAND` 73/27, `KEWTOWN` 77/23, `CROSSROADS` 76/23, `MOWBRAY` 75/23. Sub councils split `CAPE GATE` 50/50, `MONTAGUE` 54/45, `MAITLAND` 61/39, `OTTERY` 62/38. A few suburbs (15 for districts, sub councils and wards) are not fully covered by the layer's polygons, and 10 are under half covered by wards.

Two ways this matters:

- If the Region is found by testing the address **point** against the layer's polygon, straddling does not matter. The point is in one polygon.
- If the Region is found from the **suburb name** (a lookup table), a straddling suburb has to be given to one unit. For districts that puts the minority of the suburb's addresses in the wrong Region for 27 suburbs (3.5%).

Wards do nest in sub councils, as the by-law says. Tested on the live layers: none of the 116 wards has over 1% of its area in a second sub council. Wards do not nest in suburbs (table above).

## 5. Stability, host, licence

**How the boundaries change.**

- **Suburbs.** The City says boundaries change or suburbs are added mainly when developments are built. The live layer's records were all created on 15 June 2025, with four edited in July 2026 (`BOTTELARY SMALLHOLDINGS 1`, `HELDERVUE`, `BRACKENFELL SOUTH`, `STELLENBOSCH FARMS`; the Bottelary polygon shrank from about 1.64 km² to 0.16 km²). The count is 778 on both hosts and the names are identical. How often suburbs are added over several years was not established.
- **Development Management Districts.** Eight districts, with Council-approved district plans from February 2023. An older City "Planning District Map" names a "South Peninsula" district where the layer now has "Southern" ([map](https://www.capetown.gov.za/_documents/resource.capetown.gov.za/documentcentre/Documents/Maps%20and%20statistics/Planning_District_Map.pdf)). It is undated here.
- **Sub councils.** The Sub-council By-law has been amended in 2006, 2011, 2013, 2016, 2022 and 2024. The 2011 City table has 24 sub councils. The 2024 amendment disestablishes 21 and establishes 20, with effect from publication in the Provincial Gazette (30 August 2024). Boundaries have changed about every two to five years.
- **Wards.** The Municipal Demarcation Board says wards are delimited every five years ahead of local government elections ([MDB bulletin, September 2025](https://www.demarcation.org.za/wp-content/uploads/2025/10/MDB-Bulletin-September-1.pdf)). The City had 111 wards at Census 2011 and has 116 in the layer. The Board published the City's second-draft ward notice on 19 September 2025 (Gazette 9138, notice 107). The layer still holds only 2021 wards on 3 October 2026. Whether Cape Town's 2026 wards differ from 2021 was not established.
- **City Health Regions.** The layer description is dated 2006. No change history was found.
- **Service delivery areas.** The programme the item names, "Towards 2022", is dated in its own text. No change history was found.

**The host.** The portal item for every layer above gives `esapqa.capetown.gov.za/agsext` as its service URL (items listed with `owner:cctgis`). The portal's ISO metadata for the District item gives `citymaps.capetown.gov.za/agsext` as the online source instead. Both hosts answer today, with the same layer names and the same counts for suburbs (778), districts (8), sub councils (20), wards (116), health regions (8) and areas (4). They are not synchronised copies. They are separate ArcGIS Server installs (different `serviceItemId`, different IP address). The address layer has 862,337 points on `esapqa` and 863,434 on `citymaps`. Four suburb polygons differ in area, the same four that were edited in July 2026 on `esapqa`, and `esapqa` has the newer geometry. `citymaps` lacks the `created_date` and `last_edited_date` fields. A third path, `citymaps.capetown.gov.za/agsext1`, which the portal's tenders and SmartCape items use, returns 404 on 3 October 2026. No City document found says which host is the supported production endpoint, or promises an availability level. The "qa" in `esapqa` is the City's name for it. The portal itself says its layers are served live from the City's internal systems.

**The licence.** The terms link on every item, `https://www.capetown.gov.za/General/Terms-of-use-open-data`, returns 404 on 3 October 2026 (also over http and with a trailing slash). The portal homepage still links to it and says the terms "have been amended". The full text sits in the licence field of the portal's own site item ([item](https://www.arcgis.com/sharing/rest/content/items/1a838b218c314e458d078973c02774b3?f=json)). Whether that is the amended text was not confirmed. It says, paraphrased:

- The data is free of charge, subject to the terms, which the City may change without notice.
- It is provided "as is", with no warranty of accuracy, completeness or availability, and the City is not liable for any loss from reliance on it.
- The user must use it lawfully, must not imply the City endorses or supports the use, and must state that the City does not warrant its quality or accuracy.
- A user who offers a derived application must put a stated disclaimer where the application can be accessed or downloaded. The text of that disclaimer is in the terms.
- Credit to the City is not required.
- The City's logo and identity stay its property.
- The City reserves the right to discontinue any content at any time and to remove users who breach the terms.
- The user indemnifies the City against claims arising from use of or reliance on the data.

The City's Open Data Policy (approved 3 December 2020) defines open data as data that can be freely used, shared and built on, and says access is free by default ([policy](https://cctegis.maps.arcgis.com/sharing/rest/content/items/9643795d409942c084002e162149897d/data)). The item's licence type in the portal's search index is "custom". Whether storing a copy of a layer, or redistributing it inside a product, is allowed was not stated in the text found. "Use" is allowed free of charge.

## 6. The twelve informal names

Context only. The twelve (City Bowl, Atlantic Seaboard, Southern Suburbs, South Peninsula, Cape Flats, Mitchells Plain, Khayelitsha, Northern Suburbs, Durbanville and Kraaifontein, Blaauwberg, Helderberg, Atlantis) come from [Who can see a Job, and how do Artisans arrive?](https://github.com/sfxpers/artisanconnect/issues/65).

- **No official source defines any of them with a boundary.** None of these names is a layer in the open-data service.
- **Four names are also official district or health-region names:** Cape Flats, Blaauwberg and Helderberg are Development Management Districts. Khayelitsha and Mitchells Plain are separate City Health Regions, and the district layer merges them as "Mitchells Plain/Khayelitsha".
- **City Bowl and Atlantic Seaboard appear in a City district plan as plain description.** The Table Bay District plan describes the district as including the central business district and the Atlantic Seaboard and mentions "the City bowl", with no boundary ([plan, volume 1](https://www.capetown.gov.za/_documents/resource.capetown.gov.za/documentcentre/Documents/City%20strategies,%20plans%20and%20frameworks/Table_Bay_DSDF_EMF_Vol1.pdf)). The Table Bay district description names both.
- **South Peninsula is the older name of today's Southern planning district** on the City's undated planning district map. "Southern Suburbs" and "Northern Suburbs" were not found in the Table Bay plan or the Southern district plan summary, which are the only two read.
- **Hand-sorted suburbs show how they relate.** Using the earlier draft sort of suburbs into the twelve (hand-assigned, unofficial, and only the suburbs marked high confidence): City Bowl and Atlantic Seaboard sit in Table Bay; Southern Suburbs and South Peninsula in Southern; Northern Suburbs in Tygerberg (83 of 83); Durbanville and Kraaifontein in Northern (69 of 69); Atlantis and Blaauwberg in Blaauwberg; Helderberg in Helderberg; Cape Flats spreads over Cape Flats (24), Tygerberg (14) and Table Bay (1); Mitchells Plain and Khayelitsha in the merged district. This is a hand assignment, not an official fact.

## 7. Recommendation

**Use the Development Management Districts as the Regions, and keep the Official Suburb as the unit a site is placed in.** In order of how well each layer meets the five tests:

| Test | Official Suburb (778) | Development Management Districts (8) | Sub councils (20) | City Health Regions (8) | Service delivery areas (4) | Wards (116) |
| --- | --- | --- | --- | --- | --- | --- |
| Client recognition | Best. It is the suburb on the address. | Real names. Recognition not tested. | Numbers only. | Real names. Recognition not tested. | Numbers only. | Numbers only. |
| Enough places per unit | Poor. Median 436, 248 under 200. | Good. Smallest 48,405. | Good. Smallest 20,385. | Good. Smallest 60,068. | Very coarse. | Poor. 98 under 10,000. |
| No straddling | Exact by definition. | 3.5% of suburbs over 1%. | 10.4%. | 6.6%. | 4.9%. | 32.0%. |
| Source stability | One edit batch in 2026. | Council policy from 2023. | Amended six times since 2003. | Layer dated 2006. | Tied to a corporate programme. | Redrawn every five years. |
| Licence | The same terms apply to all six. | | | | | |

**Why districts.** They are the only layer that has real place names, fills a batch (every district has at least 48,405 address points), has the fewest straddling suburbs (27), and is a Council-approved planning unit. Their cost is size and mixing: Mitchells Plain/Khayelitsha is 26% of all address points on its own and Table Bay is 6%. A Client may not recognise "Tygerberg" or "Northern" as their area, so a Client-facing label may need the suburb next to it.

**Next best: the sub councils.** Twenty units, each at least 20,385 points, so a finer Region than a district. The cost is that names are numerals nobody uses, 10.4% of suburbs straddle one, and the by-law has been amended six times since 2003, twice since 2021.

**Why not the suburb as the Region.** 778 units, 161 of them with under 100 address points, and an Artisan picking three covers about 0.15% of the City's addresses at the median. A batch of ten would almost never fill.

**Why not wards, health regions or service delivery areas.** Wards have numbers only, change every five years, and straddle most suburbs. City Health Regions are a 2006-dated health administration layer. The service delivery areas have numeric names in the layer and are the coarsest.

**If the district is placed from the address point, straddling is not a problem.** The point-in-polygon test is well defined. If it is placed from a suburb lookup table, give each suburb its majority district and accept the 27 suburbs (3.5%) that straddle by more than 1%.

**Store a copy rather than depend on the live host.** The 778-row suburb table with each suburb's district and sub council is about 53 KB. The district polygons are 0.86 MB as GeoJSON. Reasons from the record: the two hosts disagree, the City reserves the right to discontinue content, and the terms link is broken. Whether a stored copy is allowed was not confirmed.

## Not established

- Whether a Client recognises the district names, or knows their official suburb.
- Whether any layer is in common use outside the City (property portals and utilities other than the City's own were not systematically checked). Property24's use of suburb-level pages was checked on one page.
- How many Artisans there would be per unit. No Artisan data exists, so fill rates for a batch of ten were not tested.
- Population per Official Suburb, per Development Management District, per current sub council, per ward on current boundaries, and per service delivery area. The Southern Health District Census 2022 profile was not retrieved.
- The meaning of the address layer's status, life-cycle and type keys, and so which points are current.
- Which of `esapqa.capetown.gov.za` or `citymaps.capetown.gov.za` is the supported production host, or whether the City promises availability.
- The text of the amended terms of use, and whether storing or redistributing the layers is allowed. The portal's homepage links, `/pages/terms-of-use` and `/pages/open-data-licence` on the portal, answer 200 but may be the app shell. They were not shown to hold the terms.
- Whether Cape Town's 2026 wards differ from the 2021 wards, and when the City will load them.
- Which of Area 1 to Area 4 is North, East, Central and South.
- Whether the City, the Municipal Demarcation Board or the Post Office defines "Southern Suburbs" or "Northern Suburbs".
- The `resource.capetown.gov.za` host refused connections from this machine. City PDFs were read through the same file paths under `www.capetown.gov.za/_documents/resource.capetown.gov.za/`.
- The Sub-council By-law was read from `openbylaws.org.za`, a republication of the City's by-law, not the City's own copy. The City's own copy was not found.
