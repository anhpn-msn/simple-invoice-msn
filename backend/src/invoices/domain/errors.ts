/**
 * Raised by pure domain code when an input violates a business rule.
 * The service layer maps it to an HTTP 400 using `messages`.
 */
export class DomainValidationError extends Error {
  readonly messages: string[];

  constructor(messages: string | string[]) {
    const list = Array.isArray(messages) ? messages : [messages];
    super(list.join('; '));
    this.name = 'DomainValidationError';
    this.messages = list;
  }
}
