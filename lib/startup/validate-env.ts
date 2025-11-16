type MissingSecretError = {
  name: string;
  message: string;
};

const isProduction = () => process.env.NODE_ENV === 'production';
const isBuildPhase = () => process.env.NEXT_PHASE === 'phase-production-build';
const isValidationDisabled = () => process.env.SKIP_SECRET_VALIDATION === 'true';

function shouldValidateSecrets(): boolean {
  if (!isProduction()) {
    return false;
  }

  if (isValidationDisabled()) {
    return false;
  }

  // Skip validation during the production build phase so local builds without
  // secrets can still succeed. Validation will run when the server boots.
  if (isBuildPhase()) {
    return false;
  }

  return true;
}

function collectProductionSecretIssues(): MissingSecretError[] {
  if (!isProduction()) {
    return [];
  }

  const issues: MissingSecretError[] = [];

  if (!process.env.AUTH_SECRET) {
    issues.push({
      name: 'AUTH_SECRET',
      message: 'AUTH_SECRET is required in production to sign user tokens.'
    });
  }

  const senderKey = process.env.SENDER_CREDENTIALS_KEY ?? '';
  if (senderKey.length < 32) {
    issues.push({
      name: 'SENDER_CREDENTIALS_KEY',
      message: 'SENDER_CREDENTIALS_KEY must be at least 32 characters to encrypt SMTP credentials securely.'
    });
  }

  return issues;
}

export function assertProductionSecrets(): void {
  if (!shouldValidateSecrets()) {
    return;
  }

  const issues = collectProductionSecretIssues();
  if (issues.length === 0) {
    return;
  }

  const formatted = issues
    .map((issue) => `• ${issue.name}: ${issue.message}`)
    .join('\n');

  throw new Error(
    `Production startup blocked due to missing secrets:\n${formatted}\nRefer to the README for guidance on generating secure values.`
  );
}
