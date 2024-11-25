// BPB Worker Panel - 主要处理程序
// GitHub: https://github.com/bia-pain-bache/BPB-Worker-Panel

// 导入各种协议处理器和功能模块
import { vlessOverWSHandler } from './protocols/vless';           // VLESS 协议处理
import { trojanOverWSHandler } from './protocols/trojan';         // Trojan 协议处理
import { updateWarpConfigs } from './kv/handlers';               // Warp 配置更新处理
import { logout, resetPassword, login } from './authentication/auth';  // 认证相关功能
import { renderErrorPage } from './pages/error';                  // 错误页面渲染
import { getXrayCustomConfigs, getXrayWarpConfigs } from './cores-configs/xray';       // Xray 配置生成
import { getSingBoxCustomConfig, getSingBoxWarpConfig } from './cores-configs/sing-box'; // SingBox 配置生成
import { getClashNormalConfig, getClashWarpConfig } from './cores-configs/clash';       // Clash 配置生成
import { getNormalConfigs } from './cores-configs/normalConfigs'; // 通用配置生成
import { initializeParams, userID, client, pathName } from './helpers/init';  // 初始化参数
import { fallback, getMyIP, handlePanel } from './helpers/helpers';  // 辅助功能

export default {
    async fetch(request, env) {
        try {          
            // 获取 Upgrade 头，用于判断是否为 WebSocket 请求
            const upgradeHeader = request.headers.get('Upgrade');
            // 初始化请求参数
            await initializeParams(request, env);

            // 处理非 WebSocket 请求
            if (!upgradeHeader || upgradeHeader !== 'websocket') {            
                switch (pathName) {                    
                    case '/update-warp':
                        // 更新 Warp 配置
                        return await updateWarpConfigs(request, env);

                    case `/sub/${userID}`:
                        // 处理不同客户端的订阅请求
                        if (client === 'sfa') return await getSingBoxCustomConfig(request, env, false);
                        if (client === 'clash') return await getClashNormalConfig(request, env);
                        if (client === 'xray') return await getXrayCustomConfigs(request, env, false);
                        return await getNormalConfigs(request, env);                        

                    case `/fragsub/${userID}`:
                        // 处理带有 Fragment 功能的订阅
                        return client === 'hiddify'
                            ? await getSingBoxCustomConfig(request, env, true)
                            : await getXrayCustomConfigs(request, env, true);

                    case `/warpsub/${userID}`:
                        // 处理 Warp 相关的订阅
                        if (client === 'clash') return await getClashWarpConfig(request, env);   
                        if (client === 'singbox' || client === 'hiddify') return await getSingBoxWarpConfig(request, env, client);
                        return await getXrayWarpConfigs(request, env, client);

                    case '/panel':
                        // 处理面板请求
                        return await handlePanel(request, env);
                                                      
                    case '/login':
                        // 处理登录请求
                        return await login(request, env);
                    
                    case '/logout':                        
                        // 处理登出请求
                        return logout();        

                    case '/panel/password':
                        // 处理密码重置请求
                        return await resetPassword(request, env);
                    
                    case '/my-ip':
                        // 获取客户端 IP
                        return await getMyIP(request);

                    default:
                        // 处理所有其他请求
                        return await fallback(request);
                }
            } else {
                // 处理 WebSocket 请求
                // 根据路径选择不同的协议处理器
                return pathName.startsWith('/tr') 
                    ? await trojanOverWSHandler(request, env)  // Trojan 协议
                    : await vlessOverWSHandler(request, env);  // VLESS 协议
            }
        } catch (err) {
            // 错误处理：渲染错误页面
            return await renderErrorPage(request, env, 'Something went wrong!', err, false);
        }
    }
};