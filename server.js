const http = require('http');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const PORT = 8080;
const ESPN_API = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world';

// 数据存储
let matchData = { events: [], lastUpdate: null };
let predictions = { matches: [], lastUpdate: null };
let clients = new Set();

// 加载预测数据
function loadPredictions() {
  try {
    const data = fs.readFileSync(path.join(__dirname, 'data', 'predictions.json'), 'utf8');
    predictions = JSON.parse(data);
    console.log(`✅ 加载预测数据: ${predictions.matches?.length || 0} 场`);
  } catch (err) {
    console.log('⚠️ 预测数据文件不存在，使用空数据');
  }
}

// 保存预测数据
function savePredictions() {
  try {
    fs.writeFileSync(path.join(__dirname, 'data', 'predictions.json'), JSON.stringify(predictions, null, 2));
    console.log('✅ 保存预测数据');
  } catch (err) {
    console.error('❌ 保存预测数据失败:', err);
  }
}

// 从ESPN API获取比赛数据
async function fetchESPNData() {
  return new Promise((resolve, reject) => {
    const url = `${ESPN_API}/scoreboard?dates=20260611-20260628`;
    https.get(url, { headers: { 'Accept-Encoding': 'identity' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch (err) {
          reject(err);
        }
      });
    }).on('error', reject);
  });
}

// 获取比赛详情
async function fetchMatchDetail(matchId) {
  return new Promise((resolve, reject) => {
    const url = `${ESPN_API}/summary?event=${matchId}`;
    https.get(url, { headers: { 'Accept-Encoding': 'identity' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (err) {
          reject(err);
        }
      });
    }).on('error', reject);
  });
}

// 更新比赛数据
async function updateMatchData() {
  try {
    const data = await fetchESPNData();
    matchData = {
      events: data.events || [],
      lastUpdate: new Date().toISOString()
    };
    console.log(`✅ 更新比赛数据: ${matchData.events.length} 场`);
    
    // 锁定已开始比赛的预测
    lockPredictionsForLiveMatches();
    
    // 通知所有客户端
    broadcastToClients({
      type: 'match_update',
      data: matchData
    });
    
    return matchData;
  } catch (err) {
    console.error('❌ 更新比赛数据失败:', err);
    return null;
  }
}

// 锁定已开始比赛的预测
function lockPredictionsForLiveMatches() {
  if (!matchData.events || !predictions.matches) return;
  
  let lockedCount = 0;
  
  matchData.events.forEach(event => {
    const state = event.status?.type?.state;
    const matchId = event.id;
    
    // 如果比赛已经开始（live或finished），锁定预测
    if (['in', '2H', '1H', 'HT', 'ET', 'PK', 'post'].includes(state)) {
      const pred = predictions.matches.find(m => m.id === matchId);
      if (pred && !pred.locked) {
        pred.locked = true;
        pred.locked_at = new Date().toISOString();
        pred.locked_reason = state === 'post' ? '比赛结束' : '比赛开始';
        lockedCount++;
      }
    }
  });
  
  if (lockedCount > 0) {
    savePredictions();
    console.log(`🔒 锁定${lockedCount}场比赛预测（比赛已开始）`);
  }
}

// 广播消息给所有客户端
function broadcastToClients(message) {
  const data = JSON.stringify(message);
  clients.forEach(client => {
    try {
      client.write(`data: ${data}\n\n`);
    } catch (err) {
      clients.delete(client);
    }
  });
}

