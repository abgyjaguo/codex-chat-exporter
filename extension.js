/* eslint-disable no-control-regex */
"use strict";

const vscode = require("vscode");
const fs = require("fs");
const http = require("http");
const https = require("https");
const os = require("os");
const path = require("path");
const readline = require("readline");
const { once } = require("events");

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand("codexChatExporter.exportChat", async () => {
      await exportChatCommand();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "codexChatExporter.exportLatestChat",
      async () => {
        await exportChatCommand({ pickLatest: true });
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "codexChatExporter.openCodexDataFolder",
      async () => {
        const codexDir = resolveCodexDir();
        try {
          await vscode.env.openExternal(vscode.Uri.file(codexDir));
        } catch (err) {
          void vscode.window.showErrorMessage(
            `无法打开 Codex 数据目录：${stringifyError(err)}`,
          );
        }
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "codexChatExporter.syncToBridge",
      async () => {
        await syncToBridgeCommand();
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "codexChatExporter.syncLatestToBridge",
      async () => {
        await syncToBridgeCommand({ pickLatest: true });
      },
    ),
  );
}

function deactivate() {}

module.exports = { activate, deactivate };

async function exportChatCommand(options = {}) {
  const codexDir = resolveCodexDir();

  if (!fs.existsSync(codexDir)) {
    void vscode.window.showErrorMessage(
      `未找到 Codex 数据目录：${codexDir}\n\n你可以在设置里配置 codexChatExporter.codexDir。`,
    );
    return;
  }

  const config = vscode.workspace.getConfiguration("codexChatExporter");
  const onlyVsCodeSessions = config.get("onlyVsCodeSessions", true);
  const includeAgentReasoning = config.get("includeAgentReasoning", false);
  const includeToolCalls = config.get("includeToolCalls", false);
  const includeToolOutputs = config.get("includeToolOutputs", false);
  const includeEnvironmentContext = config.get("includeEnvironmentContext", false);

  const sessions = await discoverSessionFiles(codexDir);
  if (sessions.length === 0) {
    void vscode.window.showWarningMessage(
      `未在 ${codexDir} 下找到可导出的会话日志（.jsonl）。`,
    );
    return;
  }

  const sessionInfos = [];
  for (const s of sessions) {
    const meta = await readSessionMeta(s.filePath);
    if (onlyVsCodeSessions && meta && !isVsCodeSession(meta)) continue;
    sessionInfos.push({ ...s, meta, sortKey: computeSortKey(meta, s) });
  }

  if (sessionInfos.length === 0) {
    void vscode.window.showWarningMessage(
      onlyVsCodeSessions
        ? "未找到 VS Code 发起的 Codex 会话（尝试关闭设置 codexChatExporter.onlyVsCodeSessions）。"
        : "未找到可导出的 Codex 会话。",
    );
    return;
  }

  sessionInfos.sort((a, b) => (b.sortKey ?? 0) - (a.sortKey ?? 0));

  let picked = null;
  if (options.pickLatest) {
    picked = [sessionInfos[0]];
  } else {
    await fillSessionPreviews(sessionInfos);
    const items = sessionInfos.map((s) => toQuickPickItem(s));
    const pickedItems = await vscode.window.showQuickPick(items, {
      canPickMany: true,
      matchOnDescription: true,
      matchOnDetail: true,
      placeHolder: "选择要导出的 Codex 会话（可多选）",
      ignoreFocusOut: true
    });
    if (!pickedItems || pickedItems.length === 0) return;
    picked = pickedItems.map((i) => i.sessionInfo);
  }

  const exportType = await vscode.window.showQuickPick(
    [
      {
        label: "Markdown（对话稿）",
        description: "提取 user/agent 消息，导出 .md",
        value: "markdown",
      },
      {
        label: "原始 JSONL（完整日志）",
        description: "直接复制 .jsonl",
        value: "jsonl",
      },
    ],
    {
      placeHolder: "选择导出格式",
      ignoreFocusOut: true,
    },
  );

  if (!exportType) return;

  const isSingle = picked.length === 1;

  if (isSingle) {
    const defaultName = defaultExportFileName(picked[0], exportType.value);
    const defaultDir = defaultSaveDirectory();
    const saveUri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(path.join(defaultDir, defaultName)),
      filters:
        exportType.value === "markdown"
          ? { Markdown: ["md"] }
          : { JSONL: ["jsonl"] },
      saveLabel: "导出",
    });
    if (!saveUri) return;

    try {
      await exportOneSession(picked[0], exportType.value, saveUri.fsPath, {
        includeAgentReasoning,
        includeToolCalls,
        includeToolOutputs,
        includeEnvironmentContext,
      });
      void vscode.window.showInformationMessage(`已导出：${saveUri.fsPath}`);
    } catch (err) {
      void vscode.window.showErrorMessage(
        `导出失败：${stringifyError(err)}`,
      );
    }
    return;
  }

  const folderUris = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: "选择导出目录",
  });
  if (!folderUris || folderUris.length === 0) return;
  const outDir = folderUris[0].fsPath;

  const results = { ok: 0, failed: 0 };
  for (const s of picked) {
    const outPath = path.join(outDir, defaultExportFileName(s, exportType.value));
    try {
      await exportOneSession(s, exportType.value, outPath, {
        includeAgentReasoning,
        includeToolCalls,
        includeToolOutputs,
        includeEnvironmentContext,
      });
      results.ok += 1;
    } catch {
      results.failed += 1;
    }
  }

  void vscode.window.showInformationMessage(
    `导出完成：成功 ${results.ok}，失败 ${results.failed}（目录：${outDir}）`,
  );
}

