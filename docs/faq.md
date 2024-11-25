<h1 align="center">⁉️ 常见问题</h1>

1- 为什么 Fragment 配置无法连接？
- 如果你启用了 `Routing` 但 VPN 无法连接，唯一的原因是 Geo asset 未更新。进入 v2rayNG 程序菜单的 `Geo asset files` 部分，点击云图标或下载按钮进行更新。如果更新失败就无法连接。如果尝试多次仍无法更新，请从以下两个链接下载文件，然后不要点击更新，而是点击添加按钮导入这两个文件：
> 
>[geoip.dat](https://github.com/Loyalsoldier/v2ray-rules-dat/releases/latest/download/geoip.dat)
> 
>[geosite.dat](https://github.com/Loyalsoldier/v2ray-rules-dat/releases/latest/download/geosite.dat)
<br> 

2- 为什么普通配置无法连接？
- 使用这些配置时，请在你使用的任何应用程序设置中关闭 `Mux`。
<br>

3- 为什么 Nekobox 或 Hiddify Next 无法打开任何网站？
- 你需要在应用程序设置中将 `remote DNS` 设置为：
> `https://8.8.8.8/dns-query`
<br>

4- 为什么我的运营商上 Fragment 配置速度很慢？
- 每个运营商都有其特定的 Fragment 设置。大多数情况下面板默认设置就可以，但在你的运营商上这些值可能更好，需要测试：
> `Length: 10-100`
> 
> `Length: 10-20`
<br>

5- 为什么我的 Ping 值这么高？
- 千万不要使用 `https://1.1.1.1/dns-query` 作为 remote DNS，因为这会增加延迟。
<br>

6- 我按照那两个 Proxy IP 教程设置了但网站打不开！
- 这些 IP 数量很多，可能很多已经失效。你需要测试才能找到一个好用的。
<br>

7- 设置 proxy IP 时可以用但现在失效了！
- 如果使用单个 IP，一段时间后可能会失效导致很多网站无法打开。需要重新执行这些步骤。如果没有特殊需求需要固定 IP，建议保持面板默认设置，不要设置单个 Proxy IP。
<br>

8- 为什么访问 `panel/` 时报错？
- 请按照安装教程设置，KV 配置不正确。
<br>

9- 部署后 Cloudflare 报 1101 错误！
- 如果是 Worker 方式，请改用 Pages 方式部署。如果 Pages 也报错，说明你的 Cloudflare 账号已被识别，请使用正规邮箱（如 Gmail）重新注册 GitHub 和 Cloudflare 账号，优先使用 Pages 方式，同时确保项目名称中不包含 bpb 字样。
<br>

10- 我可以用它来交易吗？
- 如果你的 Cloudflare IP 是德国的（通常是这样），使用德国的单个 Proxy IP 可能没问题，但建议使用 Chain Proxy 方式来固定 IP。
<br>

11- 使用 Pages 部署后，在 GitHub 中 Sync fork 更新版本时面板版本没有更新！
- Cloudflare 每次更新时都会为该版本创建新的测试链接，这就是为什么打开项目时在 Deployment 部分会看到多个不同的链接。这些都不是你面板的主链接，你需要从页面顶部 Production 部分点击 Visit Site 来访问面板。
<br>

12- 启用了非 TLS 端口但无法连接！
- 注意，要使用非 TLS 配置，你必须只通过 Workers 方式部署，不能使用个人域名或自定义域名。
<br>

13- Best Fragment 配置为什么无法连接或显示 ping 但不工作？
- 在设置中关闭 `Prefer IPv6`。
<br>

14- 为什么 Telegram 语音通话或 Clubhouse 不工作？
- Cloudflare 无法正确建立 UDP 协议连接，目前没有有效的解决方案。
<br>

15- 为什么普通 Trojan 配置无法连接？
- 如果你想使用普通订阅连接，无论使用什么程序，都需要检查 Remote DNS 是否与面板一致，udp://1.1.1.1 或 1.1.1.1 格式与 Trojan 不兼容。以下格式适用：
- `https://8.8.8.8/dns-query`
- `tcp://8.8.8.8`
- `tls://8.8.8.8`
 - 建议使用 Full Normal 或 Fragment 订阅，因为它们包含所有设置。
<br>

16- 为什么 ChatGPT 打不开？
- 因为面板默认的 Proxy IP 是公共的，可能很多对 ChatGPT 来说都很可疑。你需要从以下链接中测试并选择一个适合你的 IP：
> https://www.nslookup.io/domains/bpb.yousef.isegaro.com/dns-records/
<br>

17- 忘记面板密码怎么办？
- 进入 Cloudflare 控制面板，找到你为 Worker 或 Pages 创建的 KV，点击 view，进入 KV Pairs 部分，在表格中找到 pwd，对应的值就是你的密码。
<br>

18- 如果不更改 UUID 和 Trojan 密码会怎样？
- 其他人可能会访问到你的代理，存在安全风险，因此建议按照教程简单地更改它们。