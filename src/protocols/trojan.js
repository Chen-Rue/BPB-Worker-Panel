import { connect } from 'cloudflare:sockets';
import sha256 from 'js-sha256';
import { initializeParams, trojanPassword, proxyIP, pathName } from "../helpers/init";

// 处理基于 WebSocket 的 Trojan 请求
export async function trojanOverWSHandler(request, env) {
    await initializeParams(request, env);
    // 创建 WebSocket 对
    const webSocketPair = new WebSocketPair();
    const [client, webSocket] = Object.values(webSocketPair);
    webSocket.accept();
    
    let address = "";
    let portWithRandomLog = "";
    // 日志记录函数
    const log = (info, event) => {
        console.log(`[${address}:${portWithRandomLog}] ${info}`, event || "");
    };
    
    // 获取早期数据头部(用于 WebSocket 0-RTT)
    const earlyDataHeader = request.headers.get("sec-websocket-protocol") || "";
    // 创建可读的 WebSocket 流
    const readableWebSocketStream = makeReadableWebSocketStream(webSocket, earlyDataHeader, log);
    
    // 远程 socket 包装器
    let remoteSocketWapper = {
      value: null,
    };
    let udpStreamWrite = null;

    // WebSocket 到远程的数据流
    readableWebSocketStream
        .pipeTo(
            new WritableStream({
                async write(chunk, controller) {
                    if (udpStreamWrite) {
                        return udpStreamWrite(chunk);
                    }

                    if (remoteSocketWapper.value) {
                        const writer = remoteSocketWapper.value.writable.getWriter();
                        await writer.write(chunk);
                        writer.releaseLock();
                        return;
                    }

                    // 解析 Trojan 头部
                    const {
                        hasError,
                        message,
                        portRemote = 443,
                        addressRemote = "",
                        rawClientData,
                    } = await parseTrojanHeader(chunk);

                    address = addressRemote;
                    portWithRandomLog = `${portRemote}--${Math.random()} tcp`;

                    if (hasError) {
                        throw new Error(message);
                        return;
                    }

                    // 处理 TCP 出站连接
                    handleTCPOutBound(request, remoteSocketWapper, addressRemote, portRemote, rawClientData, webSocket, log);
                },
                close() {
                    log(`readableWebSocketStream 已关闭`);
                },
                abort(reason) {
                    log(`readableWebSocketStream 已中止`, JSON.stringify(reason));
                },
            })
        )
        .catch((err) => {
            log("readableWebSocketStream pipeTo 错误", err);
        });

        return new Response(null, {
        status: 101,
        // @ts-ignore
        webSocket: client,
    });
}

// 解析 Trojan 协议头部
async function parseTrojanHeader(buffer) {
    // 验证缓冲区长度
    if (buffer.byteLength < 56) {
        return {
            hasError: true,
            message: "无效数据",
        };
    }

    // 检查 CR LF
    let crLfIndex = 56;
    if (new Uint8Array(buffer.slice(56, 57))[0] !== 0x0d || new Uint8Array(buffer.slice(57, 58))[0] !== 0x0a) {
        return {
            hasError: true,
            message: "无效的头部格式（缺少 CR LF）",
        };
    }

    // 验证密码
    const password = new TextDecoder().decode(buffer.slice(0, crLfIndex));
    if (password !== sha256.sha224(trojanPassword)) {
        return {
            hasError: true,
            message: "密码无效",
        };
    }

    // 解析 SOCKS5 请求数据
    const socks5DataBuffer = buffer.slice(crLfIndex + 2);
    if (socks5DataBuffer.byteLength < 6) {
        return {
            hasError: true,
            message: "无效的 SOCKS5 请求数据",
        };
    }

    const view = new DataView(socks5DataBuffer);
    const cmd = view.getUint8(0);
    if (cmd !== 1) {
        return {
            hasError: true,
            message: "不支持的命令，仅允许 TCP (CONNECT)",
        };
    }

    // 解析地址类型和地址
    const atype = view.getUint8(1);
    // 0x01: IPv4 地址
    // 0x03: 域名
    // 0x04: IPv6 地址
    let addressLength = 0;
    let addressIndex = 2;
    let address = "";
    switch (atype) {
        case 1:
            addressLength = 4;
            address = new Uint8Array(socks5DataBuffer.slice(addressIndex, addressIndex + addressLength)).join(".");
            break;
        case 3:
            addressLength = new Uint8Array(socks5DataBuffer.slice(addressIndex, addressIndex + 1))[0];
            addressIndex += 1;
            address = new TextDecoder().decode(socks5DataBuffer.slice(addressIndex, addressIndex + addressLength));
            break;
        case 4:
            addressLength = 16;
            const dataView = new DataView(socks5DataBuffer.slice(addressIndex, addressIndex + addressLength));
            const ipv6 = [];
            for (let i = 0; i < 8; i++) {
                ipv6.push(dataView.getUint16(i * 2).toString(16));
            }
            address = ipv6.join(":");
            break;
        default:
            return {
                hasError: true,
                message: `无效的地址类型: ${atype}`,
            };
    }

    if (!address) {
        return {
            hasError: true,
            message: `地址为空，地址类型为 ${atype}`,
        };
    }

    // 解析端口
    const portIndex = addressIndex + addressLength;
    const portBuffer = socks5DataBuffer.slice(portIndex, portIndex + 2);
    const portRemote = new DataView(portBuffer).getUint16(0);
    return {
        hasError: false,
        addressRemote: address,
        portRemote,
        rawClientData: socks5DataBuffer.slice(portIndex + 4),
    };
}

