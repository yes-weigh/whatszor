import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const workspace = await prisma.workspace.findFirst();
  if (!workspace) {
    console.log("No workspaces found. Please create one first.");
    return;
  }
  
  await prisma.productKnowledge.createMany({
    data: [
      {
        workspaceId: workspace.id,
        name: "Tire Pressure Gauge",
        sku: "TPG-100",
        status: "INCOMPLETE",
        missingFieldsCount: 5,
        specifications: { color: "red" }
      },
      {
        workspaceId: workspace.id,
        name: "Electric Air Pump",
        sku: "EAP-200",
        status: "PENDING_REVIEW",
        missingFieldsCount: 1,
        specifications: { power: "12V", maxPsi: 150 }
      },
      {
        workspaceId: workspace.id,
        name: "Heavy Duty Jack",
        sku: "HDJ-300",
        status: "VERIFIED",
        missingFieldsCount: 0,
        specifications: { 'weight_capacity': '3 tons', material: 'Steel' }
      }
    ]
  });

  const products = await prisma.productKnowledge.findMany({ where: { workspaceId: workspace.id }});

  console.log("✅ Successfully Seeded Product entries:", products.length);
  console.log(products);
}

main().catch(console.error).finally(() => prisma.$disconnect());
