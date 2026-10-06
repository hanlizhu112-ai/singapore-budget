# 我们的火花：免费同步测试版

网页：GitHub Pages。共享数据库：Supabase PostgreSQL。
访问者无需 GPT、GitHub、Supabase 或微信账号。使用随机专属链接确认自己的添柴角色。

## 当前状态

已完成网页、数据库安装脚本、权限和业务检查。
发布时 `spark-config.json` 为空表示尚未连接真实 Supabase 项目，页面仍可用于验证 GitHub Pages 的访问。
这时无法创建空间或保存添柴，不代表已经完成双方同步测试。

## 配置数据库

1. 创建新的 Supabase 免费项目，保持 Free 套餐，建议选择 Singapore。
2. 在 SQL Editor 运行 `supabase/setup.sql`。脚本只创建本应用的专用表和函数，不删除其他表。
3. 获取 Project URL 和 **Publishable key**，填入发布目录的 `spark-config.json`：

```json
{"url":"https://你的项目编号.supabase.co","publishableKey":"sb_publishable_你的公开密钥"}
```

只接受浏览器使用的 Publishable key。不要把 Secret key、service_role、数据库密码填进网页或公开仓库。

4. 由管理员生成一次性随机创建入口。在项目本地运行：

```bash
node scripts/prepare-owner.mjs https://实际项目编号.supabase.co sb_publishable_实际公开密钥
```

脚本在私有本地目录生成 `activate.sql` 和 `owner-entry.txt`。在 SQL Editor 执行 `activate.sql`，然后打开 `owner-entry.txt` 的链接。
这个目录含有创建入口，不能提交到公开仓库。创建成功后，服务器会禁用一次性创建入口。

5. 填写双方昵称，创建空间。保存“我的入口”，把“邀请对方”的入口给对方。
6. 双方各点一次“添一根柴”，两边都看到双方已添柴、连续1天才算同步通过。

## 如何测试

先验证对方用平时的手机浏览器和网络能打开测试页。再分别用手机流量、Wi-Fi 测试数据库连接。
没有绑定平台账号不代表无数据保存：昵称和添柴时间存放在你的 Supabase 项目中，管理员可查看。
专属链接相当于钥匙，请避免公开转发。服务器不接受前端指定的角色或日期。

网页可导出 JSON 火花记录。这是备份文件，当前未提供一键恢复功能。
免费 Supabase 项目可能因约一周没有数据库活动而暂停；由项目拥有者恢复。免费方案不包含平台自动备份。

## 本地开发与验证

Node.js 24 或更新版本：

```bash
npm ci
npm test
npm run build
```

构建生成 `dist/index.html`（样式和脚本均内嵌）和 `dist/spark-config.json`。
可部署在 GitHub Pages 的任意子目录，不依赖 GPT 域名、外部字体或图片服务。
每15秒仅在页面可见且在线时刷新，重新打开页面及添柴后也会读取状态。

测试包含嵌入式 PostgreSQL 的实际建表、函数执行、匿名角色权限、链接角色隔离、重复添柴、北京时间换日、漏日计数、跨房间隔离、导出与数据库重新打开后的数据保留。
本地通过不等于已经通过真实 Supabase HTTP 请求及对方网络的验证。
