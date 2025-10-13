import nodemailer from 'nodemailer';

export type VerifySmtpConnectionInput = {
  host: string;
  port: number;
  username: string;
  password: string;
};

export async function verifySmtpConnection({
  host,
  port,
  username,
  password
}: VerifySmtpConnectionInput) {
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: {
      user: username,
      pass: password
    }
  });

  try {
    await transporter.verify();
  } finally {
    if (typeof transporter.close === 'function') {
      transporter.close();
    }
  }
}
