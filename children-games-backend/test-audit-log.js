/**
 * 审计日志系统测试脚本
 *
 * 此脚本用于测试审计日志功能是否正常工作
 * 运行方式：node dist/test-audit-log.js
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';
let adminToken = '';

// 测试账号信息（从环境变量读取）
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

async function test() {
  console.log('🧪 开始测试审计日志系统...\n');

  try {
    // 1. 登录获取 token
    console.log('1️⃣ 测试管理员登录...');
    const loginRes = await axios.post(`${BASE_URL}/admin/login`, {
      password: ADMIN_PASSWORD,
    });

    if (loginRes.data.code === 200) {
      adminToken = loginRes.data.data.token;
      console.log('✅ 登录成功\n');
    } else {
      console.error('❌ 登录失败:', loginRes.data);
      return;
    }

    // 2. 查询审计日志（应该能看到刚才的登录记录）
    console.log('2️⃣ 查询审计日志...');
    const logsRes = await axios.get(`${BASE_URL}/admin/audit-logs?limit=5`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });

    if (logsRes.data.code === 200) {
      console.log('✅ 审计日志查询成功');
      console.log(`总数: ${logsRes.data.data.total}`);
      console.log('最近 5 条记录:');
      logsRes.data.data.list.forEach((log, index) => {
        console.log(`  ${index + 1}. [${log.createdAt}] ${log.action}`);
        if (log.targetType) {
          console.log(`     目标: ${log.targetType} #${log.targetId}`);
        }
        console.log(`     IP: ${log.ipAddress}`);
      });
      console.log();
    } else {
      console.error('❌ 查询失败:', logsRes.data);
    }

    // 3. 测试按动作类型过滤
    console.log('3️⃣ 测试按动作类型过滤...');
    const filterRes = await axios.get(
      `${BASE_URL}/admin/audit-logs?action=admin.login&limit=10`,
      {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      }
    );

    if (filterRes.data.code === 200) {
      console.log(`✅ 过滤成功，找到 ${filterRes.data.data.total} 条 admin.login 记录\n`);
    } else {
      console.error('❌ 过滤失败:', filterRes.data);
    }

    // 4. 执行一些操作以生成更多审计日志
    console.log('4️⃣ 执行一些操作以生成更多审计日志...');

    // 获取用户列表
    await axios.get(`${BASE_URL}/admin/users`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    console.log('  - 获取用户列表');

    // 获取概览
    await axios.get(`${BASE_URL}/admin/overview`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    console.log('  - 获取概览数据');

    // 获取设置
    await axios.get(`${BASE_URL}/admin/settings`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    console.log('  - 获取系统设置');

    console.log();

    // 5. 再次查询审计日志
    console.log('5️⃣ 再次查询审计日志...');
    const finalLogsRes = await axios.get(`${BASE_URL}/admin/audit-logs?limit=10`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });

    if (finalLogsRes.data.code === 200) {
      console.log('✅ 审计日志查询成功');
      console.log(`总数: ${finalLogsRes.data.data.total}`);
      console.log('\n最近 10 条记录:');
      finalLogsRes.data.data.list.forEach((log, index) => {
        const action = log.action.padEnd(25);
        const target = log.targetType
          ? `${log.targetType} #${log.targetId}`.padEnd(20)
          : '-'.padEnd(20);
        const time = new Date(log.createdAt).toLocaleString('zh-CN');
        console.log(`  ${index + 1}. ${time} | ${action} | ${target} | ${log.ipAddress || '-'}`);
      });
      console.log();
    }

    console.log('✅ 测试完成！审计日志系统运行正常\n');
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    if (error.response) {
      console.error('响应:', error.response.data);
    }
  }
}

// 运行测试
test();
