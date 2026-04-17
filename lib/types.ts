export type PriorityAction = {
  action: string;
  impact: "High" | "Medium" | "Low";
  difficulty: "Low" | "Medium" | "High";
  why_it_matters: string;
};

export type RevenueLeak = {
  issue: string;
  impact_percent: number;
  explanation: string;
};

export type CategoryScore = {
  category:
    | "Conversion"
    | "Trust"
    | "First Impression"
    | "UX"
    | "Offer Clarity"
    | "Visuals"
    | "Performance"
    | "SEO"
    | "Analytics"
    | "Retention";
  weighted_score: number;
  max_weight: number;
  percent: number;
};

export type AuditResult = {
  score: number; // legacy 0-10 scale for compatibility
  score_100: number;
  severity: "LOW" | "MEDIUM" | "HIGH";
  total_penalty_percent: number;
  booking_loss_percent: number;
  revenue_loss_yearly: { low: number; high: number };
  revenue_current_yearly: { low: number; high: number };
  revenue_potential_yearly: { low: number; high: number };
  traffic_estimate_monthly: { low: number; high: number };
  avg_booking_value: { low: number; high: number };
  conversion_rate: {
    benchmark_low: number;
    benchmark_high: number;
    adjusted_low: number;
    adjusted_high: number;
  };
  top_revenue_leaks: RevenueLeak[];
  category_breakdown: CategoryScore[];
  impact_simulator: {
    top3_fixes_gain_yearly: { low: number; high: number };
    summary: string;
  };
  ai_recommendations: string[];
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
