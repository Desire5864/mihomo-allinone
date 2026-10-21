/* Mihomo Console — 全新面板
 * 通过 mihomo external-controller API 实现代理管理/流量/连接/规则/日志/配置
 */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const state = {
  apiBase: localStorage.getItem('mihomo_api') || '',   // 空 = 同源
  secret: localStorage.getItem('mihomo_secret') || '',
  page: 'overview',
  proxies: {},
  trafficUp: 0, trafficDown: 0,
  trafficHistory: [],
  wsTraffic: null, wsConn: null, wsLog: null,
};

/* ===== 工具 ===== */
function fmtBytes(n) {
  if (n == null) return '—';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return n.toFixed(n >= 100 || i === 0 ? 0 : 1) + ' ' + u[i];
}
function fmtRate(n) { return fmtBytes(n) + '/s'; }
function fmtTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  const p = (x) => String(x).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
function latencyClass(ms) {
  if (ms == null) return '';
  if (ms < 200) return 'good';
  if (ms < 500) return 'mid';
  return 'bad';
}

/* ===== API 封装 ===== */
async function api(path, opts = {}) {
  const headers = Object.assign({}, opts.headers || {});
  if (opts.body != null) headers['Content-Type'] = 'application/json';
  if (state.secret) headers['Authorization'] = 'Bearer ' + state.secret;
  const res = await fetch(state.apiBase + path, Object.assign({}, opts, { headers }));
  if (res.status === 401) { showAuth(); throw new Error('Unauthorized'); }
  if (res.status === 204) return null;
  return res.json();
}

function wsUrl(path) {
  let base = state.apiBase;
  if (!base) {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    base = proto + '//' + location.host;
  } else {
    base = base.replace(/^http/, 'ws');
  }
  const sep = path.includes('?') ? '&' : '?';
  let url = base + path;
  if (state.secret) url += sep + 'token=' + encodeURIComponent(state.secret);
  return url;
}

/* ===== 页面导航 ===== */
function switchPage(page) {
  state.page = page;
  $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.page === page));
  $$('.page').forEach(p => p.classList.toggle('active', p.id === 'page-' + page));
  const titles = { overview: '总览', proxies: '代理', connections: '连接', rules: '规则', logs: '日志', config: '配置' };
  $('#pageTitle').textContent = titles[page] || page;
  if (page === 'proxies') loadProxies();
  if (page === 'rules') loadRules();
  if (page === 'config') loadConfig();
}
$$('.nav-item').forEach(b => b.addEventListener('click', () => switchPage(b.dataset.page)));

/* ===== 认证弹窗 ===== */
function showAuth() {
  $('#authUrl').value = state.apiBase;
  $('#authSecret').value = state.secret;
  $('#authModal').classList.add('show');
}
function hideAuth() { $('#authModal').classList.remove('show'); }
$('#btnAuthCancel').addEventListener('click', hideAuth);
$('#btnAuthSave').addEventListener('click', () => {
  state.apiBase = $('#authUrl').value.trim().replace(/\/+$/, '');
  state.secret = $('#authSecret').value.trim();
  localStorage.setItem('mihomo_api', state.apiBase);
  localStorage.setItem('mihomo_secret', state.secret);
  hideAuth();
  init();
});

/* ===== 总览 ===== */
function connectTraffic() {
  if (state.wsTraffic) { state.wsTraffic.onclose = null; state.wsTraffic.close(); }
  const ws = new WebSocket(wsUrl('/traffic'));
  state.wsTraffic = ws;
  ws.onmessage = (e) => {
    const d = JSON.parse(e.data);
    state.trafficUp = d.up; state.trafficDown = d.down;
    $('#upSpeed').textContent = fmtRate(d.up);
    $('#downSpeed').textContent = fmtRate(d.down);
    $('#ovUp').textContent = fmtRate(d.up);
    $('#ovDown').textContent = fmtRate(d.down);
    $('#ovUpTotal').textContent = fmtBytes(d.upTotal);
    $('#ovDownTotal').textContent = fmtBytes(d.downTotal);
    state.trafficHistory.push({ up: d.up, down: d.down });
    if (state.trafficHistory.length > 60) state.trafficHistory.shift();
    drawChart();
  };
  ws.onclose = () => setTimeout(connectTraffic, 3000);
}

