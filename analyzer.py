#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
世界杯比赛全维度分析系统
基于用户提供的7层分析框架
"""

import json
import random
import math
from datetime import datetime

class WorldCupAnalyzer:
    def __init__(self):
        self.load_data()
    
    def load_data(self):
        """加载所有数据"""
        with open('data/predictions.json', 'r') as f:
            self.preds = json.load(f)
        
        with open('data/team_profiles.json', 'r') as f:
            self.profiles = json.load(f)
        
        with open('data/settlements.json', 'r') as f:
            self.settlements = json.load(f)
        
        with open('data/detailed_odds.json', 'r') as f:
            self.odds_data = json.load(f)
        
        # 计算各队积分
        self.teams = self.calculate_standings()
    
    def calculate_standings(self):
        """计算各队积分"""
        teams = {}
        for s in self.settlements:
            home = s.get('homeShort', '')
            away = s.get('awayShort', '')
            hs = s['homeScore']
            as_ = s['awayScore']
            
            for team, gf, ga in [(home, hs, as_), (away, as_, hs)]:
                if team not in teams:
                    teams[team] = {'points': 0, 'gf': 0, 'ga': 0, 'played': 0, 'wins': 0, 'draws': 0, 'losses': 0}
                teams[team]['played'] += 1
                teams[team]['gf'] += gf
                teams[team]['ga'] += ga
                if gf > ga:
                    teams[team]['points'] += 3
                    teams[team]['wins'] += 1
                elif gf == ga:
                    teams[team]['points'] += 1
                    teams[team]['draws'] += 1
                else:
                    teams[team]['losses'] += 1
        
        return teams
    
    def analyze_match(self, home_name, away_name, home_short, away_short):
        """全维度分析一场比赛"""
        home_profile = self.profiles.get(home_name, {})
        away_profile = self.profiles.get(away_name, {})
        home_rank = home_profile.get('rank', 50)
        away_rank = away_profile.get('rank', 50)
        
        home_points = self.teams.get(home_short, {}).get('points', 0)
        away_points = self.teams.get(away_short, {}).get('points', 0)
        
        analysis = {
            'match': f"{home_name} vs {away_name}",
            'layers': {}
        }
        
        # 第一层：基础数据
        analysis['layers']['basic'] = {
            'standings': {
                'home_points': home_points,
                'away_points': away_points,
                'is_must_win': home_points == 0 and away_points == 0,
                'is_qualified': home_points >= 6 or away_points >= 6
            },
            'first_round': {
                'home_goals': self.teams.get(home_short, {}).get('gf', 0),
                'home_conceded': self.teams.get(home_short, {}).get('ga', 0),
                'away_goals': self.teams.get(away_short, {}).get('gf', 0),
                'away_conceded': self.teams.get(away_short, {}).get('ga', 0)
            },
            'odds': self.get_odds(home_name, away_name)
        }
        
        # 第二层：球队实力
        analysis['layers']['strength'] = {
            'fifa_rank': {'home': home_rank, 'away': away_rank, 'diff': abs(home_rank - away_rank)},
            'style': {'home': home_profile.get('style', '?'), 'away': away_profile.get('style', '?')},
            'strengths': {'home': home_profile.get('strengths', []), 'away': away_profile.get('strengths', [])},
            'weaknesses': {'home': home_profile.get('weaknesses', []), 'away': away_profile.get('weaknesses', [])}
        }
        
        # 第三层：战术匹配
        analysis['layers']['tactics'] = {
            'style_matchup': self.analyze_style_matchup(home_profile, away_profile),
            'key_players': {
                'home': home_profile.get('key_players', []),
                'away': away_profile.get('key_players', [])
            }
        }
        
        # 第四层：心理因素
        analysis['layers']['psychology'] = {
            'is_must_win': home_points == 0 and away_points == 0,
            'pressure': self.analyze_pressure(home_points, away_points, home_rank, away_rank),
            'bounce_back': self.analyze_bounce_back(home_short, away_short)
        }
        
        # 第五层：隐藏因素
        analysis['layers']['hidden'] = {
            'player_factors': {
                'home_adaptation': home_profile.get('player_adaptation', 0.8),
                'away_adaptation': away_profile.get('player_adaptation', 0.8),
                'home_injury_impact': home_profile.get('injury_impact', 0.05),
                'away_injury_impact': away_profile.get('injury_impact', 0.05)
            }
        }
        
        # 第六层：庄家思维
        analysis['layers']['bookmaker'] = {
            'odds': self.get_odds(home_name, away_name),
            'implied_prob': self.calculate_implied_prob(home_name, away_name)
        }
        
        # 第七层：历史规律
        analysis['layers']['history'] = {
            'patterns': [
                "弱队密集防守→强队进球效率下降60%",
                "定位球是弱队破门唯一武器",
                "生死战先进球方赢面70%+",
                "大比分后球队第二轮表现（可能松懈or延续）"
            ],
            'verified_cases': self.get_verified_cases()
        }
        
        return analysis
    
    def get_odds(self, home_name, away_name):
        """获取赔率数据"""
        for match_key, odds in self.odds_data.items():
            if home_name in match_key or away_name in match_key:
                return {
                    'win': odds.get('win_odds', 0),
                    'draw': odds.get('draw_odds', 0),
                    'lose': odds.get('lose_odds', 0)
                }
        return {}
    
    def calculate_implied_prob(self, home_name, away_name):
        """计算隐含概率"""
        odds = self.get_odds(home_name, away_name)
        if not odds:
            return {}
        
        total = 1/odds['win'] + 1/odds['draw'] + 1/odds['lose']
        return {
            'home': round(1/odds['win']/total*100, 1),
            'draw': round(1/odds['draw']/total*100, 1),
            'away': round(1/odds['lose']/total*100, 1)
        }
    
    def analyze_style_matchup(self, home_profile, away_profile):
        """分析战术匹配"""
        home_style = home_profile.get('style', '')
        away_style = away_profile.get('style', '')
        
        matchup = {
            'home_style': home_style,
            'away_style': away_style,
            'analysis': ''
        }
        
        if '控球' in home_style and '反击' in away_style:
            matchup['analysis'] = '控球型vs反击型，反击型球队可能利用空间'
        elif '防守' in home_style and '进攻' in away_style:
            matchup['analysis'] = '防守型vs进攻型，防守型球队可能逼平'
        elif '高位逼抢' in home_style and '高位逼抢' in away_style:
            matchup['analysis'] = '双方都高位逼抢，比赛可能激烈'
        else:
            matchup['analysis'] = '风格相近，比赛悬念大'
        
        return matchup
    
    def analyze_pressure(self, home_points, away_points, home_rank, away_rank):
        """分析压力"""
        pressure = {
            'home_pressure': 'low',
            'away_pressure': 'low',
            'analysis': ''
        }
        
        if home_points == 0 and away_points == 0:
            pressure['home_pressure'] = 'high'
            pressure['away_pressure'] = 'high'
            pressure['analysis'] = '双方都0分，生死战压力大'
        elif home_points >= 6:
            pressure['home_pressure'] = 'low'
            pressure['away_pressure'] = 'high'
            pressure['analysis'] = '主队已出线无压力，客队需要积分'
        elif away_points >= 6:
            pressure['home_pressure'] = 'high'
            pressure['away_pressure'] = 'low'
            pressure['analysis'] = '客队已出线无压力，主队需要积分'
        
        return pressure
    
    def analyze_bounce_back(self, home_short, away_short):
        """分析触底反弹"""
        home_data = self.teams.get(home_short, {})
        away_data = self.teams.get(away_short, {})
        
        bounce = {
            'home_bounce': 0,
            'away_bounce': 0,
            'analysis': ''
        }
        
        # 首轮输球后可能反弹
        if home_data.get('losses', 0) > 0:
            bounce['home_bounce'] = 3
            bounce['analysis'] += f'{home_short}首轮输球，可能触底反弹。'
        
        if away_data.get('losses', 0) > 0:
            bounce['away_bounce'] = 3
            bounce['analysis'] += f'{away_short}首轮输球，可能触底反弹。'
        
        return bounce
    
    def get_verified_cases(self):
        """获取已验证案例"""
        return [
            {"match": "墨西哥2-0南非", "result": "✅", "reason": "东道主优势验证"},
            {"match": "韩国2-1捷克", "result": "✅", "reason": "主场优势+18%验证"},
            {"match": "加拿大1-1波黑", "result": "❌", "reason": "低估反扑"},
            {"match": "美国4-1巴拉圭", "result": "✅", "reason": "东道主爆发验证"},
            {"match": "瑞士1-1卡塔尔", "result": "❌", "reason": "高置信度爆冷教训"},
            {"match": "巴西1-1摩洛哥", "result": "❌", "reason": "核心缺阵影响"}
        ]
    
    def generate_summary(self, analysis):
        """生成分析总结"""
        match = analysis['match']
        basic = analysis['layers']['basic']
        strength = analysis['layers']['strength']
        tactics = analysis['layers']['tactics']
        psychology = analysis['layers']['psychology']
        
        summary = f"\n{'='*60}\n"
        summary += f"🔥 {match} 全维度分析\n"
        summary += f"{'='*60}\n"
        
        # 第一层
        summary += f"\n🔵 第一层：基础数据\n"
        summary += f"  积分: {basic['standings']['home_points']}分 vs {basic['standings']['away_points']}分\n"
        if basic['standings']['is_must_win']:
            summary += f"  ⚠️ 生死战！双方都0分\n"
        
        # 第二层
        summary += f"\n🟢 第二层：球队实力\n"
        summary += f"  排名: #{strength['fifa_rank']['home']} vs #{strength['fifa_rank']['away']}\n"
        summary += f"  风格: {strength['style']['home']} vs {strength['style']['away']}\n"
        
        # 第三层
        summary += f"\n🟡 第三层：战术匹配\n"
        summary += f"  {tactics['style_matchup']['analysis']}\n"
        
        # 第四层
        summary += f"\n🟠 第四层：心理因素\n"
        summary += f"  {psychology['pressure']['analysis']}\n"
        
        return summary

def main():
    analyzer = WorldCupAnalyzer()
    
    # 分析即将比赛
    matches = [
        ("Portugal", "Congo DR", "POR", "COD"),
        ("England", "Croatia", "ENG", "CRO"),
        ("Ghana", "Panama", "GHA", "PAN"),
    ]
    
    for home, away, hs, aws in matches:
        analysis = analyzer.analyze_match(home, away, hs, aws)
        summary = analyzer.generate_summary(analysis)
        print(summary)

if __name__ == "__main__":
    main()
