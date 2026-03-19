export default async function globalSetup(): Promise<void> {
  if (!process.env.services__web__http__0) {
    throw new Error(
      'HelloAgents E2E must be launched by HelloAgents.AppHost so Aspire can inject services__web__http__0.',
    );
  }
}
