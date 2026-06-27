#!/usr/bin/env node
// 24/7预测系统 - 持续预测接下来的2场比赛
const fs = require('fs');
const path = require('path');
const https = require('https');

const DATA_DIR = path.join(__dirname, 'data');
const PREDICTIONS_FILE = path.join(DATA_DIR, 'predictions.json');
const MATCHES_API = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=20260611-20260628';

// 球队数据
const teamData = {
  'Qatar': { rank: 45, recent_form: 0.55, avg_goals: 1.4, avg_conceded: 1.1, world_cup_perf: 0.3, key_players: ['Almoez Ali', 'Akram Afif', 'Hassan Al-Haydos'], player_adaptation: 0.7, injury_impact: 0.1, experience: 0.5 },
  'Switzerland': { rank: 16, recent_form: 0.70, avg_goals: 1.7, avg_conceded: 0.8, world_cup_perf: 0.75, key_players: ['Granit Xhaka', 'Xherdan Shaqiri', 'Yann Sommer'], player_adaptation: 0.8, injury_impact: 0.05, experience: 0.8 },
  'Brazil': { rank: 3, recent_form: 0.80, avg_goals: 2.2, avg_conceded: 0.6, world_cup_perf: 0.95, key_players: ['Neymar', 'Vinícius Jr.', 'Casemiro'], player_adaptation: 0.9, injury_impact: 0.1, experience: 0.95 },
  'Morocco': { rank: 14, recent_form: 0.75, avg_goals: 1.6, avg_conceded: 0.7, world_cup_perf: 0.8, key_players: ['Achraf Hakimi', 'Hakim Ziyech', 'Youssef En-Nesyri'], player_adaptation: 0.85, injury_impact: 0.05, experience: 0.7 },
  'Germany': { rank: 10, recent_form: 0.70, avg_goals: 2.0, avg_conceded: 0.8, world_cup_perf: 0.90, key_players: ['Jamal Musiala', 'Florian Wirtz', 'İlkay Gündoğan'], player_adaptation: 0.85, injury_impact: 0.05, experience: 0.9 },
  'Curaçao': { rank: 78, recent_form: 0.40, avg_goals: 0.9, avg_conceded: 1.8, world_cup_perf: 0.1, key_players: ['Leandro Bacuna', 'Cuco Martina', 'Elson Hooi'], player_adaptation: 0.5, injury_impact: 0.15, experience: 0.2 },
  'Argentina': { rank: 1, recent_form: 0.85, avg_goals: 2.3, avg_conceded: 0.5, world_cup_perf: 0.98, key_players: ['Lionel Messi', 'Julián Álvarez', 'Enzo Fernández'], player_adaptation: 0.95, injury_impact: 0.05, experience: 0.98 },
  'Algeria': { rank: 37, recent_form: 0.60, avg_goals: 1.3, avg_conceded: 1.0, world_cup_perf: 0.50, key_players: ['Riyad Mahrez', 'Ismaël Bennacer', 'Youcef Atal'], player_adaptation: 0.7, injury_impact: 0.1, experience: 0.6 },
  'France': { rank: 4, recent_form: 0.80, avg_goals: 2.1, avg_conceded: 0.7, world_cup_perf: 0.92, key_players: ['Kylian Mbappé', 'Ousmane Dembélé', 'Antoine Griezmann'], player_adaptation: 0.9, injury_impact: 0.05, experience: 0.92 },
  'Senegal': { rank: 20, recent_form: 0.68, avg_goals: 1.4, avg_conceded: 0.9, world_cup_perf: 0.60, key_players: ['Sadio Mané', 'Kalidou Koulibaly', 'Édouard Mendy'], player_adaptation: 0.75, injury_impact: 0.1, experience: 0.65 },
  'England': { rank: 5, recent_form: 0.75, avg_goals: 1.9, avg_conceded: 0.8, world_cup_perf: 0.85, key_players: ['Jude Bellingham', 'Bukayo Saka', 'Harry Kane'], player_adaptation: 0.85, injury_impact: 0.05, experience: 0.85 },
  'Croatia': { rank: 12, recent_form: 0.68, avg_goals: 1.5, avg_conceded: 0.9, world_cup_perf: 0.78, key_players: ['Luka Modrić', 'Mateo Kovačić', 'Joško Gvardiol'], player_adaptation: 0.8, injury_impact: 0.05, experience: 0.8 },
  'Spain': { rank: 2, recent_form: 0.82, avg_goals: 2.0, avg_conceded: 0.6, world_cup_perf: 0.88, key_players: ['Pedri', 'Lamine Yamal', 'Álvaro Morata'], player_adaptation: 0.9, injury_impact: 0.05, experience: 0.88 },
  'Cape Verde': { rank: 68, recent_form: 0.45, avg_goals: 1.0, avg_conceded: 1.5, world_cup_perf: 0.15, key_players: ['Ryan Mendes', 'Garry Rodrigues', 'Júlio Tavares'], player_adaptation: 0.5, injury_impact: 0.15, experience: 0.2 },
  'Portugal': { rank: 6, recent_form: 0.78, avg_goals: 1.9, avg_conceded: 0.7, world_cup_perf: 0.82, key_players: ['Cristiano Ronaldo', 'Bruno Fernandes', 'Bernardo Silva'], player_adaptation: 0.85, injury_impact: 0.05, experience: 0.85 },
  'Congo DR': { rank: 53, recent_form: 0.52, avg_goals: 1.1, avg_conceded: 1.2, world_cup_perf: 0.35, key_players: ['Cédric Bakambu', 'Gaël Kakuta', 'Chancel Mbemba'], player_adaptation: 0.6, injury_impact: 0.15, experience: 0.4 },
  'Netherlands': { rank: 7, recent_form: 0.75, avg_goals: 1.8, avg_conceded: 0.8, world_cup_perf: 0.80, key_players: ['Frenkie de Jong', 'Cody Gakpo', 'Virgil van Dijk'], player_adaptation: 0.85, injury_impact: 0.05, experience: 0.8 },
  'Japan': { rank: 18, recent_form: 0.72, avg_goals: 1.5, avg_conceded: 0.9, world_cup_perf: 0.65, key_players: ['Takefusa Kubo', 'Kaoru Mitoma', 'Wataru Endo'], player_adaptation: 0.8, injury_impact: 0.05, experience: 0.7 },
  'Sweden': { rank: 21, recent_form: 0.60, avg_goals: 1.3, avg_conceded: 1.0, world_cup_perf: 0.65, key_players: ['Alexander Isak', 'Emil Forsberg', 'Dejan Kulusevski'], player_adaptation: 0.75, injury_impact: 0.1, experience: 0.7 },
  'Tunisia': { rank: 35, recent_form: 0.58, avg_goals: 1.2, avg_conceded: 1.1, world_cup_perf: 0.45, key_players: ['Wahbi Khazri', 'Youssef Msakni', 'Ellyes Skhiri'], player_adaptation: 0.65, injury_impact: 0.1, experience: 0.5 },
  'Norway': { rank: 42, recent_form: 0.58, avg_goals: 1.3, avg_conceded: 1.0, world_cup_perf: 0.50, key_players: ['Erling Haaland', 'Martin Ødegaard', 'Sander Berge'], player_adaptation: 0.75, injury_impact: 0.1, experience: 0.55 },
  'Iraq': { rank: 55, recent_form: 0.52, avg_goals: 1.1, avg_conceded: 1.2, world_cup_perf: 0.35, key_players: ['Mohammed Ali', 'Amjed Attwan', 'Ahmad Ibrahim'], player_adaptation: 0.6, injury_impact: 0.15, experience: 0.4 },
  'Saudi Arabia': { rank: 56, recent_form: 0.55, avg_goals: 1.2, avg_conceded: 1.2, world_cup_perf: 0.40, key_players: ['Salem Al-Dawsari', 'Feras Al-Brikan', 'Mohammed Kanno'], player_adaptation: 0.6, injury_impact: 0.1, experience: 0.45 },
  'Uruguay': { rank: 11, recent_form: 0.72, avg_goals: 1.7, avg_conceded: 0.8, world_cup_perf: 0.80, key_players: ['Luis Suárez', 'Federico Valverde', 'Ronald Araújo'], player_adaptation: 0.8, injury_impact: 0.1, experience: 0.8 },
  'Scotland': { rank: 40, recent_form: 0.58, avg_goals: 1.2, avg_conceded: 1.1, world_cup_perf: 0.50, key_players: ['Andy Robertson', 'John McGinn', 'Scott McTominay'], player_adaptation: 0.7, injury_impact: 0.1, experience: 0.55 },
  'Haiti': { rank: 87, recent_form: 0.42, avg_goals: 0.9, avg_conceded: 1.6, world_cup_perf: 0.15, key_players: ['Duckens Nazon', 'Steeven Saba', 'Ricardo Adé'], player_adaptation: 0.45, injury_impact: 0.2, experience: 0.2 },
  'Australia': { rank: 24, recent_form: 0.62, avg_goals: 1.3, avg_conceded: 1.0, world_cup_perf: 0.55, key_players: ['Mathew Leckie', 'Aaron Mooy', 'Harry Souttar'], player_adaptation: 0.7, injury_impact: 0.1, experience: 0.6 },
  'Türkiye': { rank: 26, recent_form: 0.62, avg_goals: 1.4, avg_conceded: 1.0, world_cup_perf: 0.60, key_players: ['Hakan Çalhanoğlu', 'Cengiz Ünder', 'Merih Demiral'], player_adaptation: 0.75, injury_impact: 0.1, experience: 0.65 },
  'Paraguay': { rank: 51, recent_form: 0.45, avg_goals: 1.1, avg_conceded: 1.3, world_cup_perf: 0.4, key_players: ['Miguel Almirón', 'Julio Enciso', 'Antonio Sanabria'], player_adaptation: 0.6, injury_impact: 0.1, experience: 0.5 },
  'United States': { rank: 14, recent_form: 0.65, avg_goals: 1.8, avg_conceded: 0.9, world_cup_perf: 0.7, key_players: ['Christian Pulisic', 'Weston McKennie', 'Giovanni Reyna'], player_adaptation: 0.8, injury_impact: 0.05, experience: 0.7 },
  'Belgium': { rank: 8, recent_form: 0.65, avg_goals: 1.7, avg_conceded: 0.9, world_cup_perf: 0.75, key_players: ['Kevin De Bruyne', 'Romelu Lukaku', 'Thibaut Courtois'], player_adaptation: 0.8, injury_impact: 0.1, experience: 0.8 },
  'Egypt': { rank: 32, recent_form: 0.60, avg_goals: 1.3, avg_conceded: 1.0, world_cup_perf: 0.48, key_players: ['Mohamed Salah', 'Mohamed Elneny', 'Ahmed Hegazi'], player_adaptation: 0.7, injury_impact: 0.1, experience: 0.55 },
  'Iran': { rank: 22, recent_form: 0.65, avg_goals: 1.3, avg_conceded: 0.9, world_cup_perf: 0.55, key_players: ['Mehdi Taremi', 'Sardar Azmoun', 'Alireza Jahanbakhsh'], player_adaptation: 0.7, injury_impact: 0.1, experience: 0.6 },
  'New Zealand': { rank: 88, recent_form: 0.45, avg_goals: 1.0, avg_conceded: 1.5, world_cup_perf: 0.20, key_players: ['Chris Wood', 'Winston Reid', 'Marko Stamenic'], player_adaptation: 0.5, injury_impact: 0.15, experience: 0.3 },
  'Austria': { rank: 25, recent_form: 0.62, avg_goals: 1.4, avg_conceded: 1.0, world_cup_perf: 0.58, key_players: ['David Alaba', 'Marcel Sabitzer', 'Konrad Laimer'], player_adaptation: 0.75, injury_impact: 0.1, experience: 0.6 },
  'Jordan': { rank: 62, recent_form: 0.50, avg_goals: 1.1, avg_conceded: 1.2, world_cup_perf: 0.30, key_players: ['Mousa Al-Tamari', 'Yazeed Abulaila', 'Ehsan Haddad'], player_adaptation: 0.55, injury_impact: 0.15, experience: 0.35 },
  'Colombia': { rank: 13, recent_form: 0.70, avg_goals: 1.6, avg_conceded: 0.8, world_cup_perf: 0.72, key_players: ['James Rodríguez', 'Luis Díaz', 'Radamel Falcao'], player_adaptation: 0.8, injury_impact: 0.1, experience: 0.75 },
  'Uzbekistan': { rank: 60, recent_form: 0.50, avg_goals: 1.1, avg_conceded: 1.2, world_cup_perf: 0.25, key_players: ['Eldor Shomurodov', 'Otabek Shukurov', 'Jaloliddin Masharipov'], player_adaptation: 0.55, injury_impact: 0.15, experience: 0.3 },
  'Mexico': { rank: 15, recent_form: 0.65, avg_goals: 1.6, avg_conceded: 0.9, world_cup_perf: 0.70, key_players: ['Hirving Lozano', 'Raúl Jiménez', 'Edson Álvarez'], player_adaptation: 0.75, injury_impact: 0.1, experience: 0.75 },
  'South Korea': { rank: 23, recent_form: 0.68, avg_goals: 1.4, avg_conceded: 1.0, world_cup_perf: 0.60, key_players: ['Son Heung-min', 'Lee Kang-in', 'Kim Min-jae'], player_adaptation: 0.75, injury_impact: 0.1, experience: 0.65 },
  'Czechia': { rank: 36, recent_form: 0.58, avg_goals: 1.3, avg_conceded: 1.0, world_cup_perf: 0.55, key_players: ['Patrik Schick', 'Tomáš Souček', 'Antonín Barák'], player_adaptation: 0.7, injury_impact: 0.1, experience: 0.6 },
  'South Africa': { rank: 58, recent_form: 0.50, avg_goals: 1.1, avg_conceded: 1.2, world_cup_perf: 0.30, key_players: ['Percy Tau', 'Bongani Zungu', 'Ronwen Williams'], player_adaptation: 0.6, injury_impact: 0.15, experience: 0.4 },
  'Bosnia-Herzegovina': { rank: 63, recent_form: 0.52, avg_goals: 1.1, avg_conceded: 1.2, world_cup_perf: 0.35, key_players: ['Edin Džeko', 'Miralem Pjanić', 'Sead Kolašinac'], player_adaptation: 0.65, injury_impact: 0.1, experience: 0.5 },
  'Canada': { rank: 43, recent_form: 0.60, avg_goals: 1.3, avg_conceded: 1.1, world_cup_perf: 0.45, key_players: ['Alphonso Davies', 'Jonathan David', 'Tajon Buchanan'], player_adaptation: 0.7, injury_impact: 0.1, experience: 0.5 },
  'Ghana': { rank: 44, recent_form: 0.55, avg_goals: 1.2, avg_conceded: 1.1, world_cup_perf: 0.55, key_players: ['Mohammed Kudus', 'Thomas Partey', 'Inaki Williams'], player_adaptation: 0.7, injury_impact: 0.1, experience: 0.6 },
  'Panama': { rank: 52, recent_form: 0.52, avg_goals: 1.1, avg_conceded: 1.2, world_cup_perf: 0.40, key_players: ['Anibal Godoy', 'Yoel Bárcenas', 'Michael Murillo'], player_adaptation: 0.6, injury_impact: 0.15, experience: 0.45 },
};

