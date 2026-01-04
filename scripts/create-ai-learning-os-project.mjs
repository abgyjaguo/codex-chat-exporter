#!/usr/bin/env node
import { readFile } from "node:fs/promises";

function parseArgs(argv) {
  const args = {
    dryRun: false,
    projectTitle: "AI Learning OS v0.3.4",
    backlogPath: "docs/ai-learning-os/BACKLOG.md",
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    if (a === "--repo") {
      args.repo = argv[++i];
      continue;
    }
    if (a === "--project-title") {
      args.projectTitle = argv[++i];
      continue;
    }
    if (a === "--backlog") {
      args.backlogPath = argv[++i];
      continue;
    }
    if (a === "-h" || a === "--help") {
      args.help = true;
      continue;
    }
    throw new Error(`Unknown arg: ${a}`);
  }

  return args;
}

function usage() {
  return `
Usage:
  node scripts/create-ai-learning-os-project.mjs --repo OWNER/REPO [--dry-run]

Options:
  --repo OWNER/REPO        GitHub repo (required)
  --project-title TITLE    Project title (default: "AI Learning OS v0.3.4")
  --backlog PATH           Backlog Markdown (default: docs/ai-learning-os/BACKLOG.md)
  --dry-run                Print actions without writing to GitHub
`;
}

function getToken() {
  return process.env.GITHUB_PAT_TOKEN || process.env.GITHUB_TOKEN || "";
}

function parseRepo(repo) {
  const m = /^([^/]+)\/([^/]+)$/.exec(repo || "");
  if (!m) throw new Error(`Invalid --repo value: ${repo} (expected OWNER/REPO)`);
  return { owner: m[1], repo: m[2] };
}

function extractP0IssueTitles(markdown) {
  const lines = markdown.split(/\r?\n/);
  const titles = [];

  let inP0 = false;
  for (const line of lines) {
    const h2 = /^##\s+(.+?)\s*$/.exec(line);
    if (h2) {
      const name = h2[1];
      if (/\bP0\b/.test(name)) {
        inP0 = true;
        continue;
      }
      if (inP0) break;
      continue;
    }
    if (!inP0) continue;

    const task = /^-\s+\[[ xX]\]\s+(.+?)\s*$/.exec(line);
    if (task) titles.push(task[1]);
  }

  return titles;
}

function deriveTaskMeta(title) {
  const m = /^\[P0\]\[([^\]]+)\]\s+/.exec(title);
  const moduleKey = m?.[1] || "unknown";

  const moduleToModule = {
    Docs: "Docs",
    Extension: "Extension",
    Bridge: "Bridge",
    OpenNotebook: "OpenNotebook",
    ReplayUI: "ReplayUI",
  };

  const moduleToProjectModule = {
    "10-vscode-extension": moduleToModule.Extension,
    "20-bridge-service": moduleToModule.Bridge,
    "21-bridge-generation": moduleToModule.Bridge,
    "30-open-notebook-sync": moduleToModule.OpenNotebook,
    "40-privacy-redaction": moduleToModule.Bridge,
    "50-export-center": moduleToModule.Bridge,
    "60-replay-ui": moduleToModule.ReplayUI,
  };

  const moduleToChangeId = {
    "20-bridge-service": "harden-bridge-import",
    "40-privacy-redaction": "expand-privacy-redaction",
    "50-export-center": "add-export-center-api",
    "60-replay-ui": "add-replay-stub",
  };

  const moduleToMilestone = {
    "20-bridge-service": "M1",
    "50-export-center": "M1",
    "60-replay-ui": "M2",
    "40-privacy-redaction": "M3",
  };

  return {
    moduleKey,
    module: moduleToProjectModule[moduleKey],
    priority: "P0",
    milestone: moduleToMilestone[moduleKey],
    changeId: moduleToChangeId[moduleKey],
  };
}

