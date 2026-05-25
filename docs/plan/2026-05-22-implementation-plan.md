# PrefabMerge 实现计划

## 目标

在 `G:\Agents\PrefabMerge` 目录下构建一个可运行的 Tauri2 + React 桌面应用，能够：
1. 自动检测 Git 合并冲突中的 `.prefab` 文件
2. 左右分栏可视化对比节点树和属性差异
3. 交互式决策（节点级 + 属性级）
4. 自动处理 `__id__` 重映射，保证输出 prefab 结构完整
5. 写入前自动备份，支持撤销

---

## 关键决策

| 决策 | 选择 | 理由 |
|------|------|------|
| Git 操作方式 | `std::process::Command` 调用系统 git | 用户已有 Git 2.33.0，无需引入 `git2` crate 的 native 依赖 |
| 树形组件 | `rc-tree` | 成熟稳定，支持虚拟滚动，API 熟悉 |
| Diff 计算位置 | 前端（TypeScript） | 需要实时响应用户交互，结果需保存在 Zustand 状态中 |
| Merger / ID 重映射 | 前端（TypeScript） | 前端掌握完整决策状态，组装逻辑更自然；Rust 只做最终校验 |
| 状态管理 | Zustand | 轻量，TypeScript 友好，支持派生状态 |
| 样式方案 | Tailwind CSS | 与 Vite + React 集成简单，快速实现 Variant B（Light Clean）设计 |

---

## 里程碑与任务

### 里程碑 M1：项目脚手架（~30 分钟）

**目标**：可运行的 Tauri2 + React 空壳应用

- [ ] 使用 `npm create tauri-app@latest` 或手动初始化项目
- [ ] 配置 Vite + React 18 + TypeScript
- [ ] 配置 Tailwind CSS
- [ ] 安装前端依赖：`zustand`, `rc-tree`, `lucide-react`
- [ ] 验证 Tauri 应用能正常编译和运行（显示 Hello World）
- [ ] 配置项目目录结构（`src/components/`, `src/prefab/`, `src/store/`, `src/git/`）

**验收标准**：`cargo tauri dev` 能启动应用窗口，显示 React 默认页面

---

### 里程碑 M2：Rust 后端 — Git 命令（~60 分钟）

**目标**：Rust 端实现所有 Git 相关 Tauri Commands

- [ ] 定义 Rust 数据结构（`models.rs`）
  - `PrefabThreeWay` { base, ours, theirs: String }
  - `DiffFileInfo` { path, status }
  - `BackupInfo` { timestamp, path, size }
  - `WriteResult` { success, backup_path, backup_timestamp }
  - `PrefabValidationError` { code, message, details }
- [ ] 实现 `list_conflict_files(repo_path)`
  - 调用 `git diff --name-only --diff-filter=U`
  - 过滤出 `.prefab` 后缀的文件
- [ ] 实现 `get_prefab_three_way(repo_path, file_path)`
  - 读取 `git show :1:path`, `:2:path`, `:3:path`（base/ours/theirs）
  - 返回三个版本的原始 JSON 字符串
- [ ] 实现 `list_branches(repo_path)`
  - 调用 `git branch -a`，解析分支名列表
- [ ] 实现 `diff_branches(repo_path, left, right)`
  - 调用 `git diff --name-only left..right`
  - 过滤 `.prefab` 文件
- [ ] 实现 `get_prefab_from_branch(repo_path, branch, file_path)`
  - 调用 `git show branch:path` 获取指定分支的 prefab JSON

**验收标准**：每个 Rust command 都能通过前端 `invoke` 正确调用并返回预期数据

---

### 里程碑 M3：Rust 后端 — Prefab 校验与写入（~60 分钟）

**目标**：Rust 端实现写入、校验、备份、撤销

- [ ] 实现 Prefab JSON 解析（轻量，不需要完整树构建）
- [ ] 实现 `validate_prefab(json_data)` 校验函数
  - ID 范围连续性
  - 无 dangling 引用
  - 根节点正确性
  - 父子双向一致性
  - 组件反向绑定
  - PrefabInfo 一致性
- [ ] 实现 `write_prefab(repo_path, file_path, json_data)`
  - 先执行 validate，失败返回 `PrefabValidationError`
  - 校验通过后，备份原文件到 `.prefabmerge_backups/`
  - 写入新内容
  - 返回 `WriteResult`
- [ ] 实现 `list_backups(repo_path, file_path)`
  - 扫描备份目录，返回备份列表
- [ ] 实现 `restore_backup(repo_path, file_path, timestamp)`
  - 将指定备份复制回原路径
  - 删除该备份及之后的所有备份（线性撤销语义）
- [ ] 实现备份清理逻辑（保留最近 20 次）

**验收标准**：
- 写入有效 prefab → 成功，返回备份路径
- 写入无效 prefab → 失败，返回具体错误
- 撤销操作 → 文件恢复为备份内容

---

### 里程碑 M4：前端 Prefab 引擎（~90 分钟）

**目标**：完整移植 `prefab.js` 核心逻辑到 TypeScript

- [ ] 实现 `parser.ts`
  - `readPrefab(json: string): PrefabArray`
  - `buildContext(data): PrefabContext`
  - `buildTreeNode(ctx, nodeId): PrefabNode`
  - `treePrefab(json): PrefabTree`
- [ ] 实现 `id-rules.ts`
  - `isIdRef(value)`
  - `rewriteRefs(value, remap)`
  - `compactPrefabData(data)`
  - `allocate(data, value)`
  - `collectSubtreeIds(data, rootId)`
  - `graftSubtree(targetData, sourceData, sourceRootId, targetParentId)` — 跨 prefab 子树合并
