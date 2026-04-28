import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  console.log('Starting seed...');

  // Create admin user
  const existingAdmin = await prisma.internalUser.findUnique({
    where: { email: 'admin@notico.com' },
  });

  if (!existingAdmin) {
    const hashedPassword = await bcrypt.hash('Admin@2024!', 12);
    const admin = await prisma.internalUser.create({
      data: {
        email: 'admin@notico.com',
        password: hashedPassword,
        firstName: 'Admin',
        lastName: 'Notico',
        role: 'ADMIN',
      },
    });
    console.log('Admin user created:', admin.email);
  } else {
    console.log('Admin user already exists:', existingAdmin.email);
  }

  // Create a default delivery location
  const existingLocation = await prisma.deliveryLocation.findFirst({
    where: { name: 'Site Principal' },
  });

  if (!existingLocation) {
    const location = await prisma.deliveryLocation.create({
      data: {
        name: 'Site Principal',
        address: '1 Rue de la Logistique',
        city: 'Paris',
        postalCode: '75001',
      },
    });
    console.log('Location created:', location.name);

    // Create 3 quays for this location
    for (let i = 1; i <= 3; i++) {
      await prisma.quay.create({
        data: {
          name: `Quai ${i}`,
          locationId: location.id,
        },
      });
      console.log(`Quay ${i} created for ${location.name}`);
    }
  } else {
    console.log('Location already exists:', existingLocation.name);
  }

  console.log('Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
