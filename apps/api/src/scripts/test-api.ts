// @ts-nocheck
import { createServer } from '../core/server';
import { prisma, connectDatabase } from '../prisma/client';
import { signAccessToken } from '../core/jwt';
import { connectRedis } from '../core/redis';

async function runTests() {
  console.log('🔄 Initializing API testing suite...');
  
  await connectRedis();
  await connectDatabase();

  const server = await createServer();
  await server.ready();

  const workspace = await prisma.workspace.findFirst();
  if (!workspace) throw new Error("No workspace found for tests.");

  await prisma.workspace.update({ where: { id: workspace.id }, data: { status: 'ACTIVE' } });

  // Generate mock JWT
  const token = await signAccessToken({
    sub: "test-user-id",
    workspaceId: workspace.id,
    role: "OWNER"
  });

  const headers = { Authorization: `Bearer ${token}` };

  console.log('\n--- Test 1: GET /api/v1/products ---');
  let res = await server.inject({ method: 'GET', url: '/api/v1/products', headers });
  console.log(`Status: ${res.statusCode}`);
  const listData = JSON.parse(res.payload);
  console.log(`Found ${listData.data?.total || 0} products.`);
  
  if (!listData.success || !listData.data.products.length) return;
  const targetId = listData.data.products[0].id;

  console.log('\n--- Test 2: PATCH /api/v1/products/:id (Success) ---');
  res = await server.inject({
    method: 'PATCH',
    url: `/api/v1/products/${targetId}`,
    headers,
    payload: {
      description: "Updated description via API",
      specifications: { weight: "5kg", dimensions: "10x20x5" }
    }
  });
  console.log(`Status: ${res.statusCode}`);
  console.log(JSON.parse(res.payload));

  console.log('\n--- Test 3: Edge Case Tracking - Invalid Enum ---');
  res = await server.inject({
    method: 'PATCH',
    url: `/api/v1/products/${targetId}`,
    headers,
    payload: { status: "GARBAGE_STATUS" }
  });
  console.log(`Status: ${res.statusCode} (Expected 400)`);
  console.log(JSON.parse(res.payload));

  console.log('\n--- Test 4: Edge Case Tracking - Non-Existent ID ---');
  res = await server.inject({
    method: 'PATCH',
    url: `/api/v1/products/does-not-exist`,
    headers,
    payload: { category: "Tools" }
  });
  console.log(`Status: ${res.statusCode} (Expected 404)`);
  console.log(JSON.parse(res.payload));

  console.log('\n✅ All contract tests finished.');
}

runTests().catch(console.error).finally(() => process.exit(0));
