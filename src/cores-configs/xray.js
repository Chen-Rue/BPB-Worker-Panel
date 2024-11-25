import { resolveDNS, isDomain } from '../helpers/helpers';
import { getConfigAddresses, extractWireguardParams, base64ToDecimal, generateRemark, randomUpperCase, getRandomPath } from './helpers';
import { initializeParams, userID, trojanPassword, hostName, defaultHttpsPorts } from "../helpers/init";
import { getDataset } from '../kv/handlers';
import { renderErrorPage } from '../pages/error';

// 构建 Xray DNS 配置
// proxySettings: 代理设置参数
// outboundAddrs: 出站地址列表
// domainToStaticIPs: 域名到静态 IP 的映射
// isWorkerLess: 是否为无 Worker 模式
// isWarp: 是否为 WARP 模式
async function buildXrayDNS(proxySettings, outboundAddrs, domainToStaticIPs, isWorkerLess, isWarp) {
    // 从代理设置中解构需要的参数
    const {
        remoteDNS, // 远程 DNS 服务器
        resolvedRemoteDNS, // 已解析的远程 DNS
        localDNS, // 本地 DNS 服务器
        vlessTrojanFakeDNS, // VLESS/Trojan 伪装 DNS 开关
        enableIPv6, // 是否启用 IPv6
        warpFakeDNS, // WARP 伪装 DNS 开关
        warpEnableIPv6, // WARP IPv6 开关
        blockAds, // 广拦截开关
        bypassIran, // 绕过伊朗开关
        bypassChina, // 绕过中国开关
        blockPorn, // 色情网站拦截开关
        bypassRussia, // 绕过俄罗斯开关
        customBypassRules, // 自定义绕过规则
        customBlockRules // 自定义拦截规则
    } = proxySettings;

    // 定义绕过规则列表
    const bypassRules = [
        { rule: bypassIran, domain: "geosite:category-ir", ip: "geoip:ir" },
        { rule: bypassChina, domain: "geosite:cn", ip: "geoip:cn" },
        { rule: bypassRussia, domain: "geosite:category-ru", ip: "geoip:ru" }
    ];

    // 定义拦截规则列表
    const blockRules = [
        { rule: blockAds, host: "geosite:category-ads-all" },
        { rule: blockAds, host: "geosite:category-ads-ir" },
        { rule: blockPorn, host: "geosite:category-porn" }
    ];

    // 确定是否启用伪装 DNS 和 IPv6
    const isFakeDNS = (vlessTrojanFakeDNS && !isWarp) || (warpFakeDNS && isWarp);
    const isIPv6 = (enableIPv6 && !isWarp) || (warpEnableIPv6 && isWarp);

    // 处理出站域名和自定义规则
    const outboundDomains = outboundAddrs.filter(address => isDomain(address));
    const customBypassRulesDomains = customBypassRules.split(',').filter(address => isDomain(address));
    const customBlockRulesDomains = customBlockRules.split(',').filter(address => isDomain(address));
    const uniqueOutboundDomains = [...new Set(outboundDomains)];
    const isDomainRule = [...uniqueOutboundDomains, ...customBypassRulesDomains].length > 0;
    const isBypass = bypassIran || bypassChina || bypassRussia;
    const isBlock = blockAds || blockPorn || customBlockRulesDomains.length > 0;
    const finalRemoteDNS = isWorkerLess
        ? ["https://cloudflare-dns.com/dns-query"]
        : isWarp
            ? warpEnableIPv6
                ? ["1.1.1.1", "1.0.0.1", "2606:4700:4700::1111", "2606:4700:4700::1001"]
                : ["1.1.1.1", "1.0.0.1"]
            : [remoteDNS];

    const dnsHost = {};
    if (isBlock) {
        blockRules.forEach(({ rule, host }) => {
            if (rule) dnsHost[host] = ["127.0.0.1"];
        });
        customBlockRulesDomains.forEach(domain => {
            dnsHost[`domain:${domain}`] = ["127.0.0.1"];
        });
    }

    const staticIPs = domainToStaticIPs ? await resolveDNS(domainToStaticIPs) : undefined;
    if (staticIPs) dnsHost[domainToStaticIPs] = enableIPv6 ? [...staticIPs.ipv4, ...staticIPs.ipv6] : staticIPs.ipv4;
    if (resolvedRemoteDNS.server && !isWorkerLess && !isWarp) dnsHost[resolvedRemoteDNS.server] = resolvedRemoteDNS.staticIPs;
    if (isWorkerLess) {
        const domains = ["cloudflare-dns.com", "cloudflare.com", "dash.cloudflare.com"];
        const resolved = await Promise.all(domains.map(resolveDNS));
        const hostIPv4 = resolved.flatMap(r => r.ipv4);
        const hostIPv6 = enableIPv6 ? resolved.flatMap(r => r.ipv6) : [];
        dnsHost["cloudflare-dns.com"] = [
            ...hostIPv4,
            ...hostIPv6
        ];
    }

    const hosts = Object.keys(dnsHost).length ? { hosts: dnsHost } : {};
    const dnsObject = {
        ...hosts,
        servers: finalRemoteDNS,
        queryStrategy: isIPv6 ? "UseIP" : "UseIPv4",
        tag: "dns",
    };

    if (isDomainRule) {
        const outboundDomainRules = uniqueOutboundDomains.map(domain => `full:${domain}`);
        const bypassDomainRules = customBypassRulesDomains.map(domain => `domain:${domain}`);
        dnsObject.servers.push({
            address: localDNS,
            domains: [...outboundDomainRules, ...bypassDomainRules],
            skipFallback: true
        });
    }

    const localDNSServer = {
        address: localDNS,
        domains: [],
        expectIPs: [],
        skipFallback: true
    };

    if (!isWorkerLess && isBypass) {
        bypassRules.forEach(({ rule, domain, ip }) => {
            if (rule) {
                localDNSServer.domains.push(domain);
                localDNSServer.expectIPs.push(ip);
            }
        });

        dnsObject.servers.push(localDNSServer);
    }

    if (isFakeDNS) {
        const fakeDNSServer = isBypass && !isWorkerLess
            ? { address: "fakedns", domains: localDNSServer.domains }
            : "fakedns";
        dnsObject.servers.unshift(fakeDNSServer);
    }

    return dnsObject;
}