async function syncToBridgeCommand(options = {}) {
  const codexDir = resolveCodexDir();

  if (!fs.existsSync(codexDir)) {
    void vscode.window.showErrorMessage(
      `未找到 Codex 数据目录：${codexDir}\n\n你可以在设置里配置 codexChatExporter.codexDir。`,
    );
    return;
  }

  const config = vscode.workspace.getConfiguration("codexChatExporter");
  const onlyVsCodeSessions = config.get("onlyVsCodeSessions", true);
  const includeAgentReasoning = config.get("includeAgentReasoning", false);
  const includeToolCalls = config.get("includeToolCalls", false);
  const includeToolOutputs = config.get("includeToolOutputs", false);
  const includeEnvironmentContext = config.get("includeEnvironmentContext", false);
  const bridgeBaseUrl = String(config.get("bridgeBaseUrl", "http://127.0.0.1:7331") || "").trim();
  const defaultProjectName = String(config.get("defaultProjectName", "") || "").trim();
  const defaultDoneDefinition = String(config.get("defaultDoneDefinition", "") || "").trim();
  const syncIncludeRawJsonl = !!config.get("syncIncludeRawJsonl", true);
  const syncIncludeMarkdown = !!config.get("syncIncludeMarkdown", false);

  if (!syncIncludeRawJsonl && !syncIncludeMarkdown) {
    void vscode.window.showErrorMessage(
      "同步配置无效：请至少开启 codexChatExporter.syncIncludeRawJsonl 或 codexChatExporter.syncIncludeMarkdown。",
    );
    return;
  }

  if (!bridgeBaseUrl) {
    void vscode.window.showErrorMessage(
      "Bridge 地址为空：请在设置中配置 codexChatExporter.bridgeBaseUrl。",
    );
    return;
  }

  let endpoint;
  try {
    endpoint = new URL("/bridge/v1/import/codex-chat", bridgeBaseUrl);
  } catch (err) {
    void vscode.window.showErrorMessage(
      `Bridge 地址无效：${bridgeBaseUrl}\n${stringifyError(err)}`,
    );
    return;
  }

  const sessions = await discoverSessionFiles(codexDir);
  if (sessions.length === 0) {
    void vscode.window.showWarningMessage(
      `未在 ${codexDir} 下找到可同步的会话日志（.jsonl）。`,
    );
    return;
  }

  const sessionInfos = [];
  for (const s of sessions) {
    const meta = await readSessionMeta(s.filePath);
    if (onlyVsCodeSessions && meta && !isVsCodeSession(meta)) continue;
    sessionInfos.push({ ...s, meta, sortKey: computeSortKey(meta, s) });
  }

  if (sessionInfos.length === 0) {
    void vscode.window.showWarningMessage(
      onlyVsCodeSessions
        ? "未找到 VS Code 发起的 Codex 会话（尝试关闭设置 codexChatExporter.onlyVsCodeSessions）。"
        : "未找到可同步的 Codex 会话。",
    );
    return;
  }

  sessionInfos.sort((a, b) => (b.sortKey ?? 0) - (a.sortKey ?? 0));

  let picked = null;
  if (options.pickLatest) {
    picked = [sessionInfos[0]];
  } else {
    await fillSessionPreviews(sessionInfos);
    const items = sessionInfos.map((s) => toQuickPickItem(s));
    const pickedItems = await vscode.window.showQuickPick(items, {
      canPickMany: true,
      matchOnDescription: true,
      matchOnDetail: true,
      placeHolder: "选择要同步的 Codex 会话（可多选）",
      ignoreFocusOut: true
    });
    if (!pickedItems || pickedItems.length === 0) return;
    picked = pickedItems.map((i) => i.sessionInfo);
  }

  if (!picked || picked.length === 0) return;

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  const workspaceName = workspaceFolder?.name || "";
  const workspacePath = workspaceFolder?.uri?.fsPath || "";
  const projectDefault = workspaceName || defaultProjectName;

  const projectName = await promptForRequiredInput(
    "输入 project_name（可用于 Bridge 归档）",
    projectDefault,
  );
  if (!projectName) return;

  const sessionPlans = [];
  for (const sessionInfo of picked) {
    const defaultSessionName = sessionInfo.preview
      ? sessionInfo.preview
      : path.basename(sessionInfo.filePath, ".jsonl");
    const sessionName = await promptForRequiredInput(
      "输入 session_name（可编辑）",
      defaultSessionName,
    );
    if (!sessionName) return;
    sessionPlans.push({ sessionInfo, sessionName });
  }

  const results = { ok: 0, failed: 0 };

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "同步到 Bridge…",
      cancellable: true,
    },
    async (progress, token) => {
      let done = 0;
      for (const plan of sessionPlans) {
        if (token.isCancellationRequested) break;

        done += 1;
        progress.report({
          increment: (100 * 1) / sessionPlans.length,
          message: `${done}/${sessionPlans.length} ${path.basename(plan.sessionInfo.filePath)}`,
        });

        try {
          const payload = await buildBridgePayload({
            sessionInfo: plan.sessionInfo,
            sessionName: plan.sessionName,
            projectName,
            projectCwd: workspacePath || (typeof plan.sessionInfo.meta?.cwd === "string" ? plan.sessionInfo.meta.cwd : ""),
            doneDefinition: defaultDoneDefinition,
            includeAgentReasoning,
            includeToolCalls,
            includeToolOutputs,
            includeEnvironmentContext,
            syncIncludeRawJsonl,
            syncIncludeMarkdown,
          });

          const response = await postJson(endpoint, payload);
          if (response.statusCode < 200 || response.statusCode >= 300) {
            results.failed += 1;
            const detail = response.bodyText ? `\n${response.bodyText.trim()}` : "";
            const message = `同步失败（${response.statusCode}）：${plan.sessionName}${detail}`;
            void vscode.window.showErrorMessage(message);
            continue;
          }

          results.ok += 1;
          const parsed = tryParseJson(response.bodyText);
          const projectId = parsed?.project_id;
          const sessionId = parsed?.session_id;
          const suffix =
            projectId || sessionId
              ? `（project_id=${projectId || "-"}，session_id=${sessionId || "-"}）`
              : "";
          void vscode.window.showInformationMessage(
            `同步成功：${plan.sessionName}${suffix}`,
          );
        } catch (err) {
          results.failed += 1;
          const message = formatBridgeError(err, bridgeBaseUrl, plan.sessionName);
          void vscode.window.showErrorMessage(message);
        }
      }
    },
  );

  if (results.ok === 0 && results.failed === 0) return;

  const summary = `同步完成：成功 ${results.ok}，失败 ${results.failed}`;
  void vscode.window.showInformationMessage(summary);
}

