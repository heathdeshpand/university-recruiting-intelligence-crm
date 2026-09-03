-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'RECRUITER', 'VIEWER');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('GREEK_LIFE', 'FRATERNITY', 'SORORITY', 'STUDENT_ORGANIZATION', 'CLUB_SPORT', 'INTRAMURAL', 'ATHLETICS', 'STUDENT_LEADERSHIP', 'STUDENT_GOVERNMENT', 'ENTREPRENEURSHIP', 'BUSINESS_ORGANIZATION', 'SALES_ORGANIZATION', 'PROFESSIONAL_ORGANIZATION', 'COMPETITIVE_ORGANIZATION', 'HONOR_SOCIETY', 'STUDENT_DIRECTORY', 'NEWS_OR_AWARDS', 'OTHER', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "SourceStatus" AS ENUM ('DISCOVERED', 'VALIDATED', 'ACTIVE', 'FAILED', 'UNAVAILABLE', 'REQUIRES_REVIEW', 'DISABLED');

-- CreateEnum
CREATE TYPE "DiscoveryMethod" AS ENUM ('SEED_DOMAIN', 'SITEMAP', 'LINK_CRAWL', 'PATH_HEURISTIC', 'SEARCH_API', 'MANUAL', 'DEMO_FIXTURE');

-- CreateEnum
CREATE TYPE "AccessMethod" AS ENUM ('OFFICIAL_API', 'STRUCTURED_DATA', 'JSON_ENDPOINT', 'PUBLIC_HTML', 'RENDERED_HTML', 'PUBLIC_PDF', 'CSV_IMPORT', 'DEMO_FIXTURE', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "ParserType" AS ENUM ('HTML_TABLE', 'HTML_LIST', 'HTML_CARD_GRID', 'JSON_ENDPOINT', 'CSV', 'ATHLETICS_ROSTER', 'ORG_DIRECTORY', 'GENERIC_HTML', 'DEMO_FIXTURE', 'PDF_UNSUPPORTED', 'RENDERED_UNSUPPORTED', 'NONE');

-- CreateEnum
CREATE TYPE "CandidateStatus" AS ENUM ('NEW', 'DISCOVERED', 'QUALIFIED', 'ENRICHED', 'REVIEWED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "EnrichmentStatus" AS ENUM ('NOT_ELIGIBLE', 'QUEUED', 'PROCESSING', 'ENRICHED', 'FAILED', 'MANUAL_REVIEW');

-- CreateEnum
CREATE TYPE "CareerStage" AS ENUM ('STUDENT', 'NEAR_GRADUATION', 'RECENT_GRADUATE', 'ALUMNI', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "Tier" AS ENUM ('TIER_A', 'TIER_B', 'TIER_C', 'TIER_D', 'UNRANKED');

-- CreateEnum
CREATE TYPE "EvidenceType" AS ENUM ('ORGANIZATION_MEMBERSHIP', 'GREEK_MEMBERSHIP', 'CLUB_SPORT_MEMBERSHIP', 'VARSITY_ATHLETICS', 'INTRAMURAL_PARTICIPATION', 'LEADERSHIP_ROLE', 'ACADEMIC_PROGRAM', 'GRADUATION_YEAR', 'CONTACT_INFORMATION', 'WORK_EXPERIENCE', 'AWARD_OR_RECOGNITION', 'JOB_SEARCH_STATEMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "AssertionKind" AS ENUM ('FACT', 'INFERENCE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "Confidence" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "SignalCategory" AS ENUM ('SOCIAL', 'COMPETITIVE', 'LEADERSHIP', 'ENTREPRENEURSHIP', 'BUSINESS', 'SALES', 'CAREER', 'WORK_EXPERIENCE', 'CUSTOMER_FACING', 'JOB_SEARCH', 'TIMING', 'OTHER');

-- CreateEnum
CREATE TYPE "TriState" AS ENUM ('YES', 'NO', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('AUTO_MATCHED', 'PROBABLE_MATCH', 'MANUAL_REVIEW', 'NOT_MATCHED');

-- CreateEnum
CREATE TYPE "ResolutionMethod" AS ENUM ('DETERMINISTIC', 'PROBABILISTIC', 'MANUAL', 'AI_ASSISTED');

-- CreateEnum
CREATE TYPE "ManualDecision" AS ENUM ('CONFIRMED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ScoreKind" AS ENUM ('DISCOVERY', 'FINAL');

-- CreateEnum
CREATE TYPE "EnrichmentOutcome" AS ENUM ('MATCHED', 'NO_MATCH', 'AMBIGUOUS', 'SOURCE_UNAVAILABLE', 'ERROR');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('SOURCE_DISCOVERY', 'SOURCE_VALIDATION', 'DATA_COLLECTION', 'NORMALIZATION', 'ENTITY_RESOLUTION', 'SIGNAL_EXTRACTION', 'DISCOVERY_SCORING', 'ENRICHMENT', 'FINAL_SCORING', 'EXPORT', 'FULL_PIPELINE');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ExportStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "OutcomeType" AS ENUM ('CONTACTED', 'RESPONDED', 'INTERVIEWED', 'OFFERED', 'HIRED', 'RETAINED_90_DAYS', 'NOT_INTERESTED', 'OTHER');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'RECRUITER',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent" TEXT,
    "ip" TEXT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "University" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT,
    "slug" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'US',
    "state" TEXT,
    "city" TEXT,
    "athleticName" TEXT,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "University_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UniversityDomain" (
    "id" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UniversityDomain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UniversitySettings" (
    "id" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "discoveryThreshold" INTEGER,
    "discoveryConfigId" TEXT,
    "finalConfigId" TEXT,
    "maxDiscoveryPages" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UniversitySettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UniversitySource" (
    "id" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "sourceType" "SourceType" NOT NULL DEFAULT 'UNKNOWN',
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "description" TEXT,
    "discoveryMethod" "DiscoveryMethod" NOT NULL,
    "accessMethod" "AccessMethod" NOT NULL DEFAULT 'PUBLIC_HTML',
    "status" "SourceStatus" NOT NULL DEFAULT 'DISCOVERED',
    "parserType" "ParserType" NOT NULL DEFAULT 'NONE',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "classifierNotes" TEXT,
    "validationSummary" JSONB,
    "lastDiscoveredAt" TIMESTAMP(3),
    "lastValidatedAt" TIMESTAMP(3),
    "lastCollectedAt" TIMESTAMP(3),
    "recordCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "structureHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UniversitySource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceCheck" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ok" BOOLEAN NOT NULL,
    "httpStatus" INTEGER,
    "recordCount" INTEGER,
    "delta" INTEGER,
    "structureHash" TEXT,
    "message" TEXT,

    CONSTRAINT "SourceCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RawRecord" (
    "id" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "rawPayload" JSONB NOT NULL,
    "rawName" TEXT,
    "rawOrganization" TEXT,
    "rawRole" TEXT,
    "rawMajor" TEXT,
    "rawYear" TEXT,
    "rawSport" TEXT,
    "rawUrl" TEXT,
    "fingerprint" TEXT NOT NULL,
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RawRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NormalizedRecord" (
    "id" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "rawRecordId" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "firstName" TEXT,
    "middleInitial" TEXT,
    "lastName" TEXT,
    "suffix" TEXT,
    "nameKey" TEXT NOT NULL,
    "lastNamePhonetic" TEXT,
    "organization" TEXT,
    "organizationCanonical" TEXT,
    "organizationCategory" "SourceType",
    "role" TEXT,
    "roleCanonical" TEXT,
    "isLeadershipRole" BOOLEAN NOT NULL DEFAULT false,
    "sport" TEXT,
    "sportCanonical" TEXT,
    "major" TEXT,
    "majorCanonical" TEXT,
    "graduationYear" INTEGER,
    "email" TEXT,
    "sourceSpecific" JSONB,
    "normalizedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NormalizedRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Candidate" (
    "id" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "canonicalName" TEXT NOT NULL,
    "firstName" TEXT,
    "middleInitial" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "major" TEXT,
    "graduationYear" INTEGER,
    "careerStage" "CareerStage" NOT NULL DEFAULT 'UNKNOWN',
    "discoveryScore" INTEGER,
    "finalScore" INTEGER,
    "tier" "Tier" NOT NULL DEFAULT 'UNRANKED',
    "enrichmentStatus" "EnrichmentStatus" NOT NULL DEFAULT 'NOT_ELIGIBLE',
    "status" "CandidateStatus" NOT NULL DEFAULT 'NEW',
    "sourceCount" INTEGER NOT NULL DEFAULT 0,
    "recordCount" INTEGER NOT NULL DEFAULT 0,
    "signalCount" INTEGER NOT NULL DEFAULT 0,
    "matchConfidence" DOUBLE PRECISION,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "manuallyEdited" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Candidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateSourceRecord" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "normalizedRecordId" TEXT NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "addedBy" TEXT,

    CONSTRAINT "CandidateSourceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evidence" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "sourceId" TEXT,
    "normalizedRecordId" TEXT,
    "evidenceType" "EvidenceType" NOT NULL,
    "assertionKind" "AssertionKind" NOT NULL DEFAULT 'FACT',
    "statement" TEXT NOT NULL,
    "originalValue" TEXT,
    "sourceUrl" TEXT,
    "confidence" "Confidence" NOT NULL DEFAULT 'MEDIUM',
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fingerprint" TEXT NOT NULL,

    CONSTRAINT "Evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignalDefinition" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "category" "SignalCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "isBuiltIn" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SignalDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Signal" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "definitionKey" TEXT NOT NULL,
    "category" "SignalCategory" NOT NULL,
    "value" "TriState" NOT NULL DEFAULT 'UNKNOWN',
    "confidence" "Confidence" NOT NULL DEFAULT 'MEDIUM',
    "occurrences" INTEGER NOT NULL DEFAULT 1,
    "detail" TEXT,
    "extractedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Signal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignalEvidence" (
    "signalId" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,

    CONSTRAINT "SignalEvidence_pkey" PRIMARY KEY ("signalId","evidenceId")
);

-- CreateTable
CREATE TABLE "SignalPattern" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "patternKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "signalKeys" TEXT[],
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SignalPattern_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntityMatch" (
    "id" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "recordAId" TEXT NOT NULL,
    "recordBId" TEXT NOT NULL,
    "candidateAId" TEXT,
    "candidateBId" TEXT,
    "matchScore" DOUBLE PRECISION NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "status" "MatchStatus" NOT NULL,
    "resolutionMethod" "ResolutionMethod" NOT NULL DEFAULT 'PROBABILISTIC',
    "matchingFactors" JSONB NOT NULL,
    "conflictingFactors" JSONB NOT NULL,
    "manualDecision" "ManualDecision",
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EntityMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoringConfig" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "ScoreKind" NOT NULL,
    "description" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "discoveryThreshold" INTEGER NOT NULL DEFAULT 60,
    "categoryCaps" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScoringConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoringRule" (
    "id" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "category" "SignalCategory" NOT NULL,
    "points" INTEGER NOT NULL,
    "signalKey" TEXT NOT NULL,
    "requiredValue" "TriState" NOT NULL DEFAULT 'YES',
    "minOccurrences" INTEGER NOT NULL DEFAULT 1,
    "pointsPerExtraOccurrence" INTEGER NOT NULL DEFAULT 0,
    "maxPoints" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ScoringRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Score" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "kind" "ScoreKind" NOT NULL,
    "value" INTEGER NOT NULL,
    "configId" TEXT NOT NULL,
    "breakdown" JSONB NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Score_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoreFactor" (
    "id" TEXT NOT NULL,
    "scoreId" TEXT NOT NULL,
    "ruleKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "category" "SignalCategory" NOT NULL,
    "points" INTEGER NOT NULL,
    "evidenceId" TEXT,
    "evidenceSummary" TEXT,
    "sourceName" TEXT,
    "sourceUrl" TEXT,
    "confidence" "Confidence" NOT NULL DEFAULT 'MEDIUM',

    CONSTRAINT "ScoreFactor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnrichmentJob" (
    "id" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "sourceId" TEXT,
    "status" "EnrichmentStatus" NOT NULL DEFAULT 'QUEUED',
    "qualifiedScore" INTEGER,
    "reason" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnrichmentJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnrichmentResult" (
    "id" TEXT NOT NULL,
    "enrichmentJobId" TEXT NOT NULL,
    "outcome" "EnrichmentOutcome" NOT NULL,
    "matchConfidence" DOUBLE PRECISION,
    "matchedName" TEXT,
    "fields" JSONB NOT NULL,
    "matchingFactors" JSONB,
    "conflictingFactors" JSONB,
    "sourceUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnrichmentResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "type" "JobType" NOT NULL,
    "universityId" TEXT,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    "step" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "error" TEXT,
    "metadata" JSONB,
    "parentJobId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobLog" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'info',
    "message" TEXT NOT NULL,
    "meta" JSONB,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Export" (
    "id" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "filePath" TEXT,
    "status" "ExportStatus" NOT NULL DEFAULT 'QUEUED',
    "sizeBytes" INTEGER,
    "sheetCounts" JSONB,
    "error" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Export_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "universityId" TEXT,
    "summary" TEXT NOT NULL,
    "metadata" JSONB,
    "ip" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateOutcome" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "outcomeType" "OutcomeType" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "recordedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CandidateOutcome_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "University_slug_key" ON "University"("slug");

-- CreateIndex
CREATE INDEX "University_slug_idx" ON "University"("slug");

-- CreateIndex
CREATE INDEX "University_isDemo_idx" ON "University"("isDemo");

-- CreateIndex
CREATE INDEX "UniversityDomain_universityId_idx" ON "UniversityDomain"("universityId");

-- CreateIndex
CREATE INDEX "UniversityDomain_domain_idx" ON "UniversityDomain"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "UniversityDomain_universityId_domain_key" ON "UniversityDomain"("universityId", "domain");

-- CreateIndex
CREATE UNIQUE INDEX "UniversitySettings_universityId_key" ON "UniversitySettings"("universityId");

-- CreateIndex
CREATE INDEX "UniversitySource_universityId_idx" ON "UniversitySource"("universityId");

-- CreateIndex
CREATE INDEX "UniversitySource_universityId_status_idx" ON "UniversitySource"("universityId", "status");

-- CreateIndex
CREATE INDEX "UniversitySource_sourceType_idx" ON "UniversitySource"("sourceType");

-- CreateIndex
CREATE INDEX "UniversitySource_status_idx" ON "UniversitySource"("status");

-- CreateIndex
CREATE INDEX "UniversitySource_domain_idx" ON "UniversitySource"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "UniversitySource_universityId_url_key" ON "UniversitySource"("universityId", "url");

-- CreateIndex
CREATE INDEX "SourceCheck_sourceId_at_idx" ON "SourceCheck"("sourceId", "at");

-- CreateIndex
CREATE INDEX "RawRecord_universityId_idx" ON "RawRecord"("universityId");

-- CreateIndex
CREATE INDEX "RawRecord_sourceId_idx" ON "RawRecord"("sourceId");

-- CreateIndex
CREATE INDEX "RawRecord_fingerprint_idx" ON "RawRecord"("fingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "RawRecord_sourceId_fingerprint_key" ON "RawRecord"("sourceId", "fingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "NormalizedRecord_rawRecordId_key" ON "NormalizedRecord"("rawRecordId");

-- CreateIndex
CREATE INDEX "NormalizedRecord_universityId_idx" ON "NormalizedRecord"("universityId");

-- CreateIndex
CREATE INDEX "NormalizedRecord_universityId_nameKey_idx" ON "NormalizedRecord"("universityId", "nameKey");

-- CreateIndex
CREATE INDEX "NormalizedRecord_nameKey_idx" ON "NormalizedRecord"("nameKey");

-- CreateIndex
CREATE INDEX "NormalizedRecord_lastNamePhonetic_idx" ON "NormalizedRecord"("lastNamePhonetic");

-- CreateIndex
CREATE INDEX "NormalizedRecord_normalizedName_idx" ON "NormalizedRecord"("normalizedName");

-- CreateIndex
CREATE INDEX "NormalizedRecord_graduationYear_idx" ON "NormalizedRecord"("graduationYear");

-- CreateIndex
CREATE INDEX "Candidate_universityId_idx" ON "Candidate"("universityId");

-- CreateIndex
CREATE INDEX "Candidate_universityId_finalScore_idx" ON "Candidate"("universityId", "finalScore");

-- CreateIndex
CREATE INDEX "Candidate_universityId_discoveryScore_idx" ON "Candidate"("universityId", "discoveryScore");

-- CreateIndex
CREATE INDEX "Candidate_universityId_status_idx" ON "Candidate"("universityId", "status");

-- CreateIndex
CREATE INDEX "Candidate_universityId_enrichmentStatus_idx" ON "Candidate"("universityId", "enrichmentStatus");

-- CreateIndex
CREATE INDEX "Candidate_universityId_tier_idx" ON "Candidate"("universityId", "tier");

-- CreateIndex
CREATE INDEX "Candidate_finalScore_idx" ON "Candidate"("finalScore");

-- CreateIndex
CREATE INDEX "Candidate_discoveryScore_idx" ON "Candidate"("discoveryScore");

-- CreateIndex
CREATE INDEX "Candidate_graduationYear_idx" ON "Candidate"("graduationYear");

-- CreateIndex
CREATE INDEX "Candidate_status_idx" ON "Candidate"("status");

-- CreateIndex
CREATE INDEX "Candidate_canonicalName_idx" ON "Candidate"("canonicalName");

-- CreateIndex
CREATE INDEX "Candidate_needsReview_idx" ON "Candidate"("needsReview");

-- CreateIndex
CREATE UNIQUE INDEX "CandidateSourceRecord_normalizedRecordId_key" ON "CandidateSourceRecord"("normalizedRecordId");

-- CreateIndex
CREATE INDEX "CandidateSourceRecord_candidateId_idx" ON "CandidateSourceRecord"("candidateId");

-- CreateIndex
CREATE INDEX "Evidence_candidateId_idx" ON "Evidence"("candidateId");

-- CreateIndex
CREATE INDEX "Evidence_sourceId_idx" ON "Evidence"("sourceId");

-- CreateIndex
CREATE INDEX "Evidence_evidenceType_idx" ON "Evidence"("evidenceType");

-- CreateIndex
CREATE UNIQUE INDEX "Evidence_candidateId_fingerprint_key" ON "Evidence"("candidateId", "fingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "SignalDefinition_key_key" ON "SignalDefinition"("key");

-- CreateIndex
CREATE INDEX "SignalDefinition_category_idx" ON "SignalDefinition"("category");

-- CreateIndex
CREATE INDEX "Signal_candidateId_idx" ON "Signal"("candidateId");

-- CreateIndex
CREATE INDEX "Signal_definitionKey_idx" ON "Signal"("definitionKey");

-- CreateIndex
CREATE INDEX "Signal_category_idx" ON "Signal"("category");

-- CreateIndex
CREATE INDEX "Signal_value_idx" ON "Signal"("value");

-- CreateIndex
CREATE UNIQUE INDEX "Signal_candidateId_definitionKey_key" ON "Signal"("candidateId", "definitionKey");

-- CreateIndex
CREATE INDEX "SignalEvidence_evidenceId_idx" ON "SignalEvidence"("evidenceId");

-- CreateIndex
CREATE INDEX "SignalPattern_candidateId_idx" ON "SignalPattern"("candidateId");

-- CreateIndex
CREATE INDEX "SignalPattern_patternKey_idx" ON "SignalPattern"("patternKey");

-- CreateIndex
CREATE UNIQUE INDEX "SignalPattern_candidateId_patternKey_key" ON "SignalPattern"("candidateId", "patternKey");

-- CreateIndex
CREATE INDEX "EntityMatch_universityId_idx" ON "EntityMatch"("universityId");

-- CreateIndex
CREATE INDEX "EntityMatch_universityId_status_idx" ON "EntityMatch"("universityId", "status");

-- CreateIndex
CREATE INDEX "EntityMatch_status_idx" ON "EntityMatch"("status");

-- CreateIndex
CREATE INDEX "EntityMatch_manualDecision_idx" ON "EntityMatch"("manualDecision");

-- CreateIndex
CREATE INDEX "EntityMatch_matchScore_idx" ON "EntityMatch"("matchScore");

-- CreateIndex
CREATE UNIQUE INDEX "EntityMatch_recordAId_recordBId_key" ON "EntityMatch"("recordAId", "recordBId");

-- CreateIndex
CREATE INDEX "ScoringConfig_kind_isDefault_idx" ON "ScoringConfig"("kind", "isDefault");

-- CreateIndex
CREATE UNIQUE INDEX "ScoringConfig_name_kind_key" ON "ScoringConfig"("name", "kind");

-- CreateIndex
CREATE INDEX "ScoringRule_configId_idx" ON "ScoringRule"("configId");

-- CreateIndex
CREATE INDEX "ScoringRule_signalKey_idx" ON "ScoringRule"("signalKey");

-- CreateIndex
CREATE UNIQUE INDEX "ScoringRule_configId_key_key" ON "ScoringRule"("configId", "key");

-- CreateIndex
CREATE INDEX "Score_candidateId_idx" ON "Score"("candidateId");

-- CreateIndex
CREATE INDEX "Score_kind_value_idx" ON "Score"("kind", "value");

-- CreateIndex
CREATE UNIQUE INDEX "Score_candidateId_kind_key" ON "Score"("candidateId", "kind");

-- CreateIndex
CREATE INDEX "ScoreFactor_scoreId_idx" ON "ScoreFactor"("scoreId");

-- CreateIndex
CREATE INDEX "ScoreFactor_ruleKey_idx" ON "ScoreFactor"("ruleKey");

-- CreateIndex
CREATE INDEX "EnrichmentJob_universityId_status_idx" ON "EnrichmentJob"("universityId", "status");

-- CreateIndex
CREATE INDEX "EnrichmentJob_candidateId_idx" ON "EnrichmentJob"("candidateId");

-- CreateIndex
CREATE INDEX "EnrichmentJob_status_idx" ON "EnrichmentJob"("status");

-- CreateIndex
CREATE INDEX "EnrichmentResult_enrichmentJobId_idx" ON "EnrichmentResult"("enrichmentJobId");

-- CreateIndex
CREATE INDEX "Job_universityId_status_idx" ON "Job"("universityId", "status");

-- CreateIndex
CREATE INDEX "Job_status_createdAt_idx" ON "Job"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Job_type_idx" ON "Job"("type");

-- CreateIndex
CREATE INDEX "Job_parentJobId_idx" ON "Job"("parentJobId");

-- CreateIndex
CREATE INDEX "JobLog_jobId_at_idx" ON "JobLog"("jobId", "at");

-- CreateIndex
CREATE INDEX "Export_universityId_createdAt_idx" ON "Export"("universityId", "createdAt");

-- CreateIndex
CREATE INDEX "Export_status_idx" ON "Export"("status");

-- CreateIndex
CREATE INDEX "AuditLog_at_idx" ON "AuditLog"("at");

-- CreateIndex
CREATE INDEX "AuditLog_universityId_at_idx" ON "AuditLog"("universityId", "at");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "CandidateOutcome_candidateId_idx" ON "CandidateOutcome"("candidateId");

-- CreateIndex
CREATE INDEX "CandidateOutcome_outcomeType_idx" ON "CandidateOutcome"("outcomeType");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UniversityDomain" ADD CONSTRAINT "UniversityDomain_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UniversitySettings" ADD CONSTRAINT "UniversitySettings_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UniversitySource" ADD CONSTRAINT "UniversitySource_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceCheck" ADD CONSTRAINT "SourceCheck_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "UniversitySource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawRecord" ADD CONSTRAINT "RawRecord_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawRecord" ADD CONSTRAINT "RawRecord_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "UniversitySource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NormalizedRecord" ADD CONSTRAINT "NormalizedRecord_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NormalizedRecord" ADD CONSTRAINT "NormalizedRecord_rawRecordId_fkey" FOREIGN KEY ("rawRecordId") REFERENCES "RawRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateSourceRecord" ADD CONSTRAINT "CandidateSourceRecord_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateSourceRecord" ADD CONSTRAINT "CandidateSourceRecord_normalizedRecordId_fkey" FOREIGN KEY ("normalizedRecordId") REFERENCES "NormalizedRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "UniversitySource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_normalizedRecordId_fkey" FOREIGN KEY ("normalizedRecordId") REFERENCES "NormalizedRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Signal" ADD CONSTRAINT "Signal_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Signal" ADD CONSTRAINT "Signal_definitionKey_fkey" FOREIGN KEY ("definitionKey") REFERENCES "SignalDefinition"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignalEvidence" ADD CONSTRAINT "SignalEvidence_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "Signal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignalEvidence" ADD CONSTRAINT "SignalEvidence_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "Evidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignalPattern" ADD CONSTRAINT "SignalPattern_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityMatch" ADD CONSTRAINT "EntityMatch_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityMatch" ADD CONSTRAINT "EntityMatch_recordAId_fkey" FOREIGN KEY ("recordAId") REFERENCES "NormalizedRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityMatch" ADD CONSTRAINT "EntityMatch_recordBId_fkey" FOREIGN KEY ("recordBId") REFERENCES "NormalizedRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityMatch" ADD CONSTRAINT "EntityMatch_candidateAId_fkey" FOREIGN KEY ("candidateAId") REFERENCES "Candidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityMatch" ADD CONSTRAINT "EntityMatch_candidateBId_fkey" FOREIGN KEY ("candidateBId") REFERENCES "Candidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityMatch" ADD CONSTRAINT "EntityMatch_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoringRule" ADD CONSTRAINT "ScoringRule_configId_fkey" FOREIGN KEY ("configId") REFERENCES "ScoringConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Score" ADD CONSTRAINT "Score_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Score" ADD CONSTRAINT "Score_configId_fkey" FOREIGN KEY ("configId") REFERENCES "ScoringConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreFactor" ADD CONSTRAINT "ScoreFactor_scoreId_fkey" FOREIGN KEY ("scoreId") REFERENCES "Score"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreFactor" ADD CONSTRAINT "ScoreFactor_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "Evidence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnrichmentJob" ADD CONSTRAINT "EnrichmentJob_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnrichmentJob" ADD CONSTRAINT "EnrichmentJob_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnrichmentJob" ADD CONSTRAINT "EnrichmentJob_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "UniversitySource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnrichmentResult" ADD CONSTRAINT "EnrichmentResult_enrichmentJobId_fkey" FOREIGN KEY ("enrichmentJobId") REFERENCES "EnrichmentJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobLog" ADD CONSTRAINT "JobLog_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Export" ADD CONSTRAINT "Export_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Export" ADD CONSTRAINT "Export_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateOutcome" ADD CONSTRAINT "CandidateOutcome_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
