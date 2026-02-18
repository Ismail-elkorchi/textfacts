import type { UcaOptions } from "../collation/types.ts";
import { ucaSortKeyHex } from "../collation/uca.ts";
import { compareByCodePoint } from "../core/compare.ts";
import { createProvenance } from "../core/provenance.ts";
import type { Provenance, Span } from "../core/types.ts";
import { IMPLEMENTATION_ID, LIBRARY_VERSION } from "../core/version.ts";
import { winnowingFingerprints } from "../fingerprint/winnowing.ts";
import { integrityProfile } from "../integrity/integrity.ts";
import { assertIJson, jcsSha256Hex } from "../jcs/jcs.ts";
import {
  type SurfaceProfile,
  type SurfaceProfileOptions,
  surfaceProfile,
} from "../profile/surface-profile.ts";
import { scanTokens } from "../security/scan.ts";
import { segmentGraphemes } from "../segment/grapheme.ts";
import { segmentSentencesUAX29 } from "../segment/sentence.ts";
import { segmentWordsUAX29 } from "../segment/word.ts";
import { isDefaultIgnorable } from "../unicode/integrity.ts";
import { UNICODE_VERSION } from "../unicode/version.ts";
import { type VariantIndex, buildVariantIndex } from "../variants/variant-index.ts";
import { encodeTextEnvelope } from "./text-envelope.ts";
import type { TextEnvelopeV1 } from "./types.ts";

/**
 * PackOptionsV1 defines an exported structural contract.
 */
export interface PackOptionsV1 {
  includeInputText?: boolean;
  inputTextEncoding?: "string" | "utf8-base64" | "utf16le-base64" | "utf16-code-units";
  maxSpans?: number;
  maxExamples?: number;
  maxTokens?: number;
  maxFingerprints?: number;
  topK?: number;
  sections?: {
    integrity?: boolean;
    unicode?: boolean;
    segment?: boolean;
    security?: boolean;
    variants?: boolean;
    profile?: boolean;
    fingerprint?: boolean;
    collation?: boolean;
  };
}

export interface SegmentSummaryV1 {
  count: number;
  spans?: Span[];
  spansTruncated?: boolean;
}

export interface SecuritySkeletonCollision {
  skeleton: TextEnvelopeV1;
  totalCount: number;
  distinctForms: number;
}

export interface SecurityFactsV1 {
  totalTokens: number;
  mixedScriptTokens: number;
  skeletonCollisions: {
    count: number;
    examples?: SecuritySkeletonCollision[];
    truncated?: boolean;
  };
}

export interface VariantFormV1 {
  form: TextEnvelopeV1;
  count: number;
  firstSpanCU: Span;
  exampleSpansCU: Span[];
}

export interface VariantEntryV1 {
  key: TextEnvelopeV1;
  totalCount: number;
  distinctForms: number;
  forms: VariantFormV1[];
  scriptsSummary: { script: string; count: number }[];
  hasMixedScriptAny: boolean;
}

export interface VariantIndexV1 {
  variants: VariantEntryV1[];
  totalTokens: number;
  truncated?: boolean;
  provenance: Provenance;
}

export interface NgramItemV1 {
  gram: TextEnvelopeV1;
  count: number;
}

export interface NgramProfileV1 {
  n: number;
  total: number;
  items: NgramItemV1[];
  truncated?: boolean;
}

export interface SurfaceProfileV1 extends Omit<SurfaceProfile, "ngrams"> {
  ngrams?: {
    charNgrams: NgramProfileV1[];
  };
}

export interface FingerprintFactsV1 {
  count: number;
  fingerprints?: { hash64Hex: string; tokenIndex: number; span: Span }[];
  truncated?: boolean;
  provenance: Provenance;
}

export interface CollationFactsV1 {
  tokens: { token: TextEnvelopeV1; sortKeyHex: string }[];
  truncated?: boolean;
  options: UcaOptions;
}