function resolveCodexDir() {
  const config = vscode.workspace.getConfiguration("codexChatExporter");
  const configured = config.get("codexDir", "");
  if (typeof configured === "string" && configured.trim()) {
    return expandHomeDir(configured.trim());
  }
  return path.join(os.homedir(), ".codex");
}

function defaultSaveDirectory() {
  const folder = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
  if (folder && typeof folder === "string") return folder;

  const desktop = path.join(os.homedir(), "Desktop");
  if (fs.existsSync(desktop)) return desktop;

  return os.homedir();
}

function expandHomeDir(p) {
  if (!p) return p;
  if (p === "~") return os.homedir();
  if (p.startsWith("~/") || p.startsWith("~\\")) {
    return path.join(os.homedir(), p.slice(2));
  }
  return p;
}

async function discoverSessionFiles(codexDir) {
  const out = [];

  const sessionsDir = path.join(codexDir, "sessions");
  const archivedDir = path.join(codexDir, "archived_sessions");

  if (fs.existsSync(sessionsDir)) {
    for (const filePath of walkFiles(sessionsDir)) {
      if (!filePath.toLowerCase().endsWith(".jsonl")) continue;
      const stat = safeStat(filePath);
      out.push({
        filePath,
        source: "sessions",
        mtimeMs: stat?.mtimeMs ?? null,
        size: stat?.size ?? null,
        sortKey: stat?.mtimeMs ?? 0,
      });
    }
  }

  if (fs.existsSync(archivedDir)) {
    for (const entry of safeReadDir(archivedDir)) {
      if (!entry.isFile()) continue;
      if (!entry.name.toLowerCase().endsWith(".jsonl")) continue;
      const filePath = path.join(archivedDir, entry.name);
      const stat = safeStat(filePath);
      out.push({
        filePath,
        source: "archived_sessions",
        mtimeMs: stat?.mtimeMs ?? null,
        size: stat?.size ?? null,
        sortKey: stat?.mtimeMs ?? 0,
      });
    }
  }

  return out;
}

