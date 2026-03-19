import {
  CopilotRuntime,
  ExperimentalEmptyAdapter,
  copilotRuntimeNextJSAppRouterEndpoint,
} from "@copilotkit/runtime";
import { HttpAgent } from "@ag-ui/client";
import { NextRequest } from "next/server";

const serviceAdapter = new ExperimentalEmptyAdapter();

// Connect to the HelloAgents .NET API via AG-UI protocol.
// In dev: Aspire injects the URL via services__api__http__0 env var.
// In prod: Set AGENT_API_URL to the API's base URL.
const agentUrl =
  process.env.services__api__http__0 ||
  process.env.AGENT_API_URL ||
  "http://localhost:5100";

const runtime = new CopilotRuntime({
  agents: {
    my_agent: new HttpAgent({ url: `${agentUrl}/agui` }),
  },
});

export const POST = async (req: NextRequest) => {
  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime,
    serviceAdapter,
    endpoint: "/api/copilotkit",
  });

  return handleRequest(req);
};
