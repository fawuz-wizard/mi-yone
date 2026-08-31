// The advisory playbook has ONE source of truth: backend/app/advice/playbook.json.
// The mock ships a copy so the in-repo dev mode behaves identically; this test
// fails the build if the two ever drift apart.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import mockPack from "./playbook.json";
import mockLang from "./lang.json";
import { matchTopic, normalizeQ, renderGuidance } from "./partner";

const backendPack = JSON.parse(
  readFileSync(resolve(__dirname, "../../../backend/app/advice/playbook.json"), "utf8"),
);
const backendLang = JSON.parse(
  readFileSync(resolve(__dirname, "../../../backend/app/ai/lang.json"), "utf8"),
);

describe("guidance playbook", () => {
  it("is byte-identical to the backend pack", () => {
    expect(mockPack).toEqual(backendPack);
  });

  it("contains no figures, prices or statistics", () => {
    // Guidance carries no source, so it must carry no numbers. Any figure in an
    // MI YONE answer comes from the owner's records or from sourced research.
    const blob = Object.values(backendPack.topics as Record<string, { title: string; practices: string[]; watch_out?: string }>)
      .map((t) => [t.title, ...t.practices, t.watch_out ?? ""].join(" "))
      .join(" ");
    expect(blob).not.toMatch(/\d/);
    expect(blob).not.toMatch(/\b(percent|dollar)\b|%/i);
  });

  it("routes questions to the topic a shop owner would expect", () => {
    expect(matchTopic("how can i attract customers")).toBe("attract_customers");
    expect(matchTopic("how do i use whatsapp to increase sales")).toBe("whatsapp_marketing");
    expect(matchTopic("should i increase my price")).toBe("pricing");
    expect(matchTopic("how can i reduce expenses")).toBe("reduce_expenses");
    expect(matchTopic("who owes me and how do i collect")).toBe("debt_collection");
  });

  it("renders guidance verbatim from the pack — no model rewrites it", () => {
    const rendered = renderGuidance("whatsapp_marketing");
    const topic = backendPack.topics.whatsapp_marketing;
    expect(rendered.startsWith(`${topic.title}:`)).toBe(true);
    for (const practice of topic.practices) expect(rendered).toContain(practice);
    expect(rendered).toContain(topic.watch_out);
  });
});

describe("Krio vocabulary", () => {
  it("is byte-identical to the backend vocabulary", () => {
    // A Krio phrase the backend understands but the mock does not would make
    // dev mode and production disagree about what the owner asked.
    expect(mockLang).toEqual(backendLang);
  });

  it("normalizes the brief's Krio advice and research questions", () => {
    expect(normalizeQ("Sales don slow. Wetin I fit do?")).toBe("sales slow what i can do");
    expect(normalizeQ("How ah go market me shop?")).toBe("how i will market my shop");
    expect(normalizeQ("Wetin people dey buy pass now?")).toBe("what people buy most now");
    expect(normalizeQ("Shud ah buy more rice?")).toBe("should i buy more rice");
  });
});
