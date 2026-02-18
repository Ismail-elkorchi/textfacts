/**
 * StandardIssue defines an exported structural contract.
 */
export interface StandardIssue {
  message: string;
  path?: ReadonlyArray<string | number>;
}

/**
 * StandardResult defines an exported structural contract.
 */
export interface StandardResult<T> {
  success: boolean;
  value?: T;
  issues?: ReadonlyArray<StandardIssue>;
}

/**
 * StandardSchemaV1 defines an exported structural contract.
 */
export interface StandardSchemaV1<Input = unknown, Output = unknown> {
  "~standard": {
    version: 1;
    vendor: string;
    validate?: (input: Input) => StandardResult<Output>;
  };
}

/**
 * StandardJSONSchemaV1 defines an exported structural contract.
 */
export interface StandardJSONSchemaV1<Input = unknown, Output = unknown>
  extends StandardSchemaV1<Input, Output> {
  "~standard": StandardSchemaV1<Input, Output>["~standard"] & {
    jsonSchema: {
      input: (options?: { target?: string }) => Record<string, unknown>;
      output: (options?: { target?: string }) => Record<string, unknown>;
    };
  };
}
