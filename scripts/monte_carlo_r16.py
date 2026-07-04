#!/usr/bin/env python3
"""
Poisson Monte Carlo simulation for FIFA World Cup 2026 Round of 16 matches.
200,000 runs per match, based on FIFA rankings.
"""

import json
import random
import math
from datetime import datetime, timezone
from collections import Counter

random.seed(42)

# FIFA ranking data and match info
MATCHES = [
    {
        "id": "760502",
        "name": "Canada vs Morocco",
        "home_name": "Canada", "home_short": "CAN", "home_rank": 44,
        "away_name": "Morocco", "away_short": "MAR", "away_rank": 11,
        "venue": "NRG Stadium", "city": "Houston, Texas",
        "date": "2026-07-04T17:00Z", "time_bj": "7/5 01:00",
        "spread": "MAR -0.5", "overUnder": 2.5,
        "home_ml": 400, "away_ml": -130
    },
    {
        "id": "760503",
        "name": "Paraguay vs France",
        "home_name": "Paraguay", "home_short": "PAR", "home_rank": 42,
        "away_name": "France", "away_short": "FRA", "away_rank": 2,
        "venue": "Lincoln Financial Field", "city": "Philadelphia, Pennsylvania",
        "date": "2026-07-04T21:00Z", "time_bj": "7/5 05:00",
        "spread": "FRA -1.5", "overUnder": 2.5,
        "home_ml": 1800, "away_ml": -575
    },
    {
        "id": "760504",
        "name": "Brazil vs Norway",
        "home_name": "Brazil", "home_short": "BRA", "home_rank": 5,
        "away_name": "Norway", "away_short": "NOR", "away_rank": 36,
        "venue": "MetLife Stadium", "city": "East Rutherford, New Jersey",
        "date": "2026-07-05T20:00Z", "time_bj": "7/6 04:00",
        "spread": "BRA -0.5", "overUnder": 2.5,
        "home_ml": -125, "away_ml": 320
    },
    {
        "id": "760505",
        "name": "Mexico vs England",
        "home_name": "Mexico", "home_short": "MEX", "home_rank": 14,
        "away_name": "England", "away_short": "ENG", "away_rank": 4,
        "venue": "Estadio Banorte", "city": "Mexico City",
        "date": "2026-07-06T00:00Z", "time_bj": "7/6 08:00",
        "spread": "ENG -0.5", "overUnder": 2.5,
        "home_ml": 205, "away_ml": 140
    },
    {
        "id": "760506",
        "name": "Portugal vs Spain",
        "home_name": "Portugal", "home_short": "POR", "home_rank": 8,
        "away_name": "Spain", "away_short": "ESP", "away_rank": 3,
        "venue": "AT&T Stadium", "city": "Arlington, Texas",
        "date": "2026-07-06T19:00Z", "time_bj": "7/7 03:00",
        "spread": "ESP -0.5", "overUnder": 2.5,
        "home_ml": 295, "away_ml": -110
    },
    {
        "id": "760507",
        "name": "United States vs Belgium",
        "home_name": "United States", "home_short": "USA", "home_rank": 12,
        "away_name": "Belgium", "away_short": "BEL", "away_rank": 6,
        "venue": "Lumen Field", "city": "Seattle, Washington",
        "date": "2026-07-07T00:00Z", "time_bj": "7/7 08:00",
        "spread": "USA -0.5", "overUnder": 2.5,
        "home_ml": 160, "away_ml": 165
    },
    {
        "id": "760509",
        "name": "Argentina vs Cape Verde",
        "home_name": "Argentina", "home_short": "ARG", "home_rank": 1,
        "away_name": "Cape Verde", "away_short": "CPV", "away_rank": 50,
        "venue": "Mercedes-Benz Stadium", "city": "Atlanta, Georgia",
        "date": "2026-07-07T16:00Z", "time_bj": "7/8 00:00",
        "spread": "ARG -1.5", "overUnder": 2.5,
        "home_ml": -285, "away_ml": 850
    },
    {
        "id": "760508",
        "name": "Switzerland vs Colombia",
        "home_name": "Switzerland", "home_short": "SUI", "home_rank": 15,
        "away_name": "Colombia", "away_short": "COL", "away_rank": 9,
        "venue": "BC Place", "city": "Vancouver",
        "date": "2026-07-07T20:00Z", "time_bj": "7/8 04:00",
        "spread": "COL -0.5", "overUnder": 2.5,
        "home_ml": 235, "away_ml": 125
    }
]

