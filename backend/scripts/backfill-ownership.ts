import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const fallbackOwner =
    (await prisma.user.findFirst({
      where: {
        role: 'admin',
      },
      orderBy: {
        createdAt: 'asc',
      },
    })) ??
    (await prisma.user.findFirst({
      orderBy: {
        createdAt: 'asc',
      },
    }));

  if (!fallbackOwner) {
    throw new Error('No users found. Create at least one user before backfilling ownership.');
  }

  const workflowResult = await prisma.workflow.updateMany({
    where: {
      ownerId: null,
    },
    data: {
      ownerId: fallbackOwner.id,
    },
  });

  const taskResult = await prisma.$executeRawUnsafe(`
    UPDATE Task t
    LEFT JOIN Workflow w ON w.id = t.workflowId
    SET t.ownerId = COALESCE(w.ownerId, ?)
    WHERE t.ownerId IS NULL
  `, fallbackOwner.id);

  const [remainingWorkflows, remainingTasks] = await Promise.all([
    prisma.workflow.count({
      where: {
        ownerId: null,
      },
    }),
    prisma.task.count({
      where: {
        ownerId: null,
      },
    }),
  ]);

  console.log(
    JSON.stringify(
      {
        fallbackOwner: {
          id: fallbackOwner.id,
          email: fallbackOwner.email,
        },
        updatedWorkflows: workflowResult.count,
        updatedTasks: Number(taskResult),
        remainingWorkflows,
        remainingTasks,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