// 构建 Xray 路由规则
// proxySettings: 代理设置参数
// outboundAddrs: 出站地址列表
// isChain: 是否为链式代理
// isBalancer: 是否启用负载均衡
// isWorkerLess: 是否为无 Worker 模式 
// isWarp: 是否为 WARP 模式
function buildXrayRoutingRules(proxySettings, outboundAddrs, isChain, isBalancer, isWorkerLess, isWarp) {
    // 从代理设置中解构需要的参数
    const {
        remoteDNS, // 远程 DNS 服务器
        localDNS, // 本地 DNS 服务器
        bypassLAN, // 绕过局域网
        bypassIran, // 绕过伊朗
        bypassChina, // 绕过中国
        bypassRussia, // 绕过俄罗斯
        blockAds, // 拦截广告
        blockPorn, // 拦截色情网站
        blockUDP443, // 拦截 UDP 443 端口
        customBypassRules, // 自定义绕过规则
        customBlockRules // 自定义拦截规则
    } = proxySettings;

    // 定义地理位置规则
    const geoRules = [
        { rule: bypassLAN, type: 'direct', domain: "geosite:private", ip: "geoip:private" },
        { rule: bypassIran, type: 'direct', domain: "geosite:category-ir", ip: "geoip:ir" },
        { rule: bypassChina, type: 'direct', domain: "geosite:cn", ip: "geoip:cn" },
        { rule: blockAds, type: 'block', domain: "geosite:category-ads-all" },
        { rule: blockAds, type: 'block', domain: "geosite:category-ads-ir" },
        { rule: blockPorn, type: 'block', domain: "geosite:category-porn" }
    ];
    const outboundDomains = outboundAddrs.filter(address => isDomain(address));
    const customBypassRulesTotal = customBypassRules ? customBypassRules.split(',') : [];
    const customBlockRulesTotal = customBlockRules ? customBlockRules.split(',') : [];
    const customBypassRulesDomains = customBypassRulesTotal.filter(address => isDomain(address));
    const isDomainRule = [...outboundDomains, ...customBypassRulesDomains].length > 0;
    const isBlock = blockAds || blockPorn || customBlockRulesTotal.length > 0;
    const isBypass = bypassIran || bypassChina || bypassRussia || customBypassRulesTotal.length > 0;
    const rules = [
        {
            inboundTag: [
                "dns-in"
            ],
            outboundTag: "dns-out",
            type: "field"
        },
        {
            inboundTag: [
                "socks-in",
                "http-in"
            ],
            port: "53",
            outboundTag: "dns-out",
            type: "field"
        }
    ];

    if (!isWorkerLess && (isDomainRule || isBypass)) rules.push({
        ip: [localDNS],
        port: "53",
        network: "udp",
        outboundTag: "direct",
        type: "field"
    });

    if (isBypass || isBlock) {
        const createRule = (type, outbound) => ({
            [type]: [],
            outboundTag: outbound,
            type: "field"
        });

        let domainDirectRule, ipDirectRule;
        if (!isWorkerLess) {
            domainDirectRule = createRule("domain", "direct");
            ipDirectRule = createRule("ip", "direct");
        }

        let domainBlockRule = createRule("domain", "block");
        let ipBlockRule = createRule("ip", "block");
        geoRules.forEach(({ rule, type, domain, ip }) => {
            if (rule) {
                if (type === 'direct') {
                    domainDirectRule?.domain.push(domain);
                    ipDirectRule?.ip?.push(ip);
                } else {
                    domainBlockRule.domain.push(domain);
                }
            }
        });

        customBypassRulesTotal.forEach(address => {
            if (isDomain(address)) {
                domainDirectRule?.domain.push(`domain:${address}`);
            } else {
                ipDirectRule?.ip.push(address);
            }
        });

        customBlockRulesTotal.forEach(address => {
            if (isDomain(address)) {
                domainBlockRule.domain.push(`domain:${address}`);
            } else {
                ipBlockRule.ip.push(address);
            }
        });

        if (!isWorkerLess) {
            domainDirectRule.domain.length && rules.push(domainDirectRule);
            ipDirectRule.ip.length && rules.push(ipDirectRule);
        }

        domainBlockRule.domain.length && rules.push(domainBlockRule);
        ipBlockRule.ip.length && rules.push(ipBlockRule);
    }

    blockUDP443 && rules.push({
        network: "udp",
        port: "443",
        outboundTag: "block",
        type: "field",
    });

    if (isChain) {
        const rule = {
            [isBalancer ? "balancerTag" : "outboundTag"]: isBalancer ? "all-proxy" : "proxy",
            type: "field"
        };

        if (!isWarp) {
            const url = new URL(remoteDNS);
            const remoteDNSServer = url.hostname;
            rules.push({
                [isDomain(remoteDNSServer) ? "domain" : "ip"]: [remoteDNSServer],
                network: "tcp",
                ...rule
            });
        } else {
            rules.push({
                network: "udp",
                port: "53",
                ...rule
            });
        }
    }

    if (isBalancer) {
        rules.push({
            network: "tcp,udp",
            balancerTag: "all",
            type: "field"
        });
    } else {
        rules.push({
            network: "tcp,udp",
            outboundTag: isChain ? "chain" : isWorkerLess ? "fragment" : "proxy",
            type: "field"
        });
    }

    return rules;
}

