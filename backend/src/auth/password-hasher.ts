import { Injectable, type OnModuleInit } from '@nestjs/common';
import { compare, hash } from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { AppConfigService } from '../config/app-config.service';

/** bcrypt wrapper that equalizes timing between known and unknown accounts. */
@Injectable()
export class PasswordHasher implements OnModuleInit {
  private dummyHash = '';

  constructor(private readonly config: AppConfigService) {}

  // The dummy hash must use the same cost as real hashes, otherwise the
  // unknown-user path is measurably faster and reveals which emails exist.
  async onModuleInit(): Promise<void> {
    this.dummyHash = await hash(
      randomBytes(32).toString('base64url'),
      this.config.get('bcryptCost'),
    );
  }

  hash(password: string): Promise<string> {
    return hash(password, this.config.get('bcryptCost'));
  }

  /**
   * Compares against `passwordHash`, or against the dummy hash when it is null
   * (unknown or locked account), so every login path pays one bcrypt compare.
   * Always false for a null hash.
   */
  async verify(
    password: string,
    passwordHash: string | null,
  ): Promise<boolean> {
    const matches = await compare(password, passwordHash ?? this.dummyHash);
    return passwordHash !== null && matches;
  }
}