function* walkFiles(dirPath) {
  const entries = safeReadDir(dirPath);
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      yield* walkFiles(fullPath);
      continue;
    }
    if (entry.isFile()) yield fullPath;
  }
}

function safeReadDir(dirPath) {
  try {
    return fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }
}

function safeStat(filePath) {
  try {
    return fs.statSync(filePath);
  } catch {
    return null;
  }
}

async function readSessionMeta(filePath) {
  const first = await findFirstJsonlObject(
    filePath,
    (obj) => obj && obj.type === "session_meta" && obj.payload && obj.payload.id,
    50,
  );
  return first?.payload ?? null;
}

async function findFirstJsonlObject(filePath, predicate, maxLines) {
  return await new Promise((resolve) => {
    const input = fs.createReadStream(filePath, { encoding: "utf8" });
    const rl = readline.createInterface({ input, crlfDelay: Infinity });

    let lineCount = 0;
    let settled = false;

    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
      try {
        rl.close();
      } catch {}
      try {
        input.destroy();
      } catch {}
    };

    rl.on("line", (line) => {
      if (settled) return;
      const trimmed = String(line || "").trim();
      if (!trimmed) return;

      lineCount += 1;

      try {
        const obj = JSON.parse(trimmed);
        if (predicate(obj)) {
          finish(obj);
          return;
        }
      } catch {}

      if (lineCount >= maxLines) {
        finish(null);
      }
    });

    rl.on("close", () => finish(null));
    rl.on("error", () => finish(null));
    input.on("error", () => finish(null));
  });
}

function isVsCodeSession(meta) {
  const originator = typeof meta.originator === "string" ? meta.originator : "";
  const source = typeof meta.source === "string" ? meta.source : "";
  return originator === "codex_vscode" || source === "vscode";
}

function toQuickPickItem(sessionInfo) {
  const base = path.basename(sessionInfo.filePath);
  const meta = sessionInfo.meta;
  const preview = typeof sessionInfo.preview === "string" ? sessionInfo.preview : "";
  const title = preview || base;

  const started =
    meta?.timestamp && typeof meta.timestamp === "string"
      ? meta.timestamp
      : null;

  const originator =
    meta?.originator && typeof meta.originator === "string"
      ? meta.originator
      : sessionInfo.source;

  const cwd =
    meta?.cwd && typeof meta.cwd === "string"
      ? meta.cwd
      : "";

  const labelParts = [];
  if (started) labelParts.push(shortIso(started));
  labelParts.push(title);

  const descriptionParts = [];
  if (originator) descriptionParts.push(originator);
  if (cwd) descriptionParts.push(cwd);

  return {
    label: labelParts.join("  "),
    description: descriptionParts.join("  ·  "),
    detail: sessionInfo.filePath,
    sessionInfo,
  };
}

