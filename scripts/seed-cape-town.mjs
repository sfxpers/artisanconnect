// Writes the Cape Town seed: the City's eight Development Management
// Districts as Regions and every official suburb in exactly one of them
// (#100, #119). Run once, by hand; there is no sync, and the Admin adds a
// suburb the City creates later. A later city is a script like this one and
// its own migration.
//
//   node scripts/seed-cape-town.mjs migrations/0008_cape-town.sql
//
// The data is the City of Cape Town's open data (odp-cctegis.opendata.arcgis.com):
// "Official Planning Suburbs", "Development Management Districts", and
// "Street Address Numbers". A suburb goes to the district holding most of its
// address points, which places one straddling two districts; one with no
// address points goes to the district covering most of its area.

import { writeFileSync } from "node:fs";
import { suburbKey } from "../src/domain/regions/places.ts";

const SERVICES = "https://esapqa.capetown.gov.za/agsext/rest/services/Theme_Based";
const SUBURBS = `${SERVICES}/ODP_SPLIT_5/FeatureServer/3`;
const DISTRICTS = `${SERVICES}/ODP_SPLIT_5/FeatureServer/2`;
const ADDRESSES = `${SERVICES}/ODP_SPLIT_6/FeatureServer/1`;

/** The City's district names, as the product says them. */
const REGION_NAMES = {
  BLAAUWBERG: "Blaauwberg",
  "CAPE FLATS": "Cape Flats",
  HELDERBERG: "Helderberg",
  "MITCHELLS PLAIN/KHAYELITSHA": "Mitchells Plain/Khayelitsha",
  NORTHERN: "Northern",
  SOUTHERN: "Southern",
  "TABLE BAY": "Table Bay",
  TYGERBERG: "Tygerberg",
};

const out = process.argv[2];
if (!out) throw new Error("Usage: node scripts/seed-cape-town.mjs <migration.sql>");

const districts = (await query(DISTRICTS, { outFields: "PBDM_RGN_NAME", returnGeometry: true }))
  .features;
if (districts.length !== 8) throw new Error(`Expected 8 districts, got ${districts.length}`);

const suburbs = (await query(SUBURBS, { outFields: "OFC_SBRB_NAME", returnGeometry: true }))
  .features;

/** Address points per suburb name, per district. */
const points = new Map();
for (const district of districts) {
  const region = regionOf(district);
  const counted = await query(ADDRESSES, {
    geometry: JSON.stringify({ ...district.geometry, spatialReference: { wkid: 102100 } }),
    geometryType: "esriGeometryPolygon",
    inSR: 102100,
    spatialRel: "esriSpatialRelIntersects",
    groupByFieldsForStatistics: "OFC_SBRB_NAME",
    outStatistics: JSON.stringify([
      { statisticType: "count", onStatisticField: "OBJECTID", outStatisticFieldName: "points" },
    ]),
  });
  for (const { attributes } of counted.features) {
    const byRegion = points.get(attributes.OFC_SBRB_NAME) ?? {};
    byRegion[region] = attributes.points;
    points.set(attributes.OFC_SBRB_NAME, byRegion);
  }
}

const rows = [];
let straddling = 0;
for (const suburb of suburbs) {
  const published = suburb.attributes.OFC_SBRB_NAME;
  const byRegion = points.get(published) ?? {};
  if (Object.keys(byRegion).length > 1) straddling += 1;
  const region = mostOf(byRegion) ?? mostOf(areaByRegion(suburb.geometry));
  if (!region) throw new Error(`${published} is in no one district: decide it by hand`);
  rows.push({ name: published.trim().replace(/\s+/g, " "), region });
}

const ids = new Set();
for (const row of rows) {
  row.id = slug(row.name);
  if (ids.has(row.id)) throw new Error(`Two suburbs have the id ${row.id}`);
  ids.add(row.id);
}

const regions = Object.entries(REGION_NAMES).map(([city, name]) => ({
  id: slug(name),
  city,
  name,
}));
const header = [
  `-- The City of Cape Town's eight Development Management Districts and its ${rows.length}`,
  `-- official suburbs, written by scripts/seed-cape-town.mjs from the City's open`,
  `-- data on ${new Date().toISOString().slice(0, 10)}. ${straddling} suburbs straddle two districts.`,
].join("\n");
const statements = [
  `${header}\nINSERT INTO \`regions\` (\`id\`, \`name\`) VALUES\n${regions
    .map((region) => `\t(${sql(region.id)}, ${sql(region.name)})`)
    .join(",\n")};`,
  // One statement per Region keeps each under SQLite's limit on rows in one VALUES.
  ...regions.map(
    (region) =>
      `INSERT INTO \`suburbs\` (\`id\`, \`name\`, \`search_key\`, \`region_id\`) VALUES\n${rows
        .filter((row) => row.region === region.city)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(
          (row) =>
            `\t(${sql(row.id)}, ${sql(row.name)}, ${sql(suburbKey(row.name))}, ${sql(region.id)})`,
        )
        .join(",\n")};`,
  ),
];
writeFileSync(out, statements.join("\n--> statement-breakpoint\n") + "\n");
console.log(`Wrote ${rows.length} suburbs in ${regions.length} Regions to ${out}`);
console.log(`${straddling} straddle two districts`);
for (const region of regions) {
  console.log(`  ${region.name}: ${rows.filter((row) => row.region === region.city).length}`);
}

async function query(layer, params) {
  const response = await fetch(`${layer}/query`, {
    method: "POST",
    body: new URLSearchParams({ where: "1=1", outSR: "102100", f: "json", ...params }),
  });
  const body = await response.json();
  if (body.error) throw new Error(`${layer}: ${JSON.stringify(body.error)}`);
  if (body.exceededTransferLimit) throw new Error(`${layer}: more rows than one query returns`);
  return body;
}

function regionOf(district) {
  const region = district.attributes.PBDM_RGN_NAME;
  if (!(region in REGION_NAMES)) throw new Error(`Unknown district ${region}`);
  return region;
}

/** The key with the largest count, if one is largest. */
function mostOf(counts) {
  const sorted = Object.entries(counts).sort(([, a], [, b]) => b - a);
  if (sorted.length === 0 || sorted[0][1] === sorted[1]?.[1]) return null;
  return sorted[0][0];
}

/** How much of a polygon lies in each district, by sampling a grid over it. */
function areaByRegion(geometry) {
  const xs = geometry.rings.flat().map(([x]) => x);
  const ys = geometry.rings.flat().map(([, y]) => y);
  const [minX, maxX, minY, maxY] = [
    Math.min(...xs),
    Math.max(...xs),
    Math.min(...ys),
    Math.max(...ys),
  ];
  const steps = 100;
  const counts = {};
  for (let i = 0; i < steps; i++) {
    for (let j = 0; j < steps; j++) {
      const x = minX + ((maxX - minX) * (i + 0.5)) / steps;
      const y = minY + ((maxY - minY) * (j + 0.5)) / steps;
      if (!inside(x, y, geometry.rings)) continue;
      const district = districts.find((d) => inside(x, y, d.geometry.rings));
      if (district) counts[regionOf(district)] = (counts[regionOf(district)] ?? 0) + 1;
    }
  }
  return counts;
}

/** Even-odd ray casting over every ring, so holes are outside. */
function inside(x, y, rings) {
  let within = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) within = !within;
    }
  }
  return within;
}

function slug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function sql(value) {
  return `'${value.replaceAll("'", "''")}'`;
}