async function ghRest(token, method, url, body) {
  const res = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "content-type": "application/json",
      "user-agent": "ai-learning-os-script",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${method} ${url} -> ${res.status}\\n${text}`);
  }
  return text ? JSON.parse(text) : null;
}

async function ghGraphQL(token, query, variables) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "content-type": "application/json",
      "user-agent": "ai-learning-os-script",
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(JSON.stringify(json.errors, null, 2));
  }
  return json.data;
}

async function listAllIssues(token, { owner, repo }) {
  const issues = [];
  for (let page = 1; page <= 10; page++) {
    const url = `https://api.github.com/repos/${owner}/${repo}/issues?state=all&per_page=100&page=${page}`;
    const pageIssues = await ghRest(token, "GET", url);
    if (!Array.isArray(pageIssues) || pageIssues.length === 0) break;
    for (const it of pageIssues) {
      if (it.pull_request) continue;
      issues.push(it);
    }
    if (pageIssues.length < 100) break;
  }
  return issues;
}

async function getOrCreateProject(token, { owner, repo }, projectTitle, dryRun) {
  const data = await ghGraphQL(
    token,
    `
      query($owner: String!, $repo: String!) {
        repository(owner: $owner, name: $repo) {
          id
          owner {
            __typename
            login
            ... on User {
              id
              projectsV2(first: 100) { nodes { id title number url } }
            }
            ... on Organization {
              id
              projectsV2(first: 100) { nodes { id title number url } }
            }
          }
        }
      }
    `,
    { owner, repo },
  );

  const ownerNode = data.repository.owner;
  const projectNodes =
    ownerNode.__typename === "Organization"
      ? ownerNode.projectsV2.nodes
      : ownerNode.projectsV2.nodes;

  const existing = projectNodes.find((p) => p.title === projectTitle);
  if (existing) return { project: existing, repositoryId: data.repository.id, created: false };

  if (dryRun) {
    return {
      project: { id: null, title: projectTitle, number: null, url: null },
      repositoryId: data.repository.id,
      created: false,
      wouldCreate: true,
    };
  }

  const created = await ghGraphQL(
    token,
    `
      mutation($ownerId: ID!, $title: String!) {
        createProjectV2(input: { ownerId: $ownerId, title: $title }) {
          projectV2 { id title number url }
        }
      }
    `,
    { ownerId: ownerNode.id, title: projectTitle },
  );

  const project = created.createProjectV2.projectV2;

  // Best-effort: link project to repository (nice UX)
  try {
    await ghGraphQL(
      token,
      `
        mutation($projectId: ID!, $repositoryId: ID!) {
          linkProjectV2ToRepository(input: { projectId: $projectId, repositoryId: $repositoryId }) {
            clientMutationId
          }
        }
      `,
      { projectId: project.id, repositoryId: data.repository.id },
    );
  } catch {
    // ignore
  }

  return { project, repositoryId: data.repository.id, created: true };
}

async function getProjectFields(token, projectId) {
  const data = await ghGraphQL(
    token,
    `
      query($projectId: ID!) {
        node(id: $projectId) {
          ... on ProjectV2 {
            fields(first: 100) {
              nodes {
                __typename
                ... on ProjectV2Field { id name dataType }
                ... on ProjectV2SingleSelectField { id name dataType options { id name } }
                ... on ProjectV2IterationField { id name dataType }
              }
            }
          }
        }
      }
    `,
    { projectId },
  );
  return data.node.fields.nodes;
}

function makeSingleSelectOptions(names, color) {
  return names.map((name) => ({ name, color, description: "" }));
}

async function ensureField(token, projectId, fields, { name, type, options }, dryRun) {
  const existing = fields.find((f) => f.name === name);
  if (existing) return existing;
  if (dryRun) return { id: null, name, dataType: type, options: options?.map((o) => ({ id: null, name: o.name })) };

  const created = await ghGraphQL(
    token,
    `
      mutation($input: CreateProjectV2FieldInput!) {
        createProjectV2Field(input: $input) {
          projectV2FieldConfiguration {
            __typename
            ... on ProjectV2Field { id name dataType }
            ... on ProjectV2SingleSelectField { id name dataType options { id name } }
            ... on ProjectV2IterationField { id name dataType }
          }
        }
      }
    `,
    {
      input: {
        projectId,
        name,
        dataType: type,
        singleSelectOptions: options,
      },
    },
  );

  return created.createProjectV2Field.projectV2FieldConfiguration;
}

