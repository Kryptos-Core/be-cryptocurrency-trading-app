/**
 * Tool execution contract for AI Assistant function-calling.
 * Each tool name maps to a handler that returns a JSON-serializable payload.
 */
export interface ToolContext {
  userId: string;
  conversationId: string;
}

export type ToolHandler = (args: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;

export interface ToolDefinition {
  name: string;
  handler: ToolHandler;
}

export const AI_TOOL_EXECUTORS: Record<string, ToolHandler> = {};
