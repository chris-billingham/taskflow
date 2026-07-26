import { PrismaClient } from '@prisma/client';
import { DEFAULT_TEMPLATES } from '../src/config/defaultTemplates.js';

// The template definitions themselves live in src/config/defaultTemplates.ts
// and are installed automatically at API boot by ensureDefaultTemplates().
// This script stays as a way to apply them to a database without starting the
// server (and so `pnpm db:seed` keeps working), but it is no longer the only
// path — production installs never ran it, which left the gallery empty.
const prisma = new PrismaClient();

async function main() {
  console.log('Seeding default templates...');

  for (const template of DEFAULT_TEMPLATES) {
    const existing = await prisma.template.findFirst({
      where: { name: template.name, userId: null, isPublic: true },
    });

    if (!existing) {
      await prisma.template.create({
        data: {
          name: template.name,
          description: template.description,
          data: template.data as object,
          userId: null,
          workspaceId: null,
          isPublic: true,
        },
      });
      console.log(`  Created template: ${template.name}`);
    } else {
      console.log(`  Skipped (exists): ${template.name}`);
    }
  }

  console.log('Done.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
