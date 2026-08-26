# 个人注意力工作台

一个本地优先的个人注意力选择工具。它不替代知识库或任务管理器：

- Obsidian 继续负责知识沉淀；
- 滴答清单继续负责具体任务与 GTD；
- 本工作台只回答“什么值得我现在投入注意力”。

## 已实现

- 「探索」「创造」共用 Radar → Focus → Engage → Outcome & Review 生命周期；
- 看板直接拖拽；详情默认预览，并提供「下一阶段」和自由「移动到」；
- Focus / Engage 全局 WIP 上限与超限提醒；
- Markdown 说明、可分别管理的探索/创造类别和多选主题标签；
- 随时停止关注、归档、恢复，以及从已有卡片生成新线索；
- 当前阶段分布、探索/创造分布、可下钻主题统计和停滞项目；
- 六步注意力梳理：顶部可填近期关注方向，Radar→Focus 与 Focus→Engage 可生成组合建议并一次确认；
- Windows 用户目录中的本地文件保存，以及无损 JSON 导入/导出；
- 进入 Engage 后打开执行计划：可生成任务拆解，再选择不创建、只创建主任务，或通过 CLI 写入主任务和子任务；
- 本机 AI 网关与连接测试：设置中配置通用 OpenAI 兼容接口，密钥保存在本机凭据文件中；
- AI 自动标签：在记录和卡片详情中复用现有主题，新标签需确认。

## 示例种子

首次启动且尚无本地工作区文件时，会写入少量入门示例卡：

- 探索：Radar / Focus / Engage / Outcome & Review 各 1 张，说明介绍对应阶段；
- 创造：Radar 1 张，说明探索与创造分别适合放什么。

你的日常数据保存在本机 `%LOCALAPPDATA%\所向\workspace.json`。更换示例种子不会改写已有工作区。

## 类别体系

- 探索：主题 / 问题、书籍 / 影音、课程 / 体验；
- 创造：产品 / 项目、写作 / 表达、活动 / 组织。

类别描述对象形态，主题标签描述内容领域。Capture 时可以暂时保持“未分类”。

## 启动

需要 Node.js 22 或更高版本。

```powershell
npm.cmd install
npm.cmd run dev
```

开发模式按终端显示的地址打开浏览器。日常使用由本地服务固定在 `http://127.0.0.1:5174`：

```powershell
npm.cmd run build
npm.cmd start
```

本地服务只监听当前电脑，不向局域网或互联网开放。项目内的 `scripts/launch-xiang.ps1` 会在服务未运行时启动它；若代码比当前页面新，或缺少新的本机接口，会先重建并重启，再打开同一地址。

## 数据与备份

主数据保存在当前 Windows 用户的：

```text
%LOCALAPPDATA%\所向\workspace.json
```

服务保存时会先校验并写入临时文件，再替换正式文件，同时保留最近一次可读备份。清理浏览器网站数据不会删除这份主文件。

API 密钥不进入 `workspace.json` 或导出备份，而是单独保存在：

```text
%LOCALAPPDATA%\所向\ai-credential.dpapi
```

该文件使用当前 Windows 用户的 DPAPI 保护。更换电脑后需要重新填写密钥。

首次升级且主文件尚不存在时，网页会尝试读取同一地址下的旧浏览器数据；只有写入本地文件并再次读回一致后才采用。若迁移失败，旧浏览器数据不会被删除，页面会明确提示使用 JSON 备份恢复。

仍建议定期在「设置」中导出 JSON。恢复时选择「导入 JSON」；导入会替换当前工作台数据，建议先导出当前数据。

## 滴答清单边界

进入 Engage 时会明确提供“仅移入”和“移入并创建滴答任务”。只有选择后者，工作台才使用滴答清单 URL Scheme 打开任务创建入口，并保存“已发起、结果待确认”的本地记录。它不会读取、更新、完成或删除滴答中的任务，也不会在卡片离开 Engage 时修改滴答任务。

浏览器无法可靠确认外部应用最终是否保存成功，因此界面不会声称“已创建成功”。如果系统没有安装滴答清单或浏览器阻止打开外部协议，需要在滴答中手动创建任务。

## 检查

```powershell
npm.cmd test -- --run
npm.cmd run typecheck
npm.cmd run build
```

## 干净分发（绿色版）

打包一个可解压即用的绿色版，双击 **Worthward.exe** 启动，无需对方安装 Node.js：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\pack-clean.ps1
```

产物在 `release\Worthward-portable-*.zip`，解压后双击 **Worthward.exe**；使用说明见同目录 **使用说明.html**。

## 本机绿色版启动

开发目录也可改为双击 `Worthward.exe` 启动（并更新桌面快捷方式）：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\setup-portable.ps1
```
