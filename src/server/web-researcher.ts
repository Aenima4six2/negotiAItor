import type { MCPClient } from "./mcp-client.js";

export class WebResearcher {
  private mcp: MCPClient;

  constructor(mcp: MCPClient) {
    this.mcp = mcp;
  }

  async research(query: string): Promise<string | null> {
    try {
      // Navigate to a search in a way that doesn't disrupt the main chat tab
      // For now, we do a simple Google search and extract results from the snapshot
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;

      // Save current page state by noting we'll need to go back
      await this.mcp.navigate(searchUrl);

      // Wait briefly for results to load
      await new Promise((r) => setTimeout(r, 2000));

      const snapshot = await this.mcp.snapshot();

      // Extract relevant pricing/offer information from search results
      const findings = this.extractFindings(snapshot, query);

      return findings;
    } catch (err) {
      console.error("[WebResearcher] Research failed:", err);
      return null;
    }
  }

  private extractFindings(snapshot: string, query: string): string {
    // Extract text lines that look like pricing or plan information
    const lines = snapshot.split("\n").map((l) => l.trim()).filter(Boolean);
    const relevant: string[] = [];

    const pricingKeywords = [
      "$", "per month", "/mo", "plan", "pricing", "offer", "deal",
      "promotion", "discount", "rate", "package", "bundle",
    ];

    for (const line of lines) {
      const lower = line.toLowerCase();
      if (pricingKeywords.some((kw) => lower.includes(kw)) && line.length > 10 && line.length < 300) {
        // Strip ref markers
        const clean = line.replace(/\[ref=[\w-]+\]/g, "").trim();
        if (clean) relevant.push(clean);
      }
    }

    if (relevant.length === 0) {
      return `Search for "${query}" did not yield clear pricing information.`;
    }

    return `Research findings for "${query}":\n${relevant.slice(0, 10).join("\n")}`;
  }
}
