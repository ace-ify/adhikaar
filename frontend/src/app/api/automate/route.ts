import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import path from "path";
import { rateLimit, getRateLimitKey } from "@/lib/rate-limit";

function isValidUrl(str: string): boolean {
  try {
    const url = new URL(str);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    // Vercel / serverless environments don't have Python — return early
    if (process.env.VERCEL) {
      return NextResponse.json({
        status: "simulated",
        message: "Automation is only available in local/Docker mode. On Vercel, the voice agent handles form filling directly.",
      });
    }

    // Rate limit: 5 automation requests per minute per IP
    const limited = rateLimit(getRateLimitKey(req, "automate"), { maxRequests: 5, windowMs: 60_000 });
    if (limited) {
      return NextResponse.json(
        { error: "Too many requests. Please wait before trying again." },
        { status: 429, headers: { "Retry-After": String(limited.retryAfter) } }
      );
    }

    const { citizenData, portalUrl, useSmartFill = true } = await req.json();

    // Validate portalUrl to prevent command injection
    if (portalUrl && !isValidUrl(portalUrl)) {
      return NextResponse.json(
        { error: "Invalid portal URL" },
        { status: 400 }
      );
    }

    // Use AI-powered smart_fill.py by default, fall back to hardcoded fill_form.py
    const scriptName = useSmartFill ? "smart_fill.py" : "fill_form.py";
    const scriptPath = path.resolve(
      process.cwd(),
      "..",
      "automation",
      scriptName
    );

    const citizenJson = JSON.stringify(citizenData || {});
    // Escape for shell — use base64 to avoid quote issues
    const base64Data = Buffer.from(citizenJson).toString("base64");

    // Build command: decode base64 in Python to avoid shell escaping issues
    // portalUrl is validated above — safe to interpolate
    const portalArg = portalUrl ? ` "${portalUrl}"` : "";
    const cmd = useSmartFill
      ? `python -c "import sys,base64,json,asyncio;sys.path.insert(0,r'${path.dirname(scriptPath)}');from smart_fill import smart_fill_form;d=json.loads(base64.b64decode('${base64Data}'));asyncio.run(smart_fill_form(d${portalUrl ? ",'" + portalUrl + "'" : ""}))"`
      : `python "${scriptPath}" '${citizenJson}'${portalArg}`;

    console.log(`[Adhikaar] Starting ${scriptName} automation...`);

    return new Promise<NextResponse>((resolve) => {
      exec(
        cmd,
        {
          timeout: 120000,
          env: { ...process.env },
        },
        (error, stdout, stderr) => {
          if (error) {
            console.error("Automation error:", error.message);
            console.error("stderr:", stderr);

            // If smart_fill failed, try fallback to fill_form.py
            if (useSmartFill) {
              console.log("[Adhikaar] Smart fill failed, trying basic fill_form.py...");
              const fallbackPath = path.resolve(
                process.cwd(),
                "..",
                "automation",
                "fill_form.py"
              );
              exec(
                `python "${fallbackPath}" '${citizenJson}'`,
                { timeout: 120000, env: { ...process.env } },
                (err2, out2, serr2) => {
                  if (err2) {
                    resolve(
                      NextResponse.json(
                        {
                          status: "error",
                          message: "Automation failed",
                        },
                        { status: 500 }
                      )
                    );
                  } else {
                    resolve(
                      NextResponse.json({
                        status: "success",
                        message: "Application submitted (basic mode)",
                        output: out2,
                        mode: "fallback",
                      })
                    );
                  }
                }
              );
              return;
            }

            resolve(
              NextResponse.json(
                {
                  status: "error",
                  message: "Automation failed",
                },
                { status: 500 }
              )
            );
            return;
          }

          resolve(
            NextResponse.json({
              status: "success",
              message: "Application submitted successfully",
              output: stdout,
              mode: useSmartFill ? "ai-powered" : "basic",
            })
          );
        }
      );
    });
  } catch (error) {
    console.error("Automate API error:", error);
    return NextResponse.json(
      { error: "Failed to trigger automation" },
      { status: 500 }
    );
  }
}
