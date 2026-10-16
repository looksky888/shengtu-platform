import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeEmailSettingsForm,
  splitSettingsLines,
} from "../src/app/settings/settings-form-normalizers.ts";

test("email settings form normalizes address fields without changing password", () => {
  const normalized = normalizeEmailSettingsForm({
    enabled: true,
    host: " smtp.example.test ",
    port: 587,
    username: " mailer@example.test ",
    password: " secret value ",
    encryption: "starttls",
    from_email: " No-Reply@Example.Test ",
    from_name: " 生图 ",
    has_password: true,
  });

  assert.equal(normalized.host, "smtp.example.test");
  assert.equal(normalized.username, "mailer@example.test");
  assert.equal(normalized.from_email, "no-reply@example.test");
  assert.equal(normalized.from_name, "生图");
  assert.equal(normalized.password, " secret value ");
});

test("risk list parser accepts lines and commas while dropping blanks", () => {
  assert.deepEqual(splitSettingsLines(" yopmail.com\n\nmail.test, 203.0.113.0/24 "), [
    "yopmail.com",
    "mail.test",
    "203.0.113.0/24",
  ]);
});
