import { fetchWarpConfigs } from '../protocols/warp';
import { isDomain, resolveDNS } from '../helpers/helpers';
import { initializeParams, panelVersion } from '../helpers/init';
import { Authenticate } from '../authentication/auth';
import { renderErrorPage } from '../pages/error';

/**
 * 获取面板数据集，包括代理设置和 Warp 配置
 * @param {Request} request 请求对象
 * @param {*} env 环境变量
 * @returns {Promise<{kvNotFound: boolean, proxySettings: any, warpConfigs: any}>} 返回数据集对象
 */
export async function getDataset(request, env) {
    await initializeParams(request, env);
    let proxySettings, warpConfigs;
    // 检查 KV 存储是否可用
    if (typeof env.bpb !== 'object') {
        return {kvNotFound: true, proxySettings: null, warpConfigs: null}
    }

    try {
        // 从 KV 存储获取设置和配置
        proxySettings = await env.bpb.get("proxySettings", {type: 'json'});
        warpConfigs = await env.bpb.get('warpConfigs', {type: 'json'});
    } catch (error) {
        console.log(error);
        throw new Error(`获取 KV 时发生错误 - ${error}`);
    }

    // 如果没有代理设置，创建新的设置并获取 Warp 配置
    if (!proxySettings) {
        proxySettings = await updateDataset(request, env);
        const { error, configs } = await fetchWarpConfigs(env, proxySettings);
        if (error) throw new Error(`获取 Warp 配置时发生错误 - ${error}`);
        warpConfigs = configs;
    }
    
    // 如果面板版本不匹配，更新设置
    if (panelVersion !== proxySettings.panelVersion) proxySettings = await updateDataset(request, env);
    return {kvNotFound: false, proxySettings, warpConfigs}
}

/**
 * 更新面板数据集
 * @param {Request} request 请求对象
 * @param {*} env 环境变量
 * @returns {Promise<any>} 返回更新后的代理设置
 */
export async function updateDataset (request, env) {
    await initializeParams(request, env);
    // 获取新设置（如果是 POST 请求）
    let newSettings = request.method === 'POST' ? await request.formData() : null;
    const isReset = newSettings?.get('resetSettings') === 'true';
    let currentSettings;

    if (!isReset) {
        try {
            // 获取当前设置
            currentSettings = await env.bpb.get("proxySettings", {type: 'json'});
        } catch (error) {
            console.log(error);
            throw new Error(`获取当前 KV 设置时发生错误 - ${error}`);
        }
    } else {
        // 如果是重置，删除 Warp 配置
        await env.bpb.delete('warpConfigs');
        newSettings = null;
    }

    // 验证字段值的辅助函数
    const validateField = (field) => {
        const fieldValue = newSettings?.get(field);
        if (fieldValue === undefined) return null;
        if (fieldValue === 'true') return true;
        if (fieldValue === 'false') return false;
        return fieldValue;
    }

    // 构建代理设置对象
    const remoteDNS = validateField('remoteDNS') ?? currentSettings?.remoteDNS ?? 'https://8.8.8.8/dns-query';
    const enableIPv6 = validateField('enableIPv6') ?? currentSettings?.enableIPv6 ?? true;
    const url = new URL(remoteDNS);
    const remoteDNSServer = url.hostname;
    const isServerDomain = isDomain(remoteDNSServer);
    let resolvedRemoteDNS = {};

    // 如果 DNS 服务器是域名，解析其 IP
    if (isServerDomain) {
        try {
            const resolvedDomain = await resolveDNS(remoteDNSServer);
            resolvedRemoteDNS = {
                server: remoteDNSServer,
                staticIPs: enableIPv6 ? [...resolvedDomain.ipv4, ...resolvedDomain.ipv6] : resolvedDomain.ipv4
            };
        } catch (error) {
            console.log(error);
            throw new Error(`解析远程 DNS 服务器失败，请重试！ - ${error}`);
        }
    } 

    // 构建完整的代理设置对象
    const proxySettings = {
        remoteDNS: remoteDNS,
        resolvedRemoteDNS: resolvedRemoteDNS,
        localDNS: validateField('localDNS') ?? currentSettings?.localDNS ?? '8.8.8.8',
        vlessTrojanFakeDNS: validateField('vlessTrojanFakeDNS') ?? currentSettings?.vlessTrojanFakeDNS ?? false,
        proxyIP: validateField('proxyIP')?.replaceAll(' ', '') ?? currentSettings?.proxyIP ?? '',
        outProxy: validateField('outProxy') ?? currentSettings?.outProxy ?? '',
        outProxyParams: extractChainProxyParams(validateField('outProxy')) ?? currentSettings?.outProxyParams ?? {},
        cleanIPs: validateField('cleanIPs')?.replaceAll(' ', '') ?? currentSettings?.cleanIPs ?? '',
        enableIPv6: enableIPv6,
        customCdnAddrs: validateField('customCdnAddrs')?.replaceAll(' ', '') ?? currentSettings?.customCdnAddrs ?? '',
        customCdnHost: validateField('customCdnHost')?.trim() ?? currentSettings?.customCdnHost ?? '',
        customCdnSni: validateField('customCdnSni')?.trim() ?? currentSettings?.customCdnSni ?? '',
        bestVLESSTrojanInterval: validateField('bestVLESSTrojanInterval') ?? currentSettings?.bestVLESSTrojanInterval ?? '30',
        vlessConfigs: validateField('vlessConfigs') ?? currentSettings?.vlessConfigs ?? true,
        trojanConfigs: validateField('trojanConfigs') ?? currentSettings?.trojanConfigs ?? false,
        ports: validateField('ports')?.split(',') ?? currentSettings?.ports ?? ['443'],
        lengthMin: validateField('fragmentLengthMin') ?? currentSettings?.lengthMin ?? '100',
        lengthMax: validateField('fragmentLengthMax') ?? currentSettings?.lengthMax ?? '200',
        intervalMin: validateField('fragmentIntervalMin') ?? currentSettings?.intervalMin ?? '1',
        intervalMax: validateField('fragmentIntervalMax') ?? currentSettings?.intervalMax ?? '1',
        fragmentPackets: validateField('fragmentPackets') ?? currentSettings?.fragmentPackets ?? 'tlshello',
        bypassLAN: validateField('bypass-lan') ?? currentSettings?.bypassLAN ?? false,
        bypassIran: validateField('bypass-iran') ?? currentSettings?.bypassIran ?? false,
        bypassChina: validateField('bypass-china') ?? currentSettings?.bypassChina ?? false,
        bypassRussia: validateField('bypass-russia') ?? currentSettings?.bypassRussia ?? false,
        blockAds: validateField('block-ads') ?? currentSettings?.blockAds ?? false,
        blockPorn: validateField('block-porn') ?? currentSettings?.blockPorn ?? false,
        blockUDP443: validateField('block-udp-443') ?? currentSettings?.blockUDP443 ?? false,
        customBypassRules: validateField('customBypassRules')?.replaceAll(' ', '') ?? currentSettings?.customBypassRules ?? '',
        customBlockRules: validateField('customBlockRules')?.replaceAll(' ', '') ?? currentSettings?.customBlockRules ?? '',
        warpEndpoints: validateField('warpEndpoints')?.replaceAll(' ', '') ?? currentSettings?.warpEndpoints ?? 'engage.cloudflareclient.com:2408',
        warpFakeDNS: validateField('warpFakeDNS') ?? currentSettings?.warpFakeDNS ?? false,
        warpEnableIPv6: validateField('warpEnableIPv6') ?? currentSettings?.warpEnableIPv6 ?? true,
        warpPlusLicense: validateField('warpPlusLicense') ?? currentSettings?.warpPlusLicense ?? '',
        bestWarpInterval: validateField('bestWarpInterval') ?? currentSettings?.bestWarpInterval ?? '30',
        hiddifyNoiseMode: validateField('hiddifyNoiseMode') ?? currentSettings?.hiddifyNoiseMode ?? 'm4',
        nikaNGNoiseMode: validateField('nikaNGNoiseMode') ?? currentSettings?.nikaNGNoiseMode ?? 'quic',
        noiseCountMin: validateField('noiseCountMin') ?? currentSettings?.noiseCountMin ?? '10',
        noiseCountMax: validateField('noiseCountMax') ?? currentSettings?.noiseCountMax ?? '15',
        noiseSizeMin: validateField('noiseSizeMin') ?? currentSettings?.noiseSizeMin ?? '5',
        noiseSizeMax: validateField('noiseSizeMax') ?? currentSettings?.noiseSizeMax ?? '10',
        noiseDelayMin: validateField('noiseDelayMin') ?? currentSettings?.noiseDelayMin ?? '1',
        noiseDelayMax: validateField('noiseDelayMax') ?? currentSettings?.noiseDelayMax ?? '1',
        panelVersion: panelVersion
    };

    try {    
        // 将设置保存到 KV 存储
        await env.bpb.put("proxySettings", JSON.stringify(proxySettings));          
    } catch (error) {
        console.log(error);
        throw new Error(`更新 KV 时发生错误 - ${error}`);
    }

    return proxySettings;
}

