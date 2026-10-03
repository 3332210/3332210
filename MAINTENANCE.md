# profile-kit

生成 <https://github.com/3332210> 主页上所有视觉资产的工具链。

主页上的每一张图都不是第三方挂件，而是**本项目自己画、自己算的 SVG**。因此它永远不会
掉图、不会出现「服务挂了显示裂图」，也不会长得像别人的主页。

> **线上状态**：仓库 [3332210/3332210](https://github.com/3332210/3332210) 已发布，
> GitHub Actions 每天自动刷新数据，有变化才提交。

---

## 还需要你做一件事（只需一次）

主页左侧的 **Name / Bio / 链接** 属于账号设置，不在仓库里。当前 token 没有 `user`
权限，所以这一步需要你自己执行——**尤其是把 `3332210` 换成你的真名或常用 ID**，
那是主页上最显眼的位置：

```powershell
# 1. 建一个带 `user` 权限的 token（勾 user 即可），然后：
$env:GITHUB_TOKEN = "你的新token"
node profile-kit/scripts/profile.mjs `
  --name "你的名字" `
  --bio "Small tools for problems everyone quietly puts up with. Windows-first, Node ≥ 20." `
  --blog "https://github.com/3332210/dsh-notify-cues"
```

顶部主视觉里的名字来自**账号名**（`lib/hero.mjs` 读 `data.stats.json` 的
`user.login`），所以设好账号 Name 后重新构建一次，图上的名字就会跟着变：

```powershell
node profile-kit/build.mjs && node profile-kit/scripts/check.mjs
node profile-kit/scripts/export-repo.mjs
node profile-kit/scripts/deploy.mjs --user 3332210
```

---

## 它由什么组成

```
README.md            主页正文（就是 github.com/3332210 显示的那一页）
tokens.mjs           设计令牌：颜色、字体、圆角、动效——唯一的真相来源
lib/primitives.mjs   共享图元（卡片、胶囊、分隔线），保证四个资产风格一致
lib/hero.mjs         顶部主视觉（终端打字动画）
lib/matrix.mjs       七种结束理由 / 六种声音 / 一种沉默
lib/project.mjs      dsh-notify-cues 项目卡（真实 stars / commits / 语言占比）
lib/contribution.mjs 近 30 天活动条 + 语言构成
build.mjs            把上面四个模块渲染成 assets/*.svg
data/stats.json      真实数据，由 API 抓取，不要手改
scripts/sync.mjs     从 GitHub API 拉真实数据写进 data/stats.json
scripts/check.mjs    机械校验：XML 合法性、rx/ry、字号下限、样式作用域……
```

## 日常使用

```bash
# 1. 拉最新真实数据（需要 token）
GITHUB_TOKEN=xxx node scripts/sync.mjs

# 2. 重新生成所有图
node build.mjs

# 3. 校验（必须是 0 error）
node scripts/check.mjs
```

仓库里的 GitHub Actions 每天会自动跑上面三步，有变化才提交。**正常情况下你什么都不用做。**

## 只想改一句话

| 想改什么 | 改哪里 |
|---|---|
| 主页正文 | `README.md` |
| 顶部主视觉上的字 | `lib/hero.mjs` |
| 配色 / 字体 / 圆角 | `tokens.mjs` |
| 卡片、胶囊的公共长相 | `lib/primitives.mjs` |
| 项目卡显示哪些数字 | `lib/project.mjs` |
| 活动条的时间窗口 | `lib/contribution.mjs` |

改完跑一遍 `node build.mjs && node scripts/check.mjs` 就生效了。

## 三条必须遵守的约定
违反这三条会让图**静默坏掉**——浏览器只渲染到出错的地方，你在编辑器里看不出来。

1. **属性值必须转义。** 用 `lib/primitives.mjs` 里的图元，别手写 `<text font-family="...">`。
   字体栈里如果有双引号，属性会被提前闭合，整个 SVG 变成非法 XML。
   `fonts` 在 `tokens.mjs` 里已经统一用单引号，别改回去。
2. **`<rect>` 写了 `rx` 就必须写 `ry`。** 只写 `rx` 时部分渲染器（含 GitHub 的图片代理）
   会画成直角。
3. **不要引入 JavaScript、外部字体、外部图片。** GitHub 会清洗掉 `<script>`，
   而且这些 SVG 是放在 `<img>` 里渲染的，脚本本来也跑不了。

`scripts/check.mjs` 会替你守住这三条（第 1 条由真正的 XML 解析器把关）。

## 深色 / 浅色是怎么处理的

每张图内部带一段 `@media (prefers-color-scheme: light)`，**自己在浏览器里跟随读者系统主题**。
所以每张图只需要引用一个文件，不需要 `#gh-dark-mode-only` 那套碎片约定——
那套是给无法自适应的 PNG 用的。

`assets/preview/` 下是强制深/浅两个变体，只用于本地截图验收，不参与发布。

## 验收方式

`scripts/check.mjs` 只能查机械规则，**查不出难看**。真正的验收是这样做的：

```bash
node scripts/preview.mjs --md README.md --out dist/preview
node _probe/shot.mjs --in dist/preview/readme-dark.html --out shot.png \
  --w 1280 --h 3000 --t 1500 --scale 1 --scheme dark
```

然后**用眼睛看这张图**。`--scheme` 必须显式传：CSS 媒体查询由浏览器偏好决定，
在浅色系统上截「暗色」图会得到一张浅色图，而你不会收到任何提示。