NUM_RUNS = 200000

def rank_to_xg(rank):
    """Convert FIFA rank to expected goals baseline.
    Lower rank = better team = higher xG.
    Uses a log-based formula calibrated to produce realistic World Cup xG values.
    """
    # Base xG: top team (~rank 1) gets ~2.0, bottom (~rank 50+) gets ~0.8
    # Formula: xG = 2.2 - 0.35 * ln(rank)
    return max(0.4, 2.2 - 0.35 * math.log(rank))

def calculate_xg(home_rank, away_rank, is_ko=True):
    """Calculate expected goals for both teams based on FIFA rankings.
    In knockout rounds, we slightly reduce expected goals (more cautious play).
    Also applies a small neutral venue adjustment (no real home advantage).
    """
    home_base = rank_to_xg(home_rank)
    away_base = rank_to_xg(away_rank)
    
    # Neutral venue: slight adjustment - better team gets slight boost
    # No traditional home advantage in World Cup neutral venues
    # But we keep a small "listed home" factor for crowd/comfort
    
    # KO round dampening factor
    ko_factor = 0.96 if is_ko else 1.0
    
    # Adjust: the difference in quality determines the xG split
    # Better team (lower rank) gets more goals
    home_xg = home_base * ko_factor
    away_xg = away_base * ko_factor
    
    # Ensure minimum xG
    home_xg = max(0.4, home_xg)
    away_xg = max(0.4, away_xg)
    
    return round(home_xg, 2), round(away_xg, 2)

def poisson_sample(lam):
    """Sample from Poisson distribution."""
    return random.gauss(lam, math.sqrt(lam))  # Normal approximation for speed
    # For large lambda, normal approximation is fine

def poisson_sample_exact(lam):
    """Exact Poisson sampling using Knuth's algorithm."""
    if lam < 30:
        L = math.exp(-lam)
        k = 0
        p = 1.0
        while True:
            k += 1
            p *= random.random()
            if p < L:
                return k - 1
    else:
        # For large lambda, use normal approximation
        return max(0, int(random.gauss(lam, math.sqrt(lam)) + 0.5))

def monte_carlo_match(home_xg, away_xg, num_runs=NUM_RUNS):
    """Run Monte Carlo simulation for a single match."""
    home_wins = 0
    draws = 0
    away_wins = 0
    score_counter = Counter()
    
    for _ in range(num_runs):
        h_goals = poisson_sample_exact(home_xg)
        a_goals = poisson_sample_exact(away_xg)
        
        score_key = f"{h_goals}-{a_goals}"
        score_counter[score_key] += 1
        
        if h_goals > a_goals:
            home_wins += 1
        elif h_goals == a_goals:
            draws += 1
        else:
            away_wins += 1
    
    total = num_runs
    home_win_pct = round(home_wins / total * 100, 1)
    draw_pct = round(draws / total * 100, 1)
    away_win_pct = round(away_wins / total * 100, 1)
    
    # Top 5 scores
    top_scores = score_counter.most_common(10)
    top_5 = [[score, round(cnt / total * 100, 1)] for score, cnt in top_scores[:5]]
    predicted_score = top_5[0][0]
    
    return {
        "home_win_pct": home_win_pct,
        "draw_pct": draw_pct,
        "away_win_pct": away_win_pct,
        "predicted_score": predicted_score,
        "top_5_scores": top_5,
        "score_distribution": {score: round(cnt / total * 100, 2) for score, cnt in top_scores}
    }

def generate_confidence(home_win_pct, draw_pct, away_win_pct):
    """Generate confidence stars and percentage."""
    max_pct = max(home_win_pct, away_win_pct)
    if max_pct >= 70:
        stars = 5
        conf_pct = int(max_pct)
    elif max_pct >= 60:
        stars = 4
        conf_pct = int(max_pct)
    elif max_pct >= 50:
        stars = 3
        conf_pct = int(max_pct)
    elif max_pct >= 40:
        stars = 3
        conf_pct = int(max_pct)
    else:
        stars = 2
        conf_pct = int(max_pct)
    return stars, conf_pct