/**
 * 处理 TCP 出站连接
 * @param {any} remoteSocket 远程 socket 包装器
 * @param {string} addressRemote 要连接的远程地址
 * @param {number} portRemote 要连接的远程端口
 * @param {Uint8Array} rawClientData 要写入的原始客户端数据
 * @param {import("@cloudflare/workers-types").WebSocket} webSocket 用于传递远程 socket 的 WebSocket
 * @param {function} log 日志记录函数
 * @returns {Promise<void>} 远程 socket
 */
async function handleTCPOutBound(
    request,
    remoteSocket,
    addressRemote,
    portRemote,
    rawClientData,
    webSocket,
    log
) {
    // 连接并写入数据的内部函数
    async function connectAndWrite(address, port) {
        // 如果地址是 IPv4，添加特殊前缀和后缀
        if (/^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?).){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(address)) address = `${atob('d3d3Lg==')}${address}${atob('LnNzbGlwLmlv')}`;
        /** @type {import("@cloudflare/workers-types").Socket} */
        const tcpSocket = connect({
            hostname: address,
            port: port,
        });
        remoteSocket.value = tcpSocket;
        log(`已连接到 ${address}:${port}`);
        const writer = tcpSocket.writable.getWriter();
        await writer.write(rawClientData); // 首次写入，通常是 TLS 客户端握手
        writer.releaseLock();
        return tcpSocket;
    }
  
    // 如果 CF 连接 TCP socket 没有收到数据，尝试重定向 IP
    async function retry() {
        const panelProxyIP = pathName.split('/')[2];
        const panelProxyIPs = panelProxyIP ? atob(panelProxyIP).split(',') : undefined;
        const finalProxyIP = panelProxyIPs ? panelProxyIPs[Math.floor(Math.random() * panelProxyIPs.length)] : proxyIP || addressRemote;
        const tcpSocket = await connectAndWrite(finalProxyIP, portRemote);
        // 无论重试成功与否，都关闭 websocket
        tcpSocket.closed
            .catch((error) => {
                console.log("重试 tcpSocket 关闭错误", error);
            })
            .finally(() => {
                safeCloseWebSocket(webSocket);
            });
            
        trojanRemoteSocketToWS(tcpSocket, webSocket, null, log);
    }
  
    const tcpSocket = await connectAndWrite(addressRemote, portRemote);
  
    // 当远程 socket 就绪时，传递给 websocket
    // 远程 --> ws
    trojanRemoteSocketToWS(tcpSocket, webSocket, retry, log);
}

/**
 * 从 WebSocket 服务器创建可读流，允许从 WebSocket 读取数据
 * @param {import("@cloudflare/workers-types").WebSocket} webSocketServer 要创建可读流的 WebSocket 服务器
 * @param {string} earlyDataHeader 包含 WebSocket 0-RTT 早期数据的头部
 * @param {(info: string)=> void} log 日志记录函数
 * @returns {ReadableStream} 可用于从 WebSocket 读取数据的可读流
 */
