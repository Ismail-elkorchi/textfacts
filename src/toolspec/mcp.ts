import type { McpToolDef, ToolSpecV1 } from "./types.ts";

/**
 * toMcpTool executes a deterministic operation in this module.
 */
export function toMcpTool(tool: ToolSpecV1): McpToolDef {
  const result: McpToolDef = {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  };
  if (tool.title !== undefined) result.title = tool.title;
  if (tool.outputSchema !== undefined) result.outputSchema = tool.outputSchema;
  return result;
}
