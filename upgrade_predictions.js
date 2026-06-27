#!/usr/bin/env node
/**
 * Upgrade predictions.json with comprehensive upset analysis
 * Uses Poisson distribution + 1000 Monte Carlo simulations per match
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const PRED_FILE = path.join(DATA_DIR, 'predictions.json');

// Poisson sample using Knuth's algorithm
function poissonSample(lambda) {
  let L = Math.exp(-lambda), k = 0, p = 1;
  do { k++; p *= Math.random(); } while (p > L);
  return k - 1;
}

// Calculate Poisson probability P(X=k) for a given lambda
function poissonProb(k, lambda) {
  return Math.exp(-lambda) * Math.pow(lambda, k) / factorial(k);
}

function factorial(n) {
  if (n <= 1) return 1;
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

// Monte Carlo simulation with Poisson distribution
function monteCarloSimulate(homeRank, awayRank, numSims) {
  numSims = numSims || 1000;
  const rankDiff = awayRank - homeRank; // positive = home stronger
  const baseGoals = 1.3;
  const homeXG = Math.max(0.3, baseGoals + rankDiff * 0.015);
  const awayXG = Math.max(0.3, baseGoals - rankDiff * 0.015);

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

  const homePct = Math.round(homeWins / numSims * 1000) / 10;
  const drawPct = Math.round(draws / numSims * 1000) / 10;
  const awayPct = Math.round(awayWins / numSims * 1000) / 10;

  // Sort scores by frequency
  const sortedScores = Object.entries(scoreCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([score, count]) => [score, Math.round(count / numSims * 1000) / 10]);

  const bestScore = sortedScores[0][0];
  const bestScorePct = sortedScores[0][1];

  // Upset analysis
  const maxPct = Math.max(homePct, drawPct, awayPct);
  const favorite = homePct >= awayPct ? 'home' : 'away';
  const upsetProb = favorite === 'home' ? (drawPct + awayPct) : (drawPct + homePct);

  // Score upset probability - probability of scores that are NOT the top predicted
  const scoreUpsetProb = Math.round((100 - sortedScores.slice(0, 3).reduce((s, x) => s + x[1], 0)) * 10) / 10;

  // Build upset scenarios
  const scenarios = [];
  if (drawPct > 15) {
    scenarios.push({
      type: 'draw',
      prob: drawPct,
      bet: '押平局'
    });
  }
  if (favorite === 'home' && awayPct > 12) {
    scenarios.push({
      type: 'away_win',
      prob: awayPct,
      bet: '押客队+1.5球'
    });
  }
  if (favorite === 'away' && homePct > 12) {
    scenarios.push({
      type: 'home_win',
      prob: homePct,
      bet: '押主队+1.5球'
    });
  }

  // Recommended bet for upset
  let recommendedBet = '如果押冷门：';
  if (drawPct > 25) {
    recommendedBet += '押平局赔率较好';
  } else if (favorite === 'home' && awayPct > 20) {
    recommendedBet += '押客队赔率较高';
  } else if (favorite === 'away' && homePct > 20) {
    recommendedBet += '押主队赔率较高';
  } else {
    recommendedBet += '关注大小球方向';
  }

  const confidence = Math.round(maxPct * 10) / 10;

  return {
    home_win_pct: homePct,
    draw_pct: drawPct,
    away_win_pct: awayPct,
    predicted_score: bestScore,
    confidence_pct: confidence,
    top_scores: sortedScores,
    simulations: numSims,
    homeXG: Math.round(homeXG * 100) / 100,
    awayXG: Math.round(awayXG * 100) / 100,
    upset_analysis: {
      upset_prob: Math.round(upsetProb * 10) / 10,
      score_upset_prob: Math.round(scoreUpsetProb * 10) / 10,
      scenarios: scenarios,
      recommended_bet: recommendedBet
    }
  };
}

// Main upgrade function
function upgradePredictions() {
  const data = JSON.parse(fs.readFileSync(PRED_FILE, 'utf8'));
  const matches = data.matches || [];

  console.log(`📊 Upgrading ${matches.length} predictions with Poisson Monte Carlo analysis...`);

  for (const match of matches) {
    const homeRank = match.home?.rank || 50;
    const awayRank = match.away?.rank || 50;

    // Run Monte Carlo simulation
    const sim = monteCarloSimulate(homeRank, awayRank, 1000);

    // Update prediction structure
    match.prediction = {
      direction: {
        home_win_pct: sim.home_win_pct,
        draw_pct: sim.draw_pct,
        away_win_pct: sim.away_win_pct
      },
      score: {
        predicted: sim.predicted_score,
        confidence: sim.top_scores[0][1],
        top_scores: sim.top_scores
      },
      confidence_pct: sim.confidence_pct,
      upset_analysis: sim.upset_analysis,
      simulations: sim.simulations,
      type: 'pre_match',
      // Keep backward compatibility fields
      home_win_pct: sim.home_win_pct,
      draw_pct: sim.draw_pct,
      away_win_pct: sim.away_win_pct,
      predicted_score: sim.predicted_score,
      confidence_stars: sim.confidence_pct > 65 ? 4 : sim.confidence_pct > 50 ? 3 : sim.confidence_pct > 40 ? 2 : 1,
      num_runs: sim.simulations,
      homeXG: sim.homeXG,
      awayXG: sim.awayXG,
      key_factors: match.prediction?.key_factors || [],
      home_advantage: match.prediction?.home_advantage || [],
      away_advantage: match.prediction?.away_advantage || [],
      goal_scorers: match.prediction?.goal_scorers || [],
      referee_impact: match.prediction?.referee_impact || '',
      venue_impact: match.prediction?.venue_impact || '',
      tactical_analysis: match.prediction?.tactical_analysis || '',
      risk_note: match.prediction?.risk_note || '',
      analysis: match.prediction?.analysis || '',
      timestamp: new Date().toISOString()
    };

    const upTag = sim.upset_analysis.upset_prob > 30 ? '🔥' : sim.upset_analysis.upset_prob > 20 ? '⚠️' : '';
    console.log(`${upTag} ${match.name}: 胜${sim.home_win_pct}% 平${sim.draw_pct}% 负${sim.away_win_pct}% | 预测${sim.predicted_score} | 冷门${sim.upset_analysis.upset_prob}%`);
  }

  data.updated = new Date().toISOString();
  data.model = 'mimo-v2.5-pro-poisson';
  data.runs = 1000;

  fs.writeFileSync(PRED_FILE, JSON.stringify(data, null, 2));
  console.log(`\n✅ Upgraded ${matches.length} predictions saved to ${PRED_FILE}`);
}

upgradePredictions();
