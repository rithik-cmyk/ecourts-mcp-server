// ─── Case Detail Types ───────────────────────────────────────────────

export interface TaggedMatter {
  type: string;
  caseNumber: string;
  petitioner: string;
  respondent: string;
  status: string;
}

export interface EarlierCourtDetail {
  court: string;
  state: string;
  caseNo: string;
  orderDate: string;
  judgmentChallenged: string;
  judgmentType: string;
}

export interface InterlocutoryApplication {
  serialNumber: string;
  regNo: string;
  particular: string;
  filedBy: string;
  filingDate: string;
  status: string;
  remark: string;
}

export interface ListingDate {
  date: string;
  category: string;
  purpose: string;
  stage: string;
  judges: string;
  judgeNames: string[];
  remarks: string;
  isListed: boolean;
}

export interface Notice {
  serialNumber: string;
  noticeType: string;
  name: string;
  stateDistrict: string;
  issueDate: string;
  returnableDate: string;
  dispatchDate: string;
}

export interface JudgmentOrder {
  orderDate: string;
  orderType: string;
  orderUrl: string;
}

export interface InterimOrder {
  orderDate: string;
  description: string;
  orderUrl: string;
  stage: string;
  remarks: string;
}

export interface HearingHistory {
  causeListType: string;
  judge: string;
  businessOnDate: string;
  hearingDate: string;
  purposeOfListing: string;
}

export interface FiledDocument {
  srNo: string;
  documentNo: string;
  dateOfReceiving: string;
  filedBy: string;
  advocateName: string;
  documentFiled: string;
}

export interface LinkCase {
  filingNumber: string;
  caseNumber: string;
}

export interface SubordinateCourt {
  filingDate: string;
  caseNumber: string;
  courtName: string;
}

export interface FirDetails {
  caseNumber: string | null;
  policeStation: string | null;
  year: string | null;
}

export interface CourtCaseData {
  cnr: string;
  caseNumber: string;
  caseType: string;
  caseStatus: string;
  filingNumber: string;
  filingDate: string;
  registrationNumber: string;
  registrationDate: string;
  firstHearingDate: string;
  nextHearingDate: string | null;
  decisionDate: string | null;
  judges: string[];
  petitioners: string[];
  petitionerAdvocates: string[];
  respondents: string[];
  respondentAdvocates: string[];
  actsAndSections: string;
  caseCategoryFacetPath: string;
  courtName: string;
  courtNo: number;
  state: string;
  district: string;
  benchName: string;
  purpose: string;
  judicialSection: string;
  caseTypeSub: string;
  causelistType: string;
  taggedMatters: TaggedMatter[];
  earlierCourtDetails: EarlierCourtDetail[];
  interlocutoryApplications: InterlocutoryApplication[];
  listingDates: ListingDate[];
  notices: Notice[];
  judgmentOrders: JudgmentOrder[];
  interimOrders: InterimOrder[];
  historyOfCaseHearings: HearingHistory[];
  filedDocuments: FiledDocument[];
  linkCases: LinkCase[];
  subordinateCourt: SubordinateCourt | null;
  firDetails: FirDetails | null;
  caveatDetails: unknown[];
  processes: unknown | null;
}

export interface CaseDetailResponse {
  data: {
    courtCaseData: CourtCaseData;
    entityInfo: {
      cnr: string;
      nextDateOfHearing: string | null;
      lastDateOfHearing: string | null;
      dateCreated: string;
      dateModified: string;
    };
    files: {
      files: Array<{
        pdfFile: string;
        markdownFile: string;
        markdownContent: string;
        aiAnalysis: OrderAiAnalysis | null;
      }>;
    };
    caseAiAnalysis: {
      caseSummary: string;
      caseType: string;
      complexity: string;
      keyIssues: string[];
      timeline: Array<{ date: string; event: string }>;
    } | null;
  };
  meta: { requestId: string };
}

// ─── Search Types ────────────────────────────────────────────────────

export interface SearchResult {
  id: string;
  cnr: string;
  caseType: string;
  caseStatus: string;
  filingNumber: string;
  filingDate: string;
  registrationNumber: string;
  registrationDate: string;
  nextHearingDate: string | null;
  decisionDate: string | null;
  judges: string[];
  petitioners: string[];
  petitionerAdvocates: string[];
  respondents: string[];
  respondentAdvocates: string[];
  actsAndSections: string[];
  courtCode: string;
  judicialSection: string;
  caseCategory: string;
  benchType: string;
  aiKeywords: string[];
}

export interface SearchResponse {
  data: {
    results: SearchResult[];
    totalHits: number;
    page: number;
    pageSize: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    processingTimeMs: number;
    facets: Record<string, {
      values: Record<string, number>;
      totalValues: number;
      hasMore: boolean;
      facetType: string;
    }>;
  };
  meta: { requestId: string };
}

// ─── Order Types ─────────────────────────────────────────────────────

export interface OrderAiAnalysis {
  summary: string;
  orderType: string;
  outcome: string;
  keyPoints: string[];
  reliefGranted: string[];
  parties: { petitioner: string; respondent: string };
  legalProvisions: string[];
  nextSteps: string;
  judge: string;
  orderDate: string;
}

export interface OrderAiResponse {
  data: {
    cnr: string;
    filename: string;
    extractedText: string;
    aiAnalysis: OrderAiAnalysis | null;
  };
  meta: { requestId: string };
}

export interface OrderMetadataResponse {
  data: {
    cnr: string;
    filename: string;
    downloadFilename: string;
    message: string;
  };
  meta: { requestId: string };
}

// ─── Cause List Types ────────────────────────────────────────────────

export interface CauseListEntry {
  id: number;
  court: string;
  courtDescription: string;
  courtType: string;
  listType: string;
  bench: string;
  benchDescription: string;
  courtNo: string;
  date: string;
  caseNumber: string[];
  party: string;
  petitioners: string[];
  respondents: string[];
  petitionerAdvocates: string[];
  respondentAdvocates: string[];
  advocates: string[];
  judge: string[];
  district: string;
  state: string;
  cnr: string | null;
  listingNo: number | null;
  courtComplexCode: string;
  status: string;
  internalCaseNo: string | null;
  districtCode: string;
  courtName: string;
  dateCreated: string;
  dateModified: string;
}

export interface CauseListSearchResponse {
  data: {
    query: string;
    results: CauseListEntry[];
    returnedCount: number;
    limit: number;
    offset: number;
  };
  meta: { request_id: string };
}

// ─── Court Structure Types ───────────────────────────────────────────

export interface StateEntry {
  state: string;
  stateName: string;
}

export interface DistrictEntry {
  districtCode: string;
  districtName: string;
}

export interface CourtComplexEntry {
  courtComplexCode: string;
  courtComplexName: string;
}

export interface CourtEntry {
  court: string;
  courtNo: string;
  courtName: string;
  courtDivision: string;
  judgeName: string;
}

// ─── Refresh Types ───────────────────────────────────────────────────

export interface RefreshResponse {
  data: {
    cnr: string;
    status: string;
    message: string;
    estimatedTime: string;
  };
  meta: { request_id: string };
}

// ─── Available Dates Types ──────────────────────────────────────────

export interface AvailableDatesResponse {
  data: string[];
  meta: { request_id: string };
}

// ─── Case File Summary (embedded in case detail) ────────────────────

export interface CaseFileSummary {
  pdfFile: string;
  markdownFile: string;
  markdownContent: string;
  aiAnalysis: OrderAiAnalysis | null;
}

// ─── Generic Error ───────────────────────────────────────────────────

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: string;
  };
  meta?: { requestId: string };
}
