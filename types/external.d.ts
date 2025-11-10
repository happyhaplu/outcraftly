declare module 'mailparser' {
  export interface AddressObject {
    value?: Array<{ address?: string | null } >;
  }

  export interface ParsedMail {
    messageId?: string | null;
    subject?: string | null;
    date?: Date | null;
    from?: AddressObject | null;
    headers: Map<string, string | string[] | undefined> & {
      get(name: string): string | string[] | undefined;
    };
  }

  export function simpleParser(source: string | Buffer): Promise<ParsedMail>;
}

declare module 'poplib' {
  export default class POP3Client {
    constructor(port: number, host: string, options?: Record<string, unknown>);
    on(event: string, listener: (...args: any[]) => void): this;
    once(event: string, listener: (...args: any[]) => void): this;
    removeAllListeners(event?: string): void;
    removeListener(event: string, listener: (...args: any[]) => void): this;
    login(username: string, password: string): void;
    list(): void;
    top(msgnumber: number, lines: number): void;
    quit(): void;
  }
}
