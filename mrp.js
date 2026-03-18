#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import inquirer from "inquirer";
import fetch from "node-fetch";
import open from "open";

// ----------------- 配置 -----------------
const CONFIG_PATH = path.join(process.env.HOME || process.env.USERPROFILE, ".gitmrprc");

// 加载配置
function loadConfig() {
  if (fs.existsSync(CONFIG_PATH)) {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
  }
  return null;
}

// 第一次配置
async function setupConfig() {
  const answers = await inquirer.prompt([
    {
      type: "input",
      name: "token",
      message: "请输入 GitLab Token:",
    },
    {
      type: "input",
      name: "assignee_id",
      message: "请输入默认 Assignee ID:",
    },
    {
      type: "input",
      name: "base",
      message: "请输入 GitLab API 地址:",
    },
    {
      type: "input",
      name: "default_target",
      message: "请输入默认 target 分支:",
      default: "test"
    }
  ]);

  fs.writeFileSync(CONFIG_PATH, JSON.stringify(answers, null, 2));
  console.log("配置已保存到", CONFIG_PATH);
  return answers;
}

// 获取当前项目 path
function getProjectPath() {
  const url = execSync("git remote get-url origin").toString().trim();
  let pathPart = "";
  if (url.startsWith("git@")) {
    pathPart = url.split(":")[1];
  } else {
    pathPart = url.split("/").slice(3).join("/");
  }
  return encodeURIComponent(pathPart.replace(".git", ""));
}

// 当前分支
function getCurrentBranch() {
  return execSync("git branch --show-current").toString().trim();
}

// 远程分支
function getRemoteBranches() {
  const output = execSync("git branch -r")
    .toString()
    .trim()
    .split("\n")
    .map((b) => b.replace("origin/", "").trim())
    .filter((b) => b && !b.includes("HEAD"));

  return [...new Set(output)];
}

// 创建 MR
async function createMR({ source, target, title, token, assignee_id, base, projectPath }) {
  const res = await fetch(`${base}/api/v4/projects/${projectPath}/merge_requests`, {
    method: "POST",
    headers: {
      "PRIVATE-TOKEN": token,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      source_branch: source,
      target_branch: target,
      title,
      assignee_id
    })
  });
  const data = await res.json();
  console.log("MR 创建成功:", data.web_url);
  await open(data.web_url);
}

// ----------------- 主程序 -----------------
async function main() {
  let config = loadConfig();
  if (!config) {
    console.log("首次使用，请配置 GitLab 信息");
    config = await setupConfig();
  }

  const TOKEN = process.env.GITLAB_TOKEN || config.token;
  const ASSIGNEE_ID = process.env.GITLAB_ASSIGNEE_ID || config.assignee_id;
  const BASE = process.env.GITLAB_BASE || config.base;
  const DEFAULT_TARGET = config.default_target || "test";

  const projectPath = getProjectPath();
  // 获取远程分支
  const branches = getBranches();
  const source = getCurrentBranch();
  // 排序 release 放第一位
  const sortedBranches = [
    "release",
    ...branches.filter(b => b !== "release")
  ];

  const { target } = await inquirer.prompt([
    {
      type: "list",
      name: "target",
      message: `当前分支: ${source}，请选择 target 分支`,
      choices: sortedBranches,
      default: DEFAULT_TARGET
    }
  ]);


  const { title } = await inquirer.prompt([
    {
      type: "input",
      name: "title",
      message: "请输入 MR 标题:",
      default: `From ${source} into ${target}`
    }
  ]);

  await createMR({
    source,
    target,
    title,
    token: TOKEN,
    assignee_id: ASSIGNEE_ID,
    base: BASE,
    projectPath
  });
}

main().catch(e => console.error(e));