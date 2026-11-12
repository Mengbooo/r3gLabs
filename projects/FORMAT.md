# 独立项目约定

这里是**唯一的项目源目录**，不是 iframe URL 或打包产物的副本。每个项目用一个小写英文短横线文件夹划分：

```text
projects/
├── README.md
└── my-project/
    ├── project.json           # 标题、分类、年份、封面等元数据
    ├── index.html             # 必须：完整、可独立打开的 HTML 入口
    ├── cover/                 # 可选：仅存放展示页使用的封面图片
    │   └── main.webp
    └── assets/                # 可选：详情自身的 CSS、JS、图片、视频等
        ├── styles.css
        └── app.js
```

## 1. 元数据

```json
{
  "title": "My project",
  "category": "Front-end",
  "year": 2026,
  "description": "A short description.",
  "cover": "cover/main.webp",
  "order": 10,
  "published": true
}
```

- 必填：`title`、`category`、`year`、`description`。分类列表和数量由已发布项目自动生成。
- `cover` 是相对项目目录的路径，**必须在该项目的 `cover/` 中**，支持 SVG / PNG / JPEG / WebP / AVIF；可省略或写 `null`，展示页会生成文字封面。
- 一个 `cover/` 可放多张图；当前展示页只读取 `cover` 指定的一张，不自动轮播。
- 展示页会循环重复当前项目顺序，凑足至少 24 张卡片和 3 个完整周期；只有一个项目时重复一个，两个时交替重复。重复仅发生在视觉层，列表、分类数量和独立详情仍各自只有真实的一份；分类筛选后同样循环。
- `order` 越小越靠前，默认 `0`；相同时按文件夹名排序。
- `published: false` 为草稿，不进入展示页，也不导出该项目的静态文件。
- 入口固定为 `index.html`，不需要另填 URL。文件夹名只允许小写字母、数字和短横线。

## 2. 独立 HTML

必须编写完整文档，声明语言、编码、移动端视口和标题。例如：

```html
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>My project — r3g Labs</title>
  <link rel="stylesheet" href="./assets/styles.css">
  <script src="/project-embed.js" defer></script>
</head>
<body>
  <main>自己的 HTML 内容</main>
  <script src="./assets/app.js" defer></script>
</body>
</html>
```

- 详情内部的资源使用 `./assets/…`、`./cover/…` 等相对路径；网站级资源使用 `/…`。
- 展示页地址自动为 `/projects/my-project/index.html`，封面地址自动为 `/projects/my-project/cover/main.webp`。
- HTML 放入独立 iframe。CSS 不污染 Labs，Labs 的 CSS 也不影响项目。
- iframe 高度固定为详情可视区域；**滚动由项目 HTML 自己负责**，外层不再套一层滚动，不需要不断向父页面上报高度。
- `/project-embed.js` 是可选桥接脚本：在 iframe 内按 Esc 也能返回。它不读取父页面 DOM，也不控制项目布局。没有这个脚本，外层圆环返回按钮照常可用。
- 不使用 `window.parent.document`，不要接管父页面 URL 或导航。退出等协议通过受控 `postMessage` 交互，外层校验消息来源和每次加载的随机标识。

## 3. 发布和安全边界

- Astro 从源目录读取，开发时可直接访问，构建时把允许的静态资源输出到 `dist/projects/…`；**不要手动复制到 `public/projects/`**。
- 本目录中的网页、样式、脚本、数据、图像和音视频都是可公开资源，不要放密钥、服务端代码或私人数据。
- `project.json`、Markdown、点文件、`node_modules` 和符号链接不会作为公共资源导出。
- iframe 默认只有脚本、表单和弹窗权限，**不授予同源父页面访问权限**。本地存储、需要同源权限的 SDK 或网络请求，可能需要针对项目另行设计，不要直接放宽所有项目的沙箱。
- 在沙箱中运行 ES modules / 本地字体等跨源资源需要 CORS。开发端项目资源已配置允许公开跨域读取；示例 `vercel.json` 同步声明了项目资源及公共桥接文件的 CORS 头。换部署平台时要照此设置。
- 构建会校验 JSON、入口和封面存在性。运行时加载失败会显示重试 / 独立打开链接，返回导航不会失效。

## 4. 新增项目

1. 复制 `wip/` 为新的文件夹。
2. 修改自己的 `project.json`、`index.html`，将封面放入自己的 `cover/`。
3. `npm run dev` 预览；`npm run build` 校验并导出。
4. 不必修改导航、列表、分类统计或展示页业务脚本。
