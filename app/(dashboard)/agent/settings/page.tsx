import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getOrCreateAgentConfig } from "@/lib/services/agent.service";
import AgentSettingsClient from "@/components/agent/AgentSettingsClient";

export default async function AgentSettingsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const config = await getOrCreateAgentConfig(userId);

  return <AgentSettingsClient config={JSON.parse(JSON.stringify(config))} />;
}
