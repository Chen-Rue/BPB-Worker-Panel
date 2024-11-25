import { SignJWT, jwtVerify } from 'jose';
import nacl from 'tweetnacl';
import { initializeParams, userID, origin } from "../helpers/init";
import { renderLoginPage } from '../pages/login';
import { renderErrorPage } from '../pages/error';

/**
 * 生成 JWT 令牌
 * @param {Request} request 请求对象
 * @param {Object} env 环境变量
 * @returns {Promise<Response>} 返回包含 JWT 令牌的响应
 */
async function generateJWTToken (request, env) {
    await initializeParams(request, env);
    // 获取密码并验证
    const password = await request.text();
    const savedPass = await env.bpb.get('pwd');
    if (password !== savedPass) return new Response('方法不允许', { status: 405 });

    // 获取或生成密钥
    let secretKey = await env.bpb.get('secretKey');
    if (!secretKey) {
        secretKey = generateSecretKey();
        await env.bpb.put('secretKey', secretKey);
    }

    // 生成 JWT 令牌
    const secret = new TextEncoder().encode(secretKey);
    const jwtToken = await new SignJWT({ userID })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('24h')
        .sign(secret);

    // 返回包含 JWT 令牌的 Cookie
    return new Response('成功', {
        status: 200,
        headers: {
            'Set-Cookie': `jwtToken=${jwtToken}; HttpOnly; Secure; Max-Age=${7 * 24 * 60 * 60}; Path=/; SameSite=Strict`,
            'Content-Type': 'text/plain',
        }
    });
}

/**
 * 生成随机密钥
 * @returns {string} 返回十六进制格式的密钥字符串
 */
function generateSecretKey () {
    const key = nacl.randomBytes(32);
    return Array.from(key, byte => byte.toString(16).padStart(2, '0')).join('');
}
  
/**
 * 验证用户身份
 * @param {Request} request 请求对象
 * @param {Object} env 环境变量
 * @returns {Promise<boolean>} 如果验证成功返回 true，否则返回 false
 */
export async function Authenticate (request, env) {
    try {
        // 获取密钥并验证 JWT 令牌
        const secretKey = await env.bpb.get('secretKey');
        const secret = new TextEncoder().encode(secretKey);
        const cookie = request.headers.get('Cookie')?.match(/(^|;\s*)jwtToken=([^;]*)/);
        const token = cookie ? cookie[2] : null;

        if (!token) {
            console.log('未授权：令牌不可用！');
            return false;
        }

        const { payload } = await jwtVerify(token, secret);
        console.log(`认证成功，用户 ID: ${payload.userID}`);
        return true;
    } catch (error) {
        console.log(error);
        return false;
    }
}

/**
 * 处理用户登出
 * @returns {Response} 返回清除 Cookie 的响应
 */
export function logout() {
    return new Response('成功', {
        status: 200,
        headers: {
            'Set-Cookie': 'jwtToken=; Secure; SameSite=None; Expires=Thu, 01 Jan 1970 00:00:00 GMT',
            'Content-Type': 'text/plain'
        }
    });
}

/**
 * 重置密码
 * @param {Request} request 请求对象
 * @param {Object} env 环境变量
 * @returns {Promise<Response>} 返回处理结果的响应
 */
export async function resetPassword(request, env) {
    // 验证用户身份
    let auth = await Authenticate(request, env);
    const oldPwd = await env.bpb.get('pwd');
    if (oldPwd && !auth) return new Response('未授权！', { status: 401 });           

    // 更新密码
    const newPwd = await request.text();
    if (newPwd === oldPwd) return new Response('请输入新密码！', { status: 400 });
    await env.bpb.put('pwd', newPwd);

    // 返回成功响应并清除旧的 JWT Cookie
    return new Response('成功', {
        status: 200,
        headers: {
            'Set-Cookie': 'jwtToken=; Path=/; Secure; SameSite=None; Expires=Thu, 01 Jan 1970 00:00:00 GMT',
            'Content-Type': 'text/plain',
        }
    });
}

/**
 * 处理登录请求
 * @param {Request} request 请求对象
 * @param {Object} env 环境变量
 * @returns {Promise<Response>} 返回登录处理结果
 */
export async function login(request, env) {
    await initializeParams(request, env);
    // 检查 KV 存储是否可用
    if (typeof env.bpb !== 'object') return await renderErrorPage(request, env, 'KV 数据集未正确设置！', null, true);
    
    // 验证用户身份
    const auth = await Authenticate(request, env);
    if (auth) return Response.redirect(`${origin}/panel`, 302);
    
    // 处理登录请求
    if (request.method === 'POST') return await generateJWTToken(request, env);
    return await renderLoginPage(request, env);
}