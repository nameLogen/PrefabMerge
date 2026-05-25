# Cocos Creator Prefab `__id__` 规则深度分析

> 基于 `tools/ai-cli/lib/prefab.js`（2203行）和实际 `.prefab` 文件的分析

---

## 1. `__id__` 的本质

`__id__` 就是对象在 JSON 数组中的**索引位置**。不是 UUID，不是随机数，不是哈希。

```json
[
  { "__type__": "cc.Prefab", "data": { "__id__": 1 } },      // 索引 0
  { "__type__": "cc.Node", "_name": "root", ... },           // 索引 1
  { "__type__": "cc.Node", "_parent": { "__id__": 1 }, ... } // 索引 2
]
```

**绝对规则**：如果对象位于数组索引 `N`，那么所有引用它的 `{ "__id__": N }` 必须精确等于 `N`。

---

## 2. 两种引用类型

### 2.1 内部引用：`{ __id__: N }`

指向同一 prefab 数组内的另一个对象。这是**唯一**的跨对象引用方式。

识别条件（`isIdRef` 函数）：
```js
function isIdRef(value) {
  return isObject(value) 
    && Object.keys(value).length === 1 
    && typeof value.__id__ === "number";
}
```

### 2.2 外部资源引用：`{ __uuid__: "..." }`

指向项目中的外部资源文件（如 `.png`、`.plist`、`.json`）。不参与 `__id__` 体系。

---

## 3. 对象类型与引用拓扑

```
┌─────────────────────────────────────────────────────────────┐
│  cc.Prefab (索引0)                                          │
│  ├── data: {__id__: rootNodeId}  ──────→  cc.Node (根节点)  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  cc.Node                                                    │
│  ├── _parent: {__id__: parentId} → cc.Node | null           │
│  ├── _children: [{__id__: child1}, {__id__: child2}]        │
│  ├── _components: [{__id__: comp1}, {__id__: comp2}]        │
│  ├── _prefab: {__id__: prefabInfoId} → cc.PrefabInfo        │
│  └── 其他属性（_name, _active, _trs, _contentSize...）      │
└─────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│  Component      │ │  cc.PrefabInfo  │ │  cc.Node (子)   │
│  ├── node:      │ │  ├── root:      │ │  (递归结构)     │
│  │   {__id__: } │ │  │   {__id__: } │ │                 │
│  └── ...        │ │  ├── asset:     │ │                 │
│                 │ │  │   {__id__: 0}│ │                 │
│                 │ │  └── fileId,    │ │                 │
│                 │ │      sync       │ │                 │
└─────────────────┘ └─────────────────┘ └─────────────────┘
```

### 3.1 关键双向约束

| 关系 | 正向引用 | 反向引用 |
|------|---------|---------|
| 父子 | `parent._children[].__id__` → child | `child._parent.__id__` → parent |
| 节点-组件 | `node._components[].__id__` → comp | `comp.node.__id__` → node |
| 节点-PrefabInfo | `node._prefab.__id__` → info | info 无反向（通过 root 间接） |
| Prefab-根节点 | `prefab.data.__id__` → root | — |
| PrefabInfo-Prefab | `prefabInfo.asset.__id__` → 0 | — |

---

## 4. 内联值对象（无 `__id__`）

以下对象类型**不会**作为独立数组项存在，而是内联在其他对象的属性中：

- `cc.Color` — `_color`, `*Color` 属性
- `cc.Size` — `_contentSize`, `_layoutSize`, `_cellSize`
- `cc.Vec2` — `_anchorPoint`, `_fillCenter`, `*Position`
- `cc.Vec3` — `_eulerAngles`
- `cc.Rect` — 部分组件属性
- `TypedArray` — `_trs`（变换矩阵）

**重要**：这些内联对象**不**参与 `__id__` 体系，合并时无需重映射。

---

## 5. 新增/删除/复制时的 `__id__` 操作

### 5.1 新增对象（`allocate`）

```js
function allocate(data, value) {
  data.push(value);
  return data.length - 1;  // 新 ID = 当前最大索引 + 1
}
```

**规则**：新对象总是追加到数组末尾，获得当前 `length` 作为 `__id__`。

### 5.2 删除对象（`deleteNodeCommand`）

1. 收集待删除子树的所有 ID（节点 + 组件 + PrefabInfo）
2. 从父节点的 `_children` 中移除该节点引用
3. 将所有待删除对象的数组项设为 `null`
4. 调用 `cleanupDeletedRefs` 将所有 dangling 引用设为 null 或从数组移除
5. 调用 `compactPrefabData` 压缩数组，重新分配连续的 `__id__`

### 5.3 复制对象（`duplicateNodeCommand`）

这是最接近**跨 prefab 合并**的操作：

1. 收集源子树的所有 ID（DFS）
2. 为每个源对象克隆并 `allocate` 新 ID
3. 建立 `oldId → newId` 映射表
4. 对所有新对象执行 `rewriteRefs(data[newId], remap)`
5. 调整根节点的 `_parent` 和 `_name`
6. 将根节点添加到新父节点的 `_children`

```js
const idMap = new Map();
for (const oldId of subtreeIds) {
  const clone = cloneJson(data[oldId]);
  const newId = allocate(data, clone);
  idMap.set(oldId, newId);
}

const remap = new Map(idMap);
for (const [oldId, newId] of idMap.entries()) {
  data[newId] = rewriteRefs(data[newId], remap);
}
```

---

## 6. `compactPrefabData` 详解（写入前必须执行）

