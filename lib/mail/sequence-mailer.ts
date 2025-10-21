import nodemailer from 'nodemailer';

import { SUPPORTED_PERSONALISATION_TOKENS, type PersonalisationToken } from '@/lib/validation/sequence';

export type PersonalisationContext = Partial<Record<PersonalisationToken, string | null | undefined>> & {
  email: string;
};

export type RenderedSequenceContent = {
  subject: string;
  text: string;
  html: string;
};

export function renderSequenceContent(subject: string, body: string, context: PersonalisationContext): RenderedSequenceContent {
  const replacements: Record<string, string> = {
    email: context.email ?? '',
    firstName: context.firstName ?? '',
    lastName: context.lastName ?? '',
    company: context.company ?? '',
    title: context.title ?? '',
    phone: context.phone ?? ''
  };

  const render = (input: string) =>
    input.replace(/\{\{\s*([a-zA-Z0-9]+)\s*\}\}/g, (match, token) => {
      const key = String(token);
      if (SUPPORTED_PERSONALISATION_TOKENS.includes(key as PersonalisationToken)) {
        const value = replacements[key];
        return value && value.length > 0 ? value : '';
      }
      return match;
    });

  const renderedSubject = render(subject ?? '');
  const renderedBody = render(body ?? '');

  return {
    subject: renderedSubject,
    text: renderedBody,
    html: renderedBody.replace(/\n/g, '<br />')
  };
}

export type DispatchSequenceEmailOptions = {
  sender: {
    name: string;
    email: string;
    host: string;
    port: number;
    username: string;
    password: string;
  };
  recipient: string;
  subject: string;
  html: string;
  text: string;
  isTest?: boolean;
  shouldVerify?: boolean;
};

export async function dispatchSequenceEmail({
  sender,
  recipient,
  subject,
  html,
  text,
  isTest = false,
  shouldVerify = false
}: DispatchSequenceEmailOptions): Promise<{
  messageId: string | null;
  accepted: string[];
  rejected: string[];
  response: string | null;
}> {
  const transporter = nodemailer.createTransport({
    host: sender.host,
    port: sender.port,
    secure: sender.port === 465,
    auth: {
      user: sender.username,
      pass: sender.password
    }
  });

  try {
    if (shouldVerify) {
      await transporter.verify();
    }

    const info = await transporter.sendMail({
      from: `${sender.name} <${sender.email}>`,
      to: recipient,
      subject,
      html,
      text,
      headers: isTest ? { 'X-Outcraftly-Test': 'true' } : undefined
    });

    const accepted = Array.isArray(info?.accepted)
      ? info.accepted.map((address) => address.toString())
      : [];
    const rejected = Array.isArray(info?.rejected)
      ? info.rejected.map((address) => address.toString())
      : [];
    const response = typeof info?.response === 'string' ? info.response : null;

    if (accepted.length === 0) {
      const deliveryError = new Error('SMTP server did not accept any recipients');
      (deliveryError as any).code = 'ENOTACCEPTED';
      (deliveryError as any).accepted = accepted;
      (deliveryError as any).rejected = rejected;
      (deliveryError as any).response = response;
      throw deliveryError;
    }

    return {
      messageId: info?.messageId ?? null,
      accepted,
      rejected,
      response
    };
  } finally {
    if (typeof transporter.close === 'function') {
      transporter.close();
    }
  }
}
