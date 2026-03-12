const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
    const existingUser = await prisma.user.findUnique({ 
        where: { email: 'fazal@yesweigh.in' },
        include: { memberships: true }
    });
    
    if (!existingUser || !existingUser.memberships.length) {
        console.log("Root owner or workspace not found. Exiting...");
        return;
    }
    
    const roles = ['ADMIN', 'MEMBER', 'VIEWER'];
    const workspaceId = existingUser.memberships[0].workspaceId;
    const pwd = await bcrypt.hash('password123', 10);

    for (const r of roles) {
        const email = r.toLowerCase() + '@test.com';
        
        const user = await prisma.user.upsert({
            where: { email },
            update: {},
            create: { 
                name: r, 
                email, 
                passwordHash: pwd
            }
        });
        
        await prisma.workspaceMember.upsert({
            where: {
                workspaceId_userId: {
                    workspaceId,
                    userId: user.id
                }
            },
            update: {
                role: r
            },
            create: {
                workspaceId,
                userId: user.id,
                role: r
            }
        });
    }
    console.log('Test users prepped');
}

main().finally(() => prisma.$disconnect());
