import { NextResponse } from "next/server";
import { supabasePublic } from "@/lib/supabase-server";

export async function GET() {
  try {
    // Check if we can reach the DB (Supabase)
    const { error } = await supabasePublic.from('skills').select('id').limit(1);
    if (error) throw error;
    
    return NextResponse.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: "1.2.0"
    });
  } catch (error) {
    console.error("Health check failed:", error);
    return NextResponse.json({
      status: "degraded",
      error: "Database unreachable",
      timestamp: new Date().toISOString()
    }, { status: 503 });
  }
}
