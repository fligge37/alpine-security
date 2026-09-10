-- Einmal-Codes für die Handynummer-Verifizierung (ADR 0005).
CREATE TABLE otp_code (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_number text NOT NULL,
    code         text NOT NULL,
    expires_at   timestamptz NOT NULL,
    consumed_at  timestamptz,
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_otp_code_phone_number ON otp_code (phone_number);