// 构建 VLESS 出站配置
// tag: 配置标签
// address: 服务器地址
// port: 端口号
// host: 主机名
// sni: SNI 设置
// proxyIP: 代理 IP
// isFragment: 是否启用分片
// allowInsecure: 是否允许不安全连接
// enableIPv6: 是否启用 IPv6
function buildXrayVLESSOutbound(tag, address, port, host, sni, proxyIP, isFragment, allowInsecure, enableIPv6) {
    // 创建基础出站配置
    const outbound = {
        protocol: "vless",
        settings: {
            vnext: [
                {
                    address: address,
                    port: +port,
                    users: [
                        {
                            id: userID,
                            encryption: "none",
                            level: 8
                        }
                    ]
                }
            ]
        },
        streamSettings: {
            network: "ws",
            security: "none",
            sockopt: {},
            wsSettings: {
                headers: {
                    Host: host,
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36"
                },
                path: `/${getRandomPath(16)}${proxyIP ? `/${btoa(proxyIP)}` : ''}?ed=2560`
            }
        },
        tag: tag
    };

    if (defaultHttpsPorts.includes(port)) {
        outbound.streamSettings.security = "tls";
        outbound.streamSettings.tlsSettings = {
            allowInsecure: allowInsecure,
            fingerprint: "randomized",
            alpn: ["h2", "http/1.1"],
            serverName: sni
        };
    }

    const sockopt = outbound.streamSettings.sockopt;
    if (isFragment) {
        sockopt.dialerProxy = "fragment";
    } else {
        sockopt.tcpKeepAliveIdle = 30;
        sockopt.tcpNoDelay = true;
        sockopt.domainStrategy = enableIPv6 ? "UseIPv4v6" : "UseIPv4";
    }

    return outbound;
}

// 构建 Trojan 出站配置
// 参数说明同 VLESS
function buildXrayTrojanOutbound(tag, address, port, host, sni, proxyIP, isFragment, allowInsecure, enableIPv6) {
    const outbound = {
        protocol: "trojan",
        settings: {
            servers: [
                {
                    address: address,
                    port: +port,
                    password: trojanPassword,
                    level: 8
                }
            ]
        },
        streamSettings: {
            network: "ws",
            security: "none",
            sockopt: {},
            wsSettings: {
                headers: {
                    Host: host
                },
                path: `/tr${getRandomPath(16)}${proxyIP ? `/${btoa(proxyIP)}` : ''}?ed=2560`
            }
        },
        tag: tag
    };

    if (defaultHttpsPorts.includes(port)) {
        outbound.streamSettings.security = "tls";
        outbound.streamSettings.tlsSettings = {
            allowInsecure: allowInsecure,
            fingerprint: "randomized",
            alpn: ["h2", "http/1.1"],
            serverName: sni
        };
    }

    const sockopt = outbound.streamSettings.sockopt;
    if (isFragment) {
        sockopt.dialerProxy = "fragment";
    } else {
        sockopt.tcpKeepAliveIdle = 30;
        sockopt.tcpNoDelay = true;
        sockopt.domainStrategy = enableIPv6 ? "UseIPv4v6" : "UseIPv4";
    }

    return outbound;
}

// 构建 WARP 出站配置
// proxySettings: 代理设置
// warpConfigs: WARP 配置
// endpoint: WARP 端点
// isChain: 是否为链式代理
// client: 客户端类型
function buildXrayWarpOutbound(proxySettings, warpConfigs, endpoint, isChain, client) {
    const {
        warpEnableIPv6,
        nikaNGNoiseMode,
        noiseCountMin,
        noiseCountMax,
        noiseSizeMin,
        noiseSizeMax,
        noiseDelayMin,
        noiseDelayMax
    } = proxySettings;

    const {
        warpIPv6,
        reserved,
        publicKey,
        privateKey
    } = extractWireguardParams(warpConfigs, isChain);

    const outbound = {
        protocol: "wireguard",
        settings: {
            address: [
                "172.16.0.2/32",
                warpIPv6
            ],
            mtu: 1280,
            peers: [
                {
                    endpoint: endpoint,
                    publicKey: publicKey,
                    keepAlive: 5
                }
            ],
            reserved: base64ToDecimal(reserved),
            secretKey: privateKey
        },
        streamSettings: {
            sockopt: {
                dialerProxy: "proxy",
                domainStrategy: warpEnableIPv6 ? "UseIPv4v6" : "UseIPv4",
            }
        },
        tag: isChain ? "chain" : "proxy"
    };

    !isChain && delete outbound.streamSettings;
    client === 'nikang' && !isChain && Object.assign(outbound.settings, {
        wnoise: nikaNGNoiseMode,
        wnoisecount: noiseCountMin === noiseCountMax ? noiseCountMin : `${noiseCountMin}-${noiseCountMax}`,
        wpayloadsize: noiseSizeMin === noiseSizeMax ? noiseSizeMin : `${noiseSizeMin}-${noiseSizeMax}`,
        wnoisedelay: noiseDelayMin === noiseDelayMax ? noiseDelayMin : `${noiseDelayMin}-${noiseDelayMax}`
    });

    return outbound;
}

