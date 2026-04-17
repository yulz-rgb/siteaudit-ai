export type PriorityAction = {
  action: string;
  impact: "High" | "Medium" | "Low";
  difficulty: "Low" | "Medium" | "High";
  why_it_matters: string;
};

export type AuditResult = {
  score: number;
  verdict: string;
  money_leak: string;
  top_issues: string[];
  quick_wins: string[];
  priority_actions: PriorityAction[];
  rewrite: {
    hero_headline: string;
    cta: string;
  };
  estimated_impact: string;
  inferred_goal?: string;
  inferred_audience?: string;
  error?: string;
};

export type ScrapeResult = {
  url: string;
  title: string;
  metaDescription: string;
  bodyText: string;
  headings: { h1: string[]; h2: string[]; h3: string[] };
  images: { src: string; alt: string }[];
};