function shortIso(iso) {
  // 2025-12-25T03:38:54.627Z -> 2025-12-25 03:38:54Z
  try {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return iso;
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}Z`;
  } catch {
    return iso;
  }
}

function defaultExportFileName(sessionInfo, exportType) {
  const base = path.basename(sessionInfo.filePath, ".jsonl");
  if (exportType === "markdown") return `${base}.md`;
  return `${base}.jsonl`;
}

function computeSortKey(meta, sessionInfo) {
  const iso = meta?.timestamp && typeof meta.timestamp === "string" ? meta.timestamp : null;
  if (iso) {
    const t = Date.parse(iso);
    if (Number.isFinite(t)) return t;
  }
  return sessionInfo.sortKey ?? sessionInfo.mtimeMs ?? 0;
}

async function exportOneSession(sessionInfo, exportType, outPath, options) {
  if (exportType === "jsonl") {
    await fs.promises.copyFile(sessionInfo.filePath, outPath);
    return;
  }

  await exportMarkdownFromJsonl(sessionInfo.filePath, outPath, sessionInfo.meta, options);
}

async function exportMarkdownFromJsonl(sourcePath, outPath, meta, options) {
  const outStream = fs.createWriteStream(outPath, { encoding: "utf8" });
  try {
    await writeMarkdownFromJsonl(sourcePath, meta, options, outStream);
  } finally {
    await new Promise((resolve) => outStream.end(resolve));
  }
}

async function renderMarkdownFromJsonl(sourcePath, meta, options) {
  const chunks = [];
  const writer = {
    write: (text) => {
      chunks.push(String(text));
    },
  };
  await writeMarkdownFromJsonl(sourcePath, meta, options, writer);
  return chunks.join("");
}

async function writeMarkdownFromJsonl(sourcePath, meta, options, writer) {
  writer.write(`# Codex 聊天记录导出\n\n`);
  writer.write(`- 源文件：\`${sourcePath}\`\n`);
  if (meta?.id) writer.write(`- sessionId：\`${String(meta.id)}\`\n`);
  if (meta?.timestamp) writer.write(`- 开始时间：\`${String(meta.timestamp)}\`\n`);
  if (meta?.cwd) writer.write(`- cwd：\`${String(meta.cwd)}\`\n`);
  if (meta?.originator) writer.write(`- originator：\`${String(meta.originator)}\`\n`);
  if (meta?.cli_version) writer.write(`- cli_version：\`${String(meta.cli_version)}\`\n`);
  writer.write(`\n---\n\n`);

  const messageSources = await detectMessageSources(sourcePath);
  const preferEventUserMessages = messageSources.hasEventUserMessage;
  const preferEventAgentMessages = messageSources.hasEventAgentMessage;

  const input = fs.createReadStream(sourcePath, { encoding: "utf8" });
  const rl = readline.createInterface({ input, crlfDelay: Infinity });

  const includeAgentReasoning = !!options.includeAgentReasoning;
  const includeToolCalls = !!options.includeToolCalls;
  const includeToolOutputs = !!options.includeToolOutputs;
  const includeEnvironmentContext = !!options.includeEnvironmentContext;

  try {
    rl.on("line", (line) => {
      const trimmed = String(line || "").trim();
      if (!trimmed) return;

      let obj;
      try {
        obj = JSON.parse(trimmed);
      } catch {
        return;
      }

      const ts = typeof obj.timestamp === "string" ? obj.timestamp : null;

      if (obj.type === "event_msg" && obj.payload && typeof obj.payload === "object") {
        const t = obj.payload.type;
        if (preferEventUserMessages && t === "user_message") {
          writeTurn(writer, "用户", ts, obj.payload.message, obj.payload.images);
          return;
        }
        if (preferEventAgentMessages && t === "agent_message") {
          writeTurn(writer, "Codex", ts, obj.payload.message, null);
          return;
        }
        if (includeAgentReasoning && t === "agent_reasoning") {
          writeTurn(writer, "Codex（reasoning）", ts, obj.payload.text, null);
          return;
        }
      }

      if (includeToolCalls && obj.type === "response_item" && obj.payload && typeof obj.payload === "object") {
        const p = obj.payload;
        if (p.type === "function_call" && typeof p.name === "string") {
          const args = typeof p.arguments === "string" ? p.arguments : "";
          writer.write(`### 工具调用：\`${p.name}\`${ts ? `（${ts}）` : ""}\n\n`);
          if (args) writer.write("```json\n" + args + "\n```\n\n");
          return;
        }

        if (includeToolOutputs && p.type === "function_call_output" && typeof p.call_id === "string") {
          const output = typeof p.output === "string" ? p.output : "";
          writer.write(`### 工具输出：\`${p.call_id}\`${ts ? `（${ts}）` : ""}\n\n`);
          if (output) writer.write("```text\n" + output + "\n```\n\n");
          return;
        }
      }

      if (obj.type === "response_item" && obj.payload && typeof obj.payload === "object") {
        const p = obj.payload;
        if (p.type === "message" && typeof p.role === "string") {
          const role = p.role;
          if (preferEventUserMessages && role === "user") return;
          if (preferEventAgentMessages && role === "assistant") return;

          const text = extractTextFromResponseMessageContent(p.content);
          if (!text.trim()) return;

          if (!includeEnvironmentContext && looksLikeEnvironmentContext(text)) return;

          if (role === "user") {
            writeTurn(writer, "用户", ts, text, null);
            return;
          }
          if (role === "assistant") {
            writeTurn(writer, "Codex", ts, text, null);
            return;
          }
        }
      }
    });

    await once(rl, "close");
  } finally {
    try {
      rl.close();
    } catch {}
    try {
      input.destroy();
    } catch {}
  }
}

