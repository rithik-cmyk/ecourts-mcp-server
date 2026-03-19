import { CHARACTER_LIMIT } from "../constants.js";
import type { CourtCaseData, SearchResult, CauseListEntry, OrderAiAnalysis } from "../types.js";

/**
 * Truncate a string representation if it exceeds CHARACTER_LIMIT,
 * appending a helpful notice for the LLM agent.
 */
export function truncateIfNeeded(text: string, hint?: string): string {
  if (text.length <= CHARACTER_LIMIT) return text;
  const truncated = text.slice(0, CHARACTER_LIMIT);
  const notice =
    "\n\n⚠️ Response truncated due to length." +
    (hint ? ` ${hint}` : " Use filters or pagination to narrow results.");
  return truncated + notice;
}

// ─── Case Detail Formatting ─────────────────────────────────────────

export function formatCaseMarkdown(c: CourtCaseData): string {
  const title =
    c.petitioners?.length && c.respondents?.length
      ? `${c.petitioners[0]} v. ${c.respondents[0]}`
      : c.caseNumber;

  const lines: string[] = [
    `# ${title}`,
    "",
    `**CNR:** ${c.cnr}`,
    `**Case No:** ${c.caseNumber}`,
    `**Type:** ${c.caseType} | **Sub-type:** ${c.caseTypeSub ?? "N/A"} | **Status:** ${c.caseStatus}`,
    `**Court:** ${c.courtName} (Court No. ${c.courtNo})`,
    `**Bench:** ${c.benchName ?? "N/A"}`,
    `**State / District:** ${c.state} / ${c.district}`,
    "",
    `**Filing:** ${c.filingNumber} on ${c.filingDate}`,
    `**Registration:** ${c.registrationNumber} on ${c.registrationDate}`,
    `**First Hearing:** ${c.firstHearingDate ?? "N/A"}`,
    `**Next Hearing:** ${c.nextHearingDate ?? "N/A"}`,
    `**Decision Date:** ${c.decisionDate ?? "Pending"}`,
    "",
    `**Judges:** ${c.judges?.join(", ") || "N/A"}`,
    `**Purpose:** ${c.purpose ?? "N/A"}`,
    `**Judicial Section:** ${c.judicialSection ?? "N/A"}`,
    "",
  ];

  // ── Petitioners ──
  lines.push("## Petitioners");
  if (c.petitioners?.length) {
    for (let i = 0; i < c.petitioners.length; i++) {
      lines.push(`- ${c.petitioners[i]} (Adv. ${c.petitionerAdvocates?.[i] ?? "N/A"})`);
    }
  } else {
    lines.push("- N/A");
  }

  // ── Respondents ──
  lines.push("", "## Respondents");
  if (c.respondents?.length) {
    for (let i = 0; i < c.respondents.length; i++) {
      lines.push(`- ${c.respondents[i]} (Adv. ${c.respondentAdvocates?.[i] ?? "N/A"})`);
    }
  } else {
    lines.push("- N/A");
  }

  lines.push("", `**Acts & Sections:** ${c.actsAndSections || "N/A"}`);

  // ── Judgment Orders ──
  if (c.judgmentOrders?.length) {
    lines.push("", "## Judgment Orders");
    for (const o of c.judgmentOrders) {
      lines.push(`- ${o.orderDate} | ${o.orderType} | file: \`${o.orderUrl}\``);
    }
  }

  // ── Interim Orders ──
  if (c.interimOrders?.length) {
    lines.push("", "## Interim Orders");
    for (const o of c.interimOrders) {
      lines.push(`- ${o.orderDate} | ${o.description} | file: \`${o.orderUrl}\` | ${o.remarks ?? ""}`);
    }
  }

  // ── Interlocutory Applications ──
  if (c.interlocutoryApplications?.length) {
    lines.push("", "## Interlocutory Applications");
    for (const ia of c.interlocutoryApplications) {
      lines.push(`- ${ia.regNo} – ${ia.particular} (filed by ${ia.filedBy} on ${ia.filingDate}, status: ${ia.status})`);
    }
  }

  // ── Tagged / Connected Matters ──
  if (c.taggedMatters?.length) {
    lines.push("", "## Tagged / Connected Matters");
    for (const tm of c.taggedMatters) {
      lines.push(`- [${tm.type}] ${tm.caseNumber}: ${tm.petitioner} v. ${tm.respondent} (${tm.status})`);
    }
  }

  // ── Linked Cases ──
  if (c.linkCases?.length) {
    lines.push("", "## Linked Cases");
    for (const lc of c.linkCases) {
      lines.push(`- ${lc.caseNumber} (filing: ${lc.filingNumber})`);
    }
  }

  // ── Earlier Court Details (lower court / appeals) ──
  if (c.earlierCourtDetails?.length) {
    lines.push("", "## Earlier Court Details");
    for (const ec of c.earlierCourtDetails) {
      lines.push(`- ${ec.court} (${ec.state}) | Case: ${ec.caseNo} | Order: ${ec.orderDate} | ${ec.judgmentType}: ${ec.judgmentChallenged}`);
    }
  }

  // ── Subordinate Court ──
  if (c.subordinateCourt?.caseNumber) {
    lines.push("", "## Subordinate Court");
    lines.push(`- ${c.subordinateCourt.courtName} | Case: ${c.subordinateCourt.caseNumber} | Filed: ${c.subordinateCourt.filingDate}`);
  }

  // ── Notices ──
  if (c.notices?.length) {
    lines.push("", "## Notices");
    for (const n of c.notices) {
      lines.push(`- #${n.serialNumber} ${n.noticeType} to ${n.name} | Issued: ${n.issueDate} | Return: ${n.returnableDate}`);
    }
  }

  // ── Filed Documents ──
  if (c.filedDocuments?.length) {
    lines.push("", "## Filed Documents");
    for (const fd of c.filedDocuments) {
      lines.push(`- #${fd.srNo} ${fd.documentFiled} by ${fd.filedBy} (Adv. ${fd.advocateName}) on ${fd.dateOfReceiving}`);
    }
  }

  // ── FIR Details (criminal cases) ──
  if (c.firDetails?.caseNumber) {
    lines.push("", "## FIR Details");
    lines.push(`- FIR No: ${c.firDetails.caseNumber} | PS: ${c.firDetails.policeStation} | Year: ${c.firDetails.year}`);
  }

  // ── Hearing History (last 10) ──
  if (c.historyOfCaseHearings?.length) {
    const recent = c.historyOfCaseHearings.slice(-10);
    lines.push("", `## Hearing History (last ${recent.length} of ${c.historyOfCaseHearings.length})`);
    for (const h of recent) {
      lines.push(`- ${h.hearingDate} | ${h.purposeOfListing} | Judge: ${h.judge}`);
    }
  }

  // ── Listing Dates (last 10) ──
  if (c.listingDates?.length) {
    const recent = c.listingDates.slice(-10);
    lines.push("", `## Listing Dates (last ${recent.length} of ${c.listingDates.length})`);
    for (const ld of recent) {
      lines.push(`- ${ld.date} | ${ld.purpose} | ${ld.stage} | ${ld.judges} | ${ld.remarks ?? ""}`);
    }
  }

  return lines.join("\n");
}

