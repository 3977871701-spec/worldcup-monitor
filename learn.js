const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const PRED_FILE = path.join(DATA_DIR, 'predictions.json');
const SETTLE_FILE = path.join(DATA_DIR, 'settlements.json');
const PROFILES_FILE = path.join(DATA_DIR, 'team_profiles.json');
const PERFORMANCE_FILE = path.join(DATA_DIR, 'team_performance.json');

// Load team profiles
function loadTeamProfiles() {
  try {
    return JSON.parse(fs.readFileSync(PROFILES_FILE, 'utf8'));
  } catch(e) {
    console.log('⚠️ Team profiles not found, using defaults');
    return {};
  }
}

// Load team performance data
function loadTeamPerformance() {
  try {
    return JSON.parse(fs.readFileSync(PERFORMANCE_FILE, 'utf8'));
  } catch(e) {
    return {};
  }
}

// Poisson sample
function poissonSample(lambda) {
  let L = Math.exp(-lambda), k = 0, p = 1;
  do { k++; p *= Math.random(); } while (p > L);
  return k - 1;
}

// Monte Carlo with learning adjustments and strategic factors
function monteCarloSimulateAdjusted(homeRank, awayRank, numSims, adjustments, matchContext) {
  numSims = numSims || 200000;
  const adj = adjustments || {};
  const rankWeight = adj.rankWeight || 0.015;
  const baseGoals = adj.baseGoals || 1.3;
  const homeBonus = adj.homeBonus || 0;

  const rankDiff = awayRank - homeRank;
  
  // 动态rankWeight：排名差距越大，权重越大
  let dynamicRankWeight = rankWeight;
  if (rankDiff > 50) {
    dynamicRankWeight = rankWeight * 1.8;  // 差距超过50位，权重增加80%
  } else if (rankDiff > 30) {
    dynamicRankWeight = rankWeight * 1.4;  // 差距30-50位，权重增加40%
  } else if (rankDiff > 15) {
    dynamicRankWeight = rankWeight * 1.1;  // 差距15-30位，权重增加10%
  }
  
  let homeXG = Math.max(0.3, baseGoals + rankDiff * dynamicRankWeight + homeBonus);
  let awayXG = Math.max(0.2, baseGoals - rankDiff * dynamicRankWeight * 0.8);  // 弱队进球更低

  // Apply team profile factors
  const profiles = loadTeamProfiles();
  const context = matchContext || {};

  if (context.homeTeam && context.awayTeam) {
    const homeProfile = profiles[context.homeTeam];
    const awayProfile = profiles[context.awayTeam];

    // Apply motivation factor
    if (homeProfile?.motivation_factor) {
      homeXG *= homeProfile.motivation_factor;
    }
    if (awayProfile?.motivation_factor) {
      awayXG *= awayProfile.motivation_factor;
    }

    // Apply style matchup adjustments
    if (homeProfile && awayProfile) {
      // Counter-attacking teams do better against possession teams
      const homeIsCounter = homeProfile.style?.includes('反击');
      const awayIsCounter = awayProfile.style?.includes('反击');
      const homeIsPossession = homeProfile.style?.includes('控球');
      const awayIsPossession = awayProfile.style?.includes('控球');

      if (homeIsCounter && awayIsPossession) {
        homeXG *= 1.05; // Counter-attacking gets slight boost vs possession
      }
      if (awayIsCounter && homeIsPossession) {
        awayXG *= 1.05;
      }

      // Defensive teams have lower expected goals
      const homeIsDefensive = homeProfile.style?.includes('防守');
      const awayIsDefensive = awayProfile.style?.includes('防守');
      if (homeIsDefensive) homeXG *= 0.95;
      if (awayIsDefensive) awayXG *= 0.95;
    }

    // Strategic motivation adjustments
    if (context.homeMotivation === 'must_win') {
      homeXG *= 1.1; // More aggressive but also more vulnerable
      awayXG *= 1.05; // Counter-attack opportunities
    }
    if (context.awayMotivation === 'must_win') {
      awayXG *= 1.1;
      homeXG *= 1.05;
    }
    if (context.homeMotivation === 'qualified') {
      homeXG *= 0.9; // May rest players
    }
    if (context.awayMotivation === 'qualified') {
      awayXG *= 0.9;
    }
  }

  let homeWins = 0, draws = 0, awayWins = 0;
  const scoreCounts = {};

  for (let i = 0; i < numSims; i++) {
    const hg = poissonSample(homeXG);
    const ag = poissonSample(awayXG);
    const key = hg + '-' + ag;
    scoreCounts[key] = (scoreCounts[key] || 0) + 1;
    if (hg > ag) homeWins++;
    else if (hg === ag) draws++;
    else awayWins++;
  }

  let homePct = Math.round(homeWins / numSims * 1000) / 10;
  let drawPct = Math.round(draws / numSims * 1000) / 10;
  let awayPct = Math.round(awayWins / numSims * 1000) / 10;

  // Improved draw prediction: when teams are evenly ranked
  const rankDiffAbs = Math.abs(rankDiff);
  if (rankDiffAbs < 10) {
    // Teams are evenly matched, increase draw probability significantly
    const drawBoost = 25 + (10 - rankDiffAbs) * 1.0; // 25-35% boost
    drawPct = Math.min(50, drawPct + drawBoost);
    // Normalize to 100%
    const total = homePct + drawPct + awayPct;
    homePct = Math.round(homePct / total * 1000) / 10;
    drawPct = Math.round(drawPct / total * 1000) / 10;
    awayPct = Math.round(awayPct / total * 1000) / 10;
  } else if (rankDiffAbs < 20) {
    // Moderately matched teams
    const drawBoost = 15 + (20 - rankDiffAbs) * 0.5; // 15-20% boost
    drawPct = Math.min(45, drawPct + drawBoost);
    const total = homePct + drawPct + awayPct;
    homePct = Math.round(homePct / total * 1000) / 10;
    drawPct = Math.round(drawPct / total * 1000) / 10;
    awayPct = Math.round(awayPct / total * 1000) / 10;
  }

  // Further boost draw probability for defensive matchups
  if (context.homeTeam && context.awayTeam) {
    const homeProfile = profiles[context.homeTeam];
    const awayProfile = profiles[context.awayTeam];
    if (homeProfile && awayProfile) {
      const homeIsDefensive = homeProfile.style?.includes('防守') || homeProfile.weaknesses?.includes('创造力');
      const awayIsDefensive = awayProfile.style?.includes('防守') || awayProfile.weaknesses?.includes('创造力');
      if (homeIsDefensive && awayIsDefensive) {
        drawPct = Math.min(50, drawPct + 10);
      }
    }
  }
  
  // 应用学习调整的drawBoost
  if (adj.drawBoost && adj.drawBoost > 0) {
    drawPct = Math.min(50, drawPct + adj.drawBoost);
  }
  
  // 归一化到100%
  {const total = homePct + drawPct + awayPct;
  homePct = Math.round(homePct / total * 1000) / 10;
  drawPct = Math.round(drawPct / total * 1000) / 10;
  awayPct = Math.round(awayPct / total * 1000) / 10;}

  // Group stage: draw benefits both teams scenario
  if (context.stage === 'group' && context.matchday === 3) {
    // Last group match, draw might benefit both
    drawPct = Math.min(45, drawPct + 5);
    const total = homePct + drawPct + awayPct;
    homePct = Math.round(homePct / total * 1000) / 10;
    drawPct = Math.round(drawPct / total * 1000) / 10;
    awayPct = Math.round(awayPct / total * 1000) / 10;
  }

  // 大幅提升平局概率（基于今日6场平局43%的分析）
  // 1. 所有比赛基础平局概率提升到30%
  if (drawPct < 30) {
    drawPct = 30;
    const total = homePct + drawPct + awayPct;
    homePct = Math.round(homePct / total * 1000) / 10;
    drawPct = Math.round(drawPct / total * 1000) / 10;
    awayPct = Math.round(awayPct / total * 1000) / 10;
  }

  // 2. 排名接近的比赛（差距<15位）平局概率提升到40%
  if (rankDiffAbs < 15) {
    drawPct = Math.min(45, drawPct + 15);
    const total = homePct + drawPct + awayPct;
    homePct = Math.round(homePct / total * 1000) / 10;
    drawPct = Math.round(drawPct / total * 1000) / 10;
    awayPct = Math.round(awayPct / total * 1000) / 10;
  }

  // 3. 防守型球队vs强队，平局概率提升到35-40%
  if (context.homeTeam && context.awayTeam) {
    const homeProfile = profiles[context.homeTeam];
    const awayProfile = profiles[context.awayTeam];
    
    if (homeProfile && awayProfile) {
      const homeIsDefensive = homeProfile.style?.includes('防守') || homeProfile.weaknesses?.includes('创造力');
      const awayIsDefensive = awayProfile.style?.includes('防守') || awayProfile.weaknesses?.includes('创造力');
      
      // 强队vs弱队防守型
      if (rankDiffAbs > 30 && (homeIsDefensive || awayIsDefensive)) {
        drawPct = Math.min(40, drawPct + 15);
      }
      
      // 两队都防守型
      if (homeIsDefensive && awayIsDefensive) {
        drawPct = Math.min(45, drawPct + 10);
      }
      
      const total = homePct + drawPct + awayPct;
      homePct = Math.round(homePct / total * 1000) / 10;
      drawPct = Math.round(drawPct / total * 1000) / 10;
      awayPct = Math.round(awayPct / total * 1000) / 10;
    }
  }

  const sortedScores = Object.entries(scoreCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([score, count]) => [score, Math.round(count / numSims * 1000) / 10]);

  const bestScore = sortedScores[0][0];
  const maxPct = Math.max(homePct, drawPct, awayPct);
  const favorite = homePct >= awayPct ? 'home' : 'away';
  const upsetProb = favorite === 'home' ? (drawPct + awayPct) : (drawPct + homePct);
  const scoreUpsetProb = Math.round((100 - sortedScores.slice(0, 3).reduce((s, x) => s + x[1], 0)) * 10) / 10;

  const scenarios = [];
  if (drawPct > 15) scenarios.push({ type: 'draw', prob: drawPct, bet: '押平局' });
  if (favorite === 'home' && awayPct > 12) scenarios.push({ type: 'away_win', prob: awayPct, bet: '押客队+1.5球' });
  if (favorite === 'away' && homePct > 12) scenarios.push({ type: 'home_win', prob: homePct, bet: '押主队+1.5球' });

  let recommendedBet = '如果押冷门：';
  if (drawPct > 25) recommendedBet += '押平局赔率较好';
  else if (favorite === 'home' && awayPct > 20) recommendedBet += '押客队赔率较高';
  else if (favorite === 'away' && homePct > 20) recommendedBet += '押主队赔率较高';
  else recommendedBet += '关注大小球方向';

  // Generate tactical analysis
  let tacticalAnalysis = '';
  if (context.homeTeam && context.awayTeam) {
    const homeProfile = profiles[context.homeTeam];
    const awayProfile = profiles[context.awayTeam];
    if (homeProfile && awayProfile) {
      tacticalAnalysis = `主队${homeProfile.style}，客队${awayProfile.style}。`;
      tacticalAnalysis += `主队优势：${homeProfile.strengths?.slice(0,2).join('、') || '待观察'}；`;
      tacticalAnalysis += `客队优势：${awayProfile.strengths?.slice(0,2).join('、') || '待观察'}。`;
      if (homeProfile.vs_strong_team && awayProfile.vs_strong_team) {
        tacticalAnalysis += `面对强队，主队倾向${homeProfile.vs_strong_team}，客队倾向${awayProfile.vs_strong_team}。`;
      }
    }
  }

  return {
    home_win_pct: homePct, draw_pct: drawPct, away_win_pct: awayPct,
    predicted_score: bestScore, confidence_pct: Math.round(maxPct * 10) / 10,
    top_scores: sortedScores, simulations: numSims,
    homeXG: Math.round(homeXG * 100) / 100, awayXG: Math.round(awayXG * 100) / 100,
    upset_analysis: {
      upset_prob: Math.round(upsetProb * 10) / 10,
      score_upset_prob: Math.round(scoreUpsetProb * 10) / 10,
      scenarios, recommended_bet: recommendedBet
    },
    tactical_analysis: tacticalAnalysis,
    team_style_comparison: context.homeTeam && context.awayTeam ? {
      home_style: profiles[context.homeTeam]?.style || '未知',
      away_style: profiles[context.awayTeam]?.style || '未知',
      home_strengths: profiles[context.homeTeam]?.strengths || [],
      away_strengths: profiles[context.awayTeam]?.strengths || [],
      home_weaknesses: profiles[context.homeTeam]?.weaknesses || [],
      away_weaknesses: profiles[context.awayTeam]?.weaknesses || [],
      key_tactics: [
        ...(profiles[context.homeTeam]?.key_tactics || []),
        ...(profiles[context.awayTeam]?.key_tactics || [])
      ].slice(0, 4)
    } : null,
    motivation_analysis: {
      home_motivation: context.homeMotivation || 'normal',
      away_motivation: context.awayMotivation || 'normal',
      home_factor: profiles[context.homeTeam]?.motivation_factor || 1.0,
      away_factor: profiles[context.awayTeam]?.motivation_factor || 1.0
    }
  };
}

