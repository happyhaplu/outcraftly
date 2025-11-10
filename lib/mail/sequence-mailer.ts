import nodemailer from 'nodemailer';

import { renderTemplate, type ContactRecord } from '@/lib/sequence/sequence-engine';

export type SequencePersonalisationInput = {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
  jobTitle?: string | null;
  phone?: string | null;
  tags?: string[] | null;
  customFieldsById?: Record<string, string | null | undefined> | null;
  customFieldsByKey?: Record<string, string | null | undefined> | null;
  customFieldsByName?: Record<string, string | null | undefined> | null;
};

export type RenderedSequenceContent = {
  subject: string;
  text: string;
  html: string;
};

export function renderSequenceContent(
  subject: string,
  body: string,
  contact: SequencePersonalisationInput,
  options: { emptyPlaceholder?: string } = {}
): RenderedSequenceContent {
  const emptyPlaceholder = options.emptyPlaceholder ?? '';

  const customFields: Record<string, string> = {};
  const customNames: Record<string, string> = {};

  const addEntry = (target: Record<string, string>, key: string, value: string | null | undefined) => {
    if (value == null) {
      return;
    }
    target[key] = String(value);
  };

  const byId = contact.customFieldsById ?? null;
  if (byId) {
    for (const [key, value] of Object.entries(byId)) {
      addEntry(customFields, key, value);
    }
  }

  const byKey = contact.customFieldsByKey ?? null;
  if (byKey) {
    for (const [key, value] of Object.entries(byKey)) {
      addEntry(customFields, key, value);
    }
  }

  const byName = contact.customFieldsByName ?? null;
  if (byName) {
    for (const [key, value] of Object.entries(byName)) {
      addEntry(customNames, key, value);
    }
  }

  const record: ContactRecord = {
    email: contact.email,
    firstName: contact.firstName ?? undefined,
    lastName: contact.lastName ?? undefined,
    company: contact.company ?? undefined,
    jobTitle: contact.jobTitle ?? undefined,
    phone: contact.phone ?? undefined,
    customFields: Object.keys(customFields).length > 0 ? customFields : undefined,
    customFieldsByName: Object.keys(customNames).length > 0 ? customNames : undefined,
    tags: contact.tags ?? undefined
  };

  const renderedSubject = renderTemplate(subject ?? '', record, { emptyPlaceholder });
  const renderedBody = renderTemplate(body ?? '', record, { emptyPlaceholder });

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
