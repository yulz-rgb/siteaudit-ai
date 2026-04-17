import { NextRequest, NextResponse } from "next/server";
import { Document, Page, Text, View, StyleSheet, renderToStream } from "@react-pdf/renderer";
import type { AuditResult } from "@/lib/types";

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

export async function GET(req: NextRequest) {
  const data = req.nextUrl.searchParams.get("data");
  const parsed = parsePayload(data);
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
          <Text>{audit.diagnosis}</Text>
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
