import { prisma } from './src/prisma/client';

async function checkAudiences() {
    try {
        const aud = await prisma.audience.findMany({
            where: { workspace: { members: { some: { user: { email: 'fazal@yesweigh.in' } } } } },
            include: { _count: { select: { members: true } } }
        });
        console.log(JSON.stringify(aud.map(a => ({ id: a.id, name: a.name, count: a._count.members })), null, 2));
    } finally {
        await prisma.$disconnect();
    }
}
checkAudiences();
