import fs from "fs";
import path from "path";
import { BetaAnalyticsDataClient } from "@google-analytics/data";

const propertyId = process.env.GA4_PROPERTY_ID;
if (!propertyId) throw new Error("Missing GA4_PROPERTY_ID");

const serviceAccountJson = process.env.GA4_SERVICE_ACCOUNT_JSON;
if (!serviceAccountJson) throw new Error("Missing GA4_SERVICE_ACCOUNT_JSON");

const credentials = JSON.parse(serviceAccountJson);

const client = new BetaAnalyticsDataClient({ credentials });

const days = process.env.DAYS || "28";
const metricName = process.env.METRIC || "sessions";

const [report] = await client.runReport({
  property: `properties/${propertyId}`,
  dateRanges: [{ startDate: `${days}daysAgo`, endDate: "today" }],
  dimensions: [{ name: "country" }],
  metrics: [{ name: metricName }],
  orderBys: [{ metric: { metricName }, desc: true }],
  limit: 10
});

const rows = (report.rows || []).map((r, i) => ({
  rank: i + 1,
  country: r.dimensionValues[0].value,
  visits: Number(r.metricValues[0].value)
}));

const out = {
  generatedAt: new Date().toISOString(),
  days: Number(days),
  metric: metricName,
  rows
};

const outDir = path.join(process.cwd(), "public", "data");
fs.mkdirSync(outDir, { recursive: true });

fs.writeFileSync(
  path.join(outDir, "top-countries.json"),
  JSON.stringify(out, null, 2)
);

console.log("GA4 data saved");
