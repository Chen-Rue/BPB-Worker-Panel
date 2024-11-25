import { isValidUUID } from './helpers';

// 默认代理 IP 设置
const defaultProxyIP = 'bpb.yousef.isegaro.com';

// 全局变量声明
let userID,              // 用户 UUID
    dohURL,             // DNS over HTTPS 服务器地址
    proxyIP,            // 代理 IP
    trojanPassword,     // Trojan 协议密码
    defaultHttpPorts,   // 默认 HTTP 端口列表
    defaultHttpsPorts,  // 默认 HTTPS 端口列表
    panelVersion,       // 面板版本号
    hostName,           // 主机名
    origin,             // 请求源
    client,             // 客户端类型
    pathName;           // 请求路径

/**
 * 初始化参数函数
 * 设置所有必要的全局变量和配置
 * @param {Request} request - 请求对象
 * @param {Object} env - 环境变量对象
 */
function initParams(request, env) {
    // 处理代理 IP 列表（如果有多个，用逗号分隔）
    const proxyIPs = env.PROXYIP?.split(',').map(proxyIP => proxyIP.trim());
    
    // 设置用户 UUID，如果环境变量中没有则使用默认值
    userID = env.UUID || '89b3cbba-e6ac-485a-9481-976a0415eab9';
    // 验证 UUID 格式
    if (!isValidUUID(userID)) throw new Error(`无效的 UUID: ${userID}`);
    
    // 设置 DNS over HTTPS 服务器地址
    dohURL = env.DOH_URL || 'https://cloudflare-dns.com/dns-query';
    
    // 从代理 IP 列表中随机选择一个，如果没有则使用默认值
    proxyIP = proxyIPs ? proxyIPs[Math.floor(Math.random() * proxyIPs.length)] : defaultProxyIP;
    
    // 设置 Trojan 密码
    trojanPassword = env.TROJAN_PASS || 'bpb-trojan';
    
    // 设置默认的 HTTP 和 HTTPS 端口列表
    defaultHttpPorts = ['80', '8080', '2052', '2082', '2086', '2095', '8880'];
    defaultHttpsPorts = ['443', '8443', '2053', '2083', '2087', '2096'];
    
    // 设置面板版本
    panelVersion = '2.7.5';
    
    // 从请求中获取主机名
    hostName = request.headers.get('Host');
    
    // 解析请求 URL 并获取相关参数
    const url = new URL(request.url);
    const searchParams = new URLSearchParams(url.search);
    client = searchParams.get('app');  // 获取客户端类型参数
    origin = url.origin;               // 获取请求源
    pathName = url.pathname;           // 获取请求路径
}

/**
 * 初始化参数的异步包装函数
 * 提供 Promise 接口以支持异步操作
 * @param {Request} request - 请求对象
 * @param {Object} env - 环境变量对象
 * @returns {Promise<void>}
 */
export function initializeParams(request, env) {
    initParams(request, env);
    return Promise.resolve();
}

// 导出所有需要在其他模块中使用的变量
export { 
    userID,             // 用户 UUID
    dohURL,            // DNS over HTTPS 服务器地址
    proxyIP,           // 代理 IP
    trojanPassword,    // Trojan 密码
    hostName,          // 主机名
    origin,            // 请求源
    client,            // 客户端类型
    pathName,          // 请求路径
    defaultHttpPorts,  // 默认 HTTP 端口列表
    defaultHttpsPorts, // 默认 HTTPS 端口列表
    panelVersion       // 面板版本号
};