function writeTurn(outStream, who, ts, message, images) {
  const title = `## ${who}${ts ? `（${ts}）` : ""}\n\n`;
  outStream.write(title);

  const text = typeof message === "string" ? message : "";
  if (text) {
    outStream.write(text.trimEnd() + "\n\n");
  }

  if (Array.isArray(images) && images.length > 0) {
    outStream.write(`（包含 ${images.length} 张图片：未导出）\n\n`);
  }
}

async function fillSessionPreviews(sessionInfos) {
  const needs = sessionInfos.filter((s) => !s.preview);
  if (needs.length === 0) return;

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "加载 Codex 会话预览…",
      cancellable: true,
    },
    async (progress, token) => {
      let done = 0;
      for (const s of needs) {
        if (token.isCancellationRequested) break;
        try {
          s.preview = await readSessionPreview(s.filePath);
        } catch {
          s.preview = "";
        }
        done += 1;
        progress.report({
          increment: (100 * 1) / needs.length,
          message: s.preview ? s.preview : path.basename(s.filePath),
        });
      }
    },
  );
}

async function readSessionPreview(filePath) {
  return await new Promise((resolve) => {
    const input = fs.createReadStream(filePath, { encoding: "utf8" });
    const rl = readline.createInterface({ input, crlfDelay: Infinity });

    let settled = false;
    let lineCount = 0;
    const maxLines = 2500;

    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
      try {
        rl.close();
      } catch {}
      try {
        input.destroy();
      } catch {}
    };

    rl.on("line", (line) => {
      if (settled) return;
      lineCount += 1;
      if (lineCount > maxLines) {
        finish("");
        return;
      }

      const trimmed = String(line || "").trim();
      if (!trimmed) return;

      let obj;
      try {
        obj = JSON.parse(trimmed);
      } catch {
        return;
      }

      const candidate = extractUserTextFromJsonlObject(obj);
      if (!candidate) return;

      const preview = makePreviewText(candidate);
      if (!preview) return;

      finish(preview);
    });

    rl.on("close", () => finish(""));
    rl.on("error", () => finish(""));
    input.on("error", () => finish(""));
  });
}

function extractUserTextFromJsonlObject(obj) {
  if (!obj || typeof obj !== "object") return "";

  if (obj.type === "event_msg" && obj.payload && typeof obj.payload === "object") {
    if (obj.payload.type === "user_message" && typeof obj.payload.message === "string") {
      return obj.payload.message;
    }
  }

  if (obj.type === "response_item" && obj.payload && typeof obj.payload === "object") {
    const p = obj.payload;
    if (p.type === "message" && p.role === "user") {
      const text = extractTextFromResponseMessageContent(p.content);
      return text;
    }
  }

  return "";
}

