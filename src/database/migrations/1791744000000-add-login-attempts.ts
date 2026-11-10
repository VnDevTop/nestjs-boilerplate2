import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLoginAttempts1791744000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Failed login attempt tracking + account lockout state.
    await queryRunner.query(
      `CREATE TABLE "login_attempts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "deletedAt" TIMESTAMP WITH TIME ZONE,
        "identifier" character varying(320) NOT NULL,
        "failedCount" integer NOT NULL DEFAULT 0,
        "lockedUntil" TIMESTAMP WITH TIME ZONE,
        "lastFailedAt" TIMESTAMP WITH TIME ZONE,
        "lockoutCount" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_login_attempts" PRIMARY KEY ("id")
      )`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_login_attempts_identifier" ON "login_attempts" ("identifier")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "login_attempts"`);
  }
}
