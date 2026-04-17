import { NextRequest, NextResponse } from "next/server";
import { Document, Page, Text, View, StyleSheet, renderToStream } from "@react-pdf/renderer";
import type { AuditResult } from "@/lib/types";
import { scrapeHomepage } from "@/lib/scrape";
import { generateAudit } from "@/lib/audit";

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 11, color: "#111827" },
  title: { fontSize: 20, marginBottom: 6 },
  subtitle: { fontSize: 10, marginBottom: 18, color: "#6B7280" },
  section: { marginBottom: 14 },
  heading: { fontSize: 13, marginBottom: 6 },
  item: { marginBottom: 4 }
});

function parsePayload(data: string | null): { url: string; audit: AuditResult } | null {
  if (!data) return null;
  try {
    return JSON.parse(decodeURIComponent(data));
  } catch {
    return null;
  }
}

async function resolveAuditFromQuery(req: NextRequest): Promise<{ url: string; audit: AuditResult } | null> {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return null;
  const goal = req.nextUrl.searchParams.get("goal") || "";
  const targetAudience = req.nextUrl.searchParams.get("targetAudience") || "";

  try {
    const scraped = await scrapeHomepage(url);
    const audit = await generateAudit(scraped, goal, targetAudience);
    return { url, audit };
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const data = req.nextUrl.searchParams.get("data");
  const parsed = parsePayload(data) || (await resolveAuditFromQuery(req));
  if (!parsed) {
    return NextResponse.json({ error: "Invalid report payload." }, { status: 400 });
  }

  const { url, audit } = parsed;
  const doc = (
    <Document>
      <Page style={styles.page}>
        <Text style={styles.title}>SiteAudit AI Report</Text>
        <Text style={styles.subtitle}>{url}</Text>

        <View style={styles.section}>
          <Text style={styles.heading}>Score: {audit.score}/10</Text>
          <Text>{audit.verdict}</Text>
          <Text style={{ marginTop: 4 }}>Money leak: {audit.money_leak}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.heading}>Top Issues</Text>
          {audit.top_issues.map((issue, idx) => (
            <Text key={`${issue}-${idx}`} style={styles.item}>
              - {issue}
            </Text>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.heading}>Quick Wins</Text>
          {audit.quick_wins.map((win, idx) => (
            <Text key={`${win}-${idx}`} style={styles.item}>
              - {win}
            </Text>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.heading}>Instant Fix</Text>
          <Text style={styles.item}>Headline: {audit.rewrite.hero_headline}</Text>
          <Text style={styles.item}>CTA: {audit.rewrite.cta}</Text>
        </View>
      </Page>
    </Document>
  );

  const stream = await renderToStream(doc);
  return new NextResponse(stream as unknown as ReadableStream, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": "attachment; filename=siteaudit-report.pdf"
    }
  });
}
