# PrefabMerge 设计文档

## 1. 项目概述

**PrefabMerge** 是一个基于 Tauri2 + React 的 Cocos Creator Prefab 可视化合并工具。

**核心能力**：
- 冲突解决模式：自动检测 Git 合并冲突中的 `.prefab` 文件，左右分栏对比，交互式决策保留哪方
- 差异预览模式：选择任意两个 Git 分支，预览所有 `.prefab` 的差异，**可切换显示 Base（共同祖先）版本**
- 结构完整性保证：Rust 后端在写入前执行强制性校验，确保输出的 prefab 符合 Cocos Creator 规范
- **撤销支持**：每次写入前自动备份，支持一键撤销到合并前状态

**项目目录**：`G:\Agents\PrefabMerge`

---

## 2. 技术栈

| 层级 | 技术 |
|------|------|
| 桌面框架 | Tauri 2.x（Rust） |
| 前端框架 | React 18 + TypeScript |
| 构建工具 | Vite |
| 状态管理 | Zustand |
| 样式 | Tailwind CSS |
| 树形组件 | rc-tree 或 react-arborist |
| 图标 | Lucide React |

---

## 3. 项目文件结构

```
PrefabMerge/
├── src/                          # 前端源码
│   ├── App.tsx                   # 主应用入口
│   ├── main.tsx                  # React 渲染入口
│   ├── store/
│   │   └── prefabStore.ts        # Zustand 状态管理
│   ├── components/
│   │   ├── Toolbar.tsx           # 顶部工具栏（仓库路径、分支选择、文件列表）
│   │   ├── DiffPanel.tsx         # 左右分栏对比主面板
│   │   ├── NodeTree.tsx          # 节点树组件（单栏）
│   │   ├── PropertyDiff.tsx      # 属性差异表格
│   │   ├── DecisionBar.tsx       # 节点级决策按钮（← →）
│   │   ├── FilterToggle.tsx      # 过滤开关（只看差异）
│   │   └── BasePanel.tsx         # Base 版本面板（差异预览模式下可切换显示）
│   ├── prefab/                   # Prefab 引擎（TypeScript 独立实现）
│   │   ├── parser.ts             # Prefab JSON → 节点树
│   │   ├── diff.ts               # 节点树差异计算
│   │   ├── merger.ts             # 合并决策执行（含 __id__ 重映射）
│   │   ├── id-rules.ts           # __id__ 分配与重映射核心逻辑
│   │   └── types.ts              # Prefab 相关类型定义
│   └── git/                      # Git 操作封装
│       └── api.ts                # Tauri invoke 调用层
├── src-tauri/                    # Tauri Rust 后端
│   ├── src/
│   │   ├── main.rs               # 程序入口
│   │   ├── commands/
│   │   │   ├── git.rs            # Git 相关命令
│   │   │   └── prefab.rs         # Prefab 写入、校验、备份、撤销
│   │   ├── validators/
│   │   │   └── prefab_validator.rs # Prefab 结构完整性校验
│   │   └── models.rs             # Rust 数据结构
│   └── Cargo.toml
├── docs/design/                  # 设计文档
└── package.json
```

---

## 4. Rust 后端接口契约（Tauri Commands）

### 4.1 Git 相关

```rust
/// 检测当前仓库是否有正在进行的合并，返回冲突的 .prefab 文件列表
#[tauri::command]
fn list_conflict_files(repo_path: String) -> Result<Vec<String>, String>;

/// 获取指定 prefab 的三方版本（base / ours / theirs）
/// 注：base 版本在冲突解决模式下不显示，仅在差异预览模式下可通过开关查看
#[tauri::command]
fn get_prefab_three_way(
    repo_path: String,
    file_path: String,
) -> Result<PrefabThreeWay, String>;

/// 列出仓库所有分支
#[tauri::command]
fn list_branches(repo_path: String) -> Result<Vec<String>, String>;

/// 对比两个分支，返回所有有差异的 .prefab 文件列表
#[tauri::command]
fn diff_branches(
    repo_path: String,
    left_branch: String,
    right_branch: String,
) -> Result<Vec<DiffFileInfo>, String>;

/// 获取指定分支上指定 prefab 的原始 JSON 内容
#[tauri::command]
fn get_prefab_from_branch(
    repo_path: String,
    branch: String,
    file_path: String,
) -> Result<String, String>;
```

### 4.2 Prefab 写入、备份与撤销

