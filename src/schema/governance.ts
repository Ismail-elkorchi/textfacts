/**
 * CONTRADICTION_REGISTER_V1_SCHEMA is an exported constant used by public APIs.
 */
export const CONTRADICTION_REGISTER_V1_SCHEMA: Record<string, unknown> = {
  $id: "https://textfacts.dev/schema/contradiction-register-v1.json",
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "ContradictionRegisterV1",
  type: "object",
  additionalProperties: false,
  required: ["v", "entries"],
  properties: {
    v: { const: 1 },
    entries: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "status",
          "statement",
          "evidenceNeeded",
          "relatedDocs",
          "createdAt",
          "updatedAt",
        ],
        properties: {
          id: { type: "string", minLength: 1 },
          status: { enum: ["open", "resolved", "reframed"] },
          statement: { type: "string", minLength: 1 },
          evidenceNeeded: {
            type: "array",
            items: { type: "string", minLength: 1 },
          },
          relatedDocs: {
            type: "array",
            items: { type: "string", minLength: 1 },
          },
          notReferencedJustification: { type: "string", minLength: 1 },
          createdAt: { type: "string", minLength: 1 },
          updatedAt: { type: "string", minLength: 1 },
        },
      },
    },
  },
};

/**
 * METHOD_DOSSIER_V1_SCHEMA is an exported constant used by public APIs.
 */
export const METHOD_DOSSIER_V1_SCHEMA: Record<string, unknown> = {
  $id: "https://textfacts.dev/schema/method-dossier-v1.json",
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "MethodDossierV1",
  type: "object",
  additionalProperties: false,
  required: [
    "v",
    "id",
    "title",
    "scope",
    "interpretations",
    "claims",
    "alternatives",
    "verificationChain",
    "failureModes",
    "unknowns",
    "contradictions",
    "meta",
  ],
  properties: {
    v: { const: 1 },
    id: { type: "string", minLength: 1 },
    title: { type: "string", minLength: 1 },
    scope: {
      type: "object",
      additionalProperties: false,
      required: ["areas"],
      properties: {
        areas: {
          type: "array",
          items: { type: "string", minLength: 1 },
        },
      },
    },
    interpretations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["claim", "evidenceThatDistinguishes", "chosen"],
        properties: {
          claim: { type: "string", minLength: 1 },
          evidenceThatDistinguishes: {
            type: "array",
            items: { type: "string", minLength: 1 },
          },
          chosen: { type: "boolean" },
        },
      },
    },
    claims: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "claim",
          "scope",
          "assumptions",
          "falsifiers",
          "evidence",
          "residualUncertainty",
        ],
        properties: {
          claim: { type: "string", minLength: 1 },
          scope: { type: "string", minLength: 1 },
          assumptions: {
            type: "array",
            items: { type: "string", minLength: 1 },
          },
          falsifiers: {
            type: "array",
            items: { type: "string", minLength: 1 },
          },
          evidence: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["kind", "replay", "expected"],
              properties: {
                kind: {
                  enum: ["spec", "test", "benchmark", "interop", "analysis"],
                },
                replay: {
                  type: "array",
                  items: { type: "string", minLength: 1 },
                },
                expected: {
                  type: "array",
                  items: { type: "string", minLength: 1 },
                },
              },
            },
          },
          residualUncertainty: {
            type: "array",
            items: { type: "string", minLength: 1 },
          },
        },
      },
    },
    alternatives: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "whyItWorks", "whyRejectedNow", "evidenceThatWouldFlip"],
        properties: {
          name: { type: "string", minLength: 1 },
          whyItWorks: {
            type: "array",
            items: { type: "string", minLength: 1 },
          },
          whyRejectedNow: {
            type: "array",
            items: { type: "string", minLength: 1 },
          },
          evidenceThatWouldFlip: {
            type: "array",
            items: { type: "string", minLength: 1 },
          },
        },
      },
    },
    verificationChain: {
      type: "object",
      additionalProperties: false,
      required: ["unit", "pbt", "metamorphic", "fuzzCorpus", "interop", "holdouts"],
      properties: {
        unit: { type: "array", items: { type: "string", minLength: 1 } },
        pbt: { type: "array", items: { type: "string", minLength: 1 } },
        metamorphic: { type: "array", items: { type: "string", minLength: 1 } },
        fuzzCorpus: { type: "array", items: { type: "string", minLength: 1 } },
        interop: { type: "array", items: { type: "string", minLength: 1 } },
        holdouts: { type: "array", items: { type: "string", minLength: 1 } },
      },
    },
    failureModes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["mode", "earlySignals", "silentFailureRisk"],
        properties: {
          mode: { type: "string", minLength: 1 },
          earlySignals: {
            type: "array",
            items: { type: "string", minLength: 1 },
          },
          silentFailureRisk: { type: "boolean" },
        },
      },
    },
    unknowns: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
    contradictions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "status", "description", "evidenceNeeded"],
        properties: {
          id: { type: "string", minLength: 1 },
          status: { enum: ["misread", "boundary", "cost", "unknown"] },
          description: { type: "string", minLength: 1 },
          evidenceNeeded: {
            type: "array",
            items: { type: "string", minLength: 1 },
          },
        },
      },
    },
    meta: {
      type: "object",
      additionalProperties: false,
      required: ["framesUsed", "notes"],
      properties: {
        framesUsed: {
          type: "array",
          minItems: 2,
          uniqueItems: true,
          items: {
            enum: [
              "security-correctness",
              "maintenance-evolution",
              "spec-interop",
              "cybernetics-feedback",
              "inferentialism-commitments",
              "paraconsistency-contradictions",
            ],
          },
        },
        notes: {
          type: "array",
          items: { type: "string", minLength: 1 },
        },
      },
    },
  },
};
