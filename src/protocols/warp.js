import nacl from 'tweetnacl';

// 获取 Warp 配置的主函数
export async function fetchWarpConfigs (env, proxySettings) {
    let warpConfigs = [];
    // Cloudflare WARP API 的基础 URL
    const apiBaseUrl = 'https://api.cloudflareclient.com/v0a4005/reg';
    // 从代理设置中获取 Warp+ 许可证
    const { warpPlusLicense } = proxySettings;
    // 生成两对密钥（一对用于普通 Warp，一对用于 WoW）
    const warpKeys = [ generateKeyPair(), generateKeyPair() ];
    // 创建通用的请求负载
    const commonPayload = {
        install_id: "",
        fcm_token: "",
        tos: new Date().toISOString(),  // 当前时间作为服务条款接受时间
        type: "Android",                // 模拟 Android 设备
        model: 'PC',                    // 设备型号
        locale: 'en_US',                // 地区设置
        warp_enabled: true              // 启用 WARP
    };

    // 创建 WARP 账户的函数
    const fetchAccount = async (key) => {
        const response = await fetch(apiBaseUrl, {
            method: 'POST',
            headers: {
                'User-Agent': 'insomnia/8.6.1',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ ...commonPayload, key: key.publicKey })
        });
        return await response.json();
    };

    // 更新 WARP 账户的函数（用于升级到 WARP+）
    const updateAccount = async (accountData, key) => {
        const response = await fetch(`${apiBaseUrl}/${accountData.id}/account`, {
            method: 'PUT',
            headers: {
                'User-Agent': 'insomnia/8.6.1',
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accountData.token}`
            },
            body: JSON.stringify({ ...commonPayload, key: key.publicKey, license: warpPlusLicense })
        });
        return {
            status: response.status,
            data: await response.json()
        };
    };

    // 为每对密钥创建和更新账户
    for (const key of warpKeys) {
        // 创建新账户
        const accountData = await fetchAccount(key);
        warpConfigs.push({
            privateKey: key.privateKey,
            account: accountData
        });

        // 如果提供了 WARP+ 许可证，尝试升级账户
        if (warpPlusLicense) {
            const { status, data: responseData } = await updateAccount(accountData, key);
            // 如果升级失败，返回错误信息
            if (status !== 200 && !responseData.success) {
                return { error: responseData.errors[0]?.message, configs: null };
            }
        }
    }
    
    // 将配置保存到 KV 存储
    const configs = JSON.stringify(warpConfigs)
    await env.bpb.put('warpConfigs', configs);
    return { error: null, configs };
}

// 生成 WARP 密钥对的函数
const generateKeyPair = () => {
    // Base64 编码函数
    const base64Encode = (array) => btoa(String.fromCharCode.apply(null, array));
    // 生成随机私钥
	let privateKey = nacl.randomBytes(32);
    // 应用 WARP 密钥格式要求
	privateKey[0] &= 248;
	privateKey[31] &= 127;
	privateKey[31] |= 64;
    // 生成对应的公钥
	let publicKey = nacl.scalarMult.base(privateKey);
    // 将密钥转换为 Base64 格式
	const publicKeyBase64 = base64Encode(publicKey);
	const privateKeyBase64 = base64Encode(privateKey);
	return { publicKey: publicKeyBase64, privateKey: privateKeyBase64 };
};