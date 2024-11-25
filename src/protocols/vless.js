import { connect } from 'cloudflare:sockets';
import { isValidUUID } from '../helpers/helpers';
import { initializeParams, userID, dohURL, proxyIP, pathName } from "../helpers/init";

/**
 * 处理基于 WebSocket 的 VLESS 请求
 * 创建 WebSocket 对,接受 WebSocket 连接,并处理 VLESS 头部
 * @param {import("@cloudflare/workers-types").Request} request 传入的请求对象
 * @returns {Promise<Response>} 返回一个 WebSocket 响应对象的 Promise
 */
export async function vlessOverWSHandler(request, env) {
    /** @type {import("@cloudflare/workers-types").WebSocket[]} */
    // @ts-ignore
    await initializeParams(request, env);
    // 创建 WebSocket 对
    const webSocketPair = new WebSocketPair();
    const [client, webSocket] = Object.values(webSocketPair);

    webSocket.accept();

    let address = "";
    let portWithRandomLog = "";
    // 日志记录函数
    const log = (/** @type {string} */ info, /** @type {string | undefined} */ event) => {
        console.log(`[${address}:${portWithRandomLog}] ${info}`, event || "");
    };
    // 获取早期数据头部(用于 WebSocket 0-RTT)
    const earlyDataHeader = request.headers.get("sec-websocket-protocol") || "";

    // 创建可读的 WebSocket 流
    const readableWebSocketStream = makeReadableWebSocketStream(webSocket, earlyDataHeader, log);

    /** @type {{ value: import("@cloudflare/workers-types").Socket | null}}*/
    let remoteSocketWapper = {
        value: null,
    };
    let udpStreamWrite = null;
    let isDns = false;

    // WebSocket 到远程的数据流
    readableWebSocketStream
    .pipeTo(
        new WritableStream({
            async write(chunk, controller) {
                // 如果是 DNS 请求且 UDP 流写入器存在
                if (isDns && udpStreamWrite) {
                    return udpStreamWrite(chunk);
                }
                // 如果远程 socket 已存在
                if (remoteSocketWapper.value) {
                    const writer = remoteSocketWapper.value.writable.getWriter();
                    await writer.write(chunk);
                    writer.releaseLock();
                    return;
                }

                // 处理 VLESS 头部
                const {
                    hasError,
                    message,
                    portRemote = 443,
                    addressRemote = "",
                    rawDataIndex,
                    vlessVersion = new Uint8Array([0, 0]),
                    isUDP,
                } = await processVlessHeader(chunk, userID);
                address = addressRemote;
                portWithRandomLog = `${portRemote}--${Math.random()} ${isUDP ? "udp " : "tcp "} `;
                if (hasError) {
                    throw new Error(message);
                    return;
                }
                // 如果是 UDP 但端口不是 DNS 端口,关闭连接
                if (isUDP) {
                    if (portRemote === 53) {
                        isDns = true;
                    } else {
                        throw new Error("UDP proxy only enable for DNS which is port 53");
                        return;
                    }
                }
                // VLESS 响应头部
                const vlessResponseHeader = new Uint8Array([vlessVersion[0], 0]);
                const rawClientData = chunk.slice(rawDataIndex);

                // 处理 UDP/TCP 出站连接
                if (isDns) {
                    const { write } = await handleUDPOutBound(webSocket, vlessResponseHeader, log);
                    udpStreamWrite = write;
                    udpStreamWrite(rawClientData);
                    return;
                }

                handleTCPOutBound(
                    request,
                    remoteSocketWapper,
                    addressRemote,
                    portRemote,
                    rawClientData,
                    webSocket,
                    vlessResponseHeader,
                    log
                );
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

/**
 * 检查给定的 UUID 是否存在于 API 响应中
 * @param {string} targetUuid 要搜索的 UUID
 * @returns {Promise<boolean>} 如果 UUID 存在于 API 响应中返回 true，否则返回 false
 */
async function checkUuidInApiResponse(targetUuid) {
    try {
        const apiResponse = await getApiResponse();
        if (!apiResponse) {
            return false;
        }
        const isUuidInResponse = apiResponse.users.some((user) => user.uuid === targetUuid);
        return isUuidInResponse;
    } catch (error) {
        console.error("Error:", error);
        return false;
    }
}

/**
 * 处理 TCP 出站连接
 * @param {any} remoteSocket 远程 socket 包装器
 * @param {string} addressRemote 要连接的远程地址
 * @param {number} portRemote 要连接的远程端口
 * @param {Uint8Array} rawClientData 要写入的原始客户端数据
 * @param {import("@cloudflare/workers-types").WebSocket} webSocket 用于传递远程 socket 的 WebSocket
 * @param {Uint8Array} vlessResponseHeader VLESS 响应头
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
    vlessResponseHeader,
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
            
        vlessRemoteSocketToWS(tcpSocket, webSocket, vlessResponseHeader, null, log);
    }
  
    const tcpSocket = await connectAndWrite(addressRemote, portRemote);
  
    // 当远程 socket 就绪时，传递给 websocket
    // 远程 --> ws
    vlessRemoteSocketToWS(tcpSocket, webSocket, vlessResponseHeader, retry, log);
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

// VLESS 协议文档:
// https://xtls.github.io/development/protocols/vless.html
// https://github.com/zizifn/excalidraw-backup/blob/main/v2ray-protocol.excalidraw

/**
 * 处理 VLESS 头部缓冲区并返回相关信息
 * @param {ArrayBuffer} vlessBuffer 要处理的 VLESS 头部缓冲区
 * @param {string} userID 用于验证 VLESS 头部中 UUID 的用户 ID
 * @returns {{
 *  hasError: boolean,
 *  message?: string,
 *  addressRemote?: string,
 *  addressType?: number,
 *  portRemote?: number,
 *  rawDataIndex?: number,
 *  vlessVersion?: Uint8Array,
 *  isUDP?: boolean
 * }} 从 VLESS 头部缓冲区提取的相关信息对象
 */
async function processVlessHeader(vlessBuffer, userID) {
    // 验证缓冲区长度
    if (vlessBuffer.byteLength < 24) {
        return {
            hasError: true,
            message: "无效数据",
        };
    }

    // 提取版本号和用户 ID
    const version = new Uint8Array(vlessBuffer.slice(0, 1));
    let isValidUser = false;
    let isUDP = false;
    const slicedBuffer = new Uint8Array(vlessBuffer.slice(1, 17));
    const slicedBufferString = stringify(slicedBuffer);

    // 验证用户 ID
    const uuids = userID.includes(",") ? userID.split(",") : [userID];
    const checkUuidInApi = await checkUuidInApiResponse(slicedBufferString);
    isValidUser = uuids.some((userUuid) => checkUuidInApi || slicedBufferString === userUuid.trim());

    console.log(`checkUuidInApi: ${await checkUuidInApiResponse(slicedBufferString)}, userID: ${slicedBufferString}`);

    if (!isValidUser) {
        return {
            hasError: true,
            message: "无效用户",
        };
    }

    const optLength = new Uint8Array(vlessBuffer.slice(17, 18))[0];
    //skip opt for now

    const command = new Uint8Array(vlessBuffer.slice(18 + optLength, 18 + optLength + 1))[0];

    // 0x01 TCP
    // 0x02 UDP
    // 0x03 MUX
    if (command === 1) {
    } else if (command === 2) {
        isUDP = true;
    } else {
        return {
            hasError: true,
            message: `command ${command} is not support, command 01-tcp,02-udp,03-mux`,
        };
    }
    const portIndex = 18 + optLength + 1;
    const portBuffer = vlessBuffer.slice(portIndex, portIndex + 2);
    // port is big-Endian in raw data etc 80 == 0x005d
    const portRemote = new DataView(portBuffer).getUint16(0);

    let addressIndex = portIndex + 2;
    const addressBuffer = new Uint8Array(vlessBuffer.slice(addressIndex, addressIndex + 1));

    // 1--> ipv4  addressLength =4
    // 2--> domain name addressLength=addressBuffer[1]
    // 3--> ipv6  addressLength =16
    const addressType = addressBuffer[0];
    let addressLength = 0;
    let addressValueIndex = addressIndex + 1;
    let addressValue = "";
    switch (addressType) {
        case 1:
            addressLength = 4;
            addressValue = new Uint8Array(vlessBuffer.slice(addressValueIndex, addressValueIndex + addressLength)).join(".");
            break;
        case 2:
            addressLength = new Uint8Array(vlessBuffer.slice(addressValueIndex, addressValueIndex + 1))[0];
            addressValueIndex += 1;
            addressValue = new TextDecoder().decode(vlessBuffer.slice(addressValueIndex, addressValueIndex + addressLength));
            break;
        case 3:
            addressLength = 16;
            const dataView = new DataView(vlessBuffer.slice(addressValueIndex, addressValueIndex + addressLength));
            // 2001:0db8:85a3:0000:0000:8a2e:0370:7334
            const ipv6 = [];
            for (let i = 0; i < 8; i++) {
            ipv6.push(dataView.getUint16(i * 2).toString(16));
            }
            addressValue = ipv6.join(":");
            // seems no need add [] for ipv6
            break;
        default:
            return {
            hasError: true,
            message: `invild  addressType is ${addressType}`,
            };
    }
    if (!addressValue) {
        return {
            hasError: true,
            message: `addressValue is empty, addressType is ${addressType}`,
        };
    }

    return {
        hasError: false,
        addressRemote: addressValue,
        addressType,
        portRemote,
        rawDataIndex: addressValueIndex + addressLength,
        vlessVersion: version,
        isUDP,
    };
}

/**
 * 将远程 socket 转换为 WebSocket 连接
 * @param {import("@cloudflare/workers-types").Socket} remoteSocket 要转换的远程 socket
 * @param {import("@cloudflare/workers-types").WebSocket} webSocket 要连接的 WebSocket
 * @param {ArrayBuffer | null} vlessResponseHeader VLESS 响应头
 * @param {(() => Promise<void>) | null} retry 连接失败时的重试函数
 * @param {(info: string) => void} log 日志记录函数
 * @returns {Promise<void>} 转换完成时的 Promise
 */
async function vlessRemoteSocketToWS(remoteSocket, webSocket, vlessResponseHeader, retry, log) {
    // 远程 --> ws
    let remoteChunkCount = 0;
    let chunks = [];
    /** @type {ArrayBuffer | null} */
    let vlessHeader = vlessResponseHeader;
    let hasIncomingData = false; // 检查远程 socket 是否有传入数据
    await remoteSocket.readable
        .pipeTo(
            new WritableStream({
                start() {},
                /**
                 * @param {Uint8Array} chunk
                 * @param {*} controller
                 */
                async write(chunk, controller) {
                    hasIncomingData = true;
                    if (webSocket.readyState !== WS_READY_STATE_OPEN) {
                        controller.error("webSocket.readyState 不是打开状态，可能已关闭");
                    }
                    if (vlessHeader) {
                        webSocket.send(await new Blob([vlessHeader, chunk]).arrayBuffer());
                        vlessHeader = null;
                    } else {
                        webSocket.send(chunk);
                    }
                },
                close() {
                    log(`remoteConnection!.readable 已关闭，hasIncomingData 为 ${hasIncomingData}`);
                },
                abort(reason) {
                    console.error(`remoteConnection!.readable 中止`, reason);
                },
            })
        )
        .catch((error) => {
            console.error(`vlessRemoteSocketToWS 发生异常 `, error.stack || error);
            safeCloseWebSocket(webSocket);
        });
  
    // 如果是 cf 连接 socket 出错
    // 1. Socket.closed 会有错误
    // 2. Socket.readable 会在没有任何数据的情况下关闭
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

// 用于 UUID 字符串化的辅助数组
const byteToHex = [];
for (let i = 0; i < 256; ++i) {
    byteToHex.push((i + 256).toString(16).slice(1));
}

/**
 * 不安全的 UUID 字符串化函数（不进行验证）
 */
function unsafeStringify(arr, offset = 0) {
    return (
        byteToHex[arr[offset + 0]] +
        byteToHex[arr[offset + 1]] +
        byteToHex[arr[offset + 2]] +
        byteToHex[arr[offset + 3]] +
        "-" +
        byteToHex[arr[offset + 4]] +
        byteToHex[arr[offset + 5]] +
        "-" +
        byteToHex[arr[offset + 6]] +
        byteToHex[arr[offset + 7]] +
        "-" +
        byteToHex[arr[offset + 8]] +
        byteToHex[arr[offset + 9]] +
        "-" +
        byteToHex[arr[offset + 10]] +
        byteToHex[arr[offset + 11]] +
        byteToHex[arr[offset + 12]] +
        byteToHex[arr[offset + 13]] +
        byteToHex[arr[offset + 14]] +
        byteToHex[arr[offset + 15]]
    ).toLowerCase();
}

/**
 * 将字节数组转换为有效的 UUID 字符串
 */
function stringify(arr, offset = 0) {
    const uuid = unsafeStringify(arr, offset);
    if (!isValidUUID(uuid)) {
        throw TypeError("字符串化的 UUID 无效");
    }
    return uuid;
}

/**
 * 处理 UDP 出站流量，将数据转换为 DNS 查询并通过 WebSocket 连接发送
 * @param {import("@cloudflare/workers-types").WebSocket} webSocket 用于发送 DNS 查询的 WebSocket 连接
 * @param {ArrayBuffer} vlessResponseHeader VLESS 响应头
 * @param {(string) => void} log 日志记录函数
 * @returns {{write: (chunk: Uint8Array) => void}} 包含写入方法的对象，用于写入转换流
 */
async function handleUDPOutBound(webSocket, vlessResponseHeader, log) {
    let isVlessHeaderSent = false;
    const transformStream = new TransformStream({
        start(controller) {},
        transform(chunk, controller) {
            // UDP 消息的前 2 字节是 UDP 数据的长度
            // TODO: 这里可能有 bug，因为 UDP 数据块可能分布在两个 websocket 消息中
            for (let index = 0; index < chunk.byteLength; ) {
                const lengthBuffer = chunk.slice(index, index + 2);
                const udpPakcetLength = new DataView(lengthBuffer).getUint16(0);
                const udpData = new Uint8Array(chunk.slice(index + 2, index + 2 + udpPakcetLength));
                index = index + 2 + udpPakcetLength;
                controller.enqueue(udpData);
            }
        },
        flush(controller) {},
    });
    
    // 目前只处理 DNS UDP
    transformStream.readable
    .pipeTo(
        new WritableStream({
            async write(chunk) {
                const resp = await fetch(
                    dohURL, // DNS 服务器 URL
                    {
                        method: "POST",
                        headers: {
                            "content-type": "application/dns-message",
                        },
                        body: chunk,
                    }
                );
                const dnsQueryResult = await resp.arrayBuffer();
                const udpSize = dnsQueryResult.byteLength;
                const udpSizeBuffer = new Uint8Array([(udpSize >> 8) & 0xff, udpSize & 0xff]);
                if (webSocket.readyState === WS_READY_STATE_OPEN) {
                    log(`DOH 成功，DNS 消息长度为 ${udpSize}`);
                    if (isVlessHeaderSent) {
                        webSocket.send(await new Blob([udpSizeBuffer, dnsQueryResult]).arrayBuffer());
                    } else {
                        webSocket.send(await new Blob([vlessResponseHeader, udpSizeBuffer, dnsQueryResult]).arrayBuffer());
                        isVlessHeaderSent = true;
                    }
                }
            },
        })
    )
    .catch((error) => {
        log("DNS UDP 发生错误" + error);
    });
  
    const writer = transformStream.writable.getWriter();
  
    return {
        /**
         * @param {Uint8Array} chunk
         */
        write(chunk) {
            writer.write(chunk);
        },
    };
}