/**
 * TextfactsPackV1 defines an exported structural contract.
 */
export interface TextfactsPackV1 {
  v: 1;
  build: {
    textfactsVersion: string;
    unicodeVersion: "17.0.0";
    algorithmRevision: string;
  };
  input?: { text?: TextEnvelopeV1 };
  integrity?: { profile: ReturnType<typeof integrityProfile> };
  unicode?: {
    scripts: SurfaceProfile["unicode"]["scripts"];
    generalCategories: SurfaceProfile["unicode"]["generalCategories"];
    normalization: SurfaceProfile["unicode"]["normalization"];
    bidiControls: number;
    defaultIgnorables: number;
  };
  segment?: {
    graphemes: SegmentSummaryV1;
    words: SegmentSummaryV1;
    sentences: SegmentSummaryV1;
  };
  security?: SecurityFactsV1;
  variants?: VariantIndexV1;
  profile?: SurfaceProfileV1;
  fingerprint?: FingerprintFactsV1;
  collation?: CollationFactsV1;
  provenance: Provenance;
}

const PACK_SPEC = "textfacts:protocol:pack-v1";
const PACK_REVISION = "textfacts-pack-v1";
const DEFAULT_SECTIONS = {
  integrity: true,
  unicode: true,
  segment: true,
  security: false,
  variants: false,
  profile: false,
  fingerprint: false,
  collation: false,
};

const DEFAULT_COLLATION_OPTIONS: UcaOptions = {
  strength: 3,
  alternate: "non-ignorable",
  normalization: "nfd",
  illFormed: "replace",
  includeIdenticalLevel: true,
};

function wrapText(text: string): TextEnvelopeV1 {
  return encodeTextEnvelope(text, { prefer: "string", fallback: "utf16-code-units" });
}

function summarizeSegments(
  text: string,
  segmenter: (input: string) => Iterable<Span>,
  maxSpans?: number,
): SegmentSummaryV1 {
  const includeSpans = Number.isFinite(maxSpans) && (maxSpans ?? 0) > 0;
  const spans: Span[] = [];
  let truncated = false;
  let count = 0;
  for (const span of segmenter(text)) {
    count += 1;
    if (includeSpans) {
      if (spans.length < (maxSpans ?? 0)) {
        spans.push(span);
      } else {
        truncated = true;
      }
    }
  }
  const summary: SegmentSummaryV1 = { count };
  if (includeSpans) summary.spans = spans;
  if (truncated) summary.spansTruncated = true;
  return summary;
}

function countDefaultIgnorables(text: string): number {
  let count = 0;
  for (let codeUnitIndex = 0; codeUnitIndex < text.length; ) {
    const codePoint = text.codePointAt(codeUnitIndex) ?? 0;
    if (isDefaultIgnorable(codePoint)) count += 1;
    codeUnitIndex += codePoint > 0xffff ? 2 : 1;
  }
  return count;
}

function buildSecurityFacts(
  text: string,
  maxTokens?: number,
  maxExamples?: number,
): SecurityFactsV1 {
  const skeletonMap = new Map<string, { count: number; forms: Set<string> }>();
  let mixedScriptTokens = 0;
  let totalTokens = 0;
  const scanOptions = {
    tokenizer: "uax29-word",
    canonicalize: "skeleton",
    wordFilter: "word-like",
  } as const;
  const scanArgs = maxTokens === undefined ? scanOptions : { ...scanOptions, maxTokens };

  for (const token of scanTokens(text, scanArgs)) {
    totalTokens += 1;
    if (token.hasMixedScript) mixedScriptTokens += 1;
    const entry = skeletonMap.get(token.canonical) ?? { count: 0, forms: new Set<string>() };
    entry.count += 1;
    entry.forms.add(token.raw);
    skeletonMap.set(token.canonical, entry);
  }

  const collisions: SecuritySkeletonCollision[] = [];
  for (const [skeleton, entry] of skeletonMap.entries()) {
    if (entry.forms.size > 1) {
      collisions.push({
        skeleton: wrapText(skeleton),
        totalCount: entry.count,
        distinctForms: entry.forms.size,
      });
    }
  }
  collisions.sort((a, b) => {
    if (a.totalCount !== b.totalCount) return b.totalCount - a.totalCount;
    return compareByCodePoint(
      a.skeleton.kind === "string" ? a.skeleton.text : JSON.stringify(a.skeleton),
      b.skeleton.kind === "string" ? b.skeleton.text : JSON.stringify(b.skeleton),
    );
  });

  const limit = maxExamples ?? 5;
  const truncated = collisions.length > limit;
  const examples = collisions.slice(0, limit);
  const skeletonCollisions: SecurityFactsV1["skeletonCollisions"] = {
    count: collisions.length,
  };
  if (examples.length > 0) skeletonCollisions.examples = examples;
  if (truncated) skeletonCollisions.truncated = true;

  return {
    totalTokens,
    mixedScriptTokens,
    skeletonCollisions,
  };
}