// HTTP服务器
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  
  // CORS头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // API路由
  if (url.pathname === '/api/matches') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(matchData));
    return;
  }

  if (url.pathname === '/api/predictions') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(predictions));
    return;
  }

  // 今日比赛统计API
  if (url.pathname === '/api/today') {
    const now = new Date();
    const bjNow = new Date(now.getTime() + 8*60*60*1000);
    const todayBJ = bjNow.toISOString().slice(0,10);
    
    const todayMatches = (matchData.events || []).filter(e => {
      if (!e.date) return false;
      const d = new Date(e.date);
      const bj = new Date(d.getTime() + 8*60*60*1000);
      return bj.toISOString().slice(0,10) === todayBJ;
    });
    
    const remaining = (matchData.events || []).filter(e => {
      const state = e.status?.type?.state;
      return state !== 'post';
    });
    const live = (matchData.events || []).filter(e => {
      const state = e.status?.type?.state;
      return ['in','2H','1H','HT','ET','PK'].includes(state);
    });
    const finished = (matchData.events || []).filter(e => {
      return e.status?.type?.state === 'post';
    });
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      today: todayMatches.length,
      remaining: remaining.length,
      live: live.length,
      finished: finished.length,
      date: todayBJ
    }));
    return;
  }

  if (url.pathname === '/api/match' && url.searchParams.has('id')) {
    try {
      const matchId = url.searchParams.get('id');
      const detail = await fetchMatchDetail(matchId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(detail));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to fetch match detail' }));
    }
    return;
  }

  // 结算数据API
  if (url.pathname === '/api/settlement' && req.method === 'POST') {
    try {
      const body = await new Promise((resolve) => {
        let data = '';
        req.on('data', chunk => data += chunk);
        req.on('end', () => resolve(JSON.parse(data)));
      });
      
      // 保存结算数据
      const settlementFile = path.join(__dirname, 'data', 'settlements.json');
      let settlements = [];
      try {
        settlements = JSON.parse(fs.readFileSync(settlementFile, 'utf8'));
      } catch(e) {}
      
      // 更新或添加结算
      const idx = settlements.findIndex(s => s.matchId === body.matchId);
      if (idx >= 0) {
        settlements[idx] = body;
      } else {
        settlements.push(body);
      }
      
      fs.writeFileSync(settlementFile, JSON.stringify(settlements, null, 2));
      console.log(`✅ 保存结算: ${body.homeTeam} vs ${body.awayTeam}`);
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to save settlement' }));
    }
    return;
  }

  // 获取结算数据API
  if (url.pathname === '/api/settlements') {
    try {
      const settlementFile = path.join(__dirname, 'data', 'settlements.json');
      let settlements = [];
      try {
        settlements = JSON.parse(fs.readFileSync(settlementFile, 'utf8'));
      } catch(e) {}
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(settlements));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to load settlements' }));
    }
    return;
  }

  if (url.pathname === '/api/update' && req.method === 'POST') {
    try {
      const body = await new Promise((resolve) => {
        let data = '';
        req.on('data', chunk => data += chunk);
        req.on('end', () => resolve(JSON.parse(data)));
      });
      
      if (body.predictions) {
        predictions = body.predictions;
        savePredictions();
      }
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to update' }));
    }
    return;
  }

  // SSE (Server-Sent Events) 实时推送
  if (url.pathname === '/api/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    
    // 发送初始数据
    res.write(`data: ${JSON.stringify({ type: 'init', data: matchData })}\n\n`);
    
    // 添加到客户端列表
    clients.add(res);
    
    // 心跳
    const heartbeat = setInterval(() => {
      try {
        res.write(':heartbeat\n\n');
      } catch (err) {
        clearInterval(heartbeat);
        clients.delete(res);
      }
    }, 30000);
    
    req.on('close', () => {
      clearInterval(heartbeat);
      clients.delete(res);
    });
    
    return;
  }

  // 静态文件服务
  let filePath = url.pathname === '/' ? '/index.html' : url.pathname;
  filePath = path.join(__dirname, filePath);
  
  // 安全检查
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
  };

  try {
    const content = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    res.end(content);
  } catch (err) {
    if (err.code === 'ENOENT') {
      res.writeHead(404);
      res.end('Not Found');
    } else {
      res.writeHead(500);
      res.end('Internal Server Error');
    }
  }
});

// 运行结算+学习
function runSettleAndLearn() {
  try {
    console.log('🔄 Running settlement check...');
    execSync('node settle.js', { cwd: __dirname, timeout: 30000, stdio: 'inherit' });
  } catch(e) {
    // settle.js handles its own errors
  }
}

// 启动服务器
server.listen(PORT, '0.0.0.0', async () => {
  console.log(`🚀 世界杯监控系统启动: http://localhost:${PORT}`);
  
  // 加载预测数据
  loadPredictions();
  
  // 初始数据加载
  await updateMatchData();
  
  // 运行结算+学习
  runSettleAndLearn();
  
  // 智能更新频率：比赛进行中每5秒，否则每30秒
  let updateInterval = 30000;
  let updateTimer = null;
  
  function smartUpdate() {
    updateMatchData();
    
    // 检查是否有比赛正在进行
    const hasLiveMatch = matchData.events?.some(e => 
      ['in', '2H', '1H', 'HT', 'ET', 'PK'].includes(e.status?.type?.state)
    );
    
    const newInterval = hasLiveMatch ? 5000 : 30000; // 比赛中5秒，否则30秒
    
    if (newInterval !== updateInterval) {
      updateInterval = newInterval;
      console.log(`⚡ 更新频率调整: ${updateInterval/1000}秒 (比赛${hasLiveMatch?'进行中':'未进行'})`);
    }
    
    clearTimeout(updateTimer);
    updateTimer = setTimeout(smartUpdate, updateInterval);
  }
  
  // 启动智能更新
  smartUpdate();
  
  // 定时结算+学习（每5分钟）
  setInterval(runSettleAndLearn, 300000);
  
  console.log('✅ 系统就绪');
});
