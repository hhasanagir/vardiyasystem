const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'admin123';

async function main() {
  console.log('Starting seed...');

  const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);
  const adminUser = await prisma.user.create({
    data: {
      email: 'admin@demo.com',
      name: 'Admin Kullanıcı',
      password: hashedPassword,
      role: 'admin',
    },
  });
  console.log('Created admin user:', adminUser.email);

  console.log('\n=== SEED COMPLETE ===');
  console.log('Login: admin@demo.com');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
