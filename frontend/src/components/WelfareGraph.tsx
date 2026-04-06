"use client";

import React, { useEffect, useRef, useState } from "react";
import { Network } from "vis-network/standalone";
import { Loader2 } from "lucide-react";

interface GraphNode {
  id: string;
  label: string;
  title?: string;
  color: { background: string; border: string };
  font: { color: string };
  shape: string;
  level: number;
}

interface GraphEdge {
  from: string;
  to: string;
}

interface RoadmapResponse {
  schemes?: TigerGraphVertex[];
  nextDocs?: TigerGraphVertex[];
  edges?: GraphEdge[];
  source?: "TigerGraph" | "fallback";
}

interface TigerGraphVertex {
  v_id?: string;
  id?: string;
  attributes: {
    name: string;
    description?: string;
  };
}

interface WelfareGraphProps {
  documents: string[];
}

/**
 * Interactive Welfare Roadmap Graph using vis-network (Neovis core)
 * Visualizes the "Success Path" from documents to schemes.
 */
export default function WelfareGraph({ documents }: WelfareGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchRoadmap() {
      try {
        setLoading(true);
        const res = await fetch("/api/graph/roadmap", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ documents }),
        });

        if (!res.ok) throw new Error("Failed to fetch roadmap data");
        const data: RoadmapResponse = await res.json();

        if (!containerRef.current) return;

        // Transform TigerGraph Response into vis-network Format
        const nodes: GraphNode[] = [];
        const edges: GraphEdge[] = [];
        const processedNodes = new Set<string>();

        // 1. Add Starting Documents (Highlights them)
        documents.forEach((docId) => {
          nodes.push({
            id: docId,
            label: docId.replace(/_/g, " ").toUpperCase(),
            color: { background: "#4f46e5", border: "#4338ca" }, // Indigo
            font: { color: "white" },
            shape: "box",
            level: 0,
          });
          processedNodes.add(docId);
        });

        // 2. Add Schemes and Requirement Edges
        data.schemes?.forEach((scheme: TigerGraphVertex) => {
          const sId = scheme.v_id || scheme.id;
          if (!sId) return;
          if (!processedNodes.has(sId)) {
            nodes.push({
              id: sId,
              label: scheme.attributes.name,
              title: scheme.attributes.description,
              color: { background: "#10b981", border: "#059669" }, // Emerald
              font: { color: "white" },
              shape: "ellipse",
              level: 1,
            });
            processedNodes.add(sId);
          }

        });

        // 2.5 Add Edges from API response when available
        data.edges?.forEach((edge) => {
          if (edge.from && edge.to) {
            edges.push({ from: edge.from, to: edge.to });
          }
        });

        // 3. Add Unlocked/Next Documents
        data.nextDocs?.forEach((doc: TigerGraphVertex) => {
          const dId = doc.v_id || doc.id;
          if (!dId) return;
          if (!processedNodes.has(dId)) {
            nodes.push({
              id: dId,
              label: doc.attributes.name,
              color: { background: "#f59e0b", border: "#d97706" }, // Amber
              font: { color: "black" },
              shape: "diamond",
              level: 2,
            });
            processedNodes.add(dId);
          }
        });

        // Options for the Interactive Graph
        const options = {
          nodes: {
            borderWidth: 2,
            shadow: true,
          },
          edges: {
            color: "gray",
            arrows: { to: { enabled: true } },
            length: 150,
          },
          physics: {
            enabled: true,
            barnesHut: {
              gravitationalConstant: -2000,
              centralGravity: 0.3,
              springLength: 95,
            },
          },
          interaction: {
            hover: true,
            zoomView: true,
          },
        };

        const network = new Network(containerRef.current, { nodes, edges }, options);
        console.log("Graph Initialized:", network.getSeed()); // Use network to satisfy lint
        if (data.source === "fallback") {
          console.warn("Graph rendered with fallback data");
        }
        setLoading(false);
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        setError(errorMessage);
        setLoading(false);
      }
    }

    fetchRoadmap();
  }, [documents]);

  return (
    <div className="relative w-full h-[500px] bg-slate-900/50 backdrop-blur-xl border border-slate-700/50 rounded-3xl overflow-hidden group">
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
          <Loader2 className="w-10 h-10 text-indigo-400 animate-spin" />
        </div>
      )}

      {error ? (
        <div className="flex items-center justify-center h-full text-slate-400 p-8 text-center text-sm font-medium">
          {error}
        </div>
      ) : (
        <div ref={containerRef} className="w-full h-full" />
      )}

      {/* Stats Overlay */}
      <div className="absolute bottom-4 left-4 right-4 flex justify-between pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="px-3 py-1.5 bg-slate-800/80 rounded-full border border-slate-700 text-[10px] text-slate-300 font-semibold backdrop-blur-md">
          GRAPH VIEW ACTIVE
        </div>
        <div className="px-3 py-1.5 bg-emerald-500/20 text-emerald-400 rounded-full border border-emerald-500/30 text-[10px] font-bold backdrop-blur-md">
          TIGERGRAPH POWERED
        </div>
      </div>
    </div>
  );
}
