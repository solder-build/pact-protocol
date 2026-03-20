import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools.js";

const server = new McpServer({
  name: "pact-protocol",
  version: "1.0.0",
});

registerTools(server);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Pact Protocol MCP server running on stdio");
}

main().catch((err) => {
  console.error("Failed to start MCP server:", err);
  process.exit(1);
});