// 构建链式代理出站配置
// chainProxyParams: 链式代理参数
// enableIPv6: 是否启用 IPv6
function buildXrayChainOutbound(chainProxyParams, enableIPv6) {
    // 处理 SOCKS 和 HTTP 代理
    if (['socks', 'http'].includes(chainProxyParams.protocol)) {
        // 解构代理参数
        const { protocol, server, port, user, pass } = chainProxyParams;
        // 返回 SOCKS/HTTP 代理配置
        return {
            protocol: protocol, // 协议类型
            settings: {
                servers: [
                    {
                        address: server, // 服务器地址
                        port: +port,    // 端口号
                        users: [
                            {
                                user: user, // 用户名
                                pass: pass, // 密码
                                level: 8    // 用户等级
                            }
                        ]
                    }
                ]
            },
            streamSettings: {
                network: "tcp", // 传输协议
                sockopt: {
                    dialerProxy: "proxy", // 拨号代理
                    domainStrategy: enableIPv6 ? "UseIPv4v6" : "UseIPv4", // 域名策略
                    tcpNoDelay: true // TCP 无延迟
                }
            },
            mux: { // 多路复用
                enabled: true,
                concurrency: 8,          // 并发连接数
                xudpConcurrency: 16,     // XUDP 并发数
                xudpProxyUDP443: "reject" // 拒绝 UDP 443
            },
            tag: "chain" // 出站标签
        };
    }

    // 解构 VLESS 代理参数
    const {
        server,      // 服务器地址
        port,        // 端口
        uuid,        // UUID
        flow,        // 流控
        security,    // 安全类型
        type,        // 传输类型
        sni,         // SNI
        fp,          // 指纹
        alpn,        // ALPN
        pbk,         // 公钥
        sid,         // 会话 ID
        spx,         // SpiderX
        headerType,  // 头部类型
        host,        // 主机名
        path,        // 路径
        authority,   // 权限
        serviceName, // 服务名称
        mode         // 模式
    } = chainProxyParams;

    // 构建 VLESS 代理出站配置
    const proxyOutbound = {
        mux: { // 多路复用设置
            concurrency: 8,
            enabled: true,
            xudpConcurrency: 16,
            xudpProxyUDP443: "reject"
        },
        protocol: "vless", // VLESS 协议
        settings: {
            vnext: [
                {
                    address: server,
                    port: +port,
                    users: [
                        {
                            encryption: "none", // 加密方式
                            flow: flow,         // 流控方式
                            id: uuid,           // 用户 ID
                            level: 8,           // 用户等级
                            security: "auto"    // 安全设置
                        }
                    ]
                }
            ]
        },
        streamSettings: {
            network: type,     // 传输协议
            security: security, // 安全类型
            sockopt: {
                dialerProxy: "proxy",
                domainStrategy: enableIPv6 ? "UseIPv4v6" : "UseIPv4",
                tcpNoDelay: true
            }
        },
        tag: "chain"
    };

    // 配置 TLS 设置
    if (security === 'tls') {
        const tlsAlpns = alpn ? alpn?.split(',') : [];
        proxyOutbound.streamSettings.tlsSettings = {
            allowInsecure: false,     // 是否允许不安全连接
            fingerprint: fp,          // TLS 指纹
            alpn: tlsAlpns,          // ALPN 列表
            serverName: sni           // 服务器名称
        };
    }

    // 配置 Reality 设置
    if (security === 'reality') {
        delete proxyOutbound.mux;     // Reality 不支持多路复用
        proxyOutbound.streamSettings.realitySettings = {
            fingerprint: fp,          // Reality 指纹
            publicKey: pbk,           // 公钥
            serverName: sni,          // 服务器名称
            shortId: sid,             // 短 ID
            spiderX: spx              // SpiderX 设置
        };
    }

    // 配置 HTTP 请求头
    if (headerType === 'http') {
        const httpPaths = path?.split(',');
        const httpHosts = host?.split(',');
        proxyOutbound.streamSettings.tcpSettings = {
            header: {
                request: {
                    headers: { Host: httpHosts },
                    method: "GET",
                    path: httpPaths,
                    version: "1.1"
                },
                response: {
                    headers: { "Content-Type": ["application/octet-stream"] },
                    reason: "OK",
                    status: "200",
                    version: "1.1"
                },
                type: "http"
            }
        };
    }

    // 配置普通 TCP 设置
    if (type === 'tcp' && security !== 'reality' && !headerType) {
        proxyOutbound.streamSettings.tcpSettings = {
            header: {
                type: "none"
            }
        };
    }

    // 配置 WebSocket 设置
    if (type === 'ws') {
        proxyOutbound.streamSettings.wsSettings = {
            headers: { Host: host },
            path: path
        };
    }

    // 配置 gRPC 设置
    if (type === 'grpc') {
        delete proxyOutbound.mux;     // gRPC 不支持多路复用
        proxyOutbound.streamSettings.grpcSettings = {
            authority: authority,      // gRPC 权限
            multiMode: mode === 'multi', // 是否多模式
            serviceName: serviceName   // 服务名称
        };
    }

    return proxyOutbound;
}

