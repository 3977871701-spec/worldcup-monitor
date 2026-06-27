const fs = require('fs');
const path = require('path');
const https = require('https');
const { learn } = require('./learn.js');

const ESPN_API = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world';
const DATA_DIR = path.join(__dirname, 'data');

async function fetchMatches() {
  return new Promise((resolve, reject) => {
    https.get(ESPN_API + '/scoreboard?dates=20260611-20260628', {headers:{'Accept-Encoding':'identity'}}, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

function loadPredictions() {
  try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'predictions.json'), 'utf8')); }
  catch(e) { return {matches:[]}; }
}

function loadSettlements() {
  try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'settlements.json'), 'utf8')); }
  catch(e) { return []; }
}

function saveSettlements(s) {
  fs.writeFileSync(path.join(DATA_DIR, 'settlements.json'), JSON.stringify(s, null, 2));
}

function analyzePrediction(prediction, homeScore, awayScore) {
  const actualWinner = homeScore > awayScore ? 'home' : (awayScore > homeScore ? 'away' : 'draw');
  const actualScore = homeScore + '-' + awayScore;
  const result = {
    actualWinner,
    actualScore,
    directionCorrect: false,
    scoreCorrect: false,
    accuracy: 0,
    isUpset: false
  };
  if (!prediction) return result;

  // Determine predicted direction from direction object or flat fields
  const hPct = prediction.direction?.home_win_pct ?? prediction.home_win_pct ?? 0;
  const dPct = prediction.direction?.draw_pct ?? prediction.draw_pct ?? 0;
  const aPct = prediction.direction?.away_win_pct ?? prediction.away_win_pct ?? 0;

  const predWinner = hPct > aPct ? 'home' : (aPct > hPct ? 'away' : 'draw');
  result.directionCorrect = predWinner === actualWinner;

  const predScore = prediction.score?.predicted ?? prediction.predicted_score ?? '';
  result.scoreCorrect = predScore === actualScore;

  const actualPct = actualWinner === 'home' ? hPct : (actualWinner === 'away' ? aPct : dPct);
  result.isUpset = actualPct < 30;

  let score = 0;
  if (result.directionCorrect) score += 50;
  if (result.scoreCorrect) score += 30;
  if (result.isUpset && result.directionCorrect) score += 20;
  score += Math.min(20, actualPct / 5);
  result.accuracy = Math.min(100, Math.round(score));
  return result;
}

async function runSettlement() {
  console.log('🔄 赛后结算...');
  const matchData = await fetchMatches();
  const predictions = loadPredictions();
  const settlements = loadSettlements();

  const finished = matchData.events?.filter(e => e.status?.type?.state === 'post') || [];
  let newSettlements = 0;

  for (const e of finished) {
    if (settlements.find(s => s.matchId === e.id)) continue;

    // Only settle matches that have predictions with type "pre_match"
    const pred = predictions.matches?.find(m => m.id === e.id);
    if (!pred) continue;
    if (pred.prediction?.type !== 'pre_match') continue;

    const comp = e.competitions?.[0];
    const cs = comp?.competitors || [];
    const h = cs.find(x => x.homeAway === 'home') || cs[0];
    const a = cs.find(x => x.homeAway === 'away') || cs[1];

    const homeScore = parseInt(h.score || '0');
    const awayScore = parseInt(a.score || '0');
    const result = analyzePrediction(pred.prediction, homeScore, awayScore);

    settlements.push({
      matchId: e.id,
      homeTeam: h.team?.displayName || '?',
      awayTeam: a.team?.displayName || '?',
      homeShort: pred.home?.short || h.team?.shortDisplayName || '?',
      awayShort: pred.away?.short || a.team?.shortDisplayName || '?',
      homeScore, awayScore,
      prediction: pred.prediction,
      result,
      timestamp: new Date().toISOString()
    });
    newSettlements++;
    console.log(`✅ ${h.team?.displayName} ${homeScore}-${awayScore} ${a.team?.displayName} | ${result.directionCorrect?'✓方向':'✗方向'} | ${result.scoreCorrect?'✓比分':'✗比分'} | ${result.accuracy}%`);
  }

  const total = settlements.length;
  const dirOk = settlements.filter(s => s.result?.directionCorrect).length;
  const scoreOk = settlements.filter(s => s.result?.scoreCorrect).length;
  
  // 保留已有的实时预测统计
  let existingStats = {};
  try { existingStats = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'stats.json'), 'utf8')); } catch(e) {}
  
  const stats = {
    total, directionCorrect: dirOk,
    directionRate: total > 0 ? Math.round(dirOk / total * 100) : 0,
    scoreCorrect: scoreOk,
    scoreRate: total > 0 ? Math.round(scoreOk / total * 100) : 0,
    avgAccuracy: total > 0 ? Math.round(settlements.reduce((s,x) => s + (x.result?.accuracy||0), 0) / total) : 0,
    upsets: settlements.filter(s => s.result?.isUpset).length,
    // 保留实时预测统计
    realtime_correct: existingStats.realtime_correct || 0,
    realtime_total: existingStats.realtime_total || 0,
    realtime_rate: existingStats.realtime_rate || 0
  };

  fs.writeFileSync(path.join(DATA_DIR, 'stats.json'), JSON.stringify(stats, null, 2));
  if (newSettlements > 0) {
    saveSettlements(settlements);
    console.log(`\n📊 总结: ${total}场 | 方向${dirOk}场(${stats.directionRate}%) | 比分${scoreOk}场(${stats.scoreRate}%) | 均准${stats.avgAccuracy}%`);

    // After settling, run learning to re-predict upcoming matches
    console.log('\n🧠 Running auto-learning...');
    learn();
  } else {
    console.log('无新比赛需结算（或无赛前预测）');
  }
  
  // 更新实时预测正确率（每场比赛结束后自动更新）
  updateRealtimeAccuracy(settlements);
}

// 实时预测正确率追踪
function updateRealtimeAccuracy(settlements) {
  let existingStats = {};
  try { existingStats = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'stats.json'), 'utf8')); } catch(e) {}
  
  // 只有当有新的实时预测结果时才更新
  // 保留已有的实时预测统计（不覆盖）
  // 实时预测正确率由用户手动设置或专门的实时预测系统更新
  
  // 不覆盖已有的实时预测数据
  if (!existingStats.realtime_correct) {
    existingStats.realtime_correct = 0;
    existingStats.realtime_total = 0;
    existingStats.realtime_rate = 0;
  }
  
  // 保留已有的详情
  if (!existingStats.realtime_details) {
    existingStats.realtime_details = settlements.map(s => ({
      match: `${s.homeShort} vs ${s.awayShort}`,
      correct: s.result?.directionCorrect || false,
      note: s.result?.directionCorrect ? '方向正确' : '方向错误'
    }));
  }
  
  fs.writeFileSync(path.join(DATA_DIR, 'stats.json'), JSON.stringify(existingStats, null, 2));
  console.log(`⚡ 实时预测: ${existingStats.realtime_correct}/${existingStats.realtime_total} (${existingStats.realtime_rate}%)`);
}

runSettlement().catch(console.error);