```rust
/// 校验并写入 prefab 文件（核心安全函数）
/// 写入前自动备份原文件到 .prefabmerge_backups/
#[tauri::command]
fn write_prefab(
    repo_path: String,
    file_path: String,
    json_data: String,
) -> Result<WriteResult, PrefabValidationError>;

/// 列出指定 prefab 的所有备份
#[tauri::command]
fn list_backups(repo_path: String, file_path: String) -> Result<Vec<BackupInfo>, String>;

/// 撤销到指定备份（恢复备份文件并删除更新的备份）
#[tauri::command]
fn restore_backup(
    repo_path: String,
    file_path: String,
    backup_timestamp: String,
) -> Result<(), String>;
```

**`WriteResult` 结构**：
```rust
struct WriteResult {
    success: bool,
    backup_path: String,       // 备份文件路径
    backup_timestamp: String,  // 备份时间戳
}
```

**`PrefabValidationError` 结构**：
```rust
struct PrefabValidationError {
    code: String,           // INVALID_ID_RANGE / DANGLING_REF / ROOT_MISMATCH / PARENT_MISMATCH
    message: String,
    details: Vec<String>,
}
```

**`BackupInfo` 结构**：
```rust
struct BackupInfo {
    timestamp: String,     // ISO 格式时间戳
    path: String,          // 备份文件绝对路径
    size: u64,             // 文件大小（字节）
}
```

---

## 5. 前端核心数据结构

### 5.1 Prefab 节点树

```typescript
interface PrefabNode {
  id: number;                    // 在 JSON 数组中的索引（__id__）
  path: string;                  // 完整路径，如 "MainPre/main/left/bg"
  name: string;
  active: boolean;
  children: PrefabNode[];
  components: PrefabComponent[];
}

interface PrefabComponent {
  id: number;
  type: string;
  scriptClass?: string;
  properties: Record<string, unknown>;
}
```

### 5.2 差异结果

```typescript
type DiffType = 'same' | 'added' | 'removed' | 'modified';

interface NodeDiff {
  path: string;
  diffType: DiffType;
  leftNode?: PrefabNode;
  rightNode?: PrefabNode;
  propertyDiffs: PropertyDiff[];
  children: NodeDiff[];
}

interface PropertyDiff {
  key: string;                   // 属性名，如 "_contentSize.width" 或 "_components[0]._spriteFrame"
  diffType: DiffType;
  leftValue?: unknown;
  rightValue?: unknown;
}
```

### 5.3 用户决策（节点级 + 属性级分离）