// 泊松分布采样
function poissonSample(lam) {
  if (lam <= 0) return 0;
  const L = Math.exp(-lam);
  let k = 0, p = 1;
  while (p > L) { k++; p *= Math.random(); }
  return k - 1;
}

// 计算球员因素
function calculatePlayerFactor(team) {
  const adaptation = team.player_adaptation || 0.7;
  const injury = team.injury_impact || 0.1;
  const experience = team.experience || 0.5;
  return adaptation * (1 - injury * 0.5) * (0.7 + experience * 0.3);
}

// 模拟比赛
function simulateMatch(homeTeam, awayTeam, nSims = 200000) {
  const home = teamData[homeTeam];
  const away = teamData[awayTeam];
  if (!home || !away) return null;

  const homeAttack = home.avg_goals / 1.2;
  const awayAttack = away.avg_goals / 1.2;
  const homeDefense = 1.2 / Math.max(0.5, home.avg_conceded);
  const awayDefense = 1.2 / Math.max(0.5, away.avg_conceded);

  const homePlayerFactor = calculatePlayerFactor(home);
  const awayPlayerFactor = calculatePlayerFactor(away);

  let homeXG = 1.3 * homeAttack * (1 / awayDefense) * (1 + home.recent_form * 0.2) * (1 + home.world_cup_perf * 0.1) * homePlayerFactor;
  let awayXG = 1.3 * awayAttack * (1 / homeDefense) * (1 + away.recent_form * 0.2) * (1 + away.world_cup_perf * 0.1) * awayPlayerFactor;

  homeXG *= 1.15;
  homeXG = Math.max(0.3, homeXG);
  awayXG = Math.max(0.3, awayXG);

  const scoreCounts = {};
  let homeWins = 0, draws = 0, awayWins = 0;

  for (let i = 0; i < nSims; i++) {
    const hg = poissonSample(homeXG);
    const ag = poissonSample(awayXG);
    const score = `${hg}-${ag}`;
    scoreCounts[score] = (scoreCounts[score] || 0) + 1;
    if (hg > ag) homeWins++;
    else if (hg === ag) draws++;
    else awayWins++;
  }

  const sortedScores = Object.entries(scoreCounts).sort((a, b) => b[1] - a[1]);
  const homePct = Math.round(homeWins / nSims * 100 * 10) / 10;
  const drawPct = Math.round(draws / nSims * 100 * 10) / 10;
  const awayPct = Math.round(awayWins / nSims * 100 * 10) / 10;

  const favoritePct = Math.max(homePct, awayPct);
  const favoriteSide = homePct > awayPct ? 'home' : 'away';

  let upsetProb;
  if (favoritePct > 45) {
    upsetProb = Math.round((100 - favoritePct) * 10) / 10;
  } else {
    upsetProb = Math.round((drawPct + Math.min(homePct, awayPct)) * 10) / 10;
  }

  const upsetScores = {};
  for (const [scoreStr, count] of Object.entries(scoreCounts)) {
    const [hg, ag] = scoreStr.split('-').map(Number);
    let isUpset = false;
    if (favoriteSide === 'home' && hg <= ag) isUpset = true;
    if (favoriteSide === 'away' && ag <= hg) isUpset = true;
    if (isUpset) upsetScores[scoreStr] = Math.round(count / nSims * 100 * 10) / 10;
  }

  const sortedUpset = Object.entries(upsetScores).sort((a, b) => b[1] - a[1]);
  const topUpsetScores = sortedUpset.slice(0, 5).map(([s, p]) => [s, p]);

  const scenarios = [];
  if (drawPct > 10) {
    const drawScores = Object.entries(upsetScores).filter(([s]) => s.split('-')[0] === s.split('-')[1]);
    const topDraw = drawScores.sort((a, b) => b[1] - a[1]).slice(0, 2);
    scenarios.push({ type: 'draw', prob: drawPct, bet: '押平局', scores: topDraw.map(([s, p]) => [s, p]) });
  }

  if (favoriteSide === 'home' && awayPct > 8) {
    const awayScores = Object.entries(upsetScores).filter(([s]) => parseInt(s.split('-')[1]) > parseInt(s.split('-')[0]));
    const topAway = awayScores.sort((a, b) => b[1] - a[1]).slice(0, 2);
    scenarios.push({ type: 'away_win', prob: awayPct, bet: `押客队+${awayPct < 30 ? 1 : 0.5}球`, scores: topAway.map(([s, p]) => [s, p]) });
  } else if (favoriteSide === 'away' && homePct > 8) {
    const homeScores = Object.entries(upsetScores).filter(([s]) => parseInt(s.split('-')[0]) > parseInt(s.split('-')[1]));
    const topHome = homeScores.sort((a, b) => b[1] - a[1]).slice(0, 2);
    scenarios.push({ type: 'home_win', prob: homePct, bet: `押主队+${homePct < 30 ? 1 : 0.5}球`, scores: topHome.map(([s, p]) => [s, p]) });
  }

  let recommended = '';
  if (topUpsetScores.length > 0) {
    recommended = `爆冷比分推荐：${topUpsetScores[0][0]}(${topUpsetScores[0][1]}%)`;
    if (topUpsetScores.length > 1) recommended += `、${topUpsetScores[1][0]}(${topUpsetScores[1][1]}%)`;
  }

  const top5Conf = Math.round(sortedScores.slice(0, 5).reduce((s, [, c]) => s + c, 0) / nSims * 100 * 10) / 10;

  return {
    direction: { home_win_pct: homePct, draw_pct: drawPct, away_win_pct: awayPct },
    score: { predicted: sortedScores[0][0], confidence: Math.round(sortedScores[0][1] / nSims * 100 * 10) / 10, top_scores: sortedScores.slice(0, 10).map(([s, c]) => [s, Math.round(c / nSims * 100 * 10) / 10]) },
    confidence_pct: top5Conf,
    direction_confidence: favoritePct,
    score_confidence: Math.round(sortedScores[0][1] / nSims * 100 * 10) / 10,
    upset_analysis: { upset_prob: upsetProb, top_upset_scores: topUpsetScores, scenarios, recommended_bet: recommended },
    simulations: nSims,
    type: 'pre_match',
    homeXG: Math.round(homeXG * 100) / 100,
    awayXG: Math.round(awayXG * 100) / 100,
    player_factors: {
      home: { adaptation: home.player_adaptation, injury_impact: home.injury_impact, experience: home.experience, factor: Math.round(calculatePlayerFactor(home) * 100) / 100 },
      away: { adaptation: away.player_adaptation, injury_impact: away.injury_impact, experience: away.experience, factor: Math.round(calculatePlayerFactor(away) * 100) / 100 }
    },
    key_players: { home: home.key_players, away: away.key_players }
  };
}