// 构建基础 Xray 配置
// proxySettings: 代理设置参数
// remark: 配置备注
// isFragment: 是否启用分片
// isBalancer: 是否启用负载均衡
// isChain: 是否为链式代理
// balancerFallback: 负载均衡回退配置
// isWarp: 是否为 WARP 模式
function buildXrayConfig(proxySettings, remark, isFragment, isBalancer, isChain, balancerFallback, isWarp) {
    // 从代理设置中解构需要的参数
    const {
        vlessTrojanFakeDNS,  // VLESS/Trojan 伪装 DNS 开关
        enableIPv6,          // IPv6 开关
        warpFakeDNS,         // WARP 伪装 DNS 开关
        bestVLESSTrojanInterval,  // VLESS/Trojan 最佳延迟探测间隔
        bestWarpInterval,    // WARP 最佳延迟探测间隔
        lengthMin,           // 分片最小长度
        lengthMax,           // 分片最大长度
        intervalMin,         // 分片最小间隔
        intervalMax,         // 分片最大间隔
        fragmentPackets      // 分片包类型
    } = proxySettings;

    // 确定是否启用伪装 DNS
    const isFakeDNS = (vlessTrojanFakeDNS && !isWarp) || (warpFakeDNS && isWarp);
    
    // 克隆基础配置模板
    const config = structuredClone(xrayConfigTemp);
    
    // 设置配置备注
    config.remarks = remark;

    // 如果启用伪装 DNS，添加到入站探测配置
    if (isFakeDNS) {
        config.inbounds[0].sniffing.destOverride.push("fakedns");
        config.inbounds[1].sniffing.destOverride.push("fakedns");
    }

    // 处理分片配置
    if (isFragment) {
        // 获取分片设置对象
        const fragment = config.outbounds[0].settings.fragment;
        // 设置分片长度范围
        fragment.length = `${lengthMin}-${lengthMax}`;
        // 设置分片间隔范围
        fragment.interval = `${intervalMin}-${intervalMax}`;
        // 设置分片包类型
        fragment.packets = fragmentPackets;
        // 设置域名策略
        config.outbounds[0].settings.domainStrategy = enableIPv6 ? "UseIPv4v6" : "UseIPv4";
    } else {
        // 如果不启用分片，移除分片出站配置
        config.outbounds.shift();
    }

    // 处理负载均衡配置
    if (isBalancer) {
        // 根据模式选择探测间隔
        const interval = isWarp ? bestWarpInterval : bestVLESSTrojanInterval;
        // 设置探测间隔
        config.observatory.probeInterval = `${interval}s`;
        
        // 如果启用回退，设置回退标签
        if (balancerFallback) config.routing.balancers[0].fallbackTag = "prox-2";
        
        // 如果是链式代理
        if (isChain) {
            // 添加链式代理到探测对象
            config.observatory.subjectSelector.push("chain");
            // 克隆均衡器配置
            const chainBalancer = structuredClone(config.routing.balancers[0]);
            // 设置链式代理回退
            if (balancerFallback) chainBalancer.fallbackTag = "chain-2";
            // 添加链式代理均衡器
            config.routing.balancers.push({ ...chainBalancer, selector: ["chain"] });
            // 设置主均衡器标签
            config.routing.balancers[0].tag = "all-proxy";
        }
    } else {
        // 如果不启用负载均衡，移除相关配置
        delete config.observatory;
        delete config.routing.balancers;
    }

    return config;
}

// 构建最佳延迟配置
// proxySettings: 代理设置参数
// totalAddresses: 总地址列表
// chainProxy: 链式代理配置
// outbounds: 出站配置列表
// isFragment: 是否启用分片
async function buildXrayBestPingConfig(proxySettings, totalAddresses, chainProxy, outbounds, isFragment) {
    // 根据是否启用分片生成配置备注
    const remark = isFragment ? '💦 BPB F - Best Ping 💥' : '💦 BPB - Best Ping 💥';
    
    // 构建基础配置
    const config = buildXrayConfig(proxySettings, remark, isFragment, true, chainProxy, true);
    
    // 设置 DNS 配置
    config.dns = await buildXrayDNS(proxySettings, totalAddresses, undefined, false, false);
    
    // 设置路由规则
    config.routing.rules = buildXrayRoutingRules(proxySettings, totalAddresses, chainProxy, true, false, false);
    
    // 添加出站配置
    config.outbounds.unshift(...outbounds);

    return config;
}

// 构建最佳分片配置
// proxySettings: 代理设置参数
// hostName: 主机名
// chainProxy: 链式代理配置
// outbounds: 出站配置列表
async function buildXrayBestFragmentConfig(proxySettings, hostName, chainProxy, outbounds) {
    // 定义分片长度值列表
    const bestFragValues = ['10-20', '20-30', '30-40', '40-50', '50-60', '60-70',
        '70-80', '80-90', '90-100', '10-30', '20-40', '30-50',
        '40-60', '50-70', '60-80', '70-90', '80-100', '100-200'];

    // 构建基础配置
    const config = buildXrayConfig(proxySettings, '💦 BPB F - Best Fragment 😎', true, true, chainProxy, false, false);
    
    // 设置 DNS 配置
    config.dns = await buildXrayDNS(proxySettings, [], hostName, false, false);
    
    // 设置路由规则
    config.routing.rules = buildXrayRoutingRules(proxySettings, [], chainProxy, true, false, false);
    
    // 获取分片配置
    const fragment = config.outbounds.shift();
    const bestFragOutbounds = [];

    // 遍历分片长度值生成配置
    bestFragValues.forEach((fragLength, index) => {
        // 如果启用链式代理，添加链式代理配置
        if (chainProxy) {
            const chainOutbound = structuredClone(chainProxy);
            chainOutbound.tag = `chain-${index + 1}`;
            chainOutbound.streamSettings.sockopt.dialerProxy = `prox-${index + 1}`;
            bestFragOutbounds.push(chainOutbound);
        }

        // 克隆代理出站配置
        const proxyOutbound = structuredClone(outbounds[chainProxy ? 1 : 0]);
        proxyOutbound.tag = `prox-${index + 1}`;
        proxyOutbound.streamSettings.sockopt.dialerProxy = `frag-${index + 1}`;
        
        // 克隆分片配置并设置参数
        const fragmentOutbound = structuredClone(fragment);
        fragmentOutbound.tag = `frag-${index + 1}`;
        fragmentOutbound.settings.fragment.length = fragLength;
        fragmentOutbound.settings.fragment.interval = '1-1';
        
        // 添加到出站配置列表
        bestFragOutbounds.push(proxyOutbound, fragmentOutbound);
    });

    // 添加所有出站配置
    config.outbounds.unshift(...bestFragOutbounds);
    return config;
}

