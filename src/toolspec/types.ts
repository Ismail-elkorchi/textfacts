/**
 * ToolSpecV1 defines an exported structural contract.
 */
export interface ToolSpecV1 {
  v: 1;
  name: string;
  title?: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  examples?: readonly Record<string, unknown>[];
  interopPending?: {
    justification: string;
  };
}

/**
 * ToolId defines an exported type contract.
 */
export type ToolId =
  | "packTextV1"
  | "packTextV1Sha256"
  | "diffText"
  | "winnowingFingerprints"
  | "ucaCompare"
  | "confusableSkeleton"
  | "integrityProfile"
  | "uts46ToAscii"
  | "uts46ToUnicode";

/**
 * McpToolDef defines an exported structural contract.
 */
export interface McpToolDef {
  name: string;
  title?: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}
