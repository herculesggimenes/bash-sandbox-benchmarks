export const SPEND_AUDIT_SUBMISSION_PATH = "/tmp/submission.json";

export const SPEND_AUDIT_WORKSPACE_FILES = Object.freeze([
  "/workspace/expenses.json",
  "/workspace/policy.md",
  "/workspace/users.json",
  "/workspace/prior-cases.json",
  "/workspace/calendar-events.json",
]);

export const SPEND_AUDIT_WORKBENCH_COMMANDS = Object.freeze([
  {
    capability: "local",
    name: "get_expenses",
    synopsis:
      "get_expenses [expense-id...] [--limit N] [--offset N] [--overview|--detailed]",
  },
  {
    capability: "local",
    name: "analyze_receipt",
    synopsis: "analyze_receipt <expense-id...>",
  },
  {
    capability: "local",
    name: "get_users",
    synopsis: "get_users <user-id...>",
  },
  {
    capability: "local",
    name: "get_cases",
    synopsis: "get_cases [user-id...]",
  },
  {
    capability: "local",
    name: "analyze_calendar_events",
    synopsis: "analyze_calendar_events <user-id...>",
  },
  {
    capability: "host-mediated",
    name: "web_search",
    synopsis: "web_search [--query QUERY] | web_search --default",
  },
  {
    capability: "final-submission",
    name: "submit_review",
    synopsis: `submit_review [--file ${SPEND_AUDIT_SUBMISSION_PATH}]`,
  },
  {
    capability: "local",
    name: "python3",
    synopsis: "python3",
  },
]);

export function createSpendAuditWorkspace(fixture) {
  return {
    "/workspace/calendar-events.json": `${JSON.stringify(
      fixture.calendarEventsByUserId,
      null,
      2,
    )}\n`,
    "/workspace/expenses.json": `${JSON.stringify(fixture.expenses, null, 2)}\n`,
    "/workspace/policy.md": fixture.policy,
    "/workspace/prior-cases.json": `${JSON.stringify(
      { cases: fixture.priorCases },
      null,
      2,
    )}\n`,
    "/workspace/users.json": `${JSON.stringify(
      { users: fixture.users },
      null,
      2,
    )}\n`,
  };
}

export function describeSpendAuditWorkbench() {
  const files = SPEND_AUDIT_WORKSPACE_FILES.join(", ");
  const commands = SPEND_AUDIT_WORKBENCH_COMMANDS.map(
    (command) => command.synopsis,
  ).join(", ");
  return `Available data and commands: ${files}, ${commands}.`;
}