// 构建无 Worker 模式配置
// proxySettings: 代理设置参数
async function buildXrayWorkerLessConfig(proxySettings) {
    // 构建基础配置
    const config = buildXrayConfig(proxySettings, '💦 BPB F - WorkerLess ⭐', true, false, false, false, false);
    
    // 设置 DNS 配置
    config.dns = await buildXrayDNS(proxySettings, [], undefined, true);
    
    // 设置路由规则
    config.routing.rules = buildXrayRoutingRules(proxySettings, [], false, false, true, false);
    
    // 构建伪装出站配置
    const fakeOutbound = buildXrayVLESSOutbound('fake-outbound', 'google.com', '443', userID, 'google.com', 'google.com', '', true, false);
    
    // 移除 Socket 选项
    delete fakeOutbound.streamSettings.sockopt;
    
    // 设置 WebSocket 路径
    fakeOutbound.streamSettings.wsSettings.path = '/';
    
    // 添加出站配置
    config.outbounds.push(fakeOutbound);
    return config;
}

// 获取自定义 Xray 配置
// request: 请求对象
// env: 环境变量
// isFragment: 是否启用分片模式
export async function getXrayCustomConfigs(request, env, isFragment) {
    // 初始化基本参数
    await initializeParams(request, env);
    
    // 从 KV 存储获取代理设置
    const { kvNotFound, proxySettings } = await getDataset(request, env);
    if (kvNotFound) return await renderErrorPage(request, env, 'KV Dataset is not properly set!', null, true);
    
    // 初始化配置数组和变量
    let configs = [];        // 存储所有生成的配置
    let outbounds = [];      // 存储所有出站配置
    let protocols = [];      // 存储启用的协议
    let chainProxy;         // 链式代理配置
    
    // 从代理设置中解构需要的参数
    const {
        proxyIP,            // 代理 IP
        outProxy,           // 外部代理开关
        outProxyParams,     // 外部代理参数
        cleanIPs,           // 清洁 IP 列表
        enableIPv6,         // IPv6 开关
        customCdnAddrs,     // 自定义 CDN 地址
        customCdnHost,      // 自定义 CDN 主机名
        customCdnSni,       // 自定义 CDN SNI
        vlessConfigs,       // VLESS 配置开关
        trojanConfigs,      // Trojan 配置开关
        ports              // 端口列表
    } = proxySettings;

    // 如果启用了外部代理，构建链式代理配置
    if (outProxy) {
        const proxyParams = JSON.parse(outProxyParams);
        try {
            chainProxy = buildXrayChainOutbound(proxyParams, enableIPv6);
        } catch (error) {
            console.log('An error occured while parsing chain proxy: ', error);
            chainProxy = undefined;
            // 如果解析失败，清除外部代理设置
            await env.bpb.put("proxySettings", JSON.stringify({
                ...proxySettings,
                outProxy: '',
                outProxyParams: {}
            }));
        }
    }

    // 获取配置地址列表
    const Addresses = await getConfigAddresses(hostName, cleanIPs, enableIPv6);
    const customCdnAddresses = customCdnAddrs ? customCdnAddrs.split(',') : [];
    // 根据是否为分片模式决定总地址列表
    const totalAddresses = isFragment ? [...Addresses] : [...Addresses, ...customCdnAddresses];
    // 根据是否为分片模式过滤端口
    const totalPorts = ports.filter(port => isFragment ? defaultHttpsPorts.includes(port) : true);
    
    // 添加启用的协议到协议列表
    vlessConfigs && protocols.push('VLESS');
    trojanConfigs && protocols.push('Trojan');
    let proxyIndex = 1;

    // 遍历协议、端口和地址生成配置
    for (const protocol of protocols) {
        let protocolIndex = 1;
        for (const port of totalPorts) {
            for (const addr of totalAddresses) {
                // 确定地址类型和配置参数
                const isCustomAddr = customCdnAddresses.includes(addr);
                const configType = isCustomAddr ? 'C' : isFragment ? 'F' : '';
                const sni = isCustomAddr ? customCdnSni : randomUpperCase(hostName);
                const host = isCustomAddr ? customCdnHost : hostName;
                
                // 生成配置备注
                const remark = generateRemark(protocolIndex, port, addr, cleanIPs, protocol, configType);
                
                // 构建自定义配置
                const customConfig = buildXrayConfig(proxySettings, remark, isFragment, false, chainProxy, false, false);
                customConfig.dns = await buildXrayDNS(proxySettings, [addr], undefined);
                customConfig.routing.rules = buildXrayRoutingRules(proxySettings, [addr], chainProxy, false, false, false);
                
                // 根据协议类型构建出站配置
                const outbound = protocol === 'VLESS'
                    ? buildXrayVLESSOutbound('proxy', addr, port, host, sni, proxyIP, isFragment, isCustomAddr, enableIPv6)
                    : buildXrayTrojanOutbound('proxy', addr, port, host, sni, proxyIP, isFragment, isCustomAddr, enableIPv6);

                // 添加出站配置到自定义配置
                customConfig.outbounds.unshift({ ...outbound });
                outbound.tag = `prox-${proxyIndex}`;

                // 如果启用了链式代理，添加链式代理配置
                if (chainProxy) {
                    customConfig.outbounds.unshift(chainProxy);
                    const chainOutbound = structuredClone(chainProxy);
                    chainOutbound.tag = `chain-${proxyIndex}`;
                    chainOutbound.streamSettings.sockopt.dialerProxy = `prox-${proxyIndex}`;
                    outbounds.push(chainOutbound);
                }

                // 保存配置
                outbounds.push(outbound);
                configs.push(customConfig);
                proxyIndex++;
                protocolIndex++;
            }
        }
    }

    // 构建最佳延迟配置
    const bestPing = await buildXrayBestPingConfig(proxySettings, totalAddresses, chainProxy, outbounds, isFragment);
    const finalConfigs = [...configs, bestPing];
    
    // 如果是分片模式，添加最佳分片配置和无 Worker 配置
    if (isFragment) {
        const bestFragment = await buildXrayBestFragmentConfig(proxySettings, hostName, chainProxy, outbounds);
        const workerLessConfig = await buildXrayWorkerLessConfig(proxySettings);
        finalConfigs.push(bestFragment, workerLessConfig);
    }
    
    // 返回 JSON 格式的配置
    return new Response(JSON.stringify(finalConfigs, null, 4), {
        status: 200,
        headers: {
            'Content-Type': 'text/plain;charset=utf-8',
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            'CDN-Cache-Control': 'no-store'
        }
    });
}