```typescript
type DecisionType = 'left' | 'right';

// 节点级决策：整棵子树保留左/右
interface NodeDecision {
  path: string;                  // 节点路径
  type: DecisionType;
}

// 属性级决策：单个属性保留左/右
interface PropertyDecision {
  nodePath: string;              // 所属节点路径
  propertyKey: string;           // 属性 key，如 "_contentSize.width"
  type: DecisionType;
}

// 存储在 Zustand 中的决策状态
interface DecisionState {
  nodeDecisions: Map<string, NodeDecision>;       // key = path
  propertyDecisions: Map<string, PropertyDecision>; // key = `${nodePath}#${propertyKey}`
}
```

---

## 6. 差异算法策略

### 6.1 节点树 Diff

1. **建立路径映射**：对左右两棵节点树分别 DFS，建立 `Map<path, PrefabNode>`
2. **路径对齐对比**：
   - 路径只在左存在 → `diffType: 'removed'`
   - 路径只在右存在 → `diffType: 'added'`
   - 路径两边都存在 → 进入属性对比
3. **属性递归对比**：
   - 排除忽略字段：`__type__`, `node`, `_name`, `_objFlags`, `_id`, `_enabled`
   - 对剩余属性深度对比
   - `__id__` 引用类型值 → 转换为路径后再对比
4. **差异传播**：父节点是 `added`/`removed` 时，子节点作为子树整体处理

### 6.2 "只看差异"过滤

- 节点级：只显示 `diffType !== 'same'` 的节点
- 属性级：在 `modified` 节点中，只显示 `diffType !== 'same'` 的属性

---

## 7. UI 布局设计

### 7.1 整体布局

```
┌─────────────────────────────────────────────────────────────────────────┐
│ [Toolbar] 仓库: G:\...\GameWord  模式: [冲突解决 ▼]                      │
│          文件: [MainPre.prefab ▼]  [只看差异 ☑]  [显示 Base □]          │
├───────────────────┬──────────────┬───────────────────┬──────────────────┤
│ 左分支 (ours)     │ 决策栏       │ 右分支 (theirs)   │ Base (ancestor)  │
│                   │              │                   │ （差异预览模式） │
│ ▼ MainPre         │  ← →         │ ▼ MainPre         │ ▼ MainPre        │
│   ▼ main          │  ← →         │   ▼ main          │   ▼ main         │
│     🟡 left       │ [←] [→]      │     🟢 left       │     🟢 left      │
│       🆕 bg       │ [←] [→]      │       🟢 bg       │       🟢 bg      │
│       🆕 qq       │ [←] [→]      │       🟢 qq       │       ❌ qq      │
│     🟢 right      │ [←] [→]      │     🟡 right      │     🟢 right     │
├───────────────────┴──────────────┴───────────────────┴──────────────────┤
│ [PropertyDiff] 选中节点: MainPre/main/left/bg                            │
│ ┌───────────────┬─────────────────┬─────────────────┬──────────────────┐│
│ │ 属性          │ 左值            │ 右值            │ 操作             ││
│ ├───────────────┼─────────────────┼─────────────────┼──────────────────┤│
│ │ _contentSize  │ {w:100,h:100}   │ {w:128,h:128}   │ [←保留左][→保留右]││
│ │ _spriteFrame  │ uuid-a          │ uuid-b          │ [←保留左][→保留右]││
│ └───────────────┴─────────────────┴─────────────────┴──────────────────┘│
├─────────────────────────────────────────────────────────────────────────┤
│ [底部状态栏] 冲突节点: 25 | 已决策: 18/25 | [应用合并] [撤销]            │
└─────────────────────────────────────────────────────────────────────────┘
```

### 7.2 颜色与图标规范

| 状态 | 图标 | 颜色 |
|------|------|------|
| 相同 (`same`) | 🟢 | 灰色（默认展开） |
| 修改 (`modified`) | 🟡 | 黄色高亮 |
| 新增 (`added`) | 🆕 | 绿色高亮 |
| 删除 (`removed`) | ❌ | 红色高亮 |
| 已决策（保留左） | ⬅️ | 蓝色边框 |
| 已决策（保留右） | ➡️ | 蓝色边框 |

### 7.3 交互流程

1. **冲突解决模式**：
   - 启动 → 检测 Git 仓库 → 获取冲突 `.prefab` 列表 → 默认选中第一个
   - 用户浏览节点树 → 点击节点旁的 `[←]` 或 `[→]` 做**节点级决策**
   - 点击下方 PropertyDiff 表格中的 `[←保留左]` 或 `[→保留右]` 做**属性级决策**
   - 底部状态栏实时显示进度 → 全部决策完成后 `[应用合并]` 可用
   - 点击 `[应用合并]` → 前端组装合并后 prefab → 调用 `write_prefab` → 自动备份 → 校验通过 → 覆盖原文件
   - 如后悔，点击 `[撤销]` → 调用 `restore_backup` → 恢复到合并前状态

2. **差异预览模式**：
   - 手动选择左分支和右分支 → 列出差异 `.prefab`
   - 勾选 `[显示 Base]` → 右侧出现 Base 面板，显示共同祖先版本
   - 可浏览差异但不提供 `[应用合并]`（只读预览）

---

## 8. `__id__` 合并规则（核心难点）

> 详见 [`__id__-rules-analysis.md`](./__id__-rules-analysis.md)

**核心原则**：
- `__id__` = JSON 数组索引，必须连续
- 跨分支合并子树时，必须对源分支子树执行 **ID 重映射 + 引用重写**
- 写入前必须执行 `compactPrefabData` 压缩数组

**合并算法步骤**：
1. 收集源分支（保留方）子树所有对象（节点 + 组件 + PrefabInfo）
2. 从目标 prefab 数组 `length` 开始分配新 `__id__`
3. 深克隆所有对象，用 `rewriteRefs` 重写内部引用
4. 修正根节点的 `_parent` 指向目标父节点
5. 将根节点添加到目标父节点的 `_children`
6. 执行 `compactPrefabData` 确保数组连续
7. 执行 `validatePrefab` 校验所有规则
8. 校验通过 → 备份原文件 → 写入新文件

---

## 9. Rust 完整性校验规则（最终守门人）

`write_prefab` 在写入前必须执行以下校验，任一失败则拒绝写入：

### 9.1 ID 范围检查
- 遍历 JSON 数组，所有非 `null` 项必须具有连续的索引 `0..N-1`
- `compactPrefabData` 确保此规则

### 9.2 引用有效性检查（无 Dangling 引用）
- 扫描所有对象的 `__id__` 引用字段
- 每个 `__id__` 值必须在 `[0, data.length)` 范围内
- 每个 `__id__` 指向的位置不能为 `null`

### 9.3 根节点检查
- `data[0].__type__ === "cc.Prefab"`
- `data[0].data.__id__` 必须存在且指向一个 `__type__ === "cc.Node"` 的对象

### 9.4 节点引用闭环检查
- `cc.Node._children` 中每个 `__id__` 必须指向 `cc.Node`
- `cc.Node._components` 中每个 `__id__` 必须指向非 Node 的对象（组件或脚本）
- `cc.Node._prefab` 如果非 null，必须指向 `cc.PrefabInfo`

### 9.5 父节点双向一致性检查
- 对于每个 `cc.Node`，如果其 `_parent` 为 `null`，则它必须是根节点
- 如果 `_parent` 非 null，则父节点的 `_children` 数组中必须包含该节点的 `__id__`

### 9.6 组件反向绑定检查
- 每个组件对象必须有 `node` 字段，且指向一个有效的 `cc.Node`
- 该 `cc.Node` 的 `_components` 中必须包含该组件的 `__id__`

---

## 10. 备份与撤销设计

### 10.1 备份策略

- 备份目录：`<repo_path>/.prefabmerge_backups/<file_relative_path>/`
- 备份文件名：`<ISO-timestamp>.prefab`
- 每次 `write_prefab` 调用时，如原文件存在，先复制到备份目录
- 保留最近 **20 次**备份，超出自动删除最旧的

### 10.2 撤销流程

1. 用户点击 `[撤销]` 按钮
2. 前端调用 `restore_backup(file_path, latest_timestamp)`
3. Rust 将备份文件复制回原路径
4. 删除该备份及之后的所有备份（防止重复撤销）
5. UI 刷新，显示已撤销状态

---

## 11. 状态管理设计（Zustand）

```typescript
interface PrefabStore {
  // 仓库与模式
  repoPath: string;
  mode: 'conflict' | 'preview';

