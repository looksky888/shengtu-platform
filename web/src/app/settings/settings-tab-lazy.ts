import { lazy } from "react";

export const ConfigCard = lazy(() =>
  import("./components/config-card").then(({ ConfigCard: Component }) => ({
    default: Component,
  })),
);
export const EmailSettingsCard = lazy(() =>
  import("./components/email-settings-card").then(
    ({ EmailSettingsCard: Component }) => ({ default: Component }),
  ),
);
export const RegistrationRiskSettingsCard = lazy(() =>
  import("./components/registration-risk-settings-card").then(
    ({ RegistrationRiskSettingsCard: Component }) => ({ default: Component }),
  ),
);
export const RegistrationRiskBlocksCard = lazy(() =>
  import("./components/registration-risk-blocks-card").then(
    ({ RegistrationRiskBlocksCard: Component }) => ({ default: Component }),
  ),
);
export const UpstreamProxyRuntimeCard = lazy(() =>
  import("./components/upstream-proxy-runtime-card").then(
    ({ UpstreamProxyRuntimeCard: Component }) => ({ default: Component }),
  ),
);
export const RegisterClearanceCard = lazy(() =>
  import("./components/register-clearance-card").then(
    ({ RegisterClearanceCard: Component }) => ({ default: Component }),
  ),
);
export const ImageProviderCard = lazy(() =>
  import("./components/image-provider-card").then(
    ({ ImageProviderCard: Component }) => ({ default: Component }),
  ),
);
export const ImageAccountPoolRoutingCard = lazy(() =>
  import("./components/image-account-pool-routing-card").then(
    ({ ImageAccountPoolRoutingCard: Component }) => ({ default: Component }),
  ),
);
export const ImageTaskStatsCard = lazy(() =>
  import("./components/image-task-stats-card").then(
    ({ ImageTaskStatsCard: Component }) => ({ default: Component }),
  ),
);
export const MediaStorageCard = lazy(() =>
  import("./components/media-storage-card").then(
    ({ MediaStorageCard: Component }) => ({ default: Component }),
  ),
);
export const CPAPoolsCard = lazy(() =>
  import("./components/cpa-pools-card").then(({ CPAPoolsCard: Component }) => ({
    default: Component,
  })),
);
export const CPAPoolDialog = lazy(() =>
  import("./components/cpa-pool-dialog").then(
    ({ CPAPoolDialog: Component }) => ({ default: Component }),
  ),
);
export const ImportBrowserDialog = lazy(() =>
  import("./components/import-browser-dialog").then(
    ({ ImportBrowserDialog: Component }) => ({ default: Component }),
  ),
);
export const AnnouncementsCard = lazy(() =>
  import("./components/announcements-card").then(
    ({ AnnouncementsCard: Component }) => ({ default: Component }),
  ),
);
export const BackupSettingsCard = lazy(() =>
  import("./components/backup-settings-card").then(
    ({ BackupSettingsCard: Component }) => ({ default: Component }),
  ),
);
export const LogGovernanceCard = lazy(() =>
  import("./components/log-governance-card").then(
    ({ LogGovernanceCard: Component }) => ({ default: Component }),
  ),
);
export const SystemUpdateCard = lazy(() =>
  import("./components/system-update-card").then(
    ({ SystemUpdateCard: Component }) => ({ default: Component }),
  ),
);
