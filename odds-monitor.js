#!/usr/bin/env node
// 体彩赔率实时监控脚本（只更新未开始的比赛）
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const ODDS_FILE = path.join(DATA_DIR, 'detailed_odds.json');
const PREDICTIONS_FILE = path.join(DATA_DIR, 'predictions.json');

// 中英文队名映射
const teamMapping = {
    "西班牙": "Spain", "佛得角": "Cape Verde", "比利时": "Belgium", "埃及": "Egypt",
    "沙特": "Saudi Arabia", "乌拉圭": "Uruguay", "伊朗": "Iran", "新西兰": "New Zealand",
    "法国": "France", "塞内加尔": "Senegal", "伊拉克": "Iraq", "挪威": "Norway",
    "阿根廷": "Argentina", "阿尔及利亚": "Algeria", "奥地利": "Austria", "约旦": "Jordan",
    "葡萄牙": "Portugal", "刚果金": "Congo DR", "英格兰": "England", "克罗地亚": "Croatia",
    "加纳": "Ghana", "巴拿马": "Panama", "乌兹别克": "Uzbekistan", "哥伦比亚": "Colombia"
};

// 读取现有赔率数据
let oddsData = {};
try {
    oddsData = JSON.parse(fs.readFileSync(ODDS_FILE, 'utf8'));
    console.log(`📊 读取现有赔率数据: ${Object.keys(oddsData).length}场`);
} catch (e) {
    console.log('⚠️ 未找到赔率数据文件，将创建新文件');
}

// 读取预测数据
let predictions = { matches: [] };
try {
    predictions = JSON.parse(fs.readFileSync(PREDICTIONS_FILE, 'utf8'));
} catch (e) {
    console.log('⚠️ 未找到预测数据文件');
}

// 获取已结束比赛的ID
const finishedMatches = new Set();
try {
    const https = require('https');
    const url = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=20260611-20260628';
    
    https.get(url, { headers: { 'Accept-Encoding': 'identity' } }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            try {
                const matchData = JSON.parse(data);
                const events = matchData.events || [];
                
                // 找出已结束的比赛
                events.forEach(e => {
                    if (e.status?.type?.state === 'post') {
                        finishedMatches.add(e.id);
                        const home = e.competitions?.[0]?.competitors?.find(c => c.homeAway === 'home')?.team?.displayName;
                        const away = e.competitions?.[0]?.competitors?.find(c => c.homeAway === 'away')?.team?.displayName;
                        if (home && away) {
                            // 从赔率数据中移除已结束的比赛
                            for (const key of Object.keys(oddsData)) {
                                if (key.includes(home) || key.includes(away)) {
                                    delete oddsData[key];
                                    console.log(`🗑️ 移除已结束比赛: ${key}`);
                                }
                            }
                        }
                    }
                });
                
                // 保存更新后的赔率数据
                fs.writeFileSync(ODDS_FILE, JSON.stringify(oddsData, null, 2));
                console.log(`✅ 更新赔率数据: ${Object.keys(oddsData).length}场（已移除${finishedMatches.size}场已结束比赛）`);
                
            } catch (e) {
                console.error('❌ 解析比赛数据失败:', e.message);
            }
        });
    }).on('error', (e) => {
        console.error('❌ 获取比赛数据失败:', e.message);
    });
    
} catch (e) {
    console.error('❌ 获取比赛数据失败:', e.message);
}

console.log('✅ 赔率监控脚本已启动');
