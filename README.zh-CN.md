# LitCode

[![CI](https://github.com/its-ahoh/litcode/actions/workflows/ci.yml/badge.svg)](https://github.com/its-ahoh/litcode/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

*[English](README.md) · [简体中文](README.zh-CN.md)*

LitCode 是一个本地优先的 LeetCode 增强 Chrome 插件（Manifest V3）。它没有任何自建后端，所有数据（包括你的 AI API Key）都保存在浏览器本地存储中。插件对 leetcode.com 页面做最小化注入，把主要交互放进 Chrome 侧边栏（Side Panel），提供本地代码补全、精选解法视频、错题本与间隔重复复习、多版本题解存档，以及 AI 代码解释。唯一的网络请求都是可选的：打开 YouTube 视频，以及你主动触发的 AI 解释（直接发往你配置的 API，自带 Key）。

## 功能

- **本地代码补全** —— 在 Monaco 编辑器中为 Python / Java / JavaScript 提供静态词典补全（字母前缀触发与 `.` 成员触发）。
- **精选解法视频** —— 识别当前题目并在侧边栏展示对应视频。对于没有精选映射的题目，通过 DuckDuckGo 搜索视频并内嵌播放；下拉菜单可回退到 YouTube 或 Google Videos，搜索失败时提供重试按钮。
- **错题本 + 间隔重复（SRS）** —— 自动记录提交结果；连续失败的题目会进入复习队列，通过后按 3/7/14 天档位推进。工具栏角标显示今日到期与逾期的数量。
- **题解存档** —— 每道题最多 3 个槽位：保存、覆盖、恢复到编辑器、复制、删除。
- **AI 导师（对话式）** —— 聊天界面附三个快捷操作：渐进式提示（1→4 级，未主动要求不剧透）、解释你在编辑器中选中的代码、获取完整解法讲解。也可在编辑器里右键使用相同的快捷操作。支持 Anthropic（Claude）与 OpenAI 兼容后端，自带 Key（BYOK），可选覆盖 Base URL 指向兼容代理。回答为英文。
- **数据导出 / 导入** —— 一键导出全部本地数据为 JSON 备份，或导入 JSON 文件恢复（会覆盖当前数据，并有二次确认）。

## 构建

```bash
npm install
npm run build   # 生产构建，产物在 .output/chrome-mv3
npm run test    # 运行 Vitest 单元测试
```

其他常用命令：

```bash
npm run dev      # WXT 开发模式（重新生成 .output 供加载调试）
npx tsc --noEmit # 仅类型检查，不产出文件
```

## 快速安装（无需构建）

仓库已内置一份预构建产物 [`extension/`](extension/)，可直接加载：

1. 下载或克隆本仓库。
2. 打开 Chrome，访问 `chrome://extensions`。
3. 打开右上角的「开发者模式」。
4. 点击「加载已解压的扩展程序」，选择 `extension/` 目录。
5. 打开任意 leetcode.com 题目页，从工具栏图标启动 LitCode 侧边栏。

## 从源码构建

如果你想自己构建：

1. 执行 `npm install` 后 `npm run build`（产物在 `.output/chrome-mv3`），或用 `npm run pack` 同时刷新 `extension/`。
2. 在 `chrome://extensions` → 开发者模式 →「加载已解压的扩展程序」中选择构建产物目录。

## 已知限制

1. 复习到期日（`dueDate`）按 UTC 日历计算，负时区（如美洲地区）的用户在本地午夜前后可能会看到相差一天。
2. AI 解释默认支持 api.anthropic.com 与 api.openai.com（已在 `host_permissions` 中声明以绕过 CORS）；自定义 Base URL 代理需要其自身允许跨域请求。API Key 明文存于 chrome.storage.local，仅发往你配置的 API 域名——请勿在共享电脑上使用。
3. 精选视频映射（`assets/videos.ts`）目前是起步数据集，覆盖 Blind 75 中的 5 道题；映射外的题目回退到 DuckDuckGo 实时视频搜索。
4. 代码补全由静态词典驱动，不做真实的类型推断或上下文分析，仅按语言关键字/成员做字符串匹配提示。
