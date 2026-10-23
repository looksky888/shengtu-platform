import { useEffect, useState } from "react";
import { CreditCard, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { ChannelEditorDialog } from "@/app/payment-admin/payment-channel-dialogs";
import { PaymentChannelCard } from "@/app/payment-admin/payment-channel-card";
import { CredentialsDialog } from "@/app/payment-admin/payment-credentials-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PaymentSectionState } from "@/app/payment-admin/payment-section-state";
import {
  createPaymentChannel,
  emptyPaymentChannelInput,
  emptyPaymentCredentialsInput,
  fetchPaymentChannels,
  rotatePaymentCredentials,
  updatePaymentChannel,
  type PaymentChannel,
  type PaymentChannelInput,
  type PaymentCredentialsInput,
} from "@/lib/payment-admin-api";

export function PaymentChannelsSection() {
  const [channels, setChannels] = useState<PaymentChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [rotateOpen, setRotateOpen] = useState(false);
  const [selectedID, setSelectedID] = useState("");
  const [channel, setChannel] = useState<PaymentChannelInput>(
    emptyPaymentChannelInput(),
  );
  const [credentials, setCredentials] = useState<PaymentCredentialsInput>(
    emptyPaymentCredentialsInput(),
  );

  const load = async () => {
    setLoading(true);
    setLoadError("");
    try {
      setChannels((await fetchPaymentChannels()).items);
    } catch (error) {
      const message = error instanceof Error ? error.message : "加载支付渠道失败";
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const openCreate = () => {
    setSelectedID("");
    setChannel(emptyPaymentChannelInput());
    setCredentials(emptyPaymentCredentialsInput());
    setEditorOpen(true);
  };

  const selectChannel = (item: PaymentChannel) => {
    setSelectedID(item.id);
    setChannel({
      code: item.code,
      name: item.name,
      provider: item.provider,
      payment_method: item.payment_method,
      enabled: item.enabled,
      is_default: item.is_default,
      notify_base_url: item.notify_base_url,
      order_expire_minutes: item.order_expire_minutes,
    });
    setCredentials(emptyPaymentCredentialsInput());
  };

  const openEdit = (item: PaymentChannel) => {
    selectChannel(item);
    setEditorOpen(true);
  };

  const openRotate = (item: PaymentChannel) => {
    selectChannel(item);
    setRotateOpen(true);
  };

  const openRotateFromEditor = () => {
    setEditorOpen(false);
    setRotateOpen(true);
  };

  const saveChannel = async () => {
    if (
      !channel.code.trim() ||
      !channel.name.trim() ||
      !channel.notify_base_url.trim()
    ) {
      toast.error("请填写渠道 code、名称和公网 HTTPS 回调地址");
      return;
    }
    setSaving(true);
    try {
      if (selectedID) {
        await updatePaymentChannel(selectedID, channel);
        toast.success("支付渠道配置已保存");
      } else {
        await createPaymentChannel(channel, credentials);
        toast.success("支付渠道已创建");
      }
      setEditorOpen(false);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存支付渠道失败");
    } finally {
      setSaving(false);
    }
  };

  const rotate = async () => {
    if (!selectedID) return;
    setSaving(true);
    try {
      await rotatePaymentCredentials(selectedID, credentials);
      toast.success("支付凭据已轮换");
      setRotateOpen(false);
      setCredentials(emptyPaymentCredentialsInput());
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "轮换支付凭据失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Card className="overflow-hidden rounded-xl">
        <CardHeader className="border-b border-border/70 bg-muted/20">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="size-5 text-primary" />
              支付渠道
            </CardTitle>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => void load()} disabled={loading} className="h-9 rounded-lg">
                <RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} />刷新
              </Button>
              <Button type="button" onClick={openCreate} className="h-9 rounded-lg">
              <Plus className="size-4" />
              新增渠道
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-4 sm:p-5 sm:pt-5 md:p-6 md:pt-6">
          {loading ? (
            <PaymentSectionState mode="loading" title="正在加载渠道" />
          ) : loadError ? (
            <PaymentSectionState mode="error" title="支付渠道加载失败" detail={loadError} onRetry={() => void load()} />
          ) : channels.length === 0 ? (
            <PaymentSectionState mode="empty" icon={CreditCard} title="暂无支付渠道" detail="添加微信支付或支付宝渠道后即可启用在线充值。" action={<Button type="button" variant="outline" onClick={openCreate}>创建第一个渠道</Button>} />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {channels.map((item) => (
                <PaymentChannelCard
                  key={item.id}
                  item={item}
                  onEdit={() => openEdit(item)}
                  onRotate={() => openRotate(item)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <ChannelEditorDialog
        open={editorOpen}
        editing={Boolean(selectedID)}
        channel={channel}
        credentials={credentials}
        saving={saving}
        onOpenChange={(open) => {
          if (!open && !saving) setEditorOpen(false);
        }}
        onChannelChange={(key, value) =>
          setChannel((current) => ({ ...current, [key]: value }))
        }
        onCredentialsChange={(key, value) =>
          setCredentials((current) => ({ ...current, [key]: value }))
        }
        onSave={() => void saveChannel()}
        onRotate={openRotateFromEditor}
      />
      <CredentialsDialog
        open={rotateOpen}
        saving={saving}
        provider={channel.provider}
        value={credentials}
        onOpenChange={(open) => {
          if (!open && !saving) setRotateOpen(false);
        }}
        onChange={(key, value) =>
          setCredentials((current) => ({ ...current, [key]: value }))
        }
        onSubmit={() => void rotate()}
      />
    </>
  );
}