function makeReadableWebSocketStream(webSocketServer, earlyDataHeader, log) {
    let readableStreamCancel = false;
    const stream = new ReadableStream({
        start(controller) {
            // 监听 WebSocket 消息事件
            webSocketServer.addEventListener("message", (event) => {
                if (readableStreamCancel) {
                    return;
                }
                const message = event.data;
                controller.enqueue(message);
            });
    
            // 客户端关闭了客户端->服务器流时触发此事件
            // 但服务器->客户端流仍然开放，直到服务器端调用 close()
            // WebSocket 协议要求在每个方向上都必须发送单独的关闭消息才能完全关闭套接字
            webSocketServer.addEventListener("close", () => {
                // 客户端发送关闭，需要关闭服务器
                // 如果流已取消，跳过 controller.close
                safeCloseWebSocket(webSocketServer);
                if (readableStreamCancel) {
                    return;
                }
                controller.close();
            });
            webSocketServer.addEventListener("error", (err) => {
                log("webSocketServer 发生错误");
                controller.error(err);
            });
            // 处理 ws 0-RTT 数据
            const { earlyData, error } = base64ToArrayBuffer(earlyDataHeader);
            if (error) {
                controller.error(error);
            } else if (earlyData) {
                controller.enqueue(earlyData);
            }
        },
        pull(controller) {
            // 如果 ws 可以在流满时停止读取，我们可以实现背压
            // https://streams.spec.whatwg.org/#example-rs-push-backpressure
        },
        cancel(reason) {
            // 1. 如果 WritableStream 管道有错误，会调用此取消，所以在这里处理服务器关闭
            // 2. 如果 readableStream 被取消，所有 controller.close/enqueue 需要跳过
            // 3. 但从测试来看，即使 readableStream 被取消，controller.error 仍然有效
            if (readableStreamCancel) {
                return;
            }
            log(`ReadableStream 被取消，原因: ${reason}`);
            readableStreamCancel = true;
            safeCloseWebSocket(webSocketServer);
        },
    });
  
    return stream;
}

/**
 * 将远程 socket 转换为 WebSocket 连接
 * @param {import("@cloudflare/workers-types").Socket} remoteSocket 要转换的远程 socket
 * @param {import("@cloudflare/workers-types").WebSocket} webSocket 要连接的 WebSocket
 * @param {(() => Promise<void>) | null} retry 连接失败时的重试函数
 * @param {(info: string) => void} log 日志记录函数
 */
async function trojanRemoteSocketToWS(remoteSocket, webSocket, retry, log) {
    let hasIncomingData = false;
    await remoteSocket.readable
        .pipeTo(
            new WritableStream({
                start() {},
                async write(chunk, controller) {
                    hasIncomingData = true;
                    if (webSocket.readyState !== WS_READY_STATE_OPEN) {
                        controller.error("webSocket 连接未打开");
                    }
                    webSocket.send(chunk);
                },
                close() {
                    log(`remoteSocket.readable 已关闭，hasIncomingData: ${hasIncomingData}`);
                },
                abort(reason) {
                    console.error("remoteSocket.readable 中止", reason);
                },
            })
        )
        .catch((error) => {
            console.error(`trojanRemoteSocketToWS 错误:`, error.stack || error);
            safeCloseWebSocket(webSocket);
        });
    
    // 如果没有收到数据且存在重试函数，则尝试重试
    if (hasIncomingData === false && retry) {
        log(`重试`);
        retry();
    }
}

/**
 * 将 base64 字符串解码为 ArrayBuffer
 * @param {string} base64Str 要解码的 base64 字符串
 * @returns {{earlyData: ArrayBuffer|null, error: Error|null}} 包含解码后的 ArrayBuffer 或错误信息的对象
 */
function base64ToArrayBuffer(base64Str) {
    if (!base64Str) {
        return { earlyData: null, error: null };
    }
    try {
        // go 使用修改过的 Base64 for URL rfc4648，js atob 不支持
        base64Str = base64Str.replace(/-/g, '+').replace(/_/g, '/');
        const decode = atob(base64Str);
        const arryBuffer = Uint8Array.from(decode, (c) => c.charCodeAt(0));
        return { earlyData: arryBuffer.buffer, error: null };
    } catch (error) {
        return { earlyData: null, error };
    }
}

const WS_READY_STATE_OPEN = 1;
const WS_READY_STATE_CLOSING = 2;
/**
 * 安全地关闭 WebSocket 连接，不抛出异常
 * @param {import("@cloudflare/workers-types").WebSocket} socket 要关闭的 WebSocket 连接
 */
function safeCloseWebSocket(socket) {
    try {
        if (socket.readyState === WS_READY_STATE_OPEN || socket.readyState === WS_READY_STATE_CLOSING) {
            socket.close();
        }
    } catch (error) {
        console.error('safeCloseWebSocket 错误', error);
    }
}