def generate_upset_analysis(home_win_pct, draw_pct, away_win_pct, home_rank, away_rank, home_name, away_name):
    """Generate upset analysis."""
    # Determine favorite and underdog
    if home_win_pct > away_win_pct:
        favorite = home_name
        underdog = away_name
        fav_pct = home_win_pct
        dog_pct = away_win_pct
        fav_rank = home_rank
        dog_rank = away_rank
    else:
        favorite = away_name
        underdog = home_name
        fav_pct = away_win_pct
        dog_pct = home_win_pct
        fav_rank = away_rank
        dog_rank = home_rank
    
    upset_prob = round(100 - fav_pct, 1)
    score_upset_prob = round(100 - fav_pct + draw_pct * 0.3, 1)
    
    scenarios = []
    if draw_pct > 15:
        scenarios.append({"type": "draw", "prob": draw_pct, "bet": f"平局 @ {draw_pct}%"})
    if dog_pct > 10:
        scenarios.append({"type": "upset", "prob": dog_pct, "bet": f"{underdog}胜 @ {dog_pct}%"})
    
    if upset_prob > 40:
        risk_level = "HIGH"
    elif upset_prob > 25:
        risk_level = "MEDIUM"
    else:
        risk_level = "LOW"
    
    return {
        "upset_prob": upset_prob,
        "score_upset_prob": score_upset_prob,
        "risk_level": risk_level,
        "scenarios": scenarios,
        "recommended_bet": f"{underdog}爆冷概率{upset_prob}%，平局{draw_pct}%" if upset_prob > 30 else f"{favorite}大概率获胜({fav_pct}%)"
    }

def generate_key_factors(home_rank, away_rank, home_name, away_name, home_xg, away_xg, home_win_pct, away_win_pct):
    """Generate key factors for the match."""
    factors = []
    rank_diff = abs(home_rank - away_rank)
    
    if rank_diff > 20:
        better = home_name if home_rank < away_rank else away_name
        factors.append(f"排名差距{rank_diff}位，{better}明显占优")
    elif rank_diff > 10:
        better = home_name if home_rank < away_rank else away_name
        factors.append(f"排名差距{rank_diff}位，{better}小幅占优")
    else:
        factors.append(f"排名接近({home_rank} vs {away_rank})，实力均衡")
    
    if home_xg > away_xg + 0.5:
        factors.append(f"{home_name}进攻端预期更强(xG {home_xg} vs {away_xg})")
    elif away_xg > home_xg + 0.5:
        factors.append(f"{away_name}进攻端预期更强(xG {away_xg} vs {home_xg})")
    
    factors.append("淘汰赛阶段，防守纪律至关重要")
    
    if abs(home_win_pct - away_win_pct) < 10:
        factors.append("势均力敌，比赛结果高度不确定")
    
    return factors

def generate_advantages(home_rank, away_rank, home_name, away_name):
    """Generate home and away advantages."""
    home_adv = [f"FIFA排名{home_rank}"]
    away_adv = [f"FIFA排名{away_rank}"]
    
    if home_rank <= 10:
        home_adv.append("世界级球队底蕴")
    if away_rank <= 10:
        away_adv.append("世界级球队底蕴")
    if home_rank <= 15:
        home_adv.append("大赛经验丰富")
    if away_rank <= 15:
        away_adv.append("大赛经验丰富")
    
    return home_adv, away_adv

def generate_tactical_analysis(home_name, away_name, home_rank, away_rank, home_xg, away_xg, home_win_pct, draw_pct, away_win_pct):
    """Generate tactical analysis."""
    rank_diff = abs(home_rank - away_rank)
    
    analysis = f"{home_name}(排名{home_rank}) vs {away_name}(排名{away_rank})。"
    
    if rank_diff > 20:
        better = home_name if home_rank < away_rank else away_name
        worse = away_name if home_rank < away_rank else home_name
        analysis += f"排名差距{rank_diff}位，{better}实力明显占优。"
        analysis += f"预计{better}将主导控球，{worse}以防守反击为主。"
    elif rank_diff > 10:
        better = home_name if home_rank < away_rank else away_name
        analysis += f"排名差距{rank_diff}位，{better}小幅热门。"
        analysis += "预计比赛节奏中等，双方都会谨慎行事。"
    else:
        analysis += "两队排名接近，实力均衡。"
        analysis += "预计比赛胶着，中场争夺激烈。"
    
    analysis += f"期望进球: {home_name} {home_xg} vs {away_name} {away_xg}。"
    analysis += f"泊松MC {NUM_RUNS}次模拟。"
    
    return analysis