function convertVariantIndex(index: VariantIndex): VariantIndexV1 {
  const variants: VariantEntryV1[] = index.variants.map((entry) => ({
    key: wrapText(entry.key),
    totalCount: entry.totalCount,
    distinctForms: entry.distinctForms,
    forms: entry.forms.map((form) => ({
      form: wrapText(form.form),
      count: form.count,
      firstSpanCU: form.firstSpanCU,
      exampleSpansCU: form.exampleSpansCU,
    })),
    scriptsSummary: entry.scriptsSummary,
    hasMixedScriptAny: entry.hasMixedScriptAny,
  }));
  const result: VariantIndexV1 = {
    variants,
    totalTokens: index.totalTokens,
    provenance: index.provenance,
  };
  if (index.truncated) result.truncated = true;
  return result;
}

function convertProfile(profile: SurfaceProfile): SurfaceProfileV1 {
  const result: SurfaceProfileV1 = {
    summary: profile.summary,
    unicode: profile.unicode,
    segmentation: profile.segmentation,
    punctuationWhitespace: profile.punctuationWhitespace,
    provenance: profile.provenance,
  };
  if (!profile.ngrams) return result;
  const charNgrams = profile.ngrams.charNgrams.map((gramProfile) => {
    const profileOut: NgramProfileV1 = {
      n: gramProfile.n,
      total: gramProfile.total,
      items: gramProfile.items.map((item) => ({
        gram: wrapText(item.gram),
        count: item.count,
      })),
    };
    if (gramProfile.truncated) profileOut.truncated = true;
    return profileOut;
  });
  result.ngrams = { charNgrams };
  return result;
}

/**
 * Pack text into the v1 protocol format.
 * Units: UTF-16 code units.
 * Units: Unicode scalar values.
 */
