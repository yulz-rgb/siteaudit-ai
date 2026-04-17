export type PriorityAction = {
  action: string;
  impact: "High" | "Medium" | "Low";
  difficulty: "Low" | "Medium" | "High";
};

export type AuditResult = {
  score: number;
  diagnosis: string;
  top_issues: string[];
  quick_wins: string[];
  priority_actions: PriorityAction[];
  inferred_goal?: string;
  inferred_audience?: string;
  location_culture_notes?: string;
  text_recommendations?: string[];
  image_recommendations?: string[];
  factor_coverage?: number;
  factor_findings?: string[];
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