// ─── Search Result Formatting ────────────────────────────────────────

export function formatSearchResultMarkdown(r: SearchResult): string {
  const title =
    r.petitioners?.length && r.respondents?.length
      ? `${r.petitioners[0]} v. ${r.respondents[0]}`
      : r.cnr;
  const lines = [
    `### ${title}`,
    `CNR: ${r.cnr} | Status: ${r.caseStatus} | Type: ${r.caseType}`,
    `Filed: ${r.filingDate} | Next Hearing: ${r.nextHearingDate ?? "N/A"} | Decision: ${r.decisionDate ?? "Pending"}`,
    `Court: ${r.courtCode} | Section: ${r.judicialSection} | Bench: ${r.benchType ?? "N/A"}`,
    `Judges: ${r.judges?.join(", ") || "N/A"}`,
    `Petitioner Advs: ${r.petitionerAdvocates?.join(", ") || "N/A"}`,
    `Respondent Advs: ${r.respondentAdvocates?.join(", ") || "N/A"}`,
    `Acts: ${r.actsAndSections?.join("; ") || "N/A"}`,
  ];
  if (r.aiKeywords?.length) {
    lines.push(`Keywords: ${r.aiKeywords.join(", ")}`);
  }
  return lines.join("\n");
}

/**
 * Format search facets (aggregation counts) into a concise summary
 * so the LLM can understand the distribution of results.
 */
export function formatFacetsMarkdown(
  facets: Record<string, { values: Record<string, number>; totalValues: number; hasMore: boolean }>
): string {
  if (!facets || Object.keys(facets).length === 0) return "";

  const lines: string[] = ["", "## Facet Counts"];
  for (const [facetName, facet] of Object.entries(facets)) {
    const entries = Object.entries(facet.values)
      .sort(([, a], [, b]) => b - a)
      .map(([val, count]) => `${val}: ${count}`)
      .join(", ");
    lines.push(`**${facetName}:** ${entries}${facet.hasMore ? " (more available)" : ""}`);
  }
  return lines.join("\n");
}

// ─── Cause List Formatting ──────────────────────────────────────────

export function formatCauseListMarkdown(e: CauseListEntry): string {
  const lines = [
    `### ${e.party || "Unknown Parties"}`,
    `Case: ${e.caseNumber?.join(", ") || "N/A"} | Date: ${e.date}`,
    `Court: ${e.courtName} | Room: ${e.courtNo} | List: ${e.listType}`,
    `Judge: ${e.judge?.join(", ") || "N/A"}`,
    `Status: ${e.status} | District: ${e.district}, ${e.state}`,
  ];
  if (e.advocates?.length) {
    lines.push(`Advocates: ${e.advocates.join(", ")}`);
  }
  if (e.cnr) {
    lines.push(`CNR: ${e.cnr}`);
  }
  if (e.listingNo !== null && e.listingNo !== undefined) {
    lines.push(`Listing No: ${e.listingNo}`);
  }
  return lines.join("\n");
}

// ─── Order AI Formatting ────────────────────────────────────────────

export function formatOrderAiMarkdown(
  cnr: string,
  filename: string,
  extractedText: string,
  ai: OrderAiAnalysis | null
): string {
  const lines: string[] = [
    `# Order: ${filename}`,
    `**CNR:** ${cnr}`,
    "",
  ];

  if (ai) {
    lines.push(
      "## AI Analysis",
      `**Summary:** ${ai.summary}`,
      `**Type:** ${ai.orderType} | **Outcome:** ${ai.outcome}`,
      `**Judge:** ${ai.judge} | **Date:** ${ai.orderDate}`,
      "",
      "**Key Points:**",
      ...ai.keyPoints.map((k) => `- ${k}`),
      "",
      "**Relief Granted:**",
      ...ai.reliefGranted.map((r) => `- ${r}`),
      "",
      `**Legal Provisions:** ${ai.legalProvisions?.join("; ") || "N/A"}`,
      `**Next Steps:** ${ai.nextSteps}`,
      ""
    );
  } else {
    lines.push("_AI analysis not yet available for this order._", "");
  }

  lines.push("## Extracted Text", "", extractedText);

  return lines.join("\n");
}
