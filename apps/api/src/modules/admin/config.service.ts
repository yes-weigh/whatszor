import { prisma } from '../../prisma/client';

export async function getSystemConfig(key: string, defaultValue: any = null) {
  const config = await prisma.systemConfig.findUnique({
    where: { key }
  });

  if (!config) {
    return defaultValue;
  }

  return config.value;
}

export async function setSystemConfig(key: string, value: any) {
  const config = await prisma.systemConfig.upsert({
    where: { key },
    update: { value },
    create: { key, value }
  });

  return config.value;
}

export async function getAllSystemConfigs() {
  const configs = await prisma.systemConfig.findMany();
  
  // Transform from [{ key: 'K', value: 'V' }] -> { K: 'V' }
  return configs.reduce((acc, curr) => {
    acc[curr.key] = curr.value;
    return acc;
  }, {} as Record<string, any>);
}
