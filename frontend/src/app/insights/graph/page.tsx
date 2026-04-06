import React from "react";
import WelfareGraph from "@/components/WelfareGraph";
import { Award, LayoutDashboard, Share2 } from "lucide-react";

export default function GraphInsightsPage() {
  const docs = ["aadhaar", "income_certificate"];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 pt-24 pb-12 px-6">
      <div className="max-w-7xl mx-auto space-y-12">
        
        {/* Header Section */}
        <div className="space-y-4">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-bold tracking-widest uppercase">
            <Award className="w-4 h-4" />
            <span>Welfare Intelligence Engine</span>
          </div>
          <h1 className="text-5xl font-extrabold tracking-tight bg-gradient-to-r from-white via-white to-slate-500 bg-clip-text text-transparent">
            Relationship Roadmap
          </h1>
          <p className="text-slate-400 max-w-2xl text-lg leading-relaxed">
            Adhikaar uses <span className="text-emerald-400 font-semibold italic">TigerGraph Cloud</span> to visualize how one document or scheme unlocks a chain of benefits. 
            Discover your personalized success path.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Main Graph View */}
          <div className="lg:col-span-2 space-y-6">
            <div className="p-1 bg-gradient-to-br from-slate-800 to-slate-900 rounded-[32px] shadow-2xl">
              <WelfareGraph documents={docs} />
            </div>
            
            <div className="flex items-center justify-between px-4">
              <div className="flex space-x-6">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 rounded-full bg-indigo-500 shadow-[0_0_10px_rgba(79,70,229,0.5)]" />
                  <span className="text-xs text-slate-400 font-medium">Your Documents</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 rounded-full bg-emerald-500" />
                  <span className="text-xs text-slate-400 font-medium">Unlocked Schemes</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 rounded-full bg-amber-500" />
                  <span className="text-xs text-slate-400 font-medium">Next Level Documents</span>
                </div>
              </div>
              
              <button className="flex items-center space-x-2 text-slate-400 hover:text-white transition-colors text-xs font-bold uppercase tracking-wider">
                <Share2 className="w-4 h-4" />
                <span>Export Path</span>
              </button>
            </div>
          </div>

          {/* Controls & Legend */}
          <div className="space-y-6">
            <div className="p-8 bg-slate-900/40 backdrop-blur-2xl border border-slate-800 rounded-[32px] space-y-8">
              <div className="space-y-4">
                <h3 className="text-xl font-bold flex items-center space-x-2">
                  <LayoutDashboard className="w-5 h-5 text-indigo-400" />
                  <span>Interactive Legend</span>
                </h3>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Click and drag vertices to explore relationships. Double-click a scheme to view eligibility details.
                </p>
              </div>

              <div className="space-y-4">
                <label className="text-[10px] uppercase font-black text-slate-500 tracking-[0.2em]">Active Inventory</label>
                <div className="space-y-2">
                  {docs.map(d => (
                    <div key={d} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-2xl border border-slate-700/50">
                      <span className="text-sm font-semibold capitalize">{d.replace("_", " ")}</span>
                      <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    </div>
                  ))}
                  <button className="w-full py-3 border-2 border-dashed border-slate-800 rounded-2xl text-slate-500 hover:text-slate-300 hover:border-slate-700 transition-all text-xs font-bold">
                    + Add New Document
                  </button>
                </div>
              </div>

              <div className="pt-6 border-t border-slate-800">
                <div className="p-4 bg-emerald-500/5 rounded-2xl border border-emerald-500/10 space-y-2">
                  <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-widest">Adhikaar Tip</h4>
                  <p className="text-[11px] text-slate-400 leading-relaxed italic">
                    &quot;Obtaining your Income Certificate today unlocks 12 new scholarship schemes in Uttar Pradesh.&quot;
                  </p>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