async function listProjectItems(token, projectId) {
  const items = [];
  let after = null;
  for (let i = 0; i < 10; i++) {
    const data = await ghGraphQL(
      token,
      `
        query($projectId: ID!, $after: String) {
          node(id: $projectId) {
            ... on ProjectV2 {
              items(first: 100, after: $after) {
                pageInfo { hasNextPage endCursor }
                nodes {
                  id
                  content {
                    __typename
                    ... on Issue { id number title }
                    ... on PullRequest { id number title }
                  }
                }
              }
            }
          }
        }
      `,
      { projectId, after },
    );
    const conn = data.node.items;
    items.push(...conn.nodes);
    if (!conn.pageInfo.hasNextPage) break;
    after = conn.pageInfo.endCursor;
  }
  return items;
}

async function addIssueToProject(token, projectId, issueNodeId, dryRun) {
  if (dryRun) return { id: null };
  const data = await ghGraphQL(
    token,
    `
      mutation($projectId: ID!, $contentId: ID!) {
        addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) {
          item { id }
        }
      }
    `,
    { projectId, contentId: issueNodeId },
  );
  return data.addProjectV2ItemById.item;
}

async function setItemFieldValue(token, projectId, itemId, fieldId, value, dryRun) {
  if (dryRun) return;
  await ghGraphQL(
    token,
    `
      mutation($input: UpdateProjectV2ItemFieldValueInput!) {
        updateProjectV2ItemFieldValue(input: $input) { projectV2Item { id } }
      }
    `,
    { input: { projectId, itemId, fieldId, value } },
  );
}