  // Git 数据
  conflictFiles: string[];
  branches: string[];
  selectedFile: string | null;
  leftBranch: string;
  rightBranch: string;

  // Prefab 三方数据
  baseTree: PrefabNode | null;
  leftTree: PrefabNode | null;
  rightTree: PrefabNode | null;

  // 差异与决策
  diffTree: NodeDiff | null;
  nodeDecisions: Map<string, NodeDecision>;
  propertyDecisions: Map<string, PropertyDecision>;
  showOnlyDiffs: boolean;
  showBasePanel: boolean;        // 差异预览模式下是否显示 Base

  // 计算属性
  getDecision: (path: string) => NodeDecision | undefined;
  getPropertyDecision: (nodePath: string, key: string) => PropertyDecision | undefined;
  getConflictCount: () => number;
  getResolvedCount: () => number;
  isAllResolved: () => boolean;

  // Actions
  loadRepo: (path: string) => Promise<void>;
  loadConflictFiles: () => Promise<void>;
  selectFile: (file: string) => Promise<void>;
  setMode: (mode: 'conflict' | 'preview') => void;
  setBranches: (left: string, right: string) => Promise<void>;
  setNodeDecision: (path: string, type: DecisionType) => void;
  setPropertyDecision: (nodePath: string, key: string, type: DecisionType) => void;
  applyMerge: () => Promise<void>;
  undoMerge: () => Promise<void>;
  toggleShowOnlyDiffs: () => void;
  toggleShowBasePanel: () => void;
}
```

---

## 12. 关键实现注意事项

### 12.1 Prefab 解析引擎独立性
- 必须完整复制当前项目的 prefab 解析逻辑到 `src/prefab/parser.ts`
- 不通过 `npm link` 或文件引用依赖原项目
- 核心函数：`readPrefab(json)` → `buildContext(data)` → `buildTree(rootId)`

### 12.2 `__id__` 引用语义化
- 差异对比时，不比较原始 `__id__` 数字，而是比较其指向的**对象类型和路径**
- 例如：`{__id__: 5}` 在左分支指向 `"MainPre/main/left"`，在右分支也指向 `"MainPre/main/left"` → 视为相同

### 12.3 大文件性能
- 对于超过 500 个节点的 prefab，树形组件需要虚拟滚动（`react-window`）
- 差异计算使用 Web Worker，避免阻塞 UI

### 12.4 Git 工作区安全
- `write_prefab` 只在确认目标文件是 `.prefab` 后缀时才写入
- 写入前自动备份，支持撤销
- 备份保留 20 次，防止磁盘膨胀

---

## 13. 后续迭代方向（V2）

1. **场景文件（.fire）支持**：同样的合并逻辑扩展至 Cocos Creator 场景文件
2. **三路合并算法**：基于 Base 的智能合并（自动判断 ours/theirs 哪方修改了）
3. **批量决策**：支持正则匹配批量决策（如 "所有 `zjm_icon_*` 节点保留右分支"）
4. **合并历史**：保存每次合并的决策记录，支持回放和复用