```js
function compactPrefabData(data) {
  const remap = new Map();
  const compact = [];
  
  // 第1轮：过滤 null，建立旧索引→新索引映射
  for (let index = 0; index < data.length; index++) {
    if (data[index] != null) {
      remap.set(index, compact.length);
      compact.push(cloneJson(data[index]));
    }
  }
  
  // 第2轮：重写所有 __id__ 引用
  return compact.map(item => rewriteRefs(item, remap));
}
```

**为什么必须 compact？**
1. Cocos Creator 读取 prefab 时期望 `__id__` 是连续有效的数组索引
2. 删除操作后数组中可能有 `null`，导致 `__id__` 不连续
3. 如果不 compact，可能导致引擎解析错误或运行时错误

**`rewriteRefs` 的行为**：
- `{ __id__: oldId }` → `{ __id__: remap.get(oldId) }`
- 如果 `oldId` 不在 remap 中（即被删除了）→ 返回 `DELETE` 符号
- 数组中的 `DELETE` 会被过滤掉
- 对象中的 `DELETE` 会被替换为 `null`

---

## 7. 跨 Prefab 合并时的 `__id__` 冲突与解决

### 7.1 冲突场景

分支 A 的 prefab：
```
[Prefab(0), Node_A_root(1), Node_A_child(2), Sprite(3), PrefabInfo(4)]
```

分支 B 的 prefab：
```
[Prefab(0), Node_B_root(1), Node_B_child(2), Label(3), PrefabInfo(4), Button(5)]
```

如果直接把分支 B 的数组项复制到分支 A，`__id__` 2、3、4 会冲突。

### 7.2 解决策略：ID 重映射 + 引用重写

**步骤**：

1. **确定源子树根节点**：在分支 B 中找到要合并的子树根节点（如 `Node_B_child`）
2. **收集源子树所有对象**：DFS 遍历，收集节点 + 组件 + PrefabInfo
3. **分配新 ID**：从目标 prefab（分支 A）的 `data.length` 开始递增分配
4. **克隆对象**：深克隆每个源对象
5. **重写内部引用**：对克隆后的对象执行 `rewriteRefs`
6. **修正外部连接**：
   - 子树根节点的 `_parent` → 指向分支 A 的目标父节点
   - 分支 A 目标父节点的 `_children` → push 子树根节点
7. **执行 compact**：调用 `compactPrefabData` 确保最终数组连续

### 7.3 特别注意：跨文件 `__uuid__` 引用

组件属性中的 `__uuid__`（如 `_spriteFrame.__uuid__`、`_N$skeletonData.__uuid__`）指向**外部资源文件**，不是 `__id__` 引用。这些 UUID 在合并时**不需要**修改（假设两个分支的资源文件一致）。

但如果分支 B 使用了分支 A 不存在的资源，Cocos Creator 会在打开 prefab 时提示缺失资源，这属于正常的跨分支资源差异问题。

---

## 8. 验证规则（最终守门人）

基于 `prefab.js` 的 `validatePrefab` 函数，写入前必须检查：

### 8.1 ID 连续性
- 压缩后数组无 `null`
- 所有 `__id__` 值在 `[0, length)` 范围内

### 8.2 无 Dangling 引用
- 所有 `{ __id__: N }` 指向的 `data[N]` 不为 `null`

### 8.3 根节点正确性
- `data[0].__type__ === "cc.Prefab"`
- `data[0].data.__id__` 指向一个 `cc.Node`

### 8.4 父子一致性
- `node._children` 中的每个 `__id__` 指向 `cc.Node`
- 子节点的 `_parent.__id__` 必须等于当前节点的索引

### 8.5 组件绑定一致性
- `node._components` 中的每个 `__id__` 指向非 Node 对象
- 组件的 `node.__id__` 必须等于当前节点的索引

### 8.6 PrefabInfo 一致性
- `node._prefab` 如果非 null，必须指向 `cc.PrefabInfo`
- `cc.PrefabInfo.root.__id__` 指向根节点
- `cc.PrefabInfo.asset.__id__` 指向 `cc.Prefab`（索引 0）

---

## 9. 对 PrefabMerge 工具的启示

### 9.1 合并算法核心

```typescript
function graftSubtree(
  targetData: PrefabArray,     // 分支 A 的 prefab 数组
  sourceData: PrefabArray,     // 分支 B 的 prefab 数组
  sourceRootId: number,        // 分支 B 中要合并的子树根节点 ID
  targetParentId: number       // 分支 A 中的目标父节点 ID
): void {
  // 1. 收集源子树所有对象
  const sourceIds = collectSubtreeIds(sourceData, sourceRootId);
  
  // 2. 分配新 ID（从 targetData.length 开始）
  const idMap = new Map<number, number>();
  for (const oldId of sourceIds) {
    const clone = deepClone(sourceData[oldId]);
    const newId = targetData.length;
    targetData.push(clone);
    idMap.set(oldId, newId);
  }
  
  // 3. 重写所有内部引用
  for (const newId of idMap.values()) {
    targetData[newId] = rewriteRefs(targetData[newId], idMap);
  }
  
  // 4. 修正根节点的父节点
  const newRootId = idMap.get(sourceRootId)!;
  targetData[newRootId]._parent = { __id__: targetParentId };
  
  // 5. 将根节点添加到目标父节点的子节点列表
  targetData[targetParentId]._children.push({ __id__: newRootId });
}
```

### 9.2 写入前必须执行的步骤

1. `compactPrefabData(data)` — 压缩并重新映射所有 `__id__`
2. `validatePrefab(data)` — 执行所有校验规则
3. 校验通过后才写入文件

### 9.3 性能考量

- 对于大型 prefab（500+ 节点），`rewriteRefs` 是 O(N) 的全量扫描
- `compactPrefabData` 也是 O(N)
- 合并操作整体是 O(N)，对于 prefab 规模来说完全可接受
