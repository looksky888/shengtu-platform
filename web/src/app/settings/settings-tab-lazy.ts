import { lazyWithRetry } from "@/lib/lazy-with-retry";

export const ConfigCard = lazyWithRetry(() =>
  import("./components/config-card").then(({ ConfigCard: Component }) => ({
    default: Component,
  }))
);
export const LoginVisualCard = lazyWithRetry(() =>
  import("./components/login-visual-card").then(
    ({ LoginVisualCard: Component }) => ({
      default: Component,
    })
  )
);
export const EmailSettingsCard = lazyWithRetry(() =>
  import("./components/email-settings-card").then(
    ({ EmailSettingsCard: Component }) => ({ default: Component })
  )
);
export const RegistrationRiskSettingsCard = lazyWithRetry(() =>
  import("./components/registration-risk-settings-card").then(
    ({ RegistrationRiskSettingsCard: Component }) => ({ default: Component })
  )
);
export const RegistrationRiskBlocksCard = lazyWithRetry(() =>
  import("./components/registration-risk-blocks-card").then(
    ({ RegistrationRiskBlocksCard: Component }) => ({ default: Component })
  )
);
export const UpstreamProxyRuntimeCard = lazyWithRetry(() =>
  import("./components/upstream-proxy-runtime-card").then(
    ({ UpstreamProxyRuntimeCard: Component }) => ({ default: Component })
  )
);
export const RegisterClearanceCard = lazyWithRetry(() =>
  import("./components/register-clearance-card").then(
    ({ RegisterClearanceCard: Component }) => ({ default: Component })
  )
);
export const ImageProviderCard = lazyWithRetry(() =>
  import("./components/image-provider-card").then(
    ({ ImageProviderCard: Component }) => ({ default: Component })
  )
);
export const ImageAccountPoolRoutingCard = lazyWithRetry(() =>
  import("./components/image-account-pool-routing-card").then(
    ({ ImageAccountPoolRoutingCard: Component }) => ({ default: Component })
  )
);
export const ImageTaskStatsCard = lazyWithRetry(() =>
  import("./components/image-task-stats-card").then(
    ({ ImageTaskStatsCard: Component }) => ({ default: Component })
  )
);
export const MediaStorageCard = lazyWithRetry(() =>
  import("./components/media-storage-card").then(
    ({ MediaStorageCard: Component }) => ({ default: Component })
  )
);
export const CPAPoolsCard = lazyWithRetry(() =>
  import("./components/cpa-pools-card").then(({ CPAPoolsCard: Component }) => ({
    default: Component,
  }))
);
export const CPAPoolDialog = lazyWithRetry(() =>
  import("./components/cpa-pool-dialog").then(
    ({ CPAPoolDialog: Component }) => ({ default: Component })
  )
);
export const ImportBrowserDialog = lazyWithRetry(() =>
  import("./components/import-browser-dialog").then(
    ({ ImportBrowserDialog: Component }) => ({ default: Component })
  )
);
export const AnnouncementsCard = lazyWithRetry(() =>
  import("./components/announcements-card").then(
    ({ AnnouncementsCard: Component }) => ({ default: Component })
  )
);
export const BackupSettingsCard = lazyWithRetry(() =>
  import("./components/backup-settings-card").then(
    ({ BackupSettingsCard: Component }) => ({ default: Component })
  )
);
export const LogGovernanceCard = lazyWithRetry(() =>
  import("./components/log-governance-card").then(
    ({ LogGovernanceCard: Component }) => ({ default: Component })
  )
);
export const SystemUpdateCard = lazyWithRetry(() =>
  import("./components/system-update-card").then(
    ({ SystemUpdateCard: Component }) => ({ default: Component })
  )
);