// 获取 WARP 配置
// request: 请求对象
// env: 环境变量
// client: 客户端类型
export async function getXrayWarpConfigs(request, env, client) {
    // 获取 KV 存储中的配置数据
    const { kvNotFound, proxySettings, warpConfigs } = await getDataset(request, env);
    if (kvNotFound) return await renderErrorPage(request, env, 'KV Dataset is not properly set!', null, true);

    // 初始化配置数组
    const xrayWarpConfigs = []; // 普通 WARP 配置
    const xrayWoWConfigs = []; // WARP over WARP 配置
    const xrayWarpOutbounds = []; // WARP 出站配置
    const xrayWoWOutbounds = []; // WARP over WARP 出站配置
    
    // 从代理设置中获取 WARP 端点
    const { warpEndpoints } = proxySettings;
    
    // 提取域名类型的出站地址
    const outboundDomains = warpEndpoints.split(',')
        .map(endpoint => endpoint.split(':')[0])
        .filter(address => isDomain(address));
    
    // 确定客户端类型标识
    const proIndicator = client === 'nikang' ? ' Pro ' : ' ';

    // 遍历所有 WARP 端点生成配置
    for (const [index, endpoint] of warpEndpoints.split(',').entries()) {
        // 获取端点主机名
        const endpointHost = endpoint.split(':')[0];
        
        // 构建基础 WARP 配置
        const warpConfig = buildXrayConfig(proxySettings, 
            `💦 ${index + 1} - Warp${proIndicator}🇮🇷`, // 配置名称
            false, // 不启用分
            false, // 不启用负载均衡
            false, // 不启用链式代理
            false, // 不启用均衡器回退
            true   // 启用 WARP 模式
        );
        
        // 构建 WARP over WARP 配置
        const WoWConfig = buildXrayConfig(proxySettings,
            `💦 ${index + 1} - WoW${proIndicator}🌍`,
            false,
            false,
            true,  // 启用链式代理
            false,
            true
        );

        // 设置 DNS 配置
        warpConfig.dns = WoWConfig.dns = await buildXrayDNS(
            proxySettings,
            [endpointHost],
            undefined,
            false,
            true
        );

        // 设置路由规则
        warpConfig.routing.rules = buildXrayRoutingRules(
            proxySettings,
            [endpointHost],
            false,
            false,
            false,
            true
        );
        WoWConfig.routing.rules = buildXrayRoutingRules(
            proxySettings,
            [endpointHost],
            true,
            false,
            false,
            true
        );

        // 构建出站配置
        const warpOutbound = buildXrayWarpOutbound(proxySettings, warpConfigs, endpoint, false, client);
        const WoWOutbound = buildXrayWarpOutbound(proxySettings, warpConfigs, endpoint, true, client);

        // 添加出站配置到主配置中
        warpConfig.outbounds.unshift(warpOutbound);
        WoWConfig.outbounds.unshift(WoWOutbound, warpOutbound);

        // 保存配置
        xrayWarpConfigs.push(warpConfig);
        xrayWoWConfigs.push(WoWConfig);

        // 创建用于最佳延迟配置的出站副本
        const proxyOutbound = structuredClone(warpOutbound);
        proxyOutbound.tag = `prox-${index + 1}`;
        const chainOutbound = structuredClone(WoWOutbound);
        chainOutbound.tag = `chain-${index + 1}`;
        chainOutbound.streamSettings.sockopt.dialerProxy = `prox-${index + 1}`;
        
        // 保存出站配置
        xrayWarpOutbounds.push(proxyOutbound);
        xrayWoWOutbounds.push(chainOutbound);
    }

    // 构建最佳延迟配置
    const dnsObject = await buildXrayDNS(proxySettings, outboundDomains, undefined, false, true);
    
    // WARP 最佳延迟配置
    const xrayWarpBestPing = buildXrayConfig(proxySettings, 
        `💦 Warp${proIndicator}- Best Ping 🚀`,
        false,
        true,  // 启用负载均衡
        false,
        false,
        true
    );
    xrayWarpBestPing.dns = dnsObject;
    xrayWarpBestPing.routing.rules = buildXrayRoutingRules(
        proxySettings,
        outboundDomains,
        false,
        true,
        false,
        true
    );
    xrayWarpBestPing.outbounds.unshift(...xrayWarpOutbounds);

    // WARP over WARP 最佳延迟配置
    const xrayWoWBestPing = buildXrayConfig(proxySettings,
        `💦 WoW${proIndicator}- Best Ping 🚀`,
        false,
        true,
        true,
        false,
        true
    );
    xrayWoWBestPing.dns = dnsObject;
    xrayWoWBestPing.routing.rules = buildXrayRoutingRules(
        proxySettings,
        outboundDomains,
        true,
        true,
        false,
        true
    );
    xrayWoWBestPing.outbounds.unshift(...xrayWoWOutbounds, ...xrayWarpOutbounds);

    // 合并所有配置
    const configs = [...xrayWarpConfigs, ...xrayWoWConfigs, xrayWarpBestPing, xrayWoWBestPing];

    // 返回 JSON 格式的配置
    return new Response(JSON.stringify(configs, null, 4), {
        status: 200,
        headers: {
            'Content-Type': 'text/plain;charset=utf-8',
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            'CDN-Cache-Control': 'no-store'
        }
    });
}

