/* Admin "pause payments" switch. Run once against an EXISTING database (fresh installs
   use mssql-schema.sql). Safe to re-run. Run db/2026-09-membership-settings.sql first. */

IF COL_LENGTH('dbo.MembershipSettings', 'paymentsPaused') IS NULL
    ALTER TABLE dbo.MembershipSettings ADD paymentsPaused BIT NOT NULL
        CONSTRAINT DF_MembershipSettings_paymentsPaused DEFAULT 0;