function drawChart() {
  const canvas = $('#trafficChart');
  if (!canvas || canvas.clientWidth === 0) return;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  canvas.width = w * dpr; canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);
  const data = state.trafficHistory;
  if (data.length < 2) return;
  const max = Math.max(1, ...data.map(d => Math.max(d.up, d.down)));
  const step = w / 59;
  const draw = (arr, color) => {
    ctx.beginPath();
    arr.forEach((d, i) => {
      const x = i * step;
      const y = h - (d / max) * (h - 10);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke();
  };
  const ups = data.map(d => d.up), downs = data.map(d => d.down);
  draw(ups, '#34d399');
  draw(downs, '#22d3ee');
}

async function loadOverview() {
  try {
    const [ver, mem, cfg] = await Promise.all([
      api('/version'), api('/memory'), api('/configs'),
    ]);
    $('#versionBadge').textContent = ver.version || '--';
    $('#modeBadge').textContent = cfg.mode || 'rule';
    $('#ovMem').textContent = fmtBytes(mem.inuse);
    const info = $('#ovInfo');
    info.innerHTML = '';
    const kv = [
      ['版本', ver.version], ['模式', cfg.mode], ['端口', cfg['mixed-port'] || cfg.port],
      ['SOCKS', cfg['socks-port'] || '—'], ['允许局域网', cfg['allow-lan'] ? '是' : '否'],
      ['IPv6', cfg.ipv6 ? '是' : '否'], ['TUN', cfg.tun && cfg.tun.enable ? '是' : '否'],
      ['DNS', cfg.dns && cfg.dns.enable !== false ? '启用' : '关闭'],
    ];
    kv.forEach(([k, v]) => {
      const d = document.createElement('div');
      d.className = 'kv-item';
      d.innerHTML = `<span class="k">${k}</span><span class="v">${v}</span>`;
      info.appendChild(d);
    });
  } catch (e) { /* 静默 */ }
}

/* ===== 代理 ===== */
async function loadProxies() {
  try {
    const data = await api('/proxies');
    state.proxies = data.proxies || {};
    renderProxies();
  } catch (e) { /* 静默 */ }
}

function renderProxies() {
  const container = $('#proxyGroups');
  container.innerHTML = '';
  const groups = Object.values(state.proxies).filter(p => ['Selector', 'URLTest', 'Fallback', 'LoadBalance', 'Relay'].includes(p.type));
  const nodes = Object.values(state.proxies).filter(p => !['Selector', 'URLTest', 'Fallback', 'LoadBalance', 'Relay', 'Direct', 'Reject', 'Compatible', 'Pass', 'Dns'].includes(p.type));
  $('#proxyCount').textContent = `${groups.length} 个策略组 · ${nodes.length} 个节点`;

  groups.forEach(g => {
    const el = document.createElement('div');
    el.className = 'proxy-group';
    const now = g.now ? state.proxies[g.now] : null;
    const nowDelay = now && now.history && now.history.length ? now.history[now.history.length - 1].delay : null;
    el.innerHTML = `
      <div class="proxy-group-head">
        <div><span class="pg-name">${esc(g.name)}</span><span class="pg-type">${g.type}</span></div>
        <div class="pg-current">${esc(g.now || '—')} ${nowDelay != null ? '<span class="pn-latency ' + latencyClass(nowDelay) + '">' + nowDelay + ' ms</span>' : ''}</div>
      </div>
      <div class="pg-body"></div>`;
    const body = el.querySelector('.pg-body');
    g.all.forEach(name => {
      const node = state.proxies[name];
      if (!node) return;
      const hist = node.history && node.history.length ? node.history[node.history.length - 1].delay : null;
      const div = document.createElement('div');
      div.className = 'proxy-node' + (g.now === name ? ' selected' : '');
      div.innerHTML = `
        <span class="pn-name">${esc(name)}</span>
        <span class="pn-latency ${latencyClass(hist)}">${hist != null ? hist + ' ms' : '—'}</span>`;
      div.addEventListener('click', () => selectNode(g.name, name, div));
      body.appendChild(div);
    });
    el.querySelector('.proxy-group-head').addEventListener('click', () => {
      el.querySelector('.proxy-group-head').classList.toggle('open');
      body.classList.toggle('open');
    });
    container.appendChild(el);
  });
}

async function selectNode(group, name, el) {
  try {
    await api('/proxies/' + encodeURIComponent(group), { method: 'PUT', body: JSON.stringify({ name }) });
    $$('.proxy-node', el.parentElement).forEach(n => n.classList.remove('selected'));
    el.classList.add('selected');
    loadProxies();
  } catch (e) { alert('切换失败：' + e.message); }
}

async function testDelay(name, span) {
  span.textContent = '...';
  span.className = 'pn-latency testing';
  try {
    const d = await api(`/proxies/${encodeURIComponent(name)}/delay?url=https://www.gstatic.com/generate_204&timeout=5000`);
    span.textContent = d.delay + ' ms';
    span.className = 'pn-latency ' + latencyClass(d.delay);
  } catch (e) {
    span.textContent = '超时';
    span.className = 'pn-latency bad';
  }
}

$('#btnTestAll').addEventListener('click', async () => {
  const all = Object.values(state.proxies).filter(p => !['Selector', 'URLTest', 'Fallback', 'LoadBalance', 'Relay', 'Direct', 'Reject', 'Compatible', 'Pass', 'Dns'].includes(p.type));
  const spans = $$('.pn-latency');
  all.forEach((n, i) => {
    if (spans[i]) testDelay(n.name, spans[i]);
  });
});

/* ===== 连接 ===== */
function connectConnections() {
  if (state.wsConn) { state.wsConn.onclose = null; state.wsConn.close(); }
  const ws = new WebSocket(wsUrl('/connections?interval=1000'));
  state.wsConn = ws;
  ws.onmessage = (e) => renderConnections(JSON.parse(e.data));
  ws.onclose = () => setTimeout(connectConnections, 3000);
}

function renderConnections(data) {
  const body = $('#connBody');
  const list = data.connections || [];
  $('#connCount').textContent = `${list.length} 个活动连接`;
  body.innerHTML = list.map(c => `
    <tr>
      <td class="mono">${esc(c.metadata.host || '')}</td>
      <td class="mono">${esc((c.metadata.network || '') + ' · ' + (c.metadata.sourceIP || ''))}</td>
      <td class="mono">${esc(c.metadata.type || '')}</td>
      <td>${esc(c.rule || '')}</td>
      <td class="chain-tag">${esc((c.chains || []).join(' → '))}</td>
      <td class="mono">${fmtBytes(c.upload)}</td>
      <td class="mono">${fmtBytes(c.download)}</td>
      <td class="mono">${fmtTime(c.start)}</td>
      <td><button class="btn" onclick="closeConn('${c.id}')">关闭</button></td>
    </tr>`).join('');
}

function closeConn(id) {
  api('/connections/' + id, { method: 'DELETE' }).catch(() => {});
}
$('#btnCloseAll').addEventListener('click', () => {
  if (confirm('确定关闭所有连接？')) api('/connections', { method: 'DELETE' }).catch(() => {});
});

/* ===== 规则 ===== */
async function loadRules() {
  try {
    const data = await api('/rules');
    state.rules = data.rules || [];
    renderRules();
  } catch (e) { /* 静默 */ }
}
function renderRules() {
  const kw = $('#ruleSearch').value.trim().toLowerCase();
  const body = $('#ruleBody');
  const list = (state.rules || []).filter(r => !kw || (r.payload || '').toLowerCase().includes(kw) || (r.type || '').toLowerCase().includes(kw) || (r.proxy || '').toLowerCase().includes(kw));
  body.innerHTML = list.map(r => `
    <tr>
      <td class="mono">${esc(r.type || '')}</td>
      <td class="mono">${esc(r.payload || '')}</td>
      <td>${esc(r.proxy || '')}</td>
      <td class="mono">${r.size != null ? r.size : '—'}</td>
    </tr>`).join('');
}
$('#ruleSearch').addEventListener('input', renderRules);

/* ===== 日志 ===== */
let logCount = 0;
function connectLogs() {
  if (state.wsLog) { state.wsLog.onclose = null; state.wsLog.close(); }
  const level = $('#logLevel').value;
  const ws = new WebSocket(wsUrl('/logs?level=' + level));
  state.wsLog = ws;
  ws.onmessage = (e) => {
    const d = JSON.parse(e.data);
    const type = d.type || 'info';
    const payload = typeof d.payload === 'string' ? d.payload : JSON.stringify(d.payload);
    const div = document.createElement('div');
    div.className = 'log-line ' + type;
    div.textContent = fmtTime(Date.now()) + ' [' + type.toUpperCase() + '] ' + payload;
    $('#logPanel').appendChild(div);
    if (++logCount > 500) { $('#logPanel').removeChild($('#logPanel').firstChild); logCount--; }
    $('#logPanel').scrollTop = $('#logPanel').scrollHeight;
  };
  ws.onclose = () => setTimeout(connectLogs, 3000);
}
$('#logLevel').addEventListener('change', () => { connectLogs(); });
$('#btnClearLog').addEventListener('click', () => { $('#logPanel').innerHTML = ''; logCount = 0; });

/* ===== 配置 ===== */
async function loadConfig() {
  try {
    const cfg = await api('/configs');
    $('#configText').textContent = JSON.stringify(cfg, null, 2);
  } catch (e) { /* 静默 */ }
}
$('#btnReloadConfig').addEventListener('click', async () => {
  try { await api('/configs?force=true', { method: 'PUT' }); alert('已重载配置'); } catch (e) { alert('重载失败：' + e.message); }
});
$('#btnFlushFakeIP').addEventListener('click', () => api('/cache/fakeip/flush', { method: 'POST' }).then(() => alert('已清除')).catch(() => {}));
$('#btnFlushDNS').addEventListener('click', () => api('/cache/dns/flush', { method: 'POST' }).then(() => alert('已清除')).catch(() => {}));

/* ===== 初始化 ===== */
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
window.closeConn = closeConn;

function init() {
  loadOverview();
  connectTraffic();
  connectConnections();
  connectLogs();
}

/* 若后端不可达(401/网络错误)，弹出认证设置 */
async function probe() {
  try {
    await api('/version');
  } catch (e) {
    if (e.message === 'Unauthorized') showAuth();
  }
}

switchPage('overview');
init();
probe();
setInterval(loadOverview, 10000);