def generate_risk_note(home_win_pct, draw_pct, away_win_pct, home_name, away_name, home_rank, away_rank):
    """Generate risk note."""
    notes = []
    
    if draw_pct > 25:
        notes.append(f"平局概率{draw_pct}%较高，KO加时赛可能")
    
    if abs(home_win_pct - away_win_pct) < 8:
        notes.append("比赛结果高度不确定，任何结果都有可能")
    
    rank_diff = abs(home_rank - away_rank)
    if rank_diff > 30:
        better = home_name if home_rank < away_rank else away_name
        notes.append(f"{better}大热，但淘汰赛冷门频出")
    
    return "；".join(notes) if notes else "比赛结果相对可预测"

def process_match(match):
    """Process a single match and generate full prediction."""
    home_xg, away_xg = calculate_xg(match["home_rank"], match["away_rank"])
    
    print(f"  Simulating {match['name']} (home_xg={home_xg}, away_xg={away_xg})...")
    
    mc = monte_carlo_match(home_xg, away_xg)
    
    stars, conf_pct = generate_confidence(mc["home_win_pct"], mc["draw_pct"], mc["away_win_pct"])
    
    upset = generate_upset_analysis(
        mc["home_win_pct"], mc["draw_pct"], mc["away_win_pct"],
        match["home_rank"], match["away_rank"],
        match["home_name"], match["away_name"]
    )
    
    key_factors = generate_key_factors(
        match["home_rank"], match["away_rank"],
        match["home_name"], match["away_name"],
        home_xg, away_xg,
        mc["home_win_pct"], mc["away_win_pct"]
    )
    
    home_adv, away_adv = generate_advantages(
        match["home_rank"], match["away_rank"],
        match["home_name"], match["away_name"]
    )
    
    tactical = generate_tactical_analysis(
        match["home_name"], match["away_name"],
        match["home_rank"], match["away_rank"],
        home_xg, away_xg,
        mc["home_win_pct"], mc["draw_pct"], mc["away_win_pct"]
    )
    
    risk_note = generate_risk_note(
        mc["home_win_pct"], mc["draw_pct"], mc["away_win_pct"],
        match["home_name"], match["away_name"],
        match["home_rank"], match["away_rank"]
    )
    
    analysis = (
        f"排名{match['home_rank']} vs {match['away_rank']}。"
        f"{'势均力敌' if abs(mc['home_win_pct'] - mc['away_win_pct']) < 10 else match['home_name'] if mc['home_win_pct'] > mc['away_win_pct'] else match['away_name'] + '占优'}，"
        f"{match['home_name']} {mc['home_win_pct']}% vs {match['away_name']} {mc['away_win_pct']}%。"
        f"平局概率{mc['draw_pct']}%。"
        f"期望进球: {match['home_name']} {home_xg} vs {match['away_name']} {away_xg}。"
        f"泊松MC {NUM_RUNS}次模拟。KO round参数。"
    )
    
    now = datetime.now(timezone.utc).isoformat()
    
    # Build the prediction object matching existing structure
    prediction = {
        "home_win_pct": mc["home_win_pct"],
        "draw_pct": mc["draw_pct"],
        "away_win_pct": mc["away_win_pct"],
        "predicted_score": mc["predicted_score"],
        "confidence_stars": stars,
        "confidence_pct": conf_pct,
        "key_factors": key_factors,
        "home_advantage": home_adv,
        "away_advantage": away_adv,
        "goal_scorers": [],
        "referee_impact": "裁判数据暂缺",
        "venue_impact": f"{match['venue']}, {match['city']}",
        "tactical_analysis": tactical,
        "risk_note": risk_note,
        "analysis": analysis,
        "upset_analysis": upset,
        "top_5_scores": mc["top_5_scores"],
        "xg": {"home": home_xg, "away": away_xg},
        "num_runs": NUM_RUNS,
        "timestamp": now,
        "home_ml": match["home_ml"],
        "away_ml": match["away_ml"]
    }
    
    return prediction

