(function (root) {
  'use strict';
  const namespace = 'accessV1';
  const validKey = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
  const hex = bytes => Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');

  async function digest(value) {
    return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))));
  }

  function proof(session) {
    if (!session || !validKey(session.key) || !validKey(session.secret)) throw Error('请先进入检查或整改入口。');
    return {kind: session.kind, key: session.key, actor: session.actor, value: session.secret + '.' + hex(crypto.getRandomValues(new Uint8Array(16)))};
  }

  function route(path, method, body, session) {
    const parts = path.split('/');
    if (parts[0] !== 'v2' || parts.some(part => !part || /[.#$\[\]]/.test(part))) throw Error('操作路径无效。');
    if (!session) throw Error('请先进入检查或整改入口。');
    if (parts[1] === 'branches' && parts.length === 2 && method === 'GET') return {local: session.branches};
    let container;
    let relative;
    if (parts[1] === 'periods' && parts.length <= 3) {
      container = namespace + '/settings';
      relative = 'data/' + parts.slice(1).join('/');
    } else if (['issues', 'receipts'].includes(parts[1]) && parts.length >= 4) {
      const code = parts[3];
      const space = session.spaces[code];
      if (!validKey(space)) throw Error('此入口不能访问其他网点。');
      container = namespace + '/spaces/' + space;
      relative = ['data', parts[1], parts[2], ...parts.slice(4)].join('/');
    } else {
      throw Error('当前入口不支持这项操作。');
    }
    if (method === 'GET') return {path: container + '/' + relative, method};
    if (!['PUT', 'PATCH'].includes(method) || body == null) throw Error('不允许删除云端记录。');
    const payload = {proof: proof(session)};
    if (method === 'PUT') payload[relative] = body;
    else {
      for (const [key, value] of Object.entries(body)) {
        if (key.split('/').some(part => !part || /[.#$\[\]]/.test(part))) throw Error('更新路径无效。');
        payload[relative + '/' + key] = value;
      }
    }
    return {path: container, method: 'PATCH', body: payload};
  }

  async function request(databaseURL, path, method = 'GET', body) {
    const local = /^http:\/\/127\.0\.0\.1:\d+$/.test(databaseURL);
    if (!local && !/^https:\/\/[a-z0-9.-]+\.(firebasedatabase\.app|firebaseio\.com)$/.test(databaseURL)) throw Error('云端地址配置有误。');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(databaseURL + '/' + path.split('/').map(encodeURIComponent).join('/') + '.json' + (local ? '?ns=demo-inspection-access' : ''), {
        method, cache: 'no-store', referrerPolicy: 'no-referrer', signal: controller.signal,
        ...(body !== undefined ? {headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)} : {})
      });
      if (!response.ok) {
        if ([401, 403].includes(response.status)) throw Error(method === 'GET' ? '入口无效、已停用，或测试服务尚未启用。' : '未保存：入口权限、季度锁定或处理状态已变化，请刷新核对。');
        throw Error(method === 'GET' ? '云端读取失败，请稍后重试。' : '操作结果未确认，请刷新核对，避免重复提交。');
      }
      return await response.json();
    } catch (error) {
      if (error.name === 'AbortError' || error instanceof TypeError) throw Error(method === 'GET' ? '云端连接超时或网络不可达，请更换网络后重试。' : '网络中断，保存结果未确认。请恢复连接后刷新核对，避免重复提交。');
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async function enter(databaseURL, kind, secret, name) {
    if (!validKey(secret)) throw Error('请使用管理员提供的完整进入码或整改链接。');
    if (kind === 'branch') {
      const meta = await request(databaseURL, namespace + '/spaces/' + secret + '/data/meta');
      if (!meta || !/^\d{6}$/.test(meta.code) || !meta.name) throw Error('网点入口尚未配置。');
      return {kind, key: secret, secret, actor: 'branch:' + meta.code, branches: {[meta.code]: {name: meta.name}}, spaces: {[meta.code]: secret}, branch: meta.code};
    }
    if (kind !== 'staff' || !name?.trim() || name.trim().length > 40) throw Error('请填写检查人员姓名（不超过40字）。');
    const key = await digest(secret);
    const catalog = await request(databaseURL, namespace + '/catalog/' + key);
    if (!catalog?.branches || !catalog?.spaces) throw Error('检查入口尚未配置。');
    return {kind, key, secret, actor: 'inspector:' + name.trim(), branches: catalog.branches, spaces: catalog.spaces};
  }

  root.InspectionAccess = {digest, proof, route, request, enter, validKey};
})(globalThis);