function learn() {
  console.log('🧠 Auto-learning from settlements...');

  let settlements = [];
  try { settlements = JSON.parse(fs.readFileSync(SETTLE_FILE, 'utf8')); } catch(e) {}

  let predictions;
  try { predictions = JSON.parse(fs.readFileSync(PRED_FILE, 'utf8')); } catch(e) {
    console.log('❌ Cannot read predictions.json');
    return;
  }

  if (!settlements.length) {
    console.log('📭 No settlements yet, skipping learning');
    return;
  }

  // Load team profiles and performance
  const profiles = loadTeamProfiles();
  const performance = loadTeamPerformance();

  // Calculate learning metrics
  const total = settlements.length;
  const dirCorrect = settlements.filter(s => s.result?.directionCorrect).length;
  const scoreCorrect = settlements.filter(s => s.result?.scoreCorrect).length;
  const dirRate = total > 0 ? dirCorrect / total : 0;
  const scoreRate = total > 0 ? scoreCorrect / total : 0;

  // Calculate adjustments based on performance
  const adjustments = { rankWeight: 0.015, baseGoals: 1.3, homeBonus: 0, drawBoost: 0 };

  // 分析平局预测
  const actualDraws = settlements.filter(s => s.homeScore === s.awayScore).length;
  const predDraws = settlements.filter(s => {
    const p = s.prediction;
    if (!p) return false;
    const dir = p.direction || p;
    const drawPct = dir.draw_pct || 0;
    const homePct = dir.home_win_pct || 0;
    const awayPct = dir.away_win_pct || 0;
    return drawPct > homePct && drawPct > awayPct;
  }).length;
  const drawRate = total > 0 ? actualDraws / total : 0;
  const predDrawRate = total > 0 ? predDraws / total : 0;
  
  console.log(`📊 平局分析: 实际${actualDraws}场(${Math.round(drawRate*100)}%) | 预测${predDraws}场(${Math.round(predDrawRate*100)}%)`);
  
  // 如果实际平局率 > 20% 但预测平局率 < 10%，增加平局概率
  if (drawRate > 0.2 && predDrawRate < 0.1 && total >= 3) {
    adjustments.drawBoost = Math.round((drawRate - predDrawRate) * 100);
    console.log(`📈 平局预测不足，增加平局概率 +${adjustments.drawBoost}%`);
  }
  
  // 分析进球预测
  let totalPredGoals = 0, totalActualGoals = 0;
  for (const s of settlements) {
    const pred = s.prediction;
    if (!pred) continue;
    const predScore = pred.score?.predicted || pred.predicted_score || '';
    const parts = predScore.split('-');
    if (parts.length === 2) {
      totalPredGoals += parseInt(parts[0]) + parseInt(parts[1]);
    }
    totalActualGoals += s.homeScore + s.awayScore;
  }
  const avgPredGoals = total > 0 ? totalPredGoals / total : 0;
  const avgActualGoals = total > 0 ? totalActualGoals / total : 0;
  const goalDiff = avgActualGoals - avgPredGoals;
  
  console.log(`📊 进球分析: 预测均值${avgPredGoals.toFixed(1)} | 实际均值${avgActualGoals.toFixed(1)} | 偏差${goalDiff > 0 ? '+' : ''}${goalDiff.toFixed(1)}`);
  
  // 如果实际进球比预测多0.3+，增加期望进球
  if (goalDiff > 0.3 && total >= 3) {
    adjustments.baseGoals = 1.3 + Math.min(0.2, goalDiff * 0.3);
    console.log(`📈 进球预测偏低，增加期望进球 baseGoals=${adjustments.baseGoals.toFixed(2)}`);
  } else if (goalDiff < -0.3 && total >= 3) {
    adjustments.baseGoals = 1.3 - Math.min(0.1, Math.abs(goalDiff) * 0.2);
    console.log(`📉 进球预测偏高，降低期望进球 baseGoals=${adjustments.baseGoals.toFixed(2)}`);
  }

  // 分析预测比分多样性
  const scoreFreq = {};
  for (const s of settlements) {
    const pred = s.prediction;
    const predScore = pred?.score?.predicted || pred?.predicted_score || '';
    scoreFreq[predScore] = (scoreFreq[predScore] || 0) + 1;
  }
  const maxFreq = Math.max(...Object.values(scoreFreq));
  const maxScore = Object.entries(scoreFreq).find(([,c]) => c === maxFreq)?.[0];
  
  if (maxFreq > total * 0.4 && total >= 3) {
    console.log(`⚠️ 比分${maxScore}预测频率过高(${maxFreq}/${total})，增加比分多样性`);
    adjustments.diversityPenalty = maxScore;
  }

  // If direction accuracy < 50%, we may be overconfident - widen the distribution
  if (dirRate < 0.5 && total >= 3) {
    adjustments.rankWeight = 0.012;
    console.log('📉 Direction accuracy < 50%, reducing ranking weight');
  } else if (dirRate > 0.7 && total >= 5) {
    adjustments.rankWeight = 0.018;
    console.log('📈 Direction accuracy > 70%, increasing ranking weight');
  }

  // Check home/away bias
  const homePredCorrect = settlements.filter(s => {
    const p = s.prediction;
    if (!p) return false;
    const predWinner = p.home_win_pct > p.away_win_pct ? 'home' : (p.away_win_pct > p.home_win_pct ? 'away' : 'draw');
    return predWinner === 'home' && s.result?.directionCorrect;
  }).length;
  const homePredTotal = settlements.filter(s => {
    const p = s.prediction;
    if (!p) return false;
    return p.home_win_pct > p.away_win_pct;
  }).length;

  if (homePredTotal > 0 && homePredCorrect / homePredTotal < 0.4) {
    adjustments.homeBonus = -0.05;
    console.log('📉 Home predictions underperforming, reducing home bonus');
  }

  console.log(`📊 Stats: ${total} settled | Direction ${Math.round(dirRate*100)}% | Score ${Math.round(scoreRate*100)}%`);
  console.log(`🔧 Adjustments: rankWeight=${adjustments.rankWeight}, baseGoals=${adjustments.baseGoals}, homeBonus=${adjustments.homeBonus}`);

  // Update team profile motivation factors based on results
  for (const settlement of settlements) {
    const homeTeam = settlement.homeTeam;
    const awayTeam = settlement.awayTeam;

    if (homeTeam && profiles[homeTeam]) {
      const pred = settlement.prediction;
      if (pred) {
        const predWinner = pred.home_win_pct > pred.away_win_pct ? 'home' : 'away';
        const actualWinner = settlement.result?.actualWinner;

        // Adjust motivation factor based on prediction accuracy
        if (predWinner !== actualWinner) {
          // Prediction was wrong, adjust profile
          if (actualWinner === 'home') {
            profiles[homeTeam].motivation_factor = Math.min(1.2, (profiles[homeTeam].motivation_factor || 1.0) + 0.02);
          } else if (actualWinner === 'away') {
            profiles[awayTeam].motivation_factor = Math.min(1.2, (profiles[awayTeam]?.motivation_factor || 1.0) + 0.02);
          }
        }
      }
    }
  }

  // Save updated profiles
  fs.writeFileSync(PROFILES_FILE, JSON.stringify(profiles, null, 2));

  // Re-predict upcoming matches with adjusted parameters
  const now = new Date();
  let updated = 0;

  for (const match of predictions.matches) {
    if (match.prediction?.type !== 'pre_match') continue;
    const matchDate = new Date(match.date);
    if (matchDate <= now) continue;

    const homeRank = match.home?.rank || 50;
    const awayRank = match.away?.rank || 50;

    // Build match context
    const matchContext = {
      homeTeam: match.home?.name,
      awayTeam: match.away?.name,
      stage: match.stage || 'group',
      matchday: match.matchday || 1,
      homeMotivation: match.homeMotivation || 'normal',
      awayMotivation: match.awayMotivation || 'normal'
    };

    const sim = monteCarloSimulateAdjusted(homeRank, awayRank, 200000, adjustments, matchContext);

    match.prediction = {
      direction: { home_win_pct: sim.home_win_pct, draw_pct: sim.draw_pct, away_win_pct: sim.away_win_pct },
      score: { predicted: sim.predicted_score, confidence: sim.top_scores[0][1], top_scores: sim.top_scores },
      confidence_pct: sim.confidence_pct,
      upset_analysis: sim.upset_analysis,
      simulations: sim.simulations,
      type: 'pre_match',
      home_win_pct: sim.home_win_pct, draw_pct: sim.draw_pct, away_win_pct: sim.away_win_pct,
      predicted_score: sim.predicted_score,
      confidence_stars: sim.confidence_pct > 65 ? 4 : sim.confidence_pct > 50 ? 3 : sim.confidence_pct > 40 ? 2 : 1,
      num_runs: sim.simulations, homeXG: sim.homeXG, awayXG: sim.awayXG,
      key_factors: match.prediction?.key_factors || [],
      home_advantage: match.prediction?.home_advantage || [],
      away_advantage: match.prediction?.away_advantage || [],
      goal_scorers: match.prediction?.goal_scorers || [],
      referee_impact: match.prediction?.referee_impact || '',
      venue_impact: match.prediction?.venue_impact || '',
      tactical_analysis: sim.tactical_analysis || match.prediction?.tactical_analysis || '',
      team_style_comparison: sim.team_style_comparison || null,
      motivation_analysis: sim.motivation_analysis || null,
      risk_note: match.prediction?.risk_note || '',
      analysis: match.prediction?.analysis || '',
      timestamp: new Date().toISOString(),
      learning_adjustments: adjustments
    };
    updated++;
  }

  predictions.updated = new Date().toISOString();
  predictions.learning = {
    settlements_used: total,
    direction_accuracy: Math.round(dirRate * 100),
    score_accuracy: Math.round(scoreRate * 100),
    adjustments,
    timestamp: new Date().toISOString()
  };

  fs.writeFileSync(PRED_FILE, JSON.stringify(predictions, null, 2));
  console.log(`✅ Re-predicted ${updated} upcoming matches with learning adjustments`);
}

// Run if called directly
if (require.main === module) {
  learn();
}

module.exports = { learn, monteCarloSimulateAdjusted, loadTeamProfiles };