def main():
    print("=" * 60)
    print("FIFA World Cup 2026 Round of 16 - Poisson Monte Carlo")
    print(f"Simulations per match: {NUM_RUNS}")
    print("=" * 60)
    
    results = []
    
    for match in MATCHES:
        pred = process_match(match)
        
        result = {
            "id": match["id"],
            "name": match["name"],
            "date": match["date"],
            "time_bj": match["time_bj"],
            "home": {
                "name": match["home_name"],
                "short": match["home_short"],
                "logo": "",
                "rank": match["home_rank"]
            },
            "away": {
                "name": match["away_name"],
                "short": match["away_short"],
                "logo": "",
                "rank": match["away_rank"]
            },
            "venue": match["venue"],
            "city": match["city"],
            "odds": {
                "spread": match["spread"],
                "overUnder": match["overUnder"]
            },
            "referee": "?",
            "prediction": pred
        }
        results.append(result)
        
        print(f"\n  Result: {match['name']}")
        print(f"    xG: {pred['xg']['home']} vs {pred['xg']['away']}")
        print(f"    Win%: {pred['home_win_pct']} / {pred['draw_pct']} / {pred['away_win_pct']}")
        print(f"    Score: {pred['predicted_score']}")
        print(f"    Top 5: {pred['top_5_scores']}")
        print(f"    Stars: {'*' * pred['confidence_stars']} ({pred['confidence_pct']}%)")
        print(f"    Upset Risk: {pred['upset_analysis']['risk_level']} ({pred['upset_analysis']['upset_prob']}%)")
    
    # Write predictions.json
    output = {
        "matches": results,
        "updated": datetime.now(timezone.utc).isoformat(),
        "model": "poisson-monte-carlo-v1",
        "runs": 1
    }
    
    output_path = "/Users/xylei/.openclaw/canvas/worldcup/data/predictions.json"
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    print(f"\n[OK] Written to {output_path}")
    
    # Also output the JSON for the HTML PREDICTIONS constant
    # Need to format each match as a single-line JSON for the HTML
    html_preds = []
    for r in results:
        # Convert to HTML format (add logo URLs)
        html_match = {
            "id": r["id"],
            "name": r["name"],
            "date": r["date"],
            "time_bj": r["time_bj"],
            "home": {
                "name": r["home"]["name"],
                "short": r["home"]["short"],
                "logo": f"https://a.espncdn.com/i/teamlogos/countries/500/{r['home']['short'].lower()}.png",
                "rank": r["home"]["rank"]
            },
            "away": {
                "name": r["away"]["name"],
                "short": r["away"]["short"],
                "logo": f"https://a.espncdn.com/i/teamlogos/countries/500/{r['away']['short'].lower()}.png",
                "rank": r["away"]["rank"]
            },
            "venue": r["venue"],
            "city": r["city"],
            "odds": r["odds"],
            "referee": "TBD",
            "prediction": r["prediction"]
        }
        html_preds.append(html_match)
    
    # Write HTML-ready JSON snippets
    html_output_path = "/Users/xylei/.openclaw/canvas/worldcup/data/html_predictions.json"
    with open(html_output_path, 'w', encoding='utf-8') as f:
        json.dump(html_preds, f, ensure_ascii=False, indent=2)
    print(f"[OK] HTML predictions written to {html_output_path}")
    
    # Print summary table
    print("\n" + "=" * 80)
    print("SUMMARY TABLE")
    print("=" * 80)
    print(f"{'Match':<30} {'xG':>12} {'Win%':>15} {'Score':>7} {'Stars':>6} {'Upset':>7}")
    print("-" * 80)
    for r in results:
        p = r["prediction"]
        xg_str = f"{p['xg']['home']}-{p['xg']['away']}"
        win_str = f"{p['home_win_pct']}/{p['draw_pct']}/{p['away_win_pct']}"
        print(f"{r['name']:<30} {xg_str:>12} {win_str:>15} {p['predicted_score']:>7} {'*' * p['confidence_stars']:>6} {p['upset_analysis']['upset_prob']:>6}%")
    
    print("\nDone!")

if __name__ == "__main__":
    main()