export function packTextV1(text: string, options: PackOptionsV1 = {}): TextfactsPackV1 {
  const sections = { ...DEFAULT_SECTIONS, ...(options.sections ?? {}) };
  const build = {
    textfactsVersion: LIBRARY_VERSION,
    unicodeVersion: UNICODE_VERSION,
    algorithmRevision: PACK_REVISION,
  };

  const pack: TextfactsPackV1 = {
    v: 1,
    build,
    provenance: createProvenance(
      {
        name: "Protocol.PackV1",
        spec: PACK_SPEC,
        revisionOrDate: PACK_REVISION,
        implementationId: IMPLEMENTATION_ID,
      },
      { ...options, sections },
      { text: "utf16-code-unit" },
    ),
  };

  if (options.includeInputText) {
    const prefer = options.inputTextEncoding ?? "string";
    pack.input = {
      text: encodeTextEnvelope(text, {
        prefer,
        fallback: "utf16le-base64",
      }),
    };
  }

  if (sections.integrity) {
    const integrityOptions: Parameters<typeof integrityProfile>[1] = {};
    if (options.maxExamples !== undefined) {
      integrityOptions.maxSamplesPerKind = options.maxExamples;
    }
    pack.integrity = {
      profile: integrityProfile(text, integrityOptions),
    };
  }

  let profile: SurfaceProfile | null = null;
  const needsProfile = sections.unicode || sections.profile;
  if (needsProfile) {
    const profileOptions: SurfaceProfileOptions = {};
    profile = surfaceProfile(text, profileOptions);
  }

  if (sections.unicode && profile) {
    pack.unicode = {
      scripts: profile.unicode.scripts,
      generalCategories: profile.unicode.generalCategories,
      normalization: profile.unicode.normalization,
      bidiControls: profile.unicode.bidiControls,
      defaultIgnorables: countDefaultIgnorables(text),
    };
  }

  if (sections.segment) {
    pack.segment = {
      graphemes: summarizeSegments(text, segmentGraphemes, options.maxSpans),
      words: summarizeSegments(text, segmentWordsUAX29, options.maxSpans),
      sentences: summarizeSegments(text, segmentSentencesUAX29, options.maxSpans),
    };
  }

  if (sections.security) {
    pack.security = buildSecurityFacts(text, options.maxTokens, options.maxExamples);
  }

  if (sections.variants) {
    const variantOptions: Parameters<typeof buildVariantIndex>[1] = {
      tokenizer: "uax29-word",
      canonicalKey: "nfkcCaseFold",
      wordFilter: "word-like",
    };
    if (options.maxExamples !== undefined)
      variantOptions.maxExamplesPerVariant = options.maxExamples;
    if (options.topK !== undefined) variantOptions.maxVariants = options.topK;
    const variantIndex = buildVariantIndex(text, variantOptions);
    pack.variants = convertVariantIndex(variantIndex);
  }

  if (sections.profile && profile) {
    pack.profile = convertProfile(profile);
  }

  if (sections.fingerprint) {
    const winnowOptions: Parameters<typeof winnowingFingerprints>[1] = {
      tokenizer: "uax29-word",
      canonicalKey: "nfkcCaseFold",
      k: 3,
      window: 4,
      dedupe: "by-hash",
    };
    if (options.maxTokens !== undefined) winnowOptions.maxTokens = options.maxTokens;
    if (options.maxFingerprints !== undefined)
      winnowOptions.maxFingerprints = options.maxFingerprints;
    const fingerprints = winnowingFingerprints(text, winnowOptions);
    const fingerprintFacts: FingerprintFactsV1 = {
      count: fingerprints.fingerprints.length,
      fingerprints: fingerprints.fingerprints,
      provenance: fingerprints.algo,
    };
    if (fingerprints.truncated) fingerprintFacts.truncated = true;
    pack.fingerprint = fingerprintFacts;
  }

  if (sections.collation) {
    const maxTokens = options.maxTokens ?? 10;
    const tokens: { token: TextEnvelopeV1; sortKeyHex: string }[] = [];
    let count = 0;
    for (const span of segmentWordsUAX29(text)) {
      if (count >= maxTokens) break;
      const raw = text.slice(span.startCU, span.endCU);
      tokens.push({
        token: wrapText(raw),
        sortKeyHex: ucaSortKeyHex(raw, DEFAULT_COLLATION_OPTIONS),
      });
      count += 1;
    }
    const collationFacts: CollationFactsV1 = {
      tokens,
      options: DEFAULT_COLLATION_OPTIONS,
    };
    if (count >= maxTokens) collationFacts.truncated = true;
    pack.collation = collationFacts;
  }

  assertIJson(pack);
  return pack;
}

/**
 * packTextV1Sha256 executes a deterministic operation in this module.
 */
export async function packTextV1Sha256(text: string, options: PackOptionsV1 = {}): Promise<string> {
  const pack = packTextV1(text, options);
  return await jcsSha256Hex(pack as unknown as import("../jcs/jcs.ts").JsonValue);
}
