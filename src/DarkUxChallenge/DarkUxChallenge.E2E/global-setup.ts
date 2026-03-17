export default async function globalSetup(): Promise<void> {
  if (!process.env.services__web__http__0) {
    throw new Error(
      'DarkUxChallenge E2E must be launched by DarkUxChallenge.AppHost so Aspire can inject services__web__http__0.',
    );
  }
}
