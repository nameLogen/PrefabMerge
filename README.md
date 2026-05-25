# Prefab Merge Tool

一个用于 Cocos Creator `.prefab` 文件差异对比与合并的桌面工具，基于 Tauri 2 + React 构建。

## 功能

- **冲突解决**：解析 Git 冲突标记的三路合并（base / ours / theirs）
- **差异预览**：任意两个 Git 分支或本地工作区之间的 prefab 对比
- **属性级决策**：支持节点级和属性级的细粒度决策
- **自动备份**：每次应用合并前自动备份原文件
- **历史记录**：查看每次合并操作，支持按次撤销

## 系统要求

- Windows 10+ / macOS 11+
- Git 2.33+

## 使用方式

1. 启动应用，选择 Git 仓库路径
2. 选择模式：
   - **冲突解决**：自动检测当前 Git 冲突的 `.prefab` 文件
   - **差异预览**：选择两个分支（或本地工作区）进行对比
3. 选择文件后，在左右树形面板中查看差异
4. 点击 `[←]` 保留左侧、`[→]` 保留右侧进行决策
5. 点击「应用合并」写入文件

## 开发

```bash
# 安装依赖
npm install

# 开发模式
npm run tauri dev

# 构建
npm run tauri build
```

## 打包发布

推送以 `v` 开头的 tag 会自动触发 GitHub Actions 打包：

```bash
git tag v0.1.0
git push origin v0.1.0
```

产物：Windows `.exe` + macOS `.dmg`
<img width="1928" height="1015" alt="image" src="https://github.com/user-attachments/assets/235937c3-b83f-4161-b08a-8969aa476e87" />

