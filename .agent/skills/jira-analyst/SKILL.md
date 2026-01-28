---
name: jira-analyst
description: "A specialized skill for integrating with Jira. It allows fetching task details, comments, and attachments to analyze requirements before implementation. It can also help in drafting implementation plans based on Jira issues."
---

# Jira Analyst Skill

This skill allows you to connect to Jira, extract deep context from tasks (including comments and images), and "brainstorm" a solution before writing code.

## Prerequisites

1.  **Jira Account**: You need access to a Jira Cloud instance.
2.  **API Token**: You must generate an API token.
    *   Go to: https://id.atlassian.com/manage-profile/security/api-tokens
    *   Click "Create API token".
    *   Label: `AI-Agent`.
    *   Copy the token.

## Setup

1.  Create or update your `.env` file in the project root with the following credentials:
    ```env
    JIRA_HOST=your-domain.atlassian.net
    JIRA_EMAIL=your-email@example.com
    JIRA_API_TOKEN=your-api-token-here
    ```

2.  Install dependencies (if not already present):
    ```bash
    npm install axios dotenv
    ```

## Usage

### 1. Analyze a Jira Task
Use this command to fetch all details, comments, and download attachments for a specific task.

```bash
node .agent/skills/jira-analyst/scripts/analyze source <JIRA_ISSUE_KEY_OR_URL>
```
*   **<JIRA_ISSUE_KEY_OR_URL>**: Can be the full URL (e.g., `https://company.atlassian.net/browse/PROJ-123`) or just the key (`PROJ-123`).

**What it does:**
1.  Fetches Issue Details (Title, Description, Priority, Status).
2.  Fetches **All Comments** (sorted chronologically).
3.  Downloads **Attachments** (images/specs) to a temporary folder (`.agent/temp/jira/<issue-key>/`).
4.  Generates a summary markdown file (`.agent/temp/jira/<issue-key>/SUMMARY.md`).

### 2. Workflow Integration
When the user sends a Jira link:
1.  Run the `analyze` script.
2.  Read the generated `SUMMARY.md`.
3.  Use `view_file` to inspect any downloaded images referenced in the summary.
4.  Propose a **Implementation Plan** in the chat and valid design doc in `docs/plans/`.

## Script Location
*   `scripts/analyze.js`: The detailed extraction logic.