// Xray 配置模板
const xrayConfigTemp = {
    remarks: "", // 配置备注
    log: {
        loglevel: "warning", // 日志级别
    },
    dns: {}, // DNS 配置
    inbounds: [ // 入站配置
        {
            port: 10808, // SOCKS 代理端口
            protocol: "socks", // SOCKS 协议
            settings: {
                auth: "noauth", // 无认证
                udp: true, // 启用 UDP
                userLevel: 8, // 用户等级
            },
            sniffing: { // 流量探测
                destOverride: ["http", "tls"], // 探测类型
                enabled: true, // 启用探测
                routeOnly: true // 仅用于路由
            },
            tag: "socks-in", // SOCKS 入站标签
        },
        {
            port: 10809, // HTTP 代理端口
            protocol: "http", // HTTP 协议
            settings: {
                auth: "noauth",
                udp: true,
                userLevel: 8,
            },
            sniffing: {
                destOverride: ["http", "tls"],
                enabled: true,
                routeOnly: true
            },
            tag: "http-in", // HTTP 入站标签
        },
        {
            listen: "127.0.0.1", // DNS 监听地址
            port: 10853, // DNS 端口
            protocol: "dokodemo-door", // 任意门协议
            settings: {
                address: "1.1.1.1", // DNS 服务器地址
                network: "tcp,udp", // 网络类型
                port: 53 // DNS 端口
            },
            tag: "dns-in" // DNS 入站标签
        }
    ],
    outbounds: [ // 出站配置
        {
            tag: "fragment", // 分片标签
            protocol: "freedom", // Freedom 协议
            settings: {
                fragment: { // 分片设置
                    packets: "tlshello", // 分片包类型
                    length: "", // 分片长度
                    interval: "", // 分片间隔
                },
                domainStrategy: "UseIP" // 域名策略
            },
            streamSettings: {
                sockopt: { // Socket 选项
                    tcpKeepAliveIdle: 30, // TCP 保活空闲时间
                    tcpNoDelay: true // TCP 无延迟
                },
            },
        },
        {
            protocol: "dns", // DNS 协议
            tag: "dns-out" // DNS 出站标签
        },
        {
            protocol: "freedom", // 直连协议
            settings: {},
            tag: "direct", // 直连标签
        },
        {
            protocol: "blackhole", // 黑洞协议
            settings: {
                response: {
                    type: "http", // 响应类型
                },
            },
            tag: "block", // 阻断标签
        },
    ],
    policy: { // 策略配置
        levels: {
            8: { // 用户等级 8 的策略
                connIdle: 300, // 空闲超时
                downlinkOnly: 1, // 下行超时
                handshake: 4, // 握手超时
                uplinkOnly: 1, // 上行超时
            }
        },
        system: { // 系统策略
            statsOutboundUplink: true, // 统计出站上行流量
            statsOutboundDownlink: true, // 统计出站下行流量
        }
    },
    routing: { // 路由配置
        domainStrategy: "IPIfNonMatch", // 域名策略
        rules: [], // 路由规则
        balancers: [ // 负载均衡器
            {
                tag: "all", // 均衡器标签
                selector: ["prox"], // 选择器
                strategy: { // 均衡策略
                    type: "leastPing", // 最小延迟
                },
            }
        ]
    },
    observatory: { // 观测器配置
        probeInterval: "30s", // 探测间隔
        probeURL: "https://www.gstatic.com/generate_204", // 探测 URL
        subjectSelector: ["prox"], // 探测对象选择器
        EnableConcurrency: true, // 启用并发
    },
    stats: {} // 统计配置
};