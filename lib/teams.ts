import teamsData from "@/config/teams.json";

export interface Team {
  name: string;
  charter: string;
  example_requests: string[];
}

export const TEAMS: Team[] = teamsData as Team[];

export const INTAKE_REVIEW_QUEUE = "Intake Review Queue";
export const SENSITIVE_INTAKE_REVIEW = "Sensitive Intake Review";

export function isValidTeam(name: string): boolean {
  return TEAMS.some((t) => t.name === name);
}

export function getTeam(name: string): Team | undefined {
  return TEAMS.find((t) => t.name === name);
}

/** Renders the registry as prompt-friendly text for the Step 3 LLM call. */
export function teamsRegistryText(): string {
  return TEAMS.map(
    (t) =>
      `- ${t.name}: ${t.charter} (examples: ${t.example_requests.join("; ")})`
  ).join("\n");
}
