import { NextResponse } from "next/server";
import { upvoteProject, upvoteThread, upvoteAgent } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const { projectId, threadId, agentId } = await request.json();

    if (projectId) {
      const newUpvotes = await upvoteProject(projectId);
      if (newUpvotes === 0) {
        return NextResponse.json({ error: "Project not found" }, { status: 404 });
      }
      return NextResponse.json({ success: true, upvotes: newUpvotes });
    }

    if (threadId) {
      const newUpvotes = await upvoteThread(threadId);
      if (newUpvotes === 0) {
        return NextResponse.json({ error: "Thread not found" }, { status: 404 });
      }
      return NextResponse.json({ success: true, upvotes: newUpvotes });
    }

    if (agentId) {
      const newUpvotes = await upvoteAgent(agentId);
      if (newUpvotes === 0) {
        return NextResponse.json({ error: "Agent not found" }, { status: 404 });
      }
      return NextResponse.json({ success: true, upvotes: newUpvotes });
    }

    return NextResponse.json({ error: "Required one of fields: projectId, threadId, agentId" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
}