- [ ] 实现 `diff.ts`
  - `buildPathMap(tree): Map<string, PrefabNode>`
  - `diffTrees(left, right): NodeDiff`
  - `diffProperties(leftProps, rightProps): PropertyDiff[]`
  - `__id__` 引用语义化对比（转换为路径后比较）
- [ ] 实现 `merger.ts`
  - `applyDecisions(leftData, rightData, nodeDecisions, propertyDecisions): PrefabArray`
  - 根据决策组装最终 prefab
  - 对保留的"新增子树"执行 `graftSubtree`
  - 对保留的"属性"应用 propertyDecisions
  - 最后执行 `compactPrefabData`
- [ ] 实现 `types.ts` — 所有 TypeScript 类型定义

**验收标准**：
- 能正确解析 `105006.prefab` 等实际文件
- 两个不同版本的 prefab 能正确计算差异
- 模拟决策后能输出有效的 prefab JSON

---

### 里程碑 M5：前端状态管理（~30 分钟）

**目标**：Zustand store 连接 Git API 和 Prefab 引擎

- [ ] 实现 `prefabStore.ts`
  - 状态定义（见设计文档 §11）
  - `loadRepo(path)` — 检测仓库，加载冲突文件列表
  - `selectFile(file)` — 调用 Rust 获取三方数据，解析并计算 diff
  - `setNodeDecision(path, type)` / `setPropertyDecision(nodePath, key, type)`
  - `applyMerge()` — 调用 merger 组装，invoke `write_prefab`
  - `undoMerge()` — invoke `restore_backup`
  - 派生状态：`getResolvedCount`, `isAllResolved`

**验收标准**：store 的 actions 能正确驱动数据流，从 Git → 解析 → Diff → 决策 → 合并

---

### 里程碑 M6：前端 UI 组件（~120 分钟）

**目标**：实现 Variant B（Light Clean）设计的所有 UI 组件

- [ ] `Toolbar.tsx`
  - 仓库路径选择（文件夹选择器）
  - 模式切换（冲突解决 / 差异预览）
  - 文件下拉选择
  - 分支选择（差异预览模式）
  - `[只看差异]` 复选框
  - `[显示 Base]` 复选框（差异预览模式）
- [ ] `DiffPanel.tsx`
  - 左右分栏布局（+ 可选的 Base 第三栏）
  - 集成 `NodeTree` 组件 × 3
  - 同步滚动（左右树同步展开/折叠）
- [ ] `NodeTree.tsx`
  - 基于 `rc-tree` 的树形展示
  - 状态图标（same/modified/added/removed/已决策）
  - 节点级决策按钮 `[←]` `[→]`
  - 点击节点触发 `onSelectNode`
- [ ] `PropertyDiff.tsx`
  - 属性差异表格
  - 左值/右值对比展示
  - 每行 `[←保留左]` `[→保留右]` 按钮
- [ ] `DecisionBar.tsx`
  - 中间栏的节点级快速决策按钮
- [ ] `BottomStatusBar.tsx`
  - 冲突节点统计
  - 已决策进度
  - `[应用合并]` 按钮（全部决策完成后可用）
  - `[撤销]` 按钮
- [ ] `App.tsx`
  - 整体布局组合
  - 错误提示（Toast）

**验收标准**：UI 能完整展示设计文档 §7.1 的布局，交互流程符合 §7.3

---

### 里程碑 M7：集成测试与调优（~60 分钟）

**目标**：用实际项目 prefab 验证完整流程

- [ ] 使用 GameWord 项目的实际冲突 prefab 测试
  - 打开 `MainPre.prefab` 的 ours/theirs 版本
  - 验证节点树正确渲染
  - 验证差异正确识别
  - 执行合并决策
  - 验证输出文件能通过 Cocos Creator 打开
- [ ] 验证撤销功能
- [ ] 验证大文件性能（500+ 节点）
- [ ] 处理边界情况
  - 空 prefab
  - 只有属性差异无节点差异
  - 很深的嵌套层级

**验收标准**：用至少 3 个不同的实际 prefab 文件完成端到端测试

---

## 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| `npm create tauri-app` 因网络问题失败 | 高 | 准备手动初始化方案（手动创建 Cargo.toml + package.json） |
| `rc-tree` 与 React 18 兼容性 | 中 | 如遇到问题，回退到 `react-arborist` 或自研树组件 |
| 大 prefab（1000+ 节点）渲染卡顿 | 中 | M6 阶段集成 `react-window` 虚拟滚动；如仍卡顿，延迟加载子树 |
| Rust `git` 命令在 Windows 上路径编码问题 | 中 | 所有路径统一使用绝对路径，测试 `std::process::Command` 在 Windows 上的表现 |
| `__id__` 重映射遗漏某些引用类型 | 高 | M4 阶段编写全面的单元测试覆盖所有引用场景；M3 的 Rust 校验作为最终安全网 |

---

## 预估总时间

约 **7-8 小时**（含调试和测试），分 2-3 次会话完成。

| 里程碑 | 预估时间 |
|--------|---------|
| M1 脚手架 | 30 分钟 |
| M2 Rust Git | 60 分钟 |
| M3 Rust 写入/校验 | 60 分钟 |
| M4 前端引擎 | 90 分钟 |
| M5 状态管理 | 30 分钟 |
| M6 UI 组件 | 120 分钟 |
| M7 集成测试 | 60 分钟 |
| **总计** | **约 7.5 小时** |
