// 题库种子：往 quiz_questions 批量导入基础题（按题干去重，可重复执行）
// 执行：npx ts-node scripts/seed-quiz.ts
import { sequelize } from '../src/config/database';
import { QuizQuestion } from '../src/models';

interface SeedQ {
  text: string;
  options: [string, string, string, string];
  answer: number;
  category: string;
  difficulty: 1 | 2 | 3;
}

const QUESTIONS: SeedQ[] = [
  // ── 综合 ──
  { text: '一年有多少个节气？', options: ['12 个', '24 个', '36 个', '48 个'], answer: 1, category: '综合', difficulty: 1 },
  { text: '中国农历中，一年最先到来的节气是？', options: ['立春', '雨水', '冬至', '春节'], answer: 0, category: '综合', difficulty: 2 },
  { text: '“一小时”等于多少分钟？', options: ['30', '60', '90', '100'], answer: 1, category: '综合', difficulty: 1 },
  { text: '世界上使用人数最多的母语是？', options: ['英语', '西班牙语', '汉语', '印地语'], answer: 2, category: '综合', difficulty: 2 },
  { text: '“文房四宝”不包括以下哪项？', options: ['笔', '墨', '纸', '琴'], answer: 3, category: '综合', difficulty: 1 },
  { text: '标准扑克牌一副共有多少张？', options: ['52', '54', '56', '108'], answer: 1, category: '综合', difficulty: 1 },
  { text: '“马拉松”比赛的标准全程是多少公里？', options: ['21.0975', '42.195', '50', '100'], answer: 1, category: '综合', difficulty: 2 },
  { text: '十二生肖中排在龙后面的是？', options: ['蛇', '马', '羊', '兔'], answer: 0, category: '综合', difficulty: 2 },
  { text: '“圆周率”精确到小数点后两位是？', options: ['3.14', '3.41', '2.14', '3.12'], answer: 0, category: '综合', difficulty: 1 },
  { text: '中国传统的“七夕节”与以下哪对人物有关？', options: ['梁山伯与祝英台', '牛郎与织女', '白娘子与许仙', '孟姜女与范喜良'], answer: 1, category: '综合', difficulty: 1 },
  { text: '“三十六计”中第一计是？', options: ['围魏救赵', '瞒天过海', '借刀杀人', '走为上计'], answer: 1, category: '综合', difficulty: 2 },
  { text: '世界上国土面积最大的国家是？', options: ['中国', '加拿大', '俄罗斯', '美国'], answer: 2, category: '综合', difficulty: 1 },
  { text: ' RGB 三原色指的是红、绿和？', options: ['黄', '蓝', '紫', '白'], answer: 1, category: '综合', difficulty: 2 },
  { text: '计数单位“一打”指的是多少个？', options: ['10 个', '12 个', '20 个', '24 个'], answer: 1, category: '综合', difficulty: 2 },
  { text: '音乐简谱中 “do re mi” 后面紧接着的是？', options: ['fa', 'sol', 'la', 'si'], answer: 0, category: '综合', difficulty: 1 },
  { text: '“四大发明”不包括？', options: ['造纸术', '印刷术', '火药', '地动仪'], answer: 3, category: '综合', difficulty: 1 },
  { text: '人体的正常体温大约是多少摄氏度？', options: ['35', '36.5', '38', '39'], answer: 1, category: '综合', difficulty: 1 },
  { text: '“愚人节”是每年的哪一天？', options: ['4 月 1 日', '5 月 1 日', '3 月 8 日', '12 月 25 日'], answer: 0, category: '综合', difficulty: 1 },
  { text: '身份证号码一共有多少位？', options: ['15', '18', '16', '20'], answer: 1, category: '综合', difficulty: 1 },
  { text: '“锄禾日当午”的下一句是？', options: ['汗滴禾下土', '谁知盘中餐', '粒粒皆辛苦', '春种一粒粟'], answer: 0, category: '综合', difficulty: 1 },

  // ── 科学 ──
  { text: '水的化学式是？', options: ['CO2', 'H2O', 'O2', 'NaCl'], answer: 1, category: '科学', difficulty: 1 },
  { text: '太阳系中离太阳最近的行星是？', options: ['金星', '水星', '地球', '火星'], answer: 1, category: '科学', difficulty: 1 },
  { text: '光在真空中的传播速度约为每秒多少公里？', options: ['3 万', '30 万', '300 万', '3000'], answer: 1, category: '科学', difficulty: 2 },
  { text: '人体中数量最多的细胞是？', options: ['神经细胞', '红细胞', '白细胞', '皮肤细胞'], answer: 1, category: '科学', difficulty: 3 },
  { text: '地球自转一周大约需要多长时间？', options: ['12 小时', '24 小时', '48 小时', '365 天'], answer: 1, category: '科学', difficulty: 1 },
  { text: '元素周期表中符号 “Au” 代表？', options: ['银', '铝', '金', '氩'], answer: 2, category: '科学', difficulty: 2 },
  { text: '蜜蜂通过什么方式告诉同伴蜜源的位置？', options: ['声音', '舞蹈', '气味标记', '触角电波'], answer: 1, category: '科学', difficulty: 2 },
  { text: '第一个进入太空的人类是？', options: ['阿姆斯特朗', '加加林', '艾伦·谢泼德', '杨利伟'], answer: 1, category: '科学', difficulty: 1 },
  { text: 'DNA 的中文全称是？', options: ['蛋白质', '脱氧核糖核酸', '核糖核酸', '氨基酸'], answer: 1, category: '科学', difficulty: 2 },
  { text: '声音在哪种介质中传播最快？', options: ['真空', '空气', '水', '钢铁'], answer: 3, category: '科学', difficulty: 2 },
  { text: '月球围绕地球公转一圈大约需要？', options: ['一天', '27 天', '一年', '12 小时'], answer: 1, category: '科学', difficulty: 1 },
  { text: '被称为“中国天眼”的射电望远镜位于哪个省？', options: ['贵州', '四川', '云南', '陕西'], answer: 0, category: '科学', difficulty: 2 },
  { text: '植物进行光合作用主要吸收哪种颜色的光？', options: ['只吸收绿光', '红光和蓝紫光', '所有光均等', '红外线'], answer: 1, category: '科学', difficulty: 3 },
  { text: '绝对零度是多少摄氏度？', options: ['-100', '-273.15', '-365', '0'], answer: 1, category: '科学', difficulty: 2 },
  { text: '计算机的核心运算部件是？', options: ['内存', '硬盘', 'CPU', '显卡'], answer: 2, category: '科学', difficulty: 1 },
  { text: '血液中运输氧气的主要成分是？', options: ['白细胞', '血小板', '血红蛋白', '血浆'], answer: 2, category: '科学', difficulty: 2 },
  { text: '恐龙灭绝最主流的科学假说是什么？', options: ['火山爆发', '小行星撞击', '气候变化', '疾病流行'], answer: 1, category: '科学', difficulty: 1 },
  { text: 'WiFi 使用的电磁波属于？', options: ['微波', '红外线', '紫外线', 'X 射线'], answer: 0, category: '科学', difficulty: 3 },
  { text: '人体最大的器官是？', options: ['肝脏', '大脑', '皮肤', '肺'], answer: 2, category: '科学', difficulty: 1 },

  // ── 影视 ──
  { text: '电影《流浪地球》改编自谁的小说？', options: ['刘慈欣', '郝景芳', '韩松', '王晋康'], answer: 0, category: '影视', difficulty: 1 },
  { text: '动画片《千与千寻》的导演是？', options: ['新海诚', '宫崎骏', '押井守', '细田守'], answer: 1, category: '影视', difficulty: 1 },
  { text: '《泰坦尼克号》男女主角分别是？', options: ['杰克与露丝', '彼得与温蒂', '莱昂与塞琳娜', '保罗与茉莉'], answer: 0, category: '影视', difficulty: 1 },
  { text: '电影《西游记之大圣归来》中大圣的法器是？', options: ['九齿钉耙', '金箍棒', '月牙铲', '青龙偃月刀'], answer: 1, category: '影视', difficulty: 1 },
  { text: '漫威电影中“钢铁侠”的真名是？', options: ['史蒂夫·罗杰斯', '托尼·斯塔克', '布鲁斯·班纳', '彼得·帕克'], answer: 1, category: '影视', difficulty: 1 },
  { text: '《甄嬛传》故事发生在哪个朝代？', options: ['唐朝', '宋朝', '清朝', '明朝'], answer: 2, category: '影视', difficulty: 1 },
  { text: '“我曾踏足山巅，也曾跌落谷底”是哪部剧的台词风格？', options: ['权力的游戏', '亮剑', '琅琊榜', '人民的名义'], answer: 0, category: '影视', difficulty: 3 },
  { text: '电影《阿凡达》的故事发生在哪颗星球？', options: ['火星', '潘多拉', '开普勒', '塔希里亚'], answer: 1, category: '影视', difficulty: 1 },
  { text: '《哈利·波特》系列中哈利就读的魔法学校是？', options: ['霍格沃茨', '德姆斯特朗', '布斯巴顿', '伊法魔尼'], answer: 0, category: '影视', difficulty: 1 },
  { text: '获得 2023 年票房冠军的中国电影是《满江红》还是《流浪地球 2》？', options: ['满江红', '流浪地球 2', '并列', '都不是'], answer: 0, category: '影视', difficulty: 3 },
  { text: '《葫芦兄弟》中一共有几个葫芦娃？', options: ['5 个', '6 个', '7 个', '8 个'], answer: 2, category: '影视', difficulty: 1 },
  { text: '电影《功夫》的导演兼主演是？', options: ['成龙', '周星驰', '李连杰', '甄子丹'], answer: 1, category: '影视', difficulty: 1 },
  { text: '《冰雪奇缘》中会施冰魔法的公主是？', options: ['安娜', '艾莎', '白雪', '乐佩'], answer: 1, category: '影视', difficulty: 1 },
  { text: '经典台词“我看行”出自哪部情景喜剧？', options: ['我爱我家', '武林外传', '家有儿女', '东北一家人'], answer: 1, category: '影视', difficulty: 3 },
  { text: '《星球大战》中黑武士的本名是？', options: ['卢克·天行者', '安纳金·天行者', '欧比旺', '帕尔帕廷'], answer: 1, category: '影视', difficulty: 2 },
  { text: '《哪吒之魔童降世》中哪吒的口头禅是？', options: ['我命由我不由天', '人是人他妈生的', '我执剑于此', '不服来战'], answer: 0, category: '影视', difficulty: 1 },
  { text: '电视剧《亮剑》中李云龙的独立团属于哪个部队序列？', options: ['八路军', '新四军', '解放军', '东北抗联'], answer: 0, category: '影视', difficulty: 2 },
  { text: '《猫和老鼠》中老鼠的名字是？', options: ['Tom', 'Jerry', 'Spike', 'Butch'], answer: 1, category: '影视', difficulty: 1 },
  { text: '电影界最高荣誉“奥斯卡金像奖”来自哪个国家？', options: ['英国', '法国', '美国', '意大利'], answer: 2, category: '影视', difficulty: 1 },
  { text: '《西游记》电视剧中孙悟空的扮演者是？', options: ['六小龄童', '马德华', '迟重瑞', '闫怀礼'], answer: 0, category: '影视', difficulty: 1 },

  // ── 历史 ──
  { text: '秦朝的建立者是？', options: ['刘邦', '嬴政', '项羽', '李斯'], answer: 1, category: '历史', difficulty: 1 },
  { text: '“贞观之治”出现在哪个朝代？', options: ['唐朝', '宋朝', '汉朝', '隋朝'], answer: 0, category: '历史', difficulty: 1 },
  { text: '丝绸之路的开拓者是？', options: ['郑和', '张骞', '玄奘', '班超'], answer: 1, category: '历史', difficulty: 1 },
  { text: '“卧薪尝胆”讲的是哪位君王的故事？', options: ['夫差', '勾践', '阖闾', '夫谭'], answer: 1, category: '历史', difficulty: 1 },
  { text: '第一次世界大战爆发的导火索是？', options: ['萨拉热窝事件', '凡尔登战役', '诺曼底登陆', '珍珠港事件'], answer: 0, category: '历史', difficulty: 1 },
  { text: '中国历史上唯一的女皇帝是？', options: ['吕后', '武则天', '慈禧', '萧太后'], answer: 1, category: '历史', difficulty: 1 },
  { text: '四大文明古国不包括以下哪个？', options: ['古埃及', '古巴比伦', '古希腊', '古印度'], answer: 2, category: '历史', difficulty: 1 },
  { text: '郑和下西洋发生在哪个朝代？', options: ['宋', '元', '明', '清'], answer: 2, category: '历史', difficulty: 1 },
  { text: '“玄武门之变”中登基的皇帝是？', options: ['李渊', '李世民', '李治', '李隆基'], answer: 1, category: '历史', difficulty: 2 },
  { text: '世界第二次大战结束于哪一年？', options: ['1944', '1945', '1946', '1939'], answer: 1, category: '历史', difficulty: 1 },
  { text: '“纸上谈兵”说的是战国时期的哪位将领？', options: ['白起', '廉颇', '赵括', '王翦'], answer: 2, category: '历史', difficulty: 2 },
  { text: '金字塔主要作为什么建筑使用？', options: ['神庙', '陵墓', '粮仓', '观星台'], answer: 1, category: '历史', difficulty: 1 },
  { text: '鸦片战争开始于哪一年？', options: ['1839', '1840', '1842', '1856'], answer: 1, category: '历史', difficulty: 2 },
  { text: '“文艺复兴”运动最早兴起于哪个国家？', options: ['法国', '英国', '意大利', '德国'], answer: 2, category: '历史', difficulty: 1 },
  { text: '唐朝都城长安大致相当于今天的？', options: ['洛阳', '西安', '开封', '南京'], answer: 1, category: '历史', difficulty: 1 },
  { text: '《史记》的作者是？', options: ['班固', '司马迁', '司马光', '陈寿'], answer: 1, category: '历史', difficulty: 1 },
  { text: '新中国第一颗原子弹成功爆炸于哪一年？', options: ['1960', '1964', '1967', '1970'], answer: 1, category: '历史', difficulty: 2 },
  { text: '“工业革命”最早开始于哪个国家？', options: ['美国', '法国', '英国', '德国'], answer: 2, category: '历史', difficulty: 1 },
  { text: '三国时期“赤壁之战”的对战双方是？', options: ['魏与蜀', '曹军与孙刘联军', '蜀与吴', '晋与吴'], answer: 1, category: '历史', difficulty: 1 },
  { text: '紫禁城（故宫）始建于哪个朝代？', options: ['元', '明', '清', '宋'], answer: 1, category: '历史', difficulty: 2 },

  // ── 地理 ──
  { text: '世界最高的山峰是？', options: ['乔戈里峰', '珠穆朗玛峰', '富士山', '阿尔卑斯山'], answer: 1, category: '地理', difficulty: 1 },
  { text: '中国面积最大的省级行政区是？', options: ['西藏', '内蒙古', '新疆', '青海'], answer: 2, category: '地理', difficulty: 1 },
  { text: '世界上最长的河流是？', options: ['长江', '尼罗河', '亚马逊河', '密西西比河'], answer: 1, category: '地理', difficulty: 1 },
  { text: '“五大湖”位于哪个国家与加拿大交界处？', options: ['美国', '俄罗斯', '巴西', '澳大利亚'], answer: 0, category: '地理', difficulty: 2 },
  { text: '中国的“春城”指的是？', options: ['昆明', '贵阳', '大连', '哈尔滨'], answer: 0, category: '地理', difficulty: 1 },
  { text: '世界上面积最大的海洋是？', options: ['大西洋', '太平洋', '印度洋', '北冰洋'], answer: 1, category: '地理', difficulty: 1 },
  { text: '长江注入的海是？', options: ['黄海', '东海', '南海', '渤海'], answer: 1, category: '地理', difficulty: 2 },
  { text: '撒哈拉沙漠位于哪个大洲？', options: ['亚洲', '南美洲', '非洲', '大洋洲'], answer: 2, category: '地理', difficulty: 1 },
  { text: '意大利的首都是？', options: ['米兰', '威尼斯', '罗马', '佛罗伦萨'], answer: 2, category: '地理', difficulty: 1 },
  { text: '“山城”是中国哪座城市的别称？', options: ['成都', '重庆', '武汉', '长沙'], answer: 1, category: '地理', difficulty: 1 },
  { text: '横穿赤道的最长河流亚马逊河位于？', options: ['非洲', '南美洲', '亚洲', '北美洲'], answer: 1, category: '地理', difficulty: 1 },
  { text: '中国陆地国界线最长的邻国是？', options: ['俄罗斯', '蒙古', '印度', '越南'], answer: 1, category: '地理', difficulty: 3 },
  { text: '珠穆朗玛峰位于中国与哪个国家的边境？', options: ['印度', '尼泊尔', '不丹', '巴基斯坦'], answer: 1, category: '地理', difficulty: 1 },
  { text: '“千岛之国”指的是？', options: ['日本', '菲律宾', '印度尼西亚', '马尔代夫'], answer: 2, category: '地理', difficulty: 2 },
  { text: '世界上最深的淡水湖是？', options: ['贝加尔湖', '苏必利尔湖', '青海湖', '洞庭湖'], answer: 0, category: '地理', difficulty: 2 },
  { text: '海南岛的省会城市是？', options: ['三亚', '海口', '儋州', '琼海'], answer: 1, category: '地理', difficulty: 1 },
  { text: '世界最大的内陆国是？', options: ['蒙古', '哈萨克斯坦', '尼泊尔', '老挝'], answer: 1, category: '地理', difficulty: 2 },
  { text: '喜马拉雅山脉是哪两大板块碰撞形成的？', options: ['亚欧与太平洋', '亚欧与印度洋', '非洲与印度洋', '美洲与太平洋'], answer: 1, category: '地理', difficulty: 2 },
  { text: '“地中海底的直布罗陀海峡”连接地中海与？', options: ['红海', '大西洋', '黑海', '印度洋'], answer: 1, category: '地理', difficulty: 2 },
  { text: '中国最大的岛屿是？', options: ['海南岛', '崇明岛', '台湾岛', '舟山岛'], answer: 2, category: '地理', difficulty: 1 },
];

(async () => {
  try {
    await sequelize.authenticate();
    await QuizQuestion.sync(); // 表不存在时自动创建
    let created = 0;
    let skipped = 0;
    for (const q of QUESTIONS) {
      const exists = await QuizQuestion.findOne({ where: { text: q.text } });
      if (exists) {
        skipped += 1;
        continue;
      }
      await QuizQuestion.create({
        category: q.category,
        difficulty: q.difficulty,
        text: q.text,
        options: q.options,
        answer: q.answer,
      });
      created += 1;
    }
    console.log(`✅ 题库导入完成：新增 ${created} 题，跳过重复 ${skipped} 题，总计 ${QUESTIONS.length} 题`);
    process.exit(0);
  } catch (err) {
    console.error('❌ 题库导入失败:', err);
    process.exit(1);
  }
})();
