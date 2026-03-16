import { prisma } from '../src/prisma/client';
import util from 'util';

async function run() {
  const msg = await prisma.message.findUnique({
    where: { id: 'cmmqewynn00l011mu29hy271f' }
  });
  console.log(util.inspect(msg, { depth: null }));
}
run();