/**
 * 从链式代理 URL 中提取参数
 * @param {string} chainProxy 链式代理 URL
 * @returns {object} 提取的参数对象
 */
function extractChainProxyParams(chainProxy) {
    let configParams = {};
    if (!chainProxy) return {};
    const url = new URL(chainProxy);
    const protocol = url.protocol.slice(0, -1);

    // 处理 VLESS 协议
    if (protocol === 'vless') {
        const params = new URLSearchParams(url.search);
        configParams = {
            protocol: protocol,
            uuid : url.username,
            server : url.hostname,
            port : url.port
        };
    
        params.forEach( (value, key) => {
            configParams[key] = value;
        });
    } else {
        // 处理其他协议（如 Socks、HTTP）
        configParams = {
            protocol: protocol, 
            user : url.username,
            pass : url.password,
            server : url.host,
            port : url.port
        };
    }

    return JSON.stringify(configParams);
}

/**
 * 更新 Warp 配置的处理函数
 * @param {Request} request 请求对象
 * @param {*} env 环境变量
 * @returns {Promise<Response>} 返回响应对象
 */
export async function updateWarpConfigs(request, env) {
    // 验证用户身份
    const auth = await Authenticate(request, env); 
    if (!auth) return new Response('未授权', { status: 401 });

    if (request.method === 'POST') {
        try {
            const { kvNotFound, proxySettings } = await getDataset(request, env);
            if (kvNotFound) return await renderErrorPage(request, env, 'KV 数据集未正确设置！', null, true);
            const { error: warpPlusError } = await fetchWarpConfigs(env, proxySettings);
            if (warpPlusError) return new Response(warpPlusError, { status: 400 });
            return new Response('Warp 配置更新成功', { status: 200 });
        } catch (error) {
            console.log(error);
            return new Response(`更新 Warp 配置时发生错误！ - ${error}`, { status: 500 });
        }
    } else {
        return new Response('不支持的请求方法', { status: 405 });
    }
}