function makePreviewText(text) {
  const raw = typeof text === "string" ? text : "";
  if (!raw.trim()) return "";
  if (looksLikeEnvironmentContext(raw)) return "";

  const fromIdeContext = extractRequestFromIdeContextBlock(raw);
  const chosen = fromIdeContext || raw;

  const compact = compactSingleLine(chosen);
  if (!compact) return "";

  return truncate(compact, 80);
}

function extractRequestFromIdeContextBlock(text) {
  const marker = "## My request for Codex:";
  const idx = text.indexOf(marker);
  if (idx === -1) return "";

  let after = text.slice(idx + marker.length);
  after = after.replace(/^\s+/, "");

  const stop = after.search(/\n##\s+/);
  if (stop !== -1) after = after.slice(0, stop);

  return after.trim();
}

function compactSingleLine(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(text, maxLen) {
  const s = String(text || "");
  if (s.length <= maxLen) return s;
  return s.slice(0, Math.max(0, maxLen - 1)).trimEnd() + "…";
}

async function detectMessageSources(sourcePath) {
  return await new Promise((resolve) => {
    const flags = {
      hasEventUserMessage: false,
      hasEventAgentMessage: false,
    };

    const input = fs.createReadStream(sourcePath, { encoding: "utf8" });
    const rl = readline.createInterface({ input, crlfDelay: Infinity });

    let settled = false;
    let lineCount = 0;
    const maxLines = 20000;

    const finish = () => {
      if (settled) return;
      settled = true;
      resolve(flags);
      try {
        rl.close();
      } catch {}
      try {
        input.destroy();
      } catch {}
    };

    rl.on("line", (line) => {
      if (settled) return;
      lineCount += 1;

      const trimmed = String(line || "").trim();
      if (!trimmed) return;

      let obj;
      try {
        obj = JSON.parse(trimmed);
      } catch {
        if (lineCount >= maxLines) finish();
        return;
      }

      if (obj && obj.type === "event_msg" && obj.payload && typeof obj.payload === "object") {
        const t = obj.payload.type;
        if (t === "user_message") flags.hasEventUserMessage = true;
        if (t === "agent_message") flags.hasEventAgentMessage = true;
      }

      if ((flags.hasEventUserMessage && flags.hasEventAgentMessage) || lineCount >= maxLines) {
        finish();
      }
    });

    rl.on("close", () => finish());
    rl.on("error", () => finish());
    input.on("error", () => finish());
  });
}

async function buildBridgePayload(options) {
  const codex = {};

  if (options.syncIncludeRawJsonl) {
    codex.jsonl_text = await readJsonlForSync(options.sessionInfo.filePath, {
      includeToolOutputs: options.includeToolOutputs,
      includeEnvironmentContext: options.includeEnvironmentContext,
    });
  }

  if (options.syncIncludeMarkdown) {
    codex.markdown_text = await renderMarkdownFromJsonl(
      options.sessionInfo.filePath,
      options.sessionInfo.meta,
      {
        includeAgentReasoning: options.includeAgentReasoning,
        includeToolCalls: options.includeToolCalls,
        includeToolOutputs: options.includeToolOutputs,
        includeEnvironmentContext: options.includeEnvironmentContext,
      },
    );
  }

  if (Object.keys(codex).length === 0) {
    throw new Error("同步内容为空：请至少开启 JSONL 或 Markdown 上传。");
  }

  const project = { name: options.projectName };
  if (options.projectCwd) project.cwd = options.projectCwd;
  if (options.doneDefinition) project.done_definition = options.doneDefinition;

  const session = {
    name: options.sessionName,
    source: options.syncIncludeRawJsonl ? "codex_jsonl" : "codex_markdown",
  };

  return {
    project,
    session,
    exported_at: new Date().toISOString(),
    codex,
  };
}

async function readJsonlForSync(filePath, options) {
  const includeToolOutputs = !!options.includeToolOutputs;
  const includeEnvironmentContext = !!options.includeEnvironmentContext;

  if (includeToolOutputs && includeEnvironmentContext) {
    return await fs.promises.readFile(filePath, "utf8");
  }

  return await new Promise((resolve, reject) => {
    const input = fs.createReadStream(filePath, { encoding: "utf8" });
    const rl = readline.createInterface({ input, crlfDelay: Infinity });
    const lines = [];

    let settled = false;
    const finish = (err) => {
      if (settled) return;
      settled = true;
      try {
        rl.close();
      } catch {}
      try {
        input.destroy();
      } catch {}
      if (err) {
        reject(err);
        return;
      }
      resolve(lines.join("\n"));
    };

    rl.on("line", (line) => {
      const trimmed = String(line || "");
      if (!trimmed.trim()) {
        lines.push(line);
        return;
      }

      let obj;
      try {
        obj = JSON.parse(trimmed);
      } catch {
        lines.push(line);
        return;
      }

      if (!includeToolOutputs && isToolOutputEntry(obj)) return;
      if (!includeEnvironmentContext && isEnvironmentContextEntry(obj)) return;

      lines.push(line);
    });

    rl.on("close", () => finish());
    rl.on("error", (err) => finish(err));
    input.on("error", (err) => finish(err));
  });
}

function isToolOutputEntry(obj) {
  return (
    obj &&
    obj.type === "response_item" &&
    obj.payload &&
    typeof obj.payload === "object" &&
    obj.payload.type === "function_call_output"
  );
}

function isEnvironmentContextEntry(obj) {
  if (!obj || typeof obj !== "object") return false;

  if (obj.type === "event_msg" && obj.payload && typeof obj.payload === "object") {
    if (obj.payload.type === "user_message" && typeof obj.payload.message === "string") {
      return looksLikeEnvironmentContext(obj.payload.message);
    }
  }

  if (obj.type === "response_item" && obj.payload && typeof obj.payload === "object") {
    const p = obj.payload;
    if (p.type === "message" && typeof p.role === "string") {
      const text = extractTextFromResponseMessageContent(p.content);
      return looksLikeEnvironmentContext(text);
    }
  }

  return false;
}

async function postJson(url, payload) {
  const data = JSON.stringify(payload);
  const isHttps = url.protocol === "https:";
  const client = isHttps ? https : http;
  const port = url.port ? Number(url.port) : isHttps ? 443 : 80;

  return await new Promise((resolve, reject) => {
    const req = client.request(
      {
        method: "POST",
        hostname: url.hostname,
        port,
        path: url.pathname + url.search,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
        },
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          resolve({
            statusCode: res.statusCode || 0,
            bodyText: body,
          });
        });
      },
    );

    req.on("error", (err) => reject(err));
    req.setTimeout(15000, () => {
      req.destroy(new Error("请求超时"));
    });
    req.write(data);
    req.end();
  });
}

function tryParseJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function formatBridgeError(err, baseUrl, sessionName) {
  const code = err?.code;
  const prefix = `同步失败：${sessionName}`;
  if (
    code === "ECONNREFUSED" ||
    code === "ENOTFOUND" ||
    code === "EHOSTUNREACH" ||
    code === "ETIMEDOUT"
  ) {
    return `${prefix}，无法连接 Bridge（${baseUrl}）。请确认 Bridge 已启动。`;
  }
  return `${prefix}：${stringifyError(err)}`;
}

async function promptForRequiredInput(prompt, defaultValue) {
  const input = await vscode.window.showInputBox({
    prompt,
    value: defaultValue || "",
    ignoreFocusOut: true,
    validateInput: (value) => {
      return String(value || "").trim() ? null : "不能为空";
    },
  });
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  return trimmed;
}

function extractTextFromResponseMessageContent(content) {
  if (!Array.isArray(content)) return "";
  const parts = [];
  for (const item of content) {
    if (!item || typeof item !== "object") continue;
    const t = item.type;
    if (t === "input_text" || t === "output_text" || t === "text") {
      if (typeof item.text === "string" && item.text) parts.push(item.text);
    }
  }
  return parts.join("");
}

function looksLikeEnvironmentContext(text) {
  const t = String(text || "").trimStart();
  return t.startsWith("<environment_context>");
}

function stringifyError(err) {
  if (!err) return String(err);
  if (err instanceof Error) return err.message || err.stack || String(err);
  return String(err);
}
