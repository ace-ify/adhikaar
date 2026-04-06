// TigerGraph REST++ Client for Adhikaar
// Interface for Feature 1 (Roadmap) and Feature 2 (Optimizer)

const TG_HOST = process.env.TIGERGRAPH_HOST;
const TG_TOKEN = process.env.TIGERGRAPH_TOKEN; // We'll need a permanent token or generate one
const TG_GRAPH = process.env.TIGERGRAPH_GRAPH_NAME || "AdhikaarGraph";

export type RoadmapResponse = {
  schemes: Array<{
    v_id: string;
    attributes: { name: string; description?: string };
  }>;
  nextDocs: Array<{
    v_id: string;
    attributes: { name: string; description?: string };
  }>;
  edges: Array<{ from: string; to: string }>;
  source: "TigerGraph" | "fallback";
};

const fallbackRoadmap: RoadmapResponse = {
  schemes: [
    {
      v_id: "pm_kisan",
      attributes: {
        name: "PM-KISAN",
        description: "Income support for eligible farmer families.",
      },
    },
    {
      v_id: "ayushman_bharat",
      attributes: {
        name: "Ayushman Bharat",
        description: "Health coverage for low-income households.",
      },
    },
    {
      v_id: "up_scholarship",
      attributes: {
        name: "UP Scholarship",
        description: "State scholarship support for eligible students.",
      },
    },
  ],
  nextDocs: [
    {
      v_id: "ration_card",
      attributes: { name: "Ration Card" },
    },
    {
      v_id: "bank_passbook",
      attributes: { name: "Bank Passbook" },
    },
  ],
  edges: [
    { from: "aadhaar", to: "pm_kisan" },
    { from: "income_certificate", to: "up_scholarship" },
    { from: "aadhaar", to: "ayushman_bharat" },
    { from: "pm_kisan", to: "ration_card" },
    { from: "up_scholarship", to: "bank_passbook" },
  ],
  source: "fallback",
};

/**
 * Runs a GSQL query on TigerGraph Cloud
 */
async function runQuery(
  queryName: string,
  params: Record<string, string | number | boolean> = {}
) {
  if (!TG_HOST || !TG_TOKEN) {
    throw new Error("TigerGraph environment is not configured");
  }

  const url = `${TG_HOST}/restpp/query/${TG_GRAPH}/${queryName}`;
  const queryParams = new URLSearchParams(params).toString();
  
  const response = await fetch(`${url}?${queryParams}`, {
    headers: {
      "Authorization": `Bearer ${TG_TOKEN}`,
      "Accept": "application/json",
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`TigerGraph Query Failed: ${error}`);
  }

  const result = await response.json();
  return result.results;
}

/**
 * Feature 1: Get Welfare Roadmap
 */
export async function getWelfareRoadmap(docs: string[]) {
  // discover_roadmap(SET<STRING> start_docs, INT max_depth = 3)
  try {
    const result = await runQuery("discover_roadmap", { start_docs: docs.join(",") });
    return {
      schemes: result?.[0]?.Schemes ?? [],
      nextDocs: result?.[1]?.NextDocs ?? [],
      edges: result?.[2]?.Edges ?? [],
      source: "TigerGraph" as const,
    };
  } catch (error) {
    console.error("TigerGraph roadmap query failed, using fallback data:", error);
    return fallbackRoadmap;
  }
}

/**
 * Feature 2: Get Family Optimization
 */
export async function getFamilyOptimization(familyId: string) {
  // optimize_family_benefits(STRING family_id)
  return runQuery("optimize_family_benefits", { "family_id": familyId });
}