function findSingleSelectOptionId(field, name) {
  if (!field || field.__typename !== "ProjectV2SingleSelectField") return null;
  const opt = field.options?.find((o) => o.name === name);
  return opt?.id || null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage());
    return;
  }

  const token = getToken();
  if (!token) {
    throw new Error("Missing token: set GITHUB_PAT_TOKEN (recommended) or GITHUB_TOKEN");
  }

  const repoInfo = parseRepo(args.repo);
  const backlog = await readFile(args.backlogPath, "utf8");
  const titles = extractP0IssueTitles(backlog);
  if (titles.length === 0) {
    throw new Error(`No P0 tasks found in ${args.backlogPath}`);
  }

  console.log(`[1/4] Backlog P0 tasks: ${titles.length}`);

  const existingIssues = await listAllIssues(token, repoInfo);
  const byTitle = new Map(existingIssues.map((it) => [it.title, it]));

  const ensuredIssues = [];
  for (const title of titles) {
    const found = byTitle.get(title);
    if (found) {
      ensuredIssues.push(found);
      continue;
    }

    console.log(`- create issue: ${title}`);
    if (args.dryRun) continue;

    const body = [
      `Source: \`${args.backlogPath}\``,
      "",
      "OpenSpec Change (suggested):",
      `- ${deriveTaskMeta(title).changeId || "(unknown)"}`,
      "",
    ].join("\n");

    const created = await ghRest(
      token,
      "POST",
      `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/issues`,
      { title, body },
    );
    ensuredIssues.push(created);
  }

  console.log(`[2/4] Issues ensured: ${args.dryRun ? "(dry-run)" : ensuredIssues.length}`);

  const projectInfo = await getOrCreateProject(
    token,
    repoInfo,
    args.projectTitle,
    args.dryRun,
  );

  if (projectInfo.wouldCreate) {
    console.log(`[3/4] Would create project: ${args.projectTitle}`);
    console.log("[4/4] Done (dry-run)");
    return;
  }

  console.log(`[3/4] Project: ${projectInfo.project.title} (${projectInfo.project.url || projectInfo.project.id})`);

  let fields = await getProjectFields(token, projectInfo.project.id);

  const moduleField = await ensureField(
    token,
    projectInfo.project.id,
    fields,
    {
      name: "Module",
      type: "SINGLE_SELECT",
      options: [
        ...makeSingleSelectOptions(["Docs"], "GRAY"),
        ...makeSingleSelectOptions(["Extension"], "YELLOW"),
        ...makeSingleSelectOptions(["Bridge"], "BLUE"),
        ...makeSingleSelectOptions(["OpenNotebook"], "GREEN"),
        ...makeSingleSelectOptions(["ReplayUI"], "PURPLE"),
      ],
    },
    args.dryRun,
  );

  const priorityField = await ensureField(
    token,
    projectInfo.project.id,
    fields,
    {
      name: "Priority",
      type: "SINGLE_SELECT",
      options: [
        ...makeSingleSelectOptions(["P0"], "RED"),
        ...makeSingleSelectOptions(["P1"], "ORANGE"),
      ],
    },
    args.dryRun,
  );

  const milestoneField = await ensureField(
    token,
    projectInfo.project.id,
    fields,
    {
      name: "Milestone",
      type: "SINGLE_SELECT",
      options: [
        ...makeSingleSelectOptions(["M1"], "BLUE"),
        ...makeSingleSelectOptions(["M2"], "PURPLE"),
        ...makeSingleSelectOptions(["M3"], "GREEN"),
      ],
    },
    args.dryRun,
  );

  const openSpecField = await ensureField(
    token,
    projectInfo.project.id,
    fields,
    { name: "OpenSpec Change", type: "TEXT" },
    args.dryRun,
  );

  if (!args.dryRun) {
    fields = await getProjectFields(token, projectInfo.project.id);
  } else {
    fields = [moduleField, priorityField, milestoneField, openSpecField, ...fields];
  }

  const items = await listProjectItems(token, projectInfo.project.id);
  const itemByContentId = new Map(
    items
      .filter((it) => it?.content?.__typename === "Issue")
      .map((it) => [it.content.id, it.id]),
  );

  for (const issue of ensuredIssues) {
    const issueNodeId = issue.node_id;
    let itemId = itemByContentId.get(issueNodeId);
    if (!itemId) {
      console.log(`- add to project: #${issue.number} ${issue.title}`);
      const item = await addIssueToProject(token, projectInfo.project.id, issueNodeId, args.dryRun);
      itemId = item.id;
      itemByContentId.set(issueNodeId, itemId);
    }

    const meta = deriveTaskMeta(issue.title);

    const moduleOptionId = findSingleSelectOptionId(moduleField, meta.module);
    if (moduleOptionId) {
      await setItemFieldValue(
        token,
        projectInfo.project.id,
        itemId,
        moduleField.id,
        { singleSelectOptionId: moduleOptionId },
        args.dryRun,
      );
    }

    const priorityOptionId = findSingleSelectOptionId(priorityField, meta.priority);
    if (priorityOptionId) {
      await setItemFieldValue(
        token,
        projectInfo.project.id,
        itemId,
        priorityField.id,
        { singleSelectOptionId: priorityOptionId },
        args.dryRun,
      );
    }

    if (meta.milestone) {
      const milestoneOptionId = findSingleSelectOptionId(milestoneField, meta.milestone);
      if (milestoneOptionId) {
        await setItemFieldValue(
          token,
          projectInfo.project.id,
          itemId,
          milestoneField.id,
          { singleSelectOptionId: milestoneOptionId },
          args.dryRun,
        );
      }
    }

    if (meta.changeId) {
      await setItemFieldValue(
        token,
        projectInfo.project.id,
        itemId,
        openSpecField.id,
        { text: meta.changeId },
        args.dryRun,
      );
    }
  }

  console.log("[4/4] Done");
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exit(1);
});
