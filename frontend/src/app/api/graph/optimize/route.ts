import { NextRequest, NextResponse } from "next/server";
import { getFamilyOptimization } from "@/lib/tigergraph";

export async function POST(req: NextRequest) {
  try {
    const { familyId } = await req.json();
    
    if (!familyId) {
        return NextResponse.json({ error: "No familyId provided" }, { status: 400 });
    }

    const { results } = await getFamilyOptimization(familyId);

    return NextResponse.json({
        members: results[0].FamilyMembers,
        optimizedPlan: results[1].ResultSet,
        source: "TigerGraph",
    });
  } catch (error) {
    console.error("Family Optimization error:", error);
    return NextResponse.json({ error: "Failed to fetch Optimized Plan from TigerGraph" }, { status: 500 });
  }
}
