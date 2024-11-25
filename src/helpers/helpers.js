import { Authenticate } from "../authentication/auth";
import { getDataset, updateDataset } from "../kv/handlers";
import { renderErrorPage } from "../pages/error";
import { renderHomePage } from "../pages/home";
import { initializeParams, origin } from "./init";

/**
 * 验证 UUID 格式是否有效
 * @param {string} uuid 要验证的 UUID 字符串
 * @returns {boolean} 如果 UUID 格式有效返回 true，否则返回 false
 */
export function isValidUUID(uuid) {
	const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[4][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
	return uuidRegex.test(uuid);
}

/**
 * 解析域名的 DNS 记录，获取 IPv4 和 IPv6 地址
 * @param {string} domain 要解析的域名
 * @returns {Promise<{ipv4: string[], ipv6: string[]}>} 返回包含 IPv4 和 IPv6 地址数组的对象
 */
export async function resolveDNS (domain) {
    const dohURL = 'https://cloudflare-dns.com/dns-query';
    const dohURLv4 = `${dohURL}?name=${encodeURIComponent(domain)}&type=A`;
    const dohURLv6 = `${dohURL}?name=${encodeURIComponent(domain)}&type=AAAA`;

    try {
        // 并行请求 IPv4 和 IPv6 记录
        const [ipv4Response, ipv6Response] = await Promise.all([
            fetch(dohURLv4, { headers: { accept: 'application/dns-json' } }),
            fetch(dohURLv6, { headers: { accept: 'application/dns-json' } })
        ]);

        const ipv4Addresses = await ipv4Response.json();
        const ipv6Addresses = await ipv6Response.json();

        // 提取 IP 地址
        const ipv4 = ipv4Addresses.Answer
            ? ipv4Addresses.Answer.map((record) => record.data)
            : [];
        const ipv6 = ipv6Addresses.Answer
            ? ipv6Addresses.Answer.map((record) => record.data)
            : [];

        return { ipv4, ipv6 };
    } catch (error) {
        console.error('DNS 解析错误:', error);
        throw new Error(`DNS 解析过程中发生错误 - ${error}`);
    }
}

/**
 * 检查字符串是否为有效域名
 * @param {string} address 要检查的字符串
 * @returns {boolean} 如果是有效域名返回 true，否则返回 false
 */
export function isDomain(address) {
    const domainPattern = /^(?!\-)(?:[A-Za-z0-9\-]{1,63}\.)+[A-Za-z]{2,}$/;
    return domainPattern.test(address);
}

/**
 * 处理面板请求的主函数
 * @param {Request} request 请求对象
 * @param {Object} env 环境变量
 * @returns {Promise<Response>} 返回响应对象
 */
export async function handlePanel(request, env) {
    await initializeParams(request, env);
    // 验证用户身份
    const auth = await Authenticate(request, env); 
    if (request.method === 'POST') {     
        if (!auth) return new Response('未授权或会话已过期！', { status: 401 });             
        await updateDataset(request, env); 
        return new Response('成功', { status: 200 });
    }
        
    // 获取面板数据并处理
    const { kvNotFound, proxySettings } = await getDataset(request, env);
    if (kvNotFound) return await renderErrorPage(request, env, 'KV 数据集未正确设置！', null, true);
    const pwd = await env.bpb.get('pwd');
    if (pwd && !auth) return Response.redirect(`${origin}/login`, 302);
    const isPassSet = pwd?.length >= 8;
    return await renderHomePage(request, env, proxySettings, isPassSet);
}

/**
 * 处理默认回退请求，将请求重定向到 speedtest.net
 * @param {Request} request 请求对象
 * @returns {Promise<Response>} 返回响应对象
 */
export async function fallback(request) {
    const url = new URL(request.url);
    url.hostname = 'www.speedtest.net';
    url.protocol = 'https:';
    request = new Request(url, request);
    return await fetch(request);
}

/**
 * 获取客户端 IP 信息
 * @param {Request} request 请求对象
 * @returns {Promise<Response>} 返回包含 IP 信息的响应对象
 */
export async function getMyIP(request) {
    const ip = await request.text();
    try {
        // 获取 IP 地理位置信息
        const response = await fetch(`http://ip-api.com/json/${ip}?nocache=${Date.now()}`);
        const geoLocation = await response.json();
        return new Response(JSON.stringify(geoLocation), {
            status: 200,
            headers: {
                'Content-Type': 'text/plain;charset=utf-8'
            }
        });
    } catch (error) {
        console.error('获取 IP 地址时出错:', error);
    }
}