// 获取比赛数据
async function fetchMatches() {
  return new Promise((resolve, reject) => {
    https.get(MATCHES_API, { headers: { 'Accept-Encoding': 'identity' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

// 主循环
async function main() {
  console.log('🚀 24/7预测系统启动');
  
  while (true) {
    try {
      // 获取比赛数据
      const matchData = await fetchMatches();
      const events = matchData.events || [];
      
      // 找到接下来的2场比赛
      const upcoming = events
        .filter(e => !['post', 'in', '2H', '1H', 'HT', 'ET', 'PK'].includes(e.status?.type?.state))
        .sort((a, b) => new Date(a.date) - new Date(b.date))
        .slice(0, 2);
      
      if (upcoming.length === 0) {
        console.log('⏳ 没有 upcoming 比赛，等待...');
        await new Promise(r => setTimeout(r, 60000));
        continue;
      }
      
      console.log(`\n📊 预测 ${upcoming.length} 场比赛:`);
      
      // 读取现有预测
      let predictions = { matches: [] };
      try {
        predictions = JSON.parse(fs.readFileSync(PREDICTIONS_FILE, 'utf8'));
      } catch(e) {}
      
      // 更新预测
      for (const event of upcoming) {
        const homeTeam = event.competitions?.[0]?.competitors?.find(c => c.homeAway === 'home')?.team?.displayName;
        const awayTeam = event.competitions?.[0]?.competitors?.find(c => c.homeAway === 'away')?.team?.displayName;
        
        if (!homeTeam || !awayTeam) continue;
        
        const existing = predictions.matches.find(m => m.id === event.id);
        if (existing && existing.locked) {
          console.log(`  🔒 ${event.name} - 已锁定`);
          continue;
        }
        
        const result = simulateMatch(homeTeam, awayTeam, 200000);
        if (!result) continue;
        
        const pred = {
          id: event.id,
          name: event.name,
          date: event.date,
          home: { name: homeTeam, short: event.competitions?.[0]?.competitors?.find(c => c.homeAway === 'home')?.team?.shortDisplayName || homeTeam, rank: teamData[homeTeam]?.rank || 50 },
          away: { name: awayTeam, short: event.competitions?.[0]?.competitors?.find(c => c.homeAway === 'away')?.team?.shortDisplayName || awayTeam, rank: teamData[awayTeam]?.rank || 50 },
          prediction: result
        };
        
        const idx = predictions.matches.findIndex(m => m.id === event.id);
        if (idx >= 0) {
          predictions.matches[idx] = pred;
        } else {
          predictions.matches.push(pred);
        }
        
        console.log(`  ✅ ${event.name} - 预测:${result.score.predicted} 胜率:${result.direction.home_win_pct}/${result.direction.draw_pct}/${result.direction.away_win_pct}`);
      }
      
      // 保存预测
      fs.writeFileSync(PREDICTIONS_FILE, JSON.stringify(predictions, null, 2));
      console.log(`💾 保存预测: ${predictions.matches.length} 场`);
      
      // 等待5分钟
      await new Promise(r => setTimeout(r, 300000));
      
    } catch (err) {
      console.error('❌ 错误:', err.message);
      await new Promise(r => setTimeout(r, 60000));
    }
  }
}

main();
