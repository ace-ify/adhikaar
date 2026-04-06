import { NextRequest, NextResponse } from "next/server";
import { getWelfareRoadmap } from "@/lib/tigergraph";

export async function POST(req: NextRequest) {
  try {
    const { documents } = await req.json();
    
    if (!documents || !Array.isArray(documents)) {
        return NextResponse.json({ error: "No documents provided" }, { status: 400 });
    }

    const result = await getWelfareRoadmap(documents);

    return NextResponse.json({
        schemes: result.schemes,
        nextDocs: result.nextDocs,
        edges: result.edges,
        source: result.source,
    });
  } catch (error) {
    console.error("Welfare Roadmap error:", error);
    return NextResponse.json({ error: "Failed to fetch Roadmap from TigerGraph" }, { status: 500 });
  }
}
