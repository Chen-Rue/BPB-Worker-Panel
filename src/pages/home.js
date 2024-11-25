import { initializeParams, userID, hostName, origin, defaultHttpPorts, defaultHttpsPorts, panelVersion } from "../helpers/init";

// 渲染主页面
// request: 请求对象
// env: 环境变量
// proxySettings: 代理设置
// isPassSet: 是否设置了密码
export async function renderHomePage(request, env, proxySettings, isPassSet) {
    // 初始化基本参数
    await initializeParams(request, env);
    
    // 从代理设置中解构需要的参数
    const {
        remoteDNS,          // 远程 DNS 服务器
        localDNS,           // 本地 DNS 服务器
        vlessTrojanFakeDNS, // VLESS/Trojan 伪装 DNS
        proxyIP,            // 代理 IP
        outProxy,           // 外部代理开关
        cleanIPs,           // 清洁 IP 列表
        enableIPv6,         // IPv6 开关
        customCdnAddrs,     // 自定义 CDN 地址
        customCdnHost,      // 自定义 CDN 主机名
        customCdnSni,       // 自定义 CDN SNI
        bestVLESSTrojanInterval, // VLESS/Trojan 最佳延迟探测间隔
        vlessConfigs,       // VLESS 配置开关
        trojanConfigs,      // Trojan 配置开关
        ports,              // 端口列表
        lengthMin,          // 分片最小长度
        lengthMax,          // 分片最大长度
        intervalMin,        // 分片最小间隔
        intervalMax,        // 分片最大间隔
        fragmentPackets,    // 分片包类型
        warpEndpoints,      // WARP 端点列表
        warpFakeDNS,        // WARP 伪装 DNS
        warpEnableIPv6,     // WARP IPv6 开关
        warpPlusLicense,    // WARP+ 许可证
        bestWarpInterval,   // WARP 最佳延迟探测间隔
        hiddifyNoiseMode,   // Hiddify 噪声模式
        nikaNGNoiseMode,    // NikaNg 噪声模式
        noiseCountMin,      // 噪声数量最小值
        noiseCountMax,      // 噪声数量最大值
        noiseSizeMin,       // 噪声大小最小值
        noiseSizeMax,       // 噪声大小最大值
        noiseDelayMin,      // 噪声延迟最小值
        noiseDelayMax,      // 噪声延迟最大值
        bypassLAN,          // 绕过局域网
        bypassIran,         // 绕过伊朗
        bypassChina,        // 绕过中国
        bypassRussia,       // 绕过俄罗斯
        blockAds,           // 拦截广告
        blockPorn,          // 拦截色情网站
        blockUDP443,        // 拦截 UDP 443 端口
        customBypassRules,  // 自定义绕过规则
        customBlockRules    // 自定义拦截规则
    } = proxySettings;

    // 检查是否启用了 WARP+
    const isWarpPlus = warpPlusLicense ? true : false;
    
    // 计算启用的协议数量
    const activeProtocols = (vlessConfigs ? 1 : 0) + (trojanConfigs ? 1 : 0);
    
    // 初始化端口块 HTML
    let httpPortsBlock = '', httpsPortsBlock = '';
    
    // 获取所有可用端口
    const allPorts = [...(hostName.includes('workers.dev') ? defaultHttpPorts : []), ...defaultHttpsPorts];
    
    // 初始化区域名称显示
    const regionNames = new Intl.DisplayNames(['en'], {type: 'region'});
    const countryCode = request.cf.country;
    
    // 生成国家旗帜表情
    const flag = String.fromCodePoint(...[...countryCode].map(c => 0x1F1E6 + c.charCodeAt(0) - 65));
    const cfCountry = `${regionNames.of(countryCode)} ${flag}`;

    // 生成端口选择框 HTML
    allPorts.forEach(port => {
        const id = `port-${port}`;
        const isChecked = ports.includes(port) ? 'checked' : '';
        const portBlock = `
            <div class="routing" style="grid-template-columns: 1fr 2fr; margin-right: 10px;">
                <input type="checkbox" id=${id} name=${port} onchange="handlePortChange(event)" value="true" ${isChecked}>
                <label style="margin-bottom: 3px;" for=${id}>${port}</label>
            </div>`;
        defaultHttpsPorts.includes(port) ? httpsPortsBlock += portBlock : httpPortsBlock += portBlock;
    });

    // 生成支持的应用列表 HTML
    const supportedApps = apps => apps.map(app => `
        <div>
            <span class="material-symbols-outlined symbol">verified</span>
            <span>${app}</span>
        </div>`).join('');
    
    // 生成订阅二维码按钮 HTML
    const subQR = (path, app, tag, title, sbType) => {
        const url = `${sbType ? 'sing-box://import-remote-profile?url=' : ''}https://${hostName}/${path}/${userID}${app ? `?app=${app}` : ''}#${tag}`;
        return `
            <button onclick="openQR('${url}', '${title}')" style="margin-bottom: 8px;">
                QR Code&nbsp;<span class="material-symbols-outlined">qr_code</span>
            </button>`;
    };
    
    // 生成订阅链接按钮 HTML
    const subURL = (path, app, tag) => {
        const url = `https://${hostName}/${path}/${userID}${app ? `?app=${app}` : ''}#${tag}`;
        return `
            <button onclick="copyToClipboard('${url}')">
                Copy Sub<span class="material-symbols-outlined">format_list_bulleted</span>
            </button>`;
    }

    const homePage = `
    <!DOCTYPE html>
    <html lang="zh">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta name="timestamp" content=${Date.now()}>
        <title>BPB 面板 ${panelVersion}</title>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.min.css">
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" />
        <title>可折叠部分</title>
        <style>
            :root {
                --color: black;
                --primary-color: #09639f;
                --secondary-color: #3498db;
                --header-color: #09639f; 
                --background-color: #fff;
                --form-background-color: #f9f9f9;
                --table-active-color: #f2f2f2;
                --hr-text-color: #3b3b3b;
                --lable-text-color: #333;
                --border-color: #ddd;
                --button-color: #09639f;
                --input-background-color: white;
                --header-shadow: 2px 2px 4px rgba(0, 0, 0, 0.25);
            }
            body { font-family: Twemoji Country Flags, system-ui; background-color: var(--background-color); color: var(--color) }
            body.dark-mode {
                --color: white;
                --primary-color: #09639F;
                --secondary-color: #3498DB;
                --header-color: #3498DB; 
                --background-color: #121212;
                --form-background-color: #121212;
                --table-active-color: #252525;
                --hr-text-color: #D5D5D5;
                --lable-text-color: #DFDFDF;
                --border-color: #353535;
                --button-color: #3498DB;
                --input-background-color: #252525;
                --header-shadow: 2px 2px 4px rgba(255, 255, 255, 0.25);
            }
            .material-symbols-outlined {
                margin-left: 5px;
                font-variation-settings:
                'FILL' 0,
                'wght' 400,
                'GRAD' 0,
                'opsz' 24
            }
            details { border-bottom: 1px solid var(--border-color); }
            summary {
                font-weight: bold;
                cursor: pointer;
                text-align: center;
                text-wrap: nowrap;
            }
            summary::marker { font-size: 1.5rem; color: var(--secondary-color); }
            summary h2 { display: inline-flex; }
            h1 { font-size: 2.5em; text-align: center; color: var(--header-color); text-shadow: var(--header-shadow); }
            h2,h3 { margin: 30px 0; text-align: center; color: var(--hr-text-color); }
            hr { border: 1px solid var(--border-color); margin: 20px 0; }
            .footer {
                display: flex;
                font-weight: 600;
                margin: 10px auto 0 auto;
                justify-content: center;
                align-items: center;
            }
            .footer button {margin: 0 20px; background: #212121; max-width: fit-content;}
            .footer button:hover, .footer button:focus { background: #3b3b3b;}
            .form-control a, a.link { text-decoration: none; }
            .form-control {
                margin-bottom: 20px;
                font-family: Arial, sans-serif;
                display: flex;
                flex-direction: column;
            }
            .form-control button {
                background-color: var(--form-background-color);
                font-size: 1.1rem;
                font-weight: 600;
                color: var(--button-color);
                border-color: var(--primary-color);
                border: 1px solid;
            }
            #apply {display: block; margin-top: 20px;}
            input.button {font-weight: 600; padding: 15px 0; font-size: 1.1rem;}
            label {
                display: block;
                margin-bottom: 5px;
                font-size: 110%;
                font-weight: 600;
                color: var(--lable-text-color);
            }
            input[type="text"],
            input[type="number"],
            input[type="url"],
            textarea,
            select {
                width: 100%;
                text-align: center;
                padding: 10px;
                border: 1px solid var(--border-color);
                border-radius: 5px;
                font-size: 16px;
                color: var(--lable-text-color);
                background-color: var(--input-background-color);
                box-sizing: border-box;
                transition: border-color 0.3s ease;
            }	
            input[type="text"]:focus,
            input[type="number"]:focus,
            input[type="url"]:focus,
            textarea:focus,
            select:focus { border-color: var(--secondary-color); outline: none; }
            .button,
            table button {
                display: flex;
                align-items: center;
                justify-content: center;
                width: 100%;
                white-space: nowrap;
                padding: 10px 15px;
                font-size: 16px;
                font-weight: 600;
                letter-spacing: 1px;
                border: none;
                border-radius: 5px;
                color: white;
                background-color: var(--primary-color);
                cursor: pointer;
                outline: none;
                box-shadow: 0 5px 10px rgba(0, 0, 0, 0.2);
                transition: all 0.3s ease;
            }
            input[type="checkbox"] { 
                background-color: var(--input-background-color);
                style="margin: 0; 
                grid-column: 2;"
            }
            table button { margin: auto; width: auto; }
            .button.disabled {
                background-color: #ccc;
                cursor: not-allowed;
                box-shadow: none;
                pointer-events: none;
            }
            .button:hover,
            table button:hover,
            table button:focus {
                background-color: #2980b9;
                box-shadow: 0 8px 15px rgba(0, 0, 0, 0.3);
                transform: translateY(-2px);
            }
            .header-container button:hover {
                transform: scale(1.1);
            }
            button.button:hover { color: white; }
            .button:active,
            table button:active { transform: translateY(1px); box-shadow: 0 3px 7px rgba(0, 0, 0, 0.3); }
            .form-container {
                max-width: 90%;
                margin: 0 auto;
                padding: 20px;
                background: var(--form-background-color);
                border: 1px solid var(--border-color);
                border-radius: 10px;
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
                margin-bottom: 100px;
            }
            .table-container { margin-top: 20px; overflow-x: auto; }
            table { 
                width: 100%;
                border: 1px solid var(--border-color);
                border-collapse: separate;
                border-spacing: 0; 
                border-radius: 10px;
                margin-bottom: 20px;
                overflow: hidden;
            }
            th, td { padding: 10px; border-bottom: 1px solid var(--border-color); }
            td div { display: flex; align-items: center; }
            th { background-color: var(--secondary-color); color: white; font-weight: bold; font-size: 1.1rem; width: 50%;}
            td:last-child { background-color: var(--table-active-color); }               
            tr:hover { background-color: var(--table-active-color); }
            .modal {
                display: none;
                position: fixed;
                z-index: 1;
                left: 0;
                top: 0;
                width: 100%;
                height: 100%;
                overflow: auto;
                background-color: rgba(0, 0, 0, 0.4);
            }
            .modal-content {
                background-color: var(--form-background-color);
                margin: auto;
                padding: 10px 20px 20px;
                border: 1px solid var(--border-color);
                border-radius: 10px;
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
                width: 80%;
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
            }
            .close { color: var(--color); float: right; font-size: 28px; font-weight: bold; }
            .close:hover,
            .close:focus { color: black; text-decoration: none; cursor: pointer; }
            .form-control label {
                display: block;
                margin-bottom: 8px;
                font-size: 110%;
                font-weight: 600;
                color: var(--lable-text-color);
                line-height: 1.3em;
            }
            .form-control input[type="password"] {
                width: 100%;
                padding: 10px;
                border: 1px solid var(--border-color);
                border-radius: 5px;
                font-size: 16px;
                color: var(--lable-text-color);
                background-color: var(--input-background-color);
                box-sizing: border-box;
                margin-bottom: 15px;
                transition: border-color 0.3s ease;
            }
            .routing { 
                display: grid;
                justify-content: flex-start;
                grid-template-columns: 1fr 1fr 10fr 1fr;
                margin-bottom: 15px;
            }
            .form-control .routing input { grid-column: 2 / 3; }
            #routing-rules.form-control { display: grid; grid-template-columns: 1fr 1fr; }
            .routing label {
                text-align: left;
                margin: 0 0 0 10px;
                font-weight: 400;
                font-size: 100%;
                text-wrap: nowrap;
            }
            .form-control input[type="password"]:focus { border-color: var(--secondary-color); outline: none; }
            #passwordError { color: red; margin-bottom: 10px; }
            .symbol { margin-right: 8px; }
            .modalQR {
                display: none;
                position: fixed;
                z-index: 1;
                left: 0;
                top: 0;
                width: 100%;
                height: 100%;
                overflow: auto;
                background-color: rgba(0, 0, 0, 0.4);
            }
            .floating-button {
                position: fixed;
                bottom: 20px;
                left: 20px;
                background-color: var(--color);
                color: white;
                border: none;
                border-radius: 50%;
                width: 60px;
                height: 60px;
                font-size: 24px;
                cursor: pointer;
                box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
                transition: background-color 0.3s, transform 0.3s;
            }
            .floating-button:hover { transform: scale(1.1); }
            .min-max { display: grid; grid-template-columns: 1fr auto 1fr; align-items: baseline; width: 100%; }
            .min-max span { text-align: center; white-space: pre; }
            .input-with-select { width: 100%; }
            body.dark-mode .floating-button { background-color: var(--color); }
            body.dark-mode .floating-button:hover { transform: scale(1.1); }
            #ips th { background-color: var(--hr-text-color); color: var(--background-color); width: unset; }
            #ips td { background-color: unset; }
            #ips td:first-child { background-color: var(--table-active-color); }
            .header-container { display: flex; align-items: center; justify-content: center; }
            @media only screen and (min-width: 768px) {
                .form-container { max-width: 70%; }
                .form-control { 
                    margin-bottom: 15px;
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    align-items: baseline;
                    justify-content: flex-end;
                    font-family: Arial, sans-serif;
                }
                #apply { display: block; margin: 20px auto 0 auto; max-width: 50%; }
                .modal-content { width: 30% }
                .routing { display: grid; grid-template-columns: 4fr 1fr 3fr 4fr; }
            }
        </style>
    </head>
    <body>
        <h1>BPB 面板 <span style="font-size: smaller;">${panelVersion}</span> 💦</h1>
        <div class="form-container">
            <form id="configForm">
                <details open>
                    <summary><h2>VLESS/TROJAN 设置 ⚙️</h2></summary>
                    <div class="form-control">
                        <label for="remoteDNS">🌏 远程 DNS</label>
                        <input type="url" id="remoteDNS" name="remoteDNS" value="${remoteDNS}" required>
                    </div>
                    <div class="form-control">
                        <label for="localDNS">🏚️ 本地 DNS</label>
                        <input type="text" id="localDNS" name="localDNS" value="${localDNS}"
                            pattern="^(?:\\d{1,3}\\.){3}\\d{1,3}$"
                            title="请输入有效的 DNS IP 地址！"  required>
                    </div>
                    <div class="form-control">
                        <label for="vlessTrojanFakeDNS">🧢 伪装 DNS</label>
                        <div class="input-with-select">
                            <select id="vlessTrojanFakeDNS" name="vlessTrojanFakeDNS">
                                <option value="true" ${vlessTrojanFakeDNS ? 'selected' : ''}>启用</option>
                                <option value="false" ${!vlessTrojanFakeDNS ? 'selected' : ''}>禁用</option>
                            </select>
                        </div>
                    </div>
                    <div class="form-control">
                        <label for="proxyIP">📍 代理 IP/域名</label>
                        <input type="text" id="proxyIP" name="proxyIP" value="${proxyIP.replaceAll(",", " , ")}">
                    </div>
                    <div class="form-control">
                        <label for="outProxy">✈️ 链式代理</label>
                        <input type="text" id="outProxy" name="outProxy" value="${outProxy}">
                    </div>
                    <div class="form-control">
                        <label for="cleanIPs">✨ 优选 IP/域名</label>
                        <input type="text" id="cleanIPs" name="cleanIPs" value="${cleanIPs.replaceAll(",", " , ")}">
                    </div>
                    <div class="form-control">
                        <label for="scanner">🔎 优选 IP 扫描器</label>
                        <a href="https://github.com/bia-pain-bache/Cloudflare-Clean-IP-Scanner/releases/tag/v2.2.5" name="scanner" target="_blank" style="width: 100%;">
                            <button type="button" id="scanner" class="button">
                                下载扫描器
                                <span class="material-symbols-outlined">open_in_new</span>
                            </button>
                        </a>
                    </div>
                    <div class="form-control">
                        <label for="enableIPv6">🔛 IPv6</label>
                        <div class="input-with-select">
                            <select id="enableIPv6" name="enableIPv6">
                                <option value="true" ${enableIPv6 ? 'selected' : ''}>启用</option>
                                <option value="false" ${!enableIPv6 ? 'selected' : ''}>禁用</option>
                            </select>
                        </div>
                    </div>
                    <div class="form-control">
                        <label for="customCdnAddrs">💀 自定义 CDN 地址</label>
                        <input type="text" id="customCdnAddrs" name="customCdnAddrs" value="${customCdnAddrs.replaceAll(",", " , ")}">
                    </div>
                    <div class="form-control">
                        <label for="customCdnHost">💀 自定义 CDN 主机</label> 
                        <input type="text" id="customCdnHost" name="customCdnHost" value="${customCdnHost}">
                    </div>
                    <div class="form-control">
                        <label for="customCdnSni">💀 自定义 CDN SNI</label>
                        <input type="text" id="customCdnSni" name="customCdnSni" value="${customCdnSni}">
                    </div>
                    <div class="form-control">
                        <label for="bestVLESSTrojanInterval">🔄 最佳延迟探测间隔</label>
                        <input type="number" id="bestVLESSTrojanInterval" name="bestVLESSTrojanInterval" min="10" max="90" value="${bestVLESSTrojanInterval}">
                    </div>
                    <div class="form-control" style="padding-top: 10px;">
                        <label for="vlessConfigs">⚙️ 协议选择</label>
                        <div style="width: 100%; display: grid; grid-template-columns: 1fr 1fr; align-items: baseline; margin-top: 10px;">
                            <div style = "display: flex; justify-content: center; align-items: center;">
                                <input type="checkbox" id="vlessConfigs" name="vlessConfigs" onchange="handleProtocolChange(event)" value="true" ${vlessConfigs ? 'checked' : ''}>
                                <label for="vlessConfigs" style="margin: 0 5px; font-weight: normal; font-size: unset;">VLESS</label>
                            </div>
                            <div style = "display: flex; justify-content: center; align-items: center;">
                                <input type="checkbox" id="trojanConfigs" name="trojanConfigs" onchange="handleProtocolChange(event)" value="true" ${trojanConfigs ? 'checked' : ''}>
                                <label for="trojanConfigs" style="margin: 0 5px; font-weight: normal; font-size: unset;">Trojan</label>
                            </div>
                        </div>
                    </div>
                    <div class="table-container">
                        <table id="ports-block">
                            <tr>
                                <th style="text-wrap: nowrap; background-color: gray;">配置类型</th>
                                <th style="text-wrap: nowrap; background-color: gray;">端口</th>
                            </tr>
                            <tr>
                                <td style="text-align: center; font-size: larger;"><b>TLS</b></td>
                                <td>
                                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr;">${httpsPortsBlock}</div>
                                </td>    
                            </tr>
                            ${!httpPortsBlock ? '' : `<tr>
                                <td style="text-align: center; font-size: larger;"><b>非 TLS</b></td>
                                <td>
                                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr;">${httpPortsBlock}</div>
                                </td>    
                            </tr>`}        
                        </table>
                    </div>
                </details>
                <details>
                    <summary><h2>分片设置 ⚙️</h2></summary>	
                    <div class="form-control">
                        <label for="fragmentLengthMin">📐 分片长度</label>
                        <div class="min-max">
                            <input type="number" id="fragmentLengthMin" name="fragmentLengthMin" value="${lengthMin}" min="10" required>
                            <span> - </span>
                            <input type="number" id="fragmentLengthMax" name="fragmentLengthMax" value="${lengthMax}" max="500" required>
                        </div>
                    </div>
                    <div class="form-control">
                        <label for="fragmentIntervalMin">🕞 分片间隔</label>
                        <div class="min-max">
                            <input type="number" id="fragmentIntervalMin" name="fragmentIntervalMin"
                                value="${intervalMin}" min="1" max="30" required>
                            <span> - </span>
                            <input type="number" id="fragmentIntervalMax" name="fragmentIntervalMax"
                                value="${intervalMax}" min="1" max="30" required>
                        </div>
                    </div>
                    <div class="form-control">
                        <label for="fragmentPackets">📦 分片包类型</label>
                        <div class="input-with-select">
                            <select id="fragmentPackets" name="fragmentPackets">
                                <option value="tlshello" ${fragmentPackets === 'tlshello' ? 'selected' : ''}>tlshello</option>
                                <option value="1-1" ${fragmentPackets === '1-1' ? 'selected' : ''}>1-1</option>
                                <option value="1-2" ${fragmentPackets === '1-2' ? 'selected' : ''}>1-2</option>
                                <option value="1-3" ${fragmentPackets === '1-3' ? 'selected' : ''}>1-3</option>
                                <option value="1-5" ${fragmentPackets === '1-5' ? 'selected' : ''}>1-5</option>
                            </select>
                        </div>
                    </div>
                </details>
                <details>
                    <summary><h2>WARP 设置 ⚙️</h2></summary>
                    <div class="form-control">
                        <label for="warpEndpoints">✨ 端点</label>
                        <input type="text" id="warpEndpoints" name="warpEndpoints" value="${warpEndpoints.replaceAll(",", " , ")}" required>
                    </div>
                    <div class="form-control">
                        <label for="endpointScanner" style="line-height: 1.5;">🔎 扫描端点</label>
                        <button type="button" id="endpointScanner" class="button" style="padding: 10px 0;" onclick="copyToClipboard('bash <(curl -fsSL https://raw.githubusercontent.com/bia-pain-bache/warp-script/refs/heads/main/endip/install.sh)', false)">
                            复制脚本<span class="material-symbols-outlined">terminal</span>
                        </button>
                    </div>
                    <div class="form-control">
                        <label for="warpFakeDNS">🧢 伪装 DNS</label>
                        <div class="input-with-select">
                            <select id="warpFakeDNS" name="warpFakeDNS">
                                <option value="true" ${warpFakeDNS ? 'selected' : ''}>启用</option>
                                <option value="false" ${!warpFakeDNS ? 'selected' : ''}>禁用</option>
                            </select>
                        </div>
                    </div>
                    <div class="form-control">
                        <label for="warpEnableIPv6">🔛 IPv6</label>
                        <div class="input-with-select">
                            <select id="warpEnableIPv6" name="warpEnableIPv6">
                                <option value="true" ${warpEnableIPv6 ? 'selected' : ''}>启用</option>
                                <option value="false" ${!warpEnableIPv6 ? 'selected' : ''}>禁用</option>
                            </select>
                        </div>
                    </div>
                    <div class="form-control">
                        <label for="warpPlusLicense">➕ Warp+ 许可证</label>
                        <input type="text" id="warpPlusLicense" name="warpPlusLicense" value="${warpPlusLicense}" 
                            pattern="^[a-zA-Z0-9]{8}-[a-zA-Z0-9]{8}-[a-zA-Z0-9]{8}$" 
                            title="请输入有效的 Warp Plus 许可证，格式为 xxxxxxxx-xxxxxxxx-xxxxxxxx">
                    </div>
                    <div class="form-control">
                        <label for="refreshBtn">♻️ WARP 配置</label>
                        <button id="refreshBtn" type="button" class="button" style="padding: 10px 0;" onclick="getWarpConfigs()">
                            更新<span class="material-symbols-outlined">autorenew</span>
                        </button>
                    </div>
                    <div class="form-control">
                        <label for="bestWarpInterval">🔄 最佳间隔</label>
                        <input type="number" id="bestWarpInterval" name="bestWarpInterval" min="10" max="90" value="${bestWarpInterval}">
                    </div>
                </details>
                <details>
                    <summary><h2>WARP PRO 设置 ⚙️</h2></summary>
                    <div class="form-control">
                        <label for="hiddifyNoiseMode">😵‍💫 Hiddify 模式</label>
                        <input type="text" id="hiddifyNoiseMode" name="hiddifyNoiseMode" 
                            pattern="^(m[1-6]|h_[0-9A-Fa-f]{2}|g_([0-9A-Fa-f]{2}_){2}[0-9A-Fa-f]{2})$" 
                            title="输入 'm1-m6'、'h_HEX'、'g_HEX_HEX_HEX'，其中 HEX 可以是 00 到 ff 之间的值"
                            value="${hiddifyNoiseMode}" required>
                    </div>
                    <div class="form-control">
                        <label for="nikaNGNoiseMode">😵‍💫 NikaNG 模式</label>
                        <input type="text" id="nikaNGNoiseMode" name="nikaNGNoiseMode" 
                            pattern="^(none|quic|random|[0-9A-Fa-f]+)$" 
                            title="输入 'none'、'quic'、'random' 或任意十六进制字符串，如 'ee0000000108aaaa'"
                            value="${nikaNGNoiseMode}" required>
                    </div>
                    <div class="form-control">
                        <label for="noiseCountMin">🎚️ 噪声数量</label>
                        <div class="min-max">
                            <input type="number" id="noiseCountMin" name="noiseCountMin"
                                value="${noiseCountMin}" min="1" required>
                            <span> - </span>
                            <input type="number" id="noiseCountMax" name="noiseCountMax"
                                value="${noiseCountMax}" min="1" required>
                        </div>
                    </div>
                    <div class="form-control">
                        <label for="noiseSizeMin">📏 噪声大小</label>
                        <div class="min-max">
                            <input type="number" id="noiseSizeMin" name="noiseSizeMin"
                                value="${noiseSizeMin}" min="1" required>
                            <span> - </span>
                            <input type="number" id="noiseSizeMax" name="noiseSizeMax"
                                value="${noiseSizeMax}" min="1" required>
                        </div>
                    </div>
                    <div class="form-control">
                        <label for="noiseDelayMin">🕞 噪声延迟</label>
                        <div class="min-max">
                            <input type="number" id="noiseDelayMin" name="noiseDelayMin"
                                value="${noiseDelayMin}" min="1" required>
                            <span> - </span>
                            <input type="number" id="noiseDelayMax" name="noiseDelayMax"
                                value="${noiseDelayMax}" min="1" required>
                        </div>
                    </div>
                </details>
                <details>
                    <summary><h2>路由规则设置 ⚙️</h2></summary>
                    <div id="routing-rules" class="form-control" style="margin-bottom: 20px;">			
                        <div class="routing">
                            <input type="checkbox" id="bypass-lan" name="bypass-lan" value="true" ${bypassLAN ? 'checked' : ''}>
                            <label for="bypass-lan">绕过局域网</label>
                        </div>
                        <div class="routing">
                            <input type="checkbox" id="block-ads" name="block-ads" value="true" ${blockAds ? 'checked' : ''}>
                            <label for="block-ads">拦截广告</label>
                        </div>
                        <div class="routing">
                            <input type="checkbox" id="bypass-iran" name="bypass-iran" value="true" ${bypassIran ? 'checked' : ''}>
                            <label for="bypass-iran">绕过伊朗</label>
                        </div>
                        <div class="routing">
                            <input type="checkbox" id="block-porn" name="block-porn" value="true" ${blockPorn ? 'checked' : ''}>
                            <label for="block-porn">拦截成人内容</label>
                        </div>
                        <div class="routing">
                            <input type="checkbox" id="bypass-china" name="bypass-china" value="true" ${bypassChina ? 'checked' : ''}>
                            <label for="bypass-china">绕过中国</label>
                        </div>
                        <div class="routing">
                            <input type="checkbox" id="block-udp-443" name="block-udp-443" value="true" ${blockUDP443 ? 'checked' : ''}>
                            <label for="block-udp-443">拦截 QUIC</label>
                        </div>
                        <div class="routing">
                            <input type="checkbox" id="bypass-russia" name="bypass-russia" value="true" ${bypassRussia ? 'checked' : ''}>
                            <label for="bypass-russia">绕过俄罗斯</label>
                        </div>
                    </div>
                    <h3>自定义规则 🔧</h3>
                    <div class="form-control">
                        <label for="customBypassRules">🟩 绕过 IP / 域名</label>
                        <input type="text" id="customBypassRules" name="customBypassRules" value="${customBypassRules.replaceAll(",", " , ")}">
                    </div>
                    <div class="form-control">
                        <label for="customBlockRules">🟥 拦截 IP / 域名</label>
                        <input type="text" id="customBlockRules" name="customBlockRules" value="${customBlockRules.replaceAll(",", " , ")}">
                    </div>
                </details>
                <div id="apply" class="form-control">
                    <div style="grid-column: 2; width: 100%; display: inline-flex;">
                        <input type="submit" id="applyButton" style="margin-right: 10px;" class="button disabled" value="应用设置 💥" form="configForm">
                        <button type="button" id="resetSettings" style="background: none; margin: 0; border: none; cursor: pointer;">
                            <i class="fa fa-refresh fa-2x fa-border" style="border-radius: .2em; border-color: var(--border-color);" aria-hidden="true"></i>
                        </button>
                    </div>
                </div>
            </form>
            <hr>            
            <h2>🔗 普通订阅</h2>
            <div class="table-container">
                <table id="normal-configs-table">
                    <tr>
                        <th>应用程序</th>
                        <th>订阅链接</th>
                    </tr>
                    <tr>
                        <td>
                            ${supportedApps(['v2rayNG', 'NikaNG', 'MahsaNG', 'v2rayN', 'v2rayN-PRO', 'Shadowrocket', 'Streisand', 'Hiddify', 'Nekoray (Xray)'])}
                        </td>
                        <td>
                            ${subQR('sub', '', 'BPB-Normal', '普通订阅')}
                            ${subURL('sub', '', 'BPB-Normal')}
                        </td>
                    </tr>
                    <tr>
                        <td>
                            ${supportedApps(['husi', 'Nekobox', 'Nekoray (sing-Box)', 'Karing'])}
                        </td>
                        <td>
                            ${subURL('sub', 'singbox', 'BPB-Normal')}
                        </td>
                    </tr>
                </table>
            </div>
            <h2>🔗 完整普通订阅</h2>
            <div class="table-container">
                <table id="full-normal-configs-table">
                    <tr>
                        <th>应用程序</th>
                        <th>订阅链接</th>
                    </tr>
                    <tr>
                        <td>
                            ${supportedApps(['v2rayNG', 'NikaNG', 'MahsaNG', 'v2rayN', 'v2rayN-PRO', 'Streisand'])}
                        </td>
                        <td>
                            ${subQR('sub', 'xray', 'BPB-Full-Normal', '完整普通订阅')}
                            ${subURL('sub', 'xray', 'BPB-Full-Normal')}
                        </td>
                    </tr>
                    <tr>
                        <td>
                            ${supportedApps(['sing-box', 'v2rayN (sing-box)'])}
                        </td>
                        <td>
                            ${subQR('sub', 'sfa', 'BPB-Full-Normal', '完整普通订阅', true)}
                            ${subURL('sub', 'sfa', 'BPB-Full-Normal')}
                        </td>
                    </tr>
                    <tr>
                        <td>
                            ${supportedApps(['Clash Meta', 'Clash Verge', 'FlClash', 'Stash', 'v2rayN (mihomo)'])}
                        </td>
                        <td>
                            ${subQR('sub', 'clash', 'BPB-Full-Normal', '完整普通订阅')}
                            ${subURL('sub', 'clash', 'BPB-Full-Normal')}
                        </td>
                    </tr>
                </table>
            </div>
            <h2>🔗 分片订阅</h2>
            <div class="table-container">
                <table id="frag-sub-table">
                    <tr>
                        <th style="text-wrap: nowrap;">应用程序</th>
                        <th style="text-wrap: nowrap;">订阅链接</th>
                    </tr>
                    <tr>
                        <td style="text-wrap: nowrap;">
                            ${supportedApps(['v2rayNG', 'NikaNG', 'MahsaNG', 'v2rayN', 'v2rayN-PRO', 'Streisand'])}
                        </td>
                        <td>
                            ${subQR('fragsub', '', 'BPB-Fragment', '分片订阅')}
                            ${subURL('fragsub', '', 'BPB-Fragment')}
                        </td>
                    </tr>
                    <tr>
                        <td style="text-wrap: nowrap;">
                            ${supportedApps(['Hiddify'])}
                        </td>
                        <td>
                            ${subQR('fragsub', 'hiddify', 'BPB-Fragment', '分片订阅')}
                            ${subURL('fragsub', 'hiddify', 'BPB-Fragment')}
                        </td>
                    </tr>
                </table>
            </div>
            <h2>🔗 WARP 订阅</h2>
            <div class="table-container">
                <table id="normal-configs-table">
                    <tr>
                        <th>应用程序</th>
                        <th>订阅链接</th>
                    </tr>
                    <tr>
                        <td>
                            ${supportedApps(['v2rayNG', 'v2rayN', 'Streisand'])}
                        </td>
                        <td>
                            ${subQR('warpsub', 'xray', 'BPB-Warp', 'WARP 订阅')}
                            ${subURL('warpsub', 'xray', 'BPB-Warp')}
                        </td>
                    </tr>
                    <tr>
                        <td>
                            ${supportedApps(['Hiddify', 'sing-box', 'v2rayN (sing-box)'])}
                        </td>
                        <td>
                            ${subQR('sub', 'singbox', 'BPB-Warp', 'WARP 订阅', true)}
                            ${subURL('warpsub', 'singbox', 'BPB-Warp')}
                        </td>
                    </tr>
                    <tr>
                        <td>
                            ${supportedApps(['Clash Meta', 'Clash Verge', 'FlClash', 'Stash', 'v2rayN (mihomo)'])}
                        </td>
                        <td>
                            ${subQR('warpsub', 'clash', 'BPB-Warp', 'WARP 订阅')}
                            ${subURL('warpsub', 'clash', 'BPB-Warp')}
                        </td>
                    </tr>
                </table>
            </div>
            <h2>🔗 WARP PRO 订阅</h2>
            <div class="table-container">
                <table id="warp-pro-configs-table">
                    <tr>
                        <th>应用程序</th>
                        <th>订阅链接</th>
                    </tr>
                    <tr>
                        <td>
                            ${supportedApps(['NikaNG', 'MahsaNG', 'v2rayN-PRO'])}
                        </td>
                        <td>
                            ${subQR('warpsub', 'nikang', 'BPB-Warp-Pro', 'WARP Pro 订阅')}
                            ${subURL('warpsub', 'nikang', 'BPB-Warp-Pro')}
                        </td>
                    </tr>
                    <tr>
                        <td>
                            ${supportedApps(['Hiddify'])}
                        </td>
                        <td>
                            ${subQR('warpsub', 'hiddify', 'BPB-Warp-Pro', 'WARP Pro 订阅', true)}
                            ${subURL('warpsub', 'hiddify', 'BPB-Warp-Pro')}
                        </td>
                    </tr>
                </table>
            </div>
            <div id="myModal" class="modal">
                <div class="modal-content">
                    <span class="close">&times;</span>
                    <form id="passwordChangeForm">
                        <h2>修改密码</h2>
                        <div class="form-control">
                            <label for="newPassword">新密码</label>
                            <input type="password" id="newPassword" name="newPassword" required>
                            </div>
                        <div class="form-control">
                            <label for="confirmPassword">确认密码</label>
                            <input type="password" id="confirmPassword" name="confirmPassword" required>
                        </div>
                        <div id="passwordError" style="color: red; margin-bottom: 10px;"></div>
                        <button id="changePasswordBtn" type="submit" class="button">修改密码</button>
                    </form>
                </div>
            </div>
            <div id="myQRModal" class="modalQR">
                <div class="modal-content" style="width: auto; text-align: center;">
                    <div style="display: flex; flex-direction: column; align-items: center; margin-bottom: 10px;">
                        <span id="closeQRModal" class="close" style="align-self: flex-end;">&times;</span>
                        <span id="qrcodeTitle" style="align-self: center; font-weight: bold;"></span>
                    </div>
                    <div id="qrcode-container"></div>
                </div>
            </div>
            <hr>
            <div class="header-container">
                <h2 style="margin: 0 5px;">💡 我的 IP</h2>
                <button type="button" id="resetSettings" onclick="fetchIPInfo()" style="background: none; margin: 0; border: none; cursor: pointer;">
                    <i class="fa fa-refresh fa-2x" style="color: var(--button-color);" aria-hidden="true"></i>
                </button>       
            </div>
            <div class="table-container">
                <table id="ips" style="text-align: center; margin-bottom: 15px; text-wrap-mode: nowrap;">
                    <tr>
                        <th>目标地址</th>
                        <th>IP</th>
                        <th>国家</th>
                        <th>城市</th>
                        <th>运营商</th>
                    </tr>
                    <tr>
                        <td>Cloudflare CDN</td>
                        <td id="cf-ip"></td>
                        <td><b id="cf-country"></b></td>
                        <td><b id="cf-city"></b></td>
                        <td><b id="cf-isp"></b></td>
                    </tr>
                    <tr>
                        <td>其他</td>
                        <td id="ip"></td>
                        <td><b id="country"></b></td>
                        <td><b id="city"></b></td>
                        <td><b id="isp"></b></td>
                    </tr>
                </table>
            </div>
            <hr>
            <div class="footer">
                <i class="fa fa-github" style="font-size:36px; margin-right: 10px;"></i>
                <a class="link" href="https://github.com/bia-pain-bache/BPB-Worker-Panel" style="color: var(--color); text-decoration: underline;" target="_blank">Github</a>
                <button id="openModalBtn" class="button">修改密码</button>
                <button type="button" id="logout" style="background: none; color: var(--color); margin: 0; border: none; cursor: pointer;">
                    <i class="fa fa-power-off fa-2x" aria-hidden="true"></i>
                </button>
            </div>
        </div>
        <button id="darkModeToggle" class="floating-button">
            <i id="modeIcon" class="fa fa-2x fa-adjust" style="color: var(--background-color);" aria-hidden="true"></i>
        </button>
    <script type="module" defer>
        import { polyfillCountryFlagEmojis } from "https://cdn.skypack.dev/country-flag-emoji-polyfill";
        polyfillCountryFlagEmojis();
    </script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
    <script>
        const defaultHttpsPorts = ['443', '8443', '2053', '2083', '2087', '2096'];
        let activePortsNo = ${ports.length};
        let activeHttpsPortsNo = ${ports.filter(port => defaultHttpsPorts.includes(port)).length};
        let activeProtocols = ${activeProtocols};
        const warpPlusLicense = '${warpPlusLicense}';
        localStorage.getItem('darkMode') === 'enabled' && document.body.classList.add('dark-mode');

        document.addEventListener('DOMContentLoaded', async () => {
            const configForm = document.getElementById('configForm');            
            const changePass = document.getElementById('openModalBtn');
            const closeBtn = document.querySelector(".close");
            const passwordChangeForm = document.getElementById('passwordChangeForm');                    
            const initialFormData = new FormData(configForm);
            const modal = document.getElementById('myModal');
            const closeQR = document.getElementById('closeQRModal');
            const resetSettings = document.getElementById('resetSettings');
            let modalQR = document.getElementById('myQRModal');
            let qrcodeContainer = document.getElementById('qrcode-container');
            let forcedPassChange = false;
            const darkModeToggle = document.getElementById('darkModeToggle');
                    
            const hasFormDataChanged = () => {
                const currentFormData = new FormData(configForm);
                const currentFormDataEntries = [...currentFormData.entries()];

                const nonCheckboxFieldsChanged = currentFormDataEntries.some(
                    ([key, value]) => !initialFormData.has(key) || initialFormData.get(key) !== value
                );

                const checkboxFieldsChanged = Array.from(configForm.elements)
                    .filter((element) => element.type === 'checkbox')
                    .some((checkbox) => {
                    const initialValue = initialFormData.has(checkbox.name)
                        ? initialFormData.get(checkbox.name)
                        : false;
                    const currentValue = currentFormDataEntries.find(([key]) => key === checkbox.name)?.[1] || false;
                    return initialValue !== currentValue;
                });

                return nonCheckboxFieldsChanged || checkboxFieldsChanged;
            };
            
            const enableApplyButton = () => {
                const isChanged = hasFormDataChanged();
                applyButton.disabled = !isChanged;
                applyButton.classList.toggle('disabled', !isChanged);
            };
                        
            passwordChangeForm.addEventListener('submit', event => resetPassword(event));
            document.getElementById('logout').addEventListener('click', event => logout(event));
            configForm.addEventListener('submit', (event) => applySettings(event, configForm));
            configForm.addEventListener('input', enableApplyButton);
            configForm.addEventListener('change', enableApplyButton);
            changePass.addEventListener('click', () => {
                forcedPassChange ? closeBtn.style.display = 'none' : closeBtn.style.display = '';
                modal.style.display = "block";
                document.body.style.overflow = "hidden";
                forcedPassChange = false;
            });        
            closeBtn.addEventListener('click', () => {
                modal.style.display = "none";
                document.body.style.overflow = "";
            });
            closeQR.addEventListener('click', () => {
                modalQR.style.display = "none";
                qrcodeContainer.lastElementChild.remove();
            });
            resetSettings.addEventListener('click', async () => {
                const confirmReset = confirm('⚠️ 这将重置所有面板设置。\n确定要继续吗？');
                if(!confirmReset) return;
                const formData = new FormData();
                formData.append('resetSettings', 'true');
                try {
                    document.body.style.cursor = 'wait';
                    const refreshButtonVal = refreshBtn.innerHTML;
                    refreshBtn.innerHTML = '⌛ 加载中...';

                    const response = await fetch('/panel', {
                        method: 'POST',
                        body: formData,
                        credentials: 'include'
                    });

                    document.body.style.cursor = 'default';
                    refreshBtn.innerHTML = refreshButtonVal;
                    if (!response.ok) {
                        const errorMessage = await response.text();
                        console.error(errorMessage, response.status);
                        alert('⚠️ 发生错误，请重试！\n⛔ ' + errorMessage);
                        return;
                    }       
                    alert('✅ 面板设置已成功重置为默认值！😎');
                    window.location.reload(true);
                } catch (error) {
                    console.error('错误:', error);
                }
            });
            window.onclick = (event) => {
                if (event.target == modalQR) {
                    modalQR.style.display = "none";
                    qrcodeContainer.lastElementChild.remove();
                }
            }
            darkModeToggle.addEventListener('click', () => {
                const isDarkMode = document.body.classList.toggle('dark-mode');
                localStorage.setItem('darkMode', isDarkMode ? 'enabled' : 'disabled');
            });

            const isPassSet = ${isPassSet};
            if (!isPassSet) {
                forcedPassChange = true;
                changePass.click();
            }

            await fetchIPInfo();
        });

        const fetchIPInfo = async () => {
            const updateUI = (ip = '-', country = '-', countryCode = '-', city = '-', isp = '-', cfIP) => {
                const flag = countryCode !== '-' ? String.fromCodePoint(...[...countryCode].map(c => 0x1F1E6 + c.charCodeAt(0) - 65)) : '';
                document.getElementById(cfIP ? 'cf-ip' : 'ip').textContent = ip;
                document.getElementById(cfIP ? 'cf-country' : 'country').textContent = country + ' ' + flag;
                document.getElementById(cfIP ? 'cf-city' : 'city').textContent = city;
                document.getElementById(cfIP ? 'cf-isp' : 'isp').textContent = isp;
            };

            try {
                const ipResponse = await fetch('https://ipwho.is/' + '?nocache=' + Date.now(), { cache: "no-store" });
                const ipResponseObj = await ipResponse.json();
                const geoResponse = await fetch('/my-ip', { 
                    method: 'POST',
                    body: ipResponseObj.ip
                });
                const ipGeoLocation = await geoResponse.json();
                updateUI(ipResponseObj.ip, ipGeoLocation.country, ipGeoLocation.countryCode, ipGeoLocation.city, ipGeoLocation.isp);
                const cfIPresponse = await fetch('https://ipv4.icanhazip.com/?nocache=' + Date.now(), { cache: "no-store" });
                const cfIP = await cfIPresponse.text();
                const cfGeoResponse = await fetch('/my-ip', { 
                    method: 'POST',
                    body: cfIP.trim()
                });
                const cfIPGeoLocation = await cfGeoResponse.json();
                updateUI(cfIP, cfIPGeoLocation.country, cfIPGeoLocation.countryCode, cfIPGeoLocation.city, cfIPGeoLocation.isp, true);
            } catch (error) {
                console.error('获取IP地址时出错:', error);
            }
        }

        const getWarpConfigs = async () => {
            const license = document.getElementById('warpPlusLicense').value;
            if (license !== warpPlusLicense) {
                alert('⚠️ 请先应用设置，然后再更新Warp配置！');
                return false;
            }
            const confirmReset = confirm('⚠️ 确定要继续吗？');
            if(!confirmReset) return;
            const refreshBtn = document.getElementById('refreshBtn');

            try {
                document.body.style.cursor = 'wait';
                const refreshButtonVal = refreshBtn.innerHTML;
                refreshBtn.innerHTML = '⌛ 加载中...';

                const response = await fetch('/update-warp', {
                    method: 'POST',
                    credentials: 'include'
                });

                document.body.style.cursor = 'default';
                refreshBtn.innerHTML = refreshButtonVal;
                if (!response.ok) {
                    const errorMessage = await response.text();
                    console.error(errorMessage, response.status);
                    alert('⚠️ 发生错误，请重试！\n⛔ ' + errorMessage);
                    return;
                }          
                ${isWarpPlus
                    ? `alert('✅ Warp配置已成功升级到PLUS！😎');` 
                    : `alert('✅ Warp配置已成功更新！😎');`
                }
            } catch (error) {
                console.error('错误:', error);
            } 
        }

        const handlePortChange = (event) => {
            
            if(event.target.checked) { 
                activePortsNo++ 
                defaultHttpsPorts.includes(event.target.name) && activeHttpsPortsNo++;
            } else {
                activePortsNo--;
                defaultHttpsPorts.includes(event.target.name) && activeHttpsPortsNo--;
            }

            if (activePortsNo === 0) {
                event.preventDefault();
                event.target.checked = !event.target.checked;
                alert("⛔ 至少需要选择一个端口！🫤");
                activePortsNo = 1;
                defaultHttpsPorts.includes(event.target.name) && activeHttpsPortsNo++;
                return false;
            }
                
            if (activeHttpsPortsNo === 0) {
                event.preventDefault();
                event.target.checked = !event.target.checked;
                alert("⛔ 至少需要选择一个TLS(https)端口！🫤");
                activeHttpsPortsNo = 1;
                return false;
            }
        }
        
        const handleProtocolChange = (event) => {
            
            if(event.target.checked) { 
                activeProtocols++ 
            } else {
                activeProtocols--;
            }

            if (activeProtocols === 0) {
                event.preventDefault();
                event.target.checked = !event.target.checked;
                alert("⛔ 至少需要选择一个协议！🫤");
                activeProtocols = 1;
                return false;
            }
        }

        const openQR = (url, title) => {
            let qrcodeContainer = document.getElementById("qrcode-container");
            let qrcodeTitle = document.getElementById("qrcodeTitle");
            const modalQR = document.getElementById("myQRModal");
            qrcodeTitle.textContent = title;
            modalQR.style.display = "block";
            let qrcodeDiv = document.createElement("div");
            qrcodeDiv.className = "qrcode";
            qrcodeDiv.style.padding = "2px";
            qrcodeDiv.style.backgroundColor = "#ffffff";
            new QRCode(qrcodeDiv, {
                text: url,
                width: 256,
                height: 256,
                colorDark: "#000000",
                colorLight: "#ffffff",
                correctLevel: QRCode.CorrectLevel.H
            });
            qrcodeContainer.appendChild(qrcodeDiv);
        }

        const copyToClipboard = (text) => {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            alert('📋 已复制到剪贴板：\n\n' +  text);
        }

        const applySettings = async (event, configForm) => {
            event.preventDefault();
            event.stopPropagation();
            const applyButton = document.getElementById('applyButton');
            const getValue = (id) => parseInt(document.getElementById(id).value, 10);              
            const lengthMin = getValue('fragmentLengthMin');
            const lengthMax = getValue('fragmentLengthMax');
            const intervalMin = getValue('fragmentIntervalMin');
            const intervalMax = getValue('fragmentIntervalMax');
            const customCdnAddrs = document.getElementById('customCdnAddrs').value?.split(',').filter(addr => addr !== '');
            const customCdnHost = document.getElementById('customCdnHost').value;
            const customCdnSni = document.getElementById('customCdnSni').value;
            const isCustomCdn = customCdnAddrs.length || customCdnHost !== '' || customCdnSni !== '';
            const warpEndpoints = document.getElementById('warpEndpoints').value?.replaceAll(' ', '').split(',');
            const noiseCountMin = getValue('noiseCountMin');
            const noiseCountMax = getValue('noiseCountMax');
            const noiseSizeMin = getValue('noiseSizeMin');
            const noiseSizeMax = getValue('noiseSizeMax');
            const noiseDelayMin = getValue('noiseDelayMin');
            const noiseDelayMax = getValue('noiseDelayMax');
            const cleanIPs = document.getElementById('cleanIPs').value?.split(',');
            const proxyIPs = document.getElementById('proxyIP').value?.split(',');
            const chainProxy = document.getElementById('outProxy').value?.trim();
            const customBypassRules = document.getElementById('customBypassRules').value?.split(',');                    
            const customBlockRules = document.getElementById('customBlockRules').value?.split(',');                    
            const formData = new FormData(configForm);
            const isVless = /vless:\\/\\/[^\s@]+@[^\\s:]+:[^\\s]+/.test(chainProxy);
            const isSocksHttp = /^(http|socks):\\/\\/(?:([^:@]+):([^:@]+)@)?([^:@]+):(\\d+)$/.test(chainProxy);
            const hasSecurity = /security=/.test(chainProxy);
            const securityRegex = /security=(tls|none|reality)/;
            const validSecurityType = securityRegex.test(chainProxy);
            let match = chainProxy.match(securityRegex);
            const securityType = match ? match[1] : null;
            match = chainProxy.match(/:(\\d+)\\?/);
            const vlessPort = match ? match[1] : null;
            const validTransmission = /type=(tcp|grpc|ws)/.test(chainProxy);
            const validIPDomain = /^((?:(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\\.)+[a-zA-Z]{2,})|(?:(?:25[0-5]|2[0-4]\\d|[01]?\\d\\d?)\\.){3}(?:25[0-5]|2[0-4]\\d|[01]?\\d\\d?)(?:\\/(?:\\d|[12]\\d|3[0-2]))?|\\[(?:(?:[a-fA-F0-9]{1,4}:){7}[a-fA-F0-9]{1,4}|(?:[a-fA-F0-9]{1,4}:){1,7}:|(?:[a-fA-F0-9]{1,4}:){1,6}:[a-fA-F0-9]{1,4}|(?:[a-fA-F0-9]{1,4}:){1,5}(?::[a-fA-F0-9]{1,4}){1,2}|(?:[a-fA-F0-9]{1,4}:){1,4}(?::[a-fA-F0-9]{1,4}){1,3}|(?:[a-fA-F0-9]{1,4}:){1,3}(?::[a-fA-F0-9]{1,4}){1,4}|(?:[a-fA-F0-9]{1,4}:){1,2}(?::[a-fA-F0-9]{1,4}){1,5}|[a-fA-F0-9]{1,4}:(?::[a-fA-F0-9]{1,4}){1,6}|:(?::[a-fA-F0-9]{1,4}){1,7})\\](?:\\/(?:12[0-8]|1[0-1]\\d|[0-9]?\\d))?)$/i;
            const validEndpoint = /^(?:(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\\.)+[a-zA-Z]{2,}|(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)|\\[(?:[a-fA-F0-9]{1,4}:){7}[a-fA-F0-9]{1,4}\\]|\\[(?:[a-fA-F0-9]{1,4}:){1,7}:\\]|\\[(?:[a-fA-F0-9]{1,4}:){1,6}:[a-fA-F0-9]{1,4}\\]|\\[(?:[a-fA-F0-9]{1,4}:){1,5}(?::[a-fA-F0-9]{1,4}){1,2}\\]|\\[(?:[a-fA-F0-9]{1,4}:){1,4}(?::[a-fA-F0-9]{1,4}){1,3}\\]|\\[(?:[a-fA-F0-9]{1,4}:){1,3}(?::[a-fA-F0-9]{1,4}){1,4}\\]|\\[(?:[a-fA-F0-9]{1,4}:){1,2}(?::[a-fA-F0-9]{1,4}){1,5}\\]|\\[[a-fA-F0-9]{1,4}:(?::[a-fA-F0-9]{1,4}){1,6}\\]|\\[:(?::[a-fA-F0-9]{1,4}){1,7}\\]|\\[::(?::[a-fA-F0-9]{1,4}){0,7}\\]):(?:[0-9]{1,5})$/;
            const checkedPorts = Array.from(document.querySelectorAll('input[id^="port-"]:checked')).map(input => input.id.split('-')[1]);
            formData.append('ports', checkedPorts);
            configForm.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
                !formData.has(checkbox.name) && formData.append(checkbox.name, 'false');    
            });

            const invalidIPs = [...cleanIPs, ...proxyIPs, ...customCdnAddrs, ...customBypassRules, ...customBlockRules, customCdnHost, customCdnSni]?.filter(value => {
                if (value) {
                    const trimmedValue = value.trim();
                    return !validIPDomain.test(trimmedValue);
                }
            });

            const invalidEndpoints = warpEndpoints?.filter(value => {
                if (value) {
                    const trimmedValue = value.trim();
                    return !validEndpoint.test(trimmedValue);
                }
            });

            if (invalidIPs.length) {
                alert('⛔ 无效的IP或域名 🫤\n\n' + invalidIPs.map(ip => '⚠️ ' + ip).join('\n'));
                return false;
            }
            
            if (invalidEndpoints.length) {
                alert('⛔ 无效的端点 🫤\n\n' + invalidEndpoints.map(endpoint => '⚠️ ' + endpoint).join('\n'));
                return false;
            }

            if (lengthMin >= lengthMax || intervalMin > intervalMax || noiseCountMin > noiseCountMax || noiseSizeMin > noiseSizeMax || noiseDelayMin > noiseDelayMax) {
                alert('⛔ 最小值应该小于或等于最大值！🫤');               
                return false;
            }

            if (!(isVless && (hasSecurity && validSecurityType || !hasSecurity) && validTransmission) && !isSocksHttp && chainProxy) {
                alert('⛔ 无效的配置！🫤 \n - 链式代理应为VLESS、Socks或Http！\n - VLESS传输应为GRPC、WS或TCP\n - VLESS安全性应为TLS、Reality或None\n - socks或http格式应为：\n + (socks或http)://用户名:密码@主机:端口\n + (socks或http)://主机:端口');               
                return false;
            }

            if (isVless && securityType === 'tls' && vlessPort !== '443') {
                alert('⛔ VLESS TLS端口只能是443才能用作链式代理！🫤');               
                return false;
            }

            if (isCustomCdn && !(customCdnAddrs.length && customCdnHost && customCdnSni)) {
                alert('⛔ 所有"自定义"字段必须一起填写或删除！🫤');               
                return false;
            }

            try {
                document.body.style.cursor = 'wait';
                const applyButtonVal = applyButton.value;
                applyButton.value = '⌛ 加载中...';

                const response = await fetch('/panel', {
                    method: 'POST',
                    body: formData,
                    credentials: 'include'
                });

                document.body.style.cursor = 'default';
                applyButton.value = applyButtonVal;

                if (!response.ok) {
                    const errorMessage = await response.text();
                    console.error(errorMessage, response.status);
                    alert('⚠️ 会话已过期！请重新登录。');
                    window.location.href = '/login';
                    return;
                }                
                alert('✅ 参数应用成功 😎');
                window.location.reload();
            } catch (error) {
                console.error('错误:', error);
            }
        }

        const logout = async (event) => {
            event.preventDefault();

            try {
                const response = await fetch('/logout', {
                    method: 'GET',
                    credentials: 'same-origin'
                });
            
                if (!response.ok) {
                    console.error('登出失败:', response.status);
                    return;
                }
                window.location.href = '/login';
            } catch (error) {
                console.error('错误:', error);
            }
        }

        const resetPassword = async (event) => {
            event.preventDefault();
            const modal = document.getElementById('myModal');
            const newPasswordInput = document.getElementById('newPassword');
            const confirmPasswordInput = document.getElementById('confirmPassword');
            const passwordError = document.getElementById('passwordError');             
            const newPassword = newPasswordInput.value;
            const confirmPassword = confirmPasswordInput.value;

            if (newPassword !== confirmPassword) {
                passwordError.textContent = "两次输入的密码不匹配";
                return false;
            }

            const hasCapitalLetter = /[A-Z]/.test(newPassword);
            const hasNumber = /[0-9]/.test(newPassword);
            const isLongEnough = newPassword.length >= 8;

            if (!(hasCapitalLetter && hasNumber && isLongEnough)) {
                passwordError.textContent = '⚠️ 密码必须包含至少一个大写字母、一个数字，且长度至少为8个字符。';
                return false;
            }
                    
            try {
                const response = await fetch('/panel/password', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'text/plain'
                    },
                    body: newPassword,
                    credentials: 'same-origin'
                });
            
                if (response.ok) {
                    modal.style.display = "none";
                    document.body.style.overflow = "";
                    alert("✅ 密码修改成功！👍");
                    window.location.href = '/login';
                } else if (response.status === 401) {
                    const errorMessage = await response.text();
                    passwordError.textContent = '⚠️ ' + errorMessage;
                    console.error(errorMessage, response.status);
                    alert('⚠️ 会话已过期！请重新登录。');
                    window.location.href = '/login';
                } else {
                    const errorMessage = await response.text();
                    passwordError.textContent = '⚠️ ' + errorMessage;
                    console.error(errorMessage, response.status);
                    return false;
                }
            } catch (error) {
                console.error('错误:', error);
            }
        }
    </script>
    </body>	
    </html>`;

    return new Response(homePage, {
        status: 200,
        headers: {
            'Content-Type': 'text/html;charset=utf-8',
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Methods': 'GET, POST',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
            'Referrer-Policy': 'strict-origin-when-cross-origin',
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, no-transform',
            'CDN-Cache-Control': 'no-store'
        }
    });
}