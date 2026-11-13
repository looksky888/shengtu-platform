import { useCallback, useState } from "react";

import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { PaymentCredentialsInput } from "@/lib/payment-admin-api";

const CONFIGURED_SECRET_PLACEHOLDER = "已配置，留空保持不变";

export function PaymentCredentialsForm({
  provider,
  value,
  configured,
  onChange,
}: {
  provider: string;
  value: PaymentCredentialsInput;
  configured?: boolean;
  onChange: (key: keyof PaymentCredentialsInput, value: string) => void;
}) {
  const [detectedConfigured, setDetectedConfigured] = useState(false);
  const groupRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    // In CredentialsDialog (existing channel rotation), PaymentCredentialsForm is rendered
    // directly inside DialogContent rather than a create-mode <section>.
    setDetectedConfigured(!node.closest("section"));
  }, []);

  const isSecretConfigured = configured ?? detectedConfigured;
  const secretPlaceholder = (createHint: string) =>
    isSecretConfigured ? CONFIGURED_SECRET_PLACEHOLDER : createHint;

  if (provider === "alipay") {
    return (
      <FieldGroup ref={groupRef} className="md:grid md:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="alipay-app-id">支付宝 AppID</FieldLabel>
          <Input
            id="alipay-app-id"
            value={value.app_id}
            autoComplete="off"
            onChange={(event) => onChange("app_id", event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="alipay-seller-id">
            Seller ID / PID（可选）
          </FieldLabel>
          <Input
            id="alipay-seller-id"
            value={value.alipay_seller_id}
            autoComplete="off"
            onChange={(event) =>
              onChange("alipay_seller_id", event.target.value)
            }
          />
        </Field>
        <Field className="md:col-span-2">
          <FieldLabel htmlFor="alipay-gateway">支付宝网关</FieldLabel>
          <Input
            id="alipay-gateway"
            value={value.alipay_gateway}
            onChange={(event) => onChange("alipay_gateway", event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="alipay-private-key">应用私钥</FieldLabel>
          <Textarea
            id="alipay-private-key"
            className="min-h-28 font-mono text-xs"
            value={value.alipay_private_key_pem}
            placeholder={secretPlaceholder("-----BEGIN PRIVATE KEY-----")}
            autoComplete="off"
            onChange={(event) =>
              onChange("alipay_private_key_pem", event.target.value)
            }
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="alipay-public-key">支付宝公钥</FieldLabel>
          <Textarea
            id="alipay-public-key"
            className="min-h-28 font-mono text-xs"
            value={value.alipay_public_key_pem}
            placeholder={secretPlaceholder("-----BEGIN PUBLIC KEY-----")}
            autoComplete="off"
            onChange={(event) =>
              onChange("alipay_public_key_pem", event.target.value)
            }
          />
        </Field>
      </FieldGroup>
    );
  }
  return (
    <FieldGroup ref={groupRef} className="md:grid md:grid-cols-2">
      <Field>
        <FieldLabel htmlFor="wechat-app-id">AppID</FieldLabel>
        <Input
          id="wechat-app-id"
          value={value.app_id}
          autoComplete="off"
          onChange={(event) => onChange("app_id", event.target.value)}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="wechat-merchant-id">商户号</FieldLabel>
        <Input
          id="wechat-merchant-id"
          value={value.merchant_id}
          autoComplete="off"
          onChange={(event) => onChange("merchant_id", event.target.value)}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="wechat-cert-serial">证书序列号</FieldLabel>
        <Input
          id="wechat-cert-serial"
          value={value.merchant_cert_serial}
          autoComplete="off"
          onChange={(event) =>
            onChange("merchant_cert_serial", event.target.value)
          }
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="wechat-public-id">微信支付公钥 ID</FieldLabel>
        <Input
          id="wechat-public-id"
          value={value.wechatpay_public_key_id}
          autoComplete="off"
          onChange={(event) =>
            onChange("wechatpay_public_key_id", event.target.value)
          }
        />
      </Field>
      <Field className="md:col-span-2">
        <FieldLabel htmlFor="wechat-api-key">API v3 Key</FieldLabel>
        <Input
          id="wechat-api-key"
          type="password"
          value={value.api_v3_key}
          placeholder={secretPlaceholder("32 位微信支付 API v3 密钥")}
          autoComplete="new-password"
          onChange={(event) => onChange("api_v3_key", event.target.value)}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="wechat-private-key">商户私钥 PEM</FieldLabel>
        <Textarea
          id="wechat-private-key"
          className="min-h-28 font-mono text-xs"
          value={value.merchant_private_key_pem}
          placeholder={secretPlaceholder("-----BEGIN PRIVATE KEY-----")}
          autoComplete="off"
          onChange={(event) =>
            onChange("merchant_private_key_pem", event.target.value)
          }
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="wechat-platform-key">
          微信支付平台公钥 PEM
        </FieldLabel>
        <Textarea
          id="wechat-platform-key"
          className="min-h-28 font-mono text-xs"
          value={value.wechatpay_public_key_pem}
          placeholder={secretPlaceholder("-----BEGIN PUBLIC KEY-----")}
          autoComplete="off"
          onChange={(event) =>
            onChange("wechatpay_public_key_pem", event.target.value)
          }
        />
      </Field>
    </FieldGroup>
  );
}
